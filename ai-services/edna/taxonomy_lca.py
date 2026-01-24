"""
Weighted LCA Taxonomy Assignment for eDNA

Publication-ready taxonomy assignment with:
- Weighted LCA (bitscore × alignment_length)
- Single-taxon dominance shortcut (≥80%)
- Rank-aware bootstrap thresholds
- Rank collapse rule (<10% weight difference)
- Explicit "Unclassified_<rank>" states
- BLAST/SILVA conflict detection

Scientific Features:
- Cross-database conflict flagging
- Conservative rank assignment
- Full provenance tracking

Author: CMLRE Merlin Platform
"""

import os
import json
import logging
import numpy as np
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import List, Dict, Optional, Tuple, Any
from datetime import datetime
from collections import Counter, defaultdict

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

# Rank-aware bootstrap thresholds
# Adjusted based on user feedback: kingdom 70%, species 90%
BOOTSTRAP_THRESHOLDS = {
    "kingdom": 70,
    "phylum": 70,
    "class": 75,
    "order": 80,
    "family": 85,
    "genus": 90,
    "species": 90,  # 90-95 = putative, ≥95 = high confidence
}

# Taxonomic rank order
RANK_ORDER = ["kingdom", "phylum", "class", "order", "family", "genus", "species"]

# Single-taxon dominance threshold
DOMINANCE_THRESHOLD = 0.80  # If one hit has ≥80% of total weight, use direct assignment

# Rank collapse threshold
COLLAPSE_THRESHOLD = 0.10  # If top two weights differ by <10%, collapse to higher rank


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class BlastHit:
    """BLAST hit for LCA calculation"""
    asv_id: str
    accession: str
    taxid: int
    species: str
    pident: float
    length: int
    bitscore: float
    qcovs: int
    taxonomy: Dict[str, str]  # rank -> name
    # Derived
    weighted_score: float = 0.0
    
    def __post_init__(self):
        self.weighted_score = self.bitscore * self.length


@dataclass
class TaxonomyAssignment:
    """Final taxonomy assignment for an ASV"""
    asv_id: str
    taxonomy: Dict[str, str]  # rank -> name
    confidence: Dict[str, float]  # rank -> bootstrap confidence (0-100)
    
    # Assignment metadata
    assignment_method: str  # "weighted_lca", "single_taxon", "collapsed"
    confident_rank: str  # Lowest rank above threshold
    unclassified_at: Optional[str]  # First rank below threshold
    
    # Conflict detection
    taxonomy_conflict: bool = False
    conflict_rank: Optional[str] = None
    conflict_sources: Optional[List[str]] = None
    
    # QIIME-style taxonomy string
    formatted_taxonomy: str = ""
    
    # Provenance
    hit_count: int = 0
    total_weight: float = 0.0
    top_hit_species: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class LCAResult:
    """Batch LCA result"""
    assignments: List[TaxonomyAssignment]
    assigned_count: int
    unassigned_count: int
    conflict_count: int
    average_confidence: float
    processing_time_seconds: float
    
    # Configuration used
    thresholds: Dict[str, int]
    dominance_threshold: float
    collapse_threshold: float


# =============================================================================
# WEIGHTED LCA CALCULATOR
# =============================================================================

