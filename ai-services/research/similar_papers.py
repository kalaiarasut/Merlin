"""
Similar Papers Recommendation using Semantic Scholar API
"""

import httpx
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

SEMANTIC_SCHOLAR_BASE = "https://api.semanticscholar.org/graph/v1"


async def get_similar_papers(paper_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Get similar/recommended papers for a given paper using Semantic Scholar.
    
    Args:
        paper_id: DOI or Semantic Scholar paper ID
        limit: Maximum number of recommendations
        
    Returns:
        List of similar papers with metadata
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Use DOI or S2 paper ID
            paper_ref = f"DOI:{paper_id}" if "/" in paper_id else paper_id
            
            params = {
                'fields': 'title,authors,year,citationCount,abstract,venue,externalIds',
                'limit': limit
            }
            
            response = await client.get(
                f"{SEMANTIC_SCHOLAR_BASE}/paper/{paper_ref}/recommendations",
                params=params
            )
            response.raise_for_status()
            
            data = response.json()
            recommendations = data.get('recommendedPapers', [])
            
            similar_papers = []
            for paper in recommendations:
                authors_list = paper.get('authors', [])
                authors_str = ', '.join([a.get('name', '') for a in authors_list[:3]])
                if len(authors_list) > 3:
                    authors_str += ' et al.'
                
                external_ids = paper.get('externalIds', {})
                
                similar_papers.append({
                    'title': paper.get('title', ''),
                    'authors': authors_str,
                    'year': paper.get('year'),
                    'citations': paper.get('citationCount', 0),
                    'abstract': paper.get('abstract', ''),
                    'journal': paper.get('venue', ''),
                    'doi': external_ids.get('DOI'),
                    'similarity_score': 0.8  # S2 doesn't provide explicit score
                })
            
            logger.info(f"Found {len(similar_papers)} similar papers for {paper_id}")
            return similar_papers
            
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            logger.info(f"Paper {paper_id} not found in Semantic Scholar database (may be too recent)")
            return []
        logger.error(f"HTTP error getting similar papers: {e}")
        return []
    except Exception as e:
        logger.error(f"Failed to get similar papers: {e}")
        return []
