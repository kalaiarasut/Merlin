"""
Source Ranker - Weighted scoring for paper sources

Implements:
- Source Confidence Score (trust × citations × relevance)
- Confidence Bands (High/Medium/Low)
"""

import logging
from typing import Dict, Any, List
from dataclasses import dataclass

logger = logging.getLogger(__name__)


# Trust scores by source type
TRUST_SCORES = {
    'fao': 1.0,
    'ices': 1.0,
    'protocols_io_verified': 0.85,
    'peer_reviewed': 0.8,
    'protocols_io': 0.7,
    'institutional_sop': 0.9,
    'preprint': 0.4,
    'unknown': 0.3
}

# Confidence bands
CONFIDENCE_BANDS = {
    'high': (0.75, 1.0),
    'medium': (0.5, 0.75),
    'low': (0.0, 0.5)
}


@dataclass
class RankedSource:
    """A ranked source with all scoring components."""
    doc_id: str
    title: str
    source_type: str
    semantic_similarity: float
    citation_weight: float
    trust_score: float
    final_score: float
    confidence_band: str
    provenance: Dict[str, Any]


class SourceRanker:
    """
    Ranks sources using weighted scoring formula:
    
    final_score = (semantic_similarity * 0.4) +
                  (citation_weight * 0.3) +
                  (trust_score * 0.3)
    """
    
    def __init__(
        self,
        similarity_weight: float = 0.4,
        citation_weight: float = 0.3,
        trust_weight: float = 0.3
    ):
        self.weights = {
            'similarity': similarity_weight,
            'citation': citation_weight,
            'trust': trust_weight
        }
    
    def rank_sources(
        self,
        sources: List[Dict[str, Any]],
        query_embedding: List[float] = None
    ) -> List[RankedSource]:
        """
        Rank sources by weighted score.
        
        Args:
            sources: List of source dicts with metadata
            query_embedding: Optional embedding for similarity calc
            
        Returns:
            List of RankedSource objects sorted by final_score
        """
        ranked = []
        
        for source in sources:
            # Get base scores
            semantic_similarity = source.get('similarity', 0.7)  # Default if not computed
            citation_count = source.get('citation_count', 0)
            source_type = source.get('source_type', 'unknown')
            
            # Normalize citation count (log scale for fairness)
            import math
            citation_weight = min(math.log10(citation_count + 1) / 3, 1.0)  # Max at 1000 citations
            
            # Get trust score
            trust_score = TRUST_SCORES.get(source_type, 0.5)
            
            # Calculate final score
            final_score = (
                self.weights['similarity'] * semantic_similarity +
                self.weights['citation'] * citation_weight +
                self.weights['trust'] * trust_score
            )
            
            # Determine confidence band
            confidence_band = self._get_confidence_band(final_score)
            
            # Build provenance
            provenance = {
                'doi': source.get('doi'),
                'journal': source.get('journal', 'Unknown'),
                'year': source.get('year', 0),
                'citation_count': citation_count,
                'source_type': source_type
            }
            
            ranked.append(RankedSource(
                doc_id=source.get('doc_id', ''),
                title=source.get('title', 'Untitled'),
                source_type=source_type,
                semantic_similarity=semantic_similarity,
                citation_weight=citation_weight,
                trust_score=trust_score,
                final_score=final_score,
                confidence_band=confidence_band,
                provenance=provenance
            ))
        
        # Sort by final score descending
        ranked.sort(key=lambda x: x.final_score, reverse=True)
        
        return ranked
    
    def _get_confidence_band(self, score: float) -> str:
        """Get confidence band label for a score."""
        if score >= CONFIDENCE_BANDS['high'][0]:
            return 'high'
        elif score >= CONFIDENCE_BANDS['medium'][0]:
            return 'medium'
        else:
            return 'low'
    
    def format_provenance(self, source: RankedSource) -> str:
        """
        Format provenance tag for display.
        
        Example: "Source: FAO (2019), DOI: 10.xxxx, 45 citations"
        """
        prov = source.provenance
        parts = []
        
        # Source type and year
        source_label = prov['source_type'].replace('_', ' ').title()
        if prov['year']:
            parts.append(f"{source_label} ({prov['year']})")
        else:
            parts.append(source_label)
        
        # Journal
        if prov['journal'] and prov['journal'] != 'Unknown':
            parts.append(prov['journal'][:30])
        
        # DOI
        if prov['doi']:
            parts.append(f"DOI: {prov['doi']}")
        
        # Citations
        if prov['citation_count'] > 0:
            parts.append(f"{prov['citation_count']} citations")
        
        return " | ".join(parts)
    
    def get_overall_confidence(self, ranked_sources: List[RankedSource]) -> Dict[str, Any]:
        """
        Calculate overall confidence for a set of sources.
        
        Returns confidence score and band based on top sources.
        """
        if not ranked_sources:
            return {
                'score': 0.0,
                'band': 'low',
                'label': '🔴 Low Confidence',
                'message': 'No authoritative sources found'
            }
        
        # Weighted average of top 3 sources
        top_sources = ranked_sources[:3]
        weights = [0.5, 0.3, 0.2][:len(top_sources)]
        
        weighted_score = sum(
            s.final_score * w for s, w in zip(top_sources, weights)
        )
        
        band = self._get_confidence_band(weighted_score)
        
        labels = {
            'high': '🟢 High Confidence',
            'medium': '🟡 Medium Confidence',
            'low': '🔴 Low Confidence'
        }
        
        messages = {
            'high': 'Based on authoritative peer-reviewed sources',
            'medium': 'Based on mixed sources, verify critical steps',
            'low': 'Limited authoritative sources, expert review recommended'
        }
        
        return {
            'score': round(weighted_score, 2),
            'band': band,
            'label': labels[band],
            'message': messages[band]
        }


# Singleton
_ranker = None

def get_source_ranker() -> SourceRanker:
    global _ranker
    if _ranker is None:
        _ranker = SourceRanker()
    return _ranker
