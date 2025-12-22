"""
Redis Cache Utility for AI Services.

Provides caching for expensive operations like /ai/status checks.
Falls back gracefully if Redis is unavailable.
"""

import os
import json
import logging
from typing import Any, Optional
from functools import wraps

logger = logging.getLogger(__name__)

# Redis client (lazy initialization)
_redis_client = None


def get_redis_client():
    """Get or create Redis client (lazy singleton)."""
    global _redis_client
    
    if _redis_client is not None:
        return _redis_client
    
    try:
        import redis
        
        host = os.getenv("REDIS_HOST", "127.0.0.1")
        port = int(os.getenv("REDIS_PORT", "6379"))
        password = os.getenv("REDIS_PASSWORD", "")
        
        # Don't use password if it's the placeholder
        if password == "your_redis_password_here":
            password = None
        
        _redis_client = redis.Redis(
            host=host,
            port=port,
            password=password if password else None,
            db=0,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2
        )
        
        # Test connection
        _redis_client.ping()
        logger.info(f"Redis connected: {host}:{port}")
        return _redis_client
        
    except Exception as e:
        logger.warning(f"Redis not available: {e}. Using in-memory cache fallback.")
        _redis_client = None
        return None


# In-memory fallback cache
_memory_cache = {}


def cache_get(key: str) -> Optional[Any]:
    """Get value from cache (Redis or memory fallback)."""
    client = get_redis_client()
    
    if client:
        try:
            value = client.get(key)
            if value:
                return json.loads(value)
        except Exception as e:
            logger.debug(f"Redis get error: {e}")
    
    # Fallback to memory cache
    return _memory_cache.get(key)


def cache_set(key: str, value: Any, ttl_seconds: int = 30) -> bool:
    """Set value in cache with TTL (Redis or memory fallback)."""
    client = get_redis_client()
    
    if client:
        try:
            client.setex(key, ttl_seconds, json.dumps(value))
            return True
        except Exception as e:
            logger.debug(f"Redis set error: {e}")
    
    # Fallback to memory cache (no TTL enforcement for simplicity)
    _memory_cache[key] = value
    return True


def cache_delete(key: str) -> bool:
    """Delete value from cache."""
    client = get_redis_client()
    
    if client:
        try:
            client.delete(key)
        except Exception:
            pass
    
    _memory_cache.pop(key, None)
    return True


def is_redis_available() -> bool:
    """Check if Redis is connected."""
    client = get_redis_client()
    return client is not None
