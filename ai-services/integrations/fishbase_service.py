"""
FishBase API Service for marine species data enrichment.

Provides diet, depth, habitat, reproduction, and behavior data for fish species.
Caches results locally for offline access.
"""

import os
import json
import httpx
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

# FishBase API base URL (rOpenSci mirror)
FISHBASE_API_URL = "https://fishbase.ropensci.org"

# Cache directory
CACHE_DIR = Path(__file__).parent.parent / "cache" / "fishbase"


class FishBaseService:
    """Service for fetching and caching FishBase species data."""
    
    def __init__(self, cache_ttl_days: int = 30):
        """
        Initialize FishBase service.
        
        Args:
            cache_ttl_days: How long to keep cached data (default 30 days)
        """
        self.cache_ttl = timedelta(days=cache_ttl_days)
        self.cache_dir = CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._online = None
        
    def _get_cache_path(self, species_name: str) -> Path:
        """Get cache file path for a species."""
        safe_name = species_name.lower().replace(" ", "_").replace(".", "")
        return self.cache_dir / f"{safe_name}.json"
    
    def _is_cache_valid(self, cache_path: Path) -> bool:
        """Check if cache file exists and is not expired."""
        if not cache_path.exists():
            return False
        
        modified_time = datetime.fromtimestamp(cache_path.stat().st_mtime)
        return datetime.now() - modified_time < self.cache_ttl
    
    def _load_from_cache(self, species_name: str) -> Optional[Dict[str, Any]]:
        """Load species data from cache."""
        cache_path = self._get_cache_path(species_name)
        
        if self._is_cache_valid(cache_path):
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    logger.debug(f"Loaded {species_name} from cache")
                    return data
            except Exception as e:
                logger.warning(f"Failed to load cache for {species_name}: {e}")
        
        return None
    
    def _save_to_cache(self, species_name: str, data: Dict[str, Any]) -> None:
        """Save species data to cache."""
        cache_path = self._get_cache_path(species_name)
        
        try:
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, default=str)
            logger.debug(f"Cached data for {species_name}")
        except Exception as e:
            logger.warning(f"Failed to cache {species_name}: {e}")
    
    async def check_online(self) -> bool:
        """Check if FishBase API is accessible."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{FISHBASE_API_URL}/heartbeat")
                self._online = response.status_code == 200
        except Exception:
            self._online = False
        
        return self._online
    
    @property
    def is_online(self) -> bool:
        """Return cached online status."""
        return self._online if self._online is not None else False
    
    async def search_species(self, scientific_name: str) -> Optional[Dict[str, Any]]:
        """
        Search for a species by scientific name.
        
        Uses a two-tier cache:
        1. Redis (L1) - fast, 24 hour TTL
        2. File (L2) - persistent, 30 day TTL
        
        Args:
            scientific_name: e.g., "Thunnus albacares"
            
        Returns:
            Species data dict or None if not found
        """
        from utils.redis_cache import cache_get, cache_set
        
        # L1: Check Redis cache first (fastest)
        redis_key = f"fishbase:{scientific_name.lower().replace(' ', '_')}"
        cached_redis = cache_get(redis_key)
        if cached_redis:
            logger.debug(f"FishBase Redis cache hit: {scientific_name}")
            return cached_redis
        
        # L2: Check file cache
        cached_file = self._load_from_cache(scientific_name)
        if cached_file:
            # Populate Redis for next time
            cache_set(redis_key, cached_file, ttl_seconds=86400)  # 24 hours
            return cached_file
        
        # Try to fetch from API
        try:
            genus, species = scientific_name.split(" ", 1)
        except ValueError:
            logger.warning(f"Invalid species name format: {scientific_name}")
            return None
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Search for the species
                response = await client.get(
                    f"{FISHBASE_API_URL}/species",
                    params={"Genus": genus, "Species": species}
                )
                
                if response.status_code != 200:
                    logger.warning(f"FishBase API error: {response.status_code}")
                    return None
                
                data = response.json()
                if not data.get("data"):
                    logger.info(f"Species not found in FishBase: {scientific_name}")
                    return None
                
                species_data = data["data"][0]
                
                # Fetch additional details
                spec_code = species_data.get("SpecCode")
                if spec_code:
                    enriched = await self._fetch_species_details(client, spec_code)
                    species_data.update(enriched)
                
                # Cache the result in both tiers
                self._save_to_cache(scientific_name, species_data)  # L2: File
                cache_set(redis_key, species_data, ttl_seconds=86400)  # L1: Redis (24 hours)
                
                return species_data
                
        except Exception as e:
            logger.error(f"Error fetching {scientific_name} from FishBase: {e}")
            return None

    
    async def _fetch_species_details(
        self, 
        client: httpx.AsyncClient, 
        spec_code: int
    ) -> Dict[str, Any]:
        """Fetch additional species details from various FishBase endpoints."""
        details = {}
        
        endpoints = {
            "ecology": f"/ecology?SpecCode={spec_code}",
            "reproduction": f"/reproduc?SpecCode={spec_code}",
            "diet": f"/diet?SpecCode={spec_code}",
        }
        
        for key, endpoint in endpoints.items():
            try:
                response = await client.get(f"{FISHBASE_API_URL}{endpoint}")
                if response.status_code == 200:
                    data = response.json()
                    if data.get("data"):
                        details[key] = data["data"][0] if len(data["data"]) == 1 else data["data"]
            except Exception as e:
                logger.debug(f"Failed to fetch {key} for SpecCode {spec_code}: {e}")
        
        return details
    
    def format_species_info(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Format FishBase data into a user-friendly structure.
        
        Returns dict with: diet, depth, habitat, behavior, reproduction
        """
        if not data:
            return {}
        
        formatted = {
            "scientific_name": f"{data.get('Genus', '')} {data.get('Species', '')}".strip(),
            "common_name": data.get("FBname", ""),
            "family": data.get("Family", ""),
            
            # Depth info
            "depth": {
                "min": data.get("DepthRangeShallow"),
                "max": data.get("DepthRangeDeep"),
                "common_min": data.get("DepthRangeComShallow"),
                "common_max": data.get("DepthRangeComDeep"),
            },
            
            # Habitat
            "habitat": {
                "freshwater": data.get("Fresh", 0) == 1,
                "brackish": data.get("Brack", 0) == 1,
                "saltwater": data.get("Saltwater", 0) == 1,
                "description": data.get("ecology", {}).get("Habitat", "") if isinstance(data.get("ecology"), dict) else "",
            },
            
            # Diet
            "diet": self._format_diet(data.get("diet", {})),
            
            # Reproduction
            "reproduction": self._format_reproduction(data.get("reproduction", {})),
            
            # Behavior
            "behavior": {
                "schooling": data.get("ecology", {}).get("Schooling", "") if isinstance(data.get("ecology"), dict) else "",
                "activity": data.get("ecology", {}).get("Activity", "") if isinstance(data.get("ecology"), dict) else "",
            },
            
            # Conservation
            "vulnerability": data.get("Vulnerability"),
            "importance": data.get("Importance"),
        }
        
        return formatted
    
    def _format_diet(self, diet_data: Any) -> Dict[str, Any]:
        """Format diet information."""
        if not diet_data:
            return {"description": "Unknown"}
        
        if isinstance(diet_data, list):
            diet_data = diet_data[0] if diet_data else {}
        
        return {
            "main_food": diet_data.get("MainFood", ""),
            "trophic_level": diet_data.get("Troph"),
            "food_items": diet_data.get("FoodI", ""),
            "description": diet_data.get("DietRemark", ""),
        }
    
    def _format_reproduction(self, repro_data: Any) -> Dict[str, Any]:
        """Format reproduction information."""
        if not repro_data:
            return {"description": "Unknown"}
        
        if isinstance(repro_data, list):
            repro_data = repro_data[0] if repro_data else {}
        
        return {
            "spawning_season": repro_data.get("ReproSeasonMin", ""),
            "spawning_area": repro_data.get("RepAreas", ""),
            "fecundity": repro_data.get("Fecundity"),
            "description": repro_data.get("ReproduceRefNo", ""),
        }
    
    async def get_species_summary(self, scientific_name: str) -> str:
        """
        Get a text summary of species characteristics for LLM context.
        
        Args:
            scientific_name: e.g., "Thunnus albacares"
            
        Returns:
            Formatted text summary
        """
        data = await self.search_species(scientific_name)
        
        if not data:
            return f"No detailed data available for {scientific_name}."
        
        info = self.format_species_info(data)
        
        parts = [f"**{info['scientific_name']}** ({info['common_name']})"]
        parts.append(f"Family: {info['family']}")
        
        # Depth
        depth = info.get("depth", {})
        if depth.get("min") or depth.get("max"):
            parts.append(f"Depth range: {depth.get('min', '?')} - {depth.get('max', '?')} meters")
        
        # Habitat
        habitat = info.get("habitat", {})
        env = []
        if habitat.get("freshwater"):
            env.append("freshwater")
        if habitat.get("brackish"):
            env.append("brackish")
        if habitat.get("saltwater"):
            env.append("saltwater")
        if env:
            parts.append(f"Environment: {', '.join(env)}")
        if habitat.get("description"):
            parts.append(f"Habitat: {habitat['description']}")
        
        # Diet
        diet = info.get("diet", {})
        if diet.get("main_food"):
            parts.append(f"Diet: {diet['main_food']}")
        if diet.get("trophic_level"):
            parts.append(f"Trophic level: {diet['trophic_level']}")
        
        # Behavior
        behavior = info.get("behavior", {})
        if behavior.get("schooling"):
            parts.append(f"Schooling behavior: {behavior['schooling']}")
        
        # Reproduction
        repro = info.get("reproduction", {})
        if repro.get("spawning_season"):
            parts.append(f"Spawning season: {repro['spawning_season']}")
        
        return "\n".join(parts)
    
    async def enrich_species_list(
        self, 
        species_names: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Fetch data for multiple species.
        
        Args:
            species_names: List of scientific names
            
        Returns:
            Dict mapping species names to their data
        """
        results = {}
        
        for name in species_names:
            try:
                data = await self.search_species(name)
                if data:
                    results[name] = self.format_species_info(data)
            except Exception as e:
                logger.error(f"Error enriching {name}: {e}")
        
        return results


# Singleton instance
_fishbase_service: Optional[FishBaseService] = None


def get_fishbase_service() -> FishBaseService:
    """Get or create the FishBase service singleton."""
    global _fishbase_service
    if _fishbase_service is None:
        _fishbase_service = FishBaseService()
    return _fishbase_service
