"""
Species Model Trainer
Training and fine-tuning pipeline for the fish classification model
"""

import os
import json
import logging
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from PIL import Image
import numpy as np

from .fish_classifier import (
    HierarchicalClassifier, SpeciesCatalog, SpeciesInfo,
    MODELS_DIR, DATA_DIR, IMAGE_SIZE, NORMALIZE_MEAN, NORMALIZE_STD
)

logger = logging.getLogger(__name__)

# Training configuration
BATCH_SIZE = 16
LEARNING_RATE = 0.001
FINE_TUNE_LR = 0.0001
EPOCHS_FULL = 50
EPOCHS_FINE_TUNE = 20
MIN_IMAGES_PER_SPECIES = 30


# ============================================
# Dataset
# ============================================

class FishDataset(Dataset):
    """Dataset for fish images with hierarchical labels"""
    
    def __init__(self, 
                 data_dir: Path,
                 catalog: SpeciesCatalog,
                 transform=None,
                 augment: bool = True):
        self.data_dir = data_dir
        self.catalog = catalog
        self.augment = augment
        
        # Build class mappings
        self.habitat_classes = catalog.HABITATS
        self.family_classes = sorted(catalog.get_families())
        self.species_classes = sorted([s.scientific_name for s in catalog.get_all_species()])
        
        # Default transforms
        if transform is None:
            if augment:
                self.transform = transforms.Compose([
                    transforms.Resize((IMAGE_SIZE + 32, IMAGE_SIZE + 32)),
                    transforms.RandomCrop(IMAGE_SIZE),
                    transforms.RandomHorizontalFlip(),
                    transforms.RandomRotation(15),
                    transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
                    transforms.ToTensor(),
                    transforms.Normalize(mean=NORMALIZE_MEAN, std=NORMALIZE_STD)
                ])
            else:
                self.transform = transforms.Compose([
                    transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
                    transforms.ToTensor(),
                    transforms.Normalize(mean=NORMALIZE_MEAN, std=NORMALIZE_STD)
                ])
        else:
            self.transform = transform
        
        # Load samples
        self.samples = self._load_samples()
        logger.info(f"Loaded {len(self.samples)} training samples")
    
    def _load_samples(self) -> List[Tuple[Path, int, int, int]]:
        """Load all image samples with their labels"""
        samples = []
        
        for species in self.catalog.get_all_species():
            species_dir = self.data_dir / species.scientific_name.replace(" ", "_")
            
            if not species_dir.exists():
                continue
            
            # Get labels
            habitat_idx = self.habitat_classes.index(species.habitat) if species.habitat in self.habitat_classes else 0
            family_idx = self.family_classes.index(species.family) if species.family in self.family_classes else 0
            species_idx = self.species_classes.index(species.scientific_name)
            
            # Load all images
            for img_path in species_dir.glob("*.jpg"):
                samples.append((img_path, habitat_idx, family_idx, species_idx))
            for img_path in species_dir.glob("*.jpeg"):
                samples.append((img_path, habitat_idx, family_idx, species_idx))
            for img_path in species_dir.glob("*.png"):
                samples.append((img_path, habitat_idx, family_idx, species_idx))
        
        return samples
    
    def __len__(self) -> int:
        return len(self.samples)
    
    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int, int, int]:
        img_path, habitat_idx, family_idx, species_idx = self.samples[idx]
        
        image = Image.open(img_path).convert('RGB')
        tensor = self.transform(image)
        
        return tensor, habitat_idx, family_idx, species_idx


# ============================================
# Trainer
# ============================================

