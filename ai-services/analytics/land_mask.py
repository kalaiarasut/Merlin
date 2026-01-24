"""
Land/Ocean Mask for Species Distribution Modeling

Uses ETOPO1 bathymetry data from NOAA ERDDAP to determine ocean vs land.
Ocean = altitude < 0 (below sea level)

Scientific Notes:
- ETOPO1 provides bathymetry + topography at 1 arc-minute (~1.8km) resolution
- This is sufficient for SDM purposes (not meter-precise coastline)
- Data cached to disk to avoid repeated API calls

Author: CMLRE Marine Data Platform
"""

import os
import asyncio
import aiohttp
import numpy as np
import logging
from typing import Dict, List, Tuple, Optional
from datetime import datetime
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('land_mask')


# Study Area Definitions
STUDY_AREAS = {
    'arabian_sea': {
        'name': 'Arabian Sea / Indian EEZ',
        'lon_min': 60.0,
        'lon_max': 80.0,
        'lat_min': 0.0,
        'lat_max': 25.0,
    },
    'bay_of_bengal': {
        'name': 'Bay of Bengal',
        'lon_min': 80.0,
        'lon_max': 100.0,
        'lat_min': 0.0,
        'lat_max': 25.0,
    },
    'indian_ocean': {
        'name': 'North Indian Ocean',
        'lon_min': 40.0,
        'lon_max': 120.0,
        'lat_min': -10.0,
        'lat_max': 30.0,
    }
}

# Default study area
DEFAULT_STUDY_AREA = 'arabian_sea'