class WeightedLCACalculator:
    """
    Weighted LCA taxonomy assignment.
    
    Features:
    - Weight = bitscore × alignment_length
    - Single-taxon dominance shortcut (≥80% → direct assignment)
    - Rank collapse when top two weights differ by <10%
    - BLAST/SILVA conflict detection
    """
    
    def __init__(
        self,
        bootstrap_thresholds: Optional[Dict[str, int]] = None,
        dominance_threshold: float = DOMINANCE_THRESHOLD,
        collapse_threshold: float = COLLAPSE_THRESHOLD
    ):
        self.thresholds = bootstrap_thresholds or BOOTSTRAP_THRESHOLDS
        self.dominance_threshold = dominance_threshold
        self.collapse_threshold = collapse_threshold
    
    def assign_taxonomy(
        self,
        asv_id: str,
        hits: List[BlastHit],
        silva_taxonomy: Optional[Dict[str, str]] = None  # For conflict detection
    ) -> TaxonomyAssignment:
        """
        Assign taxonomy using weighted LCA.
        
        Args:
            asv_id: ASV identifier
            hits: List of BLAST hits with taxonomy
            silva_taxonomy: Optional SILVA classification for conflict detection
        
        Returns:
            TaxonomyAssignment with provenance
        """
        if not hits:
            return self._create_unassigned(asv_id)
        
        # Calculate weights (use indices since BlastHit is not hashable)
        weights = [h.bitscore * h.length for h in hits]
        total_weight = sum(weights)
        
        if total_weight == 0:
            return self._create_unassigned(asv_id)
        
        # Sort hits by weight (with indices)
        indexed_hits = list(enumerate(hits))
        sorted_indexed = sorted(indexed_hits, key=lambda x: weights[x[0]], reverse=True)
        top_idx, top_hit = sorted_indexed[0]
        
        # Step 1: Single-taxon dominance shortcut
        if weights[top_hit] / total_weight >= self.dominance_threshold:
            assignment = self._assign_direct(asv_id, top_hit, hits)
            assignment.assignment_method = "single_taxon"
        
        # Step 2: Check for rank collapse
        elif len(sorted_hits) >= 2:
            top_weight = weights[sorted_hits[0]]
            second_weight = weights[sorted_hits[1]]
            
            if (top_weight - second_weight) / top_weight < self.collapse_threshold:
                # Weights too close - collapse to higher rank
                assignment = self._weighted_lca(asv_id, hits, weights, collapse=True)
                assignment.assignment_method = "collapsed"
            else:
                assignment = self._weighted_lca(asv_id, hits, weights, collapse=False)
                assignment.assignment_method = "weighted_lca"
        else:
            assignment = self._weighted_lca(asv_id, hits, weights, collapse=False)
            assignment.assignment_method = "weighted_lca"
        
        # Step 3: Check for BLAST/SILVA conflict
        if silva_taxonomy:
            assignment = self._check_conflict(assignment, silva_taxonomy)
        
        # Step 4: Format taxonomy string
        assignment.formatted_taxonomy = self._format_taxonomy(assignment)
        
        # Step 5: Set provenance
        assignment.hit_count = len(hits)
        assignment.total_weight = total_weight
        assignment.top_hit_species = top_hit.species
        
        return assignment
    
    def _assign_direct(
        self,
        asv_id: str,
        hit: BlastHit,
        all_hits: List[BlastHit]
    ) -> TaxonomyAssignment:
        """Direct assignment from dominant hit"""
        taxonomy = hit.taxonomy.copy()
        
        # Calculate confidence (simplified - use pident as proxy)
        confidence = {}
        for rank in RANK_ORDER:
            if rank in taxonomy:
                # Higher ranks get higher confidence
                rank_idx = RANK_ORDER.index(rank)
                confidence[rank] = min(99, hit.pident - rank_idx * 2)
        
        # Find unclassified rank
        confident_rank = "kingdom"
        unclassified_at = None
        
        for rank in RANK_ORDER:
            if rank in taxonomy and confidence.get(rank, 0) >= self.thresholds.get(rank, 80):
                confident_rank = rank
            elif unclassified_at is None:
                unclassified_at = rank
                break
        
        return TaxonomyAssignment(
            asv_id=asv_id,
            taxonomy=taxonomy,
            confidence=confidence,
            assignment_method="single_taxon",
            confident_rank=confident_rank,
            unclassified_at=unclassified_at,
        )
    
    def _weighted_lca(
        self,
        asv_id: str,
        hits: List[BlastHit],
        weights: Dict[BlastHit, float],
        collapse: bool
    ) -> TaxonomyAssignment:
        """Weighted LCA computation"""
        total_weight = sum(weights.values())
        
        # For each rank, find consensus weighted by score
        rank_votes: Dict[str, Counter] = {}
        
        for rank in RANK_ORDER:
            rank_votes[rank] = Counter()
            for hit in hits:
                if rank in hit.taxonomy:
                    value = hit.taxonomy[rank]
                    rank_votes[rank][value] += weights[hit]
        
        # Build consensus taxonomy
        taxonomy = {}
        confidence = {}
        
        for rank in RANK_ORDER:
            votes = rank_votes[rank]
            if votes:
                top_value, top_weight = votes.most_common(1)[0]
                consensus_weight = top_weight / total_weight * 100
                
                # Check threshold
                threshold = self.thresholds.get(rank, 80)
                if consensus_weight >= threshold:
                    taxonomy[rank] = top_value
                    confidence[rank] = consensus_weight
                else:
                    # Mark as unclassified at this rank
                    break
            else:
                break
        
        # If collapsing, remove lowest rank
        if collapse and taxonomy:
            lowest_rank = None
            for rank in reversed(RANK_ORDER):
                if rank in taxonomy:
                    lowest_rank = rank
                    break
            
            if lowest_rank and lowest_rank != "kingdom":
                del taxonomy[lowest_rank]
                if lowest_rank in confidence:
                    del confidence[lowest_rank]
        
        # Find confident/unclassified ranks
        confident_rank = "kingdom"
        unclassified_at = None
        
        for rank in RANK_ORDER:
            if rank in taxonomy:
                confident_rank = rank
            else:
                unclassified_at = rank
                break
        
        return TaxonomyAssignment(
            asv_id=asv_id,
            taxonomy=taxonomy,
            confidence=confidence,
            assignment_method="weighted_lca",
            confident_rank=confident_rank,
            unclassified_at=unclassified_at,
        )
    
    def _check_conflict(
        self,
        assignment: TaxonomyAssignment,
        silva_taxonomy: Dict[str, str]
    ) -> TaxonomyAssignment:
        """Check for BLAST/SILVA taxonomy conflict"""
        for rank in RANK_ORDER:
            blast_value = assignment.taxonomy.get(rank, "")
            silva_value = silva_taxonomy.get(rank, "")
            
            if blast_value and silva_value and blast_value != silva_value:
                assignment.taxonomy_conflict = True
                assignment.conflict_rank = rank
                assignment.conflict_sources = ["BLAST", "SILVA"]
                
                # Conservative: use higher rank where they agree
                for check_rank in reversed(RANK_ORDER[:RANK_ORDER.index(rank)]):
                    if (assignment.taxonomy.get(check_rank) == 
                        silva_taxonomy.get(check_rank)):
                        assignment.confident_rank = check_rank
                        break
                
                break
        
        return assignment
    
    def _format_taxonomy(self, assignment: TaxonomyAssignment) -> str:
        """Format as QIIME-style taxonomy string with Unclassified markers"""
        parts = []
        prefix_map = {
            'kingdom': 'k', 'phylum': 'p', 'class': 'c',
            'order': 'o', 'family': 'f', 'genus': 'g', 'species': 's'
        }
        
        stop_adding = False
        previous_name = "root"
        
        for rank in RANK_ORDER:
            if stop_adding:
                # Add explicit Unclassified for remaining ranks
                parts.append(f"{prefix_map[rank]}__Unclassified_{previous_name}")
            elif rank in assignment.taxonomy:
                name = assignment.taxonomy[rank]
                conf = assignment.confidence.get(rank, 0)
                
                if conf >= self.thresholds.get(rank, 80):
                    parts.append(f"{prefix_map[rank]}__{name}")
                    previous_name = name
                else:
                    # Below threshold - mark unclassified
                    parts.append(f"{prefix_map[rank]}__Unclassified_{previous_name}")
                    stop_adding = True
            else:
                parts.append(f"{prefix_map[rank]}__Unclassified_{previous_name}")
                stop_adding = True
        
        return ";".join(parts)
    
    def _create_unassigned(self, asv_id: str) -> TaxonomyAssignment:
        """Create unassigned taxonomy"""
        return TaxonomyAssignment(
            asv_id=asv_id,
            taxonomy={},
            confidence={},
            assignment_method="unassigned",
            confident_rank="none",
            unclassified_at="kingdom",
            formatted_taxonomy="k__Unclassified",
        )
    
    def assign_batch(
        self,
        asv_hits: Dict[str, List[BlastHit]],  # asv_id -> hits
        silva_taxonomies: Optional[Dict[str, Dict[str, str]]] = None
    ) -> LCAResult:
        """Assign taxonomy to multiple ASVs"""
        start_time = datetime.now()
        
        assignments = []
        
        for asv_id, hits in asv_hits.items():
            silva_tax = silva_taxonomies.get(asv_id) if silva_taxonomies else None
            assignment = self.assign_taxonomy(asv_id, hits, silva_tax)
            assignments.append(assignment)
        
        # Calculate statistics
        assigned = [a for a in assignments if a.taxonomy]
        conflicts = [a for a in assignments if a.taxonomy_conflict]
        
        avg_confidence = 0
        if assignments:
            all_conf = []
            for a in assignments:
                all_conf.extend(a.confidence.values())
            if all_conf:
                avg_confidence = np.mean(all_conf)
        
        processing_time = (datetime.now() - start_time).total_seconds()
        
        return LCAResult(
            assignments=assignments,
            assigned_count=len(assigned),
            unassigned_count=len(assignments) - len(assigned),
            conflict_count=len(conflicts),
            average_confidence=avg_confidence,
            processing_time_seconds=processing_time,
            thresholds=self.thresholds,
            dominance_threshold=self.dominance_threshold,
            collapse_threshold=self.collapse_threshold,
        )


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def assign_taxonomy_lca(
    asv_hits: Dict[str, List[BlastHit]],
    silva_taxonomies: Optional[Dict[str, Dict[str, str]]] = None,
    thresholds: Optional[Dict[str, int]] = None
) -> LCAResult:
    """Convenience function for LCA taxonomy assignment"""
    calculator = WeightedLCACalculator(bootstrap_thresholds=thresholds)
    return calculator.assign_batch(asv_hits, silva_taxonomies)


