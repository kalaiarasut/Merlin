"""
Environmental Data Service for Species Distribution Modeling

Unified interface for fetching environmental data from authoritative sources:
- SST: Copernicus Marine Service (CMEMS) - Highest-quality merged SST
- Salinity: Copernicus Marine Service (CMEMS) - Data-assimilated
- Depth (Bathymetry): GEBCO via NOAA ERDDAP - Global standard
- Chlorophyll-a: VIIRS via NOAA CoastWatch ERDDAP - Gold-standard ocean color
- Dissolved Oxygen: Copernicus Marine Service (Argo BGC) - Real in-situ data

Scientific References:
- CMEMS: https://data.marine.copernicus.eu/
- GEBCO: https://www.gebco.net/
- VIIRS: https://coastwatch.pfeg.noaa.gov/

Author: CMLRE Marine Data Platform
"""

import os
import asyncio
import aiohttp
import logging
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
import hashlib
import json

# Configure logging with custom format
logging.basicConfig(
    level=logging.INFO,
    format='%(message)s'  # Clean format for our custom styled messages
)
logger = logging.getLogger('environmental_data_service')


class LogStyle:
    """Terminal logging with styled output for environmental data fetching."""
    
    # ANSI Color codes
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    
    # Colors
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    MAGENTA = "\033[95m"
    WHITE = "\033[97m"
    
    # Emoji indicators
    CHECK = "✓"
    CROSS = "✗"
    ARROW = "→"
    WARN = "⚠"
    INFO = "ℹ"
    FETCH = "📡"
    DATA = "📊"
    
    @classmethod
    def header(cls, text: str) -> str:
        """Section header."""
        return f"\n{cls.CYAN}{cls.BOLD}{'─' * 50}{cls.RESET}\n{cls.CYAN}{cls.BOLD}{cls.FETCH} {text}{cls.RESET}\n{cls.CYAN}{'─' * 50}{cls.RESET}"
    
    @classmethod
    def trying(cls, source: str, variable: str) -> str:
        """Trying to fetch from source."""
        return f"  {cls.BLUE}{cls.ARROW}{cls.RESET} Trying {cls.BOLD}{source}{cls.RESET} for {cls.CYAN}{variable}{cls.RESET}..."
    
    @classmethod
    def success(cls, source: str, variable: str, details: str = "") -> str:
        """Success message."""
        detail_str = f" {cls.DIM}({details}){cls.RESET}" if details else ""
        return f"  {cls.GREEN}{cls.CHECK}{cls.RESET} {cls.GREEN}{variable}{cls.RESET} from {cls.BOLD}{source}{cls.RESET}{detail_str}"
    
    @classmethod
    def fallback(cls, primary: str, backup: str, reason: str = "") -> str:
        """Fallback message."""
        reason_str = f": {reason}" if reason else ""
        return f"  {cls.YELLOW}{cls.WARN}{cls.RESET} {cls.YELLOW}{primary} unavailable{reason_str}{cls.RESET}\n  {cls.BLUE}{cls.ARROW}{cls.RESET} Falling back to {cls.BOLD}{backup}{cls.RESET}"
    
    @classmethod
    def error(cls, source: str, error: str) -> str:
        """Error message."""
        return f"  {cls.RED}{cls.CROSS}{cls.RESET} {cls.RED}{source} failed{cls.RESET}: {cls.DIM}{error}{cls.RESET}"
    
    @classmethod
    def info(cls, message: str) -> str:
        """Info message."""
        return f"  {cls.BLUE}{cls.INFO}{cls.RESET} {message}"
    
    @classmethod
    def summary(cls, sources: Dict[str, str]) -> str:
        """Summary of data sources used."""
        lines = [f"\n{cls.GREEN}{cls.BOLD}{cls.DATA} Environmental Data Summary:{cls.RESET}"]
        for var, source in sources.items():
            lines.append(f"  {cls.DIM}•{cls.RESET} {var}: {cls.CYAN}{source}{cls.RESET}")
        return "\n".join(lines)
    
    @classmethod
    def bbox_info(cls, bbox: Dict) -> str:
        """Bounding box info."""
        return (
            f"  {cls.DIM}Bounding Box:{cls.RESET} "
            f"Lat [{bbox['lat_min']:.2f}° to {bbox['lat_max']:.2f}°], "
            f"Lon [{bbox['lon_min']:.2f}° to {bbox['lon_max']:.2f}°]"
        )



