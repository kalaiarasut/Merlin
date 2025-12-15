# CMLRE Marine Data Platform - API Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication

All endpoints (except `/auth/login` and `/auth/register`) require JWT authentication.

### Headers
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

## Endpoints

### Authentication

#### POST /auth/login
Login to the platform.

**Request Body:**
```json
{
  "email": "admin@cmlre.gov.in",
  "password": "cmlre2024"
}
```

**Response:**
```json
{
  "user": {
    "id": "1",
    "email": "admin@cmlre.gov.in",
    "name": "CMLRE Administrator",
    "role": "admin",
    "organization": "CMLRE - Ministry of Earth Sciences"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### POST /auth/register
Register a new user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secure_password",
  "name": "John Doe",
  "organization": "Research Institute"
}
```

---

### Species

#### GET /species
Get list of species with pagination and filters.

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `search` (string): Search in scientific/common name
- `phylum` (string): Filter by phylum
- `class` (string): Filter by class

**Response:**
```json
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "scientificName": "Thunnus albacares",
      "commonName": "Yellowfin tuna",
      "phylum": "Chordata",
      "class": "Actinopterygii",
      "order": "Scombriformes",
      "family": "Scombridae",
      "genus": "Thunnus"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 450,
    "pages": 23
  }
}
```

#### GET /species/:id
Get species details by ID.

#### POST /species
Create new species record (requires authentication).

**Request Body:**
```json
{
  "scientificName": "Epinephelus lanceolatus",
  "commonName": "Giant grouper",
  "taxonomicRank": "species",
  "kingdom": "Animalia",
  "phylum": "Chordata",
  "class": "Actinopterygii",
  "order": "Perciformes",
  "family": "Serranidae",
  "genus": "Epinephelus",
  "habitat": "Coral reefs, rocky areas",
  "distribution": ["Indo-Pacific", "Arabian Sea"]
}
```

---

### Oceanography

#### GET /oceanography
Get oceanographic data with spatial and temporal filters.

**Query Parameters:**
- `parameter` (string): Temperature, salinity, chlorophyll, etc.
- `startDate` (ISO date): Start date
- `endDate` (ISO date): End date
- `minLat`, `maxLat`, `minLon`, `maxLon` (numbers): Bounding box
- `depth` (number): Depth filter

**Response:**
```json
{
  "data": [
    {
      "parameter": "temperature",
      "value": 28.5,
      "unit": "°C",
      "location": {
        "type": "Point",
        "coordinates": [72.5, 15.3]
      },
      "depth": 10,
      "timestamp": "2024-03-15T10:30:00Z",
      "source": "CTD Sensor"
    }
  ]
}
```

#### GET /oceanography/parameters
Get list of available parameters.

---

### Otoliths

#### GET /otoliths
Get otolith records.

#### POST /otoliths/analyze
Analyze otolith image.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: Form data with `image` file

**Response:**
```json
{
  "measurements": {
    "length": 12.5,
    "width": 8.3,
    "area": 82.4,
    "perimeter": 35.6,
    "circularity": 0.82,
    "aspect_ratio": 1.51
  },
  "predicted_species": "Lutjanus campechanus",
  "confidence": 0.91,
  "image_url": "/storage/otoliths/12345.jpg"
}
```

#### GET /otoliths/:id/similar
Find similar otoliths.

---

### eDNA

#### GET /edna
Get eDNA detection records.

#### POST /edna/process
Process eDNA sequence file.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: Form data with `sequence` file and `method` (BLAST or Kraken2)

**Response:**
```json
{
  "jobId": "job_12345",
  "status": "processing",
  "detections": [
    {
      "species": "Epinephelus lanceolatus",
      "confidence": 0.98,
      "reads": 1250,
      "method": "BLAST"
    }
  ],
  "total_reads": 50000
}
```

---

### Data Ingestion

#### POST /ingest
Upload and ingest data file.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: Form data with `file` and `dataType`

**Data Types:**
- `oceanography`: Oceanographic data
- `species`: Species records
- `taxonomy`: Taxonomic data
- `otolith`: Otolith images
- `edna`: eDNA sequences
- `survey`: Survey data

**Response:**
```json
{
  "message": "File uploaded successfully",
  "jobId": "job_67890",
  "status": "pending"
}
```

#### GET /ingest/jobs
Get list of ingestion jobs.

#### GET /ingest/jobs/:id
Get job status and results.

---

### Analytics

#### GET /analytics/stats
Get platform statistics.

**Response:**
```json
{
  "totalSpecies": 450,
  "totalOccurrences": 12450,
  "totalOtoliths": 3200,
  "totalEdnaDetections": 8900,
  "totalSurveys": 45,
  "totalStations": 320,
  "dataQualityScore": 87
}
```

#### POST /analytics/correlate
Perform cross-domain correlation analysis.

**Request Body:**
```json
{
  "xAxis": "temperature",
  "yAxis": "species_richness",
  "filters": {
    "startDate": "2023-01-01",
    "endDate": "2024-01-01",
    "region": "Arabian Sea"
  }
}
```

**Response:**
```json
{
  "correlation": 0.67,
  "p_value": 0.001,
  "significant": true,
  "sample_size": 320,
  "visualization_data": [...]
}
```

---

### AI Services

#### POST /ai/chat
Chat with local LLM for queries.

**Request Body:**
```json
{
  "message": "What is the average temperature in the Arabian Sea?",
  "context": {
    "region": "Arabian Sea"
  }
}
```

**Response:**
```json
{
  "response": "Based on the data, the average temperature in the Arabian Sea is approximately 28.5°C, with seasonal variations between 26°C and 31°C.",
  "confidence": 0.95
}
```

#### POST /ai/classify-fish
Classify fish species from image.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: Form data with `image` file

**Response:**
```json
{
  "species": "Thunnus albacares",
  "confidence": 0.89,
  "alternatives": [
    {"species": "Thunnus obesus", "confidence": 0.07},
    {"species": "Katsuwonus pelamis", "confidence": 0.04}
  ]
}
```

---

## Error Responses

All endpoints return standard error responses:

```json
{
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "details": {}
  }
}
```

### HTTP Status Codes
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `429`: Too Many Requests
- `500`: Internal Server Error

## Rate Limiting

API requests are rate-limited:
- **Default**: 100 requests per 15 minutes per IP
- **Authentication**: 5 attempts per 15 minutes

Headers included in response:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

## Pagination

List endpoints support pagination:

**Request:**
```
GET /api/species?page=2&limit=50
```

**Response includes:**
```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 50,
    "total": 450,
    "pages": 9
  }
}
```

## Interactive API Documentation

For interactive API testing, visit:
```
http://localhost:5000/api-docs
```

This provides Swagger UI with all endpoints, request/response schemas, and a "Try it out" feature.
