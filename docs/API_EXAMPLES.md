# CMLRE Marine Data Platform - API Examples

This document provides practical examples for using the CMLRE Marine Data Platform API.

## Table of Contents

1. [Authentication](#authentication)
2. [Species Management](#species-management)
3. [Oceanography Data](#oceanography-data)
4. [eDNA Analysis](#edna-analysis)
5. [Otolith Analysis](#otolith-analysis)
6. [Data Ingestion](#data-ingestion)
7. [Analytics](#analytics)
8. [AI Services](#ai-services)
9. [WebSocket Events](#websocket-events)
10. [Error Handling](#error-handling)

---

## Base URLs

| Environment | Base URL |
|-------------|----------|
| Development | `http://localhost:5000/api` |
| AI Services | `http://localhost:8000` |
| WebSocket | `ws://localhost:5000` |

---

## Authentication

### Register a New User

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "researcher@cmlre.gov",
    "password": "SecurePass123!",
    "name": "Dr. Marine Researcher",
    "role": "researcher"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "researcher@cmlre.gov",
      "name": "Dr. Marine Researcher",
      "role": "researcher"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "researcher@cmlre.gov",
    "password": "SecurePass123!"
  }'
```

### Using the Token

Include the JWT token in the Authorization header for all authenticated requests:

```bash
curl -X GET http://localhost:5000/api/species \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

## Species Management

### List All Species

```bash
# Basic listing
curl -X GET http://localhost:5000/api/species \
  -H "Authorization: Bearer $TOKEN"

# With pagination and filters
curl -X GET "http://localhost:5000/api/species?page=1&limit=20&family=Scombridae&status=vulnerable" \
  -H "Authorization: Bearer $TOKEN"
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20, max: 100) |
| family | string | Filter by taxonomic family |
| genus | string | Filter by genus |
| status | string | Conservation status (e.g., vulnerable, endangered) |
| habitat | string | Filter by habitat type |
| search | string | Full-text search in common/scientific names |

### Get Species by ID

```bash
curl -X GET http://localhost:5000/api/species/sp_12345 \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "sp_12345",
    "scientificName": "Thunnus albacares",
    "commonName": "Yellowfin Tuna",
    "family": "Scombridae",
    "genus": "Thunnus",
    "conservationStatus": "Near Threatened",
    "habitat": ["pelagic", "oceanic"],
    "depthRange": { "min": 0, "max": 250 },
    "distribution": {
      "type": "Polygon",
      "coordinates": [[[...]]
    },
    "morphology": {
      "maxLength": 239,
      "maxWeight": 200,
      "bodyShape": "fusiform"
    },
    "occurrences": 1847,
    "lastObserved": "2024-01-10T14:30:00Z"
  }
}
```

### Create New Species

```bash
curl -X POST http://localhost:5000/api/species \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "scientificName": "Coryphaena hippurus",
    "commonName": "Mahi-mahi",
    "family": "Coryphaenidae",
    "genus": "Coryphaena",
    "conservationStatus": "Least Concern",
    "habitat": ["pelagic"],
    "depthRange": { "min": 0, "max": 85 },
    "morphology": {
      "maxLength": 210,
      "maxWeight": 40
    }
  }'
```

### Update Species

```bash
curl -X PUT http://localhost:5000/api/species/sp_12345 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conservationStatus": "Vulnerable",
    "notes": "Population declining in northern waters"
  }'
```

### Delete Species

```bash
curl -X DELETE http://localhost:5000/api/species/sp_12345 \
  -H "Authorization: Bearer $TOKEN"
```

---

## Oceanography Data

### Get Oceanographic Measurements

```bash
# Get all measurements in a region
curl -X GET "http://localhost:5000/api/oceanography?lat_min=5&lat_max=15&lon_min=70&lon_max=80" \
  -H "Authorization: Bearer $TOKEN"

# Get specific parameter
curl -X GET "http://localhost:5000/api/oceanography?parameter=temperature&depth=50" \
  -H "Authorization: Bearer $TOKEN"

# Time range query
curl -X GET "http://localhost:5000/api/oceanography?start_date=2024-01-01&end_date=2024-01-31" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "oc_001",
      "location": {
        "type": "Point",
        "coordinates": [72.5, 8.3]
      },
      "timestamp": "2024-01-15T06:00:00Z",
      "depth": 50,
      "parameters": {
        "temperature": 26.5,
        "salinity": 35.2,
        "dissolvedOxygen": 5.8,
        "chlorophyll": 0.45,
        "ph": 8.1,
        "turbidity": 1.2
      },
      "source": "CTD_Survey_2024"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156
  }
}
```

### Submit New Measurement

```bash
curl -X POST http://localhost:5000/api/oceanography \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {
      "type": "Point",
      "coordinates": [75.0, 10.5]
    },
    "timestamp": "2024-01-20T10:30:00Z",
    "depth": 25,
    "parameters": {
      "temperature": 28.2,
      "salinity": 34.8,
      "dissolvedOxygen": 6.1
    },
    "source": "Field_Survey",
    "instrumentId": "CTD_001"
  }'
```

---

## eDNA Analysis

### Upload eDNA Sample

```bash
curl -X POST http://localhost:5000/api/edna/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@sample_sequences.fasta" \
  -F "sampleId=EDNA_2024_001" \
  -F "location={\"type\":\"Point\",\"coordinates\":[73.5,12.0]}" \
  -F "collectionDate=2024-01-15" \
  -F "waterVolume=2.0" \
  -F "filterPoreSize=0.45"
```

### Process eDNA Sample

```bash
curl -X POST http://localhost:5000/api/edna/process \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sampleId": "EDNA_2024_001",
    "options": {
      "qualityThreshold": 20,
      "minLength": 100,
      "maxLength": 500,
      "databases": ["ncbi", "bold"],
      "identityThreshold": 0.97
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sampleId": "EDNA_2024_001",
    "status": "processing",
    "jobId": "job_abc123",
    "estimatedTime": 300
  }
}
```

### Get Processing Results

```bash
curl -X GET http://localhost:5000/api/edna/results/EDNA_2024_001 \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sampleId": "EDNA_2024_001",
    "status": "completed",
    "results": {
      "totalSequences": 15420,
      "qualityFiltered": 14200,
      "speciesDetected": [
        {
          "scientificName": "Thunnus albacares",
          "commonName": "Yellowfin Tuna",
          "readCount": 2340,
          "relativeAbundance": 0.165,
          "confidence": 0.98
        },
        {
          "scientificName": "Katsuwonus pelamis",
          "commonName": "Skipjack Tuna",
          "readCount": 1890,
          "relativeAbundance": 0.133,
          "confidence": 0.96
        }
      ],
      "biodiversityMetrics": {
        "shannonIndex": 2.84,
        "simpsonIndex": 0.89,
        "speciesRichness": 45
      }
    }
  }
}
```

---

## Otolith Analysis

### Upload Otolith Image

```bash
curl -X POST http://localhost:5000/api/ai/analyze-otolith \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@otolith_sample.jpg" \
  -F "speciesId=sp_12345" \
  -F "sampleDate=2024-01-10"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "analysisId": "oto_001",
    "estimatedAge": 4,
    "ageConfidence": 0.87,
    "annuliCount": 4,
    "measurements": {
      "length": 8.5,
      "width": 4.2,
      "area": 28.3,
      "perimeter": 21.4
    },
    "edgeType": "opaque",
    "readability": "good",
    "annotations": {
      "imageUrl": "/storage/otoliths/oto_001_annotated.jpg",
      "annuliPositions": [[120, 150], [145, 175], [170, 200], [195, 225]]
    }
  }
}
```

### Batch Otolith Analysis

```bash
curl -X POST http://localhost:5000/api/ai/analyze-otolith/batch \
  -H "Authorization: Bearer $TOKEN" \
  -F "images=@otolith1.jpg" \
  -F "images=@otolith2.jpg" \
  -F "images=@otolith3.jpg" \
  -F "speciesId=sp_12345"
