"""
Connectivity utilities for checking service availability.

Provides status checks for:
- Internet connectivity
- Ollama availability
- Gemini API availability
- FishBase API availability
"""

import os
import httpx
import logging
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()
except ImportError:
    pass

logger = logging.getLogger(__name__)


class ServiceStatus(Enum):
    """Service availability status."""
    ONLINE = "online"
    OFFLINE = "offline"
    DEGRADED = "degraded"
    UNKNOWN = "unknown"


@dataclass
class AISystemStatus:
    """Complete AI system status."""
    internet: bool
    ollama: bool
    fishbase: bool
    tavily: bool  # Added Tavily
    active_provider: str
    mode: str  # "offline", "online"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "internet": self.internet,
            "ollama": self.ollama,
            "fishbase": self.fishbase,
            "tavily": self.tavily,
            "active_provider": self.active_provider,
            "mode": self.mode,
            "status": "online" if self.internet else "offline"
        }


async def check_internet() -> bool:
    """Check if internet is available."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            # Try multiple endpoints for reliability
            endpoints = [
                "https://www.google.com",
                "https://cloudflare.com",
                "https://httpbin.org/get"
            ]
            for url in endpoints:
                try:
                    response = await client.head(url)
                    if response.status_code < 500:
                        return True
                except:
                    continue
        return False
    except Exception:
        return False


async def check_ollama(url: str = None) -> bool:
    """Check if Ollama is available."""
    ollama_url = url or os.getenv("OLLAMA_URL", "http://localhost:11434")
    
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{ollama_url}/api/tags")
            return response.status_code == 200
    except Exception as e:
        logger.debug(f"Ollama check failed: {e}")
        return False


async def check_tavily() -> bool:
    """Check if Tavily API is configured."""
    key = os.getenv("TAVILY_API_KEY")
    return bool(key)


async def check_fishbase() -> bool:
    """Check if FishBase API is available."""
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            # Check the Swedish mirror which we use for scraping
            response = await client.head(
                "https://www.fishbase.se/search.php",
                headers={"User-Agent": "Mozilla/5.0"}
            )
            return response.status_code == 200
    except Exception as e:
        logger.debug(f"FishBase check failed: {e}")
        return False


async def get_ai_system_status() -> AISystemStatus:
    """
    Get complete AI system status (Ollama-Only Architecture).
    """
    # Check all services
    internet = await check_internet()
    ollama = await check_ollama()
    fishbase = await check_fishbase() if internet else False
    tavily = await check_tavily() if internet else False
    
    # Determine active provider and mode
    if ollama:
        active_provider = "ollama"
        mode = "online" if internet else "offline"
    else:
        active_provider = "fallback"
        mode = "offline"
    
    return AISystemStatus(
        internet=internet,
        ollama=ollama,
        fishbase=fishbase,
        tavily=tavily,
        active_provider=active_provider,
        mode=mode
    )

# Redis-based caching (with in-memory fallback)
CACHE_KEY = "ai_system_status"
CACHE_TTL_SECONDS = 30


async def get_cached_status(max_age_seconds: float = 30) -> AISystemStatus:
    """
    Get cached AI system status using Redis.
    
    Args:
        max_age_seconds: Maximum age of cached status before refresh (default: 30s)
        
    Returns:
        AISystemStatus (cached or fresh)
    """
    from utils.redis_cache import cache_get, cache_set
    
    # Try to get from cache
    cached = cache_get(CACHE_KEY)
    if cached:
        return AISystemStatus(
            internet=cached.get("internet", False),
            ollama=cached.get("ollama", False),
            fishbase=cached.get("fishbase", False),
            tavily=cached.get("tavily", False),
            active_provider=cached.get("active_provider", "fallback"),
            mode=cached.get("mode", "offline")
        )
    
    # Cache miss - fetch fresh status
    status = await get_ai_system_status()
    
    # Store in cache
    cache_set(CACHE_KEY, status.to_dict(), ttl_seconds=int(max_age_seconds))
    
    return status


def clear_status_cache():
    """Clear the cached status."""
    from utils.redis_cache import cache_delete
    cache_delete(CACHE_KEY)
