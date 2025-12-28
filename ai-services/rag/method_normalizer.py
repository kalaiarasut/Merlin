"""
Method Normalizer - Maps synonymous methods to canonical labels

Improves retrieval consistency by normalizing terminology:
- "DNA barcoding" → DNA_BARCODE_ANALYSIS
- "COI-based identification" → DNA_BARCODE_ANALYSIS
"""

import re
import logging
from typing import Dict, List, Tuple, Optional

logger = logging.getLogger(__name__)


# Canonical method labels with synonyms
METHOD_MAPPINGS = {
    'DNA_BARCODE_ANALYSIS': [
        'dna barcoding', 'dna barcode', 'coi barcoding', 'coi-based',
        'genetic identification', 'molecular identification',
        'cytochrome oxidase', 'species identification dna',
        '12s rrna', '16s rrna', 'metabarcoding', 'barcode gene'
    ],
    
    'EDNA_SAMPLING': [
        'edna', 'environmental dna', 'e-dna', 'water sampling dna',
        'dna extraction water', 'aquatic dna', 'sediment dna',
        'edna metabarcoding', 'environmental genetic'
    ],
    
    'EDNA_FILTRATION': [
        'filtration', 'filter membrane', 'water filtration',
        'membrane filter', 'dna filtration', 'vacuum filtration',
        '0.45μm', '0.22μm', 'sterivex', 'cellulose filter'
    ],
    
    'OTOLITH_AGE_ESTIMATION': [
        'otolith', 'otolith reading', 'age determination',
        'otolith microstructure', 'growth ring', 'annuli',
        'sagitta', 'fish age', 'age estimation', 'otolith extraction'
    ],
    
    'VISUAL_CENSUS': [
        'underwater visual census', 'uvc', 'visual survey',
        'fish count', 'diver survey', 'transect survey',
        'belt transect', 'point count', 'fish abundance'
    ],
    
    'TRAWL_SURVEY': [
        'trawl', 'bottom trawl', 'pelagic trawl', 'otter trawl',
        'beam trawl', 'trawl survey', 'catch per unit',
        'cpue', 'fishing survey'
    ],
    
    'ACOUSTIC_SURVEY': [
        'acoustic', 'hydroacoustic', 'echosounder', 'sonar',
        'fish finder', 'echo integration', 'biomass estimation acoustic',
        'acoustic telemetry', 'fish tracking'
    ],
    
    'STABLE_ISOTOPE_ANALYSIS': [
        'stable isotope', 'isotope ratio', 'δ13c', 'δ15n',
        'carbon isotope', 'nitrogen isotope', 'trophic level',
        'food web', 'isotopic signature'
    ],
    
    'MORPHOMETRIC_ANALYSIS': [
        'morphometric', 'morphology', 'body measurement',
        'landmark', 'geometric morphometrics', 'shape analysis',
        'meristic', 'fish measurement', 'truss network'
    ],
    
    'STOMACH_CONTENT_ANALYSIS': [
        'stomach content', 'gut content', 'diet analysis',
        'prey identification', 'feeding ecology', 'food habit',
        'gastric lavage', 'digestion analysis'
    ],
    
    'WATER_QUALITY_SAMPLING': [
        'water quality', 'water parameter', 'physico-chemical',
        'temperature salinity', 'dissolved oxygen', 'ph measurement',
        'nutrient sampling', 'chlorophyll', 'ctd'
    ],
    
    'SEDIMENT_SAMPLING': [
        'sediment', 'sediment core', 'grab sample', 'benthic',
        'substrate', 'sediment analysis', 'grain size',
        'organic matter sediment'
    ],
    
    'GENETIC_POPULATION_ANALYSIS': [
        'population genetics', 'microsatellite', 'snp',
        'genetic diversity', 'gene flow', 'fst', 'haplotype',
        'genetic structure', 'population structure'
    ],
    
    'TAGGING_MARKING': [
        'tagging', 'fish tag', 'dart tag', 'pit tag',
        'mark recapture', 'marking', 'acoustic tag',
        'satellite tag', 'archival tag'
    ],
    
    'STATISTICAL_ANALYSIS': [
        'permanova', 'nmds', 'pca', 'ordination',
        'anova', 'regression', 'multivariate', 'cluster analysis',
        'diversity index', 'shannon', 'simpson'
    ]
}


