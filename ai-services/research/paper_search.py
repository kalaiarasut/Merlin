"""
Research Paper Search Service

Integrates Europe PMC (content) and Semantic Scholar (credibility/ranking)
for comprehensive academic paper search with smart merging and ranking.
"""

import httpx
import hashlib
import json
import math
import os
from datetime import datetime
from difflib import SequenceMatcher
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

# API Base URLs
EUROPE_PMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest"
SEMANTIC_SCHOLAR_BASE = "https://api.semanticscholar.org/graph/v1"

# Semantic Scholar API key (optional, increases rate limit 100→1000/5min)
SEMANTIC_SCHOLAR_API_KEY = os.getenv("SEMANTIC_SCHOLAR_API_KEY")

@dataclass
class SearchFilters:
    """Advanced search filters for paper search."""
    year_min: Optional[int] = None
    year_max: Optional[int] = None
    open_access_only: bool = False
    min_citations: int = 0

# Redis cache for 3-level caching (epmc, s2, merged)
try:
    from utils.redis_cache import cache_get, cache_set
    REDIS_AVAILABLE = True
    logger.info("Redis caching enabled for paper search")
except ImportError:
    REDIS_AVAILABLE = False
    logger.warning("Redis not available, using in-memory cache (not production-ready)")
    _cache: Dict[str, str] = {}

def _cache_get_fallback(key: str) -> Optional[str]:
    """Fallback cache get if Redis unavailable."""
    if REDIS_AVAILABLE:
        return cache_get(key)
    return _cache.get(key)

def _cache_set_fallback(key: str, value: str, ttl: int = 86400):
    """Fallback cache set if Redis unavailable."""
    if REDIS_AVAILABLE:
        cache_set(key, value, ttl_seconds=ttl)
    else:
        _cache[key] = value


def apply_filters(papers: List[Dict[str, Any]], filters: SearchFilters) -> List[Dict[str, Any]]:
    """
    Apply hard filters to papers.
    
    Args:
        papers: List of papers to filter
        filters: SearchFilters object with criteria
        
    Returns:
        Filtered list of papers
    """
    filtered = papers
    
    # Year range filter
    if filters.year_min or filters.year_max:
        filtered = [
            p for p in filtered
            if p.get('year') and (
                (not filters.year_min or p['year'] >= filters.year_min) and
                (not filters.year_max or p['year'] <= filters.year_max)
            )
        ]
    
    # Open access filter
    if filters.open_access_only:
        filtered = [p for p in filtered if p.get('is_open_access')]
    
    # Min citations filter
    if filters.min_citations > 0:
        filtered = [p for p in filtered if p.get('citations', 0) >= filters.min_citations]
    
    return filtered


def normalize_title(title: str) -> str:
    """
    Normalize paper title for fuzzy matching.
    
    Removes punctuation, converts to lowercase, removes extra whitespace.
    """
    import re
    # Convert to lowercase
    title = title.lower()
    # Remove punctuation except spaces
    title = re.sub(r'[^\w\s]', '', title)
    # Remove extra whitespace
    title = ' '.join(title.split())
    return title


def fuzzy_match(str1: str, str2: str) -> float:
    """
    Calculate similarity ratio between two strings.
    
    Returns:
        float: Similarity ratio between 0 and 1
    """
    return SequenceMatcher(None, str1, str2).ratio()


