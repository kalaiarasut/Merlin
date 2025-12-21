"""
Classification module for Indian Ocean Fish Species
"""

from .fish_classifier import (
    FishClassifier,
    SpeciesCatalog,
    SpeciesInfo,
    ClassificationResult,
    get_classifier,
    classify_image,
    classify_image_bytes,
    get_species_catalog,
    add_species
)

from .species_trainer import (
    SpeciesTrainer,
    train_model,
    fine_tune_model,
    add_species_images,
    get_training_status
)

__all__ = [
    # Classifier
    'FishClassifier',
    'SpeciesCatalog', 
    'SpeciesInfo',
    'ClassificationResult',
    'get_classifier',
    'classify_image',
    'classify_image_bytes',
    'get_species_catalog',
    'add_species',
    
    # Trainer
    'SpeciesTrainer',
    'train_model',
    'fine_tune_model',
    'add_species_images',
    'get_training_status'
]