class MethodNormalizer:
    """
    Normalizes method terminology to canonical labels.
    
    This improves retrieval by matching queries about the
    same method even when worded differently.
    """
    
    def __init__(self):
        # Build reverse lookup: synonym -> canonical label
        self._synonym_map: Dict[str, str] = {}
        for canonical, synonyms in METHOD_MAPPINGS.items():
            for synonym in synonyms:
                self._synonym_map[synonym.lower()] = canonical
    
    def normalize(self, text: str) -> Tuple[Optional[str], float]:
        """
        Normalize text to a canonical method label.
        
        Args:
            text: Input text (query or method description)
            
        Returns:
            Tuple of (canonical_label, confidence)
            Returns (None, 0.0) if no match found
        """
        text_lower = text.lower()
        
        # Check for exact synonym matches
        for synonym, canonical in self._synonym_map.items():
            if synonym in text_lower:
                # Calculate confidence based on match specificity
                confidence = len(synonym) / max(len(text_lower), 1)
                confidence = min(confidence * 2, 1.0)  # Boost but cap at 1.0
                return canonical, confidence
        
        return None, 0.0
    
    def normalize_all(self, text: str) -> List[Tuple[str, float]]:
        """
        Find all matching canonical methods in text.
        
        Returns list of (canonical_label, confidence) tuples.
        """
        text_lower = text.lower()
        matches = []
        seen = set()
        
        for synonym, canonical in self._synonym_map.items():
            if synonym in text_lower and canonical not in seen:
                confidence = len(synonym) / max(len(text_lower), 1)
                confidence = min(confidence * 2, 1.0)
                matches.append((canonical, confidence))
                seen.add(canonical)
        
        # Sort by confidence descending
        matches.sort(key=lambda x: x[1], reverse=True)
        return matches
    
    def get_canonical_label(self, text: str) -> str:
        """Get primary canonical label or return 'GENERAL'."""
        label, _ = self.normalize(text)
        return label or 'GENERAL'
    
    def get_synonyms(self, canonical: str) -> List[str]:
        """Get all synonyms for a canonical label."""
        return METHOD_MAPPINGS.get(canonical, [])
    
    def expand_query(self, query: str) -> str:
        """
        Expand query with synonyms for better retrieval.
        
        Example: "otolith reading" -> "otolith reading OR age determination OR sagitta"
        """
        matches = self.normalize_all(query)
        
        if not matches:
            return query
        
        # Get top match's synonyms
        top_canonical = matches[0][0]
        synonyms = self.get_synonyms(top_canonical)[:3]  # Top 3 synonyms
        
        expanded = query
        for synonym in synonyms:
            if synonym.lower() not in query.lower():
                expanded += f" OR {synonym}"
        
        return expanded
    
    def get_method_cache_key(
        self,
        query: str,
        year_range: Optional[Tuple[int, int]] = None,
        source_type: Optional[str] = None
    ) -> str:
        """
        Generate cache key based on normalized method, not raw query.
        
        This allows caching by (method_id + year_range + source_type)
        so different wordings hit the same cache.
        """
        canonical = self.get_canonical_label(query)
        
        parts = [canonical]
        
        if year_range:
            parts.append(f"{year_range[0]}-{year_range[1]}")
        else:
            parts.append("all_years")
        
        if source_type:
            parts.append(source_type)
        else:
            parts.append("all_sources")
        
        return ":".join(parts)


# Singleton
_normalizer = None

def get_method_normalizer() -> MethodNormalizer:
    global _normalizer
    if _normalizer is None:
        _normalizer = MethodNormalizer()
    return _normalizer
