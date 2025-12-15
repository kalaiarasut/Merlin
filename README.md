# CMLRE Marine Data Integration Platform

## Problem Statement

The Centre for Marine Living Resources and Ecology (CMLRE), under the Ministry of Earth Sciences (India), manages large volumes of heterogeneous marine datasets across multiple scientific domains: physical oceanography, chemical oceanography, biological oceanography, fisheries abundance, taxonomy, species diversity, life-history traits, otolith morphology, ecomorphology, and molecular biology including environmental DNA (eDNA) sequencing.

These datasets are scattered, stored in incompatible formats, and isolated in siloed systems, making cross-domain correlation and holistic ecosystem analysis nearly impossible.

### Current Issues

**Data Silos**: Oceanographic, biological, taxonomic, otolith, and molecular datasets exist in disconnected systems and formats (CSV, XLSX, JSON, PDF, FASTA/FASTQ, Images, GIS Layers).

**No Standardisation**: Metadata formats vary, do not follow global standards like Darwin Core, OBIS, MIxS, ISO 19115, making integration difficult.

**Unstructured & Inconsistent Data**: Species names differ, missing metadata, inconsistent location formats, duplicate fields, handwritten notes, unclassified files.

**No Cross-Domain Analytics**: Scientists cannot correlate ocean parameters with biodiversity, fish distribution, eDNA detection, or otolith morphometrics.

**No Existing Single Solution**: Tools like OBIS, FishBase, QIIME2, INCOIS, NOAA, ICES provide partial solutions, but no unified AI-enabled platform exists.

## Solution

A comprehensive AI-enabled digital platform that:

- ✅ Integrates all marine datasets into a unified system
- ✅ Automates data ingestion and metadata tagging using AI
- ✅ Provides interactive GIS visualizations
- ✅ Enables species identification via images, otoliths, and eDNA
- ✅ Supports cross-domain analytics for ecosystem assessment
- ✅ Follows international standards (Darwin Core, OBIS, MIxS, ISO 19115)

## Tech Stack

### Frontend
- **React 18** + **TypeScript**
- **TailwindCSS** for styling
- **ShadCN UI** component library
- **Leaflet** + **Deck.GL** for GIS mapping
- **Zustand** for state management
- **React Query** for data fetching

### Backend
- **Node.js** + **Express** API server
- **Python FastAPI** microservices for AI/ML
- **PostgreSQL** with **PostGIS** extension
- **MongoDB** for flexible document storage
- **Redis** for caching and sessions
- **MinIO** for S3-compatible file storage
- **JWT** authentication

### AI/ML Stack
- **Tesseract OCR** for document text extraction
- **spaCy** + **HuggingFace** for NLP and metadata extraction
- **BLAST** + **Kraken2** for eDNA sequence analysis
- **PyTorch** for custom fish/otolith classification models
- **LLaMA 3** (local) for metadata generation and data cleaning
- **scikit-learn** for correlation and statistical analysis

## Project Structure

```
Ocean/
├── frontend/                 # React TypeScript application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/           # Page components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── store/           # Zustand state management
│   │   ├── services/        # API service layer
│   │   ├── types/           # TypeScript definitions
│   │   └── utils/           # Utility functions
│   ├── public/
│   └── package.json
│
├── backend/                  # Node.js Express server
│   ├── src/
│   │   ├── routes/          # API route handlers
│   │   ├── controllers/     # Business logic
│   │   ├── models/          # Database models
│   │   ├── middleware/      # Express middleware
│   │   ├── services/        # Service layer
│   │   └── utils/           # Utilities
│   └── package.json
│
├── ai-services/              # Python AI/ML microservices
│   ├── ingestion/           # Data ingestion & cleaning
│   ├── classification/      # Fish image classifier
│   ├── otolith/            # Otolith analysis
│   ├── edna/               # eDNA sequence processing
│   ├── analytics/          # Cross-domain analytics
│   ├── llm/                # Local LLM service
│   └── requirements.txt
│
├── database/                 # Database schemas and migrations
│   ├── mongodb/             # MongoDB collections
│   ├── postgresql/          # PostgreSQL tables
│   └── seeds/              # Sample data
│
├── storage/                  # File storage structure
│   ├── uploads/             # Temporary uploads
│   ├── datasets/            # Processed datasets
│   ├── images/              # Species/otolith images
│   └── sequences/           # eDNA sequences
│
├── docker/                   # Docker configurations
│   ├── frontend.Dockerfile
│   ├── backend.Dockerfile
│   ├── ai-services.Dockerfile
│   └── docker-compose.yml
│
├── docs/                     # Documentation
│   ├── API.md              # API documentation
│   ├── SETUP.md            # Setup instructions
│   └── ARCHITECTURE.md     # System architecture
│
└── scripts/                  # Utility scripts
    ├── setup.sh
    ├── deploy.sh
    └── generate-mock-data.py
```

