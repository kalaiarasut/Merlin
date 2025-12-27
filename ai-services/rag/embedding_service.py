"""
Embedding Service for RAG Pipeline

Uses Ollama's nomic-embed-text model for local embeddings.
"""

import httpx
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://localhost:11434"
EMBEDDING_MODEL = "nomic-embed-text"


class EmbeddingService:
    """
    Generate embeddings using Ollama's local embedding model.
    
    Uses nomic-embed-text (768 dimensions) for fast, free local embeddings.
    """
    
    def __init__(self, ollama_url: str = OLLAMA_URL, model: str = EMBEDDING_MODEL):
        self.ollama_url = ollama_url
        self.model = model
        self._available: Optional[bool] = None
    
    async def check_availability(self) -> bool:
        """Check if Ollama and the embedding model are available."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.ollama_url}/api/tags")
                if response.status_code == 200:
                    models = response.json().get("models", [])
                    model_names = [m.get("name", "").split(":")[0] for m in models]
                    self._available = self.model.split(":")[0] in model_names
                    if not self._available:
                        logger.warning(f"Embedding model '{self.model}' not found. Available: {model_names}")
                        logger.info(f"Pull it with: ollama pull {self.model}")
                    return self._available
        except Exception as e:
            logger.error(f"Ollama not available: {e}")
            self._available = False
        return False
    
    async def embed(self, text: str) -> List[float]:
        """
        Generate embedding for a single text.
        
        Args:
            text: Text to embed
            
        Returns:
            List of floats (768 dimensions for nomic-embed-text)
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.ollama_url}/api/embeddings",
                    json={
                        "model": self.model,
                        "prompt": text
                    }
                )
                response.raise_for_status()
                data = response.json()
                embedding = data.get("embedding", [])
                
                if not embedding:
                    raise ValueError("Empty embedding returned")
                
                return embedding
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama embedding HTTP error: {e}")
            raise
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise
    
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.
        
        Args:
            texts: List of texts to embed
            
        Returns:
            List of embeddings
        """
        embeddings = []
        for text in texts:
            embedding = await self.embed(text)
            embeddings.append(embedding)
        return embeddings
    
    async def embed_document(self, content: str, metadata: dict = None) -> dict:
        """
        Embed a document and return with metadata.
        
        Args:
            content: Document content
            metadata: Optional metadata dict
            
        Returns:
            Dict with embedding and metadata
        """
        embedding = await self.embed(content)
        return {
            "embedding": embedding,
            "content": content,
            "metadata": metadata or {}
        }


# Singleton instance
_embedding_service = None


def get_embedding_service() -> EmbeddingService:
    """Get the singleton EmbeddingService instance."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
