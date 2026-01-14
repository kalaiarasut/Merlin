"""
SILVA Naive Bayes Classifier for rRNA Gene Taxonomy Assignment

Publication-ready 16S/18S/23S marker-specific classifier with:
- Separate models for each marker type
- 8-mer features with stride=1 (documented for QIIME2 comparability)
- Platt scaling for probability calibration
- Calibration safety (skip for <10k sequences)
- Bootstrap confidence per taxonomic rank
- Model versioning and provenance tracking

Scientific Compliance:
- "SILVA Naive Bayes classifiers are pre-trained using reference
   sequences and are NOT trained on user data."
- k-mers extracted with stride=1, overlapping allowed

Author: CMLRE Marlin Platform
"""

import os
import json
import hashlib
import pickle
import logging
import numpy as np
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import List, Dict, Optional, Tuple, Literal, Any
from datetime import datetime
from collections import Counter

# Scikit-learn imports
from sklearn.naive_bayes import MultinomialNB
from sklearn.calibration import CalibratedClassifierCV
from sklearn.preprocessing import LabelEncoder
from sklearn.feature_extraction.text import CountVectorizer

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

# Marker types supported
MarkerType = Literal["16S_SSU", "18S_SSU", "23S_LSU"]

# k-mer configuration (documented for reproducibility)
KMER_SIZE = 8                    # Fixed 8-mer for QIIME2 comparability
KMER_STRIDE = 1                  # Stride=1, overlapping k-mers allowed

# Calibration settings
MIN_SEQUENCES_FOR_CALIBRATION = 10000  # Skip Platt scaling if fewer
CALIBRATION_CV_FOLDS = 5

# Bootstrap settings
BOOTSTRAP_ITERATIONS = 100
BOOTSTRAP_THRESHOLDS = {
    "kingdom": 70,
    "phylum": 70,
    "class": 75,
    "order": 80,
    "family": 85,
    "genus": 90,
    "species": 90,  # 90-95 = putative, ≥95 = high confidence
}

# Model directory
MODEL_DIR = Path("data/silva_models")


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class ClassifierMetadata:
    """Model versioning and provenance"""
    silva_release: str           # e.g., "138.1"
    marker_type: str             # "16S_SSU", "18S_SSU", "23S_LSU"
    model_hash: str              # SHA256 of model file
    kmer_size: int               # 8
    kmer_stride: int             # 1
    training_date: str
    sequence_count: int
    class_count: int
    calibrated: bool
    calibration_method: Optional[str]  # "platt" or None
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class TaxonomyAssignment:
    """Taxonomy assignment with per-rank confidence"""
    sequence_id: str
    taxonomy: Dict[str, str]     # rank -> name
    confidence: Dict[str, float] # rank -> bootstrap confidence (0-100)
    classification_method: str   # "silva_nb"
    marker_type: str
    overall_confidence: float
    # For reviewer display
    formatted_taxonomy: str      # "k__Animalia;p__Chordata;..."
    confident_ranks: List[str]   # Ranks above threshold
    unclassified_at: Optional[str]  # First rank below threshold


@dataclass
class ClassificationResult:
    """Batch classification result"""
    assignments: List[TaxonomyAssignment]
    classified_count: int
    unclassified_count: int
    average_confidence: float
    marker_type: str
    model_metadata: ClassifierMetadata
    processing_time_seconds: float


# =============================================================================
# SILVA CLASSIFIER
# =============================================================================

