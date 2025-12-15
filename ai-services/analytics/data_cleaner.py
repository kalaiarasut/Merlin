"""
Data Cleaning Module

AI-powered data cleaning and standardization for marine research datasets.
Handles duplicate detection, format standardization, missing value imputation,
and data quality assessment.
"""

import re
import json
import logging
from typing import Dict, Any, List, Optional, Tuple, Set
from dataclasses import dataclass, field
from datetime import datetime
from collections import Counter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import pandas/numpy for advanced operations
try:
    import pandas as pd
    import numpy as np
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    logger.warning("Pandas not available. Some features will be limited.")


@dataclass
class CleaningResult:
    """Result of a data cleaning operation"""
    field: str
    original_value: Any
    cleaned_value: Any
    action: str
    confidence: float = 1.0
    

@dataclass
class DataQualityReport:
    """Report on data quality"""
    total_records: int = 0
    complete_records: int = 0
    missing_values: Dict[str, int] = field(default_factory=dict)
    duplicates_found: int = 0
    format_errors: Dict[str, int] = field(default_factory=dict)
    quality_score: float = 0.0
    recommendations: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_records": self.total_records,
            "complete_records": self.complete_records,
            "completeness_rate": round(self.complete_records / max(self.total_records, 1) * 100, 2),
            "missing_values": self.missing_values,
            "duplicates_found": self.duplicates_found,
            "format_errors": self.format_errors,
            "quality_score": round(self.quality_score, 2),
            "recommendations": self.recommendations
        }


