"""
Database Connector Module
Connects AI service to MongoDB Atlas and PostgreSQL for real-time data queries.
"""

import os
import logging
from typing import Dict, List, Any, Optional
from pathlib import Path

# Load environment variables from .env file
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(env_path)

logger = logging.getLogger(__name__)


# ====================================
# MongoDB Atlas Connection
# ====================================

_mongo_client = None
_mongo_db = None


def get_mongodb():
    """Get MongoDB connection (lazy initialization with optimized settings)."""
    global _mongo_client, _mongo_db
    
    # Return cached connection if available
    if _mongo_db is not None:
        return _mongo_db
    
    try:
        from pymongo import MongoClient
        
        mongo_uri = os.getenv("MONGODB_URI")
        if not mongo_uri:
            logger.warning("MONGODB_URI not found in environment")
            return None
        
        # Create client with optimized timeout settings
        _mongo_client = MongoClient(
            mongo_uri,
            serverSelectionTimeoutMS=3000,  # 3 second server selection timeout
            connectTimeoutMS=3000,           # 3 second connect timeout
            socketTimeoutMS=5000,            # 5 second socket timeout
            maxPoolSize=10,                  # Connection pooling
            minPoolSize=1,
            retryWrites=True,
            retryReads=True
        )
        
        # Skip ping - just get database directly (ping adds 5-7 seconds)
        # The first actual query will verify the connection
        _mongo_db = _mongo_client.get_default_database()
        logger.info(f"✅ MongoDB connected: {_mongo_db.name}")
        return _mongo_db
        
    except Exception as e:
        logger.error(f"❌ MongoDB connection failed: {e}")
        return None


def close_mongodb():
    """Close MongoDB connection."""
    global _mongo_client, _mongo_db
    if _mongo_client:
        _mongo_client.close()
        _mongo_client = None
        _mongo_db = None


# ====================================
# PostgreSQL Connection
# ====================================

_pg_connection = None


def get_postgresql():
    """Get PostgreSQL connection (lazy initialization)."""
    global _pg_connection
    
    # Check if existing connection is still valid
    if _pg_connection is not None:
        try:
            # Rollback any stuck transaction
            _pg_connection.rollback()
            return _pg_connection
        except:
            # Connection is broken, reset it
            _pg_connection = None
    
    try:
        import psycopg2
        
        _pg_connection = psycopg2.connect(
            host=os.getenv("POSTGRES_HOST", "127.0.0.1"),
            port=os.getenv("POSTGRES_PORT", "5432"),
            database=os.getenv("POSTGRES_DB", "cmlre_marine"),
            user=os.getenv("POSTGRES_USER", "postgres"),
            password=os.getenv("POSTGRES_PASSWORD", "admin"),
            connect_timeout=5  # 5 second timeout
        )
        
        # Use autocommit to avoid transaction issues
        _pg_connection.autocommit = True
        
        logger.info("✅ PostgreSQL connected")
        return _pg_connection
        
    except Exception as e:
        logger.error(f"❌ PostgreSQL connection failed: {e}")
        return None


def close_postgresql():
    """Close PostgreSQL connection."""
    global _pg_connection
    if _pg_connection:
        _pg_connection.close()
        _pg_connection = None


# ====================================
# Species Query Functions (MongoDB)
# ====================================

def get_all_species() -> List[Dict]:
    """Get all species from MongoDB."""
    db = get_mongodb()
    if db is None:
        return []
    
    try:
        species = list(db.species.find({}, {
            'scientificName': 1,
            'commonName': 1,
            'family': 1,
            'habitat': 1,
            'conservationStatus': 1,
            'distribution': 1,
            'diet': 1,
            'characteristics': 1,
            'morphology': 1,
            'description': 1,
            '_id': 0
        }))
        
        # Remove duplicates by scientific name
        unique = {}
        for sp in species:
            sci_name = sp.get('scientificName', '')
            if sci_name and sci_name not in unique:
                unique[sci_name] = sp
        
        return list(unique.values())
    except Exception as e:
        logger.error(f"Error fetching species: {e}")
        return []


