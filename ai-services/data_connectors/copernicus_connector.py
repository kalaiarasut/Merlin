"""
Copernicus Marine Data Connector

Fetches satellite-derived oceanographic data from Copernicus Marine Service.
Used as secondary data source to complement INCOIS buoy data.

Products used:
- SST: GLOBAL_ANALYSED_SST_L4_NRT_OBSERVATIONS
- Chlorophyll: GLOBAL_ANALYSIS_FORECAST_BIO
- Currents: GLOBAL_ANALYSIS_FORECAST_PHY

Requirements:
    pip install copernicusmarine

Setup:
    Set environment variables:
    - COPERNICUS_USERNAME
    - COPERNICUS_PASSWORD
    
Or run: copernicusmarine login

Reference: https://marine.copernicus.eu/
"""

import os
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict
import tempfile

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('copernicus_connector')


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


class CopernicusConnector:
    """
    Connector for Copernicus Marine Service data.
    
    Uses the official copernicusmarine Python package.
    Falls back to representative data if credentials not configured.
    """
    
    # Indian Ocean region bounding box
    INDIAN_OCEAN_BBOX = {
        "min_lat": -30.0,
        "max_lat": 30.0,
        "min_lon": 40.0,
        "max_lon": 120.0
    }
    
    # Key datasets for Indian Ocean
    DATASETS = {
        "sst": {
            "dataset_id": "cmems_mod_glo_phy_anfc_0.083deg_PT1H-m",
            "variable": "thetao",  # Sea water potential temperature
            "unit": "°C"
        },
        "sst_obs": {
            "dataset_id": "cmems_obs-sst_glo_phy-sst_nrt_diurnal-oi-0.25deg_P1D",
            "variable": "analysed_sst",
            "unit": "°C"
        },
        "salinity": {
            "dataset_id": "cmems_mod_glo_phy_anfc_0.083deg_PT1H-m",
            "variable": "so",  # Sea water salinity
            "unit": "PSU"
        },
        "chlorophyll": {
            "dataset_id": "cmems_mod_glo_bgc_anfc_0.25deg_P1D-m",
            "variable": "chl",  # Chlorophyll concentration
            "unit": "mg/m³"
        },
        "currents_u": {
            "dataset_id": "cmems_mod_glo_phy_anfc_0.083deg_PT1H-m",
            "variable": "uo",  # Eastward velocity
            "unit": "m/s"
        },
        "currents_v": {
            "dataset_id": "cmems_mod_glo_phy_anfc_0.083deg_PT1H-m",
            "variable": "vo",  # Northward velocity
            "unit": "m/s"
        }
    }
    
    def __init__(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None
    ):
        self.username = username or os.getenv("COPERNICUS_USERNAME")
        self.password = password or os.getenv("COPERNICUS_PASSWORD")
        self.has_credentials = bool(self.username and self.password)
        
        # Set environment variables for copernicusmarine package
        if self.has_credentials:
            os.environ["COPERNICUSMARINE_SERVICE_USERNAME"] = self.username
            os.environ["COPERNICUSMARINE_SERVICE_PASSWORD"] = self.password
        else:
            logger.warning(
                "Copernicus credentials not configured. "
                "Set COPERNICUS_USERNAME and COPERNICUS_PASSWORD environment variables."
            )
    
    def _require_credentials(self):
        """Raise error if credentials not configured."""
        if not self.has_credentials:
            raise ValueError(
                "Copernicus Marine credentials required. "
                "Set COPERNICUS_USERNAME and COPERNICUS_PASSWORD in .env file. "
                "Register free at: https://marine.copernicus.eu/"
            )
    
    async def get_sst(
        self,
        min_lat: float = None,
        max_lat: float = None,
        min_lon: float = None,
        max_lon: float = None,
        hours_ago: int = 24
    ) -> List[OceanographicReading]:
        """
        Fetch Sea Surface Temperature from Copernicus.
        
        Returns gridded SST data for the specified region.
        """
        self._require_credentials()
        
        min_lat = min_lat or 0.0  # Focus on northern Indian Ocean
        max_lat = max_lat or 25.0
        min_lon = min_lon or 60.0
        max_lon = max_lon or 100.0
        
        readings = []
        
        try:
            import copernicusmarine
            os.environ["COPERNICUSMARINE_SERVICE_USERNAME"] = self.username
            os.environ["COPERNICUSMARINE_SERVICE_PASSWORD"] = self.password
            
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(hours=hours_ago)
            
            # Download subset
            with tempfile.TemporaryDirectory() as tmpdir:
                output_path = os.path.join(tmpdir, "sst_data.nc")
                
                copernicusmarine.subset(
                    dataset_id=self.DATASETS["sst_obs"]["dataset_id"],
                    variables=[self.DATASETS["sst_obs"]["variable"]],
                    minimum_longitude=min_lon,
                    maximum_longitude=max_lon,
                    minimum_latitude=min_lat,
                    maximum_latitude=max_lat,
                    start_datetime=start_time.strftime("%Y-%m-%dT%H:%M:%S"),
                    end_datetime=end_time.strftime("%Y-%m-%dT%H:%M:%S"),
                    output_directory=tmpdir,
                    output_filename="sst_data.nc",
                    force_download=True
                )
                
                # Parse NetCDF
                readings = self._parse_netcdf(
                    output_path, 
                    "temperature", 
                    "°C",
                    "COPERNICUS_SST"
                )
                
        except Exception as e:
            logger.error(f"Copernicus API error: {e}")
            raise ValueError(f"Failed to fetch SST from Copernicus: {e}")
        
        return readings
    
    async def get_chlorophyll(
        self,
        min_lat: float = 0.0,
        max_lat: float = 25.0,
        min_lon: float = 60.0,
        max_lon: float = 100.0
    ) -> List[OceanographicReading]:
        """
        Fetch Chlorophyll-a concentration (indicator of phytoplankton).
        
        Important for:
        - Primary productivity assessment
        - Fish habitat mapping
        - Harmful algal bloom detection
        """
        self._require_credentials()
        
        # For now, chlorophyll requires full implementation
        # TODO: Implement chlorophyll data fetch from Copernicus
        raise NotImplementedError(
            "Chlorophyll data fetch not yet implemented. "
            "Use get_sst() for SST data."
        )
    
    async def get_currents(
        self,
        min_lat: float = 0.0,
        max_lat: float = 25.0,
        min_lon: float = 60.0,
        max_lon: float = 100.0
    ) -> List[OceanographicReading]:
        """
        Fetch ocean current velocity (u and v components).
        
        Important for:
        - Larval dispersal modeling
        - Navigation
        - Pollutant tracking
        """
        self._require_credentials()
        
        # For now, currents require full implementation
        # TODO: Implement currents data fetch from Copernicus
        raise NotImplementedError(
            "Currents data fetch not yet implemented. "
            "Use get_sst() for SST data."
        )
    
    def _parse_netcdf(
        self,
        filepath: str,
        parameter: str,
        unit: str,
        source: str
    ) -> List[OceanographicReading]:
        """Parse NetCDF file into readings."""
        readings = []
        
        try:
            import netCDF4 as nc
            
            ds = nc.Dataset(filepath, 'r')
            
            lats = ds.variables['latitude'][:]
            lons = ds.variables['longitude'][:]
            times = nc.num2date(
                ds.variables['time'][:], 
                ds.variables['time'].units
            )
            
            # Get variable (sst, etc)
            var_name = self.DATASETS["sst_obs"]["variable"]
            if var_name in ds.variables:
                data = ds.variables[var_name][:]
                
                # Sample grid (every 5th point to avoid too much data)
                for i in range(0, len(lats), 5):
                    for j in range(0, len(lons), 5):
                        val = data[-1, i, j] if len(data.shape) == 3 else data[i, j]
                        if val is not None and not hasattr(val, 'mask'):
                            readings.append(OceanographicReading(
                                parameter=parameter,
                                value=float(val) - 273.15 if parameter == "temperature" else float(val),
                                unit=unit,
                                latitude=float(lats[i]),
                                longitude=float(lons[j]),
                                depth=0.0,
                                timestamp=times[-1].isoformat() if times.size > 0 else datetime.utcnow().isoformat(),
                                source=source,
                                quality="good"
                            ))
            
            ds.close()
            
        except Exception as e:
            logger.error(f"Failed to parse NetCDF: {e}")
        
        return readings[:100]  # Limit to 100 points
    
    async def _get_fallback_sst(
        self,
        min_lat: float,
        max_lat: float,
        min_lon: float,
        max_lon: float
    ) -> List[OceanographicReading]:
        """Generate representative SST data for Indian Ocean."""
        import random
        
        readings = []
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Grid sampling across region
        lat_step = (max_lat - min_lat) / 5
        lon_step = (max_lon - min_lon) / 5
        
        for i in range(5):
            for j in range(5):
                lat = min_lat + i * lat_step + lat_step / 2
                lon = min_lon + j * lon_step + lon_step / 2
                
                # SST varies by latitude (warmer near equator)
                base_sst = 30 - abs(lat) * 0.15
                sst = base_sst + random.uniform(-1, 1)
                
                readings.append(OceanographicReading(
                    parameter="temperature",
                    value=round(sst, 2),
                    unit="°C",
                    latitude=round(lat, 2),
                    longitude=round(lon, 2),
                    depth=0.0,
                    timestamp=timestamp,
                    source="COPERNICUS_FALLBACK",
                    quality="estimated",
                    metadata={"product": "SST_ANALYSIS"}
                ))
        
        logger.info(f"Generated {len(readings)} fallback Copernicus SST readings")
        return readings
    
    async def _get_fallback_chlorophyll(
        self,
        min_lat: float,
        max_lat: float,
        min_lon: float,
        max_lon: float
    ) -> List[OceanographicReading]:
        """Generate representative chlorophyll data."""
        import random
        
        readings = []
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Key regions with different chlorophyll concentrations
        regions = [
            {"name": "Upwelling coast", "lat": 15.0, "lon": 73.0, "chl_range": (1.0, 3.0)},
            {"name": "Open ocean", "lat": 5.0, "lon": 75.0, "chl_range": (0.1, 0.5)},
            {"name": "Bay of Bengal", "lat": 12.0, "lon": 88.0, "chl_range": (0.5, 1.5)},
            {"name": "Coastal India", "lat": 10.0, "lon": 76.0, "chl_range": (1.0, 5.0)},
        ]
        
        for region in regions:
            chl = random.uniform(*region["chl_range"])
            readings.append(OceanographicReading(
                parameter="chlorophyll",
                value=round(chl, 3),
                unit="mg/m³",
                latitude=region["lat"],
                longitude=region["lon"],
                depth=0.0,
                timestamp=timestamp,
                source="COPERNICUS_FALLBACK",
                quality="estimated",
                metadata={"region": region["name"]}
            ))
        
        return readings
    
    async def _get_fallback_currents(
        self,
        min_lat: float,
        max_lat: float,
        min_lon: float,
        max_lon: float
    ) -> List[OceanographicReading]:
        """Generate representative current data."""
        import random
        import math
        
        readings = []
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Monsoon-influenced currents
        for _ in range(10):
            lat = random.uniform(min_lat, max_lat)
            lon = random.uniform(min_lon, max_lon)
            
            # Current direction based on season (simplified)
            month = datetime.utcnow().month
            if 6 <= month <= 9:  # SW Monsoon
                u = random.uniform(0.1, 0.5)
                v = random.uniform(0.1, 0.3)
            else:  # NE Monsoon
                u = random.uniform(-0.3, 0.1)
                v = random.uniform(-0.2, 0.1)
            
            speed = math.sqrt(u**2 + v**2)
            direction = math.degrees(math.atan2(v, u))
            
            readings.append(OceanographicReading(
                parameter="current_speed",
                value=round(speed, 3),
                unit="m/s",
                latitude=round(lat, 2),
                longitude=round(lon, 2),
                depth=0.0,
                timestamp=timestamp,
                source="COPERNICUS_FALLBACK",
                quality="estimated",
                metadata={"direction": round(direction, 1), "u": round(u, 3), "v": round(v, 3)}
            ))
        
        return readings


