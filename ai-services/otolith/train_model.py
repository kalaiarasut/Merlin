"""
Otolith Age Estimation - Deep Learning Model Training Pipeline

This script trains a CNN model for otolith age estimation using transfer learning.

STEP 1: Prepare your dataset
=============================
Organize your labeled otolith images in this structure:

    data/
    └── otoliths/
        ├── train/
        │   ├── age_01/
        │   │   ├── image001.jpg
        │   │   ├── image002.jpg
        │   │   └── ...
        │   ├── age_02/
        │   ├── age_03/
        │   └── ... (folders for each age class)
        ├── val/
        │   ├── age_01/
        │   ├── age_02/
        │   └── ...
        └── test/
            ├── age_01/
            ├── age_02/
            └── ...

Alternatively, use a CSV file with columns: image_path, age

STEP 2: Install requirements
============================
pip install torch torchvision pillow pandas scikit-learn matplotlib tensorboard albumentations

STEP 3: Run training
====================
python train_model.py --data_dir ./data/otoliths --epochs 50 --batch_size 32

"""

import os
import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Tuple, Dict, List, Optional

import numpy as np
import pandas as pd
from PIL import Image
import matplotlib.pyplot as plt

# Deep Learning imports
try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import Dataset, DataLoader
    from torchvision import transforms, models
    from torch.utils.tensorboard import SummaryWriter
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    print("PyTorch not installed. Run: pip install torch torchvision")

# Augmentation imports
try:
    import albumentations as A
    from albumentations.pytorch import ToTensorV2
    ALBUMENTATIONS_AVAILABLE = True
except ImportError:
    ALBUMENTATIONS_AVAILABLE = False
    print("Albumentations not installed. Run: pip install albumentations")

from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# =============================================================================
# CONFIGURATION
# =============================================================================

class Config:
    """Training configuration"""
    # Model
    model_name: str = "efficientnet_b0"  # Options: resnet50, efficientnet_b0, efficientnet_b2, vit_b_16
    pretrained: bool = True
    
    # Training
    epochs: int = 50
    batch_size: int = 32
    learning_rate: float = 1e-4
    weight_decay: float = 1e-5
    
    # Data
    image_size: int = 224
    num_workers: int = 4
    
    # Task type: 'classification' or 'regression'
    # Classification: predicts age as discrete classes (1, 2, 3, ... years)
    # Regression: predicts age as continuous value
    task_type: str = "regression"
    
    # For classification only
    num_classes: int = 30  # Max age in years
    
    # Paths
    data_dir: str = "./data/otoliths"
    output_dir: str = "./models"
    
    # Device
    device: str = "cuda" if torch.cuda.is_available() else "cpu"


# =============================================================================
# DATASET
# =============================================================================

class OtolithDataset(Dataset):
    """
    Dataset for otolith images with age labels.
    
    Supports two formats:
    1. Folder structure: data/train/age_XX/image.jpg
    2. CSV file: image_path, age
    """
    
    def __init__(
        self, 
        data_dir: str, 
        split: str = "train",
        csv_file: Optional[str] = None,
        transform=None,
        task_type: str = "regression"
    ):
        self.data_dir = Path(data_dir)
        self.split = split
        self.transform = transform
        self.task_type = task_type
        self.samples: List[Tuple[str, int]] = []
        
        if csv_file and os.path.exists(csv_file):
            self._load_from_csv(csv_file)
        else:
            self._load_from_folders()
        
        print(f"Loaded {len(self.samples)} samples for {split}")
    
    def _load_from_folders(self):
        """Load from folder structure: split/age_XX/image.jpg"""
        split_dir = self.data_dir / self.split
        
        if not split_dir.exists():
            raise ValueError(f"Directory not found: {split_dir}")
        
        for age_folder in sorted(split_dir.iterdir()):
            if age_folder.is_dir() and age_folder.name.startswith("age_"):
                try:
                    age = int(age_folder.name.split("_")[1])
                except ValueError:
                    continue
                
                for img_file in age_folder.glob("*"):
                    if img_file.suffix.lower() in [".jpg", ".jpeg", ".png", ".tiff", ".bmp"]:
                        self.samples.append((str(img_file), age))
    
    def _load_from_csv(self, csv_file: str):
        """Load from CSV file with columns: image_path, age"""
        df = pd.read_csv(csv_file)
        
        # Filter by split if there's a 'split' column
        if 'split' in df.columns:
            df = df[df['split'] == self.split]
        
        for _, row in df.iterrows():
            img_path = row['image_path']
            age = int(row['age'])
            
            # Handle relative paths
            if not os.path.isabs(img_path):
                img_path = str(self.data_dir / img_path)
            
            if os.path.exists(img_path):
                self.samples.append((img_path, age))
    
    def __len__(self) -> int:
        return len(self.samples)
    
    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        img_path, age = self.samples[idx]
        
        # Load image
        image = Image.open(img_path).convert("RGB")
        image = np.array(image)
        
        # Apply transforms
        if self.transform:
            if ALBUMENTATIONS_AVAILABLE and isinstance(self.transform, A.Compose):
                augmented = self.transform(image=image)
                image = augmented["image"]
            else:
                image = self.transform(image)
        
        # Prepare label
        if self.task_type == "classification":
            label = torch.tensor(age - 1, dtype=torch.long)  # 0-indexed
        else:
            label = torch.tensor(age, dtype=torch.float32)
        
        return image, label