async def search_europe_pmc(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Search Europe PMC for papers.
    
    Args:
        query: Search query
        limit: Maximum number of results
        
    Returns:
        List of paper dictionaries with abstracts and metadata
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            params = {
                'query': query,
                'format': 'json',
                'pageSize': limit,
                'resultType': 'core'  # Cleaner results, filters noise
            }
            
            response = await client.get(f"{EUROPE_PMC_BASE}/search", params=params)
            response.raise_for_status()
            
            data = response.json()
            results = data.get('resultList', {}).get('result', [])
            
            papers = []
            for paper in results:
                papers.append({
                    'title': paper.get('title', ''),
                    'doi': paper.get('doi'),
                    'pmid': paper.get('pmid'),
                    'authors': paper.get('authorString', ''),
                    'year': int(paper.get('pubYear', 0)) if paper.get('pubYear') else None,
                    'journal': paper.get('journalTitle', ''),
                    'abstract': paper.get('abstractText', ''),
                    'mesh_terms': paper.get('meshHeadingList', {}).get('meshHeading', []),
                    'is_open_access': paper.get('isOpenAccess') == 'Y',
                    'full_text_url': paper.get('fullTextUrlList', {}).get('fullTextUrl', []),
                    'source': 'epmc'
                })
            
            logger.info(f"Europe PMC returned {len(papers)} papers for query: {query}")
            return papers
            
    except Exception as e:
        logger.error(f"Europe PMC search failed: {e}")
        return []


async def search_semantic_scholar(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Search Semantic Scholar for papers.
    
    Args:
        query: Search query
        limit: Maximum number of results
        
    Returns:
        List of paper dictionaries with citation data
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            params = {
                'query': query,
                'limit': limit,
                # Explicit fields: reduces payload, improves speed
                'fields': 'title,authors,year,citationCount,influentialCitationCount,abstract,venue,externalIds,isOpenAccess,openAccessPdf'
            }
            
            # Add API key to headers if available (increases rate limit 100→1000/5min)
            headers = {}
            if SEMANTIC_SCHOLAR_API_KEY:
                headers['x-api-key'] = SEMANTIC_SCHOLAR_API_KEY
                logger.info("Using Semantic Scholar API key for higher rate limits")
            
            response = await client.get(
                f"{SEMANTIC_SCHOLAR_BASE}/paper/search",
                params=params,
                headers=headers
            )
            response.raise_for_status()
            
            data = response.json()
            results = data.get('data', [])
            
            papers = []
            for paper in results:
                # Format authors
                authors_list = paper.get('authors', [])
                authors_str = ', '.join([a.get('name', '') for a in authors_list[:3]])
                if len(authors_list) > 3:
                    authors_str += ' et al.'
                
                # Get DOI from external IDs
                external_ids = paper.get('externalIds', {})
                doi = external_ids.get('DOI')
                
                papers.append({
                    'title': paper.get('title', ''),
                    'doi': doi,
                    'authors': authors_str,
                    'year': paper.get('year'),
                    'citations': paper.get('citationCount', 0),
                    'influential_citations': paper.get('influentialCitationCount', 0),
                    'abstract': paper.get('abstract', ''),
                    'journal': paper.get('venue', ''),
                    'is_open_access': paper.get('isOpenAccess', False),
                    'pdf_url': paper.get('openAccessPdf', {}).get('url') if paper.get('openAccessPdf') else None,
                    'source': 's2'
                })
            
            logger.info(f"Semantic Scholar returned {len(papers)} papers for query: {query}")
            return papers
            
    except Exception as e:
        logger.error(f"Semantic Scholar search failed: {e}")
        return []


def merge_papers(epmc_results: List[Dict], s2_results: List[Dict]) -> List[Dict[str, Any]]:
    """
    Merge papers from both sources using DOI and fuzzy title matching.
    
    Strategy:
    1. Start with Semantic Scholar papers (for citation data)
    2. Enrich with Europe PMC content (abstracts, full text)
    3. Use fuzzy matching for papers without DOI
    
    Args:
        epmc_results: Papers from Europe PMC
        s2_results: Papers from Semantic Scholar
        
    Returns:
        List of merged papers with combined metadata
    """
    merged = {}
    
    # 1. Add Semantic Scholar papers first (for citation data)
    for paper in s2_results:
        doi = paper.get('doi')
        key = doi if doi else normalize_title(paper['title'])
        
        merged[key] = {
            'title': paper['title'],
            'doi': doi,
            'authors': paper['authors'],
            'year': paper.get('year'),
            'citations': paper.get('citations', 0),
            'influential_citations': paper.get('influential_citations', 0),
            'abstract': paper.get('abstract', ''),
            'journal': paper.get('journal', ''),
            'is_open_access': paper.get('is_open_access', False),
            'pdf_url': paper.get('pdf_url'),
            'source': 's2'
        }
    
    # 2. Enrich with Europe PMC content
    for paper in epmc_results:
        doi = paper.get('doi')
        
        # Try exact DOI match first
        if doi and doi in merged:
            # Enrich existing paper
            merged[doi].update({
                'abstract': paper.get('abstract') or merged[doi].get('abstract', ''),
                'journal': paper.get('journal') or merged[doi].get('journal', ''),
                'mesh_terms': paper.get('mesh_terms', []),
                'full_text_url': paper.get('full_text_url', []),
                'pmid': paper.get('pmid'),
                'source': 'both'
            })
        else:
            # Fuzzy title match for papers without DOI
            title_norm = normalize_title(paper['title'])
            matched = False
            
            for key, existing in list(merged.items()):
                existing_title_norm = normalize_title(existing['title'])
                similarity = fuzzy_match(title_norm, existing_title_norm)
                
                if similarity >= 0.85:  # 85% similarity threshold
                    # Merge into existing paper
                    existing.update({
                        'abstract': paper.get('abstract') or existing.get('abstract', ''),
                        'journal': paper.get('journal') or existing.get('journal', ''),
                        'doi': doi or existing.get('doi'),
                        'mesh_terms': paper.get('mesh_terms', []),
                        'full_text_url': paper.get('full_text_url', []),
                        'pmid': paper.get('pmid'),
                        'source': 'both' if existing.get('source') == 's2' else 'epmc'
                    })
                    matched = True
                    break
            
            # No match found, add as new paper from EPMC
            if not matched:
                key = doi if doi else title_norm
                merged[key] = {
                    'title': paper['title'],
                    'doi': doi,
                    'authors': paper['authors'],
                    'year': paper.get('year'),
                    'citations': 0,  # EPMC doesn't provide citations
                    'influential_citations': 0,
                    'abstract': paper.get('abstract', ''),
                    'journal': paper.get('journal', ''),
                    'is_open_access': paper.get('is_open_access', False),
                    'mesh_terms': paper.get('mesh_terms', []),
                    'full_text_url': paper.get('full_text_url', []),
                    'pmid': paper.get('pmid'),
                    'source': 'epmc'
                }
    
    logger.info(f"Merged {len(merged)} unique papers from {len(epmc_results)} EPMC + {len(s2_results)} S2 results")
    return list(merged.values())


def classify_query_intent(query: str) -> tuple[str, str]:
    """
    Classify query intent AND domain to adjust ranking weights.
    
    Intent Categories:
    - species: Species identification/taxonomy
    - ecology: Ecosystem, habitat, biodiversity
    - climate: Climate change, warming, acidification
    - methodology: Techniques, protocols, analysis methods
    - policy: Conservation, management, regulations
    
    Domain Categories:
    - marine: Ocean, reef, coastal, fish research
    - terrestrial: Land-based ecology
    - general: No specific domain
    
    Args:
        query: Search query string
        
    Returns:
        Tuple of (intent_category, domain_category)
    """
    query_lower = query.lower()
    
    # Detect domain first (marine vs terrestrial vs general)
    domain = 'general'
    marine_keywords = ['marine', 'ocean', 'reef', 'coastal', 'sea', 'fish', 'coral', 'aquatic', 'pelagic', 'benthic']
    terrestrial_keywords = ['terrestrial', 'forest', 'grassland', 'amphibian', 'mammal', 'bird', 'insect', 'mosquito']
    
    marine_count = sum(1 for word in marine_keywords if word in query_lower)
    terrestrial_count = sum(1 for word in terrestrial_keywords if word in query_lower)
    
    if marine_count > terrestrial_count and marine_count > 0:
        domain = 'marine'
    elif terrestrial_count > marine_count and terrestrial_count > 0:
        domain = 'terrestrial'
    
    # Detect intent
    intent = 'general'
    
    # Species-focused keywords
    if any(word in query_lower for word in ['species', 'taxonomy', 'identification', 'genus', 'family']):
        intent = 'species'
    
    # Climate keywords
    elif any(word in query_lower for word in ['climate', 'warming', 'temperature', 'acidification', 'bleaching']):
        intent = 'climate'
    
    # Methodology keywords
    elif any(word in query_lower for word in ['method', 'technique', 'protocol', 'analysis', 'edna', 'sampling', 'sequencing']):
        intent = 'methodology'
    
    # Policy keywords
    elif any(word in query_lower for word in ['conservation', 'management', 'policy', 'sustainable', 'protection', 'regulation']):
        intent = 'policy'
    
    # Ecology
    elif any(word in query_lower for word in ['ecology', 'ecosystem', 'habitat', 'biodiversity', 'population']):
        intent = 'ecology'
    
    return intent, domain


def rank_papers(papers: List[Dict[str, Any]], query_intent: str = 'general', domain: str = 'general') -> List[Dict[str, Any]]:
    """
    Rank papers using enhanced formula with citation velocity and intent-based weighting.
    
    Formula:
    score = (text_relevance * intent_weight) + (citation_velocity * 0.25) 
          + (open_access * 0.1) + (recency * 0.1)
    
    Citation Velocity = citations / (current_year - pub_year + 1)
    
    Args:
        papers: List of merged papers
        query_intent: Query category for adjusted weighting
        
    Returns:
        Sorted list of papers with final_score and relevance fields
    """
    current_year = datetime.now().year
    
    # Intent-based relevance weights
    intent_weights = {
        'species': 0.6,      # Higher weight on exact matches for species
        'methodology': 0.5,  # Balanced for methods
        'climate': 0.45,     # Slightly lower, recency matters more
        'ecology': 0.5,      # Balanced
        'policy': 0.4,       # Lower relevance, recency/citations matter more
        'general': 0.5       # Default
    }
    
    relevance_weight = intent_weights.get(query_intent, 0.5)
    
    # Domain matching bonus/penalty
    def get_domain_bonus(paper: Dict[str, Any], target_domain: str) -> float:
        """Calculate domain match bonus for paper."""
        if target_domain == 'general':
            return 0.0
        
        title_lower = paper.get('title', '').lower()
        abstract_lower = paper.get('abstract', '').lower()
        text = title_lower + ' ' + abstract_lower
        
        if target_domain == 'marine':
            marine_words = ['marine', 'ocean', 'reef', 'coastal', 'sea', 'fish', 'coral', 'aquatic']
            terrestrial_words = ['terrestrial', 'amphibian', 'mammal', 'mosquito', 'bird', 'forest']
            
            marine_count = sum(1 for word in marine_words if word in text)
            terrestrial_count = sum(1 for word in terrestrial_words if word in text)
            
            if marine_count > terrestrial_count:
                return 0.15  # Strong domain match bonus
            elif terrestrial_count > 0:
                return -0.20  # Domain mismatch penalty
        
        return 0.0
    
    for paper in papers:
        # Base text relevance (default 50 if not provided by API)
        text_relevance = paper.get('relevance_score', 50) / 100
        
        # Citation velocity (accounts for paper age)
        citations = paper.get('citations', 0)
        year = paper.get('year') or 2000
        years_old = max(current_year - year, 1)  # Avoid division by zero
        citation_velocity = citations / years_old
        
        # Normalize velocity to 0-0.3 range (cap at 100 citations/year)
        velocity_score = min(citation_velocity / 100 * 0.25, 0.25)
        
        # Open access bonus
        oa_bonus = 0.1 if paper.get('is_open_access') else 0
        
        # Recency boost (last 3 years)
        recency_boost = max(0, (3 - years_old) / 3 * 0.1) if years_old <= 3 else 0
        
        # Domain match bonus/penalty
        domain_bonus = get_domain_bonus(paper, domain)
        
        # Final score with citation velocity and domain matching
        final_score = (
            text_relevance * relevance_weight +
            velocity_score +
            oa_bonus +
            recency_boost +
            domain_bonus
        )
        
        paper['final_score'] = round(final_score, 3)
        paper['relevance'] = int(final_score * 100)
        paper['citation_velocity'] = round(citation_velocity, 2)
    
    # Sort by final score descending
    papers.sort(key=lambda p: p['final_score'], reverse=True)
    
    logger.info(f"Ranked {len(papers)} papers, top score: {papers[0]['final_score'] if papers else 0}")
    return papers


async def search_papers(
    query: str, 
    limit: int = 20, 
    deterministic: bool = True,
    filters: Optional[SearchFilters] = None,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    Main orchestrator for paper search with 3-level caching, intent classification, and pagination.
    
    Caching strategy:
    - Level 1: epmc:{query_hash} - Europe PMC results (24h TTL)
    - Level 2: s2:{query_hash} - Semantic Scholar results (24h TTL)
    - Level 3: merged:{query_hash}:{limit}:{offset} - Final ranked results (24h TTL)
    
    Args:
        query: Search query string
        limit: Maximum number of results to return
        deterministic: If True, ensures stable ranking (same query → same order)
        filters: SearchFilters object for advanced filtering
        offset: Starting position for pagination
        
    Returns:
        List of ranked, merged papers
    """
    import time
    import asyncio
    from asyncio import TimeoutError
    
    # Classify query intent and domain for better ranking
    query_intent, query_domain = classify_query_intent(query)
    logger.info(f"Query intent: {query_intent}, domain: {query_domain}")
    
    # Query hash for cache keys
    query_hash = hashlib.md5(query.encode()).hexdigest()[:16]
    
    # Level 3: Check merged results cache first
    merged_cache_key = f"papers:merged:{query_hash}:{limit}"
    cached_merged = _cache_get_fallback(merged_cache_key)
    if cached_merged:
        logger.info(f"✓ Cache hit (merged) for query: {query}")
        return cached_merged if isinstance(cached_merged, list) else json.loads(cached_merged)
    
    logger.info(f"Searching papers for: {query}")
    
    # Level 1 & 2: Check individual API caches
    epmc_cache_key = f"papers:epmc:{query_hash}"
    s2_cache_key = f"papers:s2:{query_hash}"
    
    cached_epmc = _cache_get_fallback(epmc_cache_key)
    cached_s2 = _cache_get_fallback(s2_cache_key)
    
    # Retry logic with exponential backoff
    async def fetch_with_retry(func, *args, max_retries=3):
        """Fetch with exponential backoff retry."""
        for attempt in range(max_retries):
            try:
                return await asyncio.wait_for(func(*args), timeout=30.0)
            except TimeoutError:
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # 1s, 2s, 4s
                    logger.warning(f"Timeout on attempt {attempt + 1}, retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"Failed after {max_retries} attempts")
                    return []
            except Exception as e:
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    logger.warning(f"Error on attempt {attempt + 1}: {e}, retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"Failed after {max_retries} attempts: {e}")
                    return []
        return []
    
    # Fetch from APIs (with caching and retry)
    if cached_epmc:
        logger.info(" ✓ Using cached Europe PMC results")
        epmc_results = cached_epmc if isinstance(cached_epmc, list) else json.loads(cached_epmc)
    else:
        logger.info("⟳ Fetching from Europe PMC...")
        epmc_results = await fetch_with_retry(search_europe_pmc, query, limit)
        if epmc_results:
            _cache_set_fallback(epmc_cache_key, json.dumps(epmc_results) if not REDIS_AVAILABLE else epmc_results, ttl=86400)
    
    if cached_s2:
        logger.info("✓ Using cached Semantic Scholar results")
        s2_results = cached_s2 if isinstance(cached_s2, list) else json.loads(cached_s2)
    else:
        logger.info("⟳ Fetching from Semantic Scholar...")
        s2_results = await fetch_with_retry(search_semantic_scholar, query, limit)
        if s2_results:
            _cache_set_fallback(s2_cache_key, json.dumps(s2_results) if not REDIS_AVAILABLE else s2_results, ttl=86400)
    
    # Merge papers using smart matching
    merged = merge_papers(epmc_results, s2_results)
    
    # Apply filters if provided
    if filters:
        merged = apply_filters(merged, filters)
    
    # Rank papers with query intent and domain
    ranked = rank_papers(merged, query_intent, query_domain)
    
    # Apply pagination
    total_count = len(ranked)
    paginated = ranked[offset:offset + limit]
    
    # Deterministic mode: ensure stable sorting for same query
    if deterministic and paginated:
        # Secondary sort by title to ensure consistency
        paginated.sort(key=lambda p: (-p['final_score'], p['title']))
    
    # Cache merged result for 24 hours
    _cache_set_fallback(merged_cache_key, json.dumps(paginated) if not REDIS_AVAILABLE else paginated, ttl=86400)
    
    logger.info(f"Returning {len(paginated)} ranked papers (offset={offset}, total={total_count}) for query: {query}")
    return paginated


# For async compatibility
import asyncio
