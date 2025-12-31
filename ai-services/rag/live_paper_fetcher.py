"""
Live Paper Fetcher - Real-time Academic Paper Search

Fetches papers from Semantic Scholar and Europe PMC,
extracts methods sections, and returns structured data.
"""

import logging
import httpx
import re
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

# API endpoints
SEMANTIC_SCHOLAR_API = "https://api.semanticscholar.org/graph/v1"
EUROPE_PMC_API = "https://www.ebi.ac.uk/europepmc/webservices/rest"
PROTOCOLS_IO_API = "https://www.protocols.io/api/v4/protocols/public"


@dataclass
class PaperSource:
    """Structured paper source with provenance."""
    doc_id: str
    title: str
    authors: str
    year: int
    journal: str
    doi: Optional[str]
    citation_count: int
    methods_text: str
    source_type: str  # 'peer_reviewed', 'preprint', 'protocols_io', 'fao'
    trust_score: float
    semantic_similarity: float = 0.0
    final_score: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# Trust scores by source type
TRUST_SCORES = {
    'fao': 1.0,
    'ices': 1.0,
    'protocols_io_verified': 0.85,
    'peer_reviewed': 0.8,
    'protocols_io': 0.7,
    'preprint': 0.4,
    'unknown': 0.3
}


class LivePaperFetcher:
    """Fetches real papers from academic APIs."""
    
    def __init__(self):
        self.timeout = 30.0
        self._cache: Dict[str, List[PaperSource]] = {}
    
    async def search_papers(
        self,
        query: str,
        method_type: Optional[str] = None,
        limit: int = 10
    ) -> List[PaperSource]:
        """
        Search for papers and extract methods sections.
        
        Args:
            query: Search query
            method_type: Optional method type for cache key
            limit: Max papers to return
            
        Returns:
            List of PaperSource objects with methods text
        """
        # Check cache
        cache_key = f"{method_type or 'general'}:{query[:50]}"
        if cache_key in self._cache:
            logger.info(f"Cache hit for: {cache_key}")
            return self._cache[cache_key]
        
        papers = []
        
        # Fetch from Semantic Scholar
        ss_papers = await self._search_semantic_scholar(query, limit)
        papers.extend(ss_papers)
        
        # Fetch from Europe PMC (has full text)
        pmc_papers = await self._search_europe_pmc(query, limit)
        papers.extend(pmc_papers)
        
        # Fetch from Protocols.io (lab methods)
        proto_papers = await self._search_protocols_io(query, limit)
        papers.extend(proto_papers)
        
        # Deduplicate by DOI
        papers = self._deduplicate(papers)
        
        # Sort by final score
        papers.sort(key=lambda p: p.final_score, reverse=True)
        
        # Cache results
        self._cache[cache_key] = papers[:limit]
        
        return papers[:limit]
    
    async def _search_semantic_scholar(
        self,
        query: str,
        limit: int = 10
    ) -> List[PaperSource]:
        """Search Semantic Scholar API."""
        papers = []
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{SEMANTIC_SCHOLAR_API}/paper/search",
                    params={
                        "query": query,
                        "limit": limit,
                        "fields": "title,authors,year,venue,citationCount,abstract,externalIds"
                    }
                )
                
                if response.status_code != 200:
                    logger.warning(f"Semantic Scholar returned {response.status_code}")
                    return []
                
                data = response.json()
                
                for paper in data.get("data", []):
                    # Determine source type
                    venue = paper.get("venue", "").lower()
                    source_type = self._classify_source_type(venue)
                    
                    # Extract methods from abstract (simplified)
                    abstract = paper.get("abstract", "") or ""
                    methods_text = self._extract_methods_hint(abstract)
                    
                    # Get DOI
                    external_ids = paper.get("externalIds", {}) or {}
                    doi = external_ids.get("DOI")
                    
                    # Calculate trust and final score
                    trust_score = TRUST_SCORES.get(source_type, 0.5)
                    citation_count = paper.get("citationCount", 0) or 0
                    citation_weight = min(citation_count / 100, 1.0)  # Normalize to 0-1
                    final_score = (0.4 * 0.7) + (0.3 * citation_weight) + (0.3 * trust_score)
                    
                    papers.append(PaperSource(
                        doc_id=f"SS_{paper.get('paperId', '')[:8]}",
                        title=paper.get("title", "Untitled"),
                        authors=", ".join([a.get("name", "") for a in (paper.get("authors", []) or [])[:3]]),
                        year=paper.get("year", 0) or 0,
                        journal=paper.get("venue", "Unknown"),
                        doi=doi,
                        citation_count=citation_count,
                        methods_text=methods_text,
                        source_type=source_type,
                        trust_score=trust_score,
                        final_score=final_score
                    ))
                    
        except Exception as e:
            logger.error(f"Semantic Scholar search failed: {e}")
        
        return papers
    
    async def _search_europe_pmc(
        self,
        query: str,
        limit: int = 10
    ) -> List[PaperSource]:
        """Search Europe PMC API (has full text for open access)."""
        papers = []
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{EUROPE_PMC_API}/search",
                    params={
                        "query": f"{query} AND (METHODS OR methodology)",
                        "format": "json",
                        "pageSize": limit,
                        "resultType": "core"
                    }
                )
                
                if response.status_code != 200:
                    logger.warning(f"Europe PMC returned {response.status_code}")
                    return []
                
                data = response.json()
                
                for result in data.get("resultList", {}).get("result", []):
                    # Determine source type
                    source_type = 'peer_reviewed' if result.get("pubType") != "preprint" else 'preprint'
                    
                    # Extract methods from abstract
                    abstract = result.get("abstractText", "") or ""
                    methods_text = self._extract_methods_hint(abstract)
                    
                    # Calculate scores
                    trust_score = TRUST_SCORES.get(source_type, 0.5)
                    citation_count = result.get("citedByCount", 0) or 0
                    citation_weight = min(citation_count / 100, 1.0)
                    final_score = (0.4 * 0.7) + (0.3 * citation_weight) + (0.3 * trust_score)
                    
                    papers.append(PaperSource(
                        doc_id=f"PMC_{result.get('id', '')[:8]}",
                        title=result.get("title", "Untitled"),
                        authors=result.get("authorString", "Unknown")[:100],
                        year=int(result.get("pubYear", 0) or 0),
                        journal=result.get("journalTitle", "Unknown"),
                        doi=result.get("doi"),
                        citation_count=citation_count,
                        methods_text=methods_text,
                        source_type=source_type,
                        trust_score=trust_score,
                        final_score=final_score
                    ))
                    
        except Exception as e:
            logger.error(f"Europe PMC search failed: {e}")
        
        return papers
    
    async def _search_protocols_io(
        self,
        query: str,
        limit: int = 5
    ) -> List[PaperSource]:
        """Search protocols.io for verified methods."""
        papers = []
        
        try:
            # Note: Using public search API. In production, this might need an API key.
            # Using a simplified public endpoint or safe fallback if auth required.
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # We'll try the public endpoint. If it fails due to auth (likely),
                # we return an empty list or specific error without crashing.
                # Currently simulating as many endpoints are protected.
                
                # Check for API Key in env, if not present, we might skip or try public scrape
                import os
                api_token = os.environ.get("PROTOCOLS_IO_TOKEN")
                
                if not api_token:
                    # Without a token, we can't reliably search the formal API.
                    # We will log a warning and skip to avoid errors.
                    # logger.info("Skipping protocols.io search: No PROTOCOLS_IO_TOKEN found.")
                    return []

                response = await client.get(
                    PROTOCOLS_IO_API,
                    params={
                        "filter": query,
                        "page_id": 1,
                        "page_size": limit
                    },
                    headers={"Authorization": f"Bearer {api_token}"}
                )
                
                if response.status_code != 200:
                    logger.warning(f"Protocols.io returned {response.status_code}")
                    return []
                
                data = response.json()
                
                for item in data.get("items", []):
                    # Extract standard fields
                    title = item.get("title", "Untitled Protocol")
                    doi = item.get("doi", "")
                    abstract = item.get("description", "") or ""
                    
                    # Clean html from abstract
                    clean_abstract = re.sub('<[^<]+?>', '', abstract)
                    methods_text = self._extract_methods_hint(clean_abstract)
                    
                    # Metrics
                    citation_count = 0 # API might not return this easily
                    trust_score = TRUST_SCORES.get('protocols_io_verified', 0.85)
                    
                    final_score = (0.4 * 0.8) + (0.3 * 0.0) + (0.3 * trust_score) # High relevance assumed
                    
                    papers.append(PaperSource(
                        doc_id=f"PIO_{item.get('id', '')}",
                        title=title,
                        authors=item.get("authors", "Unknown"),
                        year=2024, # Default or extract timestamp
                        journal="protocols.io",
                        doi=doi,
                        citation_count=citation_count,
                        methods_text=methods_text,
                        source_type="protocols_io",
                        trust_score=trust_score,
                        final_score=final_score
                    ))
                    
        except Exception as e:
            logger.error(f"Protocols.io search failed: {e}")
            
        return papers
    
    def _classify_source_type(self, venue: str) -> str:
        """Classify source type based on venue name."""
        venue_lower = venue.lower()
        
        if 'fao' in venue_lower:
            return 'fao'
        elif 'ices' in venue_lower:
            return 'ices'
        elif 'protocols.io' in venue_lower:
            return 'protocols_io'
        elif 'biorxiv' in venue_lower or 'medrxiv' in venue_lower or 'preprint' in venue_lower:
            return 'preprint'
        elif venue:
            return 'peer_reviewed'
        else:
            return 'unknown'
    
    def _extract_methods_hint(self, abstract: str) -> str:
        """Extract methods-related sentences from abstract."""
        if not abstract:
            return ""
        
        # Look for methods keywords
        methods_keywords = [
            'method', 'protocol', 'procedure', 'technique',
            'sampl', 'collect', 'analy', 'extract', 'process'
        ]
        
        sentences = abstract.split('.')
        methods_sentences = []
        
        for sentence in sentences:
            sentence_lower = sentence.lower()
            if any(kw in sentence_lower for kw in methods_keywords):
                methods_sentences.append(sentence.strip())
        
        return '. '.join(methods_sentences[:3]) + '.' if methods_sentences else abstract[:500]
    
    def _deduplicate(self, papers: List[PaperSource]) -> List[PaperSource]:
        """Remove duplicate papers by DOI."""
        seen_dois = set()
        unique = []
        
        for paper in papers:
            if paper.doi:
                if paper.doi not in seen_dois:
                    seen_dois.add(paper.doi)
                    unique.append(paper)
            else:
                # Keep papers without DOI (can't dedupe)
                unique.append(paper)
        
        return unique
    
    def clear_cache(self):
        """Clear the paper cache."""
        self._cache.clear()


# Singleton
_fetcher = None

def get_live_paper_fetcher() -> LivePaperFetcher:
    global _fetcher
    if _fetcher is None:
        _fetcher = LivePaperFetcher()
    return _fetcher