def get_lca_documentation() -> Dict[str, Any]:
    """Get LCA algorithm documentation"""
    return {
        "algorithm": "Weighted LCA",
        "weight_formula": "bitscore × alignment_length",
        "features": [
            "Single-taxon dominance shortcut (≥80% weight → direct assignment)",
            "Rank collapse when top two weights differ by <10%",
            "BLAST/SILVA conflict detection with conservative resolution",
            "Explicit 'Unclassified_<parent>' states",
        ],
        "bootstrap_thresholds": BOOTSTRAP_THRESHOLDS,
        "threshold_notes": {
            "species": "90-95% = putative species, ≥95% = high confidence",
            "kingdom": "Raised to 70% to prevent spurious eukaryote/prokaryote flips",
        },
        "conflict_handling": "BLAST–SILVA disagreement at <rank>; conservative rank retained",
    }


# =============================================================================
# MAIN (for testing)
# =============================================================================

if __name__ == "__main__":
    # Create test hits
    test_hits = {
        "ASV_1": [
            BlastHit(
                asv_id="ASV_1",
                accession="NC_012345.1",
                taxid=12345,
                species="Thunnus albacares",
                pident=98.5,
                length=450,
                bitscore=850,
                qcovs=95,
                taxonomy={
                    "kingdom": "Animalia",
                    "phylum": "Chordata",
                    "class": "Actinopterygii",
                    "order": "Perciformes",
                    "family": "Scombridae",
                    "genus": "Thunnus",
                    "species": "Thunnus albacares"
                }
            ),
            BlastHit(
                asv_id="ASV_1",
                accession="NC_012346.1",
                taxid=12346,
                species="Thunnus obesus",
                pident=95.2,
                length=445,
                bitscore=780,
                qcovs=93,
                taxonomy={
                    "kingdom": "Animalia",
                    "phylum": "Chordata",
                    "class": "Actinopterygii",
                    "order": "Perciformes",
                    "family": "Scombridae",
                    "genus": "Thunnus",
                    "species": "Thunnus obesus"
                }
            ),
        ],
        "ASV_2": [
            BlastHit(
                asv_id="ASV_2",
                accession="NC_054321.1",
                taxid=54321,
                species="Sardina pilchardus",
                pident=99.8,
                length=500,
                bitscore=950,
                qcovs=99,
                taxonomy={
                    "kingdom": "Animalia",
                    "phylum": "Chordata",
                    "class": "Actinopterygii",
                    "order": "Clupeiformes",
                    "family": "Clupeidae",
                    "genus": "Sardina",
                    "species": "Sardina pilchardus"
                }
            ),
        ],
    }
    
    # Run LCA
    calculator = WeightedLCACalculator()
    result = calculator.assign_batch(test_hits)
    
    print(f"\nLCA Taxonomy Assignment:")
    print(f"  Assigned: {result.assigned_count}/{len(test_hits)}")
    print(f"  Conflicts: {result.conflict_count}")
    print(f"  Avg confidence: {result.average_confidence:.1f}%")
    
    for assignment in result.assignments:
        print(f"\n  {assignment.asv_id}:")
        print(f"    Method: {assignment.assignment_method}")
        print(f"    Confident rank: {assignment.confident_rank}")
        print(f"    Taxonomy: {assignment.formatted_taxonomy}")
        if assignment.taxonomy_conflict:
            print(f"    CONFLICT at {assignment.conflict_rank}!")
    
    print(f"\n\nAlgorithm documentation:")
    doc = get_lca_documentation()
    print(f"  Weight formula: {doc['weight_formula']}")
    print(f"  Features: {len(doc['features'])}")
