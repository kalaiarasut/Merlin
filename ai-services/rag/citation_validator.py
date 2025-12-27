"""
Citation Validator for RAG Pipeline

CORE RULE #3: Citation Anchoring (Mandatory)
- Every step MUST reference at least one document ID
- If no document supports a step, that step MUST NOT be generated
- Prevents fake citations and protects against hallucination
"""

import re
import logging
from typing import List, Dict, Set, Tuple

logger = logging.getLogger(__name__)


# Citation-forcing prompt to inject into LLM context
CITATION_PROMPT = """
CRITICAL CITATION RULES - YOU MUST FOLLOW THESE:

1. Every methodology step MUST end with a citation tag: [D1], [D2], etc.
2. If no document supports a step, do NOT include that step.
3. Do NOT synthesize or hallucinate steps not explicitly in the documents.
4. Use multiple citations if a step draws from multiple sources: [D1, D3]
5. ONLY use document IDs that are provided in the context below.

CORRECT FORMAT:
1. Collect 1L water samples using sterile Nalgene bottles [D1]
2. Filter within 2 hours using 0.45μm membrane filters [D1, D3]
3. Store filters at -20°C until extraction [D1]

WRONG FORMAT (DO NOT DO THIS):
1. Collect water samples using appropriate containers
2. Filter as soon as possible
3. Store at low temperature

Every step without a citation is INVALID and will be rejected.
"""


class CitationValidator:
    """
    Validate and enforce citations in LLM-generated methodologies.
    
    Implements Core Rule #3: Citation Anchoring
    - Extracts all citations from response
    - Validates against available document IDs
    - Calculates coverage metrics
    """
    
    # Pattern to match citation tags like [D1], [D2, D3], [D1, D2, D3]
    CITATION_PATTERN = re.compile(r'\[D\d+(?:,\s*D\d+)*\]')
    SINGLE_ID_PATTERN = re.compile(r'D\d+')
    
    def validate_citations(
        self, 
        response: str, 
        available_doc_ids: List[str]
    ) -> Dict:
        """
        Validate that all citations in response are real.
        
        Args:
            response: LLM-generated methodology text
            available_doc_ids: List of valid document IDs (e.g., ["D1", "D2", "D3"])
            
        Returns:
            Dict with validation results
        """
        # Find all citation blocks [D1], [D2, D3], etc.
        citation_blocks = self.CITATION_PATTERN.findall(response)
        
        # Extract individual IDs from all blocks
        all_cited: Set[str] = set()
        for block in citation_blocks:
            ids = self.SINGLE_ID_PATTERN.findall(block)
            all_cited.update(ids)
        
        # Check for invalid citations (cited but not in available)
        available_set = set(available_doc_ids)
        invalid_citations = all_cited - available_set
        valid_citations = all_cited & available_set
        
        # Check for unused documents
        unused_documents = available_set - all_cited
        
        # Calculate coverage
        coverage = len(valid_citations) / len(available_set) if available_set else 0.0
        
        # Check if response has any steps without citations
        uncited_steps = self._find_uncited_steps(response)
        
        result = {
            "valid": len(invalid_citations) == 0 and len(uncited_steps) == 0,
            "cited_documents": sorted(list(valid_citations)),
            "invalid_citations": sorted(list(invalid_citations)),
            "unused_documents": sorted(list(unused_documents)),
            "citation_coverage": round(coverage, 2),
            "total_citation_blocks": len(citation_blocks),
            "uncited_steps": uncited_steps,
            "has_uncited_steps": len(uncited_steps) > 0
        }
        
        if invalid_citations:
            logger.warning(f"Invalid citations detected: {invalid_citations}")
        
        if uncited_steps:
            logger.warning(f"Uncited steps detected: {len(uncited_steps)} steps")
        
        return result
    
    def _find_uncited_steps(self, response: str) -> List[str]:
        """
        Find methodology steps that don't have citations.
        
        Looks for numbered steps (1., 2., etc.) or bullet points
        that don't end with a citation tag.
        """
        uncited = []
        
        # Split into lines and check each potential step
        lines = response.split('\n')
        step_pattern = re.compile(r'^\s*(\d+[\.\)]\s*|-\s*|\*\s*)')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Check if it looks like a step
            if step_pattern.match(line):
                # Check if it has a citation at the end
                if not self.CITATION_PATTERN.search(line):
                    # Skip headers and short lines
                    if len(line) > 20 and not line.endswith(':'):
                        uncited.append(line[:100] + "..." if len(line) > 100 else line)
        
        return uncited
    
    def extract_citations(self, response: str) -> List[str]:
        """Extract all unique citation IDs from response."""
        all_cited: Set[str] = set()
        citation_blocks = self.CITATION_PATTERN.findall(response)
        for block in citation_blocks:
            ids = self.SINGLE_ID_PATTERN.findall(block)
            all_cited.update(ids)
        return sorted(list(all_cited))
    
    def get_citation_prompt(self) -> str:
        """Get the citation-forcing prompt to inject into LLM context."""
        return CITATION_PROMPT
    
    def format_documents_with_ids(
        self, 
        sops: List[Dict], 
        papers: List[Dict]
    ) -> Tuple[str, List[str]]:
        """
        Format documents with clean IDs for LLM context.
        
        Returns:
            Tuple of (formatted_context, list_of_doc_ids)
        """
        context_parts = []
        doc_ids = []
        
        # SOPs first (PRIMARY - Rule #2)
        if sops:
            context_parts.append("=== AUTHORITATIVE SOPs (PRIMARY SOURCE - Use these first) ===\n")
            for doc in sops:
                doc_id = doc.get("doc_id", "D?")
                doc_ids.append(doc_id)
                title = doc.get("metadata", {}).get("title", "Untitled")
                source = doc.get("metadata", {}).get("source", "Unknown source")
                content = doc.get("content", "")
                
                context_parts.append(f"[{doc_id}] {title}")
                context_parts.append(f"Source: {source}")
                context_parts.append(f"Content:\n{content}\n")
        
        # Papers second (SUPPORTING)
        if papers:
            context_parts.append("\n=== SUPPORTING PAPERS (Secondary reference) ===\n")
            for doc in papers:
                doc_id = doc.get("doc_id", "D?")
                doc_ids.append(doc_id)
                title = doc.get("metadata", {}).get("title", "Untitled")
                source = doc.get("metadata", {}).get("source", "Unknown source")
                content = doc.get("content", "")
                
                context_parts.append(f"[{doc_id}] {title}")
                context_parts.append(f"Source: {source}")
                context_parts.append(f"Content:\n{content}\n")
        
        return "\n".join(context_parts), doc_ids


# Singleton instance
_citation_validator = None


def get_citation_validator() -> CitationValidator:
    """Get the singleton CitationValidator instance."""
    global _citation_validator
    if _citation_validator is None:
        _citation_validator = CitationValidator()
    return _citation_validator
