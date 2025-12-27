"""
RAG System Verification Test

Run this script to test the RAG methodology system:
    python rag/verify_rag.py

Requires:
- ChromaDB installed (pip install chromadb)
- Ollama running with nomic-embed-text model
"""

import asyncio
import json
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))


async def test_rag_system():
    """Test all components of the RAG system."""
    print("=" * 60)
    print("RAG Marine Protocol System - Verification Test")
    print("=" * 60)
    
    results = {
        "method_classifier": False,
        "embedding_service": False,
        "chromadb_service": False,
        "protocol_ingestion": False,
        "full_query": False
    }
    
    # Test 1: Method Classifier
    print("\n[1/5] Testing Method Classifier...")
    try:
        from rag.method_classifier import get_method_classifier
        classifier = get_method_classifier()
        
        test_queries = [
            ("How to do eDNA sampling in estuaries?", "eDNA"),
            ("Otolith extraction for age estimation", "Otolith"),
            ("Fish abundance survey methods", "Survey"),
            ("PERMANOVA analysis for community data", "Statistical"),
        ]
        
        all_correct = True
        for query, expected in test_queries:
            result = classifier.get_primary_type(query)
            status = "✓" if result == expected else "✗"
            print(f"   {status} '{query[:40]}...' → {result} (expected: {expected})")
            if result != expected:
                all_correct = False
        
        results["method_classifier"] = all_correct
        print(f"   → Method Classifier: {'PASS' if all_correct else 'FAIL'}")
        
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    # Test 2: Embedding Service
    print("\n[2/5] Testing Embedding Service...")
    try:
        from rag.embedding_service import get_embedding_service
        embedder = get_embedding_service()
        
        embedding = await embedder.embed("Test query for embedding")
        
        if len(embedding) > 0:
            print(f"   ✓ Generated embedding with {len(embedding)} dimensions")
            results["embedding_service"] = True
            print("   → Embedding Service: PASS")
        else:
            print("   ✗ Empty embedding returned")
            
    except Exception as e:
        print(f"   ✗ Error: {e}")
        print("   → Make sure Ollama is running with nomic-embed-text model")
    
    # Test 3: ChromaDB Service
    print("\n[3/5] Testing ChromaDB Service...")
    try:
        from rag.chromadb_service import get_chromadb_service
        chromadb_service = get_chromadb_service()
        
        stats = chromadb_service.get_stats()
        print(f"   ✓ ChromaDB initialized at: {stats['persist_directory']}")
        print(f"   ✓ SOPs: {stats['sop_count']}, Papers: {stats['paper_count']}")
        results["chromadb_service"] = True
        print("   → ChromaDB Service: PASS")
        
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    # Test 4: Protocol Ingestion
    print("\n[4/5] Testing Protocol Ingestion...")
    try:
        from rag.rag_service import get_rag_service
        rag = get_rag_service()
        
        ingested = await rag.ingest_protocols()
        print(f"   ✓ Ingested {ingested['sops']} SOPs")
        print(f"   ✓ Ingested {ingested['papers']} papers")
        
        if ingested['sops'] > 0 or ingested['papers'] > 0:
            results["protocol_ingestion"] = True
            print("   → Protocol Ingestion: PASS")
        else:
            print("   → Protocol Ingestion: SKIP (already ingested?)")
            # Check if already ingested
            stats = rag.chromadb.get_stats()
            if stats['total_documents'] > 0:
                results["protocol_ingestion"] = True
                print(f"   ✓ {stats['total_documents']} documents already in database")
            
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    # Test 5: Full Query Pipeline
    print("\n[5/5] Testing Full Query Pipeline...")
    try:
        from rag.rag_service import get_rag_service
        rag = get_rag_service()
        
        result = await rag.query("How do I collect water samples for eDNA analysis?")
        
        print(f"   ✓ Query classified as: {result.get('method_types', [])}")
        print(f"   ✓ Confidence score: {result.get('confidence_score', 0)}")
        print(f"   ✓ Citations found: {result.get('citations', [])}")
        print(f"   ✓ Expert review required: {result.get('expert_review_required', False)}")
        
        # Show first 200 chars of methodology
        methodology = result.get('methodology', '')[:200]
        print(f"   ✓ Methodology preview: {methodology}...")
        
        if result.get('success', False):
            results["full_query"] = True
            print("   → Full Query Pipeline: PASS")
        else:
            print("   → Full Query Pipeline: FAIL")
            
    except Exception as e:
        print(f"   ✗ Error: {e}")
        import traceback
        traceback.print_exc()
    
    # Summary
    print("\n" + "=" * 60)
    print("Verification Summary")
    print("=" * 60)
    
    passed = sum(results.values())
    total = len(results)
    
    for test, passed_test in results.items():
        status = "✓ PASS" if passed_test else "✗ FAIL"
        print(f"  {status}: {test}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! RAG system is ready.")
    else:
        print("\n⚠️ Some tests failed. Check the output above for details.")
    
    return results


if __name__ == "__main__":
    asyncio.run(test_rag_system())
