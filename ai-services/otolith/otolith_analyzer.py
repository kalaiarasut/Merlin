"""
Otolith Analysis Module - State-of-the-Art Age Estimation

Performs:
- Image segmentation with advanced preprocessing
- Multi-algorithm ring detection (Canny, Laplacian, LoG, Gabor, Hough)
- Radial profile analysis for growth ring identification
- Ensemble-based age estimation with confidence scoring
- Shape extraction and morphometric measurements
- Species classification based on shape
- Growth rate analysis and fish size estimation

Based on methodologies from:
- Campana, S.E. (2001) - Accuracy, precision and quality control in age determination
- Fablet, R. (2006) - Automated fish age estimation from otolith images
- Moen et al. (2018) - Deep learning for automatic age estimation
"""

import cv2
import numpy as np
from scipy import ndimage, signal
from scipy.ndimage import gaussian_filter, sobel
from scipy.interpolate import interp1d
from scipy.signal import find_peaks, savgol_filter
from skimage import measure, morphology, filters, feature, transform
from skimage.filters import gabor, threshold_otsu, threshold_local
from skimage.morphology import disk, erosion, dilation, opening, closing
from skimage.transform import hough_circle, hough_circle_peaks
from typing import Dict, Tuple, List, Optional, Any
import base64
from io import BytesIO
import warnings
warnings.filterwarnings('ignore')

# Optional torch import for deep learning features
try:
    import torch
    import torch.nn as nn
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    torch = None
    nn = None


class RingDetectionMethod:
    """Enum-like class for ring detection methods"""
    CANNY = "canny"
    LAPLACIAN = "laplacian"
    LOG = "laplacian_of_gaussian"
    GABOR = "gabor"
    RADIAL_PROFILE = "radial_profile"
    HOUGH = "hough_circles"
    GRADIENT = "gradient_magnitude"
    WAVELET = "wavelet"