## Features

### 1. **Data Ingestion Portal**
- Multi-format file upload (CSV, Excel, JSON, PDF, Images, FASTA/FASTQ, ZIP)
- AI-powered data extraction and cleaning
- Automatic metadata generation following Darwin Core/OBIS/MIxS standards
- Taxonomic name standardization and validation
- Batch processing with progress tracking

### 2. **Oceanographic Visualization**
- Interactive GIS maps with multiple layers
- SST, salinity, chlorophyll, depth, currents visualization
- Time-series data playback
- Station and survey location mapping
- Real-time parameter correlations

### 3. **Species Explorer**
- Comprehensive species database
- Taxonomic tree navigation
- Species distribution maps
- Image galleries
- Life-history traits and morphological data
- eDNA detection records
- Environmental correlations

### 4. **Otolith Analysis Module**
- Image upload and preprocessing
- Automatic segmentation and shape extraction
- Morphometric measurements
- ML-based species identification
- Shape similarity search
- Comparative analysis tools

### 5. **eDNA Sequence Management**
- FASTA/FASTQ file processing
- BLAST and Kraken2 integration
- Species detection and matching
- Spatial distribution mapping
- Temporal trend analysis
- Quality control and filtering

### 6. **Cross-Domain Analytics**
- Multi-parameter correlation analysis
- Statistical modeling
- Predictive analytics
- Custom query builder
- Interactive visualizations (graphs, heatmaps, 3D plots)
- Export and reporting tools

### 7. **AI Assistant**
- Natural language queries
- Automated report generation
- Data quality insights
- Trend detection
- Anomaly identification

### 8. **Admin Console**
- User management
- System monitoring
- Data quality dashboard
- Audit logs
- Configuration management

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- Docker & Docker Compose
- PostgreSQL 14+ with PostGIS
- MongoDB 6+
- Redis 7+

### Installation

```bash
# Clone and navigate to project
cd Ocean

# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install

# Install AI service dependencies
cd ../ai-services
pip install -r requirements.txt

# Setup environment variables
cp .env.example .env
# Edit .env with your configurations

# Start with Docker Compose
docker-compose up -d
```

### Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **API Documentation**: http://localhost:5000/api-docs
- **AI Services**: http://localhost:8000

### Default Credentials

- Username: `admin@cmlre.gov.in`
- Password: `cmlre2024`

## Development

```bash
# Frontend development
cd frontend
npm run dev

# Backend development
cd backend
npm run dev

# AI services development
cd ai-services
uvicorn main:app --reload --port 8000
```

## Deployment

### Production Build

```bash
# Build all services
./scripts/deploy.sh production
```

### Docker Deployment

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## API Documentation

Comprehensive API documentation is available at `/api-docs` when the server is running.

Key endpoints:
- `POST /api/ingest` - Upload and ingest data
- `GET /api/species` - Query species database
- `GET /api/oceanography` - Access oceanographic data
- `POST /api/otolith/analyze` - Analyze otolith images
- `POST /api/edna/process` - Process eDNA sequences
- `GET /api/analytics/correlate` - Cross-domain correlation analysis

## Database Standards

This platform implements international marine data standards:

- **Darwin Core**: Biodiversity data exchange
- **OBIS**: Ocean biodiversity information
- **MIxS**: Minimum information standards for sequencing
- **ISO 19115**: Geographic metadata standards
- **CF Conventions**: Climate and forecast metadata

## Contributing

See [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for development guidelines.

## License

Developed for CMLRE, Ministry of Earth Sciences, Government of India.

## Support

For issues and support, contact: support@cmlre.gov.in

## Acknowledgments

Built with open-source tools and free AI models to ensure complete accessibility and control for CMLRE.
