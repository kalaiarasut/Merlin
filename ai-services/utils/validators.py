"""
Data Standardisation Validators

Implements validators for international marine data standards:
- MIxS (Minimum Information about any (x) Sequence) - for eDNA metadata
- ISO 19115 (Geographic Information - Metadata) - for geographic metadata
- Darwin Core - for biodiversity data
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
from enum import Enum
import re
from datetime import datetime


class ValidationLevel(Enum):
    """Validation strictness levels."""
    STRICT = "strict"      # All required fields must be present and valid
    STANDARD = "standard"  # Required fields must be present, warnings for recommended
    LENIENT = "lenient"    # Only critical errors reported


@dataclass
class ValidationResult:
    """Result of a validation check."""
    is_valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    completeness_score: float = 0.0  # 0-100%
    standard_version: str = ""
    validated_fields: Dict[str, bool] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_valid": self.is_valid,
            "errors": self.errors,
            "warnings": self.warnings,
            "completeness_score": round(self.completeness_score, 1),
            "standard_version": self.standard_version,
            "validated_fields": self.validated_fields
        }


class MIxSValidator:
    """
    MIxS (Minimum Information about any (x) Sequence) Validator
    
    Validates eDNA and sequence metadata according to MIxS standards.
    Version: MIxS 6.0 (2022)
    
    References:
    - https://gensc.org/mixs/
    - https://www.gensc.org/pages/standards-intro.html
    """
    
    VERSION = "6.0"
    
    # Core MIxS fields (applicable to all sequences)
    CORE_REQUIRED = {
        "sample_name": "Unique identifier for the sample",
        "investigation_type": "Type of investigation (e.g., metagenome, amplicon)",
        "project_name": "Name of the project",
        "lat_lon": "Latitude and longitude of sampling location",
        "geo_loc_name": "Geographic location name",
        "collection_date": "Date of sample collection",
        "env_broad_scale": "Broad-scale environmental context (ENVO term)",
        "env_local_scale": "Local-scale environmental context (ENVO term)",
        "env_medium": "Environmental medium (ENVO term)"
    }
    
    CORE_RECOMMENDED = {
        "seq_meth": "Sequencing method (e.g., Illumina, PacBio)",
        "nucl_acid_ext": "Nucleic acid extraction method",
        "target_gene": "Target gene (e.g., 16S, 18S, COI)",
        "target_subfragment": "Target subfragment or variable region",
        "pcr_primers": "PCR primers used",
        "pcr_cond": "PCR conditions",
        "samp_size": "Sample size in volume or mass",
        "samp_collect_device": "Device used to collect sample"
    }
    
    # Water-specific fields (for marine eDNA)
    WATER_REQUIRED = {
        "depth": "Depth of sampling in meters",
        "temp": "Water temperature at sampling",
    }
    
    WATER_RECOMMENDED = {
        "salinity": "Salinity measurement",
        "chlorophyll": "Chlorophyll concentration",
        "diss_oxygen": "Dissolved oxygen",
        "ph": "pH measurement",
        "pressure": "Pressure at depth",
        "water_current": "Water current speed",
        "turbidity": "Water turbidity"
    }
    
    def __init__(self, level: ValidationLevel = ValidationLevel.STANDARD):
        self.level = level
    
    def validate(self, metadata: Dict[str, Any], sample_type: str = "water") -> ValidationResult:
        """
        Validate metadata against MIxS standard.
        
        Args:
            metadata: Dictionary of metadata fields
            sample_type: Sample type (water, sediment, soil)
            
        Returns:
            ValidationResult with errors, warnings, and completeness score
        """
        errors = []
        warnings = []
        validated_fields = {}
        
        # Required core fields
        for field_name, description in self.CORE_REQUIRED.items():
            if field_name in metadata and metadata[field_name]:
                is_valid = self._validate_field(field_name, metadata[field_name])
                validated_fields[field_name] = is_valid
                if not is_valid:
                    errors.append(f"Invalid format for '{field_name}': {description}")
            else:
                validated_fields[field_name] = False
                if self.level != ValidationLevel.LENIENT:
                    errors.append(f"Missing required field '{field_name}': {description}")
        
        # Recommended core fields
        for field_name, description in self.CORE_RECOMMENDED.items():
            if field_name in metadata and metadata[field_name]:
                is_valid = self._validate_field(field_name, metadata[field_name])
                validated_fields[field_name] = is_valid
            else:
                validated_fields[field_name] = False
                if self.level == ValidationLevel.STRICT:
                    warnings.append(f"Recommended field '{field_name}' missing: {description}")
        
        # Water-specific fields
        if sample_type == "water":
            for field_name, description in self.WATER_REQUIRED.items():
                if field_name in metadata and metadata[field_name]:
                    validated_fields[field_name] = True
                else:
                    validated_fields[field_name] = False
                    if self.level != ValidationLevel.LENIENT:
                        errors.append(f"Missing water field '{field_name}': {description}")
            
            for field_name, description in self.WATER_RECOMMENDED.items():
                if field_name in metadata and metadata[field_name]:
                    validated_fields[field_name] = True
                else:
                    validated_fields[field_name] = False
                    if self.level == ValidationLevel.STRICT:
                        warnings.append(f"Recommended water field '{field_name}' missing")
        
        # Calculate completeness
        total_fields = len(self.CORE_REQUIRED) + len(self.CORE_RECOMMENDED)
        if sample_type == "water":
            total_fields += len(self.WATER_REQUIRED) + len(self.WATER_RECOMMENDED)
        
        valid_count = sum(1 for v in validated_fields.values() if v)
        completeness = (valid_count / total_fields) * 100 if total_fields > 0 else 0
        
        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            completeness_score=completeness,
            standard_version=f"MIxS {self.VERSION}",
            validated_fields=validated_fields
        )
    
    def _validate_field(self, field_name: str, value: Any) -> bool:
        """Validate individual field format."""
        if field_name == "lat_lon":
            return self._validate_lat_lon(value)
        elif field_name == "collection_date":
            return self._validate_date(value)
        elif field_name in ["depth", "temp", "salinity", "chlorophyll", "ph"]:
            return self._validate_numeric(value)
        return True  # Default to valid for string fields
    
    def _validate_lat_lon(self, value: str) -> bool:
        """Validate latitude/longitude format."""
        if isinstance(value, str):
            # Format: "lat lon" or "lat, lon"
            pattern = r'^-?\d+\.?\d*[,\s]+-?\d+\.?\d*$'
            return bool(re.match(pattern, value.strip()))
        return False
    
    def _validate_date(self, value: str) -> bool:
        """Validate date format (ISO 8601)."""
        patterns = [
            r'^\d{4}-\d{2}-\d{2}$',  # YYYY-MM-DD
            r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}',  # ISO 8601
            r'^\d{4}/\d{2}/\d{2}$'  # YYYY/MM/DD
        ]
        return any(re.match(p, str(value)) for p in patterns)
    
    def _validate_numeric(self, value: Any) -> bool:
        """Validate numeric field."""
        try:
            float(value)
            return True
        except (ValueError, TypeError):
            return False


class ISO19115Validator:
    """
    ISO 19115 (Geographic Information - Metadata) Validator
    
    Validates geographic metadata according to ISO 19115:2014 standard.
    
    References:
    - https://www.iso.org/standard/53798.html
    - https://www.fgdc.gov/metadata/iso-19115
    """
    
    VERSION = "2014"
    
    # Core ISO 19115 metadata elements
    REQUIRED_ELEMENTS = {
        "file_identifier": "Unique identifier for the metadata record",
        "language": "Language of the metadata (ISO 639-2)",
        "character_set": "Character encoding (e.g., UTF-8)",
        "hierarchy_level": "Scope of the resource (dataset, series, service)",
        "contact": "Contact information for the metadata",
        "date_stamp": "Date of metadata creation/update",
        "reference_system_info": "Coordinate reference system"
    }
    
    # Identification information
    IDENTIFICATION_REQUIRED = {
        "title": "Title of the resource",
        "abstract": "Brief summary of the resource",
        "point_of_contact": "Contact for the resource",
        "spatial_representation_type": "Method of spatial representation"
    }
    
    IDENTIFICATION_RECOMMENDED = {
        "purpose": "Purpose of the resource",
        "status": "Current status (completed, ongoing, etc.)",
        "keywords": "Keywords describing the resource",
        "spatial_resolution": "Level of spatial detail",
        "topic_category": "Main theme(s) of the resource"
    }
    
    # Geographic extent
    EXTENT_REQUIRED = {
        "west_bound_longitude": "Western boundary",
        "east_bound_longitude": "Eastern boundary",
        "south_bound_latitude": "Southern boundary",
        "north_bound_latitude": "Northern boundary"
    }
    
    EXTENT_RECOMMENDED = {
        "temporal_extent_begin": "Start date of data coverage",
        "temporal_extent_end": "End date of data coverage",
        "vertical_extent_min": "Minimum depth/altitude",
        "vertical_extent_max": "Maximum depth/altitude"
    }
    
    # Quality information
    QUALITY_RECOMMENDED = {
        "lineage": "Information about data provenance",
        "positional_accuracy": "Accuracy of spatial positions",
        "completeness": "Data completeness assessment"
    }
    
    def __init__(self, level: ValidationLevel = ValidationLevel.STANDARD):
        self.level = level
    
    def validate(self, metadata: Dict[str, Any]) -> ValidationResult:
        """
        Validate metadata against ISO 19115 standard.
        
        Args:
            metadata: Dictionary of metadata fields
            
        Returns:
            ValidationResult with errors, warnings, and completeness score
        """
        errors = []
        warnings = []
        validated_fields = {}
        
        all_fields = {}
        all_fields.update({k: (v, True) for k, v in self.REQUIRED_ELEMENTS.items()})
        all_fields.update({k: (v, True) for k, v in self.IDENTIFICATION_REQUIRED.items()})
        all_fields.update({k: (v, False) for k, v in self.IDENTIFICATION_RECOMMENDED.items()})
        all_fields.update({k: (v, True) for k, v in self.EXTENT_REQUIRED.items()})
        all_fields.update({k: (v, False) for k, v in self.EXTENT_RECOMMENDED.items()})
        all_fields.update({k: (v, False) for k, v in self.QUALITY_RECOMMENDED.items()})
        
        for field_name, (description, is_required) in all_fields.items():
            if field_name in metadata and metadata[field_name]:
                is_valid = self._validate_field(field_name, metadata[field_name])
                validated_fields[field_name] = is_valid
                if not is_valid:
                    errors.append(f"Invalid format for '{field_name}'")
            else:
                validated_fields[field_name] = False
                if is_required and self.level != ValidationLevel.LENIENT:
                    errors.append(f"Missing required field '{field_name}': {description}")
                elif not is_required and self.level == ValidationLevel.STRICT:
                    warnings.append(f"Recommended field '{field_name}' missing")
        
        # Validate geographic extent bounds
        extent_valid = self._validate_extent(metadata)
        if not extent_valid and self.level != ValidationLevel.LENIENT:
            errors.append("Geographic extent bounds are invalid or inconsistent")
        
        # Calculate completeness
        valid_count = sum(1 for v in validated_fields.values() if v)
        total_fields = len(all_fields)
        completeness = (valid_count / total_fields) * 100 if total_fields > 0 else 0
        
        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            completeness_score=completeness,
            standard_version=f"ISO 19115:{self.VERSION}",
            validated_fields=validated_fields
        )
    
    def _validate_field(self, field_name: str, value: Any) -> bool:
        """Validate individual field format."""
        if "longitude" in field_name:
            return self._validate_longitude(value)
        elif "latitude" in field_name:
            return self._validate_latitude(value)
        elif "date" in field_name or field_name == "date_stamp":
            return self._validate_date(value)
        elif field_name == "language":
            return self._validate_language(value)
        elif field_name == "character_set":
            return value.upper() in ["UTF-8", "UTF-16", "ISO-8859-1", "ASCII"]
        return True
    
    def _validate_longitude(self, value: Any) -> bool:
        """Validate longitude (-180 to 180)."""
        try:
            lon = float(value)
            return -180 <= lon <= 180
        except (ValueError, TypeError):
            return False
    
    def _validate_latitude(self, value: Any) -> bool:
        """Validate latitude (-90 to 90)."""
        try:
            lat = float(value)
            return -90 <= lat <= 90
        except (ValueError, TypeError):
            return False
    
    def _validate_date(self, value: str) -> bool:
        """Validate date format (ISO 8601)."""
        patterns = [
            r'^\d{4}-\d{2}-\d{2}$',
            r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}',
            r'^\d{4}$'  # Year only
        ]
        return any(re.match(p, str(value)) for p in patterns)
    
    def _validate_language(self, value: str) -> bool:
        """Validate ISO 639-2 language code."""
        # Common ISO 639-2 codes
        valid_codes = ["eng", "spa", "fra", "deu", "zho", "jpn", "hin", "ara", "rus", "por"]
        return value.lower() in valid_codes or len(value) == 3
    
    def _validate_extent(self, metadata: Dict[str, Any]) -> bool:
        """Validate geographic extent consistency."""
        try:
            west = float(metadata.get("west_bound_longitude", 0))
            east = float(metadata.get("east_bound_longitude", 0))
            south = float(metadata.get("south_bound_latitude", 0))
            north = float(metadata.get("north_bound_latitude", 0))
            
            # Check bounds are valid
            return (west <= east and 
                    south <= north and
                    -180 <= west <= 180 and
                    -180 <= east <= 180 and
                    -90 <= south <= 90 and
                    -90 <= north <= 90)
        except (ValueError, TypeError):
            return False


class DarwinCoreValidator:
    """
    Darwin Core (DwC) Validator
    
    Validates biodiversity occurrence data according to Darwin Core standard.
    
    References:
    - https://dwc.tdwg.org/
    - https://dwc.tdwg.org/terms/
    """
    
    VERSION = "2024-06-26"
    
    OCCURRENCE_REQUIRED = {
        "occurrenceID": "Unique identifier for the occurrence",
        "scientificName": "Full scientific name",
        "eventDate": "Date of the occurrence",
        "decimalLatitude": "Latitude in decimal degrees",
        "decimalLongitude": "Longitude in decimal degrees"
    }
    
    OCCURRENCE_RECOMMENDED = {
        "basisOfRecord": "Type of record (HumanObservation, PreservedSpecimen, etc.)",
        "kingdom": "Taxonomic kingdom",
        "phylum": "Taxonomic phylum",
        "class": "Taxonomic class",
        "order": "Taxonomic order",
        "family": "Taxonomic family",
        "genus": "Taxonomic genus",
        "specificEpithet": "Species epithet",
        "recordedBy": "Person(s) who recorded the occurrence",
        "institutionCode": "Institution custodian code",
        "collectionCode": "Collection identifier",
        "coordinateUncertaintyInMeters": "Spatial uncertainty"
    }
    
    VALID_BASIS_OF_RECORD = [
        "HumanObservation",
        "MachineObservation", 
        "PreservedSpecimen",
        "LivingSpecimen",
        "FossilSpecimen",
        "MaterialSample"
    ]
    
    def __init__(self, level: ValidationLevel = ValidationLevel.STANDARD):
        self.level = level
    
    def validate(self, occurrence: Dict[str, Any]) -> ValidationResult:
        """Validate occurrence record against Darwin Core."""
        errors = []
        warnings = []
        validated_fields = {}
        
        # Required fields
        for field_name, description in self.OCCURRENCE_REQUIRED.items():
            if field_name in occurrence and occurrence[field_name]:
                is_valid = self._validate_field(field_name, occurrence[field_name])
                validated_fields[field_name] = is_valid
                if not is_valid:
                    errors.append(f"Invalid format for '{field_name}'")
            else:
                validated_fields[field_name] = False
                if self.level != ValidationLevel.LENIENT:
                    errors.append(f"Missing required field '{field_name}': {description}")
        
        # Recommended fields
        for field_name, description in self.OCCURRENCE_RECOMMENDED.items():
            if field_name in occurrence and occurrence[field_name]:
                is_valid = self._validate_field(field_name, occurrence[field_name])
                validated_fields[field_name] = is_valid
            else:
                validated_fields[field_name] = False
                if self.level == ValidationLevel.STRICT:
                    warnings.append(f"Recommended field '{field_name}' missing")
        
        # Calculate completeness
        all_fields = {**self.OCCURRENCE_REQUIRED, **self.OCCURRENCE_RECOMMENDED}
        valid_count = sum(1 for v in validated_fields.values() if v)
        completeness = (valid_count / len(all_fields)) * 100
        
        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            completeness_score=completeness,
            standard_version=f"Darwin Core {self.VERSION}",
            validated_fields=validated_fields
        )
    
    def _validate_field(self, field_name: str, value: Any) -> bool:
        """Validate individual field format."""
        if field_name == "decimalLatitude":
            try:
                lat = float(value)
                return -90 <= lat <= 90
            except:
                return False
        elif field_name == "decimalLongitude":
            try:
                lon = float(value)
                return -180 <= lon <= 180
            except:
                return False
        elif field_name == "eventDate":
            return bool(re.match(r'^\d{4}', str(value)))
        elif field_name == "basisOfRecord":
            return value in self.VALID_BASIS_OF_RECORD
        return True


# Singleton instances
_mixs_validator = None
_iso19115_validator = None
_darwin_core_validator = None


def get_mixs_validator(level: ValidationLevel = ValidationLevel.STANDARD) -> MIxSValidator:
    """Get MIxS validator instance."""
    global _mixs_validator
    if _mixs_validator is None or _mixs_validator.level != level:
        _mixs_validator = MIxSValidator(level)
    return _mixs_validator


def get_iso19115_validator(level: ValidationLevel = ValidationLevel.STANDARD) -> ISO19115Validator:
    """Get ISO 19115 validator instance."""
    global _iso19115_validator
    if _iso19115_validator is None or _iso19115_validator.level != level:
        _iso19115_validator = ISO19115Validator(level)
    return _iso19115_validator


def get_darwin_core_validator(level: ValidationLevel = ValidationLevel.STANDARD) -> DarwinCoreValidator:
    """Get Darwin Core validator instance."""
    global _darwin_core_validator
    if _darwin_core_validator is None or _darwin_core_validator.level != level:
        _darwin_core_validator = DarwinCoreValidator(level)
    return _darwin_core_validator
