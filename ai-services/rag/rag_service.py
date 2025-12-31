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

# New Hybrid RAG components
from .live_paper_fetcher import LivePaperFetcher, get_live_paper_fetcher, PaperSource
from .source_ranker import SourceRanker, get_source_ranker
from .method_normalizer import MethodNormalizer, get_method_normalizer

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://localhost:11434"
LLM_MODEL = "llama3.2:1b"


class RAGService:
    """
    Main RAG Service for marine protocol methodology generation.
    
    Orchestrates the full pipeline with all 4 core rules enforced.
    Now supports HYBRID mode with real-time paper fetching.
    """
    
    def __init__(self):
        """Initialize all RAG components."""
        self.classifier = get_method_classifier()
        self.embedder = get_embedding_service()
        self.chromadb = get_chromadb_service()
        self.citation_validator = get_citation_validator()
        self.confidence_analyzer = get_confidence_analyzer()
        
        # Hybrid RAG components
        self.paper_fetcher = get_live_paper_fetcher()
        self.source_ranker = get_source_ranker()
        self.method_normalizer = get_method_normalizer()
        
        self.ollama_url = OLLAMA_URL
        self.model = LLM_MODEL
        
        logger.info("RAG Service initialized with all components (Hybrid mode enabled)")
    
    async def query(self, user_query: str, include_papers: bool = True, provider: Optional[str] = "auto") -> Dict[str, Any]:
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
            doc_ids=doc_ids,
            provider=provider
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
    
    async def query_live(self, user_query: str, limit: int = 8, provider: Optional[str] = "auto") -> Dict[str, Any]:
        """
        HYBRID RAG: Query using real-time paper search from Semantic Scholar/Europe PMC.
        
        Implements:
        - Live paper fetching
        - Method normalization  
        - Source confidence scoring (trust × citations × relevance)
        - Provenance tagging (DOI, journal, year)
        
        Args:
            user_query: User's methodology question
            limit: Max papers to fetch
            
        Returns:
            Dict with methodology, real citations, confidence bands, provenance
        """
        logger.info(f"HYBRID RAG query: {user_query[:100]}...")
        
        # Normalize method terms for better caching
        canonical_method = self.method_normalizer.get_canonical_label(user_query)
        logger.info(f"Normalized method: {canonical_method}")
        
        # Expand query with synonyms
        expanded_query = self.method_normalizer.expand_query(user_query)
        logger.info(f"Expanded query: {expanded_query[:100]}...")
        
        # Fetch real papers from Semantic Scholar + Europe PMC
        try:
            papers = await self.paper_fetcher.search_papers(
                query=expanded_query,
                method_type=canonical_method,
                limit=limit
            )
            logger.info(f"Fetched {len(papers)} papers from live sources")
        except Exception as e:
            logger.error(f"Live paper fetch failed: {e}")
            papers = []
        
        if not papers:
            return self._no_papers_response(user_query, canonical_method)
        
        # Rank sources by confidence score
        paper_dicts = [p.to_dict() for p in papers]
        ranked = self.source_ranker.rank_sources(paper_dicts)
        
        # Get overall confidence
        overall_confidence = self.source_ranker.get_overall_confidence(ranked)
        
        # Build context for LLM
        context_parts = []
        doc_ids = []
        for i, rsrc in enumerate(ranked[:5]):  # Top 5 sources
            doc_id = rsrc.doc_id
            doc_ids.append(doc_id)
            
            # Format with provenance
            provenance = self.source_ranker.format_provenance(rsrc)
            context_parts.append(f"""
=== [{doc_id}] {rsrc.title} ===
Source: {provenance}
Trust: {rsrc.trust_score:.2f} | Confidence Band: {rsrc.confidence_band.upper()}

{paper_dicts[i].get('methods_text', 'No methods section available.')}
""")
        
        context = "\n".join(context_parts)
        
        # Generate methodology with LLM
        methodology = await self._generate_methodology(
            query=user_query,
            context=context,
            doc_ids=doc_ids,
            provider=provider
        )
        
        # Format limitations based on confidence
        limitations = []
        if overall_confidence['band'] == 'low':
            limitations.append("⚠️ Low confidence - limited authoritative sources found")
        if overall_confidence['band'] == 'medium':
            limitations.append("⚠️ Medium confidence - verify critical steps with primary literature")
        if any(p.source_type == 'preprint' for p in papers[:3]):
            limitations.append("⚠️ Some sources are preprints - not yet peer-reviewed")
        
        # Build sources list with provenance
        sources = []
        for rsrc in ranked[:5]:
            prov = rsrc.provenance
            sources.append({
                "doc_id": rsrc.doc_id,
                "title": rsrc.title,
                "type": rsrc.source_type.replace('_', ' ').title(),
                "doi": prov.get('doi'),
                "journal": prov.get('journal'),
                "year": prov.get('year'),
                "citations": prov.get('citation_count'),
                "trust_score": rsrc.trust_score,
                "confidence_band": rsrc.confidence_band,
                "provenance": self.source_ranker.format_provenance(rsrc)
            })
        
        return {
            "success": True,
            "mode": "hybrid_live",
            "methodology": methodology,
            "canonical_method": canonical_method,
            "confidence": overall_confidence,
            "limitations": limitations,
            "expert_review_required": overall_confidence['band'] == 'low',
            "sources": sources,
            "papers_fetched": len(papers)
        }
    
    def _no_papers_response(self, query: str, method: str) -> Dict[str, Any]:
        """Response when no papers found from live search."""
        return {
            "success": True,
            "mode": "hybrid_live",
            "methodology": (
                f"No relevant papers found for method: {method}\n\n"
                "This could mean:\n"
                "1. The academic databases have limited coverage for this topic\n"
                "2. Try using different terminology\n\n"
                "Suggestions:\n"
                "- Use more specific keywords\n"
                "- Check protocols.io or institutional SOPs"
            ),
            "canonical_method": method,
            "confidence": {"score": 0, "band": "low", "label": "🔴 Low Confidence"},
            "limitations": ["⚠️ No papers found in Semantic Scholar or Europe PMC"],
            "expert_review_required": True,
            "sources": [],
            "papers_fetched": 0
        }
    
    async def _generate_methodology(
        self,
        query: str,
        context: str,
        doc_ids: List[str],
        provider: Optional[str] = "auto"
    ) -> str:
        """
        Generate methodology using LLM with citation-forcing prompt.
        
        RULE #3: Every step must have a citation.
        """
        system_prompt = f"""You are a precise marine research methodology extractor.

CRITICAL RULES - FOLLOW EXACTLY:
1. ONLY describe methods that are EXPLICITLY stated in the documents below
2. NEVER invent or assume steps not mentioned in documents
3. If a document describes a technique, quote or paraphrase it directly
4. Every step MUST cite its source document ID like [PMC_12345]
5. If documents don't describe a complete protocol, say "The documents do not provide complete methodology for this"

WHAT NOT TO DO:
- Do NOT mention water sampling unless documents specifically describe it
- Do NOT add generic steps like "clean the sample" unless documents say this
- Do NOT combine unrelated methods from different documents

Available document IDs: {', '.join(doc_ids)}

DOCUMENTS TO EXTRACT FROM:
{context}
"""
        
        user_prompt = f"""Extract the methodology for: {query}

INSTRUCTIONS:
1. Read each document carefully
2. ONLY list steps that are EXPLICITLY described in the documents
3. Quote key phrases from the documents to prove accuracy
4. If the documents describe techniques for {query}, list those specific techniques
5. If documents don't contain methodology for this topic, respond: "The retrieved documents do not contain specific methodology for {query}. The papers discuss related topics but do not provide step-by-step protocols."

Format each step as:
**Step X: [Step name]**
[Exact method from document] [Document ID]
"""

        # Determine provider
        use_groq = False
        import os
        groq_api_key = os.environ.get("GROQ_API_KEY")
        
        if provider == "groq":
            if groq_api_key:
                use_groq = True
            else:
                logger.warning("Groq requested but no API key found. Falling back.")
        elif provider == "ollama":
            use_groq = False
        else: # auto
            if groq_api_key:
                use_groq = True

        # Execution
        if use_groq:
            try:
                from groq import Groq
                client = Groq(api_key=groq_api_key)
                
                logger.info("Using GROQ Cloud API for generation (High Performance)")
                completion = client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    model="llama-3.3-70b-versatile",
                    temperature=0.3,
                    max_tokens=2048,
                )
                return completion.choices[0].message.content
            except Exception as e:
                logger.error(f"Groq API failed, falling back to Ollama: {e}")
                # Fall through to Ollama


        try:
            logger.info(f"Calling Ollama LLM at {self.ollama_url} with model {self.model}")
            logger.info(f"Context length: {len(context)} chars, Doc IDs: {doc_ids}")
            
            async with httpx.AsyncClient(timeout=600.0) as client:  # 10 min timeout for very slow systems
                response = await client.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": user_prompt,
                        "system": system_prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.3,
                            "num_predict": 2048
                        }
                    }
                )
                
                logger.info(f"Ollama response status: {response.status_code}")
                
                if response.status_code != 200:
                    error_text = response.text
                    logger.error(f"Ollama error response: {error_text}")
                    return f"LLM Error (HTTP {response.status_code}): {error_text}"
                
                response.raise_for_status()
                data = response.json()
                
                methodology = data.get("response", "")
                if methodology:
                    logger.info(f"LLM generated {len(methodology)} chars of methodology")
                else:
                    logger.warning("LLM returned empty response")
                    
                return methodology if methodology else "Failed to generate methodology."
                
        except httpx.TimeoutException as e:
            logger.error(f"LLM TIMEOUT after 300s: {e}")
            print(f"[RAG ERROR] Ollama timeout - try running a simpler query first to warm up the model")
            return f"Error: Ollama timeout after 5 minutes. Try running 'ollama run llama3.2:1b' in terminal first."
            
        except httpx.ConnectError as e:
            logger.error(f"LLM CONNECTION ERROR: {e}")
            print(f"[RAG ERROR] Cannot connect to Ollama at {self.ollama_url}")
            return f"Error: Cannot connect to Ollama at {self.ollama_url}. Make sure 'ollama serve' is running."
            
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            logger.error(f"LLM generation failed: {e}\n{error_details}")
            print(f"[RAG ERROR] LLM generation failed:\n{error_details}")
            return f"Error generating methodology: {type(e).__name__}: {e}"
    
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