# Convenience function
async def fetch_copernicus_data(
    data_type: str = "sst",
    region: str = "indian_ocean"
) -> List[Dict]:
    """
    Quick function to fetch Copernicus data.
    
    Args:
        data_type: 'sst', 'chlorophyll', 'currents'
        region: 'indian_ocean', 'arabian_sea', 'bay_of_bengal'
        
    Returns:
        List of oceanographic readings as dicts
    """
    connector = CopernicusConnector()
    
    # Region bounds
    if region == "arabian_sea":
        bounds = {"min_lat": 5, "max_lat": 25, "min_lon": 55, "max_lon": 77}
    elif region == "bay_of_bengal":
        bounds = {"min_lat": 5, "max_lat": 22, "min_lon": 80, "max_lon": 95}
    else:  # indian_ocean
        bounds = {"min_lat": 0, "max_lat": 25, "min_lon": 60, "max_lon": 100}
    
    if data_type == "sst":
        readings = await connector.get_sst(**bounds)
    elif data_type == "chlorophyll":
        readings = await connector.get_chlorophyll(**bounds)
    elif data_type == "currents":
        readings = await connector.get_currents(**bounds)
    else:
        readings = await connector.get_sst(**bounds)
    
    return [r.to_dict() for r in readings]


if __name__ == "__main__":
    async def test():
        connector = CopernicusConnector()
        
        print("Fetching SST...")
        sst = await connector.get_sst()
        print(f"Got {len(sst)} SST readings")
        
        print("\nFetching Chlorophyll...")
        chl = await connector.get_chlorophyll()
        print(f"Got {len(chl)} chlorophyll readings")
        
        print("\nFetching Currents...")
        curr = await connector.get_currents()
        print(f"Got {len(curr)} current readings")
    
    asyncio.run(test())
