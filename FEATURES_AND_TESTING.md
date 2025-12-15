# CMLRE Marine Platform - Features & Testing Guide

## Current Features

### 1. Data Ingestion & Management
- **Multi-format Upload**: CSV, Excel, JSON, NetCDF, Shapefile, GeoJSON
- **Data Types**: Oceanographic data, species records, otolith images, eDNA sequences
- **Background Processing**: Async job queue with status tracking
- **Validation**: Automated data validation and error reporting

### 2. Oceanography Viewer
- **Interactive Mapping**: Leaflet/Deck.gl powered visualizations
- **Parameters**: Temperature, salinity, chlorophyll-a, dissolved oxygen, pH, currents
- **Temporal Analysis**: Time-series data with date range filtering
- **Spatial Queries**: PostGIS-powered geographic search

### 3. Species Explorer
- **Database**: 1000+ marine species with taxonomy
- **Features**: Distribution maps, images, conservation status (IUCN)
- **Search**: Full-text search across scientific/common names
- **Standards**: Darwin Core compliant

### 4. Otolith Analysis (AI/ML)
- **Image Upload**: Drag-and-drop otolith images
- **Age Estimation**: Automated ring counting
- **Species ID**: Visual classification
- **Similar Images**: Find matching otoliths

### 5. eDNA Processing
- **Sequence Upload**: FASTA/FASTQ files
- **Methods**: BLAST, metabarcoding
- **Species Detection**: Biodiversity assessment
- **Reporting**: Detection confidence scores

### 6. AI Assistant
- **Natural Language**: Chat interface for data queries
- **Context-aware**: Understands domain-specific marine biology terms
- **Data Retrieval**: Query database via conversation

### 7. Analytics Dashboard
- **Real-time Stats**: Data coverage, species counts, sampling effort
- **Correlations**: Parameter relationships
- **Trends**: Temporal pattern analysis
- **Export**: CSV, JSON, visualizations

### 8. API & Standards
- **RESTful API**: Full CRUD operations
- **Swagger Docs**: Interactive API documentation at `/api-docs`
- **Standards**: CF Conventions, Darwin Core, ISO 19115
- **Authentication**: JWT tokens

---

## Testing Guide

### Getting Test Data

#### 1. Generate Mock Data (Recommended for Quick Start)
```powershell
# Run the included mock data generator
cd d:\Ocean
python scripts/generate-mock-data.py

# This creates:
# - database/seeds/species.json (100+ species)
# - database/seeds/oceanography.json (1000+ measurements)
# - database/seeds/otoliths.json (50+ records)
# - database/seeds/edna.json (30+ samples)
```

#### 2. Download Real Marine Data

**Oceanographic Data:**
- **NOAA NCEI**: https://www.ncei.noaa.gov/
  - Format: NetCDF (CF-compliant)
  - Example: Sea Surface Temperature, Chlorophyll
  
- **Copernicus Marine**: https://marine.copernicus.eu/
  - Format: NetCDF
  - Parameters: Temperature, salinity, currents
  
- **ARGO Floats**: https://argo.ucsd.edu/data/
  - Format: NetCDF, CSV
  - Data: Temperature, salinity profiles

**Species Data:**
- **OBIS** (Ocean Biodiversity Information System): https://obis.org/
  - Format: CSV (Darwin Core)
  - Download occurrence records
  
- **GBIF** (Global Biodiversity Information Facility): https://www.gbif.org/
  - Format: CSV, Darwin Core Archive
  - Filter: Marine species only

- **FishBase**: https://www.fishbase.org/
  - Format: Export as CSV
  - Data: Taxonomy, distribution, images

**eDNA Sequences:**
- **NCBI GenBank**: https://www.ncbi.nlm.nih.gov/genbank/
  - Format: FASTA
  - Search: Marine fish COI, 16S, 18S genes
  
- **BOLD Systems**: http://www.boldsystems.org/
  - Format: FASTA
  - Data: Barcode sequences

