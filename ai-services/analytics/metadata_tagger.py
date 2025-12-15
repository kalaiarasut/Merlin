"""
Automated Metadata Tagging Module

AI-powered extraction and tagging of metadata from documents, images, and data files
using OCR, NLP, and pattern recognition.
"""

import re
import os
import json
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict, field
from datetime import datetime
from enum import Enum
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Conditional imports
try:
    import pytesseract
    from PIL import Image
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    logger.warning("Tesseract/PIL not available. OCR features disabled.")

try:
    import spacy
    NLP_AVAILABLE = True
except ImportError:
    NLP_AVAILABLE = False
    logger.warning("SpaCy not available. Advanced NLP features disabled.")

try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False


class DataDomain(Enum):
    """Classification of marine data domains"""
    SPECIES = "species"
    OCEANOGRAPHY = "oceanography"
    EDNA = "edna"
    OTOLITH = "otolith"
    SURVEY = "survey"
    TAXONOMY = "taxonomy"
    UNKNOWN = "unknown"


@dataclass
class ExtractedMetadata:
    """Container for extracted metadata"""
    domain: str
    confidence: float
    species_names: List[str] = field(default_factory=list)
    locations: List[Dict[str, float]] = field(default_factory=list)
    dates: List[str] = field(default_factory=list)
    coordinates: List[Tuple[float, float]] = field(default_factory=list)
    environmental_params: Dict[str, Any] = field(default_factory=dict)
    taxonomic_info: Dict[str, str] = field(default_factory=dict)
    keywords: List[str] = field(default_factory=list)
    darwin_core: Dict[str, Any] = field(default_factory=dict)
    obis_fields: Dict[str, Any] = field(default_factory=dict)
    raw_text: str = ""
    warnings: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return asdict(self)


