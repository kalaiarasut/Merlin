# Database Module for AI Services
from .db_connector import (
    get_mongodb,
    get_postgresql,
    get_all_species,
    get_species_starting_with,
    get_species_ending_with,
    get_species_by_habitat,
    get_species_by_family,
    search_species,
    get_species_count,
    get_database_summary,
    get_oceanographic_summary,
    get_oceanographic_stats,
    test_connections,
    get_species_analytics,
    get_habitat_depth_analysis
)

__all__ = [
    'get_mongodb',
    'get_postgresql',
    'get_all_species',
    'get_species_starting_with',
    'get_species_ending_with',
    'get_species_by_habitat',
    'get_species_by_family',
    'search_species',
    'get_species_count',
    'get_database_summary',
    'get_oceanographic_summary',
    'get_oceanographic_stats',
    'test_connections',
    'get_species_analytics',
    'get_habitat_depth_analysis'
]
