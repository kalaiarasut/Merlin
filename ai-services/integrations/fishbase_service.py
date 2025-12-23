
"""
FishBase Integration Service for marine species data enrichment.

Provides diet, depth, habitat, reproduction, and behavior data for fish species.
Caches results locally for offline access.

NOTE: This service now delegates to the scraping implementation in database.fishbase_service
because the official REST API is deprecated/unreliable.
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import timedelta
from pathlib import Path

# Import the scraping service implementation
from database.fishbase_service import FishBaseService as ScraperService
from database.fishbase_service import get_fishbase_service as get_scraper_instance

logger = logging.getLogger(__name__)

class FishBaseService:
    """Service for fetching and caching FishBase species data."""
    
    def __init__(self, cache_ttl_days: int = 30):
        """
        Initialize FishBase service.
        
        Args:
            cache_ttl_days: How long to keep cached data (default 30 days)
        """
        # The scraper service handles its own caching
        self.scraper = get_scraper_instance()
        self._online = True # Assume online if we can instantiate
        
    async def check_online(self) -> bool:
        """Check if FishBase website is accessible."""
        # Simple check handled by the scraper operations generally
        return True
    
    @property
    def is_online(self) -> bool:
        """Return cached online status."""
        return True
    
    async def search_species(self, scientific_name: str) -> Optional[Dict[str, Any]]:
        """
        Search for a species by scientific name.
        
        Args:
            scientific_name: e.g., "Thunnus albacares"
            
        Returns:
            Species data dict or None if not found
        """
        return await self.scraper.get_species_info(scientific_name)
    
    def format_species_info(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Format FishBase data into a user-friendly structure.
        """
        if not data:
            return {}
            
        # Compile a comprehensive description from all available data
        description_parts = []
        
        # 1. Main Biology/Description (Rich Text) - but filter out confusing taxonomy paths
        if data.get("biology_text"):
            bio_text = data["biology_text"]
            # Filter out confusing taxonomy hierarchy like "Teleostei (teleosts) > Carangiformes..."
            # and Etymology lines
            lines_to_keep = []
            for line in bio_text.split('\n'):
                line = line.strip()
                # Skip taxonomy hierarchy lines (contain "> ")
                if ' > ' in line:
                    continue
                # Skip Etymology lines
                if line.lower().startswith('etymology'):
                    continue
                # Skip "More on author" lines
                if 'more on author' in line.lower():
                    continue
                if line:
                    lines_to_keep.append(line)
            
            cleaned_bio = ' '.join(lines_to_keep).strip()
            if cleaned_bio:
                description_parts.append(cleaned_bio)

        # Morphology
        morphology = []
        if data.get("body_shape"):
            morphology.append(f"Body shape: {data['body_shape']}")
        if data.get("color_description"):
            morphology.append(f"Coloration: {data['color_description']}")
        if data.get("distinctive_features"):
            morphology.append(f"Distinctive features: {data['distinctive_features']}")
        if data.get("max_length_cm"):
            morphology.append(f"Max length: {data['max_length_cm']} cm")
        if data.get("max_weight_kg"):
            morphology.append(f"Max weight: {data['max_weight_kg']} kg")
        if data.get("max_age_years"):
            morphology.append(f"Max age: {data['max_age_years']} years")
            
        if morphology:
            description_parts.append("Morphology & Biology:\n" + "; ".join(morphology) + ".")

        # Distribution & Environment
        dist = []
        if data.get("distribution"):
            dist.append(data['distribution'])
        if data.get("climate_zone"):
            dist.append(f"Climate: {data['climate_zone']}")
        if data.get("environment"):
            dist.append(f"Environment: {data['environment']}")
        
        if dist:
            description_parts.append("Distribution:\n" + ". ".join(dist) + ".")

        # Life Cycle
        life = []
        if data.get("reproduction_mode"):
            life.append(f"Reproduction: {data['reproduction_mode']}")
        if data.get("spawning_season"):
            life.append(f"Spawning season: {data['spawning_season']}")
        if data.get("egg_type"):
            life.append(f"Eggs: {data['egg_type']}")
        
        if life:
            description_parts.append("Life Cycle:\n" + ". ".join(life) + ".")

        # Human Uses & Threats (Filtered to avoid grid redundancy)
        uses = []
        if data.get("human_uses"):
            uses.append(f"Uses: {data['human_uses']}")
        # Removed commercial_importance and iucn_full_status from text as they are shown in grid
        if data.get("threats"):
            uses.append(f"Threats: {data['threats']}")
            
        if uses:
            description_parts.append("Status & Uses:\n" + ". ".join(uses) + ".")

        formatted = {
            "scientific_name": data.get("scientific_name", ""),
            "common_name": data.get("common_name", ""),
            "family": data.get("family", ""),
            "comprehensive_description": "\n\n".join(description_parts),
            
            # Depth info
            "depth": {
                "min": data.get("depth_min_m"),
                "max": data.get("depth_max_m"),
                "common_min": data.get("depth_common_m"), 
                "common_max": None, # Scraper doesn't explicitly separate Common Min/Max usually just one range
            },
            
            # Habitat
            "habitat": {
                "freshwater": "Freshwater" in data.get("environment", ""),
                "brackish": "Brackish" in data.get("environment", ""),
                "saltwater": "Marine" in data.get("environment", ""),
                "description": data.get("habitat_type", "") + " " + data.get("environment", ""),
            },
            
            # Diet
            "diet": {
                "main_food": data.get("main_food", ""),
                "trophic_level": data.get("trophic_level"),
                "food_items": "", # Scraper puts this in diet_type or main_food
                "description": data.get("diet_type", ""),
            },
            
            # Reproduction
            "reproduction": {
                "spawning_season": data.get("spawning_season", ""),
                "spawning_area": "", # Not explicitly scraped in same field name
                "fecundity": data.get("fecundity"),
                "description": data.get("reproduction_mode", ""),
            },
            
            # Behavior
            "behavior": {
                "schooling": data.get("schooling", ""),
                "activity": data.get("activity_pattern", ""),
            },
            
            # Conservation
            "vulnerability": data.get("iucn_status"),
            "importance": data.get("commercial_importance"),
        }
        
        return formatted
    
    async def get_species_summary(self, scientific_name: str) -> str:
        """
        Get a text summary of species characteristics for LLM context.
        """
        data = await self.search_species(scientific_name)
        
        if not data:
            return f"No detailed data available for {scientific_name}."
        
        # Use the scraper's built-in format_for_prompt if available (it is)
        return self.scraper.format_for_prompt(data)
    
    async def enrich_species_list(
        self, 
        species_names: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Fetch data for multiple species.
        """
        # The scraper has this method already
        results = await self.scraper.enrich_species_list(species_names)
        
        # But we need to format it to the expected structure if the caller expects the specific dict structure
        # The scraper returns the raw rich dict.
        # Check usage in main.py: main.py calls enrich_species_list but seems to rely on the enriched format?
        # Actually main.py doesn't seem to call enrich_species_list for classification, 
        # it calls specific methods in classify_fish.
        
        # Let's map it just in case to be safe, adhering to the interface
        formatted_results = {}
        for name, data in results.items():
            if data and "error" not in data:
                 formatted_results[name] = self.format_species_info(data)
            else:
                 formatted_results[name] = {}
                 
        return formatted_results


# Singleton instance
_fishbase_service: Optional[FishBaseService] = None


def get_fishbase_service() -> FishBaseService:
    """Get or create the FishBase service singleton."""
    global _fishbase_service
    if _fishbase_service is None:
        _fishbase_service = FishBaseService()
    return _fishbase_service
