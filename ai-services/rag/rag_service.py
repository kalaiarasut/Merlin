"""
Main RAG Service - Orchestrates the Full Pipeline

Implements all 4 Core Rules:
1. Method-Type Classification BEFORE retrieval
2. SOP Priority over Papers  
3. Citation Anchoring (every step must have document IDs)
4. Mandatory Limitations section

Pipeline:
User Query → Method Classifier → Embedder → Dual-Channel Retrieval → 
Context Builder → LLM (with citation prompt) → Citation Validator → 
Confidence Analyzer → Structured Output
"""

import os
import json
import logging
import httpx
from pathlib import Path
from typing import Dict, Any, List, Optional

from .method_classifier import MethodClassifier, get_method_classifier
from .embedding_service import EmbeddingService, get_embedding_service
from .chromadb_service import ChromaDBService, get_chromadb_service
from .citation_validator import CitationValidator, get_citation_validator, CITATION_PROMPT
from .confidence_analyzer import ConfidenceAnalyzer, get_confidence_analyzer

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://localhost:11434"
LLM_MODEL = "llama3.2:1b"


class RAGService:
    """
    Main RAG Service for marine protocol methodology generation.
    
    Orchestrates the full pipeline with all 4 core rules enforced.
    """
    
    def __init__(self):
        """Initialize all RAG components."""
        self.classifier = get_method_classifier()
        self.embedder = get_embedding_service()
        self.chromadb = get_chromadb_service()
        self.citation_validator = get_citation_validator()
        self.confidence_analyzer = get_confidence_analyzer()
        
        self.ollama_url = OLLAMA_URL
        self.model = LLM_MODEL
        
        logger.info("RAG Service initialized with all components")
    
    async def query(self, user_query: str, include_papers: bool = True) -> Dict[str, Any]:
        """
        Full RAG pipeline with all 4 core rules.
        
        Args:
            user_query: User's methodology question
            include_papers: Whether to include paper results (default True)
            
        Returns:
            Dict with methodology, citations, confidence, limitations, etc.
        """
        logger.info(f"RAG query: {user_query[:100]}...")
        
        # ============================================
        # RULE #1: Method-Type Classification BEFORE Retrieval
        # ============================================
        method_types = self.classifier.classify(user_query)
        logger.info(f"Classified as method types: {method_types}")
        
        # ============================================
        # Embed Query
        # ============================================
        try:
            query_embedding = await self.embedder.embed(user_query)
        except Exception as e:
            logger.error(f"Embedding failed: {e}")
            return self._error_response(f"Embedding service unavailable: {e}")
        
        # ============================================
        # RULE #2: Dual-Channel Retrieval (SOP Priority)
        # ============================================
        retrieval_results = self.chromadb.retrieve(
            query_embedding=query_embedding,
            method_types=method_types,
            top_k=5
        )
        
        sops = retrieval_results.get("sops", [])
        papers = retrieval_results.get("papers", []) if include_papers else []
        
        logger.info(f"Retrieved: {len(sops)} SOPs, {len(papers)} papers")
        
        # Check if we have any documents
        if not sops and not papers:
            return self._no_documents_response(user_query, method_types)
        
        # ============================================
        # RULE #3: Build Context with Citation IDs
        # ============================================
        context_text, doc_ids = self.citation_validator.format_documents_with_ids(
            sops=sops,
            papers=papers
        )
        
        # ============================================
        # RULE #4: Analyze Confidence & Generate Limitations
        # ============================================
        confidence_result = self.confidence_analyzer.analyze(
            query=user_query,
            retrieval_results=retrieval_results,
            method_types=method_types,
            available_doc_ids=doc_ids
        )
        
        # ============================================
        # Generate with LLM (Citation-Forcing Prompt)
        # ============================================
        methodology = await self._generate_methodology(
            query=user_query,
            context=context_text,
            doc_ids=doc_ids
        )
        
        # ============================================
        # Validate Citations
        # ============================================
        citation_validation = self.citation_validator.validate_citations(
            response=methodology,
            available_doc_ids=doc_ids
        )
        
        # ============================================
        # Build Final Response
        # ============================================
        limitations_text = self.confidence_analyzer.format_limitations_section(
            confidence_result["limitations"]
        )
        
        # Append limitations to methodology
        full_response = methodology + limitations_text
        
        # Build source list for frontend
        sources = self._build_sources_list(sops, papers)
        
        return {
            "success": True,
            "methodology": full_response,
            "method_types": method_types,
            "citations": citation_validation["cited_documents"],
            "citation_valid": citation_validation["valid"],
            "citation_coverage": citation_validation["citation_coverage"],
            "uncited_steps": citation_validation.get("uncited_steps", []),
            "confidence_score": confidence_result["confidence_score"],
            "limitations": confidence_result["limitations"],
            "expert_review_required": confidence_result["expert_review_required"],
            "retrieval_stats": confidence_result["retrieval_stats"],
            "sources": sources
        }
    
    async def _generate_methodology(
        self,
        query: str,
        context: str,
        doc_ids: List[str]
    ) -> str:
        """
        Generate methodology using LLM with citation-forcing prompt.
        
        RULE #3: Every step must have a citation.
        """
        system_prompt = f"""You are a marine research methodology assistant.
Your task is to generate step-by-step protocols based ONLY on the provided documents.

{CITATION_PROMPT}

Available document IDs you can cite: {', '.join(doc_ids)}

DOCUMENTS:
{context}
"""
        
        user_prompt = f"""Based on the documents above, provide a step-by-step methodology for:

{query}

Remember:
- Every step MUST end with a citation like [D1] or [D1, D2]
- Only include steps that are supported by the documents
- Do NOT make up information not in the documents
- Prioritize information from SOPs (marked as PRIMARY SOURCE)"""

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": user_prompt,
                        "system": system_prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.3,  # Lower temperature for accuracy
                            "num_predict": 2048
                        }
                    }
                )
                response.raise_for_status()
                data = response.json()
                return data.get("response", "Failed to generate methodology.")
                
        except Exception as e:
            logger.error(f"LLM generation failed: {e}")
            return f"Error generating methodology: {e}"
    
    def _build_sources_list(
        self, 
        sops: List[Dict], 
        papers: List[Dict]
    ) -> List[Dict]:
        """Build a clean sources list for the frontend."""
        sources = []
        
        for doc in sops:
            sources.append({
                "doc_id": doc.get("doc_id"),
                "title": doc.get("metadata", {}).get("title", "Untitled SOP"),
                "source": doc.get("metadata", {}).get("source", "Unknown"),
                "type": "SOP",
                "priority": "primary"
            })
        
        for doc in papers:
            sources.append({
                "doc_id": doc.get("doc_id"),
                "title": doc.get("metadata", {}).get("title", "Untitled Paper"),
                "source": doc.get("metadata", {}).get("source", "Unknown"),
                "type": "Paper",
                "priority": "supporting"
            })
        
        return sources
    
    def _error_response(self, error_message: str) -> Dict[str, Any]:
        """Return a standardized error response."""
        return {
            "success": False,
            "error": error_message,
            "methodology": "",
            "citations": [],
            "limitations": [f"⚠️ {error_message}"],
            "expert_review_required": True,
            "confidence_score": 0.0
        }
    
    def _no_documents_response(
        self, 
        query: str, 
        method_types: List[str]
    ) -> Dict[str, Any]:
        """Response when no documents are found."""
        return {
            "success": True,
            "methodology": (
                "No relevant protocol documents found for your query.\n\n"
                "This could mean:\n"
                "1. The protocol database doesn't have documents for this method type yet\n"
                "2. The query terms don't match available protocols\n\n"
                "Please try:\n"
                "- Rephrasing your question\n"
                "- Using more specific method terminology\n"
                "- Contacting your institution for SOPs"
            ),
            "method_types": method_types,
            "citations": [],
            "citation_valid": True,  # No citations needed if no docs
            "confidence_score": 0.0,
            "limitations": [
                "⚠️ No matching documents found in the protocol database.",
                "⚠️ Expert input required to develop methodology."
            ],
            "expert_review_required": True,
            "retrieval_stats": {
                "sop_count": 0,
                "paper_count": 0,
                "total_documents": 0,
                "method_types_detected": method_types
            },
            "sources": []
        }
    
    async def ingest_protocols(self, protocols_dir: str = None) -> Dict[str, int]:
        """
        Ingest protocol documents from the protocols directory.
        
        Args:
            protocols_dir: Path to protocols directory
            
        Returns:
            Dict with counts of ingested documents
        """
        if protocols_dir is None:
            protocols_dir = str(Path(__file__).parent / "protocols")
        
        sops_dir = Path(protocols_dir) / "sops"
        papers_dir = Path(protocols_dir) / "papers"
        
        ingested = {"sops": 0, "papers": 0}
        
        # Ingest SOPs
        if sops_dir.exists():
            for json_file in sops_dir.glob("*.json"):
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        doc = json.load(f)
                    
                    doc_id = doc.get("doc_id", f"D{ingested['sops'] + 1}")
                    content = doc.get("content", "")
                    
                    if not content:
                        continue
                    
                    embedding = await self.embedder.embed(content)
                    
                    self.chromadb.add_sop(
                        doc_id=doc_id,
                        content=content,
                        embedding=embedding,
                        metadata={
                            "title": doc.get("title", json_file.stem),
                            "source": doc.get("source", "Unknown"),
                            "method_type": doc.get("method_type", "General"),
                            "version": doc.get("version", "1.0"),
                            "tags": ",".join(doc.get("tags", []))  # ChromaDB needs strings
                        }
                    )
                    ingested["sops"] += 1
                    logger.info(f"Ingested SOP: {doc_id}")
                    
                except Exception as e:
                    logger.error(f"Failed to ingest {json_file}: {e}")
        
        # Ingest Papers
        if papers_dir.exists():
            for json_file in papers_dir.glob("*.json"):
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        doc = json.load(f)
                    
                    doc_id = doc.get("doc_id", f"D{ingested['sops'] + ingested['papers'] + 1}")
                    content = doc.get("content", "")
                    
                    if not content:
                        continue
                    
                    embedding = await self.embedder.embed(content)
                    
                    self.chromadb.add_paper(
                        doc_id=doc_id,
                        content=content,
                        embedding=embedding,
                        metadata={
                            "title": doc.get("title", json_file.stem),
                            "source": doc.get("source", "Unknown"),
                            "method_type": doc.get("method_type", "General"),
                            "year": doc.get("year", ""),
                            "authors": doc.get("authors", ""),
                            "tags": ",".join(doc.get("tags", []))  # ChromaDB needs strings
                        }
                    )
                    ingested["papers"] += 1
                    logger.info(f"Ingested Paper: {doc_id}")
                    
                except Exception as e:
                    logger.error(f"Failed to ingest {json_file}: {e}")
        
        logger.info(f"Ingestion complete: {ingested}")
        return ingested
    
    def get_stats(self) -> Dict[str, Any]:
        """Get RAG system statistics."""
        db_stats = self.chromadb.get_stats()
        return {
            "database": db_stats,
            "model": self.model,
            "embedding_model": self.embedder.model,
            "classifier_types": list(self.classifier.CLASSIFICATION_RULES.keys())
        }


# Singleton instance
_rag_service = None


def get_rag_service() -> RAGService:
    """Get the singleton RAGService instance."""
    global _rag_service
    if _rag_service is None:
        _rag_service = RAGService()
    return _rag_service
