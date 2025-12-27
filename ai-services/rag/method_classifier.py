"""
Method Type Classifier for RAG Pipeline

CORE RULE #1: Method-Type Classification BEFORE Retrieval
- Keyword-based, no AI needed
- Narrows search space dramatically
- Reduces irrelevant retrievals
"""

import re
import logging
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)


class MethodClassifier:
    """
    Classify queries by method type to improve retrieval precision.
    
    This runs BEFORE retrieval to narrow the search space.
    Uses keyword matching and regex patterns - no AI needed.
    """
    
    CLASSIFICATION_RULES: Dict[str, Dict[str, List[str]]] = {
        "eDNA": {
            "keywords": [
                "dna", "edna", "e-dna", "metabarcoding", "pcr", "primer", 
                "amplicon", "sequencing", "barcode", "genetic", "genomic",
                "extraction", "filtration", "environmental dna"
            ],
            "patterns": [
                r"e-?dna",
                r"genetic.*sampl",
                r"dna.*extract",
                r"metabarcod",
                r"pcr.*protocol"
            ]
        },
        "Otolith": {
            "keywords": [
                "otolith", "age", "aging", "ageing", "growth", "ear bone",
                "annuli", "increment", "ring", "sectioning", "mounting",
                "reading", "sagitta", "lapillus", "asteriscus"
            ],
            "patterns": [
                r"age.*estimat",
                r"growth.*ring",
                r"otolith.*analy",
                r"fish.*age",
                r"annual.*ring"
            ]
        },
        "Survey": {
            "keywords": [
                "abundance", "transect", "census", "sampling", "cpue",
                "trawl", "survey", "population", "catch", "effort",
                "quadrat", "visual", "count", "density", "biomass"
            ],
            "patterns": [
                r"fish.*survey",
                r"population.*estimat",
                r"catch.*per.*unit",
                r"abundan.*sampl",
                r"visual.*census"
            ]
        },
        "Statistical": {
            "keywords": [
                "anova", "permanova", "ordination", "pca", "nmds", 
                "regression", "correlation", "mds", "cluster", "diversity",
                "richness", "shannon", "simpson", "bray-curtis", "multivariate"
            ],
            "patterns": [
                r"statistical.*analy",
                r"multivariate",
                r"significance.*test",
                r"data.*analy",
                r"hypothesis.*test"
            ]
        },
        "Lab": {
            "keywords": [
                "extraction", "protocol", "buffer", "centrifuge", "incubation",
                "reagent", "pipette", "sterile", "contamination", "qc",
                "quality control", "standard", "calibration"
            ],
            "patterns": [
                r"lab.*protocol",
                r"laboratory.*method",
                r"standard.*operat",
                r"quality.*control"
            ]
        },
        "Oceanographic": {
            "keywords": [
                "ctd", "salinity", "temperature", "depth", "profile",
                "water column", "oxygen", "chlorophyll", "nutrients",
                "current", "tide", "wave", "hydrography", "physical"
            ],
            "patterns": [
                r"oceanograph",
                r"physical.*param",
                r"water.*quality",
                r"hydro.*surv"
            ]
        },
        "Acoustic": {
            "keywords": [
                "acoustic", "sonar", "echosounder", "hydrophone",
                "sound", "noise", "frequency", "decibel", "passive",
                "active", "echogram"
            ],
            "patterns": [
                r"acoustic.*sampl",
                r"sonar.*survey",
                r"echo.*sound"
            ]
        }
    }
    
    def __init__(self):
        """Initialize the classifier with compiled regex patterns."""
        self._compiled_patterns: Dict[str, List[re.Pattern]] = {}
        for method_type, rules in self.CLASSIFICATION_RULES.items():
            self._compiled_patterns[method_type] = [
                re.compile(pattern, re.IGNORECASE) 
                for pattern in rules.get("patterns", [])
            ]
    
    def classify(self, query: str) -> List[str]:
        """
        Classify a query into one or more method types.
        
        Args:
            query: User's methodology query
            
        Returns:
            List of matching method types, ordered by relevance score
        """
        query_lower = query.lower()
        scores: Dict[str, float] = {}
        
        for method_type, rules in self.CLASSIFICATION_RULES.items():
            score = 0.0
            
            # Check keywords (1 point each)
            keywords = rules.get("keywords", [])
            for keyword in keywords:
                if keyword in query_lower:
                    score += 1.0
                    # Bonus for exact word match
                    if re.search(rf'\b{re.escape(keyword)}\b', query_lower):
                        score += 0.5
            
            # Check patterns (2 points each - more specific)
            for pattern in self._compiled_patterns.get(method_type, []):
                if pattern.search(query_lower):
                    score += 2.0
            
            if score > 0:
                scores[method_type] = score
        
        # Sort by score descending
        sorted_types = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        result = [t[0] for t in sorted_types]
        
        # If no matches, return empty list (will search all)
        if not result:
            logger.info(f"No specific method type detected for query: {query[:50]}...")
            return []
        
        logger.info(f"Classified query as: {result} (scores: {scores})")
        return result
    
    def get_primary_type(self, query: str) -> str:
        """Get the single most likely method type, or 'General' if none."""
        types = self.classify(query)
        return types[0] if types else "General"
    
    def get_classification_details(self, query: str) -> Dict[str, any]:
        """Get detailed classification with scores and matched terms."""
        query_lower = query.lower()
        details: Dict[str, Dict] = {}
        
        for method_type, rules in self.CLASSIFICATION_RULES.items():
            matched_keywords = []
            matched_patterns = []
            score = 0.0
            
            # Check keywords
            for keyword in rules.get("keywords", []):
                if keyword in query_lower:
                    matched_keywords.append(keyword)
                    score += 1.0
                    if re.search(rf'\b{re.escape(keyword)}\b', query_lower):
                        score += 0.5
            
            # Check patterns
            for i, pattern in enumerate(self._compiled_patterns.get(method_type, [])):
                match = pattern.search(query_lower)
                if match:
                    matched_patterns.append(match.group())
                    score += 2.0
            
            if score > 0:
                details[method_type] = {
                    "score": score,
                    "matched_keywords": matched_keywords,
                    "matched_patterns": matched_patterns
                }
        
        return {
            "query": query,
            "classifications": details,
            "primary_type": self.get_primary_type(query)
        }


# Singleton instance
_classifier_instance = None


def get_method_classifier() -> MethodClassifier:
    """Get the singleton MethodClassifier instance."""
    global _classifier_instance
    if _classifier_instance is None:
        _classifier_instance = MethodClassifier()
    return _classifier_instance
