"""
Environmental Niche Modeling Module

Species Distribution Modeling (SDM) based on environmental variables
for predicting suitable habitats and understanding species-environment relationships.
"""

import numpy as np
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict, field
import json
import logging
from enum import Enum

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Conditional imports
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False

try:
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import cross_val_score, train_test_split
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import roc_auc_score, confusion_matrix, classification_report
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logger.warning("scikit-learn not available. ML features disabled.")

try:
    from scipy import stats
    from scipy.interpolate import griddata
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False


class ModelType(Enum):
    """Available niche modeling algorithms"""
    MAXENT_LIKE = "maxent_like"  # Maximum entropy approximation
    RANDOM_FOREST = "random_forest"
    GRADIENT_BOOSTING = "gradient_boosting"
    LOGISTIC_REGRESSION = "logistic_regression"
    BIOCLIM = "bioclim"  # Envelope model
    ENSEMBLE = "ensemble"


@dataclass
class EnvironmentalLayer:
    """Environmental variable layer for niche modeling"""
    name: str
    values: np.ndarray
    unit: str = ""
    min_val: float = 0.0
    max_val: float = 0.0
    mean_val: float = 0.0
    description: str = ""
    
    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "unit": self.unit,
            "min": self.min_val,
            "max": self.max_val,
            "mean": self.mean_val,
            "description": self.description,
            "shape": list(self.values.shape) if self.values is not None else None
        }


@dataclass
class NicheResult:
    """Results from niche modeling analysis"""
    species: str
    model_type: str
    auc_score: float
    accuracy: float
    environmental_preferences: Dict[str, Dict[str, float]]
    variable_importance: Dict[str, float]
    suitable_range: Dict[str, Dict[str, float]]
    prediction_grid: Optional[np.ndarray] = None
    presence_points: int = 0
    background_points: int = 0
    cross_val_scores: List[float] = field(default_factory=list)
    response_curves: Dict[str, List[Dict[str, float]]] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        result = asdict(self)
        if result.get('prediction_grid') is not None:
            result['prediction_grid'] = None  # Don't serialize large arrays
        return result


@dataclass
class HabitatSuitability:
    """Habitat suitability assessment result"""
    latitude: float
    longitude: float
    suitability_score: float
    environmental_conditions: Dict[str, float]
    limiting_factors: List[str]
    confidence: float
    
    def to_dict(self) -> Dict:
        return asdict(self)


