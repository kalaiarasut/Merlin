"""
Indian Ocean Fish Classification System
Hierarchical deep learning classifier: Habitat → Family → Species
With unknown species detection via confidence thresholding
"""

import os
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from datetime import datetime
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import transforms, models
from PIL import Image
import numpy as np

logger = logging.getLogger(__name__)

# ============================================
# Configuration
# ============================================

BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models"
DATA_DIR = BASE_DIR / "training_data"
CATALOG_FILE = BASE_DIR / "species_catalog.json"

# Ensure directories exist
MODELS_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

# Classification thresholds
UNKNOWN_THRESHOLD = 0.70  # Below this = unknown species
HIGH_CONFIDENCE_THRESHOLD = 0.85

# Image preprocessing
IMAGE_SIZE = 224
NORMALIZE_MEAN = [0.485, 0.456, 0.406]
NORMALIZE_STD = [0.229, 0.224, 0.225]

# ============================================
# Data Classes
# ============================================

@dataclass
class SpeciesInfo:
    """Species metadata for the catalog"""
    scientific_name: str
    common_name: str
    habitat: str  # pelagic, demersal, reef, coastal, deep_sea
    family: str
    training_images: int = 0
    added_date: str = ""
    last_trained: str = ""
    
    def __post_init__(self):
        if not self.added_date:
            self.added_date = datetime.now().isoformat()


@dataclass
class ClassificationResult:
    """Result from fish classification"""
    status: str  # "identified" or "unknown"
    habitat: Optional[str] = None
    habitat_confidence: float = 0.0
    family: Optional[str] = None
    family_confidence: float = 0.0
    species: Optional[str] = None
    species_confidence: float = 0.0
    scientific_name: Optional[str] = None
    common_name: Optional[str] = None
    overall_confidence: float = 0.0
    message: str = ""
    top_predictions: List[Dict] = None
    
    def to_dict(self) -> Dict:
        return asdict(self)


# ============================================
# Species Catalog
# ============================================