```

---

## Data Ingestion

### Start Data Import Job

```bash
# Upload file for ingestion
curl -X POST http://localhost:5000/api/ingestion/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@species_data.csv" \
  -F "type=species" \
  -F "options={\"skipHeader\":true,\"delimiter\":\",\"mapping\":{\"scientific_name\":\"scientificName\",\"common_name\":\"commonName\"}}"
```

### Check Job Status

```bash
curl -X GET http://localhost:5000/api/ingestion/jobs/job_12345 \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "job_12345",
    "status": "processing",
    "progress": 65,
    "totalRecords": 1000,
    "processedRecords": 650,
    "successCount": 640,
    "errorCount": 10,
    "errors": [
      {
        "row": 125,
        "field": "latitude",
        "message": "Invalid coordinate value"
      }
    ],
    "startedAt": "2024-01-15T10:30:00Z",
    "estimatedCompletion": "2024-01-15T10:35:00Z"
  }
}
```

### Bulk Export

```bash
# Export species as GeoJSON
curl -X GET "http://localhost:5000/api/export/species/geojson" \
  -H "Authorization: Bearer $TOKEN" \
  -o species_export.geojson

# Export multiple types as ZIP
curl -X POST http://localhost:5000/api/export/bulk \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "types": ["species", "occurrences", "oceanography"],
    "format": "csv",
    "filters": {
      "dateRange": {
        "start": "2024-01-01",
        "end": "2024-01-31"
      }
    }
  }' \
  -o bulk_export.zip