class EnvironmentalNicheModeler:
    """
    Species Distribution Modeling system for marine species.
    
    Supports multiple modeling approaches:
    - BIOCLIM (envelope model)
    - MaxEnt-like (logistic with regularization)
    - Random Forest
    - Gradient Boosting
    - Ensemble methods
    
    Key features:
    - Environmental variable importance ranking
    - Response curve generation
    - Habitat suitability prediction
    - Cross-validation and model evaluation
    - Suitable range estimation
    """
    
    # Default environmental variables for marine species
    DEFAULT_ENV_VARS = [
        'temperature',    # Sea Surface Temperature (°C)
        'salinity',       # Salinity (PSU)
        'depth',          # Depth (m)
        'chlorophyll',    # Chlorophyll-a (mg/m³)
        'dissolved_oxygen',  # DO (mg/L)
        'ph',             # pH
        'current_speed',  # Current speed (m/s)
        'distance_coast', # Distance to coast (km)
    ]
    
    # Typical ranges for marine environmental variables
    ENV_RANGES = {
        'temperature': {'min': -2, 'max': 35, 'unit': '°C'},
        'salinity': {'min': 0, 'max': 45, 'unit': 'PSU'},
        'depth': {'min': 0, 'max': 11000, 'unit': 'm'},
        'chlorophyll': {'min': 0, 'max': 100, 'unit': 'mg/m³'},
        'dissolved_oxygen': {'min': 0, 'max': 15, 'unit': 'mg/L'},
        'ph': {'min': 7.0, 'max': 8.5, 'unit': ''},
        'current_speed': {'min': 0, 'max': 3, 'unit': 'm/s'},
        'distance_coast': {'min': 0, 'max': 5000, 'unit': 'km'},
    }
    
    def __init__(self, random_state: int = 42):
        """Initialize the niche modeler."""
        self.random_state = random_state
        self.scaler = StandardScaler() if SKLEARN_AVAILABLE else None
        self.models = {}
        
    def create_environmental_layer(
        self, 
        name: str, 
        values: np.ndarray,
        unit: str = ""
    ) -> EnvironmentalLayer:
        """Create an environmental layer from data."""
        return EnvironmentalLayer(
            name=name,
            values=values,
            unit=unit or self.ENV_RANGES.get(name, {}).get('unit', ''),
            min_val=float(np.nanmin(values)),
            max_val=float(np.nanmax(values)),
            mean_val=float(np.nanmean(values)),
            description=f"{name} environmental layer"
        )
    
    def prepare_data(
        self,
        occurrences: List[Dict[str, Any]],
        environmental_data: List[Dict[str, Any]],
        env_variables: Optional[List[str]] = None
    ) -> Tuple[np.ndarray, np.ndarray, List[str]]:
        """
        Prepare data for niche modeling.
        
        Args:
            occurrences: List of species occurrence records with lat/lon
            environmental_data: List of environmental measurements with lat/lon
            env_variables: List of environmental variables to use
            
        Returns:
            Tuple of (X features, y labels, feature names)
        """
        env_vars = env_variables or self.DEFAULT_ENV_VARS
        
        # Create DataFrames
        occ_df = pd.DataFrame(occurrences) if PANDAS_AVAILABLE else None
        env_df = pd.DataFrame(environmental_data) if PANDAS_AVAILABLE else None
        
        if occ_df is None or env_df is None:
            raise ValueError("Pandas required for data preparation")
        
        # Presence points - merge with environmental data
        presence_data = pd.merge(
            occ_df,
            env_df,
            on=['latitude', 'longitude'],
            how='inner'
        )
        
        # Generate pseudo-absence (background) points
        n_background = min(len(presence_data) * 2, 10000)
        background_indices = np.random.choice(
            len(env_df), 
            size=n_background, 
            replace=len(env_df) < n_background
        )
        background_data = env_df.iloc[background_indices].copy()
        
        # Filter available variables
        available_vars = [v for v in env_vars if v in presence_data.columns]
        
        if not available_vars:
            raise ValueError("No matching environmental variables found")
        
        # Create feature matrices
        X_presence = presence_data[available_vars].values
        X_background = background_data[available_vars].values
        
        # Combine
        X = np.vstack([X_presence, X_background])
        y = np.array([1] * len(X_presence) + [0] * len(X_background))
        
        # Handle missing values
        mask = ~np.any(np.isnan(X), axis=1)
        X = X[mask]
        y = y[mask]
        
        return X, y, available_vars
    
    def fit_model(
        self,
        X: np.ndarray,
        y: np.ndarray,
        feature_names: List[str],
        species_name: str,
        model_type: ModelType = ModelType.RANDOM_FOREST
    ) -> NicheResult:
        """
        Fit a niche model to the data.
        
        Args:
            X: Feature matrix
            y: Labels (1=presence, 0=background)
            feature_names: Names of environmental variables
            species_name: Name of the species
            model_type: Type of model to fit
            
        Returns:
            NicheResult with model metrics and predictions
        """
        if not SKLEARN_AVAILABLE:
            return NicheResult(
                species=species_name,
                model_type=model_type.value,
                auc_score=0.0,
                accuracy=0.0,
                environmental_preferences={},
                variable_importance={},
                suitable_range={},
                warnings=["scikit-learn not available"]
            )
        
        # Scale features
        X_scaled = self.scaler.fit_transform(X)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X_scaled, y, test_size=0.2, random_state=self.random_state, stratify=y
        )
        
        # Select and fit model
        if model_type == ModelType.RANDOM_FOREST:
            model = RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                random_state=self.random_state,
                n_jobs=-1
            )
        elif model_type == ModelType.GRADIENT_BOOSTING:
            model = GradientBoostingClassifier(
                n_estimators=100,
                max_depth=5,
                random_state=self.random_state
            )
        elif model_type == ModelType.LOGISTIC_REGRESSION or model_type == ModelType.MAXENT_LIKE:
            model = LogisticRegression(
                penalty='l2',
                C=1.0,
                max_iter=1000,
                random_state=self.random_state
            )
        else:
            # Default to Random Forest
            model = RandomForestClassifier(
                n_estimators=100,
                random_state=self.random_state
            )
        
        model.fit(X_train, y_train)
        self.models[species_name] = model
        
        # Evaluate
        y_pred = model.predict(X_test)
        y_prob = model.predict_proba(X_test)[:, 1]
        
        auc = roc_auc_score(y_test, y_prob)
        accuracy = (y_pred == y_test).mean()
        
        # Cross-validation
        cv_scores = cross_val_score(model, X_scaled, y, cv=5, scoring='roc_auc').tolist()
        
        # Variable importance
        if hasattr(model, 'feature_importances_'):
            importance = dict(zip(feature_names, model.feature_importances_.tolist()))
        elif hasattr(model, 'coef_'):
            importance = dict(zip(feature_names, np.abs(model.coef_[0]).tolist()))
        else:
            importance = {f: 1.0/len(feature_names) for f in feature_names}
        
        # Sort by importance
        importance = dict(sorted(importance.items(), key=lambda x: x[1], reverse=True))
        
        # Calculate environmental preferences (from presence data)
        presence_mask = y == 1
        preferences = {}
        suitable_range = {}
        
        for i, var in enumerate(feature_names):
            presence_values = X[presence_mask, i]
            preferences[var] = {
                'mean': float(np.mean(presence_values)),
                'std': float(np.std(presence_values)),
                'median': float(np.median(presence_values)),
                'q25': float(np.percentile(presence_values, 25)),
                'q75': float(np.percentile(presence_values, 75))
            }
            suitable_range[var] = {
                'min': float(np.percentile(presence_values, 5)),
                'max': float(np.percentile(presence_values, 95)),
                'optimal': float(np.mean(presence_values))
            }
        
        # Generate response curves
        response_curves = self._generate_response_curves(
            model, X_scaled, feature_names, X
        )
        
        return NicheResult(
            species=species_name,
            model_type=model_type.value,
            auc_score=auc,
            accuracy=accuracy,
            environmental_preferences=preferences,
            variable_importance=importance,
            suitable_range=suitable_range,
            presence_points=int(presence_mask.sum()),
            background_points=int((~presence_mask).sum()),
            cross_val_scores=cv_scores,
            response_curves=response_curves
        )
    
    def fit_bioclim(
        self,
        X: np.ndarray,
        y: np.ndarray,
        feature_names: List[str],
        species_name: str
    ) -> NicheResult:
        """
        Fit a BIOCLIM envelope model.
        
        BIOCLIM uses percentile-based envelopes to define suitable habitat.
        """
        presence_mask = y == 1
        presence_X = X[presence_mask]
        
        preferences = {}
        suitable_range = {}
        
        for i, var in enumerate(feature_names):
            values = presence_X[:, i]
            values = values[~np.isnan(values)]
            
            if len(values) == 0:
                continue
            
            p5, p25, p50, p75, p95 = np.percentile(values, [5, 25, 50, 75, 95])
            
            preferences[var] = {
                'mean': float(np.mean(values)),
                'std': float(np.std(values)),
                'median': float(p50),
                'q25': float(p25),
                'q75': float(p75)
            }
            
            suitable_range[var] = {
                'min': float(p5),
                'max': float(p95),
                'optimal': float(p50),
                'core_min': float(p25),
                'core_max': float(p75)
            }
        
        # Calculate suitability scores for all points
        scores = self._bioclim_score(X, suitable_range, feature_names)
        
        # Estimate accuracy using envelope classification
        threshold = 0.5
        predictions = (scores >= threshold).astype(int)
        accuracy = (predictions == y).mean()
        
        # Estimate AUC
        auc = 0.5
        if SKLEARN_AVAILABLE:
            try:
                auc = roc_auc_score(y, scores)
            except:
                pass
        
        # Variable importance based on variance reduction
        importance = {}
        for i, var in enumerate(feature_names):
            if var in suitable_range:
                range_width = suitable_range[var]['max'] - suitable_range[var]['min']
                var_range = self.ENV_RANGES.get(var, {'max': 100, 'min': 0})
                full_range = var_range['max'] - var_range['min']
                importance[var] = 1 - (range_width / full_range) if full_range > 0 else 0
        
        importance = dict(sorted(importance.items(), key=lambda x: x[1], reverse=True))
        
        return NicheResult(
            species=species_name,
            model_type=ModelType.BIOCLIM.value,
            auc_score=auc,
            accuracy=accuracy,
            environmental_preferences=preferences,
            variable_importance=importance,
            suitable_range=suitable_range,
            presence_points=int(presence_mask.sum()),
            background_points=int((~presence_mask).sum())
        )
    
    def _bioclim_score(
        self,
        X: np.ndarray,
        suitable_range: Dict[str, Dict[str, float]],
        feature_names: List[str]
    ) -> np.ndarray:
        """Calculate BIOCLIM suitability scores."""
        scores = np.ones(len(X))
        
        for i, var in enumerate(feature_names):
            if var not in suitable_range:
                continue
            
            vmin = suitable_range[var]['min']
            vmax = suitable_range[var]['max']
            optimal = suitable_range[var]['optimal']
            
            values = X[:, i]
            
            # Score based on distance from optimal within range
            var_scores = np.zeros(len(values))
            
            in_range = (values >= vmin) & (values <= vmax)
            
            # Calculate score for in-range values
            dist_from_opt = np.abs(values - optimal)
            max_dist = max(optimal - vmin, vmax - optimal)
            
            if max_dist > 0:
                var_scores[in_range] = 1 - (dist_from_opt[in_range] / max_dist)
            else:
                var_scores[in_range] = 1.0
            
            scores *= var_scores
        
        return scores
    
    def _generate_response_curves(
        self,
        model,
        X_scaled: np.ndarray,
        feature_names: List[str],
        X_original: np.ndarray,
        n_points: int = 50
    ) -> Dict[str, List[Dict[str, float]]]:
        """Generate response curves for each variable."""
        response_curves = {}
        
        for i, var in enumerate(feature_names):
            curve_points = []
            
            # Get range of variable
            var_min = np.min(X_original[:, i])
            var_max = np.max(X_original[:, i])
            var_values = np.linspace(var_min, var_max, n_points)
            
            # Create prediction data with mean values
            mean_values = np.mean(X_scaled, axis=0)
            
            for val in var_values:
                # Scale the value
                scaled_val = (val - np.mean(X_original[:, i])) / (np.std(X_original[:, i]) + 1e-10)
                
                # Create sample with this value
                sample = mean_values.copy()
                sample[i] = scaled_val
                
                # Predict probability
                try:
                    prob = model.predict_proba(sample.reshape(1, -1))[0, 1]
                except:
                    prob = 0.5
                
                curve_points.append({
                    'value': float(val),
                    'probability': float(prob)
                })
            
            response_curves[var] = curve_points
        
        return response_curves
    
    def predict_suitability(
        self,
        species_name: str,
        environmental_conditions: Dict[str, float],
        feature_names: List[str]
    ) -> HabitatSuitability:
        """
        Predict habitat suitability for given environmental conditions.
        
        Args:
            species_name: Name of species (must have fitted model)
            environmental_conditions: Dict of environmental variable values
            feature_names: List of feature names used in training
            
        Returns:
            HabitatSuitability assessment
        """
        if species_name not in self.models:
            return HabitatSuitability(
                latitude=environmental_conditions.get('latitude', 0),
                longitude=environmental_conditions.get('longitude', 0),
                suitability_score=0.0,
                environmental_conditions=environmental_conditions,
                limiting_factors=["Model not fitted for this species"],
                confidence=0.0
            )
        
        model = self.models[species_name]
        
        # Extract feature values
        X = np.array([[environmental_conditions.get(f, 0) for f in feature_names]])
        X_scaled = self.scaler.transform(X)
        
        # Predict
        try:
            prob = model.predict_proba(X_scaled)[0, 1]
            confidence = abs(prob - 0.5) * 2  # Higher when farther from 0.5
        except:
            prob = 0.5
            confidence = 0.0
        
        # Identify limiting factors (variables far from optimal)
        limiting_factors = []
        for f in feature_names:
            val = environmental_conditions.get(f, 0)
            var_range = self.ENV_RANGES.get(f, {})
            if var_range:
                # Simple check: is value outside typical range?
                if val < var_range.get('min', float('-inf')) or val > var_range.get('max', float('inf')):
                    limiting_factors.append(f)
        
        return HabitatSuitability(
            latitude=environmental_conditions.get('latitude', 0),
            longitude=environmental_conditions.get('longitude', 0),
            suitability_score=float(prob),
            environmental_conditions=environmental_conditions,
            limiting_factors=limiting_factors,
            confidence=float(confidence)
        )
    
    def predict_distribution_grid(
        self,
        species_name: str,
        env_grid: Dict[str, np.ndarray],
        feature_names: List[str]
    ) -> np.ndarray:
        """
        Predict species distribution across a grid.
        
        Args:
            species_name: Name of species
            env_grid: Dict mapping variable names to 2D grids
            feature_names: List of feature names
            
        Returns:
            2D array of suitability scores
        """
        if species_name not in self.models:
            raise ValueError(f"No model fitted for {species_name}")
        
        model = self.models[species_name]
        
        # Get grid shape
        first_var = list(env_grid.values())[0]
        shape = first_var.shape
        
        # Flatten and stack features
        X = np.column_stack([
            env_grid.get(f, np.zeros(shape)).flatten()
            for f in feature_names
        ])
        
        # Scale and predict
        X_scaled = self.scaler.transform(X)
        
        try:
            probs = model.predict_proba(X_scaled)[:, 1]
        except:
            probs = np.full(len(X), 0.5)
        
        return probs.reshape(shape)
    
    def compare_niches(
        self,
        species1_result: NicheResult,
        species2_result: NicheResult
    ) -> Dict[str, Any]:
        """
        Compare environmental niches of two species.
        
        Returns:
            Niche overlap and differentiation metrics
        """
        comparison = {
            'species1': species1_result.species,
            'species2': species2_result.species,
            'variable_comparison': {},
            'niche_overlap': 0.0,
            'differentiation': {}
        }
        
        common_vars = set(species1_result.suitable_range.keys()) & set(species2_result.suitable_range.keys())
        
        overlaps = []
        
        for var in common_vars:
            range1 = species1_result.suitable_range[var]
            range2 = species2_result.suitable_range[var]
            
            # Calculate overlap
            overlap_min = max(range1['min'], range2['min'])
            overlap_max = min(range1['max'], range2['max'])
            
            if overlap_max > overlap_min:
                overlap = overlap_max - overlap_min
                union = max(range1['max'], range2['max']) - min(range1['min'], range2['min'])
                overlap_ratio = overlap / union if union > 0 else 0
            else:
                overlap_ratio = 0
            
            overlaps.append(overlap_ratio)
            
            comparison['variable_comparison'][var] = {
                'overlap_ratio': overlap_ratio,
                'species1_range': range1,
                'species2_range': range2,
                'optimal_difference': abs(range1['optimal'] - range2['optimal'])
            }
        
        comparison['niche_overlap'] = np.mean(overlaps) if overlaps else 0
        comparison['differentiation']['overall'] = 1 - comparison['niche_overlap']
        
        return comparison
    
    def get_species_environmental_profile(
        self,
        result: NicheResult
    ) -> Dict[str, Any]:
        """Generate a readable environmental profile for a species."""
        profile = {
            'species': result.species,
            'model_performance': {
                'auc': result.auc_score,
                'accuracy': result.accuracy,
                'cross_validation_mean': np.mean(result.cross_val_scores) if result.cross_val_scores else 0
            },
            'key_variables': [],
            'habitat_description': "",
            'suitable_conditions': {}
        }
        
        # Sort variables by importance
        sorted_vars = sorted(
            result.variable_importance.items(),
            key=lambda x: x[1],
            reverse=True
        )
        
        profile['key_variables'] = [
            {'name': v, 'importance': round(imp, 3)}
            for v, imp in sorted_vars[:5]
        ]
        
        # Generate habitat description
        descriptions = []
        for var, prefs in result.environmental_preferences.items():
            unit = self.ENV_RANGES.get(var, {}).get('unit', '')
            optimal = prefs.get('mean', prefs.get('median', 0))
            range_data = result.suitable_range.get(var, {})
            
            if var == 'temperature':
                if optimal < 15:
                    descriptions.append("cold water")
                elif optimal < 25:
                    descriptions.append("temperate water")
                else:
                    descriptions.append("warm tropical water")
            
            elif var == 'depth':
                if optimal < 50:
                    descriptions.append("shallow coastal")
                elif optimal < 200:
                    descriptions.append("continental shelf")
                elif optimal < 1000:
                    descriptions.append("mesopelagic")
                else:
                    descriptions.append("deep sea")
            
            elif var == 'salinity':
                if optimal < 30:
                    descriptions.append("brackish/estuarine")
                elif optimal > 38:
                    descriptions.append("high salinity")
                else:
                    descriptions.append("normal marine salinity")
            
            profile['suitable_conditions'][var] = {
                'optimal': round(optimal, 2),
                'range': f"{round(range_data.get('min', 0), 2)} - {round(range_data.get('max', 0), 2)} {unit}".strip()
            }
        
        profile['habitat_description'] = f"Prefers {', '.join(descriptions[:3])} habitats" if descriptions else "Generalist species"
        
        return profile