# =============================================================================
# DATA AUGMENTATION
# =============================================================================

def get_transforms(config: Config, split: str = "train"):
    """Get data augmentation transforms"""
    
    if ALBUMENTATIONS_AVAILABLE:
        if split == "train":
            return A.Compose([
                A.Resize(config.image_size, config.image_size),
                A.HorizontalFlip(p=0.5),
                A.VerticalFlip(p=0.5),
                A.RandomRotate90(p=0.5),
                A.ShiftScaleRotate(
                    shift_limit=0.1, 
                    scale_limit=0.2, 
                    rotate_limit=45, 
                    p=0.5
                ),
                A.OneOf([
                    A.GaussNoise(p=1),
                    A.GaussianBlur(p=1),
                ], p=0.3),
                A.OneOf([
                    A.RandomBrightnessContrast(p=1),
                    A.CLAHE(clip_limit=4.0, p=1),
                ], p=0.5),
                A.Normalize(
                    mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225]
                ),
                ToTensorV2()
            ])
        else:
            return A.Compose([
                A.Resize(config.image_size, config.image_size),
                A.Normalize(
                    mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225]
                ),
                ToTensorV2()
            ])
    else:
        # Fallback to torchvision transforms
        if split == "train":
            return transforms.Compose([
                transforms.ToPILImage(),
                transforms.Resize((config.image_size, config.image_size)),
                transforms.RandomHorizontalFlip(),
                transforms.RandomVerticalFlip(),
                transforms.RandomRotation(45),
                transforms.ColorJitter(brightness=0.2, contrast=0.2),
                transforms.ToTensor(),
                transforms.Normalize(
                    mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225]
                )
            ])
        else:
            return transforms.Compose([
                transforms.ToPILImage(),
                transforms.Resize((config.image_size, config.image_size)),
                transforms.ToTensor(),
                transforms.Normalize(
                    mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225]
                )
            ])


# =============================================================================
# MODEL
# =============================================================================