class DataCleaner:
    """
    Comprehensive data cleaning for marine research datasets.
    
    Features:
    - Duplicate detection (exact and fuzzy)
    - Missing value handling
    - Format standardization (dates, coordinates, species names)
    - Outlier detection
    - Data type inference and correction
    - Marine-specific validations
    """
    
    # Valid ranges for marine data
    VALID_RANGES = {
        'latitude': (-90, 90),
        'longitude': (-180, 180),
        'depth': (0, 11000),  # Mariana Trench
        'temperature': (-2, 40),  # °C
        'salinity': (0, 45),  # PSU
        'ph': (6.5, 9.0),
        'dissolved_oxygen': (0, 20),  # mg/L
        'chlorophyll': (0, 100),  # μg/L
    }
    
    # Common date formats
    DATE_FORMATS = [
        '%Y-%m-%d',
        '%Y/%m/%d',
        '%d-%m-%Y',
        '%d/%m/%Y',
        '%Y-%m-%dT%H:%M:%S',
        '%Y-%m-%dT%H:%M:%SZ',
        '%Y-%m-%d %H:%M:%S',
        '%d %b %Y',
        '%B %d, %Y',
    ]
    
    # Field name standardization
    FIELD_MAPPINGS = {
        # Coordinates
        'lat': 'latitude',
        'latitude': 'latitude',
        'decimallatitude': 'latitude',
        'decimal_latitude': 'latitude',
        'lon': 'longitude',
        'lng': 'longitude',
        'long': 'longitude',
        'longitude': 'longitude',
        'decimallongitude': 'longitude',
        'decimal_longitude': 'longitude',
        
        # Species
        'species': 'scientificName',
        'scientific_name': 'scientificName',
        'scientificname': 'scientificName',
        'taxon': 'scientificName',
        'common_name': 'commonName',
        'commonname': 'commonName',
        'vernacular_name': 'commonName',
        
        # Dates
        'date': 'eventDate',
        'collection_date': 'eventDate',
        'sample_date': 'eventDate',
        'observation_date': 'eventDate',
        'eventdate': 'eventDate',
        
        # Measurements
        'temp': 'temperature',
        'water_temp': 'temperature',
        'sst': 'temperature',
        'sal': 'salinity',
        'do': 'dissolved_oxygen',
        'dissolvedoxygen': 'dissolved_oxygen',
        'chl': 'chlorophyll',
        'chla': 'chlorophyll',
        'chlorophyll_a': 'chlorophyll',
    }
    
    def __init__(self):
        """Initialize the data cleaner."""
        pass
    
    def clean_dataset(
        self,
        data: List[Dict[str, Any]],
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Clean an entire dataset.
        
        Args:
            data: List of records to clean
            options: Cleaning options
                - remove_duplicates: bool (default True)
                - standardize_fields: bool (default True)
                - handle_missing: str ('drop', 'fill', 'flag') (default 'flag')
                - validate_ranges: bool (default True)
                - fix_formats: bool (default True)
        
        Returns:
            Dict with cleaned_data, corrections, warnings, and quality_report
        """
        options = options or {}
        remove_duplicates = options.get('remove_duplicates', True)
        standardize_fields = options.get('standardize_fields', True)
        handle_missing = options.get('handle_missing', 'flag')
        validate_ranges = options.get('validate_ranges', True)
        fix_formats = options.get('fix_formats', True)
        
        if not data:
            return {
                "cleaned_data": [],
                "corrections": [],
                "warnings": ["Empty dataset provided"],
                "quality_report": DataQualityReport().to_dict()
            }
        
        corrections: List[Dict[str, Any]] = []
        warnings: List[str] = []
        cleaned_data: List[Dict[str, Any]] = []
        
        # Step 1: Standardize field names
        if standardize_fields:
            data = self._standardize_field_names(data, corrections)
        
        # Step 2: Remove exact duplicates
        duplicate_count = 0
        if remove_duplicates:
            data, duplicate_count = self._remove_duplicates(data)
            if duplicate_count > 0:
                corrections.append({
                    "action": "remove_duplicates",
                    "count": duplicate_count,
                    "description": f"Removed {duplicate_count} duplicate records"
                })
        
        # Step 3: Clean each record
        for i, record in enumerate(data):
            cleaned_record, record_corrections = self._clean_record(
                record, i, fix_formats, validate_ranges
            )
            cleaned_data.append(cleaned_record)
            corrections.extend(record_corrections)
        
        # Step 4: Handle missing values
        if handle_missing != 'flag':
            cleaned_data, missing_corrections = self._handle_missing_values(
                cleaned_data, handle_missing
            )
            corrections.extend(missing_corrections)
        
        # Step 5: Generate quality report
        quality_report = self._assess_quality(cleaned_data, duplicate_count)
        
        # Generate warnings based on quality
        if quality_report.quality_score < 70:
            warnings.append(f"Data quality score is low ({quality_report.quality_score:.1f}%). Review recommended.")
        
        if quality_report.duplicates_found > 0:
            warnings.append(f"Found {quality_report.duplicates_found} duplicate records.")
        
        for field, count in quality_report.missing_values.items():
            if count > len(cleaned_data) * 0.1:  # >10% missing
                warnings.append(f"Field '{field}' has {count} missing values ({count/len(cleaned_data)*100:.1f}%).")
        
        return {
            "cleaned_data": cleaned_data,
            "corrections": corrections,
            "warnings": warnings,
            "quality_report": quality_report.to_dict(),
            "records_processed": len(cleaned_data),
            "records_original": len(data) + duplicate_count
        }
    
    def _standardize_field_names(
        self,
        data: List[Dict[str, Any]],
        corrections: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Standardize field names across the dataset."""
        if not data:
            return data
        
        # Get all unique field names
        all_fields: Set[str] = set()
        for record in data:
            all_fields.update(record.keys())
        
        # Build mapping for this dataset
        field_map = {}
        for field in all_fields:
            normalized = field.lower().strip().replace(' ', '_')
            if normalized in self.FIELD_MAPPINGS:
                standard_name = self.FIELD_MAPPINGS[normalized]
                if field != standard_name:
                    field_map[field] = standard_name
        
        if not field_map:
            return data
        
        # Apply standardization
        standardized = []
        for record in data:
            new_record = {}
            for key, value in record.items():
                new_key = field_map.get(key, key)
                new_record[new_key] = value
            standardized.append(new_record)
        
        # Record corrections
        for old_name, new_name in field_map.items():
            corrections.append({
                "action": "standardize_field",
                "field": old_name,
                "new_field": new_name,
                "description": f"Renamed '{old_name}' to '{new_name}'"
            })
        
        return standardized
    
    def _remove_duplicates(
        self,
        data: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Remove exact duplicate records."""
        seen: Set[str] = set()
        unique: List[Dict[str, Any]] = []
        
        for record in data:
            # Create a hashable representation
            record_str = json.dumps(record, sort_keys=True, default=str)
            
            if record_str not in seen:
                seen.add(record_str)
                unique.append(record)
        
        duplicates_removed = len(data) - len(unique)
        return unique, duplicates_removed
    
    def _clean_record(
        self,
        record: Dict[str, Any],
        index: int,
        fix_formats: bool,
        validate_ranges: bool
    ) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """Clean a single record."""
        cleaned = record.copy()
        corrections = []
        
        for field, value in record.items():
            if value is None or value == '':
                continue
            
            # Clean coordinates
            if field in ['latitude', 'longitude']:
                cleaned_val, correction = self._clean_coordinate(field, value, index)
                if cleaned_val != value:
                    cleaned[field] = cleaned_val
                    if correction:
                        corrections.append(correction)
                
                # Validate range
                if validate_ranges and cleaned_val is not None:
                    min_val, max_val = self.VALID_RANGES.get(field, (None, None))
                    if min_val is not None and max_val is not None:
                        if not (min_val <= float(cleaned_val) <= max_val):
                            corrections.append({
                                "action": "out_of_range",
                                "record": index,
                                "field": field,
                                "value": cleaned_val,
                                "valid_range": f"[{min_val}, {max_val}]",
                                "description": f"Value {cleaned_val} out of valid range"
                            })
            
            # Clean dates
            elif field in ['eventDate', 'date', 'sampleDate']:
                if fix_formats:
                    cleaned_val, correction = self._clean_date(field, value, index)
                    if cleaned_val != value:
                        cleaned[field] = cleaned_val
                        if correction:
                            corrections.append(correction)
            
            # Clean species names
            elif field in ['scientificName']:
                cleaned_val, correction = self._clean_species_name(value, index)
                if cleaned_val != value:
                    cleaned[field] = cleaned_val
                    if correction:
                        corrections.append(correction)
            
            # Clean numeric values
            elif field in self.VALID_RANGES:
                cleaned_val, correction = self._clean_numeric(field, value, index, validate_ranges)
                if cleaned_val != value:
                    cleaned[field] = cleaned_val
                    if correction:
                        corrections.append(correction)
            
            # Clean string values
            elif isinstance(value, str):
                cleaned_val = value.strip()
                if cleaned_val != value:
                    cleaned[field] = cleaned_val
        
        return cleaned, corrections
    
    def _clean_coordinate(
        self,
        field: str,
        value: Any,
        index: int
    ) -> Tuple[Optional[float], Optional[Dict[str, Any]]]:
        """Clean coordinate value."""
        correction = None
        
        try:
            # Already a number
            if isinstance(value, (int, float)):
                return float(value), None
            
            # String representation
            if isinstance(value, str):
                value = value.strip()
                
                # Handle DMS format (e.g., "12°34'56"N")
                dms_match = re.match(
                    r"(\d+)[°d]\s*(\d+)?['\s]?\s*(\d+\.?\d*)?[\"s]?\s*([NSEWnsew])?",
                    value
                )
                if dms_match:
                    degrees = float(dms_match.group(1))
                    minutes = float(dms_match.group(2) or 0)
                    seconds = float(dms_match.group(3) or 0)
                    direction = dms_match.group(4)
                    
                    decimal = degrees + minutes/60 + seconds/3600
                    if direction and direction.upper() in ['S', 'W']:
                        decimal = -decimal
                    
                    correction = {
                        "action": "convert_dms",
                        "record": index,
                        "field": field,
                        "original": value,
                        "converted": decimal,
                        "description": f"Converted DMS to decimal: {value} → {decimal}"
                    }
                    return decimal, correction
                
                # Try direct conversion
                cleaned = float(value.replace(',', '.'))
                return cleaned, None
                
        except (ValueError, TypeError):
            pass
        
        return None, {
            "action": "invalid_coordinate",
            "record": index,
            "field": field,
            "value": value,
            "description": f"Could not parse coordinate: {value}"
        }
    
    def _clean_date(
        self,
        field: str,
        value: Any,
        index: int
    ) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
        """Clean and standardize date value to ISO format."""
        if isinstance(value, datetime):
            return value.strftime('%Y-%m-%d'), None
        
        if not isinstance(value, str):
            return str(value), None
        
        value = value.strip()
        
        for fmt in self.DATE_FORMATS:
            try:
                parsed = datetime.strptime(value, fmt)
                iso_date = parsed.strftime('%Y-%m-%d')
                
                if iso_date != value:
                    return iso_date, {
                        "action": "standardize_date",
                        "record": index,
                        "field": field,
                        "original": value,
                        "standardized": iso_date,
                        "description": f"Standardized date format: {value} → {iso_date}"
                    }
                return iso_date, None
            except ValueError:
                continue
        
        return value, {
            "action": "unparseable_date",
            "record": index,
            "field": field,
            "value": value,
            "description": f"Could not parse date: {value}"
        }
    
    def _clean_species_name(
        self,
        value: str,
        index: int
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """Clean and standardize species name."""
        if not isinstance(value, str):
            return str(value), None
        
        original = value
        
        # Strip whitespace
        value = value.strip()
        
        # Remove multiple spaces
        value = re.sub(r'\s+', ' ', value)
        
        # Capitalize first letter of genus, lowercase species
        parts = value.split()
        if len(parts) >= 2:
            # Genus species [author] format
            cleaned_parts = [parts[0].capitalize()]
            cleaned_parts.extend(p.lower() for p in parts[1:2])
            if len(parts) > 2:
                cleaned_parts.extend(parts[2:])  # Keep author as-is
            value = ' '.join(cleaned_parts)
        elif len(parts) == 1:
            value = parts[0].capitalize()
        
        if value != original:
            return value, {
                "action": "standardize_species",
                "record": index,
                "field": "scientificName",
                "original": original,
                "standardized": value,
                "description": f"Standardized species name: {original} → {value}"
            }
        
        return value, None
    
    def _clean_numeric(
        self,
        field: str,
        value: Any,
        index: int,
        validate_ranges: bool
    ) -> Tuple[Optional[float], Optional[Dict[str, Any]]]:
        """Clean numeric value."""
        try:
            if isinstance(value, (int, float)):
                num_val = float(value)
            elif isinstance(value, str):
                # Handle common formats
                cleaned = value.strip().replace(',', '.').replace(' ', '')
                num_val = float(cleaned)
            else:
                return value, None
            
            # Check range
            if validate_ranges and field in self.VALID_RANGES:
                min_val, max_val = self.VALID_RANGES[field]
                if not (min_val <= num_val <= max_val):
                    return num_val, {
                        "action": "out_of_range",
                        "record": index,
                        "field": field,
                        "value": num_val,
                        "valid_range": f"[{min_val}, {max_val}]",
                        "description": f"Value {num_val} outside expected range"
                    }
            
            return num_val, None
            
        except (ValueError, TypeError):
            return None, {
                "action": "invalid_numeric",
                "record": index,
                "field": field,
                "value": value,
                "description": f"Could not parse as number: {value}"
            }
    
    def _handle_missing_values(
        self,
        data: List[Dict[str, Any]],
        strategy: str
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Handle missing values in the dataset."""
        corrections = []
        
        if strategy == 'drop':
            # Remove records with any missing required fields
            required_fields = ['latitude', 'longitude', 'scientificName', 'eventDate']
            cleaned = []
            dropped = 0
            
            for record in data:
                has_all = all(
                    record.get(f) not in [None, '', 'NA', 'N/A', 'null']
                    for f in required_fields
                    if f in record
                )
                if has_all:
                    cleaned.append(record)
                else:
                    dropped += 1
            
            if dropped > 0:
                corrections.append({
                    "action": "drop_incomplete",
                    "count": dropped,
                    "description": f"Dropped {dropped} records with missing required fields"
                })
            
            return cleaned, corrections
        
        elif strategy == 'fill':
            # Fill with appropriate defaults
            field_defaults = {
                'depth': 0,
                'abundance': 1,
                'quality_flag': 'unknown',
            }
            
            filled_count = Counter()
            
            for record in data:
                for field, default in field_defaults.items():
                    if field in record and record[field] in [None, '', 'NA', 'N/A']:
                        record[field] = default
                        filled_count[field] += 1
            
            for field, count in filled_count.items():
                if count > 0:
                    corrections.append({
                        "action": "fill_missing",
                        "field": field,
                        "count": count,
                        "default_value": field_defaults[field],
                        "description": f"Filled {count} missing '{field}' values with default"
                    })
            
            return data, corrections
        
        return data, corrections
    
    def _assess_quality(
        self,
        data: List[Dict[str, Any]],
        duplicates_found: int
    ) -> DataQualityReport:
        """Assess overall data quality."""
        report = DataQualityReport()
        report.total_records = len(data)
        report.duplicates_found = duplicates_found
        
        if not data:
            return report
        
        # Count missing values per field
        all_fields: Set[str] = set()
        for record in data:
            all_fields.update(record.keys())
        
        for field in all_fields:
            missing = sum(
                1 for r in data 
                if r.get(field) in [None, '', 'NA', 'N/A', 'null']
            )
            if missing > 0:
                report.missing_values[field] = missing
        
        # Count complete records
        report.complete_records = sum(
            1 for r in data
            if all(v not in [None, '', 'NA', 'N/A', 'null'] for v in r.values())
        )
        
        # Calculate quality score (0-100)
        scores = []
        
        # Completeness score
        completeness = report.complete_records / report.total_records
        scores.append(completeness * 40)  # 40% weight
        
        # Missing value score
        total_cells = report.total_records * len(all_fields)
        total_missing = sum(report.missing_values.values())
        missing_score = 1 - (total_missing / max(total_cells, 1))
        scores.append(missing_score * 30)  # 30% weight
        
        # Duplicate score
        dup_ratio = duplicates_found / max(report.total_records + duplicates_found, 1)
        dup_score = 1 - dup_ratio
        scores.append(dup_score * 20)  # 20% weight
        
        # Format error score (would need to track errors during cleaning)
        scores.append(10)  # Assume 10% baseline
        
        report.quality_score = sum(scores)
        
        # Generate recommendations
        if report.quality_score < 50:
            report.recommendations.append("Critical: Data quality is very low. Manual review recommended.")
        
        if completeness < 0.8:
            report.recommendations.append(
                f"Many records ({(1-completeness)*100:.1f}%) have missing values. Consider data collection improvements."
            )
        
        if duplicates_found > report.total_records * 0.05:
            report.recommendations.append(
                "High duplicate rate detected. Check data collection/import processes."
            )
        
        for field, count in report.missing_values.items():
            if count > report.total_records * 0.2:
                report.recommendations.append(
                    f"Field '{field}' has >20% missing values. Consider if this field is necessary."
                )
        
        return report
    
    def find_fuzzy_duplicates(
        self,
        data: List[Dict[str, Any]],
        key_fields: List[str],
        threshold: float = 0.9
    ) -> List[Tuple[int, int, float]]:
        """
        Find fuzzy duplicates based on key fields.
        
        Args:
            data: List of records
            key_fields: Fields to compare for similarity
            threshold: Similarity threshold (0-1)
            
        Returns:
            List of (index1, index2, similarity) tuples
        """
        duplicates = []
        
        for i in range(len(data)):
            for j in range(i + 1, len(data)):
                similarity = self._calculate_similarity(data[i], data[j], key_fields)
                if similarity >= threshold:
                    duplicates.append((i, j, similarity))
        
        return duplicates
    
    def _calculate_similarity(
        self,
        record1: Dict[str, Any],
        record2: Dict[str, Any],
        fields: List[str]
    ) -> float:
        """Calculate similarity between two records."""
        scores = []
        
        for field in fields:
            val1 = record1.get(field)
            val2 = record2.get(field)
            
            if val1 is None or val2 is None:
                continue
            
            if isinstance(val1, (int, float)) and isinstance(val2, (int, float)):
                # Numeric similarity
                max_val = max(abs(val1), abs(val2), 1)
                scores.append(1 - abs(val1 - val2) / max_val)
            elif isinstance(val1, str) and isinstance(val2, str):
                # String similarity (simple)
                val1, val2 = val1.lower(), val2.lower()
                if val1 == val2:
                    scores.append(1.0)
                else:
                    # Levenshtein-ish simple similarity
                    common = len(set(val1) & set(val2))
                    total = len(set(val1) | set(val2))
                    scores.append(common / max(total, 1))
            else:
                scores.append(1.0 if val1 == val2 else 0.0)
        
        return sum(scores) / max(len(scores), 1)


# Convenience function for API
def clean_data(
    data: List[Dict[str, Any]],
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Clean a dataset with default options.
    
    Args:
        data: List of records
        options: Optional cleaning options
        
    Returns:
        Cleaning result with cleaned_data, corrections, warnings
    """
    cleaner = DataCleaner()
    return cleaner.clean_dataset(data, options)