class SpeciesTrainer:
    """
    Trainer for the hierarchical fish classification model
    Supports full training and fine-tuning for new species
    """
    
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.catalog = SpeciesCatalog()
        self.model: Optional[HierarchicalClassifier] = None
        self.training_history: List[Dict] = []
        
        logger.info(f"Trainer initialized on device: {self.device}")
    
    def _create_model(self) -> HierarchicalClassifier:
        """Create a new model with current catalog classes"""
        habitat_classes = SpeciesCatalog.HABITATS
        family_classes = sorted(self.catalog.get_families())
        species_classes = sorted([s.scientific_name for s in self.catalog.get_all_species()])
        
        model = HierarchicalClassifier(
            num_habitats=len(habitat_classes),
            num_families=len(family_classes),
            num_species=len(species_classes)
        )
        return model.to(self.device)
    
    def train(self, 
              epochs: int = EPOCHS_FULL,
              learning_rate: float = LEARNING_RATE,
              batch_size: int = BATCH_SIZE,
              validation_split: float = 0.2) -> Dict:
        """
        Full training from scratch
        """
        logger.info("Starting full model training...")
        
        # Create dataset
        dataset = FishDataset(DATA_DIR, self.catalog, augment=True)
        
        if len(dataset) == 0:
            return {
                "success": False,
                "error": "No training data found. Please add images to training_data directory."
            }
        
        # Split into train/val
        val_size = int(len(dataset) * validation_split)
        train_size = len(dataset) - val_size
        train_dataset, val_dataset = torch.utils.data.random_split(dataset, [train_size, val_size])
        
        train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=0)
        val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
        
        # Create model
        self.model = self._create_model()
        
        # Loss and optimizer
        criterion = nn.CrossEntropyLoss()
        optimizer = optim.Adam(self.model.parameters(), lr=learning_rate)
        scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=10, gamma=0.5)
        
        best_accuracy = 0.0
        history = []
        
        for epoch in range(epochs):
            # Training phase
            self.model.train()
            train_loss = 0.0
            train_correct = 0
            train_total = 0
            
            for images, habitat_labels, family_labels, species_labels in train_loader:
                images = images.to(self.device)
                habitat_labels = habitat_labels.to(self.device)
                family_labels = family_labels.to(self.device)
                species_labels = species_labels.to(self.device)
                
                optimizer.zero_grad()
                
                habitat_logits, family_logits, species_logits = self.model(images)
                
                # Combined loss (weighted)
                loss = (
                    0.2 * criterion(habitat_logits, habitat_labels) +
                    0.3 * criterion(family_logits, family_labels) +
                    0.5 * criterion(species_logits, species_labels)
                )
                
                loss.backward()
                optimizer.step()
                
                train_loss += loss.item()
                _, predicted = species_logits.max(1)
                train_total += species_labels.size(0)
                train_correct += predicted.eq(species_labels).sum().item()
            
            # Validation phase
            self.model.eval()
            val_loss = 0.0
            val_correct = 0
            val_total = 0
            
            with torch.no_grad():
                for images, habitat_labels, family_labels, species_labels in val_loader:
                    images = images.to(self.device)
                    species_labels = species_labels.to(self.device)
                    
                    _, _, species_logits = self.model(images)
                    
                    loss = criterion(species_logits, species_labels)
                    val_loss += loss.item()
                    
                    _, predicted = species_logits.max(1)
                    val_total += species_labels.size(0)
                    val_correct += predicted.eq(species_labels).sum().item()
            
            train_acc = 100. * train_correct / train_total if train_total > 0 else 0
            val_acc = 100. * val_correct / val_total if val_total > 0 else 0
            
            epoch_result = {
                "epoch": epoch + 1,
                "train_loss": train_loss / len(train_loader),
                "train_accuracy": train_acc,
                "val_loss": val_loss / len(val_loader) if len(val_loader) > 0 else 0,
                "val_accuracy": val_acc
            }
            history.append(epoch_result)
            
            logger.info(f"Epoch {epoch+1}/{epochs}: Train Acc={train_acc:.1f}%, Val Acc={val_acc:.1f}%")
            
            # Save best model
            if val_acc > best_accuracy:
                best_accuracy = val_acc
                self._save_model()
            
            scheduler.step()
        
        self.training_history = history
        
        return {
            "success": True,
            "epochs": epochs,
            "final_train_accuracy": history[-1]["train_accuracy"],
            "final_val_accuracy": history[-1]["val_accuracy"],
            "best_accuracy": best_accuracy,
            "total_samples": len(dataset),
            "species_count": len(self.catalog.get_all_species())
        }
    
    def fine_tune(self, new_species_only: bool = True, epochs: int = EPOCHS_FINE_TUNE) -> Dict:
        """
        Fine-tune existing model with new species
        Faster than full training - only updates classification heads
        """
        logger.info("Starting model fine-tuning...")
        
        # Load existing model
        model_path = MODELS_DIR / "fish_classifier.pth"
        if not model_path.exists():
            logger.warning("No existing model found, running full training instead")
            return self.train()
        
        # Create new model with updated classes
        new_model = self._create_model()
        
        # Load old weights for backbone only
        old_checkpoint = torch.load(model_path, map_location=self.device)
        
        # Transfer backbone weights
        old_state = old_checkpoint['model_state_dict']
        new_state = new_model.state_dict()
        
        for name, param in old_state.items():
            if name.startswith('backbone') or name.startswith('shared'):
                if name in new_state and new_state[name].shape == param.shape:
                    new_state[name] = param
        
        new_model.load_state_dict(new_state, strict=False)
        self.model = new_model
        
        # Freeze backbone, only train classifiers
        for name, param in self.model.named_parameters():
            if 'backbone' in name:
                param.requires_grad = False
        
        # Create dataset and train
        dataset = FishDataset(DATA_DIR, self.catalog, augment=True)
        
        if len(dataset) == 0:
            return {
                "success": False,
                "error": "No training data found"
            }
        
        # Split
        val_size = int(len(dataset) * 0.2)
        train_size = len(dataset) - val_size
        train_dataset, val_dataset = torch.utils.data.random_split(dataset, [train_size, val_size])
        
        train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)
        val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)
        
        # Fine-tuning optimizer (lower LR)
        criterion = nn.CrossEntropyLoss()
        optimizer = optim.Adam(
            filter(lambda p: p.requires_grad, self.model.parameters()),
            lr=FINE_TUNE_LR
        )
        
        best_accuracy = 0.0
        
        for epoch in range(epochs):
            self.model.train()
            train_correct = 0
            train_total = 0
            
            for images, habitat_labels, family_labels, species_labels in train_loader:
                images = images.to(self.device)
                habitat_labels = habitat_labels.to(self.device)
                family_labels = family_labels.to(self.device)
                species_labels = species_labels.to(self.device)
                
                optimizer.zero_grad()
                
                habitat_logits, family_logits, species_logits = self.model(images)
                
                loss = (
                    0.2 * criterion(habitat_logits, habitat_labels) +
                    0.3 * criterion(family_logits, family_labels) +
                    0.5 * criterion(species_logits, species_labels)
                )
                
                loss.backward()
                optimizer.step()
                
                _, predicted = species_logits.max(1)
                train_total += species_labels.size(0)
                train_correct += predicted.eq(species_labels).sum().item()
            
            # Validation
            self.model.eval()
            val_correct = 0
            val_total = 0
            
            with torch.no_grad():
                for images, _, _, species_labels in val_loader:
                    images = images.to(self.device)
                    species_labels = species_labels.to(self.device)
                    
                    _, _, species_logits = self.model(images)
                    _, predicted = species_logits.max(1)
                    val_total += species_labels.size(0)
                    val_correct += predicted.eq(species_labels).sum().item()
            
            train_acc = 100. * train_correct / train_total if train_total > 0 else 0
            val_acc = 100. * val_correct / val_total if val_total > 0 else 0
            
            logger.info(f"Fine-tune Epoch {epoch+1}/{epochs}: Train={train_acc:.1f}%, Val={val_acc:.1f}%")
            
            if val_acc > best_accuracy:
                best_accuracy = val_acc
                self._save_model()
        
        return {
            "success": True,
            "mode": "fine_tune",
            "epochs": epochs,
            "best_accuracy": best_accuracy,
            "species_count": len(self.catalog.get_all_species())
        }
    
    def _save_model(self):
        """Save current model to disk"""
        if self.model is None:
            return
        
        model_path = MODELS_DIR / "fish_classifier.pth"
        
        # Backup existing model
        if model_path.exists():
            backup_path = MODELS_DIR / f"fish_classifier_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pth"
            shutil.copy(model_path, backup_path)
        
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'num_habitats': self.model.num_habitats,
            'num_families': self.model.num_families,
            'num_species': self.model.num_species,
            'timestamp': datetime.now().isoformat()
        }, model_path)
        
        logger.info(f"Model saved to {model_path}")
    
    def add_training_images(self, 
                           scientific_name: str, 
                           images: List[bytes]) -> Dict:
        """
        Add training images for a species
        """
        species = self.catalog.get_species(scientific_name)
        if not species:
            return {
                "success": False,
                "error": f"Species {scientific_name} not found in catalog"
            }
        
        # Create species directory
        species_dir = DATA_DIR / scientific_name.replace(" ", "_")
        species_dir.mkdir(exist_ok=True)
        
        # Save images
        saved_count = 0
        for i, img_bytes in enumerate(images):
            try:
                # Validate image
                from io import BytesIO
                img = Image.open(BytesIO(img_bytes))
                img = img.convert('RGB')
                
                # Save
                img_path = species_dir / f"img_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{i}.jpg"
                img.save(img_path, 'JPEG', quality=90)
                saved_count += 1
            except Exception as e:
                logger.error(f"Failed to save image {i}: {e}")
        
        # Update catalog
        total_images = len(list(species_dir.glob("*.jpg")))
        self.catalog.update_training_count(scientific_name, total_images)
        
        return {
            "success": True,
            "species": scientific_name,
            "images_added": saved_count,
            "total_images": total_images,
            "ready_for_training": total_images >= MIN_IMAGES_PER_SPECIES
        }
    
    def get_training_status(self) -> Dict:
        """Get current training data status"""
        status = {
            "species": [],
            "total_images": 0,
            "ready_species": 0,
            "pending_species": 0
        }
        
        for species in self.catalog.get_all_species():
            species_dir = DATA_DIR / species.scientific_name.replace(" ", "_")
            if species_dir.exists():
                image_count = len(list(species_dir.glob("*.jpg"))) + len(list(species_dir.glob("*.png")))
            else:
                image_count = 0
            
            is_ready = image_count >= MIN_IMAGES_PER_SPECIES
            
            status["species"].append({
                "scientific_name": species.scientific_name,
                "common_name": species.common_name,
                "image_count": image_count,
                "min_required": MIN_IMAGES_PER_SPECIES,
                "ready": is_ready
            })
            
            status["total_images"] += image_count
            if is_ready:
                status["ready_species"] += 1
            else:
                status["pending_species"] += 1
        
        return status


# ============================================
# Convenience Functions
# ============================================

def train_model() -> Dict:
    """Full model training"""
    trainer = SpeciesTrainer()
    return trainer.train()


def fine_tune_model() -> Dict:
    """Fine-tune with new species"""
    trainer = SpeciesTrainer()
    return trainer.fine_tune()


def add_species_images(scientific_name: str, images: List[bytes]) -> Dict:
    """Add training images for a species"""
    trainer = SpeciesTrainer()
    return trainer.add_training_images(scientific_name, images)


def get_training_status() -> Dict:
    """Get training data status"""
    trainer = SpeciesTrainer()
    return trainer.get_training_status()
