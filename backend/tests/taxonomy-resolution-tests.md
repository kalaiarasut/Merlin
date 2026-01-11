# Scientific Taxonomic Authority Resolution - Test Scenarios

## Overview
Test scenarios for verifying the taxonomy resolution API is working correctly.
Uses WoRMS (World Register of Marine Species) as primary and ITIS as fallback.

---

## Prerequisites

1. Backend server running on `http://localhost:5000`

---

## API Testing with PowerShell

### 1. Test Single Name Resolution (Marine Species)

```powershell
$body = '{"name": "Thunnus albacares"}'
Invoke-RestMethod -Uri "http://localhost:5000/api/taxonomy/resolve" -Method POST -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 5
```

**Expected Response:**
- `success: true`
- `source: "worms"`
- `resolvedName: "Thunnus albacares"`
- `aphiaId` populated
- `classification` with kingdom, phylum, class, order, family, genus

---

### 2. Test Synonym Resolution

```powershell
# "Epinephelus malabaricus" is a synonym
$body = '{"name": "Katsuwonus pelamis"}'
Invoke-RestMethod -Uri "http://localhost:5000/api/taxonomy/resolve" -Method POST -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 5
```

**Expected:** Resolves to accepted scientific name with `isSynonym` flag if applicable

---

### 3. Test Name Validation

```powershell
$body = '{"name": "Rastrelliger kanagurta"}'
Invoke-RestMethod -Uri "http://localhost:5000/api/taxonomy/validate" -Method POST -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 5
```

**Expected:**
- `valid: true`
- `isMarine: true`
- `confidence: 90+%`
- `issues: []` (empty if correct)

---

### 4. Test Invalid Name

```powershell
$body = '{"name": "Fakeus speciesus"}'
Invoke-RestMethod -Uri "http://localhost:5000/api/taxonomy/resolve" -Method POST -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 5
```

**Expected:**
- `success: false`
- `error: "No match found"`

---

### 5. Test Batch Resolution

```powershell
$body = '{"names": ["Thunnus albacares", "Sardina pilchardus", "Rastrelliger kanagurta"]}'
Invoke-RestMethod -Uri "http://localhost:5000/api/taxonomy/resolve-batch" -Method POST -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 6
```

**Expected:**
- `total: 3`
- `resolved: 3`
- `summary.wormsMatches: 3`
- All results with `success: true`

---

### 6. Test Search (Autocomplete)

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/taxonomy/search?q=Thunnus&limit=5" -Method GET | ConvertTo-Json -Depth 4
```

**Expected:**
- Multiple results for genus "Thunnus"
- Each with name, authority, taxonId, source

---

### 7. Test Stats Endpoint

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/taxonomy/stats" -Method GET | ConvertTo-Json -Depth 3
```

**Expected:**
- Cache statistics
- Source information (WoRMS, ITIS)

---

## Expected Behavior Summary

| Test Case | Expected Result |
|-----------|-----------------|
| Valid marine species | WoRMS match, confidence 90%+ |
| Synonym | Resolves to accepted name |
| Invalid name | success: false, error message |
| Batch (3 names) | All resolved |
| Search autocomplete | Multiple genus matches |

---

## Files Created

| File | Purpose |
|------|---------|
| `services/taxonomy/wormsService.ts` | WoRMS API integration with caching |
| `services/taxonomy/itisService.ts` | ITIS fallback for non-marine |
| `services/taxonomy/taxonomyResolver.ts` | Unified resolver |
| `services/taxonomy/index.ts` | Module exports |
| `routes/taxonomy.ts` | REST API endpoints |
