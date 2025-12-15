#!/usr/bin/env python3
"""
Mock Data Generator for CMLRE Marine Platform

Generates sample datasets for testing and demonstration
"""

import random
import json
import csv
from datetime import datetime, timedelta
from typing import List, Dict
import os

# Sample data pools
SPECIES_NAMES = [
    ("Thunnus albacares", "Yellowfin tuna"),
    ("Katsuwonus pelamis", "Skipjack tuna"),
    ("Sardinella longiceps", "Indian oil sardine"),
    ("Rastrelliger kanagurta", "Indian mackerel"),
    ("Epinephelus lanceolatus", "Giant grouper"),
    ("Lutjanus campechanus", "Red snapper"),
    ("Scomberomorus commerson", "Narrow-barred Spanish mackerel"),
    ("Decapterus russelli", "Indian scad"),
    ("Euthynnus affinis", "Kawakawa"),
    ("Caranx ignobilis", "Giant trevally")
]

PHYLA = {
    "Chordata": ["Actinopterygii", "Chondrichthyes"],
    "Arthropoda": ["Malacostraca"],
    "Mollusca": ["Cephalopoda", "Bivalvia"],
    "Echinodermata": ["Asteroidea", "Echinoidea"]
}

OCEAN_PARAMETERS = ["temperature", "salinity", "chlorophyll", "dissolved_oxygen", "pH"]

REGIONS = [
    {"name": "Arabian Sea", "lat_range": (10, 24), "lon_range": (60, 75)},
    {"name": "Bay of Bengal", "lat_range": (5, 22), "lon_range": (80, 95)},
    {"name": "Indian Ocean", "lat_range": (-10, 10), "lon_range": (65, 90)}
]

def random_date(start_days_ago=365, end_days_ago=0):
    """Generate random date"""
    start = datetime.now() - timedelta(days=start_days_ago)
    end = datetime.now() - timedelta(days=end_days_ago)
    return start + (end - start) * random.random()

def random_location(region=None):
    """Generate random latitude/longitude"""
    if region is None:
        region = random.choice(REGIONS)
    
    lat = random.uniform(region["lat_range"][0], region["lat_range"][1])
    lon = random.uniform(region["lon_range"][0], region["lon_range"][1])
    return round(lat, 4), round(lon, 4)

def generate_species_records(count=100) -> List[Dict]:
    """Generate species records"""
    records = []
    
    for i in range(count):
        scientific, common = random.choice(SPECIES_NAMES)
        phylum = random.choice(list(PHYLA.keys()))
        class_name = random.choice(PHYLA[phylum])
        
        record = {
            "id": f"SPECIES_{i+1:04d}",
            "scientificName": scientific,
            "commonName": common,
            "taxonomicRank": "species",
            "kingdom": "Animalia",
            "phylum": phylum,
            "class": class_name,
            "order": "Perciformes" if phylum == "Chordata" else "Unknown",
            "family": scientific.split()[0] + "idae",
            "genus": scientific.split()[0],
            "description": f"Marine fish species found in Indian Ocean waters.",
            "habitat": random.choice(["Coral reefs", "Pelagic", "Coastal waters", "Deep sea"]),
            "distribution": [region["name"] for region in random.sample(REGIONS, k=random.randint(1, 3))],
            "conservationStatus": random.choice(["LC", "NT", "VU", "LC", "LC", "LC"])
        }
        records.append(record)
    
    return records

def generate_oceanographic_data(count=500) -> List[Dict]:
    """Generate oceanographic measurements"""
    records = []
    
    for i in range(count):
        region = random.choice(REGIONS)
        lat, lon = random_location(region)
        date = random_date(180, 0)
        param = random.choice(OCEAN_PARAMETERS)
        
        record = {
            "id": f"OCEAN_{i+1:05d}",
            "parameter": param,
            "value": round(random.uniform(20, 32) if "temperature" in param.lower() else random.uniform(30, 38), 2),
            "unit": "°C" if "temperature" in param.lower() else "PSU",
            "latitude": lat,
            "longitude": lon,
            "depth": round(random.uniform(0, 200), 1),
            "timestamp": date.isoformat(),
            "source": random.choice(["CTD", "Satellite", "Buoy", "Ship Survey"]),
            "quality": random.choice(["good", "good", "good", "fair"]),
            "region": region["name"]
        }
        records.append(record)
    
    return records

