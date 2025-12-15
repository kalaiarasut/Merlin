"""
Data Ingestion and Cleaning Module

AI-powered data extraction, cleaning, and standardization
"""

import pytesseract
from PIL import Image
import pandas as pd
import spacy
import re
from typing import Dict, List, Any
import json

class DataIngestionPipeline:
    def __init__(self):
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except:
            print("SpaCy model not found. Run: python -m spacy download en_core_web_sm")
            self.nlp = None
    
    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """Extract text from PDF using OCR"""
        # Placeholder for PDF text extraction
        # Would use PyPDF2 + Tesseract for scanned PDFs
        return ""
    
    def extract_text_from_image(self, image_path: str) -> str:
        """Extract text from image using Tesseract OCR"""
        try:
            image = Image.open(image_path)
            text = pytesseract.image_to_string(image)
            return text
        except Exception as e:
            print(f"OCR error: {e}")
            return ""
    
    def parse_csv(self, file_path: str) -> pd.DataFrame:
        """Parse CSV with intelligent delimiter detection"""
        try:
            # Try common delimiters
            for delimiter in [',', ';', '\t', '|']:
                try:
                    df = pd.read_csv(file_path, delimiter=delimiter)
                    if len(df.columns) > 1:
                        return df
                except:
                    continue
            
            # Fallback to default
            return pd.read_csv(file_path)
        except Exception as e:
            print(f"CSV parsing error: {e}")
            return pd.DataFrame()
    
    def clean_species_names(self, names: List[str]) -> List[str]:
        """
        Standardize species names using NLP and taxonomic databases
        
        Args:
            names: List of species names (potentially inconsistent)
            
        Returns:
            List of standardized scientific names
        """
        cleaned = []
        
        for name in names:
            # Remove extra whitespace
            name = ' '.join(name.split())
            
            # Capitalize first letter of genus
            parts = name.split()
            if len(parts) >= 2:
                parts[0] = parts[0].capitalize()
                parts[1] = parts[1].lower()
                name = ' '.join(parts[:2])  # Take binomial name only
            
            # Remove common prefixes/suffixes
            name = re.sub(r'\s+(sp\.|spp\.|cf\.|aff\.)\s*', ' ', name)
            
            cleaned.append(name)
        
        return cleaned
    
    def extract_coordinates(self, text: str) -> List[tuple]:
        """
        Extract geographical coordinates from text
        
        Args:
            text: Text containing coordinates
            
        Returns:
            List of (latitude, longitude) tuples
        """
        coordinates = []
        
        # Decimal degrees pattern
        pattern = r'(-?\d+\.\d+)[°,\s]+([NS]?)[\s,]+(-?\d+\.\d+)[°,\s]+([EW]?)'
        matches = re.findall(pattern, text)
        
        for match in matches:
            lat = float(match[0])
            lon = float(match[2])
            
            # Apply direction
            if match[1] == 'S':
                lat = -abs(lat)
            if match[3] == 'W':
                lon = -abs(lon)
            
            coordinates.append((lat, lon))
        
        return coordinates
    
    def extract_dates(self, text: str) -> List[str]:
        """Extract dates from text"""
        dates = []
        
        # Common date patterns
        patterns = [
            r'\d{4}-\d{2}-\d{2}',  # YYYY-MM-DD
            r'\d{2}/\d{2}/\d{4}',  # DD/MM/YYYY
            r'\d{2}-\d{2}-\d{4}',  # DD-MM-YYYY
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text)
            dates.extend(matches)
        
        return dates
    
    def generate_darwin_core_metadata(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert data to Darwin Core standard format
        
        Args:
            data: Raw data dictionary
            
        Returns:
            Darwin Core compliant metadata
        """
        darwin_core = {
            "occurrenceID": data.get("id", ""),
            "basisOfRecord": "HumanObservation",
            "scientificName": data.get("species", ""),
            "kingdom": "Animalia",
            "phylum": data.get("phylum", ""),
            "class": data.get("class", ""),
            "order": data.get("order", ""),
            "family": data.get("family", ""),
            "genus": data.get("genus", ""),
            "specificEpithet": data.get("species", "").split()[-1] if data.get("species") else "",
            "decimalLatitude": data.get("latitude", ""),
            "decimalLongitude": data.get("longitude", ""),
            "coordinateUncertaintyInMeters": data.get("coordinate_precision", ""),
            "eventDate": data.get("date", ""),
            "habitat": data.get("habitat", ""),
            "samplingProtocol": data.get("method", ""),
            "recordedBy": data.get("collector", ""),
            "identifiedBy": data.get("identifier", ""),
            "dataGeneralizations": "None",
            "institutionCode": "CMLRE",
            "collectionCode": "MARINE",
        }
        
        # Remove empty fields
        darwin_core = {k: v for k, v in darwin_core.items() if v}
        
        return darwin_core
    
    def generate_obis_metadata(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate OBIS (Ocean Biodiversity Information System) compliant metadata
        """
        obis = {
            "id": data.get("id", ""),
            "scientificName": data.get("species", ""),
            "decimalLatitude": data.get("latitude", ""),
            "decimalLongitude": data.get("longitude", ""),
            "eventDate": data.get("date", ""),
            "minimumDepthInMeters": data.get("min_depth", ""),
            "maximumDepthInMeters": data.get("max_depth", ""),
            "waterBody": data.get("water_body", ""),
            "country": data.get("country", "India"),
            "occurrenceStatus": "present",
            "basisOfRecord": "HumanObservation",
        }
        
        return {k: v for k, v in obis.items() if v}
    
    def validate_and_clean(self, df: pd.DataFrame) -> tuple:
        """
        Validate and clean DataFrame
        
        Returns:
            (cleaned_df, errors, warnings)
        """
        errors = []
        warnings = []
        
        # Check for required columns
        required_cols = ["species", "date", "latitude", "longitude"]
        missing = [col for col in required_cols if col not in df.columns]
        
        if missing:
            errors.append(f"Missing required columns: {missing}")
        
        # Remove duplicates
        initial_len = len(df)
        df = df.drop_duplicates()
        if len(df) < initial_len:
            warnings.append(f"Removed {initial_len - len(df)} duplicate rows")
        
        # Validate coordinates
        if 'latitude' in df.columns:
            invalid_lat = df[(df['latitude'] < -90) | (df['latitude'] > 90)]
            if len(invalid_lat) > 0:
                errors.append(f"{len(invalid_lat)} rows with invalid latitude")
        
        if 'longitude' in df.columns:
            invalid_lon = df[(df['longitude'] < -180) | (df['longitude'] > 180)]
            if len(invalid_lon) > 0:
                errors.append(f"{len(invalid_lon)} rows with invalid longitude")
        
        return df, errors, warnings

# Example usage
if __name__ == "__main__":
    pipeline = DataIngestionPipeline()
    # df = pipeline.parse_csv("data.csv")
    # cleaned_df, errors, warnings = pipeline.validate_and_clean(df)
    # print(f"Errors: {errors}")
    # print(f"Warnings: {warnings}")
