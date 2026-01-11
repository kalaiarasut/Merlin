# Standards Compliance Engine - Test Scenarios

## Overview
This document provides test scenarios to verify the Standards Compliance Engine is working correctly. Use these tests to validate the implementation.

---

## Prerequisites

1. Backend server running on `http://localhost:5000`
2. Frontend running on `http://localhost:3000` (for UI testing)

---

## API Testing with cURL

### 1. Test Standards Info Endpoint

```bash
curl http://localhost:5000/api/standards/info
```

**Expected Response:**
```json
{
  "success": true,
  "standards": {
    "dwc": { "name": "Darwin Core", "version": "1.6", ... },
    "obis": { "name": "OBIS Schema", "version": "2.0", ... },
    "mixs": { "name": "MIxS", "version": "6.0", ... },
    "iso19115": { "name": "ISO 19115", "version": "2014", ... },
    "cf": { "name": "CF Conventions", "version": "1.8", ... }
  }
}
```

---

### 2. Test Darwin Core Validation - VALID DATA

```bash
curl -X POST http://localhost:5000/api/standards/validate \
  -H "Content-Type: application/json" \
  -d '{
    "standard": "dwc",
    "data": [
      {
        "occurrenceID": "urn:lsid:cmlre:occurrence:001",
        "basisOfRecord": "HumanObservation",
        "scientificName": "Thunnus albacares",
        "eventDate": "2024-06-15",
        "decimalLatitude": 10.5,
        "decimalLongitude": 76.2,
        "country": "India",
        "countryCode": "IN"
      }
    ]
  }'
```

**Expected:** Score should be high (80-100%), `valid: true`

---

### 3. Test Darwin Core Validation - INVALID DATA (Missing Required Fields)

```bash
curl -X POST http://localhost:5000/api/standards/validate \
  -H "Content-Type: application/json" \
  -d '{
    "standard": "dwc",
    "data": [
      {
        "scientificName": "Thunnus albacares",
        "country": "India"
      }
    ]
  }'
```

**Expected:** 
- `valid: false`
- Errors for missing: `occurrenceID`, `basisOfRecord`, `eventDate`, `decimalLatitude`, `decimalLongitude`

---

### 4. Test Darwin Core Validation - INVALID COORDINATES

```bash
curl -X POST http://localhost:5000/api/standards/validate \
  -H "Content-Type: application/json" \
  -d '{
    "standard": "dwc",
    "data": [
      {
        "occurrenceID": "test-001",
        "basisOfRecord": "HumanObservation",
        "scientificName": "Thunnus albacares",
        "eventDate": "2024-06-15",
        "decimalLatitude": 999,
        "decimalLongitude": -500
      }
    ]
  }'
```

**Expected:**
- `valid: false`
- Errors for: latitude out of range (-90 to 90), longitude out of range (-180 to 180)

---

### 5. Test OBIS Validation

```bash
curl -X POST http://localhost:5000/api/standards/validate \
  -H "Content-Type: application/json" \
  -d '{
    "standard": "obis",
    "data": [
      {
        "id": "obis-001",
        "scientificName": "Sardina pilchardus",
        "scientificNameID": "urn:lsid:marinespecies.org:taxname:126421",
        "eventDate": "2024-03-20",
        "decimalLatitude": 8.5,
        "decimalLongitude": 76.0,
        "basisOfRecord": "HumanObservation",
        "occurrenceStatus": "present",
        "minimumDepthInMeters": 0,
        "maximumDepthInMeters": 50
      }
    ]
  }'
```

**Expected:** Score 90-100%, warnings if WoRMS ID format differs

---

### 6. Test MIxS Validation (eDNA)

```bash
curl -X POST http://localhost:5000/api/standards/validate \
  -H "Content-Type: application/json" \
  -d '{
    "standard": "mixs",
    "data": [
      {
        "sample_name": "EDNA_SAMPLE_001",
        "project_name": "Indian Ocean eDNA Survey",
        "lat_lon": "10.5 76.2",
        "geo_loc_name": "India:Kerala:Kochi",
        "collection_date": "2024-06-15",
        "env_broad_scale": "ENVO:00000447",
        "env_local_scale": "ENVO:01000023",
        "env_medium": "ENVO:00002149",
        "seq_meth": "Illumina MiSeq",
        "target_gene": "COI",
        "pcr_primers": "FWD:GGWACWGGWTGAACWGTWTAYCCYCC;REV:TANACYTCNGGRTGNCCRAARAAYCA"
      }
    ],
    "options": { "envPackage": "water" }
  }'
```

**Expected:** Score 80-100%, valid for eDNA submission

---

### 7. Test ISO 19115 Metadata Validation

