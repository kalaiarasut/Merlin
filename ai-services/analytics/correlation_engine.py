"""
Correlation Engine Module

Cross-domain correlation analysis for marine research datasets.
Finds relationships between species, oceanography, eDNA, and other data.
"""

import math
import logging
from typing import Dict, Any, List, Optional, Tuple, Union
from dataclasses import dataclass, field
from collections import defaultdict
from datetime import datetime, timedelta
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import scientific libraries
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    logger.warning("NumPy not available. Using pure Python implementations.")

try:
    from scipy import stats
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False
    logger.warning("SciPy not available. Some statistical tests will be limited.")


@dataclass
class CorrelationResult:
    """Result of a correlation analysis"""
    variable1: str
    variable2: str
    correlation: float
    p_value: float
    method: str
    n_samples: int
    confidence_interval: Optional[Tuple[float, float]] = None
    interpretation: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "variable1": self.variable1,
            "variable2": self.variable2,
            "correlation": round(self.correlation, 4),
            "p_value": round(self.p_value, 6),
            "method": self.method,
            "n_samples": self.n_samples,
            "confidence_interval": self.confidence_interval,
            "interpretation": self.interpretation,
            "significant": self.p_value < 0.05
        }


@dataclass
class CrossDomainInsight:
    """An insight from cross-domain analysis"""
    title: str
    description: str
    domains: List[str]
    evidence: List[Dict[str, Any]]
    confidence: float
    actionable: bool = False
    recommendation: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "description": self.description,
            "domains": self.domains,
            "evidence": self.evidence,
            "confidence": round(self.confidence, 2),
            "actionable": self.actionable,
            "recommendation": self.recommendation
        }