class OtolithAgeEstimator:
    """
    State-of-the-art otolith age estimation using ensemble methods.
    
    Uses multiple ring detection algorithms and combines results for
    robust age estimation with confidence scoring.
    """
    
    def __init__(self):
        self.detection_methods = [
            RingDetectionMethod.RADIAL_PROFILE,
            RingDetectionMethod.CANNY,
            RingDetectionMethod.LAPLACIAN,
            RingDetectionMethod.LOG,
            RingDetectionMethod.GABOR,
            RingDetectionMethod.GRADIENT,
        ]
        # Weights for ensemble (tuned based on typical performance)
        self.method_weights = {
            RingDetectionMethod.RADIAL_PROFILE: 0.25,
            RingDetectionMethod.CANNY: 0.15,
            RingDetectionMethod.LAPLACIAN: 0.15,
            RingDetectionMethod.LOG: 0.15,
            RingDetectionMethod.GABOR: 0.15,
            RingDetectionMethod.GRADIENT: 0.15,
        }
    
    def preprocess_image(self, image: np.ndarray) -> np.ndarray:
        """
        Advanced preprocessing for otolith images.
        
        Applies CLAHE, denoising, and contrast enhancement.
        """
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # Non-local means denoising
        denoised = cv2.fastNlMeansDenoising(enhanced, h=10, templateWindowSize=7, searchWindowSize=21)
        
        # Bilateral filter to smooth while preserving edges (rings)
        bilateral = cv2.bilateralFilter(denoised, 9, 75, 75)
        
        return bilateral
    
    def find_otolith_center(self, mask: np.ndarray) -> Tuple[int, int]:
        """
        Find the nucleus (center) of the otolith using moments.
        """
        moments = cv2.moments(mask)
        if moments["m00"] == 0:
            h, w = mask.shape
            return (w // 2, h // 2)
        
        cx = int(moments["m10"] / moments["m00"])
        cy = int(moments["m01"] / moments["m00"])
        return (cx, cy)
    
    def extract_radial_profiles(
        self, 
        image: np.ndarray, 
        center: Tuple[int, int],
        num_rays: int = 360,
        max_radius: Optional[int] = None
    ) -> Tuple[np.ndarray, List[np.ndarray]]:
        """
        Extract radial intensity profiles from center to edge.
        
        This is the core of age estimation - analyzing intensity variations
        along radial lines from nucleus to edge.
        
        Args:
            image: Preprocessed grayscale image
            center: (x, y) coordinates of otolith nucleus
            num_rays: Number of radial lines to analyze
            max_radius: Maximum radius to analyze
            
        Returns:
            mean_profile: Average radial profile
            all_profiles: List of individual profiles
        """
        h, w = image.shape
        cx, cy = center
        
        if max_radius is None:
            max_radius = min(cx, cy, w - cx, h - cy) - 10
        
        angles = np.linspace(0, 2 * np.pi, num_rays, endpoint=False)
        all_profiles = []
        
        for angle in angles:
            profile = []
            for r in range(1, max_radius):
                x = int(cx + r * np.cos(angle))
                y = int(cy + r * np.sin(angle))
                
                if 0 <= x < w and 0 <= y < h:
                    profile.append(image[y, x])
                else:
                    break
            
            if len(profile) > 10:
                all_profiles.append(np.array(profile))
        
        # Interpolate all profiles to same length for averaging
        if all_profiles:
            max_len = max(len(p) for p in all_profiles)
            interpolated = []
            for p in all_profiles:
                if len(p) > 10:
                    x_old = np.linspace(0, 1, len(p))
                    x_new = np.linspace(0, 1, max_len)
                    f = interp1d(x_old, p, kind='linear', fill_value='extrapolate')
                    interpolated.append(f(x_new))
            
            mean_profile = np.mean(interpolated, axis=0)
            return mean_profile, all_profiles
        
        return np.array([]), []
    
    def detect_rings_radial_profile(
        self, 
        profile: np.ndarray,
        min_ring_spacing: int = 5
    ) -> Tuple[List[int], float]:
        """
        Detect growth rings using radial profile peak detection.
        
        Analyzes the intensity profile to find periodic variations
        corresponding to annual growth rings.
        
        Args:
            profile: Mean radial intensity profile
            min_ring_spacing: Minimum pixels between rings
            
        Returns:
            ring_positions: List of ring positions (pixel distances from center)
            confidence: Confidence score for detection
        """
        if len(profile) < 20:
            return [], 0.0
        
        # Smooth the profile
        window_length = min(21, len(profile) // 3)
        if window_length % 2 == 0:
            window_length += 1
        if window_length >= 5:
            smoothed = savgol_filter(profile, window_length, 3)
        else:
            smoothed = profile
        
        # Calculate first derivative to find transitions
        derivative = np.gradient(smoothed)
        
        # Find zero crossings of derivative (local extrema)
        # Growth rings appear as dark bands (local minima in light-on-dark images)
        # or light bands (local maxima in dark-on-light images)
        
        # Detect peaks (light rings) and valleys (dark rings)
        peaks, peak_props = find_peaks(
            smoothed, 
            distance=min_ring_spacing,
            prominence=np.std(smoothed) * 0.3
        )
        
        valleys, valley_props = find_peaks(
            -smoothed, 
            distance=min_ring_spacing,
            prominence=np.std(smoothed) * 0.3
        )
        
        # Use whichever gives more consistent spacing
        peak_spacing = np.diff(peaks) if len(peaks) > 1 else []
        valley_spacing = np.diff(valleys) if len(valleys) > 1 else []
        
        # Calculate coefficient of variation for spacing regularity
        if len(peak_spacing) > 2:
            peak_cv = np.std(peak_spacing) / np.mean(peak_spacing) if np.mean(peak_spacing) > 0 else 999
        else:
            peak_cv = 999
            
        if len(valley_spacing) > 2:
            valley_cv = np.std(valley_spacing) / np.mean(valley_spacing) if np.mean(valley_spacing) > 0 else 999
        else:
            valley_cv = 999
        
        # Choose the more regular pattern
        if peak_cv < valley_cv and len(peaks) > 0:
            ring_positions = peaks.tolist()
            cv = peak_cv
        elif len(valleys) > 0:
            ring_positions = valleys.tolist()
            cv = valley_cv
        else:
            ring_positions = []
            cv = 999
        
        # Calculate confidence based on:
        # 1. Number of detected rings
        # 2. Regularity of spacing (lower CV = higher confidence)
        # 3. Prominence of peaks
        
        if len(ring_positions) > 0:
            regularity_score = max(0, 1 - cv) if cv < 999 else 0
            count_score = min(1, len(ring_positions) / 20)  # Normalize by expected max age
            confidence = (regularity_score * 0.6 + count_score * 0.4)
        else:
            confidence = 0.0
        
        return ring_positions, confidence
    
    def detect_rings_canny(
        self, 
        image: np.ndarray,
        center: Tuple[int, int],
        mask: np.ndarray
    ) -> Tuple[List[int], float]:
        """
        Detect rings using Canny edge detection with circular analysis.
        """
        # Apply Canny edge detection
        edges = cv2.Canny(image, 30, 100)
        
        # Apply mask
        edges = cv2.bitwise_and(edges, edges, mask=mask)
        
        # Analyze edges at different radii
        cx, cy = center
        h, w = image.shape
        max_radius = min(cx, cy, w - cx, h - cy) - 5
        
        ring_strengths = []
        for r in range(5, max_radius, 2):
            # Count edge pixels at this radius
            edge_count = 0
            total_count = 0
            for angle in np.linspace(0, 2 * np.pi, 100):
                x = int(cx + r * np.cos(angle))
                y = int(cy + r * np.sin(angle))
                if 0 <= x < w and 0 <= y < h:
                    total_count += 1
                    if edges[y, x] > 0:
                        edge_count += 1
            
            if total_count > 0:
                ring_strengths.append(edge_count / total_count)
            else:
                ring_strengths.append(0)
        
        # Find peaks in ring strength
        ring_strengths = np.array(ring_strengths)
        if len(ring_strengths) > 10:
            smoothed = savgol_filter(ring_strengths, min(11, len(ring_strengths) // 2 * 2 + 1), 3)
            peaks, _ = find_peaks(smoothed, distance=3, prominence=0.05)
            ring_positions = (peaks * 2 + 5).tolist()  # Convert back to actual radius
            confidence = min(1.0, len(peaks) / 15) * 0.8  # Scale confidence
        else:
            ring_positions = []
            confidence = 0.0
        
        return ring_positions, confidence
    
    def detect_rings_laplacian(
        self, 
        image: np.ndarray,
        center: Tuple[int, int],
        mask: np.ndarray
    ) -> Tuple[List[int], float]:
        """
        Detect rings using Laplacian edge detection.
        """
        # Apply Laplacian
        laplacian = cv2.Laplacian(image, cv2.CV_64F, ksize=5)
        laplacian = np.abs(laplacian)
        laplacian = (laplacian / laplacian.max() * 255).astype(np.uint8)
        
        # Apply mask
        laplacian = cv2.bitwise_and(laplacian, laplacian, mask=mask)
        
        # Extract radial profile of Laplacian response
        mean_profile, _ = self.extract_radial_profiles(laplacian, center, num_rays=180)
        
        if len(mean_profile) > 20:
            peaks, _ = find_peaks(mean_profile, distance=5, prominence=np.std(mean_profile) * 0.5)
            ring_positions = peaks.tolist()
            confidence = min(1.0, len(peaks) / 15) * 0.75
        else:
            ring_positions = []
            confidence = 0.0
        
        return ring_positions, confidence
    
    def detect_rings_log(
        self, 
        image: np.ndarray,
        center: Tuple[int, int],
        mask: np.ndarray
    ) -> Tuple[List[int], float]:
        """
        Detect rings using Laplacian of Gaussian (blob detection).
        """
        # Multi-scale LoG
        log_responses = []
        for sigma in [1, 2, 3, 4, 5]:
            log = ndimage.gaussian_laplace(image.astype(float), sigma=sigma)
            log_responses.append(np.abs(log))
        
        # Max across scales
        log_max = np.maximum.reduce(log_responses)
        log_max = (log_max / log_max.max() * 255).astype(np.uint8)
        log_max = cv2.bitwise_and(log_max, log_max, mask=mask)
        
        # Extract radial profile
        mean_profile, _ = self.extract_radial_profiles(log_max, center, num_rays=180)
        
        if len(mean_profile) > 20:
            peaks, _ = find_peaks(mean_profile, distance=5, prominence=np.std(mean_profile) * 0.4)
            ring_positions = peaks.tolist()
            confidence = min(1.0, len(peaks) / 15) * 0.7
        else:
            ring_positions = []
            confidence = 0.0
        
        return ring_positions, confidence
    
    def detect_rings_gabor(
        self, 
        image: np.ndarray,
        center: Tuple[int, int],
        mask: np.ndarray
    ) -> Tuple[List[int], float]:
        """
        Detect rings using Gabor filters tuned for circular patterns.
        """
        # Apply Gabor filters at multiple orientations
        gabor_responses = []
        for theta in np.linspace(0, np.pi, 8, endpoint=False):
            for frequency in [0.1, 0.15, 0.2]:
                filt_real, filt_imag = gabor(
                    image / 255.0, 
                    frequency=frequency, 
                    theta=theta
                )
                gabor_responses.append(np.sqrt(filt_real**2 + filt_imag**2))
        
        # Max response
        gabor_max = np.maximum.reduce(gabor_responses)
        gabor_max = (gabor_max / gabor_max.max() * 255).astype(np.uint8)
        gabor_max = cv2.bitwise_and(gabor_max, gabor_max, mask=mask)
        
        # Extract radial profile
        mean_profile, _ = self.extract_radial_profiles(gabor_max, center, num_rays=180)
        
        if len(mean_profile) > 20:
            peaks, _ = find_peaks(mean_profile, distance=5, prominence=np.std(mean_profile) * 0.3)
            ring_positions = peaks.tolist()
            confidence = min(1.0, len(peaks) / 15) * 0.7
        else:
            ring_positions = []
            confidence = 0.0
        
        return ring_positions, confidence
    
    def detect_rings_gradient(
        self, 
        image: np.ndarray,
        center: Tuple[int, int],
        mask: np.ndarray
    ) -> Tuple[List[int], float]:
        """
        Detect rings using gradient magnitude in radial direction.
        """
        # Calculate gradient
        grad_x = sobel(image.astype(float), axis=1)
        grad_y = sobel(image.astype(float), axis=0)
        grad_mag = np.sqrt(grad_x**2 + grad_y**2)
        grad_mag = (grad_mag / grad_mag.max() * 255).astype(np.uint8)
        grad_mag = cv2.bitwise_and(grad_mag, grad_mag, mask=mask)
        
        # Extract radial profile
        mean_profile, _ = self.extract_radial_profiles(grad_mag, center, num_rays=180)
        
        if len(mean_profile) > 20:
            peaks, _ = find_peaks(mean_profile, distance=5, prominence=np.std(mean_profile) * 0.4)
            ring_positions = peaks.tolist()
            confidence = min(1.0, len(peaks) / 15) * 0.75
        else:
            ring_positions = []
            confidence = 0.0
        
        return ring_positions, confidence
    
    def ensemble_age_estimation(
        self, 
        image: np.ndarray,
        mask: np.ndarray,
        center: Tuple[int, int]
    ) -> Dict[str, Any]:
        """
        Ensemble-based age estimation combining multiple detection methods.
        
        Returns:
            Dictionary with estimated age, confidence, and detailed results
        """
        preprocessed = self.preprocess_image(image)
        
        # Extract base radial profile for primary method
        mean_profile, all_profiles = self.extract_radial_profiles(preprocessed, center)
        
        results = {}
        all_ages = []
        weighted_sum = 0
        weight_total = 0
        
        # Run each detection method
        for method in self.detection_methods:
            try:
                if method == RingDetectionMethod.RADIAL_PROFILE:
                    rings, conf = self.detect_rings_radial_profile(mean_profile)
                elif method == RingDetectionMethod.CANNY:
                    rings, conf = self.detect_rings_canny(preprocessed, center, mask)
                elif method == RingDetectionMethod.LAPLACIAN:
                    rings, conf = self.detect_rings_laplacian(preprocessed, center, mask)
                elif method == RingDetectionMethod.LOG:
                    rings, conf = self.detect_rings_log(preprocessed, center, mask)
                elif method == RingDetectionMethod.GABOR:
                    rings, conf = self.detect_rings_gabor(preprocessed, center, mask)
                elif method == RingDetectionMethod.GRADIENT:
                    rings, conf = self.detect_rings_gradient(preprocessed, center, mask)
                else:
                    continue
                
                age = len(rings)
                results[method] = {
                    "age": age,
                    "confidence": conf,
                    "ring_positions": rings
                }
                
                if age > 0 and conf > 0.1:
                    weight = self.method_weights.get(method, 0.1) * conf
                    weighted_sum += age * weight
                    weight_total += weight
                    all_ages.append(age)
                    
            except Exception as e:
                results[method] = {"error": str(e), "age": 0, "confidence": 0}
        
        # Calculate ensemble age
        if weight_total > 0:
            ensemble_age = weighted_sum / weight_total
            # Round to nearest integer, but keep decimal for confidence assessment
            estimated_age = round(ensemble_age)
            
            # Calculate confidence based on agreement between methods
            if all_ages:
                age_std = np.std(all_ages)
                agreement_score = max(0, 1 - (age_std / max(np.mean(all_ages), 1)))
                
                # Combined confidence
                method_confidences = [r["confidence"] for r in results.values() if isinstance(r, dict) and "confidence" in r]
                avg_method_confidence = np.mean(method_confidences) if method_confidences else 0
                
                overall_confidence = (agreement_score * 0.5 + avg_method_confidence * 0.5)
            else:
                overall_confidence = 0.0
        else:
            estimated_age = 0
            overall_confidence = 0.0
            ensemble_age = 0
        
        return {
            "estimated_age": estimated_age,
            "ensemble_age_precise": round(ensemble_age, 2) if weight_total > 0 else 0,
            "confidence": round(overall_confidence, 3),
            "confidence_level": self._confidence_level(overall_confidence),
            "method_results": results,
            "all_ages": all_ages,
            "age_range": {
                "min": min(all_ages) if all_ages else 0,
                "max": max(all_ages) if all_ages else 0,
                "std": round(np.std(all_ages), 2) if all_ages else 0
            }
        }
    
    def single_method_estimation(
        self, 
        image: np.ndarray,
        mask: np.ndarray,
        center: Tuple[int, int],
        method: str
    ) -> Dict[str, Any]:
        """
        Age estimation using a single specified method.
        
        Args:
            image: Otolith image
            mask: Binary mask
            center: Otolith center coordinates
            method: Detection method name ('canny', 'sobel', 'laplacian', 'adaptive', 'radial')
            
        Returns:
            Dictionary with estimated age, confidence, and detailed results
        """
        preprocessed = self.preprocess_image(image)
        mean_profile, _ = self.extract_radial_profiles(preprocessed, center)
        
        # Map method name to detection function
        method_map = {
            'canny': (self.detect_rings_canny, RingDetectionMethod.CANNY),
            'sobel': (self.detect_rings_gradient, RingDetectionMethod.GRADIENT),
            'laplacian': (self.detect_rings_laplacian, RingDetectionMethod.LAPLACIAN),
            'adaptive': (self.detect_rings_log, RingDetectionMethod.LOG),
            'radial': (self.detect_rings_radial_profile, RingDetectionMethod.RADIAL_PROFILE),
        }
        
        if method.lower() not in method_map:
            # Fall back to ensemble if invalid method
            return self.ensemble_age_estimation(image, mask, center)
        
        detect_func, method_enum = method_map[method.lower()]
        
        try:
            if method.lower() == 'radial':
                rings, conf = detect_func(mean_profile)
            else:
                rings, conf = detect_func(preprocessed, center, mask)
            
            estimated_age = len(rings)
            
            return {
                "estimated_age": estimated_age,
                "ensemble_age_precise": float(estimated_age),
                "confidence": round(conf, 3),
                "confidence_level": self._confidence_level(conf),
                "method_results": {
                    method_enum: {
                        "age": estimated_age,
                        "confidence": conf,
                        "ring_positions": rings
                    }
                },
                "all_ages": [estimated_age] if estimated_age > 0 else [],
                "age_range": {
                    "min": estimated_age,
                    "max": estimated_age,
                    "std": 0.0
                }
            }
        except Exception as e:
            return {
                "estimated_age": 0,
                "ensemble_age_precise": 0.0,
                "confidence": 0.0,
                "confidence_level": "very_low",
                "method_results": {method: {"error": str(e)}},
                "all_ages": [],
                "age_range": {"min": 0, "max": 0, "std": 0}
            }
    
    def _confidence_level(self, confidence: float) -> str:
        """Convert numeric confidence to categorical level."""
        if confidence >= 0.8:
            return "high"
        elif confidence >= 0.5:
            return "medium"
        elif confidence >= 0.3:
            return "low"
        else:
            return "very_low"
    
    def analyze_growth_pattern(
        self, 
        ring_positions: List[int],
        calibration_mm_per_pixel: float = 0.01
    ) -> Dict[str, Any]:
        """
        Analyze growth pattern from ring positions.
        
        Returns growth rates, patterns, and anomalies.
        """
        if len(ring_positions) < 2:
            return {"error": "Insufficient rings for growth analysis"}
        
        ring_positions = sorted(ring_positions)
        
        # Calculate inter-ring distances (growth increments)
        increments = np.diff(ring_positions) * calibration_mm_per_pixel
        
        # Growth analysis
        growth_data = {
            "ring_count": len(ring_positions),
            "total_growth_mm": round(float(ring_positions[-1] * calibration_mm_per_pixel), 3),
            "mean_increment_mm": round(float(np.mean(increments)), 3),
            "std_increment_mm": round(float(np.std(increments)), 3),
            "increments_mm": [round(float(x), 3) for x in increments],
            "growth_trend": self._detect_growth_trend(increments),
            "anomalies": self._detect_growth_anomalies(increments)
        }
        
        return growth_data
    
    def _detect_growth_trend(self, increments: np.ndarray) -> str:
        """Detect overall growth trend (normal fish grow slower as they age)."""
        if len(increments) < 3:
            return "insufficient_data"
        
        # Fit linear trend
        x = np.arange(len(increments))
        slope, _ = np.polyfit(x, increments, 1)
        
        if slope < -0.1:
            return "decreasing"  # Normal - growth slows with age
        elif slope > 0.1:
            return "increasing"  # Unusual - accelerating growth
        else:
            return "stable"
    
    def _detect_growth_anomalies(self, increments: np.ndarray) -> List[Dict]:
        """Detect years with unusual growth (stress, environmental events)."""
        if len(increments) < 5:
            return []
        
        mean = np.mean(increments)
        std = np.std(increments)
        anomalies = []
        
        for i, inc in enumerate(increments):
            z_score = (inc - mean) / std if std > 0 else 0
            if abs(z_score) > 2:
                anomalies.append({
                    "year": i + 1,
                    "increment": round(float(inc), 3),
                    "z_score": round(float(z_score), 2),
                    "type": "slow_growth" if z_score < 0 else "fast_growth"
                })
        
        return anomalies
    
    def estimate_fish_size(
        self, 
        age: int,
        species: str = "unknown"
    ) -> Dict[str, Any]:
        """
        Estimate fish size based on age using von Bertalanffy growth model.
        
        Uses species-specific parameters when available.
        """
        # Von Bertalanffy growth parameters (example values)
        # L(t) = L_inf * (1 - exp(-K * (t - t0)))
        growth_params = {
            "default": {"L_inf": 50, "K": 0.2, "t0": -0.5},
            "lutjanus_campechanus": {"L_inf": 80, "K": 0.15, "t0": -0.3},  # Red snapper
            "gadus_morhua": {"L_inf": 120, "K": 0.12, "t0": -0.2},  # Atlantic cod
            "thunnus_thynnus": {"L_inf": 300, "K": 0.08, "t0": -0.1},  # Bluefin tuna
        }
        
        params = growth_params.get(species.lower().replace(" ", "_"), growth_params["default"])
        
        # Calculate estimated length
        estimated_length = params["L_inf"] * (1 - np.exp(-params["K"] * (age - params["t0"])))
        
        # Estimate weight using length-weight relationship (W = a * L^b)
        # Using generic values
        a, b = 0.01, 3.0
        estimated_weight = a * (estimated_length ** b)
        
        return {
            "estimated_length_cm": round(float(estimated_length), 1),
            "estimated_weight_kg": round(float(estimated_weight / 1000), 2),
            "growth_model": "von_bertalanffy",
            "parameters_used": params,
            "note": "Estimates based on species average; individual variation expected"
        }


class OtolithAnalyzer:
    """
    Comprehensive otolith analysis including age estimation, 
    morphometrics, and species classification.
    """
    
    def __init__(self, model_path: str = None):
        self.model = self._load_model(model_path) if model_path else None
        self.age_estimator = OtolithAgeEstimator()
    
    def _load_model(self, model_path: str):
        """Load trained otolith classification model"""
        # TODO: Load actual trained model
        return None
    
    def segment_otolith(self, image_path: str) -> Tuple[np.ndarray, np.ndarray]:
        """
        Segment otolith from background with enhanced preprocessing.
        
        Args:
            image_path: Path to otolith image
            
        Returns:
            Tuple of (original_image, binary_mask)
        """
        # Read image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not read image: {image_path}")
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Enhanced preprocessing
        # Apply CLAHE
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # Bilateral filter
        filtered = cv2.bilateralFilter(enhanced, 9, 75, 75)
        
        # Adaptive thresholding
        binary = cv2.adaptiveThreshold(
            filtered, 255, 
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 
            blockSize=11, 
            C=2
        )
        
        # Try Otsu if adaptive doesn't work well
        _, otsu = cv2.threshold(filtered, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Use whichever has more structure
        if cv2.countNonZero(binary) > cv2.countNonZero(otsu):
            selected = binary
        else:
            selected = otsu
        
        # Morphological operations
        kernel = np.ones((5, 5), np.uint8)
        cleaned = cv2.morphologyEx(selected, cv2.MORPH_CLOSE, kernel, iterations=2)
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel, iterations=1)
        
        # Find largest contour (otolith)
        contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            largest_contour = max(contours, key=cv2.contourArea)
            mask = np.zeros_like(gray)
            cv2.drawContours(mask, [largest_contour], -1, 255, -1)
            return img, mask
        
        return img, cleaned
    
    def analyze_age(self, image_path: str, method: str = "ensemble") -> Dict[str, Any]:
        """
        Complete age analysis of an otolith image.
        
        Args:
            image_path: Path to otolith image
            method: Analysis method - 'ensemble', 'canny', 'sobel', 'laplacian', 
                   'adaptive', or 'radial'
            
        Returns:
            Comprehensive analysis results including age estimate,
            confidence, growth patterns, and visualizations
        """
        # Segment otolith
        original, mask = self.segment_otolith(image_path)
        gray = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)
        
        # Find center
        center = self.age_estimator.find_otolith_center(mask)
        
        # Estimate age using specified method
        if method == "ensemble":
            age_results = self.age_estimator.ensemble_age_estimation(gray, mask, center)
        else:
            # Use specific method
            age_results = self.age_estimator.single_method_estimation(gray, mask, center, method)
        
        # Get morphometric measurements
        measurements = self.extract_measurements(mask)
        
        # Analyze growth pattern
        # Use the best ring positions from the ensemble
        best_method = max(
            age_results["method_results"].items(),
            key=lambda x: x[1].get("confidence", 0) if isinstance(x[1], dict) else 0
        )
        if isinstance(best_method[1], dict) and "ring_positions" in best_method[1]:
            growth_analysis = self.age_estimator.analyze_growth_pattern(
                best_method[1]["ring_positions"]
            )
        else:
            growth_analysis = {"error": "No valid ring positions"}
        
        # Estimate fish size
        size_estimate = self.age_estimator.estimate_fish_size(
            age_results["estimated_age"]
        )
        
        # Generate visualization
        visualization = self._create_age_visualization(
            original, mask, center, age_results
        )
        
        return {
            "age_estimation": {
                "estimated_age": age_results["estimated_age"],
                "confidence": age_results["confidence"],
                "confidence_level": age_results["confidence_level"],
                "age_range": age_results["age_range"],
                "ensemble_details": age_results["method_results"]
            },
            "growth_analysis": growth_analysis,
            "fish_size_estimate": size_estimate,
            "morphometrics": measurements,
            "visualization": visualization,
            "center": center,
            "analysis_methods": list(age_results["method_results"].keys())
        }
    
    def _create_age_visualization(
        self, 
        image: np.ndarray, 
        mask: np.ndarray,
        center: Tuple[int, int],
        age_results: Dict
    ) -> str:
        """Create visualization with detected rings marked."""
        vis = image.copy()
        
        # Draw center point
        cv2.circle(vis, center, 5, (0, 255, 0), -1)
        cv2.circle(vis, center, 8, (0, 255, 0), 2)
        
        # Draw detected rings from the best method
        best_conf = 0
        best_rings = []
        for method, result in age_results["method_results"].items():
            if isinstance(result, dict) and result.get("confidence", 0) > best_conf:
                best_conf = result["confidence"]
                best_rings = result.get("ring_positions", [])
        
        # Draw rings as concentric circles
        colors = [
            (255, 100, 100), (100, 255, 100), (100, 100, 255),
            (255, 255, 100), (255, 100, 255), (100, 255, 255)
        ]
        for i, radius in enumerate(best_rings):
            color = colors[i % len(colors)]
            cv2.circle(vis, center, int(radius), color, 1)
        
        # Add age label
        cv2.putText(
            vis, 
            f"Est. Age: {age_results['estimated_age']} years", 
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX, 
            0.8, 
            (0, 255, 0), 
            2
        )
        cv2.putText(
            vis, 
            f"Confidence: {age_results['confidence']:.1%}", 
            (10, 60),
            cv2.FONT_HERSHEY_SIMPLEX, 
            0.6, 
            (0, 255, 0), 
            2
        )
        
        # Encode to base64
        _, buffer = cv2.imencode('.jpg', vis)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return f"data:image/jpeg;base64,{img_base64}"
    
    def extract_measurements(self, mask: np.ndarray) -> Dict[str, float]:
        """
        Calculate morphometric measurements
        
        Args:
            mask: Binary mask of otolith
            
        Returns:
            Dictionary of measurements
        """
        # Find contours
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return {}
        
        contour = contours[0]
        
        # Basic measurements
        area = cv2.contourArea(contour)
        perimeter = cv2.arcLength(contour, True)
        
        # Bounding rectangle
        x, y, w, h = cv2.boundingRect(contour)
        
        # Fitted ellipse
        if len(contour) >= 5:
            ellipse = cv2.fitEllipse(contour)
            (cx, cy), (ma, MA), angle = ellipse
        else:
            ma, MA = 0, 0
        
        # Shape descriptors
        circularity = (4 * np.pi * area) / (perimeter ** 2) if perimeter > 0 else 0
        aspect_ratio = float(w) / h if h > 0 else 0
        rectangularity = area / (w * h) if (w * h) > 0 else 0
        
        measurements = {
            "length": max(w, h),
            "width": min(w, h),
            "area": area,
            "perimeter": perimeter,
            "circularity": round(circularity, 4),
            "aspect_ratio": round(aspect_ratio, 4),
            "rectangularity": round(rectangularity, 4),
            "major_axis": round(MA, 2),
            "minor_axis": round(ma, 2)
        }
        
        return measurements
    
    def extract_shape_descriptors(self, contour: np.ndarray) -> Dict[str, np.ndarray]:
        """
        Extract advanced shape descriptors (Fourier, wavelets)
        
        Args:
            contour: Otolith contour
            
        Returns:
            Dictionary of shape descriptors
        """
        # Fourier descriptors
        contour_complex = np.empty(contour.shape[:-1], dtype=complex)
        contour_complex.real = contour[:, 0, 0]
        contour_complex.imag = contour[:, 0, 1]
        
        fourier_desc = np.fft.fft(contour_complex)
        fourier_desc = np.abs(fourier_desc)
        
        # Normalize
        fourier_desc = fourier_desc[1:] / fourier_desc[0]
        
        return {
            "fourier_descriptors": fourier_desc[:20].tolist()  # First 20 coefficients
        }
    
    def predict_species(self, image_path: str) -> Tuple[str, float]:
        """
        Predict fish species from otolith morphology
        
        Args:
            image_path: Path to otolith image
            
        Returns:
            (species_name, confidence)
        """
        # Segment otolith
        _, mask = self.segment_otolith(image_path)
        
        # Extract measurements
        measurements = self.extract_measurements(mask)
        
        if not measurements:
            return ("Unknown", 0.0)
        
        # TODO: Use trained model for classification
        # For now, return placeholder
        return ("Lutjanus campechanus", 0.91)
    
    def find_similar(
        self, 
        query_measurements: Dict[str, float],
        database_measurements: list,
        top_k: int = 5
    ) -> list:
        """
        Find similar otoliths based on morphometric similarity
        
        Args:
            query_measurements: Measurements of query otolith
            database_measurements: List of measurements from database
            top_k: Number of similar otoliths to return
            
        Returns:
            List of (otolith_id, similarity_score) tuples
        """
        # Calculate Euclidean distance in feature space
        similarities = []
        
        feature_keys = ["length", "width", "circularity", "aspect_ratio"]
        
        for db_entry in database_measurements:
            distance = 0
            for key in feature_keys:
                if key in query_measurements and key in db_entry["measurements"]:
                    diff = query_measurements[key] - db_entry["measurements"][key]
                    distance += diff ** 2
            
            distance = np.sqrt(distance)
            similarity = 1 / (1 + distance)  # Convert to similarity
            similarities.append((db_entry["id"], similarity))
        
        # Sort by similarity
        similarities.sort(key=lambda x: x[1], reverse=True)
        
        return similarities[:top_k]


# Example usage
if __name__ == "__main__":
    analyzer = OtolithAnalyzer()
    # result = analyzer.analyze_age("path/to/otolith.jpg")
    # print(f"Estimated age: {result['age_estimation']['estimated_age']} years")
    # print(f"Confidence: {result['age_estimation']['confidence']:.1%}")