class OtolithAgeModel(nn.Module):
    """
    CNN model for otolith age estimation using transfer learning.
    
    Supports:
    - ResNet50
    - EfficientNet-B0/B2
    - Vision Transformer (ViT)
    """
    
    def __init__(
        self, 
        model_name: str = "efficientnet_b0",
        pretrained: bool = True,
        task_type: str = "regression",
        num_classes: int = 30
    ):
        super().__init__()
        
        self.task_type = task_type
        self.model_name = model_name
        
        # Output size
        if task_type == "classification":
            output_size = num_classes
        else:
            output_size = 1  # Single continuous value
        
        # Load pretrained backbone
        if model_name == "resnet50":
            weights = models.ResNet50_Weights.IMAGENET1K_V2 if pretrained else None
            self.backbone = models.resnet50(weights=weights)
            in_features = self.backbone.fc.in_features
            self.backbone.fc = nn.Sequential(
                nn.Dropout(0.3),
                nn.Linear(in_features, 512),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.Linear(512, output_size)
            )
        
        elif model_name == "efficientnet_b0":
            weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
            self.backbone = models.efficientnet_b0(weights=weights)
            in_features = self.backbone.classifier[1].in_features
            self.backbone.classifier = nn.Sequential(
                nn.Dropout(0.3),
                nn.Linear(in_features, 512),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.Linear(512, output_size)
            )
        
        elif model_name == "efficientnet_b2":
            weights = models.EfficientNet_B2_Weights.IMAGENET1K_V1 if pretrained else None
            self.backbone = models.efficientnet_b2(weights=weights)
            in_features = self.backbone.classifier[1].in_features
            self.backbone.classifier = nn.Sequential(
                nn.Dropout(0.3),
                nn.Linear(in_features, 512),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.Linear(512, output_size)
            )
        
        elif model_name == "vit_b_16":
            weights = models.ViT_B_16_Weights.IMAGENET1K_V1 if pretrained else None
            self.backbone = models.vit_b_16(weights=weights)
            in_features = self.backbone.heads.head.in_features
            self.backbone.heads.head = nn.Sequential(
                nn.Dropout(0.3),
                nn.Linear(in_features, 512),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.Linear(512, output_size)
            )
        
        else:
            raise ValueError(f"Unknown model: {model_name}")
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.backbone(x)
    
    def predict_age(self, x: torch.Tensor) -> Tuple[int, float]:
        """Predict age with confidence"""
        self.eval()
        with torch.no_grad():
            output = self.forward(x)
            
            if self.task_type == "classification":
                probs = torch.softmax(output, dim=1)
                confidence, predicted = torch.max(probs, 1)
                age = predicted.item() + 1  # 1-indexed
                conf = confidence.item()
            else:
                age = max(1, round(output.item()))
                # Estimate confidence based on how close to integer
                conf = 1.0 - min(abs(output.item() - age), 0.5) * 2
        
        return age, conf


# =============================================================================
# TRAINING
# =============================================================================

