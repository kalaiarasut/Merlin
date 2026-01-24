"""
Copernicus Marine Service

Real data fetching for Dissolved Oxygen and pH from Copernicus Marine Service.

Product: GLOBAL_ANALYSISFORECAST_BGC_001_028
Variables: o2 (dissolved oxygen), ph

Requires: pip install copernicusmarine
"""

import os
import json
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

# Try to import copernicusmarine
try:
    import copernicusmarine as cm
    COPERNICUS_AVAILABLE = True
except ImportError:
    COPERNICUS_AVAILABLE = False
    logger.warning("copernicusmarine not installed. Run: pip install copernicusmarine")

# Cache for Copernicus data
_copernicus_cache: Dict[str, dict] = {}
_cache_ttl = 24 * 60 * 60  # 24 hours (monthly data)

# Copernicus product details
# BIO dataset contains: dissolved oxygen (o2)
# The correct dataset ID format is: cmems_mod_glo_bgc-bio_anfc_0.25deg_P1D-m
PRODUCT_ID = "GLOBAL_ANALYSISFORECAST_BGC_001_028"
DATASET_ID_BIO = "cmems_mod_glo_bgc-bio_anfc_0.25deg_P1D-m"  # Contains o2
DATASET_ID_CAR = "cmems_mod_glo_bgc-car_anfc_0.25deg_P1D-m"  # Contains pH

# Indian Ocean bounds
INDIAN_OCEAN_BOUNDS = {
    "lat_min": -15,
    "lat_max": 25,
    "lon_min": 50,
    "lon_max": 100,
}

# Unit conversion: mmol/m³ → mg/L for O2
MMOL_TO_MG_L = 0.032


def get_cache_key(parameter: str, depth: int) -> str:
    """Generate cache key"""
    return f"copernicus_{parameter}_{depth}"


def is_cached(key: str) -> bool:
    """Check if data is cached and not expired"""
    if key in _copernicus_cache:
        entry = _copernicus_cache[key]
        age = (datetime.now() - entry["timestamp"]).total_seconds()
        return age < _cache_ttl
    return False


def get_cached(key: str) -> Optional[dict]:
    """Get cached data if valid"""
    if is_cached(key):
        return _copernicus_cache[key]["data"]
    return None


def set_cached(key: str, data: dict):
    """Cache data"""
    _copernicus_cache[key] = {
        "data": data,
        "timestamp": datetime.now()
    }


async def fetch_dissolved_oxygen(
    bounds: Optional[dict] = None,
    depth: int = 0,
    stride: int = 5
) -> dict:
    """
    Fetch real Dissolved Oxygen data from Copernicus Marine Service.
    
    Args:
        bounds: Geographic bounds (lat_min, lat_max, lon_min, lon_max)
        depth: Depth level (0 = surface)
        stride: Sampling stride for grid
    
    Returns:
        CopernicusResponse with real data
    """
    bounds = bounds or INDIAN_OCEAN_BOUNDS
    cache_key = get_cache_key("dissolved_oxygen", depth)
    
    # Check cache first
    cached = get_cached(cache_key)
    if cached:
        logger.info(f"Returning cached DO data")
        return cached
    
    if not COPERNICUS_AVAILABLE:
        return _get_error_response("dissolved_oxygen", "mg/L", depth, 
                                   "copernicusmarine package not installed")
    
    try:
        # Get credentials from environment
        username = os.getenv("COPERNICUS_USERNAME")
        password = os.getenv("COPERNICUS_PASSWORD")
        
        if not username or not password:
            return _get_error_response("dissolved_oxygen", "mg/L", depth,
                                       "Copernicus credentials not found in .env")
        
        logger.info(f"Fetching real DO data from Copernicus...")
        
        # Calculate date range (last 7 days for recent data)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)
        
        # Open dataset using Copernicus Marine Toolbox
        ds = cm.open_dataset(
            dataset_id=DATASET_ID_BIO,  # BIO dataset contains o2
            minimum_latitude=bounds["lat_min"],
            maximum_latitude=bounds["lat_max"],
            minimum_longitude=bounds["lon_min"],
            maximum_longitude=bounds["lon_max"],
            start_datetime=start_date.strftime("%Y-%m-%d"),
            end_datetime=end_date.strftime("%Y-%m-%d"),
            variables=["o2"],
            username=username,
            password=password
        )
        
        # Extract data at surface (first depth level)
        if "depth" in ds.dims:
            ds = ds.isel(depth=0)
        
        # Get the most recent time slice
        if "time" in ds.dims:
            ds = ds.isel(time=-1)
        
        # Convert to data points with stride
        o2_data = ds["o2"].values
        lats = ds["latitude"].values
        lons = ds["longitude"].values
        
        data_points = []
        timestamp = datetime.now().isoformat()
        
        for i in range(0, len(lats), stride):
            for j in range(0, len(lons), stride):
                if i < len(lats) and j < len(lons):
                    value = float(o2_data[i, j])
                    if not (value != value):  # Check for NaN
                        # Convert mmol/m³ to mg/L
                        value_mg_l = value * MMOL_TO_MG_L
                        data_points.append({
                            "latitude": float(lats[i]),
                            "longitude": float(lons[j]),
                            "value": round(value_mg_l, 2),
                            "depth": depth,
                            "time": timestamp,
                            "parameter": "dissolved_oxygen",
                            "unit": "mg/L",
                            "source": "Copernicus",
                            "dataType": "modeled"
                        })
        
        ds.close()
        
        result = {
            "success": True,
            "parameter": "dissolved_oxygen",
            "primarySource": "Copernicus model",
            "secondarySource": "Argo in-situ",
            "spatialCoverage": "global",
            "temporalResolution": "daily",
            "measurementType": ["modeled"],
            "validationSource": "Argo in-situ",
            "verticalReference": "surface (0-5 m)" if depth == 0 else f"{depth}m depth",
            "unit": "mg/L",
            "data": data_points,
            "metadata": {
                "productId": PRODUCT_ID,
                "attribution": "E.U. Copernicus Marine Service Information",
                "lastUpdated": timestamp,
                "depthLevel": depth,
                "dataCount": len(data_points)
            }
        }
        
        set_cached(cache_key, result)
        logger.info(f"Fetched {len(data_points)} real DO data points from Copernicus")
        return result
        
    except Exception as e:
        logger.error(f"Copernicus DO fetch error: {str(e)}")
        return _get_error_response("dissolved_oxygen", "mg/L", depth, str(e))


