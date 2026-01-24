"""
Data Connectors Package

Real-time oceanographic data from:
- INCOIS: Indian buoys, Argo floats
- Copernicus Marine: Satellite SST, chlorophyll, salinity, dissolved oxygen
- GEBCO/ETOPO: Bathymetry (via NOAA ERDDAP)
- VIIRS: Chlorophyll-a (via NOAA CoastWatch ERDDAP)
"""

from .incois_connector import INCOISConnector, fetch_incois_data
from .copernicus_connector import CopernicusConnector, fetch_copernicus_data
from .environmental_data_service import (
    EnvironmentalDataService,
    EnvironmentalPoint,
    get_environmental_data_for_coordinates
)

__all__ = [
    "INCOISConnector",
    "CopernicusConnector", 
    "fetch_incois_data",
    "fetch_copernicus_data",
    "EnvironmentalDataService",
    "EnvironmentalPoint",
    "get_environmental_data_for_coordinates"
]