class Trainer:
    """Model trainer with logging and checkpointing"""
    
    def __init__(self, config: Config):
        self.config = config
        self.device = torch.device(config.device)
        
        # Create output directory
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.run_dir = Path(config.output_dir) / f"run_{timestamp}"
        self.run_dir.mkdir(parents=True, exist_ok=True)
        
        # Save config
        with open(self.run_dir / "config.json", "w") as f:
            json.dump(vars(config), f, indent=2)
        
        # Initialize model
        self.model = OtolithAgeModel(
            model_name=config.model_name,
            pretrained=config.pretrained,
            task_type=config.task_type,
            num_classes=config.num_classes
        ).to(self.device)
        
        # Loss function
        if config.task_type == "classification":
            self.criterion = nn.CrossEntropyLoss()
        else:
            self.criterion = nn.MSELoss()
        
        # Optimizer with differential learning rates
        # Lower LR for pretrained backbone, higher for new classifier
        backbone_params = []
        classifier_params = []
        
        for name, param in self.model.named_parameters():
            if "fc" in name or "classifier" in name or "heads" in name:
                classifier_params.append(param)
            else:
                backbone_params.append(param)
        
        self.optimizer = optim.AdamW([
            {"params": backbone_params, "lr": config.learning_rate * 0.1},
            {"params": classifier_params, "lr": config.learning_rate}
        ], weight_decay=config.weight_decay)
        
        # Learning rate scheduler
        self.scheduler = optim.lr_scheduler.CosineAnnealingWarmRestarts(
            self.optimizer, T_0=10, T_mult=2
        )
        
        # Tensorboard
        self.writer = SummaryWriter(self.run_dir / "logs")
        
        # Best model tracking
        self.best_val_loss = float("inf")
        self.best_epoch = 0
    
    def train_epoch(self, dataloader: DataLoader, epoch: int) -> Dict[str, float]:
        """Train for one epoch"""
        self.model.train()
        
        total_loss = 0
        all_preds = []
        all_labels = []
        
        for batch_idx, (images, labels) in enumerate(dataloader):
            images = images.to(self.device)
            labels = labels.to(self.device)
            
            # Forward pass
            self.optimizer.zero_grad()
            outputs = self.model(images)
            
            if self.config.task_type == "regression":
                outputs = outputs.squeeze()
            
            loss = self.criterion(outputs, labels)
            
            # Backward pass
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            self.optimizer.step()
            
            total_loss += loss.item()
            
            # Store predictions
            if self.config.task_type == "classification":
                preds = torch.argmax(outputs, dim=1).cpu().numpy() + 1
            else:
                preds = outputs.detach().cpu().numpy()
            
            all_preds.extend(preds)
            all_labels.extend(labels.cpu().numpy())
            
            # Log progress
            if batch_idx % 10 == 0:
                print(f"  Batch {batch_idx}/{len(dataloader)}, Loss: {loss.item():.4f}")
        
        # Calculate metrics
        all_preds = np.array(all_preds)
        all_labels = np.array(all_labels)
        
        if self.config.task_type == "classification":
            all_labels = all_labels + 1  # Convert back to 1-indexed
        
        mae = mean_absolute_error(all_labels, all_preds)
        rmse = np.sqrt(mean_squared_error(all_labels, all_preds))
        
        return {
            "loss": total_loss / len(dataloader),
            "mae": mae,
            "rmse": rmse
        }
    
    @torch.no_grad()
    def validate(self, dataloader: DataLoader) -> Dict[str, float]:
        """Validate the model"""
        self.model.eval()
        
        total_loss = 0
        all_preds = []
        all_labels = []
        
        for images, labels in dataloader:
            images = images.to(self.device)
            labels = labels.to(self.device)
            
            outputs = self.model(images)
            
            if self.config.task_type == "regression":
                outputs = outputs.squeeze()
            
            loss = self.criterion(outputs, labels)
            total_loss += loss.item()
            
            if self.config.task_type == "classification":
                preds = torch.argmax(outputs, dim=1).cpu().numpy() + 1
            else:
                preds = outputs.cpu().numpy()
            
            all_preds.extend(preds)
            all_labels.extend(labels.cpu().numpy())
        
        all_preds = np.array(all_preds)
        all_labels = np.array(all_labels)
        
        if self.config.task_type == "classification":
            all_labels = all_labels + 1
        
        mae = mean_absolute_error(all_labels, all_preds)
        rmse = np.sqrt(mean_squared_error(all_labels, all_preds))
        r2 = r2_score(all_labels, all_preds)
        
        return {
            "loss": total_loss / len(dataloader),
            "mae": mae,
            "rmse": rmse,
            "r2": r2
        }
    
    def save_checkpoint(self, epoch: int, metrics: Dict[str, float], is_best: bool = False):
        """Save model checkpoint"""
        checkpoint = {
            "epoch": epoch,
            "model_state_dict": self.model.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
            "scheduler_state_dict": self.scheduler.state_dict(),
            "metrics": metrics,
            "config": vars(self.config)
        }
        
        # Save latest
        torch.save(checkpoint, self.run_dir / "checkpoint_latest.pt")
        
        # Save best
        if is_best:
            torch.save(checkpoint, self.run_dir / "checkpoint_best.pt")
            print(f"  ✓ New best model saved! (MAE: {metrics['mae']:.2f})")
    
    def train(self, train_loader: DataLoader, val_loader: DataLoader):
        """Full training loop"""
        print(f"\n{'='*60}")
        print(f"Starting training on {self.device}")
        print(f"Model: {self.config.model_name}")
        print(f"Task: {self.config.task_type}")
        print(f"Epochs: {self.config.epochs}")
        print(f"{'='*60}\n")
        
        for epoch in range(1, self.config.epochs + 1):
            print(f"\nEpoch {epoch}/{self.config.epochs}")
            print("-" * 40)
            
            # Train
            train_metrics = self.train_epoch(train_loader, epoch)
            print(f"  Train - Loss: {train_metrics['loss']:.4f}, MAE: {train_metrics['mae']:.2f}")
            
            # Validate
            val_metrics = self.validate(val_loader)
            print(f"  Val   - Loss: {val_metrics['loss']:.4f}, MAE: {val_metrics['mae']:.2f}, R²: {val_metrics['r2']:.3f}")
            
            # Update scheduler
            self.scheduler.step()
            
            # Log to tensorboard
            self.writer.add_scalars("Loss", {
                "train": train_metrics["loss"],
                "val": val_metrics["loss"]
            }, epoch)
            self.writer.add_scalars("MAE", {
                "train": train_metrics["mae"],
                "val": val_metrics["mae"]
            }, epoch)
            self.writer.add_scalar("R2/val", val_metrics["r2"], epoch)
            self.writer.add_scalar("LR", self.optimizer.param_groups[0]["lr"], epoch)
            
            # Save checkpoint
            is_best = val_metrics["mae"] < self.best_val_loss
            if is_best:
                self.best_val_loss = val_metrics["mae"]
                self.best_epoch = epoch
            
            self.save_checkpoint(epoch, val_metrics, is_best)
        
        print(f"\n{'='*60}")
        print(f"Training complete!")
        print(f"Best model: Epoch {self.best_epoch}, MAE: {self.best_val_loss:.2f}")
        print(f"Model saved to: {self.run_dir}")
        print(f"{'='*60}\n")
        
        self.writer.close()
        
        return self.run_dir / "checkpoint_best.pt"


