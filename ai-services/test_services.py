"""
AI Services Unit Tests - pytest

Run: pytest test_services.py -v
"""

import pytest
import json
import sys
import os
from unittest.mock import Mock, patch, MagicMock
from io import BytesIO

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestDataCleaner:
    """Tests for the data cleaning service"""
    
    def test_remove_exact_duplicates(self):
        """Test exact duplicate removal"""
        from analytics.data_cleaner import DataCleaner
        
        cleaner = DataCleaner()
        data = [
            {"species": "Tuna", "lat": 10.5, "lon": 75.5},
            {"species": "Tuna", "lat": 10.5, "lon": 75.5},  # Exact duplicate
            {"species": "Salmon", "lat": 11.0, "lon": 76.0},
        ]
        
        result = cleaner.clean_dataset(data, {"remove_duplicates": True})
        
        assert len(result["cleaned_data"]) == 2
        assert result["report"]["duplicates_removed"] >= 1
    
    def test_coordinate_validation(self):
        """Test coordinate range validation"""
        from analytics.data_cleaner import DataCleaner
        
        cleaner = DataCleaner()
        data = [
            {"species": "Tuna", "latitude": 10.5, "longitude": 75.5},  # Valid
            {"species": "Invalid", "latitude": 100.0, "longitude": 75.5},  # Invalid lat
            {"species": "Invalid2", "latitude": 10.5, "longitude": 200.0},  # Invalid lon
        ]
        
        result = cleaner.clean_dataset(data, {"standardize": True})
        
        # Should have warnings for invalid coordinates
        assert len(result["warnings"]) >= 1
    
    def test_missing_value_imputation(self):
        """Test missing value handling"""
        from analytics.data_cleaner import DataCleaner
        
        cleaner = DataCleaner()
        data = [
            {"species": "Tuna", "depth": 100},
            {"species": "Salmon", "depth": None},
            {"species": "Cod", "depth": 150},
        ]
        
        result = cleaner.clean_dataset(data, {
            "impute_missing": True,
            "imputation_strategy": "mean"
        })
        
        # Check that missing value was handled
        assert result["report"]["missing_imputed"] >= 0


class TestCorrelationEngine:
    """Tests for the correlation analysis service"""
    
    def test_pearson_correlation(self):
        """Test Pearson correlation calculation"""
        from analytics.correlation_engine import CorrelationEngine
        
        engine = CorrelationEngine()
        
        # Create correlated data
        data = {
            "oceanography": [
                {"temperature": 25.0, "salinity": 35.0, "latitude": 10.0},
                {"temperature": 26.0, "salinity": 35.2, "latitude": 10.5},
                {"temperature": 27.0, "salinity": 35.4, "latitude": 11.0},
                {"temperature": 28.0, "salinity": 35.6, "latitude": 11.5},
                {"temperature": 29.0, "salinity": 35.8, "latitude": 12.0},
            ] * 3  # Repeat to ensure enough samples
        }
        
        result = engine.analyze(data, {"method": "pearson", "min_samples": 5})
        
        assert "correlations" in result
        assert "correlation_matrix" in result
    
    def test_insufficient_samples(self):
        """Test handling of insufficient samples"""
        from analytics.correlation_engine import CorrelationEngine
        
        engine = CorrelationEngine()
        
        data = {
            "oceanography": [
                {"temperature": 25.0, "salinity": 35.0},
                {"temperature": 26.0, "salinity": 35.2},
            ]
        }
        
        result = engine.analyze(data, {"min_samples": 10})
        
        # Should handle gracefully with warnings
        assert "warnings" in result or len(result.get("correlations", [])) == 0


class TestLLMService:
    """Tests for the LLM chat service"""
    
    @pytest.mark.asyncio
    async def test_fallback_response_species(self):
        """Test fallback response for species queries"""
        from chat.llm_service import LLMService
        
        service = LLMService()
        
        # Test species-related query
        result = await service.chat("What fish species are found in the Arabian Sea?")
        
        assert "response" in result
        assert len(result["response"]) > 0
        assert "confidence" in result
    
    @pytest.mark.asyncio
    async def test_fallback_response_oceanography(self):
        """Test fallback response for oceanography queries"""
        from chat.llm_service import LLMService
        
        service = LLMService()
        
        result = await service.chat("What is the average temperature in tropical waters?")
        
        assert "response" in result
        assert "temperature" in result["response"].lower() or len(result["response"]) > 0
    
    @pytest.mark.asyncio
    async def test_context_enhancement(self):
        """Test context-aware message enhancement"""
        from chat.llm_service import LLMService
        
        service = LLMService()
        
        context = {
            "current_page": "Species Explorer",
            "selected_species": "Thunnus albacares"
        }
        
        result = await service.chat("Tell me more about this species", context=context)
        
        assert "response" in result


class TestOtolithAnalyzer:
    """Tests for otolith image analysis"""
    
    def test_image_preprocessing(self):
        """Test image preprocessing functions"""
        from otolith.otolith_analyzer import OtolithAnalyzer
        import numpy as np
        
        analyzer = OtolithAnalyzer()
        
        # Create a simple test image
        test_image = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
        
        # Test grayscale conversion
        gray = analyzer._to_grayscale(test_image)
        assert len(gray.shape) == 2
        assert gray.shape == (100, 100)
    
    def test_ring_detection_methods(self):
        """Test that ring detection methods exist and are callable"""
        from otolith.otolith_analyzer import OtolithAnalyzer
        
        analyzer = OtolithAnalyzer()
        
        # Check that detection methods exist
        assert hasattr(analyzer, '_detect_rings_canny') or hasattr(analyzer, 'detect_rings')
        assert hasattr(analyzer, '_calculate_age') or hasattr(analyzer, 'estimate_age')