@dataclass
class EnvironmentalPoint:
    """Environmental data for a single coordinate."""
    latitude: float
    longitude: float
    temperature: Optional[float] = None  # SST in °C
    salinity: Optional[float] = None  # PSU
    depth: Optional[float] = None  # Bathymetry in meters (positive down)
    chlorophyll: Optional[float] = None  # mg/m³
    dissolved_oxygen: Optional[float] = None  # mg/L
    ph: Optional[float] = None
    current_speed: Optional[float] = None  # m/s
    timestamp: Optional[str] = None
    data_sources: Dict[str, str] = None  # Which source provided each variable
    quality_flags: Dict[str, str] = None  # Quality info per variable
    
    def to_dict(self) -> Dict:
        result = asdict(self)
        # Remove None values for cleaner output
        return {k: v for k, v in result.items() if v is not None}


# In-memory cache for environmental data
_env_cache: Dict[str, Tuple[datetime, Any]] = {}
_cache_ttl_hours = 6  # Cache for 6 hours


def _get_cache_key(lat: float, lon: float, variables: List[str]) -> str:
    """Generate cache key for coordinate + variables."""
    key_data = f"{lat:.2f}_{lon:.2f}_{'_'.join(sorted(variables))}"
    return hashlib.md5(key_data.encode()).hexdigest()


def _get_cached(key: str) -> Optional[Dict]:
    """Get cached data if still valid."""
    if key in _env_cache:
        cached_time, data = _env_cache[key]
        if datetime.utcnow() - cached_time < timedelta(hours=_cache_ttl_hours):
            return data
        else:
            del _env_cache[key]
    return None


def _set_cached(key: str, data: Dict):
    """Cache environmental data."""
    _env_cache[key] = (datetime.utcnow(), data)