# =============================================================================
# INFERENCE
# =============================================================================

def load_model(checkpoint_path: str, device: str = "cuda") -> OtolithAgeModel:
    """Load a trained model from checkpoint"""
    checkpoint = torch.load(checkpoint_path, map_location=device)
    config = checkpoint["config"]
    
    model = OtolithAgeModel(
        model_name=config["model_name"],
        pretrained=False,
        task_type=config["task_type"],
        num_classes=config.get("num_classes", 30)
    )
    
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()
    
    return model


def predict_single_image(
    model: OtolithAgeModel, 
    image_path: str, 
    config: Config
) -> Tuple[int, float]:
    """Predict age for a single image"""
    device = next(model.parameters()).device
    
    # Load and preprocess image
    image = Image.open(image_path).convert("RGB")
    image = np.array(image)
    
    transform = get_transforms(config, split="val")
    
    if ALBUMENTATIONS_AVAILABLE:
        image = transform(image=image)["image"]
    else:
        image = transform(image)
    
    image = image.unsqueeze(0).to(device)
    
    return model.predict_age(image)


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Train Otolith Age Estimation Model")
    
    # Data arguments
    parser.add_argument("--data_dir", type=str, default="./data/otoliths",
                        help="Path to data directory")
    parser.add_argument("--csv_file", type=str, default=None,
                        help="Optional CSV file with image_path,age columns")
    
    # Model arguments
    parser.add_argument("--model", type=str, default="efficientnet_b0",
                        choices=["resnet50", "efficientnet_b0", "efficientnet_b2", "vit_b_16"],
                        help="Model architecture")
    parser.add_argument("--task", type=str, default="regression",
                        choices=["regression", "classification"],
                        help="Task type")
    
    # Training arguments
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch_size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--image_size", type=int, default=224)
    
    # Output
    parser.add_argument("--output_dir", type=str, default="./models")
    
    args = parser.parse_args()
    
    if not TORCH_AVAILABLE:
        print("ERROR: PyTorch is required. Install with:")
        print("  pip install torch torchvision")
        return
    
    # Create config
    config = Config()
    config.data_dir = args.data_dir
    config.model_name = args.model
    config.task_type = args.task
    config.epochs = args.epochs
    config.batch_size = args.batch_size
    config.learning_rate = args.lr
    config.image_size = args.image_size
    config.output_dir = args.output_dir
    
    # Create datasets
    print("Loading datasets...")
    train_dataset = OtolithDataset(
        config.data_dir, 
        split="train",
        csv_file=args.csv_file,
        transform=get_transforms(config, "train"),
        task_type=config.task_type
    )
    
    val_dataset = OtolithDataset(
        config.data_dir,
        split="val",
        csv_file=args.csv_file,
        transform=get_transforms(config, "val"),
        task_type=config.task_type
    )
    
    # Create dataloaders
    train_loader = DataLoader(
        train_dataset,
        batch_size=config.batch_size,
        shuffle=True,
        num_workers=config.num_workers,
        pin_memory=True
    )
    
    val_loader = DataLoader(
        val_dataset,
        batch_size=config.batch_size,
        shuffle=False,
        num_workers=config.num_workers,
        pin_memory=True
    )
    
    # Train
    trainer = Trainer(config)
    best_model_path = trainer.train(train_loader, val_loader)
    
    print(f"\nTo use the trained model:")
    print(f"  from train_model import load_model, predict_single_image")
    print(f"  model = load_model('{best_model_path}')")
    print(f"  age, confidence = predict_single_image(model, 'path/to/image.jpg')")


if __name__ == "__main__":
    main()