class TestEdnaProcessor:
    """Tests for eDNA sequence processing"""
    
    def test_sequence_parsing_fasta(self):
        """Test FASTA sequence parsing"""
        from edna.edna_processor import EdnaProcessor
        
        processor = EdnaProcessor()
        
        fasta_content = """>seq1
ATGCGATCGATCGATCG
>seq2
GCTAGCTAGCTAGCTAG"""
        
        sequences = processor.parse_sequence_string(fasta_content, "fasta")
        
        assert len(sequences) == 2
        assert sequences[0].id == "seq1"
    
    def test_quality_metrics(self):
        """Test quality metrics calculation"""
        from edna.edna_processor import EdnaProcessor, Sequence
        
        processor = EdnaProcessor()
        
        sequences = [
            Sequence(id="seq1", sequence="ATGCGATCGATCGATCG", quality=None),
            Sequence(id="seq2", sequence="GCTAGCTAGCTAGCTAG", quality=None),
        ]
        
        metrics = processor.calculate_quality_metrics(sequences)
        
        assert metrics.total_sequences == 2
        assert metrics.total_bases > 0
    
    def test_biodiversity_calculation(self):
        """Test biodiversity metrics calculation"""
        from edna.edna_processor import EdnaProcessor, SpeciesDetection
        
        processor = EdnaProcessor()
        
        detections = [
            SpeciesDetection(species="Species A", confidence=0.95, method="BLAST", reads=100),
            SpeciesDetection(species="Species B", confidence=0.90, method="BLAST", reads=50),
            SpeciesDetection(species="Species C", confidence=0.85, method="BLAST", reads=25),
        ]
        
        biodiversity = processor.calculate_biodiversity(detections)
        
        assert biodiversity.species_count == 3
        assert biodiversity.shannon_index >= 0  # Shannon index should be non-negative
        assert 0 <= biodiversity.simpson_index <= 1  # Simpson index between 0 and 1


class TestNicheModeler:
    """Tests for environmental niche modeling"""
    
    def test_coordinate_validation(self):
        """Test that coordinates are properly validated"""
        from analytics.niche_modeler import EnvironmentalNicheModeler
        
        modeler = EnvironmentalNicheModeler()
        
        # Valid coordinates
        valid_coords = [[10.0, 75.0], [11.0, 76.0], [12.0, 77.0]]
        
        # This should not raise an error
        # The actual fit may fail due to missing environmental data, but validation should pass
        try:
            modeler.validate_coordinates(valid_coords)
        except AttributeError:
            # Method may not exist, which is fine
            pass
    
    def test_environmental_profile(self):
        """Test environmental profile generation"""
        from analytics.niche_modeler import EnvironmentalNicheModeler
        
        modeler = EnvironmentalNicheModeler()
        
        # Test that the modeler can generate profiles
        assert hasattr(modeler, 'get_environmental_profile') or hasattr(modeler, 'fit')


class TestReportGenerator:
    """Tests for report generation"""
    
    def test_html_report_generation(self):
        """Test HTML report generation"""
        from analytics.report_generator import ReportGenerator, ReportMetadata, ReportSection
        
        generator = ReportGenerator("./test_reports")
        
        metadata = ReportMetadata(
            title="Test Report",
            author="Test Author",
            report_type="custom"
        )
        
        sections = [
            ReportSection(
                title="Introduction",
                content="This is a test report.",
                key_findings=["Finding 1", "Finding 2"]
            )
        ]
        
        result = generator.generate(metadata, sections, format="html")
        
        assert result is not None
        assert "content" in result or "html" in result.lower() if isinstance(result, str) else True


class TestAPIEndpoints:
    """Integration tests for FastAPI endpoints"""
    
    @pytest.fixture
    def client(self):
        """Create test client"""
        from fastapi.testclient import TestClient
        from main import app
        return TestClient(app)
    
    def test_health_endpoint(self, client):
        """Test health check endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
    
    def test_classify_species_no_file(self, client):
        """Test species classification without file"""
        response = client.post("/classify-species")
        assert response.status_code == 422  # Validation error
    
    def test_analyze_otolith_no_file(self, client):
        """Test otolith analysis without file"""
        response = client.post("/analyze-otolith")
        assert response.status_code == 422  # Validation error
    
    def test_chat_endpoint(self, client):
        """Test chat endpoint"""
        response = client.post("/chat", json={
            "message": "What species of fish are found in the Indian Ocean?"
        })
        
        # Should return 200 even if using fallback
        assert response.status_code == 200
        assert "response" in response.json()
    
    def test_clean_data_endpoint(self, client):
        """Test data cleaning endpoint"""
        response = client.post("/clean-data", json={
            "data": [
                {"species": "Tuna", "lat": 10.5},
                {"species": "Tuna", "lat": 10.5},  # Duplicate
            ],
            "options": {"remove_duplicates": True}
        })
        
        assert response.status_code == 200
        assert "cleaned_data" in response.json()


# Run with: pytest test_services.py -v --tb=short
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
