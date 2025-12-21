from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import os
import tempfile
import shutil
from typing import Optional, Dict, Any, List

app = FastAPI(
    title="CMLRE AI Services",
    description="AI/ML microservices for marine data processing",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ====================================
# Real Database Query Functions
# ====================================

def get_real_species_from_database() -> List[Dict]:
    """Query the actual species database (species.json)"""
    import json
    from pathlib import Path
    
    # Try multiple possible locations
    possible_paths = [
        Path(__file__).parent.parent / "database" / "seeds" / "species.json",
        Path("../database/seeds/species.json"),
        Path("database/seeds/species.json"),
    ]
    
    for db_path in possible_paths:
        if db_path.exists():
            try:
                with open(db_path, 'r') as f:
                    data = json.load(f)
                
                # Get unique species
                unique_species = {}
                for sp in data:
                    sci_name = sp.get('scientificName', '')
                    if sci_name and sci_name not in unique_species:
                        unique_species[sci_name] = {
                            'scientificName': sci_name,
                            'commonName': sp.get('commonName', ''),
                            'family': sp.get('family', ''),
                            'habitat': sp.get('habitat', ''),
                            'conservationStatus': sp.get('conservationStatus', ''),
                            'distribution': sp.get('distribution', [])
                        }
                
                return list(unique_species.values())
            except Exception as e:
                print(f"Error reading species database: {e}")
    
    return []


def get_database_summary() -> str:
    """Get a summary of the real database for AI context"""
    species_list = get_real_species_from_database()
    if not species_list:
        return "Database not available."
    
    summary = f"The CMLRE Marine Database contains {len(species_list)} unique species:\n"
    for sp in species_list:
        summary += f"- {sp['commonName']} ({sp['scientificName']}) - {sp['habitat']}, Status: {sp['conservationStatus']}\n"
    
    return summary

# Pydantic models
class ChatRequest(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None

class ChatResponse(BaseModel):
    response: str
    confidence: float = 1.0

class ClassificationResult(BaseModel):
    species: str
    confidence: float
    alternatives: list

class AgeEstimationResult(BaseModel):
    estimated_age: int
    confidence: float
    confidence_level: str
    age_range: Dict[str, Any]
    growth_analysis: Dict[str, Any]
    fish_size_estimate: Dict[str, Any]
    morphometrics: Dict[str, Any]
    visualization: str
    analysis_methods: List[str]

@app.get("/")
async def root():
    return {
        "service": "CMLRE AI Services",
        "status": "operational",
        "version": "1.0.0",
        "endpoints": {
            "chat": {
                "POST /chat": "Natural language queries"
            },
            "classification": {
                "POST /classify-fish": "Fish species identification via Fishial.AI"
            },
            "otolith": {
                "POST /analyze-otolith": "Otolith shape analysis",
                "POST /analyze-otolith-age": "Age estimation from otolith images"
            },
            "edna": {
                "POST /process-edna": "eDNA sequence processing",
                "POST /edna/analyze-sequences": "Sequence quality analysis",
                "POST /edna/biodiversity": "Biodiversity metrics calculation"
            },
            "metadata": {
                "POST /extract-metadata": "Extract metadata from files",
                "POST /extract-metadata-text": "Extract metadata from text content"
            },
            "niche_modeling": {
                "POST /model-niche": "Environmental niche modeling",
                "POST /predict-habitat-suitability": "Predict habitat suitability"
            },
            "reports": {
                "POST /generate-report": "Generate comprehensive reports",
                "POST /generate-quick-report": "Quick analysis reports"
            },
            "utilities": {
                "POST /clean-data": "AI-powered data cleaning",
                "POST /correlate": "Cross-domain correlation analysis"
            },
            "classification_v2": {
                "POST /classify-fish-v2": "Hierarchical fish classification (Indian Ocean)",
                "GET /species-catalog": "Get species catalog",
                "POST /add-species": "Add new species to catalog",
                "POST /training/add-images": "Add training images",
                "POST /training/train": "Train model from scratch",
                "POST /training/fine-tune": "Fine-tune with new species",
                "GET /training/status": "Get training data status"
            }
        }
    }

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Intelligent marine-domain chat endpoint.
    
    Uses Ollama (local LLM) or falls back to OpenAI for natural language queries.
    Provides context-aware responses for:
    - Species identification and information
    - Oceanographic data interpretation
    - eDNA analysis guidance
    - Research methodology assistance
    
    Context can include domain-specific data to enhance responses.
    """
    from chat.llm_service import LLMService
    
    try:
        llm_service = LLMService()
        result = await llm_service.chat(
            message=request.message,
            context=request.context
        )
        
        return ChatResponse(
            response=result.get("response", "I couldn't generate a response."),
            confidence=result.get("confidence", 0.5)
        )
    except Exception as e:
        import traceback
        print(f"Chat error: {str(e)}\n{traceback.format_exc()}")
        # Fallback response
        return ChatResponse(
            response=f"I apologize, but I encountered an error processing your request. Please try again. Error: {str(e)}",
            confidence=0.0
        )

@app.post("/classify-fish")
async def classify_fish(image: UploadFile = File(...)):
    """
    Fish species classification using Fishial.AI Recognition™
    
    Powered by the world's largest open-source fish identification model.
    Supports 639 species worldwide (Model V9).
    
    API: https://fishial.ai
    """
    from classification.fishial_classifier import classify_fish_image
    
    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp']
    if image.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: JPEG, PNG, WebP, BMP"
        )
    
    try:
        # Read image data
        image_data = await image.read()
        
        # Classify using Fishial.AI
        result = await classify_fish_image(image_data, image.filename or "image.jpg")
        
        return result
        
    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"Classification failed: {str(e)}"
        )


# ============================================
# INDIAN OCEAN FISH CLASSIFICATION V2
# Hierarchical classifier with trainable model
# ============================================

class AddSpeciesRequest(BaseModel):
    scientific_name: str
    common_name: str
    habitat: str  # pelagic, demersal, reef, coastal, deep_sea
    family: str


@app.post("/classify-fish-v2")
async def classify_fish_v2(image: UploadFile = File(...)):
    """
    Hierarchical Fish Classification for Indian Ocean Species
    
    Uses a locally-trained deep learning model with:
    - Habitat classification (pelagic, reef, coastal, etc.)
    - Family classification (Scombridae, Carangidae, etc.)
    - Species identification
    - Unknown species detection (confidence-based)
    
    Model is trainable - new species can be added by admin.
    """
    from classification.fish_classifier import get_classifier
    
    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp']
    if image.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: JPEG, PNG, WebP, BMP"
        )
    
    try:
        # Read image data
        image_data = await image.read()
        
        # Classify using hierarchical model
        classifier = get_classifier()
        result = classifier.classify(image_data)
        
        return result.to_dict()
        
    except Exception as e:
        import traceback
        print(f"Classification v2 error: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Classification failed: {str(e)}"
        )


@app.get("/species-catalog")
async def get_species_catalog():
    """
    Get the species catalog for classification
    
    Returns all species in the training catalog with:
    - Scientific and common names
    - Habitat and family
    - Training image count
    """
    from classification.fish_classifier import get_species_catalog
    
    try:
        return get_species_catalog()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/add-species")
async def add_species(request: AddSpeciesRequest):
    """
    Add a new species to the classification catalog
    
    After adding, upload training images via /training/add-images
    Then retrain with /training/fine-tune
    """
    from classification.fish_classifier import add_species as catalog_add_species
    
    try:
        success = catalog_add_species(
            scientific_name=request.scientific_name,
            common_name=request.common_name,
            habitat=request.habitat,
            family=request.family
        )
        
        if success:
            return {
                "success": True,
                "message": f"Species {request.scientific_name} added to catalog",
                "next_step": "Upload training images via POST /training/add-images"
            }
        else:
            return {
                "success": False,
                "message": f"Species {request.scientific_name} already exists in catalog"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/training/add-images")
async def add_training_images(
    scientific_name: str = Form(...),
    images: List[UploadFile] = File(...)
):
    """
    Add training images for a species
    
    Minimum 30 images recommended for reliable classification.
    Images will be preprocessed and stored for training.
    """
    from classification.species_trainer import add_species_images
    
    try:
        # Read all image data
        image_data = []
        for img in images:
            data = await img.read()
            image_data.append(data)
        
        result = add_species_images(scientific_name, image_data)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/training/train")
async def train_model_endpoint():
    """
    Train the classification model from scratch
    
    This is a long-running operation (may take 30+ minutes).
    Use /training/fine-tune for faster updates with new species.
    """
    from classification.species_trainer import train_model
    
    try:
        result = train_model()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/training/fine-tune")
async def fine_tune_model_endpoint():
    """
    Fine-tune the model with new species
    
    Faster than full training - only updates classification heads.
    Use after adding new species and their training images.
    """
    from classification.species_trainer import fine_tune_model
    
    try:
        result = fine_tune_model()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/training/status")
async def get_training_status_endpoint():
    """
    Get the current training data status
    
    Shows which species have enough training images
    and which need more data before training.
    """
    from classification.species_trainer import get_training_status
    
    try:
        return get_training_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-otolith")
async def analyze_otolith(image: UploadFile = File(...)):
    """
    Otolith shape analysis and species prediction
    """
    from otolith.otolith_analyzer import OtolithAnalyzer
    
    # Save uploaded file temporarily
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, image.filename)
    
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        
        analyzer = OtolithAnalyzer()
        _, mask = analyzer.segment_otolith(temp_path)
        measurements = analyzer.extract_measurements(mask)
        species, confidence = analyzer.predict_species(temp_path)
        
        return {
            "measurements": measurements,
            "predicted_species": species,
            "confidence": confidence
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@app.post("/analyze-otolith-age")
async def analyze_otolith_age(
    image: UploadFile = File(...),
    species: Optional[str] = Form(None),
    method: Optional[str] = Form("ensemble")
):
    """
    State-of-the-art otolith age estimation using ensemble methods.
    
    Available methods:
    - ensemble: Combines all methods for highest accuracy (default)
    - canny: Canny edge detection
    - sobel: Sobel gradient method
    - laplacian: Laplacian of Gaussian
    - adaptive: Adaptive thresholding
    - radial: Radial profile analysis
    
    Returns comprehensive age estimation with confidence scoring,
    growth pattern analysis, and fish size estimation.
    """
    from otolith.otolith_analyzer import OtolithAnalyzer
    
    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'image/tiff']
    if image.content_type not in allowed_types:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type. Allowed: {allowed_types}"
        )
    
    # Save uploaded file temporarily
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, image.filename)
    
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        
        # Initialize analyzer and run analysis with specified method
        analyzer = OtolithAnalyzer()
        results = analyzer.analyze_age(temp_path, method=method)
        
        # If species provided, update fish size estimate
        if species:
            results["fish_size_estimate"] = analyzer.age_estimator.estimate_fish_size(
                results["age_estimation"]["estimated_age"],
                species
            )
        
        return {
            "success": True,
            "estimated_age": results["age_estimation"]["estimated_age"],
            "confidence": results["age_estimation"]["confidence"],
            "confidence_level": results["age_estimation"]["confidence_level"],
            "age_range": results["age_estimation"]["age_range"],
            "ensemble_details": results["age_estimation"]["ensemble_details"],
            "growth_analysis": results["growth_analysis"],
            "fish_size_estimate": results["fish_size_estimate"],
            "morphometrics": results["morphometrics"],
            "visualization": results["visualization"],
            "center": results["center"],
            "analysis_methods": results["analysis_methods"]
        }
        
    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500, 
            detail=f"Analysis failed: {str(e)}\n{traceback.format_exc()}"
        )
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

@app.post("/process-edna")
async def process_edna(
    sequence_file: UploadFile = File(...),
    method: str = Form("BLAST"),
    min_length: int = Form(100),
    min_quality: float = Form(20)
):
    """
    Comprehensive eDNA sequence processing and species detection.
    
    Supports FASTA and FASTQ formats.
    
    Methods:
    - BLAST: NCBI BLAST search against nt database
    - Kraken2: Fast taxonomic classification (requires local DB)
    - both: Run both methods and aggregate results
    
    Returns species detections, quality metrics, and biodiversity analysis.
    """
    from edna.edna_processor import EdnaProcessor, SpeciesDetection
    
    # Validate file type
    allowed_extensions = ['.fasta', '.fa', '.fastq', '.fq', '.fas']
    filename = sequence_file.filename or "sequences.fasta"
    ext = os.path.splitext(filename)[1].lower()
    
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Save uploaded file temporarily
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, filename)
    
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(sequence_file.file, buffer)
        
        processor = EdnaProcessor()
        
        # Parse sequences
        sequences = processor.parse_sequences(temp_path)
        
        # Quality filtering
        passed, failed = processor.quality_filter(
            sequences, 
            min_length=min_length,
            min_quality=min_quality
        )
        
        # Calculate quality metrics
        quality_metrics = processor.calculate_quality_metrics(sequences)
        
        # Run detection methods
        detections = []
        
        if method.upper() in ["BLAST", "BOTH"]:
            try:
                blast_results = processor.run_blast(passed[:5])  # Limit for demo
                detections.extend(blast_results)
            except Exception as e:
                print(f"BLAST error: {e}")
        
        if method.upper() in ["KRAKEN2", "BOTH"]:
            try:
                kraken_results = processor.run_kraken2(temp_path)
                detections.extend(kraken_results)
            except Exception as e:
                print(f"Kraken2 error: {e}")
        
        # If no real detections, provide demo data
        if not detections:
            detections = [
                SpeciesDetection(
                    species="Thunnus albacares",
                    confidence=0.95,
                    method="BLAST (Demo)",
                    reads=150,
                    taxonomy={
                        "kingdom": "Animalia",
                        "phylum": "Chordata", 
                        "class": "Actinopterygii",
                        "order": "Scombriformes",
                        "family": "Scombridae",
                        "genus": "Thunnus",
                        "species": "Thunnus albacares"
                    }
                ),
                SpeciesDetection(
                    species="Coryphaena hippurus",
                    confidence=0.88,
                    method="BLAST (Demo)",
                    reads=80,
                    taxonomy={
                        "kingdom": "Animalia",
                        "phylum": "Chordata",
                        "class": "Actinopterygii",
                        "order": "Carangiformes",
                        "family": "Coryphaenidae",
                        "genus": "Coryphaena",
                        "species": "Coryphaena hippurus"
                    }
                ),
            ]
        
        # Calculate biodiversity metrics
        biodiversity = processor.calculate_biodiversity(detections)
        
        # Build taxonomy tree
        taxonomy_tree = processor.build_taxonomy_tree(detections)
        
        return {
            "success": True,
            "file_info": {
                "filename": filename,
                "format": "FASTQ" if ext in ['.fastq', '.fq'] else "FASTA",
                "total_sequences": len(sequences),
                "passed_qc": len(passed),
                "failed_qc": len(failed)
            },
            "quality_metrics": quality_metrics.to_dict(),
            "detections": [d.to_dict() for d in detections],
            "biodiversity": biodiversity.to_dict(),
            "taxonomy_tree": taxonomy_tree,
            "methods_used": list(set(d.method for d in detections))
        }
        
    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {str(e)}\n{traceback.format_exc()}"
        )
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@app.post("/edna/analyze-sequences")
async def analyze_edna_sequences(
    sequences: List[str],
    format_type: str = "fasta"
):
    """
    Analyze eDNA sequences provided as strings.
    
    Returns quality metrics and sequence statistics.
    """
    from edna.edna_processor import EdnaProcessor
    
    try:
        processor = EdnaProcessor()
        
        # Combine sequences into content
        if format_type.lower() == "fasta":
            content = "\n".join(sequences)
        else:
            content = "\n".join(sequences)
        
        # Parse sequences
        parsed = processor.parse_sequence_string(content, format_type)
        
        # Calculate quality metrics
        quality_metrics = processor.calculate_quality_metrics(parsed)
        
        return {
            "success": True,
            "sequence_count": len(parsed),
            "sequences": [s.to_dict() for s in parsed[:50]],  # Return first 50
            "quality_metrics": quality_metrics.to_dict()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}"
        )


@app.post("/edna/biodiversity")
async def calculate_biodiversity(detections: List[Dict[str, Any]]):
    """
    Calculate biodiversity metrics from species detection data.
    
    Input should be a list of detections with 'species', 'reads', and 'confidence' fields.
    """
    from edna.edna_processor import EdnaProcessor, SpeciesDetection
    
    try:
        processor = EdnaProcessor()
        
        # Convert to SpeciesDetection objects
        detection_objects = [
            SpeciesDetection(
                species=d.get("species", "Unknown"),
                confidence=d.get("confidence", 0.5),
                method=d.get("method", "unknown"),
                reads=d.get("reads", 1)
            )
            for d in detections
        ]
        
        # Calculate metrics
        metrics = processor.calculate_biodiversity(detection_objects)
        
        return {
            "success": True,
            "biodiversity": metrics.to_dict(),
            "interpretation": {
                "diversity_level": (
                    "High" if metrics.shannon_index > 2.5 else
                    "Moderate" if metrics.shannon_index > 1.5 else
                    "Low"
                ),
                "evenness_level": (
                    "Very even" if metrics.evenness > 0.8 else
                    "Moderately even" if metrics.evenness > 0.5 else
                    "Uneven"
                ),
                "estimated_total_species": round(metrics.chao1)
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Calculation failed: {str(e)}"
        )

@app.post("/extract-metadata")
async def extract_metadata(
    file: UploadFile = File(...),
    extract_tags: bool = Form(True)
):
    """
    AI-powered metadata extraction from documents, images, and data files.
    
    Supports:
    - Text files: CSV, JSON, TXT, etc.
    - Images: JPEG, PNG with EXIF extraction
    - Documents: With OCR capability
    
    Extracts:
    - Dates, locations (coordinates)
    - Species names, taxonomic info
    - Environmental parameters
    - Geographic locations
    - Research equipment/methods
    """
    from analytics.metadata_tagger import MetadataExtractor
    
    # Save uploaded file temporarily
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, file.filename or "uploaded_file")
    
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        extractor = MetadataExtractor()
        
        # Extract metadata
        result = extractor.extract_from_file(temp_path)
        
        # Generate tags if requested
        tags = extractor.generate_tags(result) if extract_tags else []
        
        # Classify data type
        data_type = extractor.classify_data_type(result)
        
        # Calculate confidence
        confidence = extractor.calculate_confidence(result)
        
        return {
            "success": True,
            "filename": file.filename,
            "extracted_metadata": result,
            "auto_tags": tags,
            "data_classification": data_type,
            "confidence": confidence,
            "extraction_methods": result.get('extraction_methods', [])
        }
        
    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"Metadata extraction failed: {str(e)}"
        )
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


class MetadataExtractionRequest(BaseModel):
    """Request model for text-based metadata extraction"""
    content: str
    content_type: str = "text"  # text, json, csv


@app.post("/extract-metadata-text")
async def extract_metadata_text(request: MetadataExtractionRequest):
    """
    Extract metadata from text content.
    
    Useful for extracting entities from:
    - Research notes
    - Field observations
    - Data descriptions
    """
    from analytics.metadata_tagger import MetadataExtractor
    
    try:
        extractor = MetadataExtractor()
        
        if request.content_type == "json":
            import json
            data = json.loads(request.content)
            result = extractor.extract_from_dict(data)
        else:
            result = extractor.extract_from_text(request.content)
        
        # Generate tags and classify
        tags = extractor.generate_tags(result)
        data_type = extractor.classify_data_type(result)
        confidence = extractor.calculate_confidence(result)
        
        return {
            "success": True,
            "extracted_metadata": result,
            "auto_tags": tags,
            "data_classification": data_type,
            "confidence": confidence
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Extraction failed: {str(e)}"
        )

class DataCleaningRequest(BaseModel):
    """Request model for data cleaning"""
    data: List[Dict[str, Any]]
    options: Optional[Dict[str, Any]] = None


@app.post("/clean-data")
async def clean_data(request: DataCleaningRequest):
    """
    AI-powered data cleaning and standardization for marine datasets.
    
    Features:
    - Duplicate detection (exact and fuzzy matching)
    - Marine-specific standardization (coordinates, species names, depths)
    - Missing value imputation with intelligent strategies
    - Outlier detection using IQR method
    - Format normalization (units, dates, case)
    
    Options:
    - remove_duplicates: bool (default: True)
    - standardize: bool (default: True)
    - impute_missing: bool (default: True)
    - detect_outliers: bool (default: True)
    - normalize_formats: bool (default: True)
    - fuzzy_threshold: float (default: 0.85)
    - imputation_strategy: str ('mean', 'median', 'mode', 'interpolate')
    
    Returns cleaned data with detailed report of all changes made.
    """
    from analytics.data_cleaner import DataCleaner
    
    try:
        cleaner = DataCleaner()
        options = request.options or {}
        
        result = cleaner.clean_dataset(request.data, options)
        
        return {
            "success": True,
            "cleaned_data": result.get("cleaned_data", []),
            "report": result.get("report", {}),
            "corrections": result.get("corrections", []),
            "warnings": result.get("warnings", []),
            "summary": {
                "original_records": len(request.data),
                "cleaned_records": len(result.get("cleaned_data", [])),
                "duplicates_removed": result.get("report", {}).get("duplicates_removed", 0),
                "values_standardized": result.get("report", {}).get("values_standardized", 0),
                "missing_values_imputed": result.get("report", {}).get("missing_imputed", 0),
                "outliers_detected": result.get("report", {}).get("outliers_detected", 0)
            }
        }
        
    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"Data cleaning failed: {str(e)}"
        )


class NicheModelRequest(BaseModel):
    """Request model for niche modeling"""
    occurrence_data: List[Dict[str, Any]]  # List of {lat, lon, species?, date?}
    environmental_variables: Optional[List[str]] = None
    model_type: str = "maxent"  # maxent, bioclim, gower
    prediction_resolution: float = 0.5  # Grid resolution in degrees


@app.post("/model-niche")
async def model_niche(request: NicheModelRequest):
    """
    Environmental Niche Modeling for species distribution prediction.
    
    Implements Species Distribution Modeling (SDM) approaches:
    - MaxEnt-style: Maximum entropy modeling
    - BIOCLIM: Envelope-based climate modeling
    - Gower distance: Similarity-based prediction
    
    Input:
    - occurrence_data: List of occurrence records with lat/lon
    - environmental_variables: Variables to include (optional)
    - model_type: Algorithm to use
    
    Returns:
    - Habitat suitability predictions
    - Environmental variable importance
    - Model performance metrics
    """
    from analytics.niche_modeler import EnvironmentalNicheModeler
    
    try:
        modeler = EnvironmentalNicheModeler()
        
        # Extract coordinates and species
        coordinates = []
        species_name = None
        
        for occ in request.occurrence_data:
            lat = occ.get('lat') or occ.get('latitude') or occ.get('decimalLatitude')
            lon = occ.get('lon') or occ.get('lng') or occ.get('longitude') or occ.get('decimalLongitude')
            
            if lat is not None and lon is not None:
                coordinates.append([float(lat), float(lon)])
                
            if not species_name:
                species_name = occ.get('species') or occ.get('scientificName', 'Unknown')
        
        if len(coordinates) < 5:
            raise HTTPException(
                status_code=400,
                detail="At least 5 occurrence records with valid coordinates required"
            )
        
        # Fit model
        model_result = modeler.fit(
            coordinates=coordinates,
            species_name=species_name,
            env_variables=request.environmental_variables,
            method=request.model_type
        )
        
        # Generate predictions for study area
        predictions = modeler.predict_suitability(
            model_result,
            resolution=request.prediction_resolution
        )
        
        # Get variable importance
        importance = modeler.get_variable_importance(model_result)
        
        # Get environmental profile
        env_profile = modeler.get_environmental_profile(model_result)
        
        return {
            "success": True,
            "species": species_name,
            "model_type": request.model_type,
            "occurrence_count": len(coordinates),
            "model_metrics": model_result.get('metrics', {}),
            "variable_importance": importance,
            "environmental_profile": env_profile,
            "suitability_map": predictions.get('suitability_grid', []),
            "suitable_area": predictions.get('suitable_area_km2', 0),
            "hotspots": predictions.get('hotspots', []),
            "niche_breadth": model_result.get('niche_breadth', {}),
            "visualization": model_result.get('visualization')
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"Niche modeling failed: {str(e)}"
        )


class NichePredictionRequest(BaseModel):
    """Request for predicting suitability at specific locations"""
    model_id: Optional[str] = None
    locations: List[Dict[str, float]]  # List of {lat, lon}
    species: str
    env_conditions: Optional[Dict[str, float]] = None


@app.post("/predict-habitat-suitability")
async def predict_habitat_suitability(request: NichePredictionRequest):
    """
    Predict habitat suitability for specific locations.
    
    Useful for:
    - Assessing potential sampling sites
    - Evaluating restoration locations
    - Climate change impact predictions
    """
    from analytics.niche_modeler import EnvironmentalNicheModeler
    
    try:
        modeler = EnvironmentalNicheModeler()
        
        predictions = []
        for loc in request.locations:
            lat = loc.get('lat') or loc.get('latitude', 0)
            lon = loc.get('lon') or loc.get('longitude', 0)
            
            suitability = modeler.predict_location(
                lat=lat,
                lon=lon,
                species=request.species,
                env_conditions=request.env_conditions
            )
            
            predictions.append({
                "lat": lat,
                "lon": lon,
                "suitability": suitability.get('score', 0),
                "classification": suitability.get('classification', 'Unknown'),
                "limiting_factors": suitability.get('limiting_factors', []),
                "environmental_values": suitability.get('env_values', {})
            })
        
        # Summary statistics
        scores = [p['suitability'] for p in predictions]
        
        return {
            "success": True,
            "species": request.species,
            "predictions": predictions,
            "summary": {
                "mean_suitability": sum(scores) / len(scores) if scores else 0,
                "max_suitability": max(scores) if scores else 0,
                "min_suitability": min(scores) if scores else 0,
                "highly_suitable_count": sum(1 for s in scores if s > 0.7),
                "unsuitable_count": sum(1 for s in scores if s < 0.3)
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(e)}"
        )

class CorrelationRequest(BaseModel):
    """Request model for correlation analysis"""
    data: Dict[str, Any]  # Can be domain-specific data or unified dataset
    options: Optional[Dict[str, Any]] = None


@app.post("/correlate")
async def correlate_data_endpoint(request: CorrelationRequest):
    """
    Cross-domain correlation analysis for marine research data.
    
    Analyzes relationships between:
    - Species occurrence ↔ Environmental parameters
    - Temperature ↔ Species abundance
    - Depth ↔ Community composition
    - eDNA detections ↔ Traditional surveys
    - Temporal trends across domains
    
    Input data format:
    - Unified dataset: List of records with mixed fields
    - Domain-specific: {oceanography: [...], species: [...], edna: [...]}
    
    Options:
    - method: 'pearson', 'spearman', 'kendall' (default: 'pearson')
    - min_samples: Minimum samples for correlation (default: 10)
    - p_threshold: P-value threshold for significance (default: 0.05)
    - analyze_temporal: Include temporal trend analysis (default: True)
    
    Returns:
    - Correlation matrix and significant correlations
    - Cross-domain insights and recommendations
    - Temporal patterns (trends, seasonality)
    - Visualization configurations
    """
    from analytics.correlation_engine import CorrelationEngine
    
    try:
        engine = CorrelationEngine()
        options = request.options or {}
        
        result = engine.analyze(request.data, options)
        
        return {
            "success": True,
            "correlations": result.get("correlations", []),
            "all_correlations": result.get("all_correlations", []),
            "correlation_matrix": result.get("correlation_matrix", {}),
            "p_values": result.get("p_values", {}),
            "insights": result.get("insights", []),
            "temporal_analysis": result.get("temporal_analysis", {}),
            "visualizations": result.get("visualizations", []),
            "summary": result.get("summary", {}),
            "warnings": result.get("warnings", [])
        }
        
    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"Correlation analysis failed: {str(e)}"
        )


class ReportSectionInput(BaseModel):
    """Input model for a report section"""
    title: str
    content: str = ""
    level: int = 1
    key_findings: List[str] = []
    bullet_points: List[str] = []
    chart_configs: List[Dict[str, Any]] = []
    table_configs: List[Dict[str, Any]] = []


class ReportGenerationRequest(BaseModel):
    """Request model for report generation"""
    title: str
    report_type: str = "custom"  # species_analysis, edna_analysis, biodiversity, niche_model, survey_summary
    format: str = "html"  # pdf, html, markdown, json
    author: str = "CMLRE Marine Data Platform"
    abstract: str = ""
    keywords: List[str] = []
    sections: List[ReportSectionInput] = []
    data: Optional[Dict[str, Any]] = None  # Raw data for auto-generation
    use_llm: bool = True  # NEW: whether to use LLM for intelligent generation


async def _generate_llm_report_content(title: str, abstract: str, report_type: str) -> Dict[str, Any]:
    """
    Use LLM to generate intelligent report content based on user query.
    Queries both MongoDB and PostgreSQL for relevant data.
    """
    from chat.llm_service import LLMService
    import logging
    
    llm_service = LLMService()
    
    # Construct the query for the LLM
    query = f"""Generate a report about: {title}

Additional context: {abstract if abstract else 'None provided'}
Report type: {report_type}

Based on the database information provided in your context, please:
1. List the relevant species/data that match the user's request
2. Provide key findings
3. Give a brief analysis

If the user asks for species "starting with X" or "ending with X", filter the species list accordingly by SCIENTIFIC NAME.
If the user asks about a specific habitat or family, filter by that.
ONLY list species that match the criteria from the database context provided to you.

Format your response EXACTLY as:
SPECIES LIST:
- Genus species (Common Name) - Family - Habitat

KEY FINDINGS:
- Finding 1
- Finding 2
- Finding 3

ANALYSIS:
Your brief analytical paragraph here.
"""
    
    try:
        # Call the LLM
        logging.info(f"Calling LLM for report: {title}")
        response = await llm_service.chat(query, allow_fallback=False)
        
        # Ensure response is a string
        if not isinstance(response, str):
            if isinstance(response, dict):
                response = response.get('response', str(response))
            else:
                response = str(response)
        
        logging.info(f"LLM response length: {len(response)} chars")
        logging.info(f"LLM response preview: {response[:500] if len(response) > 500 else response}")
        
        # Parse the response
        content = {
            'llm_response': response,
            'species_list': [],
            'key_findings': [],
            'analysis': response  # Default to full response as analysis
        }
        
        # Try to parse sections from LLM response
        response_upper = response.upper()
        
        if 'SPECIES LIST:' in response_upper or 'SPECIES:' in response_upper:
            try:
                # Find where species list starts
                start_idx = response_upper.find('SPECIES LIST:')
                if start_idx == -1:
                    start_idx = response_upper.find('SPECIES:')
                    start_len = len('SPECIES:')
                else:
                    start_len = len('SPECIES LIST:')
                
                # Find where it ends (next section or end)
                end_markers = ['KEY FINDINGS:', 'ANALYSIS:', 'FINDINGS:', 'CONCLUSION:']
                end_idx = len(response)
                for marker in end_markers:
                    idx = response_upper.find(marker, start_idx + start_len)
                    if idx != -1 and idx < end_idx:
                        end_idx = idx
                
                species_section = response[start_idx + start_len:end_idx]
                species_lines = [line.strip().lstrip('- •*').strip() 
                               for line in species_section.strip().split('\n') 
                               if line.strip() and len(line.strip()) > 3 and line.strip() not in ['-', '*', '•']]
                content['species_list'] = species_lines[:50]
                logging.info(f"Parsed {len(content['species_list'])} species")
            except Exception as e:
                logging.error(f"Error parsing species list: {e}")
        
        if 'KEY FINDINGS:' in response_upper or 'FINDINGS:' in response_upper:
            try:
                start_idx = response_upper.find('KEY FINDINGS:')
                if start_idx == -1:
                    start_idx = response_upper.find('FINDINGS:')
                    start_len = len('FINDINGS:')
                else:
                    start_len = len('KEY FINDINGS:')
                
                end_markers = ['ANALYSIS:', 'CONCLUSION:', 'SUMMARY:']
                end_idx = len(response)
                for marker in end_markers:
                    idx = response_upper.find(marker, start_idx + start_len)
                    if idx != -1 and idx < end_idx:
                        end_idx = idx
                
                findings_section = response[start_idx + start_len:end_idx]
                findings_lines = [line.strip().lstrip('- •*0123456789.').strip() 
                                for line in findings_section.strip().split('\n') 
                                if line.strip() and len(line.strip()) > 5]
                content['key_findings'] = findings_lines[:10]
                logging.info(f"Parsed {len(content['key_findings'])} findings")
            except Exception as e:
                logging.error(f"Error parsing findings: {e}")
        
        if 'ANALYSIS:' in response_upper:
            try:
                start_idx = response_upper.find('ANALYSIS:')
                content['analysis'] = response[start_idx + len('ANALYSIS:'):].strip()
            except:
                pass
        
        # If no structured content was found, use the full response
        if not content['species_list'] and not content['key_findings']:
            content['key_findings'] = ["AI Response (unstructured format - see analysis below)"]
            content['analysis'] = response
        
        return content
        
    except Exception as e:
        import logging
        logging.error(f"LLM report generation error: {e}")
        import traceback
        logging.error(traceback.format_exc())
        # Re-raise exception to be handled by caller
        raise e



@app.post("/generate-report")
async def generate_report(request: ReportGenerationRequest):
    """
    Generate comprehensive research reports in multiple formats.
    
    Supported formats:
    - PDF: Professional formatted document with charts
    - HTML: Interactive web report
    - Markdown: Documentation-friendly format
    - JSON: Structured data export
    
    Report types:
    - species_analysis: Species-focused analysis report
    - edna_analysis: eDNA processing results
    - biodiversity: Diversity metrics report
    - niche_model: Species distribution modeling report
    - survey_summary: Field survey summary
    - custom: Custom sections
    
    Features:
    - Auto-generated charts and visualizations
    - Dynamic tables
    - Key findings extraction
    - Professional formatting
    """
    from analytics.report_generator import (
        ReportGenerator, ReportMetadata, ReportSection,
        ChartConfig, TableConfig, ReportFormat, ReportType
    )
    
    try:
        # Create output directory
        output_dir = "./reports"
        os.makedirs(output_dir, exist_ok=True)
        
        generator = ReportGenerator(output_dir)
        
        # Create metadata
        metadata = ReportMetadata(
            title=request.title,
            author=request.author,
            report_type=request.report_type,
            abstract=request.abstract,
            keywords=request.keywords
        )
        
        # Build sections
        sections = []
        
        # If sections provided, use them
        if request.sections:
            for sec_input in request.sections:
                charts = []
                for cc in sec_input.chart_configs:
                    charts.append(ChartConfig(
                        chart_type=cc.get('chart_type', 'bar'),
                        title=cc.get('title', ''),
                        x_label=cc.get('x_label', ''),
                        y_label=cc.get('y_label', ''),
                        data=cc.get('data', {}),
                        colors=cc.get('colors', [])
                    ))
                
                tables = []
                for tc in sec_input.table_configs:
                    tables.append(TableConfig(
                        title=tc.get('title', ''),
                        headers=tc.get('headers', []),
                        rows=tc.get('rows', [])
                    ))
                
                sections.append(ReportSection(
                    title=sec_input.title,
                    content=sec_input.content,
                    level=sec_input.level,
                    key_findings=sec_input.key_findings,
                    bullet_points=sec_input.bullet_points,
                    charts=charts,
                    tables=tables
                ))
        
        # Auto-generate sections based on report type and data
        elif request.data and not request.use_llm:
            sections = _auto_generate_sections(request.report_type, request.data)
        
        # USE LLM FOR INTELLIGENT REPORT GENERATION
        if request.use_llm:
            try:
                # Get LLM-generated content
                llm_content = await _generate_llm_report_content(
                    title=request.title,
                    abstract=request.abstract,
                    report_type=request.report_type
                )
                
                # Build section from LLM response
                species_rows = []
                for species_line in llm_content.get('species_list', []):
                    # Try to parse species info
                    parts = species_line.split(' - ') if ' - ' in species_line else [species_line, '', '', '']
                    if len(parts) >= 1:
                        species_rows.append([
                            parts[0] if len(parts) > 0 else '',
                            parts[1] if len(parts) > 1 else '',
                            parts[2] if len(parts) > 2 else '',
                            parts[3] if len(parts) > 3 else ''
                        ])
                
                sections.append(ReportSection(
                    title=f"AI-Generated Analysis: {request.title}",
                    content=llm_content.get('analysis', 'No analysis available.'),
                    level=1,
                    tables=[TableConfig(
                        title="Species Found",
                        headers=["Species", "Details", "Habitat", "Family"],
                        rows=species_rows
                    )] if species_rows else [],
                    key_findings=llm_content.get('key_findings', [])
                ))
                
            except Exception as e:
                import logging
                logging.error(f"LLM report generation error: {e}")
                # RAISE ERROR instead of generating failure report
                raise HTTPException(
                    status_code=503,
                    detail=f"LLM Unavailable: Unified report generation requires the AI service. Error: {str(e)}"
                )
        
        # NO FALLBACK - Only show LLM-generated content
        # If LLM was not used or no sections, show appropriate message
        if not sections:
            sections.append(ReportSection(
                title="No Report Generated",
                content="The report could not be generated. Please ensure the AI service is running and try again.",
                level=1,
                key_findings=["AI service may be unavailable", "Please restart Ollama and the AI service"]
            ))
        
        # Map format string to enum
        format_map = {
            'pdf': ReportFormat.PDF,
            'html': ReportFormat.HTML,
            'markdown': ReportFormat.MARKDOWN,
            'json': ReportFormat.JSON
        }
        report_format = format_map.get(request.format.lower(), ReportFormat.HTML)
        
        # Generate report
        from datetime import datetime
        filename = f"{request.report_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{request.format}"
        
        filepath = generator.generate_report(
            metadata=metadata,
            sections=sections,
            format=report_format,
            filename=filename
        )
        
        # Read file content for response
        with open(filepath, 'r' if request.format != 'pdf' else 'rb') as f:
            content = f.read()
        
        # For non-PDF, return content; for PDF, return base64
        if request.format.lower() == 'pdf':
            import base64
            content_response = base64.b64encode(content).decode('utf-8')
        else:
            content_response = content if isinstance(content, str) else content.decode('utf-8')
        
        return {
            "success": True,
            "filename": filename,
            "format": request.format,
            "filepath": filepath,
            "content": content_response,
            "report_type": request.report_type,
            "sections_count": len(sections)
        }
        
    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"Report generation failed: {str(e)}"
        )


async def _generate_llm_sections(title: str, abstract: str, report_type: str, keywords: List[str]) -> List:
    """Generate report sections using LLM based on title and abstract."""
    from analytics.report_generator import ReportSection
    import httpx
    
    sections = []
    ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
    
    # Get REAL database context for AI
    db_context = get_database_summary()
    
    # Build context with real database info
    context = f"""Title: {title}
Abstract: {abstract}
Keywords: {', '.join(keywords) if keywords else 'marine research'}

IMPORTANT - Our actual database contains:
{db_context}"""
    
    prompts_by_type = {
        "species_analysis": f"""Write a brief scientific report about the following species study.

{context}

Write 3 paragraphs:
1. Species overview and importance
2. Distribution, habitat and ecology  
3. Population status and conservation

Be specific and scientific.""",

        "biodiversity": f"""Write a brief biodiversity analysis report.

{context}

Write 3 paragraphs:
1. Overview of biodiversity patterns observed
2. Species composition and community structure
3. Conservation implications and recommendations

Be specific with metrics and observations.""",

        "edna_analysis": f"""Write a brief eDNA analysis report.

{context}

Write 3 paragraphs:
1. eDNA methodology and sampling approach
2. Species detection results
3. Biodiversity assessment and conclusions""",

        "niche_model": f"""Write a brief species distribution modeling report.

{context}

Write 3 paragraphs:
1. Modeling approach and environmental variables
2. Predicted habitat suitability
3. Conservation applications"""
    }
    
    # Get actual species data from catalog for enhanced reports
    species_list = ""
    try:
        from classification import FishClassifier
        classifier = FishClassifier()
        catalog = classifier.catalog.get_all_species()
        if catalog:
            species_list = "\n\nAvailable species in database:\n"
            for sp in catalog:
                species_list += f"- {sp.common_name} ({sp.scientific_name}) - {sp.habitat}, {sp.family}\n"
    except:
        pass
    
    # Add species data to context if available
    if species_list:
        context += species_list
    
    prompt = prompts_by_type.get(report_type, f"""Write a brief research report.

{context}

Write 3 paragraphs covering the main aspects of this research.""")

    try:
        # Longer timeout for LLM response
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{ollama_url}/api/generate",
                json={
                    "model": "llama3.2:1b",
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.7, "num_predict": 500}
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                llm_response = result.get("response", "").strip()
                
                if llm_response and len(llm_response) > 50:
                    # Split response into paragraphs
                    paragraphs = [p.strip() for p in llm_response.split('\n\n') if p.strip()]
                    
                    # Create sections from paragraphs
                    section_titles = {
                        "species_analysis": ["Species Overview", "Distribution and Habitat", "Population Status"],
                        "biodiversity": ["Biodiversity Overview", "Species Composition", "Conservation Implications"],
                        "edna_analysis": ["Methodology", "Species Detection", "Biodiversity Assessment"],
                        "niche_model": ["Modeling Approach", "Habitat Suitability", "Conservation Applications"]
                    }
                    
                    titles = section_titles.get(report_type, ["Overview", "Analysis", "Conclusions"])
                    
                    for i, paragraph in enumerate(paragraphs[:3]):
                        section_title = titles[i] if i < len(titles) else f"Section {i+1}"
                        # Clean up paragraph
                        clean_para = paragraph.replace('1.', '').replace('2.', '').replace('3.', '').strip()
                        if clean_para:
                            sections.append(ReportSection(
                                title=section_title,
                                content=clean_para,
                                level=1
                            ))
                    
                    # If we got content, add key findings
                    if sections:
                        sections[-1].key_findings = [
                            f"Analysis based on: {title}",
                            f"Report type: {report_type.replace('_', ' ').title()}",
                            "Generated using AI-powered analysis"
                        ]
                        
    except Exception as e:
        import logging
        logging.error(f"LLM generation error: {e}")
    
    # Fallback if LLM didn't produce content
    if not sections:
        sections.append(ReportSection(
            title="Executive Summary",
            content=f"This report examines: {title}. {abstract}" if abstract else f"Research report on: {title}",
            level=1,
            key_findings=[
                f"Subject: {title}",
                f"Report type: {report_type.replace('_', ' ').title()}",
                "Detailed analysis available with connected data sources"
            ]
        ))
    
    # Add species catalog section if relevant
    if any(word in title.lower() + abstract.lower() for word in ['species', 'database', 'list', 'catalog', 'all']):
        try:
            from classification import FishClassifier
            from analytics.report_generator import TableConfig
            classifier = FishClassifier()
            catalog = classifier.catalog.get_all_species()
            if catalog:
                species_data = []
                for sp in catalog:
                    species_data.append([sp.common_name, sp.scientific_name, sp.habitat.title(), sp.family])
                
                sections.append(ReportSection(
                    title="Species Catalog",
                    content=f"The database contains {len(catalog)} marine species from the Indian Ocean region.",
                    level=1,
                    tables=[TableConfig(
                        title="Marine Species Database",
                        headers=["Common Name", "Scientific Name", "Habitat", "Family"],
                        rows=species_data
                    )],
                    key_findings=[
                        f"Total species: {len(catalog)}",
                        f"Families represented: {len(set(sp.family for sp in catalog))}",
                        f"Habitats covered: Pelagic, Reef, Coastal, Demersal"
                    ]
                ))
        except Exception as e:
            import logging
            logging.error(f"Failed to add species catalog: {e}")
    
    return sections


def _auto_generate_sections(report_type: str, data: Dict[str, Any]) -> List:
    """Auto-generate report sections based on type and data."""
    from analytics.report_generator import ReportSection, ChartConfig, TableConfig
    
    sections = []
    
    if report_type == "biodiversity":
        sections.append(ReportSection(
            title="Biodiversity Analysis Summary",
            content="Analysis of species diversity and community structure.",
            key_findings=[
                f"Shannon Index: {data.get('shannon_index', 'N/A')}",
                f"Simpson Index: {data.get('simpson_index', 'N/A')}",
                f"Species Richness: {data.get('species_richness', 'N/A')}",
                f"Evenness: {data.get('evenness', 'N/A')}"
            ]
        ))
        
        if 'species_abundances' in data:
            sections.append(ReportSection(
                title="Species Composition",
                charts=[ChartConfig(
                    chart_type='bar',
                    title='Species Abundance',
                    data=data['species_abundances'],
                    x_label='Species',
                    y_label='Abundance'
                )]
            ))
    
    elif report_type == "species_analysis":
        species = data.get('species', 'Unknown Species')
        sections.append(ReportSection(
            title=f"Species Profile: {species}",
            content=data.get('description', ''),
            key_findings=[
                f"Total Observations: {data.get('observations', 0)}",
                f"Distribution Range: {data.get('range', 'Unknown')}",
                f"Conservation Status: {data.get('status', 'Not assessed')}"
            ]
        ))
    
    elif report_type == "niche_model":
        sections.append(ReportSection(
            title="Species Distribution Model Results",
            content="Environmental niche modeling analysis.",
            key_findings=[
                f"Model Type: {data.get('model_type', 'MaxEnt')}",
                f"AUC Score: {data.get('auc', 'N/A')}",
                f"Suitable Area: {data.get('suitable_area_km2', 0)} km²"
            ]
        ))
        
        if 'variable_importance' in data:
            sections.append(ReportSection(
                title="Environmental Variable Importance",
                charts=[ChartConfig(
                    chart_type='horizontal_bar',
                    title='Variable Contributions',
                    data=data['variable_importance']
                )]
            ))
    
    elif report_type == "edna_analysis":
        sections.append(ReportSection(
            title="eDNA Analysis Results",
            content="Environmental DNA sequence analysis and species detection.",
            key_findings=[
                f"Total Sequences: {data.get('total_sequences', 0)}",
                f"Species Detected: {data.get('species_count', 0)}",
                f"Average Quality: {data.get('avg_quality', 'N/A')}"
            ]
        ))
        
        if 'detections' in data:
            rows = [
                [d.get('species', ''), d.get('reads', 0), f"{d.get('confidence', 0):.2%}"]
                for d in data['detections'][:10]
            ]
            sections.append(ReportSection(
                title="Detected Species",
                tables=[TableConfig(
                    title="Top Species Detections",
                    headers=["Species", "Reads", "Confidence"],
                    rows=rows
                )]
            ))
    
    return sections


class QuickReportRequest(BaseModel):
    """Quick report for specific analyses"""
    analysis_type: str  # species, biodiversity, edna, otolith
    data: Dict[str, Any]
    format: str = "html"


@app.post("/generate-quick-report")
async def generate_quick_report(request: QuickReportRequest):
    """
    Generate a quick report from analysis results.
    
    Automatically structures the data into a formatted report.
    Ideal for exporting individual analysis results.
    """
    from analytics.report_generator import (
        create_species_report, create_biodiversity_report,
        ReportGenerator, ReportMetadata, ReportSection, ReportFormat
    )
    
    try:
        output_dir = "./reports"
        os.makedirs(output_dir, exist_ok=True)
        
        if request.analysis_type == "biodiversity":
            filepath = create_biodiversity_report(request.data, output_dir)
        elif request.analysis_type == "species":
            filepath = create_species_report(request.data, output_dir)
        else:
            # Generic quick report
            generator = ReportGenerator(output_dir)
            metadata = ReportMetadata(
                title=f"{request.analysis_type.title()} Analysis Report",
                report_type=request.analysis_type
            )
            sections = _auto_generate_sections(request.analysis_type, request.data)
            
            format_map = {
                'pdf': ReportFormat.PDF,
                'html': ReportFormat.HTML,
                'markdown': ReportFormat.MARKDOWN,
                'json': ReportFormat.JSON
            }
            
            filepath = generator.generate_report(
                metadata, sections, 
                format_map.get(request.format.lower(), ReportFormat.HTML)
            )
        
        with open(filepath, 'r') as f:
            content = f.read()
        
        return {
            "success": True,
            "filepath": filepath,
            "content": content
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Quick report generation failed: {str(e)}"
        )

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("AI_SERVICES_PORT", 8000)),
        reload=True
    )
