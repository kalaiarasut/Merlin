"""
RAG Module for Marine Protocol Database

Provides Retrieval-Augmented Generation capabilities for methodology generation
with 4 core rules:
1. Method-Type Classification BEFORE retrieval
2. SOP Priority over Papers
3. Citation Anchoring (every step must have document IDs)
4. Mandatory Limitations section
"""

from .rag_service import RAGService, get_rag_service
from .method_classifier import MethodClassifier
from .chromadb_service import ChromaDBService
from .embedding_service import EmbeddingService
from .citation_validator import CitationValidator
from .confidence_analyzer import ConfidenceAnalyzer

__all__ = [
    "RAGService",
    "get_rag_service",
    "MethodClassifier",
    "ChromaDBService",
    "EmbeddingService",
    "CitationValidator",
    "ConfidenceAnalyzer",
]