**Otolith Images:**
- **AFORO Database**: http://www.cmima.csic.es/aforo/
  - Format: JPG, PNG
  - Data: Fish otolith images with metadata
  
- **Create Sample Images**: Use microscope images or research papers (cite sources)

#### 3. Manual Sample Data Creation

**CSV Format (Species):**
```csv
scientificName,commonName,kingdom,phylum,class,order,family,genus,species,conservationStatus,habitat,depth_min,depth_max,latitude,longitude
Thunnus albacares,Yellowfin Tuna,Animalia,Chordata,Actinopterygii,Perciformes,Scombridae,Thunnus,albacares,NT,Pelagic,0,250,8.5,76.5
Katsuwonus pelamis,Skipjack Tuna,Animalia,Chordata,Actinopterygii,Perciformes,Scombridae,Katsuwonus,pelamis,LC,Pelagic,0,260,10.2,75.8
```

**CSV Format (Oceanography):**
```csv
timestamp,latitude,longitude,depth,temperature,salinity,dissolved_oxygen,chlorophyll_a,ph
2024-01-15T08:30:00Z,8.5,76.5,5,28.5,35.2,6.8,0.45,8.1
2024-01-15T08:30:00Z,8.5,76.5,10,28.2,35.3,6.7,0.42,8.1
2024-01-15T08:30:00Z,8.5,76.5,20,27.8,35.4,6.5,0.38,8.0
```

**JSON Format (eDNA Sample):**
```json
{
  "sampleId": "EDNA-001",
  "collectionDate": "2024-01-15T10:00:00Z",
  "location": {
    "latitude": 8.5,
    "longitude": 76.5,
    "depth": 5,
    "site": "Arabian Sea"
  },
  "method": "metabarcoding",
  "gene": "COI",
  "sequence": "ATGCGATCGATCGATCGATCG...",
  "detections": [
    {
      "species": "Thunnus albacares",
      "confidence": 0.95,
      "reads": 1250
    }
  ]
}
```

**GeoJSON Format (Sample Locations):**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [76.5, 8.5]
      },
      "properties": {
        "site": "Station A",
        "depth": 50,
        "date": "2024-01-15"
      }
    }
  ]
}
```

---

## Testing Workflows

### Test 1: Data Ingestion
1. Navigate to **Data Ingestion** page
2. Select data type (e.g., "Oceanographic Data")
3. Drag and drop CSV/NetCDF file
4. Monitor upload progress
5. Check job status
6. Verify data appears in respective viewer

**Expected Result**: File uploaded, validated, processed; success message shown

### Test 2: Oceanography Visualization
1. Go to **Oceanography Viewer**
2. Select parameter (e.g., "Temperature")
3. Choose date range
4. Apply spatial filter (draw polygon or enter coordinates)
5. View map layers and time-series charts
6. Export filtered data

**Test Data**: Use `database/seeds/oceanography.json` or upload CSV

### Test 3: Species Search
1. Navigate to **Species Explorer**
2. Search for "tuna" in search box
3. Filter by taxonomy (Family: Scombridae)
4. Click on species card for details
5. View distribution map
6. Check conservation status

**Test Data**: Use `database/seeds/species.json` or import OBIS CSV

### Test 4: Otolith Analysis
1. Go to **Otolith Analysis**
2. Upload otolith image (JPG/PNG)
3. Click "Analyze"
4. Review age estimation
5. Check species identification
6. View similar otoliths

**Test Images**: Download from AFORO or use microscope images

### Test 5: eDNA Processing
1. Navigate to **eDNA Manager**
2. Upload FASTA sequence file
3. Select method (BLAST or metabarcoding)
4. Submit for processing
5. View species detections
6. Export results

**Test Data**: Download COI sequences from BOLD Systems

### Test 6: AI Assistant
1. Open **AI Assistant**
2. Ask: "Show me all tuna species in the database"
3. Ask: "What's the average temperature at depth 50m?"
4. Ask: "Which species are endangered?"
5. Verify responses are accurate

**Requires**: AI services running on port 8000

### Test 7: Analytics
1. Go to **Analytics Dashboard**
2. View summary statistics
3. Run correlation analysis (temperature vs chlorophyll)
4. Generate trend charts
5. Export results as CSV/JSON

**Test Data**: Requires ingested oceanography data

### Test 8: API Testing
1. Open http://localhost:5000/api-docs
2. Authorize with JWT token (login first, copy token from browser DevTools > Application > Local Storage)
3. Try endpoints:
   - GET `/api/species` - List all species
   - POST `/api/species` - Create new species
   - GET `/api/oceanography?parameter=temperature` - Query data
   - POST `/api/ai/chat` - Test AI assistant

**Tools**: Swagger UI, Postman, curl, or browser fetch()

---

## Quick Test Commands

### Generate and Load Mock Data
```powershell
# Generate mock data
cd d:\Ocean
python scripts/generate-mock-data.py

