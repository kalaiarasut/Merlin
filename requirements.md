# Software Requirements Specification (SRS) - Merlin Platform

## 1. Introduction

### 1.1 Purpose
The purpose of this document is to define the functional and non-functional requirements for the **Merlin Platform**, a comprehensive AI-enabled marine data integration and analysis system developed for the "AI for Bharat" AWS Hackathon. This document serves as the primary reference for system design, development, and validation.

### 1.2 Scope
The Merlin platform addresses the critical fragmentation of India's marine data ecosystem. It unifies biological, oceanographic, genomic, and fisheries data into a single, scalable cloud platform. The scope includes:
-   **Multi-domain Data Ingestion**: Automated pipeline for 7+ data formats.
-   **AI Services**: Machine learning models for species identification, otolith analysis, and niche modeling.
-   **Visualization**: 4D geospatial rendering of ocean parameters.
-   **Research Automation**: RAG-powered assistants for scientific discovery.
-   **Governance**: ISO-compliant metadata management and audit trails.

### 1.3 Target Audience
-   **Marine Biologists**: Taxonomy, species distribution, genetic analysis.
-   **Oceanographers**: Physical/chemical ocean parameter modeling.
-   **Fisheries Managers**: Stock assessment and sustainable yield analysis.
-   **Policy Makers**: Data-driven insights for Blue Economy governance.
-   **Hackathon Judges**: Technical feasibility and impact assessment.

---

## 2. User Personas

### 2.1 Dr. Aditi (Senior Scientist)
-   **Goal**: Cross-reference species occurrence with sea surface temperature anomalies.
-   **Pain Point**: Currently spends 3 days manually merging Excel sheets and downloading NetCDF files.
-   **Need**: One-click correlation analysis and visualization.

### 2.2 Rahul (Data Manager)
-   **Goal**: Archive institute cruise data and ensure it meets Darwin Core standards.
-   **Pain Point**: Validation is manual; error-prone data entry.
-   **Need**: Automated ingestion pipeline with instant validation and error reporting.

### 2.3 Priya (PhD Student)
-   **Goal**: Identify fish species from field photos and estimate age from otoliths.
-   **Pain Point**: Lack of taxonomic expertise for rare species; manual microscopy counting is slow.
-   **Need**: AI-powered identification and automated age estimation tools.

---

## 3. Functional Requirements

### 3.1 Data Ingestion & Management Module
| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-DI-01** | Multi-Format Support | High | System must accept CSV, Excel, PDF, JSON, ZIP, NetCDF, FASTA/FASTQ, and Image files. |
| **FR-DI-02** | AI Type Detection | High | System must automatically classify uploaded files with >95% accuracy. |
| **FR-DI-03** | Metadata Extraction | High | System must extract geospatial (lat/long), temporal, and taxonomic metadata automatically. |
| **FR-DI-04** | Standards Validation | Critical | Data must be validated against Darwin Core, OBIS, and ISO 19115 schemas upon ingestion. |
| **FR-DI-05** | Error Reporting | Medium | Users must receive a row-level error report for non-compliant data. |

### 3.2 Marine Visualization Module
| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-MV-01** | 4D GIS Viewer | High | Map must render Lat, Long, Depth, and Time dimensions interactively. |
| **FR-MV-02** | Layer Management | High | Users can toggle SST, Chlorophyll, Salinity, and Species Occurrence layers. |
| **FR-MV-03** | Real-time Integration | Critical | System must fetch live data from NOAA ERDDAP and Copernicus Marine Service APIs. |
| **FR-MV-04** | Spatial Filtering | Medium | Users can draw polygons to filter data by geographic region. |

### 3.3 AI Analysis Services
| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-AI-01** | Species Identification | High | Model must identify 15+ priority fish species with >85% Top-1 accuracy. |
| **FR-AI-02** | Otolith Analysis | Medium | CV pipeline must detect nucleus and annual rings for age estimation. |
| **FR-AI-03** | Niche Modeling | High | MaxEnt algorithm must generate habitat suitability maps based on environmental layers. |
| **FR-AI-04** | Research Assistant | High | RAG system must answer natural language queries using indexed scientific literature and internal data. |

### 3.4 Governance & Taxonomy
| ID | Requirement | Priority | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-GT-01** | Taxonomy Resolution | Critical | All species names must be validated against WoRMS and ITIS; synonyms must be auto-corrected. |
| **FR-GT-02** | Audit Trails | High | Every create, read, update, delete (CRUD) action must be logged with timestamp and user ID. |
| **FR-GT-03** | Provenance Hashing | High | Analysis outputs must include a cryptographic hash of input parameters for reproducibility. |

---

## 4. Non-Functional Requirements (NFR)

### 4.1 Performance
-   **NFR-PERF-01**: Map tiles must load within **200ms** under normal network conditions.
-   **NFR-PERF-02**: AI inference for image classification must complete in **<2 seconds**.
-   **NFR-PERF-03**: Batch processing of 10,000 records must complete in **<5 minutes**.

### 4.2 Scalability
-   **NFR-SCAL-01**: System must support auto-scaling of AI inference containers based on load (AWS ECS/Lambda).
-   **NFR-SCAL-02**: Database architecture must handle **TB-scale** geospatial datasets (PostGIS + S3).

### 4.3 Security
-   **NFR-SEC-01**: All data in transit must be encrypted via **TLS 1.3**.
-   **NFR-SEC-02**: Data at rest (DB and S3) must be encrypted using **AWS KMS**.
-   **NFR-SEC-03**: Authentication must use **JWT** with strictly scoped permissions (RBAC).

### 4.4 Reliability & Availability
-   **NFR-REL-01**: System uptime target is **99.9%** during business hours.
-   **NFR-REL-02**: Database must have automated daily backups with point-in-time recovery.

---

## 5. Technical Constraints
-   **Platform**: Must be deployed on **AWS Cloud**.
-   **Browser**: Optimized for Chrome/Edge (Chromium based) and Firefox.
-   **Mobile**: Responsive design for tablet access (iPad/Android tablets).

## 6. Assumptions
-   Users have a stable internet connection for GIS visualization.
-   External APIs (WoRMS, NOAA) remain available and adhere to published rate limits.

---

## 7. Future Requirements (Roadmap Phase 2)
-   **Offline Mode**: Mobile app data collection without internet.
-   **Blockchain**: Immutable ledger for critical species occurrence data.
-   **Satellite Edge Computing**: On-board processing for real-time vessel alerts.
