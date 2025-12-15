"""
Fish Species Classification Module

Uses transfer learning with pre-trained CNNs (ResNet, EfficientNet) 
fine-tuned on marine fish species dataset.
"""

import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import numpy as np
from typing import List, Tuple

class FishClassifier:
    def __init__(self, model_path: str = None, device: str = 'cpu'):
        self.device = torch.device(device)
        self.model = self._load_model(model_path)
        self.transform = self._get_transforms()
        
        # Fish species labels (example set)
        self.species_labels = [
            "Thunnus albacares",  # Yellowfin tuna
            "Katsuwonus pelamis",  # Skipjack tuna
            "Sardinella longiceps",  # Indian oil sardine
            "Rastrelliger kanagurta",  # Indian mackerel
            "Epinephelus lanceolatus",  # Giant grouper
        ]
    
    def _load_model(self, model_path: str = None):
        """Load or initialize classification model"""
        # Use ResNet50 as base
        model = models.resnet50(pretrained=True)
        
        # Modify final layer for fish species
        num_classes = len(self.species_labels) if hasattr(self, 'species_labels') else 1000
        model.fc = nn.Linear(model.fc.in_features, num_classes)
        
        if model_path:
            model.load_state_dict(torch.load(model_path, map_location=self.device))
        
        model = model.to(self.device)
        model.eval()
        
        return model
    
    def _get_transforms(self):
        """Image preprocessing transforms"""
        return transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])
    
    def predict(self, image_path: str, top_k: int = 3) -> List[Tuple[str, float]]:
        """
        Predict fish species from image
        
        Args:
            image_path: Path to fish image
            top_k: Number of top predictions to return
            
        Returns:
            List of (species_name, confidence) tuples
        """
        # Load and preprocess image
        image = Image.open(image_path).convert('RGB')
        image_tensor = self.transform(image).unsqueeze(0).to(self.device)
        
        # Inference
        with torch.no_grad():
            outputs = self.model(image_tensor)
            probabilities = torch.nn.functional.softmax(outputs, dim=1)
            top_probs, top_indices = torch.topk(probabilities, top_k)
        
        # Format results
        results = []
        for prob, idx in zip(top_probs[0], top_indices[0]):
            species = self.species_labels[idx.item()]
            confidence = prob.item()
            results.append((species, confidence))
        
        return results
    
    def extract_features(self, image_path: str) -> np.ndarray:
        """Extract feature vector from image for similarity search"""
        image = Image.open(image_path).convert('RGB')
        image_tensor = self.transform(image).unsqueeze(0).to(self.device)
        
        # Extract features before final classification layer
        features = []
        def hook(module, input, output):
            features.append(output.detach())
        
        handle = self.model.avgpool.register_forward_hook(hook)
        
        with torch.no_grad():
            self.model(image_tensor)
        
        handle.remove()
        
        return features[0].cpu().numpy().flatten()

# Example usage
if __name__ == "__main__":
    classifier = FishClassifier()
    # predictions = classifier.predict("path/to/fish_image.jpg")
    # print(predictions)