async def fetch_ph(
    bounds: Optional[dict] = None,
    depth: int = 0,
    stride: int = 5
) -> dict:
    """
    Fetch real pH data from Copernicus Marine Service.
    """
    bounds = bounds or INDIAN_OCEAN_BOUNDS
    cache_key = get_cache_key("ph", depth)
    
    cached = get_cached(cache_key)
    if cached:
        logger.info(f"Returning cached pH data")
        return cached
    
    if not COPERNICUS_AVAILABLE:
        return _get_error_response("ph", "pH units", depth,
                                   "copernicusmarine package not installed")
    
    try:
        username = os.getenv("COPERNICUS_USERNAME")
        password = os.getenv("COPERNICUS_PASSWORD")
        
        if not username or not password:
            return _get_error_response("ph", "pH units", depth,
                                       "Copernicus credentials not found in .env")
        
        logger.info(f"Fetching real pH data from Copernicus...")
        
        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)
        
        ds = cm.open_dataset(
            dataset_id=DATASET_ID_CAR,  # CAR dataset contains pH
            minimum_latitude=bounds["lat_min"],
            maximum_latitude=bounds["lat_max"],
            minimum_longitude=bounds["lon_min"],
            maximum_longitude=bounds["lon_max"],
            start_datetime=start_date.strftime("%Y-%m-%d"),
            end_datetime=end_date.strftime("%Y-%m-%d"),
            variables=["ph"],
            username=username,
            password=password
        )
        
        if "depth" in ds.dims:
            ds = ds.isel(depth=0)
        if "time" in ds.dims:
            ds = ds.isel(time=-1)
        
        ph_data = ds["ph"].values
        lats = ds["latitude"].values
        lons = ds["longitude"].values
        
        data_points = []
        timestamp = datetime.now().isoformat()
        
        for i in range(0, len(lats), stride):
            for j in range(0, len(lons), stride):
                if i < len(lats) and j < len(lons):
                    value = float(ph_data[i, j])
                    if not (value != value):  # Check for NaN
                        data_points.append({
                            "latitude": float(lats[i]),
                            "longitude": float(lons[j]),
                            "value": round(value, 2),
                            "depth": depth,
                            "time": timestamp,
                            "parameter": "ph",
                            "unit": "pH units",
                            "source": "Copernicus",
                            "dataType": "modeled"
                        })
        
        ds.close()
        
        result = {
            "success": True,
            "parameter": "ph",
            "primarySource": "Copernicus model",
            "secondarySource": "Argo in-situ",
            "spatialCoverage": "global",
            "temporalResolution": "daily",
            "measurementType": ["modeled"],
            "validationSource": "Argo in-situ",
            "verticalReference": "surface (0-5 m)" if depth == 0 else f"{depth}m depth",
            "unit": "pH units",
            "data": data_points,
            "metadata": {
                "productId": PRODUCT_ID,
                "attribution": "E.U. Copernicus Marine Service Information",
                "lastUpdated": timestamp,
                "depthLevel": depth,
                "dataCount": len(data_points)
            }
        }
        
        set_cached(cache_key, result)
        logger.info(f"Fetched {len(data_points)} real pH data points from Copernicus")
        return result
        
    except Exception as e:
        logger.error(f"Copernicus pH fetch error: {str(e)}")
        return _get_error_response("ph", "pH units", depth, str(e))


def _get_error_response(parameter: str, unit: str, depth: int, error: str) -> dict:
    """Generate error response"""
    return {
        "success": False,
        "parameter": parameter,
        "primarySource": "Copernicus model",
        "secondarySource": "Argo in-situ",
        "spatialCoverage": "global",
        "temporalResolution": "daily",
        "measurementType": ["modeled"],
        "validationSource": "Argo in-situ",
        "verticalReference": "surface (0-5 m)" if depth == 0 else f"{depth}m depth",
        "unit": unit,
        "data": [],
        "error": error,
        "metadata": {
            "productId": PRODUCT_ID,
            "attribution": "E.U. Copernicus Marine Service Information",
            "lastUpdated": "unavailable",
            "depthLevel": depth
        }
    }


def check_copernicus_status() -> dict:
    """Check Copernicus Marine Service connection status"""
    username = os.getenv("COPERNICUS_USERNAME")
    password = os.getenv("COPERNICUS_PASSWORD")
    
    return {
        "package_installed": COPERNICUS_AVAILABLE,
        "credentials_configured": bool(username and password),
        "product_id": PRODUCT_ID,
        "variables": ["o2 (dissolved oxygen)", "ph"],
        "cache_entries": len(_copernicus_cache)
    }
