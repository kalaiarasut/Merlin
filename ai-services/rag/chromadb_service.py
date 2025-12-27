"""
ChromaDB Service for RAG Pipeline

CORE RULE #2: SOP Priority Over Papers
- SOPs are stored in a separate collection with PRIORITY status
- Papers are supporting context only
- When SOPs exist, they ALWAYS take priority
"""

import os
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# Lazy import chromadb to handle missing dependency gracefully
chromadb = None


def _ensure_chromadb():
    """Ensure chromadb is available."""
    global chromadb
    if chromadb is None:
        try:
            import chromadb as _chromadb
            chromadb = _chromadb
        except ImportError:
            raise ImportError(
                "chromadb is required for RAG functionality. "
                "Install with: pip install chromadb"
            )
    return chromadb


class ChromaDBService:
    """
    Vector database service with dual-channel retrieval.
    
    Implements Core Rule #2: SOP Priority Over Papers
    - marine_sops collection: Authoritative, institution-approved (PRIMARY)
    - marine_papers collection: Contextual, methodology examples (SUPPORTING)
    """
    
    def __init__(self, persist_directory: str = None):
        """
        Initialize ChromaDB with persistent storage.
        
        Args:
            persist_directory: Path to store the database. 
                              Defaults to ./rag_data in ai-services.
        """
        _ensure_chromadb()
        
        if persist_directory is None:
            persist_directory = str(Path(__file__).parent / "rag_data")
        
        os.makedirs(persist_directory, exist_ok=True)
        
        self.persist_directory = persist_directory
        self.client = chromadb.PersistentClient(path=persist_directory)
        
        # Create dual collections
        # Priority channel - authoritative protocols
        self.sop_collection = self.client.get_or_create_collection(
            name="marine_sops",
            metadata={"hnsw:space": "cosine", "priority": "primary"}
        )
        
        # Supporting channel - paper methods
        self.paper_collection = self.client.get_or_create_collection(
            name="marine_papers",
            metadata={"hnsw:space": "cosine", "priority": "supporting"}
        )
        
        logger.info(f"ChromaDB initialized at {persist_directory}")
        logger.info(f"SOPs: {self.sop_collection.count()} documents")
        logger.info(f"Papers: {self.paper_collection.count()} documents")
    
    def add_sop(
        self, 
        doc_id: str,
        content: str,
        embedding: List[float],
        metadata: Dict[str, Any]
    ):
        """
        Add an SOP document to the priority collection.
        
        Args:
            doc_id: Unique document ID (e.g., "D1")
            content: Document content
            embedding: Pre-computed embedding vector
            metadata: Document metadata (must include method_type)
        """
        metadata["doc_type"] = "SOP"
        metadata["priority"] = "primary"
        
        self.sop_collection.add(
            ids=[doc_id],
            embeddings=[embedding],
            documents=[content],
            metadatas=[metadata]
        )
        logger.info(f"Added SOP: {doc_id} - {metadata.get('title', 'Untitled')}")
    
    def add_paper(
        self,
        doc_id: str,
        content: str,
        embedding: List[float],
        metadata: Dict[str, Any]
    ):
        """
        Add a paper document to the supporting collection.
        
        Args:
            doc_id: Unique document ID (e.g., "D5")
            content: Document content
            embedding: Pre-computed embedding vector
            metadata: Document metadata (must include method_type)
        """
        metadata["doc_type"] = "Paper"
        metadata["priority"] = "supporting"
        
        self.paper_collection.add(
            ids=[doc_id],
            embeddings=[embedding],
            documents=[content],
            metadatas=[metadata]
        )
        logger.info(f"Added Paper: {doc_id} - {metadata.get('title', 'Untitled')}")
    
    def retrieve(
        self,
        query_embedding: List[float],
        method_types: List[str] = None,
        top_k: int = 5
    ) -> Dict[str, Any]:
        """
        Dual-channel retrieval with SOP priority.
        
        CORE RULE #2: SOPs always come first, papers are supporting.
        
        Args:
            query_embedding: Query vector
            method_types: Filter by method types (from classifier)
            top_k: Number of results per channel
            
        Returns:
            Dict with 'sops' and 'papers' results
        """
        where_filter = None
        if method_types:
            where_filter = {"method_type": {"$in": method_types}}
        
        # Retrieve from SOP collection (PRIMARY)
        sop_results = self.sop_collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where_filter,
            include=["documents", "metadatas", "distances"]
        )
        
        # Retrieve from Paper collection (SUPPORTING)
        paper_results = self.paper_collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where_filter,
            include=["documents", "metadatas", "distances"]
        )
        
        return {
            "sops": self._format_results(sop_results, "SOP"),
            "papers": self._format_results(paper_results, "Paper")
        }
    
    def _format_results(self, results: Dict, doc_type: str) -> List[Dict]:
        """Format ChromaDB results into a cleaner structure."""
        formatted = []
        
        if not results.get("ids") or not results["ids"][0]:
            return formatted
        
        ids = results["ids"][0]
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]
        
        for i, doc_id in enumerate(ids):
            formatted.append({
                "doc_id": doc_id,
                "content": documents[i] if i < len(documents) else "",
                "metadata": metadatas[i] if i < len(metadatas) else {},
                "distance": distances[i] if i < len(distances) else 1.0,
                "doc_type": doc_type
            })
        
        return formatted
    
    def get_all_doc_ids(self) -> Dict[str, List[str]]:
        """Get all document IDs from both collections."""
        sop_ids = self.sop_collection.get()["ids"]
        paper_ids = self.paper_collection.get()["ids"]
        return {
            "sops": sop_ids,
            "papers": paper_ids,
            "all": sop_ids + paper_ids
        }
    
    def get_stats(self) -> Dict[str, Any]:
        """Get database statistics."""
        return {
            "sop_count": self.sop_collection.count(),
            "paper_count": self.paper_collection.count(),
            "total_documents": self.sop_collection.count() + self.paper_collection.count(),
            "persist_directory": self.persist_directory
        }
    
    def clear_all(self):
        """Clear all documents from both collections (use with caution)."""
        self.client.delete_collection("marine_sops")
        self.client.delete_collection("marine_papers")
        
        # Recreate empty collections
        self.sop_collection = self.client.get_or_create_collection(
            name="marine_sops",
            metadata={"hnsw:space": "cosine", "priority": "primary"}
        )
        self.paper_collection = self.client.get_or_create_collection(
            name="marine_papers",
            metadata={"hnsw:space": "cosine", "priority": "supporting"}
        )
        logger.warning("All documents cleared from ChromaDB")


# Singleton instance
_chromadb_service = None


def get_chromadb_service() -> ChromaDBService:
    """Get the singleton ChromaDBService instance."""
    global _chromadb_service
    if _chromadb_service is None:
        _chromadb_service = ChromaDBService()
    return _chromadb_service