# Load into MongoDB (species, otoliths, edna)
mongoimport --db cmlre_marine --collection species --file database/seeds/species.json --jsonArray

# Load into PostgreSQL (oceanography)
# Via backend API or pgAdmin import wizard
```

### Test API with curl
```powershell
# Login
$response = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" -Method POST -Body (@{email="admin@cmlre.gov.in"; password="cmlre2024"} | ConvertTo-Json) -ContentType "application/json"
$token = $response.token

# Get species
Invoke-RestMethod -Uri "http://localhost:5000/api/species" -Method GET -Headers @{Authorization="Bearer $token"}

# Get oceanography data
Invoke-RestMethod -Uri "http://localhost:5000/api/oceanography?parameter=temperature" -Method GET -Headers @{Authorization="Bearer $token"}
```

### Test File Upload
```powershell
# Upload CSV via API
$boundary = [System.Guid]::NewGuid().ToString()
$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "multipart/form-data; boundary=$boundary"
}
Invoke-RestMethod -Uri "http://localhost:5000/api/ingest" -Method POST -Headers $headers -InFile "path/to/data.csv"
```

---

## Expected Test Data Volumes

- **Species**: 100-1000 records (mock: 100)
- **Oceanography**: 1000-10000 measurements (mock: 1000)
- **Otoliths**: 50-500 images (mock: 50)
- **eDNA**: 30-300 samples (mock: 30)

---

## Troubleshooting

**Issue**: Upload fails with "Invalid format"
- Check file format matches data type
- Verify CSV headers match expected schema
- For NetCDF, ensure CF-compliance

**Issue**: Map doesn't display data
- Verify coordinates are in decimal degrees (longitude, latitude)
- Check data was successfully ingested (check job status)
- Ensure parameter filter matches available data

**Issue**: AI features return errors
- Confirm AI services running: http://localhost:8000/docs
- Check Python dependencies installed
- Review ai-services logs in terminal

**Issue**: API returns 401 Unauthorized
- Login to get fresh JWT token
- Token expires after 24 hours
- Include `Authorization: Bearer <token>` header

---

## Next Steps After Testing

1. **Performance Testing**: Load 10K+ records to test pagination and filtering
2. **Spatial Queries**: Test complex polygon queries with PostGIS
3. **Time Series**: Upload multi-year oceanography data for trend analysis
4. **Image Processing**: Batch upload otolith images
5. **Integration**: Connect to external APIs (OBIS, GBIF)
6. **Deployment**: Docker Compose for production environment

---

## Resources

- **API Documentation**: http://localhost:5000/api-docs
- **AI Services Docs**: http://localhost:8000/docs
- **Architecture**: `docs/ARCHITECTURE.md`
- **Setup Guide**: `docs/SETUP.md`
- **Mock Data Script**: `scripts/generate-mock-data.py`