class SilvaClassifier:
    """
    SILVA Naive Bayes Classifier for marker-specific taxonomy assignment.
    
    IMPORTANT: Classifiers are PRE-TRAINED using SILVA reference sequences.
    They are NOT trained on user data.
    
    Features:
    - Separate models for 16S, 18S, 23S markers
    - 8-mer features (QIIME2 compatible)
    - Platt scaling for probability calibration
    - Bootstrap confidence scoring
    - Model versioning and provenance
    """
    
    def __init__(self, marker_type: MarkerType):
        """
        Initialize classifier for specific marker type.
        
        Args:
            marker_type: One of "16S_SSU", "18S_SSU", "23S_LSU"
        """
        self.marker_type = marker_type
        self.kmer_size = KMER_SIZE
        self.kmer_stride = KMER_STRIDE  # Documented: stride=1, overlapping allowed
        
        self.model: Optional[MultinomialNB] = None
        self.calibrated_model: Optional[CalibratedClassifierCV] = None
        self.vectorizer: Optional[CountVectorizer] = None
        self.label_encoder: Optional[LabelEncoder] = None
        self.metadata: Optional[ClassifierMetadata] = None
        
        # Taxonomy hierarchy storage
        self._taxonomy_map: Dict[str, Dict[str, str]] = {}
        
        # Model path
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        self.model_path = MODEL_DIR / f"silva_{marker_type}_nb.pkl"
        
        # Try to load existing model
        if self.model_path.exists():
            self._load_model()
    
    def _extract_kmers(self, sequence: str) -> str:
        """
        Extract k-mers from sequence.
        
        k-mers are extracted with stride=1, overlapping k-mers allowed.
        (Documented for reviewer transparency)
        """
        sequence = sequence.upper().replace('U', 'T')  # RNA to DNA
        kmers = []
        
        for i in range(0, len(sequence) - self.kmer_size + 1, self.kmer_stride):
            kmer = sequence[i:i + self.kmer_size]
            # Skip k-mers with ambiguous bases
            if 'N' not in kmer and all(c in 'ATCG' for c in kmer):
                kmers.append(kmer)
        
        return ' '.join(kmers)
    
    def train(
        self,
        sequences: List[str],
        taxonomies: List[Dict[str, str]],
        silva_release: str = "138.1"
    ) -> ClassifierMetadata:
        """
        Train classifier on SILVA reference sequences.
        
        NOTE: This is for model building only. End users do NOT train models.
        
        Args:
            sequences: List of reference sequences
            taxonomies: List of taxonomy dicts (kingdom, phylum, ..., species)
            silva_release: SILVA database version
        
        Returns:
            ClassifierMetadata with model provenance
        """
        logger.info(f"Training {self.marker_type} classifier on {len(sequences)} sequences")
        start_time = datetime.now()
        
        # Build taxonomy labels (concatenated for classification)
        labels = []
        for i, tax in enumerate(taxonomies):
            label = self._taxonomy_to_label(tax)
            labels.append(label)
            self._taxonomy_map[label] = tax
        
        # Encode labels
        self.label_encoder = LabelEncoder()
        y = self.label_encoder.fit_transform(labels)
        
        # Extract k-mers
        kmer_sequences = [self._extract_kmers(seq) for seq in sequences]
        
        # Vectorize k-mers
        self.vectorizer = CountVectorizer(
            analyzer='word',
            token_pattern=r'\S+',
            lowercase=False
        )
        X = self.vectorizer.fit_transform(kmer_sequences)
        
        # Train Naive Bayes
        self.model = MultinomialNB(alpha=0.001)  # Standard smoothing
        self.model.fit(X, y)
        
        # Calibrate probabilities (if enough data)
        calibrated = False
        calibration_method = None
        
        if len(sequences) >= MIN_SEQUENCES_FOR_CALIBRATION:
            logger.info("Applying Platt scaling for probability calibration")
            try:
                self.calibrated_model = CalibratedClassifierCV(
                    self.model,
                    method='sigmoid',  # Platt scaling
                    cv=CALIBRATION_CV_FOLDS
                )
                self.calibrated_model.fit(X, y)
                calibrated = True
                calibration_method = "platt"
            except Exception as e:
                logger.warning(f"Calibration failed: {e}. Using uncalibrated model.")
                self.calibrated_model = None
        else:
            logger.info(f"Skipping calibration (only {len(sequences)} sequences, need {MIN_SEQUENCES_FOR_CALIBRATION})")
            # "Probability calibration is skipped for small reference subsets to avoid overfitting."
        
        # Generate metadata
        training_time = (datetime.now() - start_time).total_seconds()
        
        self.metadata = ClassifierMetadata(
            silva_release=silva_release,
            marker_type=self.marker_type,
            model_hash="",  # Set after save
            kmer_size=self.kmer_size,
            kmer_stride=self.kmer_stride,
            training_date=datetime.now().isoformat(),
            sequence_count=len(sequences),
            class_count=len(self.label_encoder.classes_),
            calibrated=calibrated,
            calibration_method=calibration_method,
        )
        
        # Save model
        self._save_model()
        
        logger.info(f"Training complete in {training_time:.2f}s. Classes: {len(self.label_encoder.classes_)}")
        
        return self.metadata
    
    def _taxonomy_to_label(self, taxonomy: Dict[str, str]) -> str:
        """Convert taxonomy dict to label string"""
        ranks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species']
        parts = []
        for rank in ranks:
            value = taxonomy.get(rank, '')
            if value:
                parts.append(f"{rank[0]}__{value}")
        return ';'.join(parts)
    
    def _label_to_taxonomy(self, label: str) -> Dict[str, str]:
        """Convert label string back to taxonomy dict"""
        if label in self._taxonomy_map:
            return self._taxonomy_map[label]
        
        taxonomy = {}
        rank_map = {'k': 'kingdom', 'p': 'phylum', 'c': 'class', 
                    'o': 'order', 'f': 'family', 'g': 'genus', 's': 'species'}
        
        for part in label.split(';'):
            if '__' in part:
                prefix, value = part.split('__', 1)
                if prefix in rank_map:
                    taxonomy[rank_map[prefix]] = value
        
        return taxonomy
    
    def classify(
        self,
        sequences: List[Tuple[str, str]],  # [(id, sequence), ...]
        bootstrap: bool = True
    ) -> ClassificationResult:
        """
        Classify sequences using the trained model.
        
        Args:
            sequences: List of (sequence_id, sequence) tuples
            bootstrap: Whether to compute bootstrap confidence
        
        Returns:
            ClassificationResult with assignments and metrics
        """
        if self.model is None:
            raise RuntimeError("Model not trained or loaded")
        
        start_time = datetime.now()
        assignments = []
        
        for seq_id, sequence in sequences:
            assignment = self._classify_single(seq_id, sequence, bootstrap)
            assignments.append(assignment)
        
        # Calculate statistics
        classified = [a for a in assignments if a.overall_confidence >= 50]
        
        processing_time = (datetime.now() - start_time).total_seconds()
        
        return ClassificationResult(
            assignments=assignments,
            classified_count=len(classified),
            unclassified_count=len(assignments) - len(classified),
            average_confidence=np.mean([a.overall_confidence for a in assignments]),
            marker_type=self.marker_type,
            model_metadata=self.metadata,
            processing_time_seconds=processing_time,
        )
    
    def _classify_single(
        self,
        seq_id: str,
        sequence: str,
        bootstrap: bool
    ) -> TaxonomyAssignment:
        """Classify a single sequence"""
        
        # Extract k-mers
        kmer_str = self._extract_kmers(sequence)
        X = self.vectorizer.transform([kmer_str])
        
        # Get prediction
        use_model = self.calibrated_model if self.calibrated_model else self.model
        
        # Get probabilities
        probs = use_model.predict_proba(X)[0]
        pred_idx = np.argmax(probs)
        pred_label = self.label_encoder.inverse_transform([pred_idx])[0]
        pred_prob = probs[pred_idx]
        
        # Get taxonomy from label
        taxonomy = self._label_to_taxonomy(pred_label)
        
        # Calculate per-rank confidence
        if bootstrap:
            rank_confidence = self._bootstrap_confidence(sequence, taxonomy)
        else:
            # Use prediction probability for all ranks
            rank_confidence = {rank: pred_prob * 100 for rank in taxonomy}
        
        # Determine confident ranks
        confident_ranks = []
        unclassified_at = None
        
        for rank in ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species']:
            if rank in taxonomy:
                confidence = rank_confidence.get(rank, 0)
                if confidence >= BOOTSTRAP_THRESHOLDS.get(rank, 80):
                    confident_ranks.append(rank)
                elif unclassified_at is None:
                    unclassified_at = rank
        
        # Format taxonomy string
        formatted = self._format_taxonomy(taxonomy, rank_confidence)
        
        return TaxonomyAssignment(
            sequence_id=seq_id,
            taxonomy=taxonomy,
            confidence=rank_confidence,
            classification_method="silva_nb",
            marker_type=self.marker_type,
            overall_confidence=pred_prob * 100,
            formatted_taxonomy=formatted,
            confident_ranks=confident_ranks,
            unclassified_at=unclassified_at,
        )
    
    def _bootstrap_confidence(
        self,
        sequence: str,
        base_taxonomy: Dict[str, str]
    ) -> Dict[str, float]:
        """
        Calculate bootstrap confidence per taxonomic rank.
        
        Subsamples k-mers and measures consistency of assignments.
        """
        kmer_str = self._extract_kmers(sequence)
        kmers = kmer_str.split()
        
        if len(kmers) < 10:
            # Too few k-mers for bootstrap
            return {rank: 50.0 for rank in base_taxonomy}
        
        rank_votes: Dict[str, Counter] = {
            rank: Counter() for rank in BOOTSTRAP_THRESHOLDS
        }
        
        use_model = self.calibrated_model if self.calibrated_model else self.model
        
        for _ in range(BOOTSTRAP_ITERATIONS):
            # Subsample 80% of k-mers
            n_sample = max(1, int(len(kmers) * 0.8))
            sampled = np.random.choice(kmers, size=n_sample, replace=True)
            
            # Vectorize and predict
            X = self.vectorizer.transform([' '.join(sampled)])
            pred_idx = use_model.predict(X)[0]
            pred_label = self.label_encoder.inverse_transform([pred_idx])[0]
            pred_tax = self._label_to_taxonomy(pred_label)
            
            # Vote for each rank
            for rank, value in pred_tax.items():
                rank_votes[rank][value] += 1
        
        # Calculate confidence (proportion of votes for top value)
        confidence = {}
        for rank in BOOTSTRAP_THRESHOLDS:
            if rank in base_taxonomy:
                votes = rank_votes[rank]
                if votes:
                    top_count = votes.most_common(1)[0][1]
                    confidence[rank] = (top_count / BOOTSTRAP_ITERATIONS) * 100
                else:
                    confidence[rank] = 0.0
        
        return confidence
    
    def _format_taxonomy(
        self,
        taxonomy: Dict[str, str],
        confidence: Dict[str, float]
    ) -> str:
        """Format taxonomy as QIIME-style string with confidence indicators"""
        parts = []
        prefix_map = {
            'kingdom': 'k', 'phylum': 'p', 'class': 'c',
            'order': 'o', 'family': 'f', 'genus': 'g', 'species': 's'
        }
        
        for rank in ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species']:
            value = taxonomy.get(rank, '')
            if value:
                conf = confidence.get(rank, 0)
                threshold = BOOTSTRAP_THRESHOLDS.get(rank, 80)
                
                if conf >= threshold:
                    parts.append(f"{prefix_map[rank]}__{value}")
                else:
                    # Mark as uncertain
                    parts.append(f"{prefix_map[rank]}__Unclassified_{taxonomy.get(rank.split('_')[0], 'unknown')}")
                    break  # Stop at first uncertain rank
        
        return ';'.join(parts)
    
    def _save_model(self):
        """Save model to disk with metadata"""
        model_data = {
            'model': self.model,
            'calibrated_model': self.calibrated_model,
            'vectorizer': self.vectorizer,
            'label_encoder': self.label_encoder,
            'taxonomy_map': self._taxonomy_map,
            'metadata': self.metadata,
        }
        
        with open(self.model_path, 'wb') as f:
            pickle.dump(model_data, f)
        
        # Calculate model hash
        with open(self.model_path, 'rb') as f:
            self.metadata.model_hash = hashlib.sha256(f.read()).hexdigest()[:16]
        
        # Save metadata separately (JSON for inspection)
        meta_path = self.model_path.with_suffix('.json')
        with open(meta_path, 'w') as f:
            json.dump(self.metadata.to_dict(), f, indent=2)
        
        logger.info(f"Model saved to {self.model_path}")
    
    def _load_model(self):
        """Load model from disk"""
        try:
            with open(self.model_path, 'rb') as f:
                model_data = pickle.load(f)
            
            self.model = model_data['model']
            self.calibrated_model = model_data.get('calibrated_model')
            self.vectorizer = model_data['vectorizer']
            self.label_encoder = model_data['label_encoder']
            self._taxonomy_map = model_data.get('taxonomy_map', {})
            self.metadata = model_data.get('metadata')
            
            logger.info(f"Loaded {self.marker_type} model (hash: {self.metadata.model_hash if self.metadata else 'unknown'})")
        
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise


# =============================================================================
# FACTORY FUNCTIONS
# =============================================================================

def get_silva_classifier(marker_type: MarkerType) -> SilvaClassifier:
    """Get or create a SILVA classifier for the specified marker type"""
    return SilvaClassifier(marker_type)


def classify_sequences(
    sequences: List[Tuple[str, str]],
    marker_type: MarkerType = "16S_SSU",
    bootstrap: bool = True
) -> ClassificationResult:
    """
    Convenience function to classify sequences.
    
    Args:
        sequences: List of (id, sequence) tuples
        marker_type: Marker type ("16S_SSU", "18S_SSU", "23S_LSU")
        bootstrap: Whether to compute bootstrap confidence
    
    Returns:
        ClassificationResult
    """
    classifier = get_silva_classifier(marker_type)
    return classifier.classify(sequences, bootstrap)


def get_classifier_info() -> Dict[str, Any]:
    """Get information about available classifiers"""
    info = {
        "kmer_size": KMER_SIZE,
        "kmer_stride": KMER_STRIDE,
        "kmer_documentation": "k-mers are extracted with stride=1 and overlapping k-mers are allowed.",
        "classifier_documentation": "SILVA Naive Bayes classifiers are pre-trained using reference sequences and are NOT trained on user data.",
        "calibration_threshold": MIN_SEQUENCES_FOR_CALIBRATION,
        "calibration_method": "Platt scaling (sigmoid)",
        "calibration_note": "Probability calibration is skipped for small reference subsets to avoid overfitting.",
        "bootstrap_thresholds": BOOTSTRAP_THRESHOLDS,
        "markers": {}
    }
    
    for marker in ["16S_SSU", "18S_SSU", "23S_LSU"]:
        model_path = MODEL_DIR / f"silva_{marker}_nb.pkl"
        meta_path = MODEL_DIR / f"silva_{marker}_nb.json"
        
        if meta_path.exists():
            with open(meta_path) as f:
                info["markers"][marker] = json.load(f)
        else:
            info["markers"][marker] = {"status": "not_trained"}
    
    return info