class OceanMask:
    """
    Ocean/Land mask based on ETOPO1 bathymetry.
    
    Uses altitude < 0 to determine ocean pixels.
    Caches mask to disk for efficiency.
    """
    
    ERDDAP_URL = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.json"
    CACHE_DIR = os.path.join(os.path.dirname(__file__), '.cache')
    
    def __init__(self, study_area: str = DEFAULT_STUDY_AREA, resolution: float = 0.1):
        """
        Initialize ocean mask for a study area.
        
        Args:
            study_area: Key from STUDY_AREAS dict
            resolution: Grid resolution in degrees (0.1 = ~10km)
        """
        self.study_area_key = study_area
        self.study_area = STUDY_AREAS.get(study_area, STUDY_AREAS[DEFAULT_STUDY_AREA])
        self.resolution = resolution
        
        self._mask: Optional[np.ndarray] = None
        self._lats: Optional[np.ndarray] = None
        self._lons: Optional[np.ndarray] = None
        self._loaded = False
        
        # Ensure cache directory exists
        os.makedirs(self.CACHE_DIR, exist_ok=True)
    
    @property
    def cache_file(self) -> str:
        """Path to cached mask file."""
        return os.path.join(
            self.CACHE_DIR, 
            f"ocean_mask_{self.study_area_key}_{self.resolution}.npz"
        )
    
    def _load_from_cache(self) -> bool:
        """Try to load mask from disk cache."""
        if os.path.exists(self.cache_file):
            try:
                data = np.load(self.cache_file)
                self._mask = data['mask']
                self._lats = data['lats']
                self._lons = data['lons']
                self._loaded = True
                logger.info(f"✓ Loaded ocean mask from cache: {self.cache_file}")
                return True
            except Exception as e:
                logger.warning(f"Failed to load cache: {e}")
        return False
    
    def _save_to_cache(self):
        """Save mask to disk cache."""
        try:
            np.savez_compressed(
                self.cache_file,
                mask=self._mask,
                lats=self._lats,
                lons=self._lons
            )
            logger.info(f"✓ Saved ocean mask to cache: {self.cache_file}")
        except Exception as e:
            logger.warning(f"Failed to save cache: {e}")
    
    async def _fetch_etopo_data(self) -> Dict:
        """Fetch ETOPO1 bathymetry data from NOAA ERDDAP."""
        bbox = self.study_area
        
        # Build ERDDAP query with stride for efficiency
        stride = max(1, int(self.resolution / 0.0166))  # ETOPO is ~1 arc-min
        
        url = (
            f"{self.ERDDAP_URL}?"
            f"altitude[({bbox['lat_min']}):1:({bbox['lat_max']})]"
            f"[({bbox['lon_min']}):1:({bbox['lon_max']})]"
        )
        
        logger.info(f"→ Fetching ETOPO1 bathymetry for {self.study_area['name']}...")
        
        timeout = aiohttp.ClientTimeout(total=120)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    logger.info(f"✓ ETOPO1 data received")
                    return data
                else:
                    raise Exception(f"ERDDAP returned HTTP {response.status}")
    
    def _parse_etopo_response(self, data: Dict):
        """Parse ERDDAP JSON response into mask array."""
        table = data.get('table', {})
        column_names = table.get('columnNames', [])
        rows = table.get('rows', [])
        
        if not rows:
            raise Exception("No data in ETOPO response")
        
        # Extract data
        lat_idx = column_names.index('latitude')
        lon_idx = column_names.index('longitude')
        alt_idx = column_names.index('altitude')
        
        lats_set = set()
        lons_set = set()
        values_dict = {}
        
        for row in rows:
            lat = row[lat_idx]
            lon = row[lon_idx]
            alt = row[alt_idx]
            
            if lat is not None and lon is not None:
                lats_set.add(lat)
                lons_set.add(lon)
                values_dict[(lat, lon)] = alt if alt is not None else 0
        
        self._lats = np.array(sorted(lats_set))
        self._lons = np.array(sorted(lons_set))
        
        # Create altitude grid
        altitude_grid = np.zeros((len(self._lats), len(self._lons)))
        for (lat, lon), alt in values_dict.items():
            lat_i = np.searchsorted(self._lats, lat)
            lon_i = np.searchsorted(self._lons, lon)
            if lat_i < len(self._lats) and lon_i < len(self._lons):
                altitude_grid[lat_i, lon_i] = alt
        
        # Ocean mask: altitude < 0 = ocean (True)
        self._mask = altitude_grid < 0
        
        # Statistics
        ocean_pct = np.sum(self._mask) / self._mask.size * 100
        logger.info(f"✓ Ocean mask created: {self._mask.shape}, {ocean_pct:.1f}% ocean")
    
    async def load(self):
        """Load or fetch the ocean mask."""
        if self._loaded:
            return
        
        # Try cache first
        if self._load_from_cache():
            return
        
        # Fetch from ERDDAP
        try:
            data = await self._fetch_etopo_data()
            self._parse_etopo_response(data)
            self._save_to_cache()
            self._loaded = True
        except Exception as e:
            logger.error(f"✗ Failed to load ocean mask: {e}")
            raise
    
    def is_ocean(self, lat: float, lon: float) -> bool:
        """
        Check if a coordinate is in the ocean.
        
        Args:
            lat: Latitude in degrees
            lon: Longitude in degrees
            
        Returns:
            True if ocean, False if land
        """
        if not self._loaded or self._mask is None:
            raise RuntimeError("Ocean mask not loaded. Call load() first.")
        
        # Check bounds
        if (lat < self._lats[0] or lat > self._lats[-1] or
            lon < self._lons[0] or lon > self._lons[-1]):
            return False  # Out of study area
        
        # Find nearest grid cell
        lat_idx = np.abs(self._lats - lat).argmin()
        lon_idx = np.abs(self._lons - lon).argmin()
        
        return bool(self._mask[lat_idx, lon_idx])
    
    def filter_ocean_points(self, coordinates: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
        """
        Filter a list of coordinates to keep only ocean points.
        
        Args:
            coordinates: List of (lat, lon) tuples
            
        Returns:
            List of coordinates that are in the ocean
        """
        return [coord for coord in coordinates if self.is_ocean(coord[0], coord[1])]
    
    def get_study_area_bounds(self) -> Dict[str, float]:
        """Get the study area bounding box."""
        return self.study_area.copy()


def generate_background_points(
    n_points: int = 10000,
    study_area: str = DEFAULT_STUDY_AREA,
    mask: Optional[OceanMask] = None
) -> List[Tuple[float, float]]:
    """
    Generate TRUE pseudo-absence (background) points.
    
    This is the scientifically correct approach:
    1. Random uniform sampling within study area
    2. Filter through ocean mask (no land)
    3. No relation to presence points
    
    Args:
        n_points: Number of background points to generate
        study_area: Study area key
        mask: Optional pre-loaded OceanMask
        
    Returns:
        List of (lat, lon) tuples for background points
    """
    if mask is None:
        mask = OceanMask(study_area)
        asyncio.get_event_loop().run_until_complete(mask.load())
    
    bounds = mask.get_study_area_bounds()
    points = []
    attempts = 0
    max_attempts = n_points * 10  # Prevent infinite loop
    
    logger.info(f"→ Generating {n_points} background points in {bounds['name']}...")
    
    while len(points) < n_points and attempts < max_attempts:
        lat = np.random.uniform(bounds['lat_min'], bounds['lat_max'])
        lon = np.random.uniform(bounds['lon_min'], bounds['lon_max'])
        
        if mask.is_ocean(lat, lon):
            points.append((lat, lon))
        
        attempts += 1
    
    if len(points) < n_points:
        logger.warning(f"Only generated {len(points)}/{n_points} points (study area may have low ocean coverage)")
    
    logger.info(f"✓ Generated {len(points)} ocean background points")
    return points


# Convenience async function
async def get_ocean_mask(study_area: str = DEFAULT_STUDY_AREA) -> OceanMask:
    """Get a loaded ocean mask for the study area."""
    mask = OceanMask(study_area)
    await mask.load()
    return mask


# Test function
if __name__ == "__main__":
    async def test():
        print("Testing Ocean Mask...")
        
        mask = await get_ocean_mask('arabian_sea')
        
        # Test points
        test_coords = [
            (15.0, 70.0, "Arabian Sea (should be ocean)"),
            (20.0, 73.0, "Off Mumbai (should be ocean)"),
            (19.0, 72.8, "Mumbai city (should be land)"),
            (10.0, 76.0, "Kerala coast (should be ocean)"),
            (23.0, 68.0, "Gujarat coast (may vary)"),
        ]
        
        for lat, lon, desc in test_coords:
            is_ocean = mask.is_ocean(lat, lon)
            status = "🌊 Ocean" if is_ocean else "🏔️ Land"
            print(f"  {desc}: {status}")
        
        # Generate background
        bg_points = generate_background_points(100, mask=mask)
        print(f"\nGenerated {len(bg_points)} background points")
        print(f"Sample: {bg_points[:3]}")
    
    asyncio.run(test())
