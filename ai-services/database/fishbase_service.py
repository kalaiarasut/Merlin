"""
FishBase Comprehensive Web Scraping Service
Fetches ALL available species information from FishBase.org website.

Data categories extracted:
- Biology: Life history, taxonomy, size, weight, age
- Ecology: Habitat, depth, trophic level, diet, feeding habits
- Morphology: Body shape, color, distinctive features  
- Reproduction: Mode, spawning, fecundity, maturity
- Distribution: Geographic range, occurrence
- Conservation: IUCN status, threats
- Uses: Commercial importance, fisheries, aquaculture
"""

import re
import logging
import httpx
import asyncio
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)


class FishBaseService:
    """Service for fetching comprehensive species data from FishBase website."""
    
    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
    
    async def get_species_info(self, scientific_name: str) -> Optional[Dict[str, Any]]:
        """
        Fetch ALL available species information from FishBase.
        
        Args:
            scientific_name: Scientific name (e.g., "Thunnus albacares")
            
        Returns:
            Comprehensive dictionary with all available species info
        """
        # Check cache first
        if scientific_name in self._cache:
            logger.debug(f"FishBase cache hit: {scientific_name}")
            return self._cache[scientific_name]
        
        try:
            # Parse genus and species
            parts = scientific_name.strip().split()
            if len(parts) < 2:
                logger.warning(f"Invalid scientific name format: {scientific_name}")
                return None
            
            genus = parts[0]
            species = parts[1]
            
            # FishBase URL format - using .se mirror (more reliable)
            species_url = f"https://www.fishbase.se/summary/{genus}-{species}.html"
            
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                response = await client.get(species_url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                })
                
                if response.status_code != 200:
                    logger.warning(f"FishBase page not found for {scientific_name}: {response.status_code}")
                    return None
                
                # Parse HTML to extract all available data
                result = self._parse_fishbase_html(response.text, scientific_name)
                
                if result:
                    self._cache[scientific_name] = result
                    logger.info(f"FishBase data scraped for {scientific_name}")
                    return result
                else:
                    logger.warning(f"Could not parse FishBase page for {scientific_name}")
                    return None
                    
        except Exception as e:
            logger.error(f"FishBase scraping error for {scientific_name}: {e}")
            return None
    
    def _clean_text(self, text: str) -> str:
        """Clean extracted text by removing HTML artifacts."""
        if not text:
            return ""
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', text)
        # Remove style/class attributes
        text = re.sub(r"style='[^']*'", '', text)
        text = re.sub(r'#[0-9A-Fa-f]{3,6};?', '', text)
        text = re.sub(r"href='[^']*'", '', text)
        text = re.sub(r"class='[^']*'", '', text)
        text = re.sub(r"title='[^']*'", '', text)
        # Clean whitespace and special chars
        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'^[;:\s]+', '', text)
        return text.strip()
    
    def _parse_fishbase_html(self, html: str, scientific_name: str) -> Optional[Dict[str, Any]]:
        """Parse FishBase HTML page to extract ALL available species data."""
        try:
            result = {
                "scientific_name": scientific_name,
                
                # === TAXONOMY & IDENTIFICATION ===
                "common_name": "",
                "family": "",
                "order": "",
                "class": "",
                "synonyms": "",
                
                # === SIZE & MORPHOLOGY ===
                "max_length_cm": "",
                "common_length_cm": "",
                "max_weight_kg": "",
                "max_age_years": "",
                "body_shape": "",
                "color_description": "",
                "distinctive_features": "",
                
                # === HABITAT & ECOLOGY ===
                "environment": "",  # Marine, Freshwater, Brackish
                "habitat_type": "",  # Pelagic, Demersal, Reef-associated
                "depth_min_m": "",
                "depth_max_m": "",
                "depth_common_m": "",
                "climate_zone": "",  # Tropical, Subtropical, Temperate
                "water_temperature_c": "",
                "salinity": "",
                
                # === DIET & FEEDING ===
                "trophic_level": "",
                "diet_type": "",  # Carnivore, Herbivore, Omnivore, Planktivore
                "main_food": "",
                "feeding_behavior": "",
                
                # === REPRODUCTION ===
                "reproduction_mode": "",
                "spawning_frequency": "",
                "spawning_season": "",
                "maturity_length_cm": "",
                "maturity_age_years": "",
                "fecundity": "",
                "egg_type": "",
                
                # === BEHAVIOR ===
                "schooling": "",
                "migration": "",
                "activity_pattern": "",  # Diurnal, Nocturnal
                
                # === DISTRIBUTION ===
                "distribution": "",
                "native_range": "",
                "countries": "",
                
                # === CONSERVATION ===
                "iucn_status": "",
                "iucn_full_status": "",
                "threats": "",
                "population_trend": "",
                
                # === USES ===
                "commercial_importance": "",
                "fisheries": "",
                "aquaculture": "",
                "game_fish": "",
                "aquarium_trade": "",
                "human_uses": "",
                
                # === DANGER ===
                "dangerous_to_humans": "",
                "venom": "",
                "ciguatera": "",
            }
            
            # === EXTRACT COMMON NAME FROM TITLE ===
            title_match = re.search(r'<title>([^<]+)</title>', html)
            if title_match:
                title = title_match.group(1)
                if ',' in title:
                    parts = title.split(',')
                    if len(parts) >= 2:
                        result["common_name"] = self._clean_text(parts[1].split('-')[0])
            
            # === EXTRACT TAXONOMY ===
            family_match = re.search(r'Family[:\s]*<a[^>]*>([^<]+)</a>', html, re.IGNORECASE)
            if family_match:
                result["family"] = self._clean_text(family_match.group(1))
            
            order_match = re.search(r'Order[:\s]*<a[^>]*>([^<]+)</a>', html, re.IGNORECASE)
            if order_match:
                result["order"] = self._clean_text(order_match.group(1))
            
            class_match = re.search(r'Class[:\s]*<a[^>]*>([^<]+)</a>', html, re.IGNORECASE)
            if class_match:
                result["class"] = self._clean_text(class_match.group(1))
            
            # === EXTRACT ENVIRONMENT ===
            env_indicators = []
            if re.search(r'\bMarine\b', html):
                env_indicators.append("Marine")
            if re.search(r'\bFreshwater\b', html):
                env_indicators.append("Freshwater")
            if re.search(r'\bBrackish\b', html):
                env_indicators.append("Brackish")
            result["environment"] = ", ".join(env_indicators) if env_indicators else ""
            
            # === EXTRACT HABITAT TYPE ===
            habitat_types = []
            if re.search(r'\bPelagic\b', html, re.IGNORECASE):
                habitat_types.append("Pelagic")
            if re.search(r'\bBenthopelagic\b', html, re.IGNORECASE):
                habitat_types.append("Benthopelagic")
            if re.search(r'\bDemersal\b', html, re.IGNORECASE):
                habitat_types.append("Demersal")
            if re.search(r'\bReef-associated\b', html, re.IGNORECASE):
                habitat_types.append("Reef-associated")
            if re.search(r'\bBathydemersal\b', html, re.IGNORECASE):
                habitat_types.append("Bathydemersal")
            if re.search(r'\bBathypelagic\b', html, re.IGNORECASE):
                habitat_types.append("Bathypelagic")
            result["habitat_type"] = ", ".join(habitat_types) if habitat_types else ""
            
            # === EXTRACT DEPTH ===
            depth_match = re.search(r'(\d+)\s*[-–]\s*(\d+)\s*m', html)
            if depth_match:
                result["depth_min_m"] = depth_match.group(1)
                result["depth_max_m"] = depth_match.group(2)
            
            # === EXTRACT SIZE ===
            # Max length
            length_patterns = [
                r'max(?:imum)?\s+(?:total\s+)?length[:\s]*(\d+(?:\.\d+)?)\s*cm',
                r'(\d+(?:\.\d+)?)\s*cm\s*TL',
                r'to\s+(\d+(?:\.\d+)?)\s*cm',
                r'reaches\s+(\d+(?:\.\d+)?)\s*cm',
            ]
            for pattern in length_patterns:
                match = re.search(pattern, html, re.IGNORECASE)
                if match:
                    result["max_length_cm"] = match.group(1)
                    break
            
            # Common length
            common_len_match = re.search(r'common\s+length[:\s]*(\d+(?:\.\d+)?)\s*cm', html, re.IGNORECASE)
            if common_len_match:
                result["common_length_cm"] = common_len_match.group(1)
            
            # Max weight
            weight_patterns = [
                r'max(?:imum)?\s+(?:published\s+)?weight[:\s]*(\d+(?:\.\d+)?)\s*kg',
                r'(\d+(?:\.\d+)?)\s*kg\s*(?:weight|max)',
            ]
            for pattern in weight_patterns:
                match = re.search(pattern, html, re.IGNORECASE)
                if match:
                    result["max_weight_kg"] = match.group(1)
                    break
            
            # Max age
            age_match = re.search(r'max(?:imum)?\s+(?:reported\s+)?age[:\s]*(\d+)\s*(?:years?|yrs?)', html, re.IGNORECASE)
            if age_match:
                result["max_age_years"] = age_match.group(1)
            
            # === EXTRACT IUCN STATUS ===
            iucn_patterns = [
                (r'Least\s*Concern', 'LC', 'Least Concern'),
                (r'Near\s*Threatened', 'NT', 'Near Threatened'),
                (r'Vulnerable\b', 'VU', 'Vulnerable'),
                (r'Endangered\b(?!\s*Species)', 'EN', 'Endangered'),
                (r'Critically\s*Endangered', 'CR', 'Critically Endangered'),
                (r'Data\s*Deficient', 'DD', 'Data Deficient'),
                (r'Not\s*Evaluated', 'NE', 'Not Evaluated'),
                (r'Extinct\s+in\s+the\s+Wild', 'EW', 'Extinct in the Wild'),
                (r'Extinct\b', 'EX', 'Extinct'),
            ]
            for pattern, code, full_status in iucn_patterns:
                if re.search(pattern, html, re.IGNORECASE):
                    result["iucn_status"] = code
                    result["iucn_full_status"] = full_status
                    break
            
            # === EXTRACT CLIMATE ===
            climate_zones = []
            if re.search(r'\bTropical\b', html, re.IGNORECASE):
                climate_zones.append("Tropical")
            if re.search(r'\bSubtropical\b', html, re.IGNORECASE):
                climate_zones.append("Subtropical")
            if re.search(r'\bTemperate\b', html, re.IGNORECASE):
                climate_zones.append("Temperate")
            if re.search(r'\bPolar\b', html, re.IGNORECASE):
                climate_zones.append("Polar")
            result["climate_zone"] = ", ".join(climate_zones) if climate_zones else ""
            
            # === EXTRACT TROPHIC LEVEL ===
            trophic_match = re.search(r'trophic\s*level[:\s]*(\d+(?:\.\d+)?)', html, re.IGNORECASE)
            if trophic_match:
                result["trophic_level"] = trophic_match.group(1)
            
            # === EXTRACT DIET ===
            diet_types = []
            if re.search(r'\bcarnivore\b|\bcarnivorous\b|feeds on (fish|prey)', html, re.IGNORECASE):
                diet_types.append("Carnivore")
            if re.search(r'\bherbivore\b|\bherbivorous\b|feeds on (algae|plants)', html, re.IGNORECASE):
                diet_types.append("Herbivore")
            if re.search(r'\bomnivore\b|\bomnivorous\b', html, re.IGNORECASE):
                diet_types.append("Omnivore")
            if re.search(r'\bplanktivore\b|\bplanktivorous\b|feeds on (plankton|zooplankton)', html, re.IGNORECASE):
                diet_types.append("Planktivore")
            result["diet_type"] = ", ".join(diet_types) if diet_types else ""
            
            # Food items
            food_items = []
            food_patterns = [
                (r'\bfish(?:es)?\b', 'Fish'),
                (r'\bcrustaceans?\b', 'Crustaceans'),
                (r'\bshrimp\b', 'Shrimp'),
                (r'\bsquid\b', 'Squid'),
                (r'\bplankton\b', 'Plankton'),
                (r'\balgae\b', 'Algae'),
                (r'\bmolluscs?\b|\bmollusks?\b', 'Molluscs'),
                (r'\bcephalopods?\b', 'Cephalopods'),
                (r'\bworms?\b|\bpolychaetes?\b', 'Worms'),
                (r'\bechinoderms?\b', 'Echinoderms'),
                (r'\bcorals?\b', 'Coral'),
                (r'\binsects?\b', 'Insects'),
            ]
            for pattern, name in food_patterns:
                if re.search(pattern, html, re.IGNORECASE):
                    food_items.append(name)
            result["main_food"] = ", ".join(food_items[:5]) if food_items else ""  # Limit to 5
            
            # === EXTRACT USES ===
            uses = []
            if re.search(r'\bhighly commercial\b|\bmajor commercial\b', html, re.IGNORECASE):
                result["commercial_importance"] = "High"
            elif re.search(r'\bcommercial\b', html, re.IGNORECASE):
                result["commercial_importance"] = "Yes"
            
            if re.search(r'\baquaculture\b', html, re.IGNORECASE):
                result["aquaculture"] = "Yes"
            if re.search(r'\bgame\s*fish\b|\bsport\s*fish\b', html, re.IGNORECASE):
                result["game_fish"] = "Yes"
            if re.search(r'\baquarium\b', html, re.IGNORECASE):
                result["aquarium_trade"] = "Yes"
            
            # Human uses
            human_uses = []
            if re.search(r'\bfood\b.*\bfish\b|\b(?:consumed|eaten)\b', html, re.IGNORECASE):
                human_uses.append("Food")
            if re.search(r'\bfishmeal\b|\bfish\s*meal\b', html, re.IGNORECASE):
                human_uses.append("Fishmeal")
            if re.search(r'\bfish\s*oil\b', html, re.IGNORECASE):
                human_uses.append("Fish oil")
            if re.search(r'\bbait\b', html, re.IGNORECASE):
                human_uses.append("Bait")
            result["human_uses"] = ", ".join(human_uses) if human_uses else ""
            
            # === EXTRACT DANGER ===
            if re.search(r'\bharmless\b', html, re.IGNORECASE):
                result["dangerous_to_humans"] = "Harmless"
            elif re.search(r'\bdangerous\b|\bvenomous\b|\bpoisonous\b', html, re.IGNORECASE):
                result["dangerous_to_humans"] = "Yes"
            
            if re.search(r'\bciguatera\b', html, re.IGNORECASE):
                result["ciguatera"] = "Reports of ciguatera poisoning"
            
            # === EXTRACT REPRODUCTION ===
            # Spawning
            if re.search(r'\bbroadcast\s*spawn', html, re.IGNORECASE):
                result["reproduction_mode"] = "Broadcast spawner"
            elif re.search(r'\blivebearer\b|\bviviparous\b', html, re.IGNORECASE):
                result["reproduction_mode"] = "Livebearer"
            elif re.search(r'\begg-layer\b|\boviparous\b', html, re.IGNORECASE):
                result["reproduction_mode"] = "Egg-layer"
            
            # Egg type
            if re.search(r'\bpelagic eggs?\b', html, re.IGNORECASE):
                result["egg_type"] = "Pelagic"
            elif re.search(r'\bdemersal eggs?\b|\bbenthic eggs?\b', html, re.IGNORECASE):
                result["egg_type"] = "Demersal"
            
            # Schooling
            if re.search(r'\bschooling\b|\bschools\b|\bform(?:s|ing)? schools\b', html, re.IGNORECASE):
                result["schooling"] = "Yes - forms schools"
            elif re.search(r'\bsolitary\b', html, re.IGNORECASE):
                result["schooling"] = "Solitary"
            
            # Migration
            if re.search(r'\bmigratory\b|\bmigrat(?:es?|ion)\b', html, re.IGNORECASE):
                result["migration"] = "Yes"
            if re.search(r'\banadromous\b', html, re.IGNORECASE):
                result["migration"] = "Anadromous"
            if re.search(r'\bcatadromous\b', html, re.IGNORECASE):
                result["migration"] = "Catadromous"
            if re.search(r'\bamphidromous\b', html, re.IGNORECASE):
                result["migration"] = "Amphidromous"
            if re.search(r'\boceanodromous\b', html, re.IGNORECASE):
                result["migration"] = "Oceanodromous"
            
            return result
            
        except Exception as e:
            logger.error(f"HTML parsing error: {e}")
            return None
    
    async def enrich_species_list(self, species_names: List[str]) -> Dict[str, Dict[str, Any]]:
        """Enrich a list of species with FishBase data concurrently."""
        results = {}
        
        # Create tasks for all species
        tasks = []
        for name in species_names:
            if name:
                tasks.append(self.get_species_info(name))
        
        # Execute all requests in parallel
        if tasks:
            infos = await asyncio.gather(*tasks)
            
            # Map results back to names
            for name, info in zip(species_names, infos):
                if info:
                    results[name] = info
                else:
                    results[name] = {"scientific_name": name, "error": "Not found in FishBase"}
        
        return results
    
    def format_for_prompt(self, species_data: Dict[str, Any]) -> str:
        """Format ALL species data for inclusion in LLM prompt."""
        if species_data.get("error"):
            return f"- {species_data['scientific_name']}: Data not available from FishBase"
        
        lines = []
        name = species_data['scientific_name']
        common = species_data.get('common_name', '')
        
        lines.append(f"\n### {name}" + (f" ({common})" if common else ""))
        
        # Taxonomy
        taxonomy = []
        if species_data.get('family'):
            taxonomy.append(f"Family: {species_data['family']}")
        if species_data.get('order'):
            taxonomy.append(f"Order: {species_data['order']}")
        if taxonomy:
            lines.append("**Taxonomy:** " + ", ".join(taxonomy))
        
        # Size & Morphology
        size_info = []
        if species_data.get('max_length_cm'):
            size_info.append(f"Max length: {species_data['max_length_cm']} cm")
        if species_data.get('common_length_cm'):
            size_info.append(f"Common length: {species_data['common_length_cm']} cm")
        if species_data.get('max_weight_kg'):
            size_info.append(f"Max weight: {species_data['max_weight_kg']} kg")
        if species_data.get('max_age_years'):
            size_info.append(f"Max age: {species_data['max_age_years']} years")
        if size_info:
            lines.append("**Size:** " + ", ".join(size_info))
        
        # Environment & Habitat
        habitat_info = []
        if species_data.get('environment'):
            habitat_info.append(species_data['environment'])
        if species_data.get('habitat_type'):
            habitat_info.append(species_data['habitat_type'])
        if species_data.get('climate_zone'):
            habitat_info.append(species_data['climate_zone'])
        if habitat_info:
            lines.append("**Environment:** " + ", ".join(habitat_info))
        
        # Depth
        if species_data.get('depth_min_m') or species_data.get('depth_max_m'):
            depth_min = species_data.get('depth_min_m', '?')
            depth_max = species_data.get('depth_max_m', '?')
            lines.append(f"**Depth Range:** {depth_min}-{depth_max} m")
        
        # Diet & Feeding
        diet_info = []
        if species_data.get('diet_type'):
            diet_info.append(species_data['diet_type'])
        if species_data.get('main_food'):
            diet_info.append(f"feeds on {species_data['main_food']}")
        if species_data.get('trophic_level'):
            diet_info.append(f"Trophic level: {species_data['trophic_level']}")
        if diet_info:
            lines.append("**Diet:** " + ", ".join(diet_info))
        
        # Behavior
        behavior = []
        if species_data.get('schooling'):
            behavior.append(species_data['schooling'])
        if species_data.get('migration'):
            behavior.append(f"Migration: {species_data['migration']}")
        if behavior:
            lines.append("**Behavior:** " + ", ".join(behavior))
        
        # Reproduction
        repro = []
        if species_data.get('reproduction_mode'):
            repro.append(species_data['reproduction_mode'])
        if species_data.get('egg_type'):
            repro.append(f"{species_data['egg_type']} eggs")
        if repro:
            lines.append("**Reproduction:** " + ", ".join(repro))
        
        # Conservation
        if species_data.get('iucn_full_status'):
            lines.append(f"**IUCN Status:** {species_data['iucn_full_status']} ({species_data.get('iucn_status', '')})")
        
        # Uses
        uses = []
        if species_data.get('commercial_importance'):
            uses.append(f"Commercial: {species_data['commercial_importance']}")
        if species_data.get('game_fish'):
            uses.append("Game fish")
        if species_data.get('aquaculture'):
            uses.append("Aquaculture")
        if species_data.get('aquarium_trade'):
            uses.append("Aquarium trade")
        if species_data.get('human_uses'):
            uses.append(species_data['human_uses'])
        if uses:
            lines.append("**Uses:** " + ", ".join(uses))
        
        # Danger
        if species_data.get('dangerous_to_humans'):
            lines.append(f"**Safety:** {species_data['dangerous_to_humans']}")
        if species_data.get('ciguatera'):
            lines.append(f"**WARNING:** {species_data['ciguatera']}")
        
        return "\n".join(lines)


# Singleton instance
_fishbase_service: Optional[FishBaseService] = None


def get_fishbase_service() -> FishBaseService:
    """Get singleton FishBase service instance."""
    global _fishbase_service
    if _fishbase_service is None:
        _fishbase_service = FishBaseService()
    return _fishbase_service


async def enrich_species_with_fishbase(species_names: List[str]) -> str:
    """
    Convenience function to enrich species and format for prompt.
    
    Args:
        species_names: List of scientific names
        
    Returns:
        Formatted string for LLM prompt with ALL FishBase data
    """
    service = get_fishbase_service()
    enriched = await service.enrich_species_list(species_names)
    
    lines = []
    for name, data in enriched.items():
        lines.append(service.format_for_prompt(data))
    
    return "\n".join(lines)
