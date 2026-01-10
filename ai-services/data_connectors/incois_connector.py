"""
INCOIS Data Connector

Fetches real-time oceanographic data from Indian National Centre for Ocean 
Information Services (INCOIS) via their ERDDAP server.

Data sources:
- OMNI buoys: SST, salinity, currents, meteorological data
- Argo floats: Temperature/salinity profiles
- Coastal stations: Wave height, tidal data

Reference: https://incois.gov.in/portal/osf/osf.jsp
"""

import os
import asyncio
import aiohttp
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('incois_connector')


@dataclass
class OceanographicReading:
    """Standardized oceanographic data point."""
    parameter: str
    value: float
    unit: str
    latitude: float
    longitude: float
    depth: float
    timestamp: str
    source: str
    quality: str = "good"
    metadata: Dict[str, Any] = None
    
    def to_dict(self) -> Dict:
        return asdict(self)


class INCOISConnector:
    """
    Connector for INCOIS oceanographic data.
    
    Uses INCOIS ERDDAP server for standardized data access.
    Falls back to parsing their geoportal data if ERDDAP is unavailable.
    """
    
    # INCOIS ERDDAP endpoints
    ERDDAP_BASE = "https://erddap.incois.gov.in/erddap"
    
    # Known INCOIS datasets
    DATASETS = {
        "sst": "INCOIS_SST_LATEST",
        "omni_buoy": "INCOIS_OMNI_BUOY",
        "wave": "INCOIS_WAVE_DATA",
        "argo": "INCOIS_ARGO_PROFILES"
    }
    
    # Indian Ocean bounding box
    INDIAN_OCEAN_BBOX = {
        "min_lat": -30.0,
        "max_lat": 30.0,
        "min_lon": 40.0,
        "max_lon": 120.0
    }
    
    def __init__(self, timeout: int = 30):
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession(timeout=self.timeout)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def get_latest_sst(
        self,
        min_lat: float = None,
        max_lat: float = None,
        min_lon: float = None,
        max_lon: float = None
    ) -> List[OceanographicReading]:
        """
        Fetch latest Sea Surface Temperature data.
        
        Returns SST grid points for the specified region.
        """
        min_lat = min_lat or self.INDIAN_OCEAN_BBOX["min_lat"]
        max_lat = max_lat or self.INDIAN_OCEAN_BBOX["max_lat"]
        min_lon = min_lon or self.INDIAN_OCEAN_BBOX["min_lon"]
        max_lon = max_lon or self.INDIAN_OCEAN_BBOX["max_lon"]
        
        readings = []
        
        try:
            # Try ERDDAP first
            url = f"{self.ERDDAP_BASE}/griddap/sst_analysis.json"
            params = {
                "latitude[]": f"{min_lat}:{max_lat}",
                "longitude[]": f"{min_lon}:{max_lon}",
                "time[]": "last"
            }
            
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    readings = self._parse_erddap_response(data, "temperature", "°C")
                else:
                    raise ConnectionError(f"INCOIS ERDDAP returned HTTP {response.status}")
                    
        except Exception as e:
            logger.error(f"ERDDAP request failed: {e}")
            raise ConnectionError(f"Failed to fetch SST from INCOIS: {e}")
        
        return readings
    
    async def get_buoy_data(
        self,
        buoy_id: Optional[str] = None
    ) -> List[OceanographicReading]:
        """
        Fetch data from INCOIS OMNI buoys.
        
        OMNI buoys provide:
        - Surface: SST, salinity, wind, pressure, humidity
        - Subsurface: Temperature/salinity at multiple depths
        - Currents: Speed and direction
        """
        readings = []
        
        try:
            # INCOIS buoy data endpoint
            url = f"{self.ERDDAP_BASE}/tabledap/omni_buoy_realtime.json"
            
            params = {
                "time>=": (datetime.utcnow() - timedelta(hours=24)).isoformat() + "Z"
            }
            if buoy_id:
                params["buoy_id="] = buoy_id
            
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    readings = self._parse_buoy_data(data)
                else:
                    raise ConnectionError(f"INCOIS Buoy API returned HTTP {response.status}")
                    
        except Exception as e:
            logger.error(f"Buoy request failed: {e}")
            raise ConnectionError(f"Failed to fetch buoy data from INCOIS: {e}")
        
        return readings
    
    async def get_argo_profiles(
        self,
        min_lat: float = 0.0,
        max_lat: float = 25.0,
        min_lon: float = 60.0,
        max_lon: float = 95.0,
        days: int = 7
    ) -> List[OceanographicReading]:
        """
        Fetch Argo float profiles from Indian Ocean.
        
        Argo floats provide temperature and salinity profiles
        to depths of 2000m.
        """
        readings = []
        
        try:
            url = f"{self.ERDDAP_BASE}/tabledap/argo_india.json"
            
            start_time = (datetime.utcnow() - timedelta(days=days)).isoformat() + "Z"
            
            params = {
                "latitude>=": min_lat,
                "latitude<=": max_lat,
                "longitude>=": min_lon,
                "longitude<=": max_lon,
                "time>=": start_time
            }
            
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    readings = self._parse_argo_data(data)
                else:
                    raise ConnectionError(f"INCOIS Argo API returned HTTP {response.status}")
                    
        except Exception as e:
            logger.error(f"Argo request failed: {e}")
            raise ConnectionError(f"Failed to fetch Argo data from INCOIS: {e}")
        
        return readings
    
    def _parse_erddap_response(
        self, 
        data: Dict, 
        parameter: str, 
        unit: str
    ) -> List[OceanographicReading]:
        """Parse standard ERDDAP JSON response."""
        readings = []
        
        try:
            table = data.get("table", {})
            column_names = table.get("columnNames", [])
            rows = table.get("rows", [])
            
            lat_idx = column_names.index("latitude") if "latitude" in column_names else -1
            lon_idx = column_names.index("longitude") if "longitude" in column_names else -1
            time_idx = column_names.index("time") if "time" in column_names else -1
            
            # Find value column
            value_idx = -1
            for i, name in enumerate(column_names):
                if name.lower() in ["sst", "temperature", "analysed_sst", "sea_surface_temperature"]:
                    value_idx = i
                    break
            
            for row in rows[:100]:  # Limit to 100 points
                if lat_idx >= 0 and lon_idx >= 0 and value_idx >= 0:
                    value = row[value_idx]
                    if value is not None:
                        readings.append(OceanographicReading(
                            parameter=parameter,
                            value=float(value),
                            unit=unit,
                            latitude=float(row[lat_idx]),
                            longitude=float(row[lon_idx]),
                            depth=0.0,
                            timestamp=row[time_idx] if time_idx >= 0 else datetime.utcnow().isoformat(),
                            source="INCOIS_ERDDAP",
                            quality="good"
                        ))
                        
        except Exception as e:
            logger.error(f"Failed to parse ERDDAP response: {e}")
        
        return readings
    
    def _parse_buoy_data(self, data: Dict) -> List[OceanographicReading]:
        """Parse OMNI buoy data."""
        readings = []
        
        try:
            table = data.get("table", {})
            column_names = table.get("columnNames", [])
            rows = table.get("rows", [])
            
            for row in rows[:50]:
                row_dict = dict(zip(column_names, row))
                
                # Extract SST
                if "sea_surface_temperature" in row_dict and row_dict["sea_surface_temperature"]:
                    readings.append(OceanographicReading(
                        parameter="temperature",
                        value=float(row_dict["sea_surface_temperature"]),
                        unit="°C",
                        latitude=float(row_dict.get("latitude", 0)),
                        longitude=float(row_dict.get("longitude", 0)),
                        depth=0.0,
                        timestamp=row_dict.get("time", datetime.utcnow().isoformat()),
                        source="INCOIS_OMNI_BUOY",
                        metadata={"buoy_id": row_dict.get("buoy_id")}
                    ))
                
                # Extract salinity
                if "salinity" in row_dict and row_dict["salinity"]:
                    readings.append(OceanographicReading(
                        parameter="salinity",
                        value=float(row_dict["salinity"]),
                        unit="PSU",
                        latitude=float(row_dict.get("latitude", 0)),
                        longitude=float(row_dict.get("longitude", 0)),
                        depth=0.0,
                        timestamp=row_dict.get("time", datetime.utcnow().isoformat()),
                        source="INCOIS_OMNI_BUOY"
                    ))
                    
        except Exception as e:
            logger.error(f"Failed to parse buoy data: {e}")
        
        return readings
    
    def _parse_argo_data(self, data: Dict) -> List[OceanographicReading]:
        """Parse Argo float profiles."""
        readings = []
        
        try:
            table = data.get("table", {})
            column_names = table.get("columnNames", [])
            rows = table.get("rows", [])
            
            for row in rows[:100]:
                row_dict = dict(zip(column_names, row))
                
                if "temperature" in row_dict and row_dict["temperature"]:
                    readings.append(OceanographicReading(
                        parameter="temperature",
                        value=float(row_dict["temperature"]),
                        unit="°C",
                        latitude=float(row_dict.get("latitude", 0)),
                        longitude=float(row_dict.get("longitude", 0)),
                        depth=float(row_dict.get("pressure", 0)),  # Pressure ≈ depth in m
                        timestamp=row_dict.get("time", datetime.utcnow().isoformat()),
                        source="INCOIS_ARGO",
                        metadata={"float_id": row_dict.get("platform_number")}
                    ))
                    
        except Exception as e:
            logger.error(f"Failed to parse Argo data: {e}")
        
        return readings
    
    async def _get_fallback_sst(self) -> List[OceanographicReading]:
        """
        Fallback: Generate representative Indian Ocean SST data.
        Used when ERDDAP is unavailable.
        """
        import random
        
        readings = []
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Representative stations in Indian Ocean
        stations = [
            {"name": "Arabian Sea", "lat": 15.0, "lon": 68.0, "sst_range": (27, 30)},
            {"name": "Bay of Bengal", "lat": 14.0, "lon": 88.0, "sst_range": (28, 31)},
            {"name": "Lakshadweep Sea", "lat": 10.0, "lon": 73.0, "sst_range": (28, 30)},
            {"name": "Andaman Sea", "lat": 12.0, "lon": 93.0, "sst_range": (28, 30)},
            {"name": "Equatorial IO", "lat": 0.0, "lon": 75.0, "sst_range": (27, 29)},
        ]
        
        for station in stations:
            sst = random.uniform(*station["sst_range"])
            readings.append(OceanographicReading(
                parameter="temperature",
                value=round(sst, 2),
                unit="°C",
                latitude=station["lat"],
                longitude=station["lon"],
                depth=0.0,
                timestamp=timestamp,
                source="INCOIS_FALLBACK",
                quality="estimated",
                metadata={"station": station["name"]}
            ))
        
        logger.info(f"Generated {len(readings)} fallback SST readings")
        return readings
    
    async def _get_fallback_buoy_data(self) -> List[OceanographicReading]:
        """Fallback buoy data for testing."""
        import random
        
        readings = []
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Known INCOIS buoy approximate locations
        buoys = [
            {"id": "AD07", "lat": 15.0, "lon": 69.0, "name": "Arabian Sea OMNI"},
            {"id": "BD08", "lat": 18.0, "lon": 89.0, "name": "Bay of Bengal OMNI"},
            {"id": "BD14", "lat": 12.0, "lon": 90.0, "name": "Bay of Bengal South"},
        ]
        
        for buoy in buoys:
            # Temperature
            readings.append(OceanographicReading(
                parameter="temperature",
                value=round(27 + random.random() * 4, 2),
                unit="°C",
                latitude=buoy["lat"],
                longitude=buoy["lon"],
                depth=0.0,
                timestamp=timestamp,
                source="INCOIS_BUOY_FALLBACK",
                quality="estimated",
                metadata={"buoy_id": buoy["id"], "buoy_name": buoy["name"]}
            ))
            
            # Salinity
            readings.append(OceanographicReading(
                parameter="salinity",
                value=round(34 + random.random() * 2, 2),
                unit="PSU",
                latitude=buoy["lat"],
                longitude=buoy["lon"],
                depth=0.0,
                timestamp=timestamp,
                source="INCOIS_BUOY_FALLBACK",
                quality="estimated",
                metadata={"buoy_id": buoy["id"]}
            ))
        
        logger.info(f"Generated {len(readings)} fallback buoy readings")
        return readings
    
    async def _get_fallback_argo_data(self) -> List[OceanographicReading]:
        """Fallback Argo data."""
        import random
        
        readings = []
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Simulated Argo profile
        depths = [5, 10, 25, 50, 100, 200, 500, 1000]
        base_temp = 28
        
        for i, depth in enumerate(depths):
            # Temperature decreases with depth
            temp = base_temp - (depth * 0.015) + random.random() * 0.5
            readings.append(OceanographicReading(
                parameter="temperature",
                value=round(temp, 2),
                unit="°C",
                latitude=12.5,
                longitude=85.0,
                depth=float(depth),
                timestamp=timestamp,
                source="INCOIS_ARGO_FALLBACK",
                quality="estimated",
                metadata={"float_id": "ARGO_2901337", "profile": "temp_profile"}
            ))
        
        logger.info(f"Generated {len(readings)} fallback Argo readings")
        return readings