class MetadataTagger:
    """
    AI-powered metadata extraction and tagging system for marine data.
    
    Features:
    - OCR text extraction from images and scanned PDFs
    - NLP-based entity recognition (species, locations, dates)
    - Pattern matching for coordinates, environmental parameters
    - Data domain classification
    - Darwin Core and OBIS standard compliance
    """
    
    # Marine species name patterns
    SPECIES_PATTERNS = [
        r'\b([A-Z][a-z]+)\s+([a-z]+)\b',  # Genus species
        r'\b([A-Z][a-z]+)\s+([a-z]+)\s+(var\.|subsp\.)\s+([a-z]+)\b',  # Subspecies
    ]
    
    # Coordinate patterns
    COORDINATE_PATTERNS = [
        # Decimal degrees: 12.345, -67.890 or 12.345°N, 67.890°E
        r'(-?\d+\.?\d*)[°\s]*([NSns])?[\s,;]+(-?\d+\.?\d*)[°\s]*([EWew])?',
        # DMS: 12°34'56"N, 67°89'12"E
        r"(\d+)[°]\s*(\d+)[′']\s*(\d+\.?\d*)[″\"]\s*([NSns])[\s,;]+(\d+)[°]\s*(\d+)[′']\s*(\d+\.?\d*)[″\"]\s*([EWew])",
    ]
    
    # Date patterns
    DATE_PATTERNS = [
        (r'\d{4}-\d{2}-\d{2}', '%Y-%m-%d'),  # ISO format
        (r'\d{2}/\d{2}/\d{4}', '%d/%m/%Y'),  # DD/MM/YYYY
        (r'\d{2}-\d{2}-\d{4}', '%d-%m-%Y'),  # DD-MM-YYYY
        (r'(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})', None),
        (r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})', None),
    ]
    
    # Environmental parameter patterns
    ENV_PATTERNS = {
        'temperature': [
            r'(?:temp(?:erature)?|T)\s*[=:]\s*(-?\d+\.?\d*)\s*°?[CF]?',
            r'(-?\d+\.?\d*)\s*°[CF]',
            r'(?:SST|sst)\s*[=:]\s*(-?\d+\.?\d*)',
        ],
        'salinity': [
            r'(?:salinity|sal)\s*[=:]\s*(\d+\.?\d*)\s*(?:psu|PSU|ppt|‰)?',
            r'(\d+\.?\d*)\s*(?:psu|PSU|ppt)',
        ],
        'depth': [
            r'(?:depth|D)\s*[=:]\s*(\d+\.?\d*)\s*(?:m|meters?)?',
            r'(\d+\.?\d*)\s*(?:m|meters?)\s*(?:depth)?',
        ],
        'ph': [
            r'(?:pH|ph)\s*[=:]\s*(\d+\.?\d*)',
        ],
        'dissolved_oxygen': [
            r'(?:DO|dissolved\s*oxygen)\s*[=:]\s*(\d+\.?\d*)\s*(?:mg/[lL])?',
        ],
        'chlorophyll': [
            r'(?:chlorophyll|chl[-\s]?a?)\s*[=:]\s*(\d+\.?\d*)\s*(?:mg/m³|μg/[lL])?',
        ],
    }
    
    # Domain classification keywords
    DOMAIN_KEYWORDS = {
        DataDomain.SPECIES: ['species', 'genus', 'family', 'order', 'phylum', 'taxonomy', 
                            'scientific name', 'common name', 'fish', 'marine life'],
        DataDomain.OCEANOGRAPHY: ['temperature', 'salinity', 'ctd', 'ocean', 'current',
                                  'dissolved oxygen', 'chlorophyll', 'nutrients', 'sst'],
        DataDomain.EDNA: ['edna', 'e-dna', 'environmental dna', 'sequence', 'fasta', 'fastq',
                         'primer', 'barcode', 'amplicon', 'metabarcoding', 'pcr'],
        DataDomain.OTOLITH: ['otolith', 'ear stone', 'age determination', 'annuli', 'growth rings',
                            'fish age', 'sagittal', 'lapillus'],
        DataDomain.SURVEY: ['survey', 'transect', 'sampling', 'trawl', 'catch', 'abundance',
                           'biomass', 'cpue', 'cruise'],
        DataDomain.TAXONOMY: ['taxonomy', 'classification', 'worms', 'itis', 'gbif',
                             'nomenclature', 'synonym', 'valid name'],
    }
    
    # Common marine families (for species validation)
    MARINE_FAMILIES = [
        'Scombridae', 'Carangidae', 'Lutjanidae', 'Serranidae', 'Sparidae',
        'Clupeidae', 'Engraulidae', 'Coryphaenidae', 'Istiophoridae', 'Xiphiidae',
        'Carcharhinidae', 'Lamnidae', 'Mobulidae', 'Delphinidae', 'Cheloniidae',
        'Sciaenidae', 'Gobiidae', 'Blenniidae', 'Labridae', 'Pomacentridae',
    ]
    
    def __init__(self, spacy_model: str = "en_core_web_sm"):
        """Initialize the metadata tagger with optional NLP model."""
        self.nlp = None
        if NLP_AVAILABLE:
            try:
                self.nlp = spacy.load(spacy_model)
                logger.info(f"Loaded SpaCy model: {spacy_model}")
            except OSError:
                logger.warning(f"SpaCy model {spacy_model} not found. Run: python -m spacy download {spacy_model}")
    
    def extract_from_text(self, text: str) -> ExtractedMetadata:
        """
        Extract metadata from text content.
        
        Args:
            text: Text content to analyze
            
        Returns:
            ExtractedMetadata object with all extracted information
        """
        metadata = ExtractedMetadata(
            domain=DataDomain.UNKNOWN.value,
            confidence=0.0,
            raw_text=text[:500]  # Store first 500 chars
        )
        
        # Classify domain
        domain, confidence = self._classify_domain(text)
        metadata.domain = domain.value
        metadata.confidence = confidence
        
        # Extract species names
        metadata.species_names = self._extract_species(text)
        
        # Extract coordinates
        metadata.coordinates = self._extract_coordinates(text)
        metadata.locations = [{"lat": lat, "lon": lon} for lat, lon in metadata.coordinates]
        
        # Extract dates
        metadata.dates = self._extract_dates(text)
        
        # Extract environmental parameters
        metadata.environmental_params = self._extract_environmental_params(text)
        
        # Extract keywords using NLP
        metadata.keywords = self._extract_keywords(text)
        
        # If species found, extract taxonomic info
        if metadata.species_names:
            metadata.taxonomic_info = self._infer_taxonomy(metadata.species_names[0])
        
        # Generate Darwin Core fields
        metadata.darwin_core = self._generate_darwin_core(metadata)
        
        # Generate OBIS fields
        metadata.obis_fields = self._generate_obis_fields(metadata)
        
        return metadata
    
    def extract_from_image(self, image_path: str) -> ExtractedMetadata:
        """
        Extract metadata from image using OCR.
        
        Args:
            image_path: Path to image file
            
        Returns:
            ExtractedMetadata object
        """
        if not OCR_AVAILABLE:
            return ExtractedMetadata(
                domain=DataDomain.UNKNOWN.value,
                confidence=0.0,
                warnings=["OCR not available. Install pytesseract and PIL."]
            )
        
        try:
            image = Image.open(image_path)
            text = pytesseract.image_to_string(image)
            
            # Also extract image metadata
            metadata = self.extract_from_text(text)
            
            # Add image-specific metadata
            exif_data = self._extract_exif(image)
            if exif_data:
                if 'GPSLatitude' in exif_data and 'GPSLongitude' in exif_data:
                    lat = self._convert_gps_to_decimal(exif_data.get('GPSLatitude'), 
                                                       exif_data.get('GPSLatitudeRef', 'N'))
                    lon = self._convert_gps_to_decimal(exif_data.get('GPSLongitude'),
                                                       exif_data.get('GPSLongitudeRef', 'E'))
                    if lat and lon:
                        metadata.coordinates.append((lat, lon))
                        metadata.locations.append({"lat": lat, "lon": lon})
                
                if 'DateTimeOriginal' in exif_data:
                    metadata.dates.append(exif_data['DateTimeOriginal'])
            
            return metadata
            
        except Exception as e:
            logger.error(f"Image extraction error: {e}")
            return ExtractedMetadata(
                domain=DataDomain.UNKNOWN.value,
                confidence=0.0,
                warnings=[f"Image extraction failed: {str(e)}"]
            )
    
    def extract_from_csv(self, file_path: str) -> ExtractedMetadata:
        """
        Extract metadata from CSV file by analyzing headers and content.
        
        Args:
            file_path: Path to CSV file
            
        Returns:
            ExtractedMetadata object
        """
        if not PANDAS_AVAILABLE:
            return ExtractedMetadata(
                domain=DataDomain.UNKNOWN.value,
                confidence=0.0,
                warnings=["Pandas not available."]
            )
        
        try:
            # Try different delimiters
            df = None
            for delimiter in [',', ';', '\t', '|']:
                try:
                    df = pd.read_csv(file_path, delimiter=delimiter, nrows=100)
                    if len(df.columns) > 1:
                        break
                except:
                    continue
            
            if df is None or df.empty:
                return ExtractedMetadata(
                    domain=DataDomain.UNKNOWN.value,
                    confidence=0.0,
                    warnings=["Could not parse CSV file"]
                )
            
            # Analyze column names
            columns_text = ' '.join(df.columns.astype(str).tolist())
            
            # Get sample values
            sample_text = ' '.join([str(v) for v in df.iloc[0].values if pd.notna(v)])
            
            combined_text = f"{columns_text} {sample_text}"
            metadata = self.extract_from_text(combined_text)
            
            # Column-specific extraction
            for col in df.columns:
                col_lower = col.lower()
                
                # Species columns
                if any(term in col_lower for term in ['species', 'scientific', 'taxon']):
                    species_values = df[col].dropna().unique().tolist()[:10]
                    metadata.species_names.extend([str(s) for s in species_values])
                
                # Coordinate columns
                if 'lat' in col_lower:
                    lat_values = pd.to_numeric(df[col], errors='coerce').dropna()
                    if not lat_values.empty:
                        for lat in lat_values[:5]:
                            if -90 <= lat <= 90:
                                metadata.warnings.append(f"Latitude column detected: {col}")
                
                # Date columns
                if 'date' in col_lower or 'time' in col_lower:
                    date_values = df[col].dropna().unique().tolist()[:5]
                    metadata.dates.extend([str(d) for d in date_values])
            
            # Remove duplicates
            metadata.species_names = list(set(metadata.species_names))
            metadata.dates = list(set(metadata.dates))
            
            return metadata
            
        except Exception as e:
            logger.error(f"CSV extraction error: {e}")
            return ExtractedMetadata(
                domain=DataDomain.UNKNOWN.value,
                confidence=0.0,
                warnings=[f"CSV extraction failed: {str(e)}"]
            )
    
    def _classify_domain(self, text: str) -> Tuple[DataDomain, float]:
        """Classify the data domain based on text content."""
        text_lower = text.lower()
        scores = {}
        
        for domain, keywords in self.DOMAIN_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in text_lower)
            scores[domain] = score
        
        if not scores or max(scores.values()) == 0:
            return DataDomain.UNKNOWN, 0.0
        
        best_domain = max(scores, key=scores.get)
        max_score = scores[best_domain]
        total_keywords = len(self.DOMAIN_KEYWORDS[best_domain])
        confidence = min(1.0, max_score / max(total_keywords * 0.3, 1))
        
        return best_domain, confidence
    
    def _extract_species(self, text: str) -> List[str]:
        """Extract species names from text using patterns and NLP."""
        species = []
        
        # Pattern-based extraction
        for pattern in self.SPECIES_PATTERNS:
            matches = re.findall(pattern, text)
            for match in matches:
                if isinstance(match, tuple):
                    name = f"{match[0]} {match[1]}"
                else:
                    name = match
                
                # Validate (genus should be capitalized, species lowercase)
                parts = name.split()
                if len(parts) >= 2 and parts[0][0].isupper() and parts[1][0].islower():
                    if len(parts[0]) > 2 and len(parts[1]) > 2:
                        species.append(name)
        
        # NLP-based extraction
        if self.nlp:
            doc = self.nlp(text)
            for ent in doc.ents:
                if ent.label_ in ['ORG', 'PRODUCT']:  # Species often misclassified
                    # Check if it looks like a species name
                    if re.match(r'^[A-Z][a-z]+\s+[a-z]+$', ent.text):
                        species.append(ent.text)
        
        return list(set(species))[:20]  # Limit to 20 unique species
    
    def _extract_coordinates(self, text: str) -> List[Tuple[float, float]]:
        """Extract geographic coordinates from text."""
        coordinates = []
        
        for pattern in self.COORDINATE_PATTERNS:
            matches = re.findall(pattern, text)
            for match in matches:
                try:
                    if len(match) == 4:  # Decimal degrees
                        lat = float(match[0])
                        lon = float(match[2])
                        
                        # Apply direction
                        if match[1] and match[1].upper() == 'S':
                            lat = -abs(lat)
                        if match[3] and match[3].upper() == 'W':
                            lon = -abs(lon)
                        
                        # Validate
                        if -90 <= lat <= 90 and -180 <= lon <= 180:
                            coordinates.append((lat, lon))
                    
                    elif len(match) == 8:  # DMS format
                        lat = self._dms_to_decimal(
                            float(match[0]), float(match[1]), float(match[2]), match[3]
                        )
                        lon = self._dms_to_decimal(
                            float(match[4]), float(match[5]), float(match[6]), match[7]
                        )
                        if lat and lon:
                            coordinates.append((lat, lon))
                
                except (ValueError, IndexError):
                    continue
        
        return coordinates
    
    def _dms_to_decimal(self, degrees: float, minutes: float, seconds: float, direction: str) -> Optional[float]:
        """Convert DMS coordinates to decimal degrees."""
        decimal = degrees + minutes / 60 + seconds / 3600
        if direction.upper() in ['S', 'W']:
            decimal = -decimal
        return decimal
    
    def _extract_dates(self, text: str) -> List[str]:
        """Extract dates from text."""
        dates = []
        
        for pattern, fmt in self.DATE_PATTERNS:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                if isinstance(match, tuple):
                    date_str = ' '.join(match)
                else:
                    date_str = match
                
                # Try to standardize to ISO format
                try:
                    if fmt:
                        parsed = datetime.strptime(date_str, fmt)
                        dates.append(parsed.strftime('%Y-%m-%d'))
                    else:
                        dates.append(date_str)
                except ValueError:
                    dates.append(date_str)
        
        return list(set(dates))
    
    def _extract_environmental_params(self, text: str) -> Dict[str, Any]:
        """Extract environmental parameters from text."""
        params = {}
        
        for param_name, patterns in self.ENV_PATTERNS.items():
            for pattern in patterns:
                matches = re.findall(pattern, text, re.IGNORECASE)
                if matches:
                    try:
                        value = float(matches[0]) if isinstance(matches[0], str) else float(matches[0][0])
                        params[param_name] = value
                        break
                    except (ValueError, IndexError):
                        continue
        
        return params
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract keywords using NLP."""
        keywords = []
        
        if self.nlp:
            doc = self.nlp(text[:5000])  # Limit text length
            
            # Extract noun phrases
            for chunk in doc.noun_chunks:
                if len(chunk.text) > 3:
                    keywords.append(chunk.text.lower())
            
            # Extract named entities
            for ent in doc.ents:
                if ent.label_ in ['GPE', 'LOC', 'ORG', 'DATE']:
                    keywords.append(ent.text.lower())
        
        # Add domain-specific keywords found
        text_lower = text.lower()
        for domain_keywords in self.DOMAIN_KEYWORDS.values():
            for kw in domain_keywords:
                if kw in text_lower and kw not in keywords:
                    keywords.append(kw)
        
        return list(set(keywords))[:30]
    
    def _infer_taxonomy(self, species_name: str) -> Dict[str, str]:
        """Infer taxonomic hierarchy from species name."""
        parts = species_name.split()
        taxonomy = {
            "kingdom": "Animalia",
            "scientificName": species_name,
        }
        
        if len(parts) >= 2:
            taxonomy["genus"] = parts[0]
            taxonomy["specificEpithet"] = parts[1]
        
        # Common genus-family mappings for marine species
        GENUS_FAMILY = {
            "Thunnus": ("Scombridae", "Scombriformes", "Actinopterygii"),
            "Coryphaena": ("Coryphaenidae", "Carangiformes", "Actinopterygii"),
            "Carcharodon": ("Lamnidae", "Lamniformes", "Chondrichthyes"),
            "Tursiops": ("Delphinidae", "Cetacea", "Mammalia"),
            "Chelonia": ("Cheloniidae", "Testudines", "Reptilia"),
            "Hippocampus": ("Syngnathidae", "Syngnathiformes", "Actinopterygii"),
            "Epinephelus": ("Serranidae", "Perciformes", "Actinopterygii"),
            "Lutjanus": ("Lutjanidae", "Perciformes", "Actinopterygii"),
        }
        
        genus = parts[0] if parts else ""
        if genus in GENUS_FAMILY:
            family, order, class_ = GENUS_FAMILY[genus]
            taxonomy["family"] = family
            taxonomy["order"] = order
            taxonomy["class"] = class_
            taxonomy["phylum"] = "Chordata"
        
        return taxonomy
    
    def _generate_darwin_core(self, metadata: ExtractedMetadata) -> Dict[str, Any]:
        """Generate Darwin Core standard fields."""
        dc = {
            "type": "Occurrence",
            "basisOfRecord": "HumanObservation",
            "institutionCode": "CMLRE",
            "collectionCode": "MARINE",
        }
        
        if metadata.species_names:
            dc["scientificName"] = metadata.species_names[0]
            if metadata.taxonomic_info:
                dc.update({
                    "kingdom": metadata.taxonomic_info.get("kingdom", ""),
                    "phylum": metadata.taxonomic_info.get("phylum", ""),
                    "class": metadata.taxonomic_info.get("class", ""),
                    "order": metadata.taxonomic_info.get("order", ""),
                    "family": metadata.taxonomic_info.get("family", ""),
                    "genus": metadata.taxonomic_info.get("genus", ""),
                    "specificEpithet": metadata.taxonomic_info.get("specificEpithet", ""),
                })
        
        if metadata.coordinates:
            dc["decimalLatitude"] = metadata.coordinates[0][0]
            dc["decimalLongitude"] = metadata.coordinates[0][1]
            dc["geodeticDatum"] = "WGS84"
        
        if metadata.dates:
            dc["eventDate"] = metadata.dates[0]
        
        if metadata.environmental_params.get("depth"):
            dc["minimumDepthInMeters"] = metadata.environmental_params["depth"]
            dc["maximumDepthInMeters"] = metadata.environmental_params["depth"]
        
        return {k: v for k, v in dc.items() if v}
    
    def _generate_obis_fields(self, metadata: ExtractedMetadata) -> Dict[str, Any]:
        """Generate OBIS (Ocean Biodiversity Information System) fields."""
        obis = {
            "occurrenceStatus": "present",
            "basisOfRecord": "HumanObservation",
        }
        
        if metadata.species_names:
            obis["scientificName"] = metadata.species_names[0]
        
        if metadata.coordinates:
            obis["decimalLatitude"] = metadata.coordinates[0][0]
            obis["decimalLongitude"] = metadata.coordinates[0][1]
        
        if metadata.dates:
            obis["eventDate"] = metadata.dates[0]
        
        if metadata.environmental_params:
            if "depth" in metadata.environmental_params:
                obis["depth"] = metadata.environmental_params["depth"]
            if "temperature" in metadata.environmental_params:
                obis["temperature"] = metadata.environmental_params["temperature"]
            if "salinity" in metadata.environmental_params:
                obis["salinity"] = metadata.environmental_params["salinity"]
        
        return {k: v for k, v in obis.items() if v}
    
    def _extract_exif(self, image: Image.Image) -> Dict[str, Any]:
        """Extract EXIF metadata from image."""
        try:
            exif = image._getexif()
            if exif:
                from PIL.ExifTags import TAGS, GPSTAGS
                exif_data = {}
                for tag_id, value in exif.items():
                    tag = TAGS.get(tag_id, tag_id)
                    exif_data[tag] = value
                return exif_data
        except:
            pass
        return {}
    
    def _convert_gps_to_decimal(self, gps_coord, ref) -> Optional[float]:
        """Convert GPS EXIF coordinates to decimal degrees."""
        try:
            if isinstance(gps_coord, tuple) and len(gps_coord) == 3:
                degrees = float(gps_coord[0])
                minutes = float(gps_coord[1])
                seconds = float(gps_coord[2])
                decimal = degrees + minutes / 60 + seconds / 3600
                if ref in ['S', 'W']:
                    decimal = -decimal
                return decimal
        except:
            pass
        return None
    
    def tag_file(self, file_path: str) -> ExtractedMetadata:
        """
        Automatically tag a file based on its type.
        
        Args:
            file_path: Path to file
            
        Returns:
            ExtractedMetadata object
        """
        ext = os.path.splitext(file_path)[1].lower()
        
        if ext in ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp']:
            return self.extract_from_image(file_path)
        elif ext in ['.csv', '.tsv']:
            return self.extract_from_csv(file_path)
        elif ext in ['.txt', '.md']:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
            return self.extract_from_text(text)
        elif ext == '.json':
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            text = json.dumps(data) if isinstance(data, dict) else str(data)
            return self.extract_from_text(text)
        else:
            return ExtractedMetadata(
                domain=DataDomain.UNKNOWN.value,
                confidence=0.0,
                warnings=[f"Unsupported file type: {ext}"]
            )


# Example usage
if __name__ == "__main__":
    tagger = MetadataTagger()
    
    # Test with sample text
    sample_text = """
    Marine Survey Report - Arabian Sea
    Date: 2024-03-15
    Location: 12.5678°N, 72.3456°E
    
    Species observed:
    - Thunnus albacares (Yellowfin tuna)
    - Coryphaena hippurus (Mahi-mahi)
    
    Environmental conditions:
    Temperature: 28.5°C
    Salinity: 35.2 PSU
    Depth: 45m
    """
    
    result = tagger.extract_from_text(sample_text)
    print(json.dumps(result.to_dict(), indent=2, default=str))