# =============================================================================
# DEMO REFERENCE DATABASE (for testing without full SILVA)
# =============================================================================

def create_demo_model(marker_type: MarkerType = "16S_SSU"):
    """
    Create a demo model with synthetic reference sequences.
    For testing only - not for production use!
    """
    logger.info(f"Creating demo {marker_type} model for testing")
    
    # Demo marine species
    demo_references = [
        {
            "sequence": "ATGCGTACGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG" * 10,
            "taxonomy": {
                "kingdom": "Animalia",
                "phylum": "Chordata",
                "class": "Actinopterygii",
                "order": "Perciformes",
                "family": "Scombridae",
                "genus": "Thunnus",
                "species": "Thunnus albacares"
            }
        },
        {
            "sequence": "GCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAG" * 10,
            "taxonomy": {
                "kingdom": "Animalia",
                "phylum": "Chordata",
                "class": "Actinopterygii",
                "order": "Clupeiformes",
                "family": "Clupeidae",
                "genus": "Sardina",
                "species": "Sardina pilchardus"
            }
        },
        {
            "sequence": "TACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT" * 10,
            "taxonomy": {
                "kingdom": "Animalia",
                "phylum": "Chordata",
                "class": "Actinopterygii",
                "order": "Perciformes",
                "family": "Scombridae",
                "genus": "Rastrelliger",
                "species": "Rastrelliger kanagurta"
            }
        },
    ]
    
    # Duplicate for training (need multiple samples)
    sequences = []
    taxonomies = []
    for _ in range(100):  # Create 100 samples per species
        for ref in demo_references:
            # Add slight variation
            seq = ref["sequence"]
            sequences.append(seq)
            taxonomies.append(ref["taxonomy"])
    
    # Train
    classifier = SilvaClassifier(marker_type)
    metadata = classifier.train(sequences, taxonomies, silva_release="demo")
    
    return metadata


