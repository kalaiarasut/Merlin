# CMLRE Marine Data Integration Platform

<div align="center">

**AI-Enabled Unified Marine Data Integration System**

*A comprehensive platform for managing, analyzing, and visualizing marine datasets with integrated AI capabilities*

[![Frontend](https://img.shields.io/badge/Frontend-React%2018-61DAFB?logo=react)](https://reactjs.org/)
[![Backend](https://img.shields.io/badge/Backend-Node.js%20Express-339933?logo=node.js)](https://nodejs.org/)
[![AI](https://img.shields.io/badge/AI-FastAPI%20Python-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20MongoDB-336791?logo=postgresql)](https://www.postgresql.org/)

</div>

---

## Problem Statement

The Centre for Marine Living Resources and Ecology (CMLRE), under the Ministry of Earth Sciences (India), manages large volumes of heterogeneous marine datasets across multiple scientific domains: physical oceanography, chemical oceanography, biological oceanography, fisheries abundance, taxonomy, species diversity, life-history traits, otolith morphology, ecomorphology, and molecular biology including environmental DNA (eDNA) sequencing.

These datasets are scattered, stored in incompatible formats, and isolated in siloed systems, making cross-domain correlation and holistic ecosystem analysis nearly impossible.

### Current Issues

- **Data Silos**: Oceanographic, biological, taxonomic, otolith, and molecular datasets exist in disconnected systems and formats (CSV, XLSX, JSON, PDF, FASTA/FASTQ, Images, GIS Layers)
- **No Standardisation**: Metadata formats vary, do not follow global standards like Darwin Core, OBIS, MIxS, ISO 19115
- **Unstructured & Inconsistent Data**: Species names differ, missing metadata, inconsistent location formats, duplicate fields
- **No Cross-Domain Analytics**: Scientists cannot correlate ocean parameters with biodiversity, fish distribution, or eDNA detection
- **No Existing Single Solution**: Tools like OBIS, FishBase, QIIME2, INCOIS, NOAA, ICES provide partial solutions, but no unified AI-enabled platform exists

---

## Solution

A comprehensive AI-enabled digital platform that:

- ✅ Integrates all marine datasets into a unified system
- ✅ Automates data ingestion and metadata tagging using AI
- ✅ Provides interactive GIS visualizations with Leaflet and Deck.GL
- ✅ Enables species identification via AI-powered image recognition
- ✅ Provides AI-assisted research with RAG-powered methodology generation
- ✅ Supports cross-domain analytics and niche modeling for ecosystem assessment
- ✅ Generates professional reports in multiple formats
- ✅ Follows international standards (Darwin Core, OBIS, MIxS, ISO 19115)

---

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** + **TypeScript** | Core framework |
| **Vite** | Build tool and dev server |
| **TailwindCSS** | Styling |
| **Radix UI** | Accessible UI primitives (Dialog, Dropdown, Tabs, etc.) |
| **Leaflet** + **Deck.GL** | GIS mapping and visualization |
| **Recharts** + **Plotly.js** | Data visualization and charts |
| **TipTap** | Rich text editing |
| **Zustand** | State management |
| **TanStack Query** | Data fetching and caching |
| **React Hook Form** + **Zod** | Form handling and validation |
| **Vitest** | Testing framework |

### Backend
| Technology | Purpose |
|------------|---------|
| **Node.js** + **Express** + **TypeScript** | API server |
| **MongoDB** (Mongoose) | Document storage (species, eDNA, otoliths, users) |
| **PostgreSQL** + **PostGIS** (Sequelize) | Relational + geospatial data (oceanography) |
| **Redis** | Caching and rate limiting |
| **Socket.IO** | Real-time notifications |
| **Bull** | Background job queue |
| **JWT** + **bcrypt** | Authentication |
| **Swagger** | API documentation |

### AI/ML Services
| Technology | Purpose |
|------------|---------|
| **FastAPI** (Python) | AI microservices API |
| **Ollama** | Local LLM inference (llama3.2) |
| **Groq API** | Cloud LLM (llama-3.3-70b-versatile) |
| **ChromaDB** | Vector database for RAG |
| **Sentence Transformers** | Text embeddings |
| **PyTorch** + **TensorFlow** | Deep learning frameworks |
| **EfficientNet-B0** | Custom fish classifier (84.8% accuracy) |
| **spaCy** + **Transformers** | NLP and text processing |
| **OpenCV** + **scikit-image** | Image processing |
| **BioPython** | Sequence analysis |
| **ReportLab** + **Matplotlib** | Report and chart generation |

### External Integrations
| Service | Purpose |
|---------|---------|
| **FishBase API** | Species data enrichment |
| **Tavily** | Web search for research |
| **NOAA ERDDAP** | Real-time satellite ocean data |
| - JPL MUR SST | Sea Surface Temperature (0.01° resolution) |
| - VIIRS Chlorophyll-a | Ocean productivity (4km resolution) |
| - SMAP Salinity | Sea Surface Salinity (0.25° resolution) |

---

## Project Structure

```
Merlin/
├── frontend/                 # React + Vite + TypeScript application
│   ├── src/
│   │   ├── components/       # UI components (Header, Sidebar, FloatingAIChat, etc.)
│   │   ├── pages/            # 16 page components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── store/            # Zustand stores (auth, map, notifications, theme)
│   │   ├── services/         # API service layer
│   │   ├── types/            # TypeScript definitions
│   │   └── lib/              # Utility functions
│   └── package.json
│
├── backend/                  # Node.js + Express + TypeScript server
│   ├── src/
│   │   ├── routes/           # 11 API route handlers
│   │   ├── models/           # MongoDB models (User, Species, IngestionJob, Notification)
│   │   ├── middleware/       # Auth, rate limiting, error handling
│   │   ├── config/           # Database connections
│   │   └── utils/            # Utilities
│   ├── storage/              # File uploads and processed data
│   └── package.json
│
├── ai-services/              # Python FastAPI AI microservices
│   ├── main.py               # Main FastAPI app (~2600 lines, all endpoints)
│   ├── chat/                 # LLM service (Ollama/Groq dual-provider)
│   │   ├── llm_service.py    # Chat completion with streaming
│   │   ├── progress.py       # Progress tracking
│   │   └── search_service.py # Web search integration
│   ├── rag/                  # RAG-powered methodology
│   │   ├── chromadb_service.py
│   │   ├── embedding_service.py
│   │   ├── rag_service.py
│   │   ├── method_classifier.py
│   │   └── protocols/        # Scientific protocol documents
│   ├── research/             # Research assistant
│   │   ├── paper_search.py   # Academic paper search
│   │   └── citations.py      # Citation handling
│   ├── analytics/            # Data analysis
│   │   ├── correlation_engine.py
│   │   ├── niche_modeler.py
│   │   ├── report_generator.py
│   │   ├── metadata_tagger.py
│   │   └── data_cleaner.py
│   ├── classification/       # Fish identification
│   │   ├── fish_classifier.py
│   │   ├── species_trainer.py
│   │   └── models/           # Trained model weights
│   ├── integrations/         # External APIs
│   │   └── fishbase_service.py
│   └── requirements.txt
│
├── database/                 # Database schemas and migrations
│   ├── mongodb/              # MongoDB init scripts
│   ├── postgresql/           # PostgreSQL + PostGIS init
│   └── seeds/                # Sample data (species, oceanography, etc.)
│
├── docker/                   # Docker configurations
│   ├── frontend.Dockerfile
│   ├── backend.Dockerfile
│   └── ai-services.Dockerfile
│
├── docs/                     # Documentation
│   ├── API.md                # API documentation
│   ├── API_EXAMPLES.md       # API usage examples
│   ├── SETUP.md              # Setup instructions
│   ├── ARCHITECTURE.md       # System architecture
│   └── DEPLOYMENT.md         # Deployment guide
│
├── scripts/                  # Utility scripts
│   ├── setup.ps1             # PowerShell setup script
│   └── generate-mock-data.py # Generate sample data
│
├── docker-compose.yml        # Docker Compose configuration
└── README.md                 # This file
```

---

## Features

### 1. Data Ingestion Portal
- Multi-format file upload (CSV, Excel, JSON, PDF, Images, FASTA/FASTQ, ZIP, NetCDF, GeoJSON)
- AI-powered data extraction and cleaning
- Automatic metadata generation following Darwin Core/OBIS/MIxS standards
- Taxonomic name standardization and validation
- Background processing with real-time progress tracking
- "AI Enhanced" badge for processed records

### 2. Standards Compliance & Taxonomy
- **Standards Validator**: Automated checks against Darwin Core, OBIS, MIxS, and ISO 19115.
- **Scoring System**: Grade-based quality assessment (A-D) with detailed error reports.
- **Taxonomy Resolver**: Auto-correction of scientific names using **WoRMS** and **ITIS**.
- **Batch Processing**: Validate thousands of species names in one go.

### 3. Oceanographic Visualization
- Interactive GIS maps powered by **Leaflet** and **Deck.GL**
- Parameters: SST, salinity, chlorophyll-a, dissolved oxygen, pH, currents, depth
- Time-series data playback with date range filtering
- Station and survey location mapping
- PostGIS-powered spatial queries
- Heatmap overlays and 3D visualization

### 4. Species Explorer
- Comprehensive species database (1000+ marine species)
- Taxonomic tree navigation (Kingdom → Species)
- Species distribution maps with occurrence data
- Image galleries with lazy loading
- Life-history traits and morphological data
- Conservation status (IUCN Red List integration)
- **FishBase data enrichment** for detailed species information
- Darwin Core compliant data export

### 5. Fish Identifier (AI-Powered)
- **Custom EfficientNet-B0 model** trained from scratch
- **84.8% validation accuracy** on 15 commercially important species
- Real-time image classification
- Confidence scoring with alternative suggestions
- Species include: Yellowfin Tuna, Bigeye Tuna, Mahi-mahi, Groupers, Snappers, Barracuda, Sailfish, Swordfish, and more
- FishBase integration for identified species details

### 6. Otolith Analysis Module
- Image upload and preprocessing
- **Ensemble age estimation** using multiple methods:
  - Ring counting analysis
  - Edge detection
  - Intensity profiling
  - Morphometric measurements
- ML-based species identification from otolith shape
- Shape similarity search across database
- Visualization of detected growth rings
- Confidence levels and age range estimation

### 7. eDNA Sequence Management
- FASTA/FASTQ file processing
- Species detection from genetic sequences
- Biodiversity metrics (Simpson's Index, Shannon Index)
- Spatial distribution mapping of detections
- Read count analysis and confidence scoring
- Quality control and filtering
- *Prepared for BLAST and Kraken2 integration*

### 8. Cross-Domain Analytics
- Multi-parameter correlation analysis
- Statistical modeling with R² values
- Custom query builder for complex analyses
- Interactive visualizations (scatter plots, heatmaps, line charts)
- AI-generated insights from data patterns
- Export results in CSV, JSON, and visualization formats

### 9. Fisheries & Stock Assessment
- **Stock Status Indicators**: MSY (Maximum Sustainable Yield) and exploitation rates.
- **Growth Modeling**: Von Bertalanffy growth parameter estimation (`K`, `Linf`).
- **Catch Trends**: Time-series analysis of Catch Per Unit Effort (CPUE).
- **Length-Frequency**: Cohort analysis and maturity ogive visualization.

### 10. Niche Modeling
- **MaxEnt-based habitat suitability modeling**
- Environmental variable selection (temperature, salinity, depth, etc.)
- Species distribution prediction maps
- Probability heatmaps for occurrence
- Model evaluation metrics
- Future scenario projections

### 11. AI Assistant
- **Dual LLM provider support**:
  - **Groq** (cloud): Fast inference, free tier, llama-3.3-70b-versatile
  - **Ollama** (local): Privacy-focused, no internet required
- Real-time **streaming responses** via Server-Sent Events
- Context-aware marine research queries
- FishBase data enrichment for species questions
- Multi-session conversation history
- Floating chat widget accessible from any page

### 12. Causal Analysis
- **Granger Causality**: Statistical testing for driver-response relationships.
- **Lag Analysis**: Identify delayed effects of environmental changes on biology.
- **Mechanism Library**: Pre-loaded ecological interactions for hypothesis testing.

### 13. AI Research Assistant (RAG-Powered)
- **Methodology generation** with scientific protocol retrieval
- **Hypothesis formation** assistance
- **Data analysis** guidance with chart generation
- **ChromaDB vector database** for document retrieval
- Source citation with confidence scores
- Academic paper search integration (Semantic Scholar, CrossRef)
- Expert review flags for complex queries

### 14. Report Generator
- Multiple output formats: **PDF, Word, Excel**
- Customizable report templates
- Date range and data source selection
- Embedded charts and visualizations
- Statistical summaries
- LLM-powered narrative generation

### 15. Validation & Governance
- **Scientific Validation**: Workflow for approving AI-generated records.
- **Curation Dashboard**: Expert review interface with WoRMS/FishBase checklists.
- **Reproducibility**: Audit trails and snapshots for every analysis run.
- **Data Governance**: Privacy controls and license management.

### 16. Admin Console
- User management (CRUD operations)
- Role-based access control (admin, researcher)
- System monitoring and health checks
- Data quality dashboard
- Audit logs
- User statistics and activity tracking

---

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- Docker & Docker Compose
- PostgreSQL 14+ with PostGIS
- MongoDB 6+
- Redis 7+

### Installation

```powershell
# Clone and navigate to project
cd Merlin

# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install

# Install AI service dependencies
cd ../ai-services
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Setup environment variables
cd ..
Copy-Item .env.example .env
# Edit .env with your configurations

# Start with Docker Compose (recommended)
docker-compose up -d
```

### Access the Application

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:3000 |
| **Backend API** | http://localhost:5000 |
| **API Documentation** | http://localhost:5000/api-docs |
| **AI Services** | http://localhost:8000 |
| **AI Services Docs** | http://localhost:8000/docs |
| **MinIO Console** | http://localhost:9001 |

### Default Credentials

- **Email**: `admin@cmlre.gov.in`
- **Password**: `cmlre2024`

---

## Development

```powershell
# Frontend development (with hot reload)
cd frontend
npm run dev

# Backend development (with nodemon)
cd backend
npm run dev

# AI services development (with auto-reload)
cd ai-services
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

### Testing

```powershell
# Frontend tests
cd frontend
npm test

# Backend tests
cd backend
npm test

# AI services tests
cd ai-services
pytest
```

---

## API Documentation

### Authentication
All protected endpoints require JWT token in header:
```
Authorization: Bearer <token>
```

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| **Auth** |||
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | User registration |
| GET | `/api/auth/users` | List users (admin) |
| **Species** |||
| GET | `/api/species` | Query species database |
| GET | `/api/species/:id` | Get species details |
| POST | `/api/species` | Create species record |
| **Oceanography** |||
| GET | `/api/oceanography` | Query oceanographic data |
| GET | `/api/oceanography/parameters` | Get available parameters |
| **Ingestion** |||
| POST | `/api/ingest` | Upload and ingest data |
| GET | `/api/ingest/jobs` | Get ingestion job status |
| DELETE | `/api/ingest/jobs/:id` | Delete ingestion job |
| **eDNA** |||
| GET | `/api/edna/samples` | List eDNA samples |
| POST | `/api/edna/samples` | Create eDNA sample |
| GET | `/api/edna/statistics` | Get biodiversity statistics |
| **Otoliths** |||
| GET | `/api/otoliths` | List otolith records |
| POST | `/api/otoliths/analyze` | Analyze otolith image |
| **Analytics** |||
| GET | `/api/analytics/summary` | Get platform statistics |
| GET | `/api/correlation/summary` | Cross-domain correlation summary |
| POST | `/api/correlation/analyze` | Run correlation analysis |
| **AI Services** (port 8000) |||
| GET | `/` | API status and endpoints |
| GET | `/ai-status` | AI system connectivity status |
| POST | `/chat` | AI chat completion |
| POST | `/chat-stream` | Streaming AI chat (SSE) |
| POST | `/classify-fish` | Fish species identification |
| POST | `/analyze-otolith` | Otolith age estimation |
| POST | `/methodology` | RAG methodology query |
| GET | `/species/{name}` | Get species from database |
| POST | `/niche-model` | Run niche modeling |
| POST | `/generate-report` | Generate report |

Full API documentation available at `/api-docs` (Swagger UI) when the server is running.

---

## Database Standards

This platform implements international marine data standards:

| Standard | Purpose |
|----------|---------|
| **Darwin Core** | Biodiversity data exchange |
| **OBIS** | Ocean biodiversity information |
| **MIxS** | Minimum information standards for sequencing |
| **ISO 19115** | Geographic metadata standards |
| **CF Conventions** | Climate and forecast metadata |

---

## Deployment

### Docker Deployment (Recommended)

```powershell
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Scale backend for production
docker-compose up -d --scale backend=3
```

### Production Build

```powershell
# Build frontend
cd frontend
npm run build

# Build backend
cd backend
npm run build

# Build production Docker images
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

---

## Environment Variables

Key configuration in `.env`:

```env
# Application
NODE_ENV=development
BACKEND_PORT=5000
FRONTEND_PORT=3000
AI_SERVICES_PORT=8000

# Databases
POSTGRES_HOST=localhost
POSTGRES_DB=cmlre_marine
MONGODB_URI=mongodb://localhost:27017/cmlre_marine
REDIS_HOST=localhost

# Authentication
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

# AI Services
GROQ_API_KEY=your_groq_api_key  # Optional: for cloud LLM
OLLAMA_URL=http://localhost:11434  # For local LLM
AI_SERVICE_URL=http://localhost:8000  # Backend -> Python AI services base URL

# Frontend (Vite/Vercel)
# Set these in your Vercel project (Environment Variables) so the deployed UI
# calls your deployed services (NOT localhost).
VITE_API_URL=http://localhost:5000/api
VITE_AI_SERVICE_URL=http://localhost:8000
```

See `.env.example` for complete configuration options.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [docs/SETUP.md](./docs/SETUP.md) for development setup details.

---

## License

Developed for CMLRE, Ministry of Earth Sciences, Government of India.

---

## Support

For issues and support:
- **Email**: support@cmlre.gov.in
- **Documentation**: See `docs/` folder
- **API Docs**: http://localhost:5000/api-docs
- **AI Docs**: http://localhost:8000/docs

---

## Acknowledgments

Built with open-source tools and AI models to ensure complete accessibility and control for CMLRE. Special thanks to:
- FishBase for species data
- Groq for cloud LLM API
- Ollama for local LLM inference
- The open-source community for the amazing tools and libraries
