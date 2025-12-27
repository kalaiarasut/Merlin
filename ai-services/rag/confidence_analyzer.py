"""
Confidence Analyzer for RAG Pipeline

CORE RULE #4: Mandatory Limitations Section
- Every response MUST include limitations
- Makes the system academically honest
- Matches real research writing standards
- Protects the organization legally & academically

Also implements Human-in-the-Loop (HITL) flag:
- expert_review_required: boolean flag when confidence is low
"""

import logging
from typing import List, Dict, Any, Set

logger = logging.getLogger(__name__)


class ConfidenceAnalyzer:
    """
    Analyze retrieval quality and generate academic limitations.
    
    Implements:
    - Core Rule #4: Mandatory Limitations Section
    - HITL flag: expert_review_required
    """
    
    # Thresholds for confidence scoring
    HIGH_CONFIDENCE_THRESHOLD = 0.7
    MEDIUM_CONFIDENCE_THRESHOLD = 0.5
    LOW_CONFIDENCE_THRESHOLD = 0.3
    
    # Environment adaptation warnings
    ENVIRONMENT_ADAPTATIONS = {
        "estuary": ["coastal", "marine", "ocean"],
        "freshwater": ["marine", "saltwater", "ocean"],
        "deep-sea": ["coastal", "shallow", "reef"],
        "tropical": ["temperate", "cold-water", "arctic"],
        "arctic": ["tropical", "warm-water", "equatorial"],
        "coral reef": ["open ocean", "pelagic", "deep-sea"],
    }
    
    def analyze(
        self,
        query: str,
        retrieval_results: Dict[str, List[Dict]],
        method_types: List[str],
        available_doc_ids: List[str] = None
    ) -> Dict[str, Any]:
        """
        Analyze confidence and generate academic limitations.
        
        Args:
            query: Original user query
            retrieval_results: Dict with 'sops' and 'papers' lists
            method_types: Detected method types from classifier
            available_doc_ids: All document IDs that were available
            
        Returns:
            Dict with confidence_score, limitations, expert_review_required
        """
        sops = retrieval_results.get("sops", [])
        papers = retrieval_results.get("papers", [])
        
        sop_count = len(sops)
        paper_count = len(papers)
        total_docs = sop_count + paper_count
        
        # Calculate base confidence score
        confidence = self._calculate_confidence(sops, papers)
        
        # Generate limitations based on retrieval quality
        limitations = self._generate_limitations(
            query=query,
            sops=sops,
            papers=papers,
            method_types=method_types,
            confidence=confidence
        )
        
        # Determine if expert review is required
        expert_review_required = self._should_require_expert_review(
            confidence=confidence,
            sop_count=sop_count,
            limitations=limitations
        )
        
        result = {
            "confidence_score": round(confidence, 2),
            "limitations": limitations,
            "expert_review_required": expert_review_required,
            "retrieval_stats": {
                "sop_count": sop_count,
                "paper_count": paper_count,
                "total_documents": total_docs,
                "method_types_detected": method_types
            }
        }
        
        if expert_review_required:
            logger.info(f"Expert review flagged for query: {query[:50]}...")
        
        return result
    
    def _calculate_confidence(
        self,
        sops: List[Dict],
        papers: List[Dict]
    ) -> float:
        """
        Calculate confidence score based on retrieval quality.
        
        Scoring:
        - SOPs contribute more than papers (Rule #2)
        - Distance/similarity affects score
        - More documents increase confidence (to a point)
        """
        score = 0.0
        
        # SOP contribution (weighted higher)
        for i, sop in enumerate(sops[:5]):  # Max 5 SOPs
            distance = sop.get("distance", 1.0)
            # Lower distance = higher similarity = higher score
            similarity = max(0, 1 - distance)
            # First SOP contributes most
            weight = 0.3 - (i * 0.05)  # 0.3, 0.25, 0.2, 0.15, 0.1
            score += similarity * weight
        
        # Paper contribution (weighted lower)
        for i, paper in enumerate(papers[:3]):  # Max 3 papers
            distance = paper.get("distance", 1.0)
            similarity = max(0, 1 - distance)
            weight = 0.1 - (i * 0.02)  # 0.1, 0.08, 0.06
            score += similarity * weight
        
        # Cap at 1.0
        return min(1.0, score)
    
    def _generate_limitations(
        self,
        query: str,
        sops: List[Dict],
        papers: List[Dict],
        method_types: List[str],
        confidence: float
    ) -> List[str]:
        """Generate academically-appropriate limitation statements."""
        limitations = []
        query_lower = query.lower()
        
        # Check for missing SOPs
        if len(sops) == 0:
            limitations.append(
                "⚠️ No authoritative SOPs found - methodology derived from papers only. "
                "Consider developing institutional SOPs for this method type."
            )
        
        # Check for low confidence
        if confidence < self.LOW_CONFIDENCE_THRESHOLD:
            limitations.append(
                "⚠️ Limited document coverage detected. "
                "This protocol may require significant expert validation before use."
            )
        elif confidence < self.MEDIUM_CONFIDENCE_THRESHOLD:
            limitations.append(
                "⚠️ Moderate document coverage. "
                "Site-specific validation is recommended before field implementation."
            )
        
        # Check for environment adaptations
        for target_env, source_envs in self.ENVIRONMENT_ADAPTATIONS.items():
            if target_env in query_lower:
                for source_env in source_envs:
                    all_content = " ".join([
                        d.get("content", "") for d in sops + papers
                    ]).lower()
                    if source_env in all_content and target_env not in all_content:
                        limitations.append(
                            f"⚠️ Protocol adapted from {source_env} SOPs. "
                            f"{target_env.title()}-specific validation may be required."
                        )
                        break
        
        # Check for method type mismatch
        if not method_types:
            limitations.append(
                "⚠️ Query did not match specific method categories. "
                "Results may be less targeted than specialized queries."
            )
        
        # Check document recency if metadata available
        old_docs = []
        for doc in sops + papers:
            version = doc.get("metadata", {}).get("version", "")
            if version and "2020" in version or "2019" in version or "2018" in version:
                old_docs.append(doc.get("doc_id", "Unknown"))
        
        if old_docs:
            limitations.append(
                f"⚠️ Some referenced documents may be outdated ({', '.join(old_docs[:3])}). "
                "Check for more recent protocol updates."
            )
        
        # Always add a general note about validation
        if not limitations:
            limitations.append(
                "ℹ️ This methodology is generated from available protocols. "
                "Always validate protocols against current institutional guidelines."
            )
        
        return limitations
    
    def _should_require_expert_review(
        self,
        confidence: float,
        sop_count: int,
        limitations: List[str]
    ) -> bool:
        """
        Determine if expert review should be flagged.
        
        Returns True when:
        - Confidence is below threshold
        - No SOPs found
        - Multiple serious limitations
        - Protocol is heavily adapted
        """
        # Low confidence
        if confidence < self.MEDIUM_CONFIDENCE_THRESHOLD:
            return True
        
        # No SOPs (only papers)
        if sop_count == 0:
            return True
        
        # Multiple warnings
        warning_count = sum(1 for l in limitations if "⚠️" in l)
        if warning_count >= 2:
            return True
        
        return False
    
    def format_limitations_section(self, limitations: List[str]) -> str:
        """Format limitations as a clean markdown section."""
        if not limitations:
            return ""
        
        lines = ["\n---", "**⚠️ Limitations & Notes:**\n"]
        for limitation in limitations:
            lines.append(f"- {limitation}")
        
        return "\n".join(lines)


# Singleton instance
_confidence_analyzer = None


def get_confidence_analyzer() -> ConfidenceAnalyzer:
    """Get the singleton ConfidenceAnalyzer instance."""
    global _confidence_analyzer
    if _confidence_analyzer is None:
        _confidence_analyzer = ConfidenceAnalyzer()
    return _confidence_analyzer