```

---

## Analytics

### Species Distribution Analytics

```bash
curl -X GET "http://localhost:5000/api/analytics/species-distribution?speciesId=sp_12345&resolution=monthly" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "speciesId": "sp_12345",
    "distribution": {
      "temporal": [
        { "month": "2024-01", "occurrences": 45 },
        { "month": "2024-02", "occurrences": 52 }
      ],
      "spatial": {
        "type": "FeatureCollection",
        "features": [...]
      },
      "depthDistribution": [
        { "range": "0-50m", "percentage": 35 },
        { "range": "50-100m", "percentage": 45 },
        { "range": "100-200m", "percentage": 20 }
      ]
    }
  }
}
```

### Biodiversity Hotspots

```bash
curl -X POST http://localhost:5000/api/analytics/hotspots \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "region": {
      "type": "Polygon",
      "coordinates": [[[70, 5], [85, 5], [85, 20], [70, 20], [70, 5]]]
    },
    "metric": "shannon",
    "gridSize": 0.5
  }'
```

### Correlation Analysis

```bash
curl -X POST http://localhost:5000/api/analytics/correlate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "variable1": {
      "type": "oceanography",
      "parameter": "temperature"
    },
    "variable2": {
      "type": "species_occurrence",
      "speciesId": "sp_12345"
    },
    "method": "spearman",
    "timeRange": {
      "start": "2023-01-01",
      "end": "2024-01-01"
    }
  }'
```

---

## AI Services

### Fish Species Identification

```bash
curl -X POST http://localhost:8000/identify \
  -F "image=@fish_photo.jpg"
```

**Response:**
```json
{
  "predictions": [
    {
      "species": "Thunnus albacares",
      "common_name": "Yellowfin Tuna",
      "confidence": 0.94,
      "family": "Scombridae"
    },
    {
      "species": "Thunnus obesus",
      "common_name": "Bigeye Tuna",
      "confidence": 0.04
    }
  ],
  "processing_time": 0.234
}
```

### AI Research Assistant

```bash
curl -X POST http://localhost:8000/research/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the migration patterns of yellowfin tuna in the Indian Ocean?",
    "context": {
      "region": "Indian Ocean",
      "species": ["Thunnus albacares"]
    }
  }'
