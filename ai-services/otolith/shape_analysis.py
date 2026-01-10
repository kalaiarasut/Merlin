"""
Otolith Shape Analysis using Fourier Descriptors

Scientific method for otolith shape comparison:
1. Extract otolith outline from image
2. Compute Elliptic Fourier Descriptors (EFD)
3. Store shape signature in database
4. Find similar shapes using Euclidean distance

References:
- Kuhl & Giardina (1982) - Elliptic Fourier features
- Campana & Casselman (1993) - Otolith shape analysis
"""

import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass, asdict
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('otolith_shape')


@dataclass
class ShapeDescriptor:
    """Fourier shape descriptor for an otolith."""
    coefficients: List[float]  # Normalized Fourier coefficients
    num_harmonics: int
    contour_points: int
    area: float
    perimeter: float
    circularity: float
    aspect_ratio: float
    
    def to_dict(self) -> Dict:
        return asdict(self)
    
    def to_vector(self) -> np.ndarray:
        """Convert to comparison vector."""
        return np.array(self.coefficients)


class OtolithShapeAnalyzer:
    """
    Extracts and compares otolith shapes using Elliptic Fourier Descriptors.
    
    Fourier analysis converts the otolith outline into a series of
    harmonic coefficients that describe the shape mathematically.
    This allows shape comparison independent of size, rotation, and position.
    """
    
    def __init__(self, num_harmonics: int = 20):
        """
        Initialize analyzer.
        
        Args:
            num_harmonics: Number of Fourier harmonics to compute (more = finer detail)
        """
        self.num_harmonics = num_harmonics
    
    def extract_contour(self, image: np.ndarray) -> Optional[np.ndarray]:
        """
        Extract the main otolith contour from an image.
        
        Args:
            image: Input image (BGR or grayscale)
            
        Returns:
            Largest contour as numpy array, or None if not found
        """
        # Convert to grayscale if needed
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Adaptive thresholding for varying lighting
        binary = cv2.adaptiveThreshold(
            blurred, 255, 
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY_INV, 
            11, 2
        )
        
        # Morphological operations to clean up
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
        
        # Find contours
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        
        if not contours:
            logger.warning("No contours found in image")
            return None
        
        # Return the largest contour (assumed to be the otolith)
        largest_contour = max(contours, key=cv2.contourArea)
        
        # Filter out too small contours
        if cv2.contourArea(largest_contour) < 1000:
            logger.warning("Contour too small, may not be an otolith")
            return None
        
        return largest_contour
    
    def compute_efd(self, contour: np.ndarray) -> np.ndarray:
        """
        Compute Elliptic Fourier Descriptors for a contour.
        
        Based on Kuhl & Giardina (1982) algorithm.
        
        Args:
            contour: Contour points as numpy array
            
        Returns:
            Normalized Fourier coefficients
        """
        # Flatten contour
        contour = contour.reshape(-1, 2).astype(np.float64)
        n = len(contour)
        
        # Compute dx, dy between consecutive points
        dx = np.diff(contour[:, 0], append=contour[0, 0] - contour[-1, 0])
        dy = np.diff(contour[:, 1], append=contour[0, 1] - contour[-1, 1])
        
        # Compute dt (segment lengths)
        dt = np.sqrt(dx**2 + dy**2)
        dt[dt == 0] = 1e-10  # Avoid division by zero
        
        # Cumulative time parameter
        t = np.cumsum(dt)
        T = t[-1]  # Total perimeter
        
        # Compute Fourier coefficients
        coefficients = []
        
        for k in range(1, self.num_harmonics + 1):
            # Coefficients for x(t) and y(t)
            cos_term = np.cos(2 * np.pi * k * t / T)
            sin_term = np.sin(2 * np.pi * k * t / T)
            
            # a_k, b_k for x(t)
            a_k = (T / (2 * np.pi**2 * k**2)) * np.sum((dx / dt) * (cos_term - np.cos(2 * np.pi * k * np.roll(t, 1) / T)))
            b_k = (T / (2 * np.pi**2 * k**2)) * np.sum((dx / dt) * (sin_term - np.sin(2 * np.pi * k * np.roll(t, 1) / T)))
            
            # c_k, d_k for y(t)
            c_k = (T / (2 * np.pi**2 * k**2)) * np.sum((dy / dt) * (cos_term - np.cos(2 * np.pi * k * np.roll(t, 1) / T)))
            d_k = (T / (2 * np.pi**2 * k**2)) * np.sum((dy / dt) * (sin_term - np.sin(2 * np.pi * k * np.roll(t, 1) / T)))
            
            coefficients.extend([a_k, b_k, c_k, d_k])
        
        coefficients = np.array(coefficients)
        
        # Normalize: size invariance by dividing by semi-major axis
        # and rotation/starting point invariance
        coefficients = self._normalize_efd(coefficients)
        
        return coefficients
    
    def _normalize_efd(self, coefficients: np.ndarray) -> np.ndarray:
        """
        Normalize EFD for size, rotation, and starting point invariance.
        """
        # Reshape to (n_harmonics, 4)
        coefs = coefficients.reshape(-1, 4)
        
        # Size normalization: divide by magnitude of first harmonic
        scale = np.sqrt(coefs[0, 0]**2 + coefs[0, 2]**2)
        if scale > 0:
            coefs = coefs / scale
        
        # Take absolute values for rotation invariance (simplified)
        # Full rotation invariance would require phase alignment
        normalized = np.abs(coefs).flatten()
        
        return normalized
    
    def compute_shape_metrics(self, contour: np.ndarray) -> Dict[str, float]:
        """
        Compute traditional shape metrics.
        
        Args:
            contour: Contour points
            
        Returns:
            Dictionary of shape metrics
        """
        area = cv2.contourArea(contour)
        perimeter = cv2.arcLength(contour, True)
        
        # Circularity (1.0 = perfect circle)
        circularity = 4 * np.pi * area / (perimeter ** 2) if perimeter > 0 else 0
        
        # Aspect ratio from bounding rectangle
        x, y, w, h = cv2.boundingRect(contour)
        aspect_ratio = float(w) / h if h > 0 else 1.0
        
        # Ellipse fitting for more metrics
        if len(contour) >= 5:
            ellipse = cv2.fitEllipse(contour)
            (cx, cy), (major, minor), angle = ellipse
            ellipse_aspect = minor / major if major > 0 else 1.0
        else:
            ellipse_aspect = aspect_ratio
        
        return {
            'area': area,
            'perimeter': perimeter,
            'circularity': circularity,
            'aspect_ratio': aspect_ratio,
            'ellipse_aspect': ellipse_aspect
        }
    
    def analyze_image(self, image: np.ndarray) -> Optional[ShapeDescriptor]:
        """
        Full analysis pipeline for an otolith image.
        
        Args:
            image: Input image (BGR or grayscale)
            
        Returns:
            ShapeDescriptor with Fourier coefficients and metrics
        """
        # Extract contour
        contour = self.extract_contour(image)
        if contour is None:
            return None
        
        # Compute Fourier descriptors
        coefficients = self.compute_efd(contour)
        
        # Compute shape metrics
        metrics = self.compute_shape_metrics(contour)
        
        return ShapeDescriptor(
            coefficients=coefficients.tolist(),
            num_harmonics=self.num_harmonics,
            contour_points=len(contour),
            area=metrics['area'],
            perimeter=metrics['perimeter'],
            circularity=metrics['circularity'],
            aspect_ratio=metrics['aspect_ratio']
        )
    
    def analyze_file(self, filepath: str) -> Optional[ShapeDescriptor]:
        """
        Analyze an otolith image from file.
        
        Args:
            filepath: Path to image file
            
        Returns:
            ShapeDescriptor or None if analysis fails
        """
        image = cv2.imread(filepath)
        if image is None:
            logger.error(f"Failed to load image: {filepath}")
            return None
        
        return self.analyze_image(image)
    
    def compute_similarity(
        self, 
        descriptor1: ShapeDescriptor, 
        descriptor2: ShapeDescriptor
    ) -> float:
        """
        Compute similarity between two otolith shapes.
        
        Uses Euclidean distance on normalized Fourier coefficients.
        
        Args:
            descriptor1: First shape descriptor
            descriptor2: Second shape descriptor
            
        Returns:
            Similarity score (0-100, higher = more similar)
        """
        vec1 = descriptor1.to_vector()
        vec2 = descriptor2.to_vector()
        
        # Euclidean distance
        distance = np.linalg.norm(vec1 - vec2)
        
        # Convert to similarity (0-100 scale)
        # Using exponential decay, threshold chosen empirically
        similarity = 100 * np.exp(-distance * 2)
        
        return round(similarity, 2)
    
    def find_similar(
        self,
        query_descriptor: ShapeDescriptor,
        database: List[Dict],
        top_k: int = 10
    ) -> List[Dict]:
        """
        Find most similar otoliths in a database.
        
        Args:
            query_descriptor: Shape descriptor of query otolith
            database: List of stored otoliths with 'shape_descriptor' field
            top_k: Number of results to return
            
        Returns:
            List of matches with similarity scores
        """
        results = []
        
        for record in database:
            if 'shape_descriptor' not in record:
                continue
            
            # Reconstruct descriptor
            stored = record['shape_descriptor']
            db_descriptor = ShapeDescriptor(
                coefficients=stored.get('coefficients', []),
                num_harmonics=stored.get('num_harmonics', self.num_harmonics),
                contour_points=stored.get('contour_points', 0),
                area=stored.get('area', 0),
                perimeter=stored.get('perimeter', 0),
                circularity=stored.get('circularity', 0),
                aspect_ratio=stored.get('aspect_ratio', 0)
            )
            
            similarity = self.compute_similarity(query_descriptor, db_descriptor)
            
            results.append({
                'id': record.get('_id') or record.get('id'),
                'species': record.get('species', 'Unknown'),
                'similarity': similarity,
                'metadata': {
                    'area': stored.get('area'),
                    'circularity': stored.get('circularity')
                }
            })
        
        # Sort by similarity (descending)
        results.sort(key=lambda x: x['similarity'], reverse=True)
        
        return results[:top_k]