class EnvironmentalDataService:
    """
    Authoritative environmental data fetcher for Species Distribution Modeling.
    
    Data Sources (per scientific best practices):
    - SST: CMEMS (cmems_obs-sst_glo_phy-sst_nrt_diurnal-oi-0.25deg_P1D)
    - Salinity: CMEMS (cmems_mod_glo_phy_anfc_0.083deg_PT1H-m)
    - Bathymetry: GEBCO 2023 via NOAA ERDDAP (etopo1/gebco)
    - Chlorophyll: VIIRS via NOAA CoastWatch ERDDAP (erdVH3chlamday)
    - DO: CMEMS Argo BGC (existing copernicus_service.py)
    """
    
    # ERDDAP endpoints for bathymetry and chlorophyll
    ERDDAP_GEBCO = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.json"
    ERDDAP_VIIRS_CHL = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/erdVH3chlamday.json"
    ERDDAP_SST = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/erdMH1sstdmday.json"  # MODIS backup
    
    # Variable mappings
    SUPPORTED_VARIABLES = [
        'temperature', 'salinity', 'depth', 'chlorophyll', 
        'dissolved_oxygen', 'ph', 'current_speed'
    ]
    
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self._copernicus_available = self._check_copernicus_credentials()
    
    def _check_copernicus_credentials(self) -> bool:
        """Check if Copernicus credentials are configured."""
        username = os.getenv("COPERNICUS_USERNAME")
        password = os.getenv("COPERNICUS_PASSWORD")
        return bool(username and password)
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session."""
        if self.session is None or self.session.closed:
            timeout = aiohttp.ClientTimeout(total=60)
            self.session = aiohttp.ClientSession(timeout=timeout)
        return self.session
    
    async def close(self):
        """Close the session."""
        if self.session and not self.session.closed:
            await self.session.close()
    
    async def get_environmental_data(
        self,
        coordinates: List[List[float]],
        variables: Optional[List[str]] = None
    ) -> List[Dict[str, float]]:
        """
        Fetch real environmental data for a list of coordinates.
        
        Args:
            coordinates: List of [lat, lon] pairs
            variables: Variables to fetch (default: all available)
            
        Returns:
            List of dicts with environmental values per coordinate
        """
        variables = variables or ['temperature', 'salinity', 'depth', 'chlorophyll', 'dissolved_oxygen']
        
        # Calculate bounding box for efficient batch queries
        coords_array = np.array(coordinates)
        bbox = {
            'lat_min': float(coords_array[:, 0].min()) - 0.5,
            'lat_max': float(coords_array[:, 0].max()) + 0.5,
            'lon_min': float(coords_array[:, 1].min()) - 0.5,
            'lon_max': float(coords_array[:, 1].max()) + 0.5
        }
        
        # Log header
        print(LogStyle.header("Fetching Environmental Data"))
        print(LogStyle.info(f"Coordinates: {len(coordinates)} points"))
        print(LogStyle.bbox_info(bbox))
        print(LogStyle.info(f"Variables: {', '.join(variables)}"))
        print()
        
        # Fetch data grids for each variable
        env_grids = {}
        data_sources = {}
        
        # Fetch all variables concurrently
        tasks = []
        if 'temperature' in variables:
            tasks.append(('temperature', self._fetch_sst_grid(bbox)))
        if 'salinity' in variables:
            tasks.append(('salinity', self._fetch_salinity_grid(bbox)))
        if 'depth' in variables:
            tasks.append(('depth', self._fetch_bathymetry_grid(bbox)))
        if 'chlorophyll' in variables:
            tasks.append(('chlorophyll', self._fetch_chlorophyll_grid(bbox)))
        if 'dissolved_oxygen' in variables:
            tasks.append(('dissolved_oxygen', self._fetch_do_grid(bbox)))
        
        # Execute all fetches concurrently
        results = await asyncio.gather(
            *[task[1] for task in tasks],
            return_exceptions=True
        )
        
        for i, (var_name, _) in enumerate(tasks):
            result = results[i]
            if isinstance(result, Exception):
                print(LogStyle.error(var_name, str(result)[:60]))
                env_grids[var_name] = None
            else:
                env_grids[var_name] = result.get('grid')
                source = result.get('source', 'Unknown')
                data_sources[var_name] = source
        
        # Print summary
        if data_sources:
            print(LogStyle.summary(data_sources))
        
        # Extract values for each coordinate
        env_data = []
        for lat, lon in coordinates:
            point_data = {
                'latitude': lat,
                'longitude': lon,
            }
            
            for var_name, grid_data in env_grids.items():
                if grid_data is not None:
                    value = self._interpolate_value(lat, lon, grid_data)
                    if value is not None:
                        point_data[var_name] = value
                        
            point_data['data_sources'] = data_sources
            point_data['timestamp'] = datetime.utcnow().isoformat() + 'Z'
            
            env_data.append(point_data)
        
        return env_data
    
    def _interpolate_value(
        self, 
        lat: float, 
        lon: float, 
        grid_data: Dict
    ) -> Optional[float]:
        """
        Interpolate value from grid to specific coordinate.
        Uses nearest neighbor for robustness.
        """
        try:
            lats = np.array(grid_data['lats'])
            lons = np.array(grid_data['lons'])
            values = np.array(grid_data['values'])
            
            # Find nearest grid point
            lat_idx = np.abs(lats - lat).argmin()
            lon_idx = np.abs(lons - lon).argmin()
            
            value = values[lat_idx, lon_idx]
            
            # Handle masked/NaN values
            if np.ma.is_masked(value) or np.isnan(value):
                return None
            
            return float(value)
        except Exception as e:
            logger.debug(f"Interpolation failed: {e}")
            return None
    
    # =========================================
    # SST - Sea Surface Temperature
    # Primary: Copernicus CMEMS
    # Backup: MODIS via NOAA ERDDAP
    # =========================================
    
    async def _fetch_sst_grid(self, bbox: Dict) -> Dict:
        """
        Fetch SST from Copernicus CMEMS (primary) or MODIS ERDDAP (backup).
        
        Product: cmems_obs-sst_glo_phy-sst_nrt_diurnal-oi-0.25deg_P1D
        Resolution: 0.25° (~25km)
        """
        print(LogStyle.trying("Copernicus CMEMS", "SST"))
        
        # Try Copernicus first
        if self._copernicus_available:
            try:
                result = await self._fetch_sst_copernicus(bbox)
                if result.get('grid'):
                    print(LogStyle.success("Copernicus CMEMS", "SST", "0.25° resolution"))
                    return result
                else:
                    print(LogStyle.fallback("Copernicus CMEMS", "NOAA MODIS ERDDAP", "no data returned"))
            except Exception as e:
                error_msg = str(e)[:50] if len(str(e)) > 50 else str(e)
                print(LogStyle.fallback("Copernicus CMEMS", "NOAA MODIS ERDDAP", error_msg))
        else:
            print(LogStyle.fallback("Copernicus CMEMS", "NOAA MODIS ERDDAP", "credentials not configured"))
        
        # Fallback to MODIS via ERDDAP
        result = await self._fetch_sst_erddap(bbox)
        if result.get('grid'):
            print(LogStyle.success("NOAA MODIS ERDDAP", "SST", "8-day composite"))
        return result
    
    async def _fetch_sst_copernicus(self, bbox: Dict) -> Dict:
        """Fetch SST from Copernicus Marine Service."""
        try:
            from data_connectors.copernicus_connector import CopernicusConnector
            
            connector = CopernicusConnector()
            readings = await connector.get_sst(
                min_lat=bbox['lat_min'],
                max_lat=bbox['lat_max'],
                min_lon=bbox['lon_min'],
                max_lon=bbox['lon_max'],
                hours_ago=48  # Get recent data
            )
            
            if readings:
                # Convert readings to grid format
                lats = sorted(set(r.latitude for r in readings))
                lons = sorted(set(r.longitude for r in readings))
                
                # Create grid (sparse to dense)
                grid = np.full((len(lats), len(lons)), np.nan)
                lat_to_idx = {lat: i for i, lat in enumerate(lats)}
                lon_to_idx = {lon: i for i, lon in enumerate(lons)}
                
                for r in readings:
                    grid[lat_to_idx[r.latitude], lon_to_idx[r.longitude]] = r.value
                
                return {
                    'grid': {'lats': lats, 'lons': lons, 'values': grid},
                    'source': 'COPERNICUS_CMEMS_SST',
                    'resolution': '0.25deg',
                    'timestamp': datetime.utcnow().isoformat()
                }
        except Exception as e:
            logger.error(f"Copernicus SST fetch failed: {e}")
            raise
        
        return {'grid': None, 'source': 'COPERNICUS_CMEMS_SST'}
    
    async def _fetch_sst_erddap(self, bbox: Dict) -> Dict:
        """Fetch SST from MODIS via NOAA ERDDAP (backup source)."""
        try:
            session = await self._get_session()
            
            # Try erdMH1sstd8day (8-day composite) which has more recent data
            # Use 'last' to get most recent available data
            url = (
                f"https://coastwatch.pfeg.noaa.gov/erddap/griddap/erdMH1sstd8day.json?"
                f"sst[(last):1:(last)]"
                f"[({bbox['lat_min']}):1:({bbox['lat_max']})]"
                f"[({bbox['lon_min']}):1:({bbox['lon_max']})]"
            )
            
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._parse_erddap_grid(data, 'sst', 'NOAA_MODIS_SST')
                else:
                    logger.warning(f"ERDDAP SST 8-day returned {response.status}, trying monthly")
            
            # Fallback: try monthly with 'last'
            url = (
                f"https://coastwatch.pfeg.noaa.gov/erddap/griddap/erdMH1sstdmday.json?"
                f"sst[(last):1:(last)]"
                f"[({bbox['lat_min']}):1:({bbox['lat_max']})]"
                f"[({bbox['lon_min']}):1:({bbox['lon_max']})]"
            )
            
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._parse_erddap_grid(data, 'sst', 'NOAA_MODIS_SST')
                    
        except Exception as e:
            logger.error(f"ERDDAP SST fetch failed: {e}")
        
        return {'grid': None, 'source': 'NOAA_MODIS_SST'}
    
    # =========================================
    # Salinity
    # Source: Copernicus CMEMS Global Physics
    # =========================================
    
    async def _fetch_salinity_grid(self, bbox: Dict) -> Dict:
        """
        Fetch Salinity from Copernicus CMEMS.
        
        Product: cmems_mod_glo_phy_anfc_0.083deg_PT1H-m
        Variable: so (sea water salinity)
        Resolution: 1/12° (~8km)
        """
        print(LogStyle.trying("Copernicus CMEMS", "Salinity"))
        
        if not self._copernicus_available:
            print(LogStyle.fallback("Copernicus CMEMS", "WOA18 Climatology", "credentials not configured"))
            return await self._fetch_salinity_climatology(bbox)
        
        try:
            import copernicusmarine
            import tempfile
            
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(hours=24)
            
            with tempfile.TemporaryDirectory() as tmpdir:
                output_path = os.path.join(tmpdir, "salinity.nc")
                
                copernicusmarine.subset(
                    dataset_id="cmems_mod_glo_phy_anfc_0.083deg_PT1H-m",
                    variables=["so"],
                    minimum_longitude=bbox['lon_min'],
                    maximum_longitude=bbox['lon_max'],
                    minimum_latitude=bbox['lat_min'],
                    maximum_latitude=bbox['lat_max'],
                    start_datetime=start_time.strftime("%Y-%m-%dT%H:%M:%S"),
                    end_datetime=end_time.strftime("%Y-%m-%dT%H:%M:%S"),
                    minimum_depth=0,
                    maximum_depth=10,  # Surface layer
                    output_directory=tmpdir,
                    output_filename="salinity.nc",
                    force_download=True
                )
                
                grid = self._parse_netcdf_grid(output_path, 'so')
                if grid:
                    print(LogStyle.success("Copernicus CMEMS", "Salinity", "0.083° resolution"))
                    return {
                        'grid': grid,
                        'source': 'COPERNICUS_CMEMS_SALINITY',
                        'resolution': '0.083deg'
                    }
                    
        except ImportError:
            print(LogStyle.fallback("Copernicus CMEMS", "WOA18 Climatology", "copernicusmarine not installed"))
        except Exception as e:
            error_msg = str(e)[:50] if len(str(e)) > 50 else str(e)
            print(LogStyle.fallback("Copernicus CMEMS", "WOA18 Climatology", error_msg))
        
        result = await self._fetch_salinity_climatology(bbox)
        if result.get('grid'):
            print(LogStyle.success("WOA18 Climatology", "Salinity", "1° climatology"))
        return result
    
    async def _fetch_salinity_climatology(self, bbox: Dict) -> Dict:
        """Fetch salinity from World Ocean Atlas climatology via ERDDAP."""
        try:
            session = await self._get_session()
            
            # WOA18 Salinity climatology
            url = (
                f"https://coastwatch.pfeg.noaa.gov/erddap/griddap/woa18_decav_s00_04.json?"
                f"s_an[(0.0):1:(0.0)]"
                f"[({bbox['lat_min']}):1:({bbox['lat_max']})]"
                f"[({bbox['lon_min']}):1:({bbox['lon_max']})]"
            )
            
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._parse_erddap_grid(data, 's_an', 'WOA18_SALINITY_CLIMATOLOGY')
                    
        except Exception as e:
            logger.error(f"WOA salinity fetch failed: {e}")
        
        return {'grid': None, 'source': 'WOA18_SALINITY'}
    
    # =========================================
    # Bathymetry (Depth)
    # Source: GEBCO via NOAA ERDDAP (ETOPO)
    # =========================================
    
    async def _fetch_bathymetry_grid(self, bbox: Dict) -> Dict:
        """
        Fetch Bathymetry from GEBCO/ETOPO via NOAA ERDDAP.
        
        Dataset: etopo1_bedrock (1 arc-minute global relief)
        This is the universally accepted standard for bathymetry.
        """
        print(LogStyle.trying("GEBCO/ETOPO via NOAA ERDDAP", "Depth"))
        
        try:
            session = await self._get_session()
            
            # ETOPO1 bathymetry - high resolution global
            url = (
                f"https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.json?"
                f"altitude[({bbox['lat_min']}):1:({bbox['lat_max']})]"
                f"[({bbox['lon_min']}):1:({bbox['lon_max']})]"
            )
            
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    result = self._parse_erddap_grid(data, 'altitude', 'GEBCO_ETOPO1')
                    
                    # Convert altitude to depth (negative elevation = ocean depth)
                    if result.get('grid'):
                        values = result['grid']['values']
                        # Make depth positive (bathymetry convention)
                        result['grid']['values'] = np.abs(np.minimum(values, 0))
                        print(LogStyle.success("GEBCO/ETOPO1", "Depth", "1 arc-minute resolution"))
                    
                    return result
                else:
                    print(LogStyle.error("GEBCO/ETOPO ERDDAP", f"HTTP {response.status}"))
        except Exception as e:
            print(LogStyle.error("GEBCO/ETOPO ERDDAP", str(e)[:50]))
        
        return {'grid': None, 'source': 'GEBCO_ETOPO1'}
    
    # =========================================
    # Chlorophyll-a
    # Source: VIIRS via NOAA CoastWatch ERDDAP
    # =========================================
    
    async def _fetch_chlorophyll_grid(self, bbox: Dict) -> Dict:
        """
        Fetch Chlorophyll-a from VIIRS via NOAA CoastWatch ERDDAP.
        
        Dataset: erdVH3chlamday (VIIRS monthly chlorophyll-a)
        This is the gold-standard ocean color product.
        """
        print(LogStyle.trying("NOAA VIIRS Monthly", "Chlorophyll"))
        
        try:
            session = await self._get_session()
            
            # Get recent monthly composite
            end_date = datetime.utcnow()
            start_date = end_date - timedelta(days=45)  # Get last month's data
            
            # VIIRS chlorophyll - use 'last' for most recent data
            url = (
                f"https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisVHNSQchlaMonthly.json?"
                f"chlor_a[(last):1:(last)]"
                f"[({bbox['lat_min']}):1:({bbox['lat_max']})]"
                f"[({bbox['lon_min']}):1:({bbox['lon_max']})]"
            )
            
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    result = self._parse_erddap_grid(data, 'chlor_a', 'NOAA_VIIRS_CHLOROPHYLL')
                    
                    # Apply log transformation for chlorophyll (standard practice)
                    if result.get('grid') and result['grid']['values'] is not None:
                        values = result['grid']['values']
                        # Cap extreme values (quality control)
                        values = np.clip(values, 0.01, 100)
                        result['grid']['values'] = values
                        print(LogStyle.success("NOAA VIIRS Monthly", "Chlorophyll", "ocean color sensor"))
                    
                    return result
                else:
                    print(LogStyle.fallback("NOAA VIIRS Monthly", "NOAA MODIS", f"HTTP {response.status}"))
                    
        except Exception as e:
            error_msg = str(e)[:50] if len(str(e)) > 50 else str(e)
            print(LogStyle.fallback("NOAA VIIRS Monthly", "NOAA MODIS", error_msg))
        
        # Try backup: MODIS chlorophyll
        result = await self._fetch_chlorophyll_modis(bbox)
        if result.get('grid'):
            print(LogStyle.success("NOAA MODIS", "Chlorophyll", "monthly composite"))
        return result
    
    async def _fetch_chlorophyll_modis(self, bbox: Dict) -> Dict:
        """Backup: MODIS Aqua chlorophyll."""
        try:
            session = await self._get_session()
            
            # Use 'last' for most recent available data
            url = (
                f"https://coastwatch.pfeg.noaa.gov/erddap/griddap/erdMH1chlamday.json?"
                f"chlorophyll[(last):1:(last)]"
                f"[({bbox['lat_min']}):1:({bbox['lat_max']})]"
                f"[({bbox['lon_min']}):1:({bbox['lon_max']})]"
            )
            
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._parse_erddap_grid(data, 'chlorophyll', 'NOAA_MODIS_CHLOROPHYLL')
                else:
                    print(LogStyle.error("MODIS Chlorophyll", f"HTTP {response.status}"))
        except Exception as e:
            print(LogStyle.error("MODIS Chlorophyll", str(e)[:50]))
        
        return {'grid': None, 'source': 'NOAA_MODIS_CHLOROPHYLL'}
    
    # =========================================
    # Dissolved Oxygen
    # Source: Copernicus Argo BGC
    # =========================================
    
    async def _fetch_do_grid(self, bbox: Dict) -> Dict:
        """
        Fetch Dissolved Oxygen from WOA18 climatology.
        
        Note: Copernicus Argo BGC has async issues, using WOA18 directly.
        WOA18 is the authoritative climatological reference for dissolved oxygen.
        """
        print(LogStyle.trying("WOA18 Climatology (NOAA)", "Dissolved Oxygen"))
        
        # Use WOA18 climatology directly - it's scientifically valid
        # and avoids async issues with the copernicus_service module
        result = await self._fetch_do_climatology(bbox)
        if result.get('grid'):
            print(LogStyle.success("WOA18 Climatology", "Dissolved Oxygen", "1° climatology"))
        return result
    
    async def _fetch_do_climatology(self, bbox: Dict) -> Dict:
        """Fetch DO from World Ocean Atlas climatology."""
        try:
            session = await self._get_session()
            
            # WOA18 Dissolved Oxygen climatology
            url = (
                f"https://coastwatch.pfeg.noaa.gov/erddap/griddap/woa18_decav_o00_04.json?"
                f"o_an[(0.0):1:(0.0)]"
                f"[({bbox['lat_min']}):1:({bbox['lat_max']})]"
                f"[({bbox['lon_min']}):1:({bbox['lon_max']})]"
            )
            
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    result = self._parse_erddap_grid(data, 'o_an', 'WOA18_DO_CLIMATOLOGY')
                    
                    # Convert from ml/L to mg/L (multiply by 1.429)
                    if result.get('grid') and result['grid']['values'] is not None:
                        result['grid']['values'] = result['grid']['values'] * 1.429
                    
                    return result
        except Exception as e:
            logger.error(f"WOA DO fetch failed: {e}")
        
        return {'grid': None, 'source': 'WOA18_DO'}
    
    # =========================================
    # Helper Methods
    # =========================================
    
    def _parse_erddap_grid(
        self, 
        data: Dict, 
        var_name: str, 
        source: str
    ) -> Dict:
        """Parse ERDDAP JSON response into grid format."""
        try:
            table = data.get('table', {})
            column_names = table.get('columnNames', [])
            rows = table.get('rows', [])
            
            if not rows:
                return {'grid': None, 'source': source}
            
            # Find column indices
            lat_idx = column_names.index('latitude') if 'latitude' in column_names else None
            lon_idx = column_names.index('longitude') if 'longitude' in column_names else None
            var_idx = column_names.index(var_name) if var_name in column_names else None
            
            if lat_idx is None or lon_idx is None or var_idx is None:
                logger.warning(f"Missing columns in ERDDAP response: {column_names}")
                return {'grid': None, 'source': source}
            
            # Extract unique lats/lons and values
            lats_set = set()
            lons_set = set()
            values_dict = {}
            
            for row in rows:
                lat = row[lat_idx]
                lon = row[lon_idx]
                val = row[var_idx]
                
                if lat is not None and lon is not None:
                    lats_set.add(lat)
                    lons_set.add(lon)
                    if val is not None and val != 'NaN':
                        values_dict[(lat, lon)] = float(val)
            
            lats = sorted(lats_set)
            lons = sorted(lons_set)
            
            if not lats or not lons:
                return {'grid': None, 'source': source}
            
            # Create 2D grid
            grid = np.full((len(lats), len(lons)), np.nan)
            for (lat, lon), val in values_dict.items():
                lat_idx = lats.index(lat)
                lon_idx = lons.index(lon)
                grid[lat_idx, lon_idx] = val
            
            return {
                'grid': {'lats': lats, 'lons': lons, 'values': grid},
                'source': source
            }
            
        except Exception as e:
            logger.error(f"Failed to parse ERDDAP response: {e}")
            return {'grid': None, 'source': source}
    
    def _parse_netcdf_grid(self, filepath: str, var_name: str) -> Optional[Dict]:
        """Parse NetCDF file into grid format."""
        try:
            import netCDF4 as nc
            
            ds = nc.Dataset(filepath, 'r')
            
            lats = ds.variables['latitude'][:].tolist()
            lons = ds.variables['longitude'][:].tolist()
            
            if var_name in ds.variables:
                data = ds.variables[var_name][:]
                # Get surface layer (first time, first depth)
                if len(data.shape) == 4:  # time, depth, lat, lon
                    values = data[-1, 0, :, :]
                elif len(data.shape) == 3:  # time, lat, lon
                    values = data[-1, :, :]
                else:
                    values = data[:]
                
                ds.close()
                return {'lats': lats, 'lons': lons, 'values': np.array(values)}
            
            ds.close()
        except Exception as e:
            logger.error(f"Failed to parse NetCDF: {e}")
        
        return None


# Convenience function for quick access
async def get_environmental_data_for_coordinates(
    coordinates: List[List[float]],
    variables: Optional[List[str]] = None
) -> List[Dict]:
    """
    Fetch real environmental data for coordinates.
    
    Args:
        coordinates: List of [lat, lon] pairs
        variables: List of variables to fetch
        
    Returns:
        List of environmental data dicts per coordinate
    """
    service = EnvironmentalDataService()
    try:
        return await service.get_environmental_data(coordinates, variables)
    finally:
        await service.close()


# Test function
if __name__ == "__main__":
    async def test():
        print("Testing Environmental Data Service...")
        
        # Test coordinates in Indian Ocean
        coords = [
            [10.5, 75.3],  # Kerala coast
            [12.0, 80.0],  # Chennai
            [8.0, 77.0],   # Kanyakumari
        ]
        
        service = EnvironmentalDataService()
        
        try:
            data = await service.get_environmental_data(coords)
            
            for point in data:
                print(f"\nLocation: ({point['latitude']}, {point['longitude']})")
                for key, value in point.items():
                    if key not in ['latitude', 'longitude', 'data_sources', 'timestamp']:
                        print(f"  {key}: {value}")
                print(f"  Sources: {point.get('data_sources', {})}")
        finally:
            await service.close()
        
        print("\nTest complete!")
    
    asyncio.run(test())
