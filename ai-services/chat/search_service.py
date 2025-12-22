"""
AI-Optimized Web Search Service using Tavily.

Features:
- Redis caching to reduce API token usage
- Graceful fallback when cache or API unavailable
"""

import os
import logging
import traceback
import hashlib
from typing import Optional

from tavily import TavilyClient

logger = logging.getLogger(__name__)

# Cache TTL for search results (5 minutes)
SEARCH_CACHE_TTL = 300


class SearchService:
    """
    AI-Optimized Web Search Service using Tavily.
    
    Tavily is specifically designed for RAG/LLM pipelines and returns
    summarized, AI-ready results.
    
    Features:
    - Redis caching (5 min TTL) to reduce API token usage
    - Graceful fallback when cache or API unavailable
    
    Get your API key from: https://tavily.com/
    """
    
    def __init__(self):
        self.api_key = os.getenv("TAVILY_API_KEY", "")
        self.client = None
        self.enabled = False
        
        if self.api_key:
            try:
                self.client = TavilyClient(api_key=self.api_key)
                self.enabled = True
                logger.info("SearchService initialized with Tavily (AI-Optimized)")
            except Exception as e:
                logger.error(f"Tavily initialization failed: {e}")
        else:
            logger.warning("TAVILY_API_KEY not set. Web search disabled.")

    def _get_cache_key(self, query: str) -> str:
        """Generate a cache key from the query."""
        # Normalize query (lowercase, strip whitespace)
        normalized = query.lower().strip()
        # Create hash for compact key
        query_hash = hashlib.md5(normalized.encode()).hexdigest()[:16]
        return f"tavily_search:{query_hash}"

    def search_web(self, query: str, max_results: int = 5) -> str:
        """
        Perform a web search and return a formatted summary string.
        
        Uses Redis caching to avoid repeated API calls for the same query.
        Returns AI-ready summarized results from Tavily.
        """
        if not self.enabled or not self.client:
            return "⚠️ Web search unavailable (TAVILY_API_KEY not configured)."
        
        # Try cache first
        cache_key = self._get_cache_key(query)
        try:
            from utils.redis_cache import cache_get, cache_set
            
            cached = cache_get(cache_key)
            if cached:
                logger.info(f"Tavily CACHE HIT for: '{query[:50]}...'")
                return cached
        except Exception as e:
            logger.debug(f"Cache check failed: {e}")
        
        # Cache miss - call Tavily API
        try:
            logger.info(f"Tavily API call for: '{query}'")
            
            response = self.client.search(
                query=query,
                search_depth="basic",
                max_results=max_results,
                include_answer=True,
                include_raw_content=False
            )
            
            # Format for LLM consumption
            summary = f"### WEB SEARCH RESULTS (Tavily) ###\n"
            summary += f"Query: '{query}'\n\n"
            
            if response.get("answer"):
                summary += f"**AI Summary:** {response['answer']}\n\n"
            
            results = response.get("results", [])
            if results:
                summary += "**Sources:**\n"
                for i, r in enumerate(results, 1):
                    title = r.get('title', 'No Title')
                    url = r.get('url', '#')
                    content = r.get('content', '')[:250]
                    
                    summary += f"[{i}] **{title}**\n"
                    summary += f"    URL: {url}\n"
                    summary += f"    {content}...\n\n"
            else:
                summary += "No specific sources found.\n"
            
            # Store in cache
            try:
                cache_set(cache_key, summary, ttl_seconds=SEARCH_CACHE_TTL)
                logger.info(f"Tavily result cached (TTL: {SEARCH_CACHE_TTL}s)")
            except Exception as e:
                logger.debug(f"Cache store failed: {e}")
            
            return summary
            
        except Exception as e:
            logger.error(f"Tavily search failed: {e}\n{traceback.format_exc()}")
            return f"⚠️ Search error: {str(e)}"

    def is_search_query(self, message: str) -> bool:
        """
        Heuristic to determine if a query requires internet search.
        """
        keywords = [
            "latest", "news", "trend", "current", "update", "recent", 
            "2024", "2025", "today", "now", "online", "search", 
            "google", "internet", "web", "happening", "article",
            "research", "publication", "paper", "study"
        ]
        message_lower = message.lower()
        return any(k in message_lower for k in keywords)