class SpeciesCatalog:
    """Manages the species database for classification"""
    
    # Initial major Indian Ocean species for training
    INITIAL_SPECIES = [
        # Tunas (Scombridae)
        SpeciesInfo("Thunnus albacares", "Yellowfin Tuna", "pelagic", "Scombridae"),
        SpeciesInfo("Katsuwonus pelamis", "Skipjack Tuna", "pelagic", "Scombridae"),
        SpeciesInfo("Thunnus obesus", "Bigeye Tuna", "pelagic", "Scombridae"),
        
        # Jacks (Carangidae)
        SpeciesInfo("Caranx ignobilis", "Giant Trevally", "reef", "Carangidae"),
        SpeciesInfo("Caranx sexfasciatus", "Bigeye Trevally", "reef", "Carangidae"),
        SpeciesInfo("Scomberoides lysan", "Double-spotted Queenfish", "coastal", "Carangidae"),
        
        # Snappers (Lutjanidae)
        SpeciesInfo("Lutjanus bohar", "Two-spot Red Snapper", "reef", "Lutjanidae"),
        SpeciesInfo("Lutjanus argentimaculatus", "Mangrove Red Snapper", "coastal", "Lutjanidae"),
        
        # Groupers (Serranidae)
        SpeciesInfo("Epinephelus coioides", "Orange-spotted Grouper", "reef", "Serranidae"),
        SpeciesInfo("Epinephelus malabaricus", "Malabar Grouper", "coastal", "Serranidae"),
        
        # Other major species
        SpeciesInfo("Coryphaena hippurus", "Mahi-mahi", "pelagic", "Coryphaenidae"),
        SpeciesInfo("Xiphias gladius", "Swordfish", "pelagic", "Xiphiidae"),
        SpeciesInfo("Istiophorus platypterus", "Indo-Pacific Sailfish", "pelagic", "Istiophoridae"),
        SpeciesInfo("Sphyraena barracuda", "Great Barracuda", "reef", "Sphyraenidae"),
        SpeciesInfo("Rachycentron canadum", "Cobia", "coastal", "Rachycentridae"),
    ]
    
    # Habitat categories
    HABITATS = ["pelagic", "demersal", "reef", "coastal", "deep_sea"]
    
    def __init__(self):
        self.catalog: Dict[str, SpeciesInfo] = {}
        self.load_catalog()
    
    def load_catalog(self):
        """Load catalog from file or initialize with defaults"""
        if CATALOG_FILE.exists():
            try:
                with open(CATALOG_FILE, 'r') as f:
                    data = json.load(f)
                    for name, info in data.items():
                        self.catalog[name] = SpeciesInfo(**info)
                logger.info(f"Loaded {len(self.catalog)} species from catalog")
            except Exception as e:
                logger.error(f"Failed to load catalog: {e}")
                self._init_default_catalog()
        else:
            self._init_default_catalog()
    
    def _init_default_catalog(self):
        """Initialize with default Indian Ocean species"""
        for species in self.INITIAL_SPECIES:
            self.catalog[species.scientific_name] = species
        self.save_catalog()
        logger.info(f"Initialized catalog with {len(self.catalog)} species")
    
    def save_catalog(self):
        """Save catalog to file"""
        try:
            data = {name: asdict(info) for name, info in self.catalog.items()}
            with open(CATALOG_FILE, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save catalog: {e}")
    
    def add_species(self, species: SpeciesInfo) -> bool:
        """Add a new species to the catalog"""
        if species.scientific_name in self.catalog:
            logger.warning(f"Species {species.scientific_name} already exists")
            return False
        
        self.catalog[species.scientific_name] = species
        self.save_catalog()
        logger.info(f"Added new species: {species.scientific_name}")
        return True
    
    def get_species(self, scientific_name: str) -> Optional[SpeciesInfo]:
        """Get species info by scientific name"""
        return self.catalog.get(scientific_name)
    
    def get_all_species(self) -> List[SpeciesInfo]:
        """Get all species in catalog"""
        return list(self.catalog.values())
    
    def get_families(self) -> List[str]:
        """Get unique family names"""
        return list(set(s.family for s in self.catalog.values()))
    
    def get_species_by_family(self, family: str) -> List[SpeciesInfo]:
        """Get all species in a family"""
        return [s for s in self.catalog.values() if s.family == family]
    
    def get_species_by_habitat(self, habitat: str) -> List[SpeciesInfo]:
        """Get all species in a habitat"""
        return [s for s in self.catalog.values() if s.habitat == habitat]
    
    def update_training_count(self, scientific_name: str, count: int):
        """Update training image count for a species"""
        if scientific_name in self.catalog:
            self.catalog[scientific_name].training_images = count
            self.catalog[scientific_name].last_trained = datetime.now().isoformat()
            self.save_catalog()


# ============================================
# Model Architecture
# ============================================

class HierarchicalClassifier(nn.Module):
    """
    Hierarchical fish classifier using EfficientNet backbone
    Classifies: Habitat → Family → Species
    """
    
    def __init__(self, num_habitats: int, num_families: int, num_species: int):
        super().__init__()
        
        # Use EfficientNet-B0 as backbone (efficient and accurate)
        self.backbone = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
        backbone_out = self.backbone.classifier[1].in_features
        self.backbone.classifier = nn.Identity()  # Remove original classifier
        
        # Shared feature extraction
        self.feature_dim = 512
        self.shared_fc = nn.Sequential(
            nn.Linear(backbone_out, self.feature_dim),
            nn.ReLU(),
            nn.Dropout(0.3)
        )
        
        # Hierarchical classifiers
        self.habitat_classifier = nn.Linear(self.feature_dim, num_habitats)
        self.family_classifier = nn.Linear(self.feature_dim + num_habitats, num_families)
        self.species_classifier = nn.Linear(self.feature_dim + num_families, num_species)
        
        self.num_habitats = num_habitats
        self.num_families = num_families
        self.num_species = num_species
    
    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        # Extract features
        features = self.backbone(x)
        shared = self.shared_fc(features)
        
        # Hierarchical prediction
        habitat_logits = self.habitat_classifier(shared)
        habitat_probs = F.softmax(habitat_logits, dim=1)
        
        family_input = torch.cat([shared, habitat_probs], dim=1)
        family_logits = self.family_classifier(family_input)
        family_probs = F.softmax(family_logits, dim=1)
        
        species_input = torch.cat([shared, family_probs], dim=1)
        species_logits = self.species_classifier(species_input)
        
        return habitat_logits, family_logits, species_logits


# ============================================
# Fish Classifier Service
# ============================================

class FishClassifier:
    """
    Main fish classification service
    Handles image preprocessing, inference, and unknown detection
    """
    
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.catalog = SpeciesCatalog()
        self.model: Optional[HierarchicalClassifier] = None
        self.is_loaded = False
        
        # Class mappings
        self.habitat_classes: List[str] = []
        self.family_classes: List[str] = []
        self.species_classes: List[str] = []
        
        # Image transforms
        self.transform = transforms.Compose([
            transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(mean=NORMALIZE_MEAN, std=NORMALIZE_STD)
        ])
        
        self._init_classes()
        
        # Auto-load model if available
        model_path = MODELS_DIR / "fish_classifier.pth"
        if model_path.exists():
            self.load_model(model_path)
            logger.info(f"Auto-loaded trained model from {model_path}")
    
    def _init_classes(self):
        """Initialize class mappings from catalog"""
        self.habitat_classes = SpeciesCatalog.HABITATS
        self.family_classes = sorted(self.catalog.get_families())
        self.species_classes = sorted([s.scientific_name for s in self.catalog.get_all_species()])
        
        logger.info(f"Classes: {len(self.habitat_classes)} habitats, "
                   f"{len(self.family_classes)} families, "
                   f"{len(self.species_classes)} species")
    
    def load_model(self, model_path: Optional[Path] = None):
        """Load trained model"""
        if model_path is None:
            model_path = MODELS_DIR / "fish_classifier.pth"
        
        try:
            self._init_classes()  # Refresh classes
            
            self.model = HierarchicalClassifier(
                num_habitats=len(self.habitat_classes),
                num_families=len(self.family_classes),
                num_species=len(self.species_classes)
            )
            
            if model_path.exists():
                checkpoint = torch.load(model_path, map_location=self.device)
                self.model.load_state_dict(checkpoint['model_state_dict'])
                logger.info(f"Loaded model from {model_path}")
            else:
                logger.warning("No trained model found, using untrained model")
            
            self.model.to(self.device)
            self.model.eval()
            self.is_loaded = True
            
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            self.is_loaded = False
    
    def preprocess_image(self, image_path: str) -> torch.Tensor:
        """Preprocess image for classification"""
        image = Image.open(image_path).convert('RGB')
        tensor = self.transform(image)
        return tensor.unsqueeze(0).to(self.device)
    
    def preprocess_image_bytes(self, image_bytes: bytes) -> torch.Tensor:
        """Preprocess image from bytes"""
        from io import BytesIO
        image = Image.open(BytesIO(image_bytes)).convert('RGB')
        tensor = self.transform(image)
        return tensor.unsqueeze(0).to(self.device)
    
    def classify(self, image_input) -> ClassificationResult:
        """
        Classify a fish image
        Returns hierarchical classification with unknown detection
        """
        if not self.is_loaded:
            self.load_model()
        
        if not self.is_loaded or self.model is None:
            return ClassificationResult(
                status="error",
                message="Model not loaded. Please train the model first."
            )
        
        try:
            # Preprocess
            if isinstance(image_input, str):
                tensor = self.preprocess_image(image_input)
            elif isinstance(image_input, bytes):
                tensor = self.preprocess_image_bytes(image_input)
            else:
                tensor = image_input
            
            # Inference
            with torch.no_grad():
                habitat_logits, family_logits, species_logits = self.model(tensor)
                
                habitat_probs = F.softmax(habitat_logits, dim=1)
                family_probs = F.softmax(family_logits, dim=1)
                species_probs = F.softmax(species_logits, dim=1)
            
            # Get predictions
            habitat_conf, habitat_idx = habitat_probs.max(dim=1)
            family_conf, family_idx = family_probs.max(dim=1)
            species_conf, species_idx = species_probs.max(dim=1)
            
            habitat = self.habitat_classes[habitat_idx.item()]
            family = self.family_classes[family_idx.item()] if self.family_classes else None
            species_name = self.species_classes[species_idx.item()] if self.species_classes else None
            
            habitat_confidence = habitat_conf.item()
            family_confidence = family_conf.item()
            species_confidence = species_conf.item()
            
            # Calculate overall confidence
            overall_confidence = species_confidence
            
            # Get species info
            species_info = self.catalog.get_species(species_name) if species_name else None
            
            # Top predictions
            top_k = min(5, len(self.species_classes))
            top_probs, top_indices = species_probs.topk(top_k, dim=1)
            top_predictions = [
                {
                    "species": self.species_classes[idx.item()],
                    "confidence": prob.item()
                }
                for prob, idx in zip(top_probs[0], top_indices[0])
            ]
            
            # Unknown detection
            if overall_confidence < UNKNOWN_THRESHOLD:
                return ClassificationResult(
                    status="unknown",
                    habitat=habitat if habitat_confidence > 0.5 else None,
                    habitat_confidence=habitat_confidence,
                    family=family if family_confidence > 0.5 else None,
                    family_confidence=family_confidence,
                    species=None,
                    species_confidence=species_confidence,
                    overall_confidence=overall_confidence,
                    message=f"Species not recognized with sufficient confidence ({overall_confidence:.1%}). Flagged for review.",
                    top_predictions=top_predictions
                )
            
            return ClassificationResult(
                status="identified",
                habitat=habitat,
                habitat_confidence=habitat_confidence,
                family=family,
                family_confidence=family_confidence,
                species=species_name,
                species_confidence=species_confidence,
                scientific_name=species_info.scientific_name if species_info else species_name,
                common_name=species_info.common_name if species_info else None,
                overall_confidence=overall_confidence,
                message="Species identified successfully",
                top_predictions=top_predictions
            )
            
        except Exception as e:
            logger.error(f"Classification failed: {e}")
            return ClassificationResult(
                status="error",
                message=f"Classification failed: {str(e)}"
            )
    
    def get_catalog_summary(self) -> Dict[str, Any]:
        """Get summary of species catalog"""
        species_list = self.catalog.get_all_species()
        
        # Group by habitat
        by_habitat = {}
        for habitat in self.catalog.HABITATS:
            by_habitat[habitat] = len(self.catalog.get_species_by_habitat(habitat))
        
        # Group by family
        by_family = {}
        for family in self.catalog.get_families():
            by_family[family] = len(self.catalog.get_species_by_family(family))
        
        return {
            "total_species": len(species_list),
            "total_families": len(self.catalog.get_families()),
            "habitats": by_habitat,
            "families": by_family,
            "species": [
                {
                    "scientific_name": s.scientific_name,
                    "common_name": s.common_name,
                    "habitat": s.habitat,
                    "family": s.family,
                    "training_images": s.training_images
                }
                for s in species_list
            ],
            "model_loaded": self.is_loaded
        }


# ============================================
# Global Instance
# ============================================

_classifier_instance: Optional[FishClassifier] = None

def get_classifier() -> FishClassifier:
    """Get or create the global classifier instance"""
    global _classifier_instance
    if _classifier_instance is None:
        _classifier_instance = FishClassifier()
    return _classifier_instance


# ============================================
# Convenience Functions
# ============================================

def classify_image(image_path: str) -> Dict:
    """Classify a fish image - convenience function"""
    classifier = get_classifier()
    result = classifier.classify(image_path)
    return result.to_dict()


def classify_image_bytes(image_bytes: bytes) -> Dict:
    """Classify fish from image bytes - convenience function"""
    classifier = get_classifier()
    result = classifier.classify(image_bytes)
    return result.to_dict()


def get_species_catalog() -> Dict:
    """Get species catalog summary - convenience function"""
    classifier = get_classifier()
    return classifier.get_catalog_summary()


def add_species(scientific_name: str, common_name: str, habitat: str, family: str) -> bool:
    """Add a new species to the catalog"""
    classifier = get_classifier()
    species = SpeciesInfo(
        scientific_name=scientific_name,
        common_name=common_name,
        habitat=habitat,
        family=family
    )
    return classifier.catalog.add_species(species)