def get_species_starting_with(letter: str) -> List[Dict]:
    """Get species where scientific name starts with given letter."""
    db = get_mongodb()
    if db is None:
        return []
    
    try:
        letter = letter.upper()
        species = list(db.species.find(
            {'scientificName': {'$regex': f'^{letter}', '$options': 'i'}},
            {'scientificName': 1, 'commonName': 1, 'family': 1, 'habitat': 1, '_id': 0}
        ))
        
        # Remove duplicates
        unique = {sp.get('scientificName'): sp for sp in species if sp.get('scientificName')}
        return list(unique.values())
    except Exception as e:
        logger.error(f"Error fetching species starting with {letter}: {e}")
        return []


def get_species_ending_with(suffix: str) -> List[Dict]:
    """Get species where scientific name ends with given suffix."""
    db = get_mongodb()
    if db is None:
        return []
    
    try:
        species = list(db.species.find(
            {'scientificName': {'$regex': f'{suffix}$', '$options': 'i'}},
            {'scientificName': 1, 'commonName': 1, 'family': 1, 'habitat': 1, '_id': 0}
        ))
        
        unique = {sp.get('scientificName'): sp for sp in species if sp.get('scientificName')}
        return list(unique.values())
    except Exception as e:
        logger.error(f"Error fetching species ending with {suffix}: {e}")
        return []


def get_species_by_habitat(habitat: str) -> List[Dict]:
    """Get species by habitat type."""
    db = get_mongodb()
    if db is None:
        return []
    
    try:
        species = list(db.species.find(
            {'habitat': {'$regex': habitat, '$options': 'i'}},
            {'scientificName': 1, 'commonName': 1, 'family': 1, 'habitat': 1, '_id': 0}
        ))
        
        unique = {sp.get('scientificName'): sp for sp in species if sp.get('scientificName')}
        return list(unique.values())
    except Exception as e:
        logger.error(f"Error fetching species by habitat: {e}")
        return []


def get_species_by_family(family: str) -> List[Dict]:
    """Get species by taxonomic family."""
    db = get_mongodb()
    if db is None:
        return []
    
    try:
        species = list(db.species.find(
            {'family': {'$regex': family, '$options': 'i'}},
            {'scientificName': 1, 'commonName': 1, 'family': 1, 'habitat': 1, '_id': 0}
        ))
        
        unique = {sp.get('scientificName'): sp for sp in species if sp.get('scientificName')}
        return list(unique.values())
    except Exception as e:
        logger.error(f"Error fetching species by family: {e}")
        return []


def search_species(query: str) -> List[Dict]:
    """Full-text search for species."""
    db = get_mongodb()
    if db is None:
        return []
    
    try:
        # Try text search first
        species = list(db.species.find(
            {'$text': {'$search': query}},
            {'scientificName': 1, 'commonName': 1, 'family': 1, 'habitat': 1, '_id': 0}
        ).limit(20))
        
        # If no results, try regex
        if not species:
            species = list(db.species.find(
                {'$or': [
                    {'scientificName': {'$regex': query, '$options': 'i'}},
                    {'commonName': {'$regex': query, '$options': 'i'}}
                ]},
                {'scientificName': 1, 'commonName': 1, 'family': 1, 'habitat': 1, '_id': 0}
            ).limit(20))
        
        unique = {sp.get('scientificName'): sp for sp in species if sp.get('scientificName')}
        return list(unique.values())
    except Exception as e:
        logger.error(f"Error searching species: {e}")
        return []


def get_species_count() -> int:
    """Get total unique species count."""
    db = get_mongodb()
    if db is None:
        return 0
    
    try:
        # Get distinct scientific names
        distinct = db.species.distinct('scientificName')
        return len(distinct)
    except Exception as e:
        logger.error(f"Error counting species: {e}")
        return 0