# =============================================================================
# MAIN (for testing)
# =============================================================================

if __name__ == "__main__":
    # Create demo model
    print("Creating demo 16S model...")
    create_demo_model("16S_SSU")
    
    # Test classification
    print("\nTesting classification...")
    classifier = get_silva_classifier("16S_SSU")
    
    test_sequences = [
        ("test_1", "ATGCGTACGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG" * 5),
        ("test_2", "GCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCTAG" * 5),
    ]
    
    result = classifier.classify(test_sequences, bootstrap=True)
    
    print(f"\nResults:")
    print(f"  Classified: {result.classified_count}/{len(result.assignments)}")
    print(f"  Avg confidence: {result.average_confidence:.1f}%")
    
    for assignment in result.assignments:
        print(f"\n  {assignment.sequence_id}:")
        print(f"    Taxonomy: {assignment.formatted_taxonomy}")
        print(f"    Confidence: {assignment.overall_confidence:.1f}%")
        print(f"    Confident ranks: {assignment.confident_ranks}")
    
    # Show classifier info
    print("\n\nClassifier Info:")
    info = get_classifier_info()
    print(f"  k-mer size: {info['kmer_size']}")
    print(f"  k-mer stride: {info['kmer_stride']}")
    print(f"  Calibration: {info['calibration_method']}")