class CorrelationEngine:
    """
    Cross-domain correlation analysis engine.
    
    Analyzes relationships between:
    - Species occurrence ↔ Environmental parameters
    - Temperature ↔ Species abundance
    - Depth ↔ Community composition
    - eDNA detections ↔ Traditional surveys
    - Temporal trends across domains
    """
    
    # Variable categories for cross-domain analysis
    DOMAIN_VARIABLES = {
        'oceanography': [
            'temperature', 'salinity', 'depth', 'dissolved_oxygen',
            'chlorophyll', 'ph', 'turbidity', 'current_speed'
        ],
        'species': [
            'abundance', 'occurrence', 'richness', 'diversity',
            'biomass', 'density'
        ],
        'edna': [
            'read_count', 'detection_confidence', 'sequence_quality',
            'species_richness', 'otu_count'
        ],
        'spatial': [
            'latitude', 'longitude', 'distance_from_coast', 'bathymetry'
        ],
        'temporal': [
            'year', 'month', 'season', 'day_of_year'
        ]
    }
    
    def __init__(self):
        """Initialize the correlation engine."""
        pass
    
    def analyze(
        self,
        data: Dict[str, Any],
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Perform cross-domain correlation analysis.
        
        Args:
            data: Dictionary with domain data:
                - oceanography: List of oceanographic records
                - species: List of species occurrence records
                - edna: List of eDNA detection records
                - Or a unified dataset with mixed fields
            options:
                - method: 'pearson', 'spearman', 'kendall' (default: 'pearson')
                - min_samples: Minimum samples for correlation (default: 10)
                - p_threshold: P-value threshold for significance (default: 0.05)
                - analyze_temporal: Include temporal analysis (default: True)
                - spatial_join: Join datasets spatially (default: True)
                
        Returns:
            Analysis results with correlations, insights, and visualizations
        """
        options = options or {}
        method = options.get('method', 'pearson')
        min_samples = options.get('min_samples', 10)
        p_threshold = options.get('p_threshold', 0.05)
        analyze_temporal = options.get('analyze_temporal', True)
        
        # Prepare unified dataset
        unified_data = self._prepare_data(data)
        
        if len(unified_data) < min_samples:
            return {
                "correlations": [],
                "p_values": {},
                "insights": [],
                "visualizations": [],
                "warnings": [f"Insufficient data: {len(unified_data)} records (minimum: {min_samples})"]
            }
        
        # Extract numeric columns
        numeric_columns = self._get_numeric_columns(unified_data)
        
        if len(numeric_columns) < 2:
            return {
                "correlations": [],
                "p_values": {},
                "insights": [],
                "visualizations": [],
                "warnings": ["Insufficient numeric variables for correlation analysis"]
            }
        
        # Calculate correlations
        correlations = self._calculate_all_correlations(
            unified_data, numeric_columns, method, min_samples
        )
        
        # Filter significant correlations
        significant = [c for c in correlations if c.p_value < p_threshold]
        
        # Generate insights
        insights = self._generate_insights(significant, unified_data)
        
        # Temporal analysis
        temporal_results = {}
        if analyze_temporal:
            temporal_results = self._analyze_temporal(unified_data, numeric_columns)
        
        # Generate visualization configs
        visualizations = self._generate_visualizations(correlations, unified_data)
        
        # Build correlation matrix
        correlation_matrix = self._build_correlation_matrix(correlations, numeric_columns)
        
        return {
            "correlations": [c.to_dict() for c in significant],
            "all_correlations": [c.to_dict() for c in correlations],
            "correlation_matrix": correlation_matrix,
            "p_values": {f"{c.variable1}_vs_{c.variable2}": c.p_value for c in correlations},
            "insights": [i.to_dict() for i in insights],
            "temporal_analysis": temporal_results,
            "visualizations": visualizations,
            "summary": {
                "total_correlations": len(correlations),
                "significant_correlations": len(significant),
                "variables_analyzed": len(numeric_columns),
                "records_analyzed": len(unified_data),
                "method": method
            }
        }
    
    def _prepare_data(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Prepare and merge data from different domains."""
        # If data is a list, use directly
        if isinstance(data, list):
            return data
        
        # If data has domain keys, try to join
        if any(key in data for key in ['oceanography', 'species', 'edna', 'records']):
            return self._spatial_temporal_join(data)
        
        # If data has a 'data' key with list
        if 'data' in data and isinstance(data['data'], list):
            return data['data']
        
        return []
    
    def _spatial_temporal_join(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Join datasets based on spatial and temporal proximity."""
        unified = []
        
        # Get all datasets
        ocean_data = data.get('oceanography', [])
        species_data = data.get('species', [])
        edna_data = data.get('edna', [])
        records = data.get('records', [])
        
        # If we have records directly, use them
        if records:
            unified.extend(records)
        
        # Create spatial-temporal index for ocean data
        ocean_index = {}
        for rec in ocean_data:
            key = self._get_spatial_temporal_key(rec)
            if key:
                ocean_index[key] = rec
        
        # Join species data with oceanography
        for rec in species_data:
            key = self._get_spatial_temporal_key(rec)
            merged = rec.copy()
            
            if key and key in ocean_index:
                # Exact match
                ocean_rec = ocean_index[key]
                merged.update({
                    k: v for k, v in ocean_rec.items()
                    if k not in merged and k not in ['id', '_id']
                })
            else:
                # Find nearest
                nearest = self._find_nearest(rec, ocean_data)
                if nearest:
                    merged.update({
                        k: v for k, v in nearest.items()
                        if k not in merged and k not in ['id', '_id']
                    })
            
            unified.append(merged)
        
        # Join eDNA data similarly
        for rec in edna_data:
            key = self._get_spatial_temporal_key(rec)
            merged = rec.copy()
            
            if key and key in ocean_index:
                ocean_rec = ocean_index[key]
                merged.update({
                    k: v for k, v in ocean_rec.items()
                    if k not in merged and k not in ['id', '_id']
                })
            
            unified.append(merged)
        
        return unified
    
    def _get_spatial_temporal_key(
        self, 
        record: Dict[str, Any],
        lat_precision: int = 1,
        date_precision: str = 'day'
    ) -> Optional[str]:
        """Generate a spatial-temporal key for a record."""
        lat = record.get('latitude')
        lon = record.get('longitude')
        date = record.get('eventDate') or record.get('date')
        
        if lat is None or lon is None:
            return None
        
        # Round coordinates
        lat_key = round(float(lat), lat_precision)
        lon_key = round(float(lon), lat_precision)
        
        # Parse date
        date_key = ''
        if date:
            if isinstance(date, str):
                date_key = date[:10]  # YYYY-MM-DD
            elif isinstance(date, datetime):
                date_key = date.strftime('%Y-%m-%d')
        
        return f"{lat_key}_{lon_key}_{date_key}"
    
    def _find_nearest(
        self,
        record: Dict[str, Any],
        candidates: List[Dict[str, Any]],
        max_distance_km: float = 50
    ) -> Optional[Dict[str, Any]]:
        """Find nearest record spatially."""
        lat1 = record.get('latitude')
        lon1 = record.get('longitude')
        
        if lat1 is None or lon1 is None:
            return None
        
        nearest = None
        min_dist = float('inf')
        
        for candidate in candidates:
            lat2 = candidate.get('latitude')
            lon2 = candidate.get('longitude')
            
            if lat2 is None or lon2 is None:
                continue
            
            dist = self._haversine_distance(lat1, lon1, lat2, lon2)
            if dist < min_dist and dist <= max_distance_km:
                min_dist = dist
                nearest = candidate
        
        return nearest
    
    def _haversine_distance(
        self,
        lat1: float, lon1: float,
        lat2: float, lon2: float
    ) -> float:
        """Calculate haversine distance in km."""
        R = 6371  # Earth's radius in km
        
        lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
        
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.asin(math.sqrt(a))
        
        return R * c
    
    def _get_numeric_columns(self, data: List[Dict[str, Any]]) -> List[str]:
        """Identify numeric columns in the data."""
        if not data:
            return []
        
        numeric_cols = set()
        
        for record in data[:100]:  # Sample first 100 records
            for key, value in record.items():
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    numeric_cols.add(key)
        
        # Exclude ID fields
        exclude = {'id', '_id', 'index'}
        return [c for c in numeric_cols if c.lower() not in exclude]
    
    def _calculate_all_correlations(
        self,
        data: List[Dict[str, Any]],
        columns: List[str],
        method: str,
        min_samples: int
    ) -> List[CorrelationResult]:
        """Calculate correlations between all column pairs."""
        results = []
        
        for i, col1 in enumerate(columns):
            for col2 in columns[i+1:]:
                # Extract paired values
                pairs = [
                    (float(r[col1]), float(r[col2]))
                    for r in data
                    if col1 in r and col2 in r
                    and r[col1] is not None and r[col2] is not None
                    and not (isinstance(r[col1], str) or isinstance(r[col2], str))
                ]
                
                if len(pairs) < min_samples:
                    continue
                
                x = [p[0] for p in pairs]
                y = [p[1] for p in pairs]
                
                # Calculate correlation
                corr, p_value = self._calculate_correlation(x, y, method)
                
                # Interpret
                interpretation = self._interpret_correlation(corr, p_value, col1, col2)
                
                results.append(CorrelationResult(
                    variable1=col1,
                    variable2=col2,
                    correlation=corr,
                    p_value=p_value,
                    method=method,
                    n_samples=len(pairs),
                    interpretation=interpretation
                ))
        
        return results
    
    def _calculate_correlation(
        self,
        x: List[float],
        y: List[float],
        method: str
    ) -> Tuple[float, float]:
        """Calculate correlation coefficient and p-value."""
        n = len(x)
        
        if SCIPY_AVAILABLE:
            if method == 'spearman':
                corr, p_value = stats.spearmanr(x, y)
            elif method == 'kendall':
                corr, p_value = stats.kendalltau(x, y)
            else:  # pearson
                corr, p_value = stats.pearsonr(x, y)
            return float(corr), float(p_value)
        
        # Pure Python Pearson correlation
        mean_x = sum(x) / n
        mean_y = sum(y) / n
        
        cov = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(x, y))
        std_x = math.sqrt(sum((xi - mean_x)**2 for xi in x))
        std_y = math.sqrt(sum((yi - mean_y)**2 for yi in y))
        
        if std_x == 0 or std_y == 0:
            return 0.0, 1.0
        
        corr = cov / (std_x * std_y)
        
        # Approximate p-value using t-distribution
        if abs(corr) >= 1:
            p_value = 0.0
        else:
            t_stat = corr * math.sqrt((n - 2) / (1 - corr**2))
            # Approximate two-tailed p-value
            p_value = 2 * (1 - self._t_cdf(abs(t_stat), n - 2))
        
        return corr, p_value
    
    def _t_cdf(self, t: float, df: int) -> float:
        """Approximate t-distribution CDF."""
        # Using approximation for large df
        if df > 30:
            # Approximate with normal distribution
            return 0.5 * (1 + math.erf(t / math.sqrt(2)))
        
        # Simple approximation
        x = df / (df + t**2)
        return 1 - 0.5 * (x ** (df / 2))
    
    def _interpret_correlation(
        self,
        corr: float,
        p_value: float,
        var1: str,
        var2: str
    ) -> str:
        """Generate human-readable interpretation."""
        strength = abs(corr)
        direction = "positive" if corr > 0 else "negative"
        
        if strength < 0.1:
            strength_desc = "negligible"
        elif strength < 0.3:
            strength_desc = "weak"
        elif strength < 0.5:
            strength_desc = "moderate"
        elif strength < 0.7:
            strength_desc = "strong"
        else:
            strength_desc = "very strong"
        
        significance = "statistically significant" if p_value < 0.05 else "not statistically significant"
        
        # Domain-specific interpretations
        interp = f"{strength_desc.capitalize()} {direction} correlation ({corr:.3f}, p={p_value:.4f}), {significance}."
        
        # Add marine-specific context
        marine_insights = self._get_marine_context(var1, var2, corr)
        if marine_insights:
            interp += f" {marine_insights}"
        
        return interp
    
    def _get_marine_context(self, var1: str, var2: str, corr: float) -> str:
        """Get marine science context for variable pairs."""
        vars_lower = {var1.lower(), var2.lower()}
        
        # Temperature-related
        if 'temperature' in vars_lower:
            if 'dissolved_oxygen' in vars_lower and corr < 0:
                return "As expected: warmer water holds less dissolved oxygen."
            if 'salinity' in vars_lower:
                return "Temperature-salinity relationship indicates water mass characteristics."
            if any(v in vars_lower for v in ['abundance', 'richness', 'diversity']):
                return "Temperature is a key driver of marine species distribution."
        
        # Depth-related
        if 'depth' in vars_lower:
            if 'temperature' in vars_lower and corr < 0:
                return "Expected thermocline pattern: deeper water is typically colder."
            if 'dissolved_oxygen' in vars_lower:
                return "Depth-oxygen relationship reflects ocean stratification."
        
        # Chlorophyll-related
        if 'chlorophyll' in vars_lower:
            if any(v in vars_lower for v in ['abundance', 'biomass']):
                return "Chlorophyll indicates primary productivity affecting food web."
        
        # Salinity-related
        if 'salinity' in vars_lower:
            if any(v in vars_lower for v in ['species', 'richness']):
                return "Salinity tolerance varies among marine species."
        
        return ""
    
    def _generate_insights(
        self,
        correlations: List[CorrelationResult],
        data: List[Dict[str, Any]]
    ) -> List[CrossDomainInsight]:
        """Generate actionable insights from correlations."""
        insights = []
        
        # Group correlations by domain
        env_vars = {'temperature', 'salinity', 'depth', 'dissolved_oxygen', 'chlorophyll', 'ph'}
        bio_vars = {'abundance', 'richness', 'diversity', 'biomass', 'density'}
        
        # Find environment-biology correlations
        for corr in correlations:
            v1, v2 = corr.variable1.lower(), corr.variable2.lower()
            
            # Strong environment-biology correlation
            if (v1 in env_vars and v2 in bio_vars) or (v2 in env_vars and v1 in bio_vars):
                if abs(corr.correlation) >= 0.5:
                    env_var = v1 if v1 in env_vars else v2
                    bio_var = v1 if v1 in bio_vars else v2
                    
                    direction = "increases" if corr.correlation > 0 else "decreases"
                    
                    insights.append(CrossDomainInsight(
                        title=f"{env_var.capitalize()} strongly influences {bio_var}",
                        description=f"Analysis shows that {bio_var} {direction} significantly with {env_var} (r={corr.correlation:.3f}, p={corr.p_value:.4f}).",
                        domains=['oceanography', 'species'],
                        evidence=[corr.to_dict()],
                        confidence=abs(corr.correlation),
                        actionable=True,
                        recommendation=f"Monitor {env_var} levels when assessing {bio_var}. Consider {env_var} in species distribution models."
                    ))
        
        # Look for multi-variable patterns
        if len(correlations) >= 3:
            # Find variables with multiple strong correlations
            var_corrs = defaultdict(list)
            for c in correlations:
                if abs(c.correlation) >= 0.3:
                    var_corrs[c.variable1].append(c)
                    var_corrs[c.variable2].append(c)
            
            for var, corr_list in var_corrs.items():
                if len(corr_list) >= 2:
                    related = list(set(
                        c.variable1 if c.variable2 == var else c.variable2
                        for c in corr_list
                    ))
                    
                    insights.append(CrossDomainInsight(
                        title=f"{var.capitalize()} is a key variable",
                        description=f"{var.capitalize()} shows significant correlations with multiple variables: {', '.join(related)}.",
                        domains=self._get_domains_for_vars([var] + related),
                        evidence=[c.to_dict() for c in corr_list],
                        confidence=sum(abs(c.correlation) for c in corr_list) / len(corr_list),
                        actionable=True,
                        recommendation=f"Use {var} as a predictor variable in multivariate analyses."
                    ))
        
        # Sort by confidence
        insights.sort(key=lambda x: x.confidence, reverse=True)
        
        return insights[:10]  # Top 10 insights
    
    def _get_domains_for_vars(self, variables: List[str]) -> List[str]:
        """Determine which domains the variables belong to."""
        domains = set()
        
        for var in variables:
            var_lower = var.lower()
            for domain, domain_vars in self.DOMAIN_VARIABLES.items():
                if var_lower in domain_vars or any(dv in var_lower for dv in domain_vars):
                    domains.add(domain)
        
        return list(domains) or ['general']
    
    def _analyze_temporal(
        self,
        data: List[Dict[str, Any]],
        columns: List[str]
    ) -> Dict[str, Any]:
        """Analyze temporal patterns in the data."""
        results = {
            "trends": [],
            "seasonality": [],
            "anomalies": []
        }
        
        # Extract records with dates
        dated_records = []
        for rec in data:
            date = rec.get('eventDate') or rec.get('date')
            if date:
                if isinstance(date, str):
                    try:
                        date = datetime.fromisoformat(date.replace('Z', '+00:00'))
                    except:
                        continue
                dated_records.append({**rec, '_parsed_date': date})
        
        if len(dated_records) < 20:
            results["warnings"] = ["Insufficient temporal data for trend analysis"]
            return results
        
        # Sort by date
        dated_records.sort(key=lambda x: x['_parsed_date'])
        
        # Analyze trends for each numeric variable
        for col in columns[:5]:  # Limit to first 5 columns
            values = [
                (r['_parsed_date'], float(r[col]))
                for r in dated_records
                if col in r and r[col] is not None
            ]
            
            if len(values) < 10:
                continue
            
            # Simple linear trend
            dates_numeric = [(v[0] - values[0][0]).days for v in values]
            vals = [v[1] for v in values]
            
            if max(dates_numeric) > 0:
                # Calculate trend
                mean_x = sum(dates_numeric) / len(dates_numeric)
                mean_y = sum(vals) / len(vals)
                
                cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(dates_numeric, vals))
                var_x = sum((x - mean_x)**2 for x in dates_numeric)
                
                if var_x > 0:
                    slope = cov / var_x
                    trend_direction = "increasing" if slope > 0 else "decreasing"
                    
                    results["trends"].append({
                        "variable": col,
                        "trend": trend_direction,
                        "slope_per_day": slope,
                        "slope_per_year": slope * 365,
                        "n_observations": len(values)
                    })
        
        # Analyze seasonality
        monthly_means = defaultdict(lambda: defaultdict(list))
        for rec in dated_records:
            month = rec['_parsed_date'].month
            for col in columns[:5]:
                if col in rec and rec[col] is not None:
                    try:
                        monthly_means[col][month].append(float(rec[col]))
                    except:
                        pass
        
        for col, months in monthly_means.items():
            if len(months) >= 4:
                seasonal_pattern = {
                    m: sum(v)/len(v) if v else None
                    for m, v in months.items()
                }
                
                # Check for seasonal variation
                values = [v for v in seasonal_pattern.values() if v is not None]
                if values and max(values) > min(values) * 1.2:  # >20% variation
                    results["seasonality"].append({
                        "variable": col,
                        "monthly_means": seasonal_pattern,
                        "peak_month": max(seasonal_pattern, key=lambda m: seasonal_pattern.get(m, 0) or 0),
                        "low_month": min(seasonal_pattern, key=lambda m: seasonal_pattern.get(m, float('inf')) or float('inf'))
                    })
        
        return results
    
    def _generate_visualizations(
        self,
        correlations: List[CorrelationResult],
        data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Generate visualization configurations."""
        visualizations = []
        
        # Correlation heatmap config
        if correlations:
            variables = list(set(
                v for c in correlations for v in [c.variable1, c.variable2]
            ))
            visualizations.append({
                "type": "heatmap",
                "title": "Correlation Matrix",
                "description": "Pairwise correlations between variables",
                "variables": variables,
                "data_key": "correlation_matrix"
            })
        
        # Top scatter plots
        significant = [c for c in correlations if c.p_value < 0.05]
        for corr in significant[:3]:  # Top 3 significant
            visualizations.append({
                "type": "scatter",
                "title": f"{corr.variable1} vs {corr.variable2}",
                "description": corr.interpretation,
                "x_variable": corr.variable1,
                "y_variable": corr.variable2,
                "correlation": corr.correlation
            })
        
        # Time series if temporal data exists
        has_dates = any(
            'eventDate' in r or 'date' in r
            for r in data[:10]
        )
        if has_dates:
            visualizations.append({
                "type": "timeseries",
                "title": "Temporal Trends",
                "description": "Variable changes over time",
                "data_key": "temporal_analysis"
            })
        
        return visualizations
    
    def _build_correlation_matrix(
        self,
        correlations: List[CorrelationResult],
        columns: List[str]
    ) -> Dict[str, Dict[str, float]]:
        """Build a correlation matrix from results."""
        matrix = {col: {col: 1.0} for col in columns}
        
        for corr in correlations:
            if corr.variable1 in matrix and corr.variable2 in matrix:
                matrix[corr.variable1][corr.variable2] = corr.correlation
                matrix[corr.variable2][corr.variable1] = corr.correlation
        
        return matrix


# Convenience function for API
def correlate_data(
    data: Dict[str, Any],
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Perform cross-domain correlation analysis.
    
    Args:
        data: Dictionary with domain data or list of records
        options: Analysis options
        
    Returns:
        Correlation analysis results
    """
    engine = CorrelationEngine()
    return engine.analyze(data, options)