# Convenience function for API
def analyze_otolith_shape(image_path: str) -> Optional[Dict]:
    """
    Analyze otolith shape from an image file.
    
    Args:
        image_path: Path to otolith image
        
    Returns:
        Shape descriptor as dictionary
    """
    analyzer = OtolithShapeAnalyzer()
    descriptor = analyzer.analyze_file(image_path)
    
    if descriptor:
        return descriptor.to_dict()
    return None


def compare_otoliths(image_path1: str, image_path2: str) -> Optional[Dict]:
    """
    Compare two otolith images.
    
    Args:
        image_path1: Path to first otolith image
        image_path2: Path to second otolith image
        
    Returns:
        Comparison result with similarity score
    """
    analyzer = OtolithShapeAnalyzer()
    
    desc1 = analyzer.analyze_file(image_path1)
    desc2 = analyzer.analyze_file(image_path2)
    
    if desc1 is None or desc2 is None:
        return None
    
    similarity = analyzer.compute_similarity(desc1, desc2)
    
    return {
        'similarity': similarity,
        'shape1': desc1.to_dict(),
        'shape2': desc2.to_dict()
    }


if __name__ == "__main__":
    # Test with a sample image
    import sys
    
    if len(sys.argv) > 1:
        result = analyze_otolith_shape(sys.argv[1])
        if result:
            print(f"Shape analysis complete:")
            print(f"  Harmonics: {result['num_harmonics']}")
            print(f"  Area: {result['area']:.2f}")
            print(f"  Circularity: {result['circularity']:.3f}")
            print(f"  Aspect Ratio: {result['aspect_ratio']:.3f}")
        else:
            print("Analysis failed")
    else:
        print("Usage: python shape_analysis.py <image_path>")