```bash
curl -X POST http://localhost:5000/api/standards/validate \
  -H "Content-Type: application/json" \
  -d '{
    "standard": "iso19115",
    "data": {
      "fileIdentifier": "cmlre-dataset-2024-001",
      "title": "Marine Biodiversity Survey of Kerala Coast",
      "abstract": "Comprehensive survey of marine fish species along the Kerala coastline including species abundance, distribution patterns, and environmental correlations.",
      "language": "eng",
      "topicCategory": ["biota", "oceans"],
      "keywords": ["marine biodiversity", "fish", "Kerala", "India"],
      "dateStamp": "2024-06-20",
      "lineage": "Data collected through trawl surveys and underwater observations during monsoon season 2024.",
      "distributionFormat": "CSV",
      "referenceSystemIdentifier": "EPSG:4326",
      "geographicBoundingBox": {
        "westBoundLongitude": 74.5,
        "eastBoundLongitude": 77.5,
        "southBoundLatitude": 8.0,
        "northBoundLatitude": 12.5
      },
      "pointOfContact": {
        "individualName": "Dr. Marine Scientist",
        "organisationName": "CMLRE",
        "electronicMailAddress": "scientist@cmlre.gov.in"
      },
      "citationResponsibleParty": {
        "organisationName": "Centre for Marine Living Resources and Ecology"
      }
    }
  }'
```

**Expected:** Score 85-100%, valid for SDI cataloging

---

### 8. Test Validate-All Endpoint

```bash
curl -X POST http://localhost:5000/api/standards/validate-all \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      {
        "occurrenceID": "multi-001",
        "basisOfRecord": "HumanObservation",
        "scientificName": "Rastrelliger kanagurta",
        "eventDate": "2024-07-01",
        "decimalLatitude": 9.5,
        "decimalLongitude": 76.0,
        "waterBody": "Arabian Sea",
        "minimumDepthInMeters": 5,
        "maximumDepthInMeters": 30
      }
    ],
    "metadata": {
      "fileIdentifier": "test-001",
      "title": "Test Dataset",
      "abstract": "Testing multiple standards validation with a sample marine occurrence record.",
      "language": "eng",
      "topicCategory": ["oceans"],
      "keywords": ["test"],
      "dateStamp": "2024-07-01",
      "lineage": "Test data for validation",
      "distributionFormat": "JSON",
      "referenceSystemIdentifier": "EPSG:4326",
      "geographicBoundingBox": {
        "westBoundLongitude": 75,
        "eastBoundLongitude": 77,
        "southBoundLatitude": 9,
        "northBoundLatitude": 10
      },
      "pointOfContact": { "organisationName": "Test Org" },
      "citationResponsibleParty": { "organisationName": "Test Org" }
    }
  }'
```

**Expected:** Results for DwC (auto-detected as marine → also OBIS) and ISO 19115

---

### 9. Test Compliance Report

```bash
curl -X POST http://localhost:5000/api/standards/report/test-dataset-001 \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      {
        "occurrenceID": "report-001",
        "basisOfRecord": "HumanObservation",
        "scientificName": "Epinephelus coioides",
        "eventDate": "2024-05-15",
        "decimalLatitude": 10.2,
        "decimalLongitude": 76.5
      }
    ]
  }'
```

**Expected:**
- `overallScore`: 60-80 (missing optional fields)
- `recommendations`: Array with suggestions
- `grade`: Object with grade letter and color

---

### 10. Test Pre-Upload Check (Auto-Reject)

```bash
# Test with VERY BAD data (should be rejected)
curl -X POST http://localhost:5000/api/standards/check-upload \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      { "randomField": "no valid fields" },
      { "anotherBad": "record" }
    ],
    "threshold": 50
  }'
```

**Expected:**
- `canUpload: false`
- `rejection.reject: true`
- `rejection.reason`: Message about low compliance

---

## Expected Behavior Summary

| Test Case | Expected Result |
|-----------|-----------------|
| Valid DwC data | Score 80-100%, valid: true |
| Missing required fields | valid: false, error list |
| Invalid coordinates | valid: false, range errors |
| Valid OBIS marine data | Score 90-100% |
| Valid MIxS eDNA data | Score 80-100% |
| Valid ISO 19115 metadata | Score 85-100% |
| Multiple standards | Results for each applicable standard |
| Bad data upload check | canUpload: false |

---

## Troubleshooting

### Common Issues

1. **"Route not found" error**
   - Ensure routes are registered in `server.ts`
   - Check server restart after changes

2. **Validation errors on valid data**
   - Check field names match exact DwC/OBIS terms (case-sensitive)
   - Verify date format is ISO 8601

3. **Low scores unexpectedly**
   - Review warnings in response
   - Add optional but recommended fields

---

## Files Created

| File | Purpose |
|------|---------|
| `services/standards/darwinCoreValidator.ts` | DwC validation (40+ terms) |
| `services/standards/obisValidator.ts` | OBIS marine validation |
| `services/standards/mixsValidator.ts` | MIxS 6.0 eDNA validation |
| `services/standards/iso19115Validator.ts` | ISO 19115 metadata |
| `services/standards/cfConventionValidator.ts` | NetCDF CF conventions |
| `services/standards/complianceScorer.ts` | Aggregated scoring |
| `services/standards/index.ts` | Module exports |
| `services/exports/standardsExport.ts` | DwC-A, OBIS-CSV, MIxS-JSON |
| `routes/standards.ts` | REST API endpoints |