# Convenience function for quick access
async def fetch_incois_data(
    data_type: str = "sst",
    region: str = "indian_ocean"
) -> List[Dict]:
    """
    Quick function to fetch INCOIS data.
    
    Args:
        data_type: 'sst', 'buoy', 'argo'
        region: 'indian_ocean', 'arabian_sea', 'bay_of_bengal'
        
    Returns:
        List of oceanographic readings as dicts
    """
    async with INCOISConnector() as connector:
        if data_type == "sst":
            readings = await connector.get_latest_sst()
        elif data_type == "buoy":
            readings = await connector.get_buoy_data()
        elif data_type == "argo":
            readings = await connector.get_argo_profiles()
        else:
            readings = await connector.get_latest_sst()
        
        return [r.to_dict() for r in readings]


if __name__ == "__main__":
    # Test the connector
    async def test():
        async with INCOISConnector() as connector:
            print("Fetching SST...")
            sst = await connector.get_latest_sst()
            print(f"Got {len(sst)} SST readings")
            
            print("\nFetching buoy data...")
            buoy = await connector.get_buoy_data()
            print(f"Got {len(buoy)} buoy readings")
            
            print("\nFetching Argo profiles...")
            argo = await connector.get_argo_profiles()
            print(f"Got {len(argo)} Argo readings")
    
    asyncio.run(test())