# Example usage
if __name__ == "__main__":
    # Create sample data
    np.random.seed(42)
    
    # Simulated occurrence data for a tropical species
    n_occurrences = 100
    occurrences = [
        {
            'latitude': np.random.uniform(8, 15),
            'longitude': np.random.uniform(70, 80),
            'species': 'Thunnus albacares'
        }
        for _ in range(n_occurrences)
    ]
    
    # Simulated environmental data
    n_env = 500
    environmental_data = [
        {
            'latitude': np.random.uniform(5, 20),
            'longitude': np.random.uniform(65, 85),
            'temperature': np.random.uniform(24, 30),
            'salinity': np.random.uniform(34, 36),
            'depth': np.random.uniform(10, 200),
            'chlorophyll': np.random.uniform(0.1, 2.0),
            'dissolved_oxygen': np.random.uniform(4, 8)
        }
        for _ in range(n_env)
    ]
    
    # Add matching environmental data for occurrences
    for occ in occurrences:
        environmental_data.append({
            'latitude': occ['latitude'],
            'longitude': occ['longitude'],
            'temperature': np.random.uniform(26, 29),  # Preferred range
            'salinity': np.random.uniform(34.5, 35.5),
            'depth': np.random.uniform(20, 100),
            'chlorophyll': np.random.uniform(0.3, 1.5),
            'dissolved_oxygen': np.random.uniform(5, 7)
        })
    
    # Fit model
    modeler = EnvironmentalNicheModeler()
    
    try:
        X, y, features = modeler.prepare_data(
            occurrences,
            environmental_data,
            ['temperature', 'salinity', 'depth', 'chlorophyll', 'dissolved_oxygen']
        )
        
        result = modeler.fit_model(X, y, features, 'Thunnus albacares', ModelType.RANDOM_FOREST)
        
        print(f"Species: {result.species}")
        print(f"AUC Score: {result.auc_score:.3f}")
        print(f"Variable Importance: {result.variable_importance}")
        print(f"Suitable Range: {json.dumps(result.suitable_range, indent=2)}")
        
        # Get profile
        profile = modeler.get_species_environmental_profile(result)
        print(f"\nHabitat Description: {profile['habitat_description']}")
        
    except Exception as e:
        print(f"Error: {e}")