def get_database_summary() -> Dict[str, Any]:
    """Get summary of database contents."""
    db = get_mongodb()
    
    is_connected = db is not None
    
    summary = {
        'connected': is_connected,
        'species_count': 0,
        'unique_species': [],
        'habitats': [],
        'families': []
    }
    
    if not db:
        return summary
    
    try:
        summary['species_count'] = get_species_count()
        
        # Get unique habitats
        summary['habitats'] = db.species.distinct('habitat')
        
        # Get unique families
        summary['families'] = db.species.distinct('family')
        
        # Get unique species list
        species = get_all_species()
        summary['unique_species'] = [
            {'scientificName': sp.get('scientificName'), 'commonName': sp.get('commonName')}
            for sp in species[:50]  # Limit to 50
        ]
        
    except Exception as e:
        logger.error(f"Error getting database summary: {e}")
    
    return summary

# ====================================
# Advanced Analytics Functions
# ====================================

def get_species_analytics() -> Dict[str, Any]:
    """Get comprehensive analytics for AI to answer complex questions."""
    db = get_mongodb()
    
    if db is None:
        return {'error': 'Database not connected'}
    
    analytics = {
        'total_species': 0,
        'habitat_distribution': {},
        'conservation_status': {},
        'geographic_distribution': {},
        'family_distribution': {},
        'depth_zones': {},
        'insights': []
    }
    
    try:
        species = get_all_species()
        analytics['total_species'] = len(species)
        
        # Habitat distribution (indicates depth zones)
        habitat_map = {
            'Deep sea': 'Deep (200m+)',
            'Pelagic': 'Open ocean (0-200m)',
            'Coral reefs': 'Shallow (0-30m)',
            'Coastal waters': 'Coastal (0-50m)',
            'Coastal': 'Coastal (0-50m)'
        }
        
        for sp in species:
            habitat = sp.get('habitat', 'Unknown')
            analytics['habitat_distribution'][habitat] = analytics['habitat_distribution'].get(habitat, 0) + 1
            
            # Map to depth zones
            depth_zone = habitat_map.get(habitat, 'Variable')
            analytics['depth_zones'][depth_zone] = analytics['depth_zones'].get(depth_zone, 0) + 1
            
            # Conservation status
            status = sp.get('conservationStatus', 'Unknown')
            analytics['conservation_status'][status] = analytics['conservation_status'].get(status, 0) + 1
            
            # Family distribution
            family = sp.get('family', 'Unknown')
            analytics['family_distribution'][family] = analytics['family_distribution'].get(family, 0) + 1
            
            # Geographic distribution
            for region in sp.get('distribution', []):
                analytics['geographic_distribution'][region] = analytics['geographic_distribution'].get(region, 0) + 1
        
        # Generate insights
        most_common_habitat = max(analytics['habitat_distribution'].items(), key=lambda x: x[1]) if analytics['habitat_distribution'] else ('Unknown', 0)
        most_common_depth = max(analytics['depth_zones'].items(), key=lambda x: x[1]) if analytics['depth_zones'] else ('Unknown', 0)
        most_common_region = max(analytics['geographic_distribution'].items(), key=lambda x: x[1]) if analytics['geographic_distribution'] else ('Unknown', 0)
        
        analytics['insights'] = [
            f"Most common habitat: {most_common_habitat[0]} ({most_common_habitat[1]} species)",
            f"Most common depth zone: {most_common_depth[0]} ({most_common_depth[1]} species)",
            f"Most species found in: {most_common_region[0]} ({most_common_region[1]} species)",
            f"Total families represented: {len(analytics['family_distribution'])}"
        ]
        
    except Exception as e:
        logger.error(f"Error getting species analytics: {e}")
        analytics['error'] = str(e)
    
    return analytics


def get_habitat_depth_analysis() -> str:
    """Get analysis of species depth distribution for LLM context."""
    analytics = get_species_analytics()
    
    if 'error' in analytics:
        return f"Error: {analytics['error']}"
    
    analysis = "\n=== DEPTH/HABITAT ANALYSIS ===\n"
    analysis += f"Total species: {analytics['total_species']}\n\n"
    
    analysis += "Habitat Distribution:\n"
    for habitat, count in sorted(analytics['habitat_distribution'].items(), key=lambda x: -x[1]):
        analysis += f"  - {habitat}: {count} species\n"
    
    analysis += "\nDepth Zones:\n"
    for zone, count in sorted(analytics['depth_zones'].items(), key=lambda x: -x[1]):
        analysis += f"  - {zone}: {count} species\n"
    
    analysis += "\nGeographic Distribution:\n"
    for region, count in sorted(analytics['geographic_distribution'].items(), key=lambda x: -x[1]):
        analysis += f"  - {region}: {count} species\n"
    
    analysis += "\nKey Insights:\n"
    for insight in analytics['insights']:
        analysis += f"  • {insight}\n"
    
    return analysis