def generate_occurrence_records(count=300) -> List[Dict]:
    """Generate species occurrence records"""
    records = []
    
    for i in range(count):
        scientific, common = random.choice(SPECIES_NAMES)
        region = random.choice(REGIONS)
        lat, lon = random_location(region)
        date = random_date(365, 0)
        
        record = {
            "id": f"OCC_{i+1:05d}",
            "scientificName": scientific,
            "commonName": common,
            "latitude": lat,
            "longitude": lon,
            "date": date.strftime("%Y-%m-%d"),
            "abundance": random.randint(1, 50),
            "basisOfRecord": random.choice(["HumanObservation", "PreservedSpecimen", "LivingSpecimen"]),
            "recordedBy": random.choice(["Dr. Kumar", "Dr. Sharma", "Dr. Patel", "Field Team"]),
            "depth": round(random.uniform(0, 100), 1),
            "temperature": round(random.uniform(24, 30), 1),
            "salinity": round(random.uniform(33, 37), 1),
            "region": region["name"]
        }
        records.append(record)
    
    return records

def generate_edna_sequences(count=50) -> List[Dict]:
    """Generate eDNA detection records"""
    records = []
    bases = ['A', 'T', 'G', 'C']
    
    for i in range(count):
        scientific, _ = random.choice(SPECIES_NAMES)
        region = random.choice(REGIONS)
        lat, lon = random_location(region)
        date = random_date(180, 0)
        
        # Generate random DNA sequence
        sequence = ''.join(random.choices(bases, k=random.randint(100, 500)))
        
        record = {
            "id": f"EDNA_{i+1:04d}",
            "sequence": sequence,
            "length": len(sequence),
            "detected_species": scientific,
            "confidence": round(random.uniform(0.85, 0.99), 3),
            "method": random.choice(["BLAST", "Kraken2"]),
            "latitude": lat,
            "longitude": lon,
            "sampleDate": date.strftime("%Y-%m-%d"),
            "depth": round(random.uniform(0, 50), 1),
            "reads": random.randint(100, 5000),
            "region": region["name"]
        }
        records.append(record)
    
    return records

def generate_otolith_records(count=100) -> List[Dict]:
    """Generate otolith measurement records"""
    records = []
    
    for i in range(count):
        scientific, _ = random.choice(SPECIES_NAMES)
        
        length = round(random.uniform(5, 20), 2)
        width = round(length * random.uniform(0.6, 0.8), 2)
        area = round(length * width * random.uniform(0.7, 0.85), 2)
        perimeter = round((length + width) * 2 * random.uniform(0.8, 0.95), 2)
        
        record = {
            "id": f"OTOLITH_{i+1:04d}",
            "species": scientific,
            "length": length,
            "width": width,
            "area": area,
            "perimeter": perimeter,
            "circularity": round(random.uniform(0.6, 0.9), 3),
            "aspect_ratio": round(length / width, 3),
            "fishLength": round(random.uniform(20, 100), 1),
            "fishWeight": round(random.uniform(100, 5000), 1),
            "collectionDate": random_date(365, 0).strftime("%Y-%m-%d"),
            "confidence": round(random.uniform(0.80, 0.95), 3)
        }
        records.append(record)
    
    return records

def save_to_csv(data: List[Dict], filename: str):
    """Save data to CSV file"""
    if not data:
        return
    
    os.makedirs('database/seeds', exist_ok=True)
    filepath = os.path.join('database/seeds', filename)
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
    
    print(f"✓ Generated {filename} ({len(data)} records)")

def save_to_json(data: List[Dict], filename: str):
    """Save data to JSON file"""
    os.makedirs('database/seeds', exist_ok=True)
    filepath = os.path.join('database/seeds', filename)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"✓ Generated {filename} ({len(data)} records)")

def main():
    """Generate all mock datasets"""
    print("Generating mock data for CMLRE platform...\n")
    
    # Generate datasets
    species = generate_species_records(100)
    oceanography = generate_oceanographic_data(500)
    occurrences = generate_occurrence_records(300)
    edna = generate_edna_sequences(50)
    otoliths = generate_otolith_records(100)
    
    # Save as both CSV and JSON
    save_to_csv(species, 'species.csv')
    save_to_json(species, 'species.json')
    
    save_to_csv(oceanography, 'oceanography.csv')
    save_to_json(oceanography, 'oceanography.json')
    
    save_to_csv(occurrences, 'occurrences.csv')
    save_to_json(occurrences, 'occurrences.json')
    
    save_to_csv(edna, 'edna.csv')
    save_to_json(edna, 'edna.json')
    
    save_to_csv(otoliths, 'otoliths.csv')
    save_to_json(otoliths, 'otoliths.json')
    
    print("\n✓ All mock data generated successfully!")
    print(f"  Location: database/seeds/")
    print(f"  Total records: {len(species) + len(oceanography) + len(occurrences) + len(edna) + len(otoliths)}")

if __name__ == "__main__":
    main()