```

### Species Niche Modeling

```bash
curl -X POST http://localhost:8000/niche/predict \
  -H "Content-Type: application/json" \
  -d '{
    "speciesId": "sp_12345",
    "algorithm": "maxent",
    "environmentalLayers": ["temperature", "salinity", "depth", "chlorophyll"],
    "projectionScenario": "current"
  }'
```

---

## WebSocket Events

### Connecting to WebSocket

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Connection events
socket.on('connect', () => {
  console.log('Connected to WebSocket');
});

socket.on('disconnect', () => {
  console.log('Disconnected from WebSocket');
});
```

### Subscribing to Events

```javascript
// Notifications
socket.on('notification', (data) => {
  console.log('Notification:', data);
  // { type: 'info', title: 'Analysis Complete', message: '...' }
});

// Ingestion progress
socket.on('ingestion_progress', (data) => {
  console.log('Progress:', data.progress + '%');
  // { jobId: 'job_123', progress: 45, status: 'processing' }
});

// Analysis completion
socket.on('analysis_complete', (data) => {
  console.log('Analysis done:', data);
  // { analysisId: 'ana_123', type: 'otolith', results: {...} }
});

// Real-time data updates
socket.on('data_update', (data) => {
  console.log('New data:', data);
  // { type: 'new_occurrence', data: {...} }
});
```

### Joining Rooms

```javascript
// Join a specific room for targeted updates
socket.emit('join', 'species_sp_12345');

// Leave room
socket.emit('leave', 'species_sp_12345');
```

---

## Error Handling

### Error Response Format

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTHENTICATION_ERROR` | 401 | Invalid or missing authentication |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

### Rate Limiting

- **Default limit**: 100 requests per 15 minutes
- **AI endpoints**: 10 requests per minute
- **Export endpoints**: 5 requests per minute

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705320000
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import axios from 'axios';

class CMRLEClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async login(email: string, password: string): Promise<void> {
    const response = await axios.post(`${this.baseUrl}/auth/login`, {
      email,
      password
    });
    this.token = response.data.data.token;
  }

  async getSpecies(params?: Record<string, any>): Promise<any> {
    const response = await axios.get(`${this.baseUrl}/species`, {
      headers: { Authorization: `Bearer ${this.token}` },
      params
    });
    return response.data.data;
  }

  async analyzeOtolith(imageFile: File): Promise<any> {
    const formData = new FormData();
    formData.append('image', imageFile);

    const response = await axios.post(
      `${this.baseUrl}/ai/analyze-otolith`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    return response.data.data;
  }
}

// Usage
const client = new CMRLEClient('http://localhost:5000/api');
await client.login('user@example.com', 'password');
const species = await client.getSpecies({ family: 'Scombridae' });
```

### Python

```python
import requests

class CMRLEClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.token = None

    def login(self, email: str, password: str):
        response = requests.post(
            f"{self.base_url}/auth/login",
            json={"email": email, "password": password}
        )
        response.raise_for_status()
        self.token = response.json()["data"]["token"]

    def get_species(self, **params):
        response = requests.get(
            f"{self.base_url}/species",
            headers={"Authorization": f"Bearer {self.token}"},
            params=params
        )
        response.raise_for_status()
        return response.json()["data"]

    def analyze_otolith(self, image_path: str):
        with open(image_path, "rb") as f:
            response = requests.post(
                f"{self.base_url}/ai/analyze-otolith",
                headers={"Authorization": f"Bearer {self.token}"},
                files={"image": f}
            )
        response.raise_for_status()
        return response.json()["data"]

# Usage
client = CMRLEClient("http://localhost:5000/api")
client.login("user@example.com", "password")
species = client.get_species(family="Scombridae")
```

---

*For more information, see the [API Documentation](/api-docs) or [Architecture Guide](./ARCHITECTURE.md).*
