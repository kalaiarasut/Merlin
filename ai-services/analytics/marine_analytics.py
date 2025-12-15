"""
Cross-Domain Analytics Module

Statistical correlation and analysis across marine data domains
"""

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from typing import Dict, List, Tuple
import json

class MarineAnalytics:
    def __init__(self):
        self.scaler = StandardScaler()
    
    def correlate_oceanography_biodiversity(
        self,
        ocean_data: pd.DataFrame,
        biodiversity_data: pd.DataFrame
    ) -> Dict:
        """
        Analyze correlation between oceanographic parameters and biodiversity
        
        Args:
            ocean_data: DataFrame with columns [location, temperature, salinity, chlorophyll, ...]
            biodiversity_data: DataFrame with columns [location, species_richness, abundance, ...]
            
        Returns:
            Dictionary with correlation results
        """
        # Merge datasets on location
        merged = pd.merge(
            ocean_data,
            biodiversity_data,
            on='location',
            how='inner'
        )
        
        # Calculate correlations
        correlations = {}
        ocean_params = ['temperature', 'salinity', 'chlorophyll', 'dissolved_oxygen']
        bio_params = ['species_richness', 'abundance', 'diversity_index']
        
        for ocean_param in ocean_params:
            if ocean_param not in merged.columns:
                continue
            
            for bio_param in bio_params:
                if bio_param not in merged.columns:
                    continue
                
                # Pearson correlation
                corr, p_value = stats.pearsonr(
                    merged[ocean_param].dropna(),
                    merged[bio_param].dropna()
                )
                
                key = f"{ocean_param}_vs_{bio_param}"
                correlations[key] = {
                    "correlation": float(corr),
                    "p_value": float(p_value),
                    "significant": p_value < 0.05
                }
        
        return {
            "correlations": correlations,
            "sample_size": len(merged),
            "method": "Pearson"
        }
    
    def analyze_species_environment_relationship(
        self,
        species_occurrences: List[Dict],
        environmental_data: List[Dict]
    ) -> Dict:
        """
        Analyze relationship between species distribution and environmental factors
        
        Args:
            species_occurrences: List of occurrence records
            environmental_data: List of environmental measurements
            
        Returns:
            Analysis results
        """
        # Create DataFrames
        occ_df = pd.DataFrame(species_occurrences)
        env_df = pd.DataFrame(environmental_data)
        
        # Spatial join (simplified - assumes matching locations)
        merged = pd.merge(
            occ_df,
            env_df,
            on=['latitude', 'longitude'],
            how='inner'
        )
        
        # Group by species
        results = {}
        
        for species in merged['species'].unique():
            species_data = merged[merged['species'] == species]
            
            # Calculate environmental preferences
            env_params = ['temperature', 'salinity', 'depth']
            preferences = {}
            
            for param in env_params:
                if param in species_data.columns:
                    preferences[param] = {
                        "mean": float(species_data[param].mean()),
                        "std": float(species_data[param].std()),
                        "min": float(species_data[param].min()),
                        "max": float(species_data[param].max())
                    }
            
            results[species] = {
                "occurrences": len(species_data),
                "environmental_preferences": preferences
            }
        
        return results
    
    def temporal_trend_analysis(
        self,
        time_series_data: pd.DataFrame,
        parameter: str
    ) -> Dict:
        """
        Analyze temporal trends in marine parameters
        
        Args:
            time_series_data: DataFrame with 'date' and parameter columns
            parameter: Parameter to analyze
            
        Returns:
            Trend analysis results
        """
        if 'date' not in time_series_data.columns or parameter not in time_series_data.columns:
            return {"error": "Missing required columns"}
        
        # Convert date to datetime
        time_series_data['date'] = pd.to_datetime(time_series_data['date'])
        time_series_data = time_series_data.sort_values('date')
        
        # Calculate trend
        x = np.arange(len(time_series_data))
        y = time_series_data[parameter].values
        
        slope, intercept, r_value, p_value, std_err = stats.linregress(x, y)
        
        # Seasonal decomposition (simplified)
        # In production, use statsmodels seasonal_decompose
        
        return {
            "parameter": parameter,
            "trend": {
                "slope": float(slope),
                "r_squared": float(r_value ** 2),
                "p_value": float(p_value),
                "trend_direction": "increasing" if slope > 0 else "decreasing",
                "significant": p_value < 0.05
            },
            "statistics": {
                "mean": float(y.mean()),
                "std": float(y.std()),
                "min": float(y.min()),
                "max": float(y.max())
            }
        }
    
    def spatial_clustering(
        self,
        locations: List[Tuple[float, float]],
        n_clusters: int = 5
    ) -> Dict:
        """
        Perform spatial clustering of sampling locations
        
        Args:
            locations: List of (latitude, longitude) tuples
            n_clusters: Number of clusters
            
        Returns:
            Clustering results
        """
        from sklearn.cluster import KMeans
        
        locations_array = np.array(locations)
        
        # Perform K-means clustering
        kmeans = KMeans(n_clusters=n_clusters, random_state=42)
        labels = kmeans.fit_predict(locations_array)
        
        # Calculate cluster statistics
        clusters = {}
        for i in range(n_clusters):
            cluster_points = locations_array[labels == i]
            clusters[f"cluster_{i}"] = {
                "center": kmeans.cluster_centers_[i].tolist(),
                "size": int((labels == i).sum()),
                "bounds": {
                    "lat_min": float(cluster_points[:, 0].min()),
                    "lat_max": float(cluster_points[:, 0].max()),
                    "lon_min": float(cluster_points[:, 1].min()),
                    "lon_max": float(cluster_points[:, 1].max())
                }
            }
        
        return {
            "n_clusters": n_clusters,
            "clusters": clusters,
            "total_points": len(locations)
        }
    
    def diversity_indices(
        self,
        species_abundances: Dict[str, int]
    ) -> Dict:
        """
        Calculate biodiversity indices
        
        Args:
            species_abundances: Dictionary of {species: abundance}
            
        Returns:
            Diversity indices
        """
        abundances = np.array(list(species_abundances.values()))
        total = abundances.sum()
        proportions = abundances / total
        
        # Shannon diversity
        shannon = -np.sum(proportions * np.log(proportions + 1e-10))
        
        # Simpson diversity
        simpson = 1 - np.sum(proportions ** 2)
        
        # Species richness
        richness = len(species_abundances)
        
        # Evenness
        evenness = shannon / np.log(richness) if richness > 1 else 0
        
        return {
            "species_richness": richness,
            "shannon_index": float(shannon),
            "simpson_index": float(simpson),
            "evenness": float(evenness),
            "total_abundance": int(total)
        }

# Example usage
if __name__ == "__main__":
    analytics = MarineAnalytics()
    
    # Example: Calculate diversity indices
    # species_data = {"Species A": 50, "Species B": 30, "Species C": 20}
    # indices = analytics.diversity_indices(species_data)
    # print(json.dumps(indices, indent=2))