def get_oceanographic_summary() -> Dict[str, Any]:
    """Get summary of oceanographic data."""
    conn = get_postgresql()
    if not conn:
        return {'connected': False, 'record_count': 0}
    
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM oceanographic_data")
        count = cursor.fetchone()[0]
        
        cursor.execute("SELECT DISTINCT parameter FROM oceanographic_data LIMIT 20")
        parameters = [row[0] for row in cursor.fetchall()]
        
        cursor.close()
        
        return {
            'connected': True,
            'record_count': count,
            'parameters': parameters
        }
    except Exception as e:
        logger.error(f"Error getting oceanographic summary: {e}")
        return {'connected': False, 'error': str(e)}


def get_oceanographic_stats() -> Dict[str, Any]:
    """Get detailed oceanographic statistics for LLM context."""
    conn = get_postgresql()
    if not conn:
        return {}
    
    stats = {}
    
    try:
        cursor = conn.cursor()
        
        # Try to get temperature range
        try:
            cursor.execute("""
                SELECT MIN(value), MAX(value), AVG(value) 
                FROM oceanographic_data 
                WHERE parameter ILIKE '%temperature%'
            """)
            row = cursor.fetchone()
            if row and row[0] is not None:
                stats['temperature_range'] = f"{row[0]:.1f}°C - {row[1]:.1f}°C (avg: {row[2]:.1f}°C)"
        except:
            pass
        
        # Try to get salinity range
        try:
            cursor.execute("""
                SELECT MIN(value), MAX(value), AVG(value) 
                FROM oceanographic_data 
                WHERE parameter ILIKE '%salinity%'
            """)
            row = cursor.fetchone()
            if row and row[0] is not None:
                stats['salinity_range'] = f"{row[0]:.1f} - {row[1]:.1f} PSU (avg: {row[2]:.1f})"
        except:
            pass
        
        # Try to get depth range
        try:
            cursor.execute("""
                SELECT MIN(depth), MAX(depth) 
                FROM oceanographic_data 
                WHERE depth IS NOT NULL
            """)
            row = cursor.fetchone()
            if row and row[0] is not None:
                stats['depth_range'] = f"{row[0]:.0f}m - {row[1]:.0f}m"
        except:
            pass
        
        # Try to get unique locations
        try:
            cursor.execute("""
                SELECT DISTINCT station_name 
                FROM oceanographic_data 
                WHERE station_name IS NOT NULL 
                LIMIT 50
            """)
            locations = [row[0] for row in cursor.fetchall()]
            if locations:
                stats['locations'] = locations
        except:
            pass
        
        cursor.close()
        
    except Exception as e:
        logger.error(f"Error getting oceanographic stats: {e}")
    
    return stats


# ====================================
# Test Connection Function
# ====================================

def test_connections() -> Dict[str, bool]:
    """Test all database connections."""
    results = {
        'mongodb': False,
        'postgresql': False
    }
    
    # Test MongoDB
    db = get_mongodb()
    if db is not None:
        results['mongodb'] = True
    
    # Test PostgreSQL
    pg = get_postgresql()
    if pg is not None:
        results['postgresql'] = True
    
    return results


if __name__ == "__main__":
    # Test the connections
    logging.basicConfig(level=logging.INFO)
    print("Testing database connections...")
    
    results = test_connections()
    print(f"MongoDB: {'✅ Connected' if results['mongodb'] else '❌ Failed'}")
    print(f"PostgreSQL: {'✅ Connected' if results['postgresql'] else '❌ Failed'}")
    
    if results['mongodb']:
        summary = get_database_summary()
        print(f"\nMongoDB Summary:")
        print(f"  Species count: {summary['species_count']}")
        print(f"  Habitats: {summary['habitats']}")
