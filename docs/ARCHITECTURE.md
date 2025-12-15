# CMLRE Marine Data Platform - System Architecture

## Overview

The CMLRE Marine Data Integration Platform is a microservices-based system designed to unify heterogeneous marine datasets across multiple scientific domains into a single, AI-enabled platform for ecosystem analysis.

## System Components

### 1. Frontend (React + TypeScript)
**Technology Stack:**
- React 18 with TypeScript
- Vite for build tooling
- TailwindCSS + ShadCN UI for styling
- Zustand for state management
- React Query for data fetching
- Leaflet + Deck.GL for GIS visualization

**Key Features:**
- Responsive, modern UI
- Real-time data visualization
- Interactive maps with multiple layers
- File upload with progress tracking
- User authentication and authorization
- Dashboard with analytics

**Pages:**
- Dashboard - Overview and statistics
- Data Ingestion - Multi-format file upload
- Oceanography Viewer - Interactive GIS maps
- Species Explorer - Browse and search species
- Otolith Analysis - Image upload and analysis
- eDNA Manager - Sequence processing
- Analytics - Cross-domain correlation
- AI Assistant - Natural language queries
- Admin Console - System management

### 2. Backend API (Node.js + Express)
**Technology Stack:**
- Node.js 18+ with TypeScript
- Express.js for REST API
- JWT for authentication
- Multer for file uploads
- Swagger for API documentation
- Winston for logging

**Key Features:**
- RESTful API design
- JWT-based authentication
- Role-based access control (RBAC)
- Rate limiting and security
- File upload handling
- Data validation
- Error handling middleware
- API documentation (Swagger)

**API Routes:**
- `/api/auth` - Authentication
- `/api/species` - Species management
- `/api/oceanography` - Oceanographic data
- `/api/otoliths` - Otolith records
- `/api/edna` - eDNA detections
- `/api/ingest` - Data ingestion
- `/api/analytics` - Cross-domain analytics
- `/api/ai` - AI services proxy

### 3. AI/ML Microservices (Python + FastAPI)
**Technology Stack:**
- Python 3.10+
- FastAPI for async API
- PyTorch for deep learning
- OpenCV + scikit-image for image processing
- spaCy + Transformers for NLP
- Biopython for sequence analysis
- LLaMA 3 (local) for LLM

**AI Modules:**

#### Fish Classification
- Transfer learning with ResNet50/EfficientNet
- Fine-tuned on marine fish species
- Real-time species identification
- Confidence scoring and alternatives

#### Otolith Analysis
- Image segmentation (Otsu's method)
- Morphometric measurements
- Fourier shape descriptors
- ML-based species prediction
- Similarity search

#### eDNA Processing
- FASTA/FASTQ parsing
- Quality filtering
- BLAST integration (local or NCBI)
- Kraken2 taxonomic classification
- Species detection aggregation

#### Data Ingestion Pipeline
- Multi-format parsing (CSV, Excel, JSON, PDF)
- OCR for scanned documents (Tesseract)
- NLP for metadata extraction (spaCy)
- Taxonomic name standardization
- Darwin Core / OBIS / MIxS formatting
- Data cleaning and validation

#### Cross-Domain Analytics
- Correlation analysis (Pearson, Spearman)
- Temporal trend analysis
- Spatial clustering (K-means)
- Biodiversity indices (Shannon, Simpson)
- Environmental niche modeling

#### Local LLM Service
- LLaMA 3 8B (GGUF format)
- Natural language queries
- Automated report generation
- Data quality insights
- Metadata generation

### 4. Databases

#### MongoDB (Document Store)
**Collections:**
- `users` - User accounts and profiles
- `species` - Species taxonomic information
- `otoliths` - Otolith records and measurements
- `edna_detections` - eDNA sequence detections
- `ingestion_jobs` - Data ingestion job tracking
- `surveys` - Survey metadata
- `samples` - Sample information

**Features:**
- Full-text search on species names
- Flexible schema for varied data
- Geospatial queries (2dsphere index)
- Aggregation pipeline for analytics

#### PostgreSQL + PostGIS (Spatial Database)
**Tables:**
- `oceanographic_data` - Ocean parameters with spatial-temporal data
- `occurrence_records` - Species occurrence with locations
- `survey_stations` - Sampling station locations
- `environmental_layers` - Raster/vector environmental data

**Features:**
- PostGIS for spatial operations
- Spatial indexes (GIST)
- Complex geospatial queries
- Time-series optimization

#### Redis (Cache & Queue)
**Usage:**
- Session management
- API response caching
- Job queue (Bull)
- Real-time data
- Rate limiting

### 5. Storage (MinIO)
**S3-Compatible Object Storage:**
- Uploaded files (datasets, images, sequences)
- Processed data
- Generated reports
- Model weights
- Backup archives

**Buckets:**
- `cmlre-uploads` - Temporary uploads
- `cmlre-datasets` - Processed datasets
- `cmlre-images` - Species and otolith images
- `cmlre-sequences` - eDNA sequence files
- `cmlre-models` - AI model weights

## Data Flow

### 1. Data Ingestion Flow
```
User uploads file → Backend receives → Stores in MinIO
→ Creates ingestion job → AI service processes
→ Extracts/cleans/standardizes data → Validates
→ Generates Darwin Core metadata → Stores in MongoDB/PostgreSQL
→ Updates job status → Notifies user
```

### 2. Species Identification Flow
```
User uploads image → Backend proxies to AI service
→ Fish classifier processes → Returns predictions
→ Stores result and image → Links to species record
→ Updates occurrence database
```

### 3. Otolith Analysis Flow
```
User uploads otolith image → AI service receives
→ Segments otolith → Extracts measurements
→ Calculates shape descriptors → ML model predicts species
→ Finds similar otoliths → Returns results
```

### 4. eDNA Processing Flow
```
User uploads FASTA/FASTQ → AI service receives
→ Parses sequences → Quality filters
→ Runs BLAST and/or Kraken2 → Aggregates detections
→ Links to species database → Stores spatial data
→ Returns species list with confidence
```

### 5. Analytics Flow
```
User creates query → Backend receives parameters
→ Queries MongoDB and PostgreSQL → AI service correlates
→ Calculates statistics → Generates visualizations
→ Returns results → Frontend renders charts/maps
```

## Architecture Patterns

### Microservices
- **Frontend**: Standalone React SPA
- **Backend**: Express API server
- **AI Services**: Independent FastAPI service
- **Databases**: Separate MongoDB and PostgreSQL instances

### API Gateway Pattern
Backend acts as API gateway, routing requests to appropriate services.

### CQRS (Command Query Responsibility Segregation)
- Write operations: Direct to databases
- Read operations: Cached in Redis where appropriate

### Event-Driven Processing
- Bull queue for async jobs
- Redis pub/sub for real-time updates

## Security Architecture

### Authentication & Authorization
- JWT tokens with refresh mechanism
- Role-based access control (Admin, Researcher, Viewer)
- Password hashing with bcrypt

### API Security
- HTTPS in production
- CORS configuration
- Helmet.js security headers
- Rate limiting per IP
- Input validation and sanitization
- SQL injection prevention (Sequelize ORM)
- NoSQL injection prevention (Mongoose)

### Data Security
- Encrypted connections to databases
- Secure file upload validation
- User data isolation
- Audit logging

## Scalability

### Horizontal Scaling
- Stateless backend (can run multiple instances)
- Load balancer (Nginx) for distribution
- Database read replicas
- Redis cluster for cache distribution

### Vertical Scaling
- Optimized database indexes
- Query optimization
- Caching strategy
- Async processing for heavy operations

### Performance Optimization
- CDN for static assets
- Compression (gzip)
- Lazy loading in frontend
- Database connection pooling
- API response caching
- Image optimization (Sharp)

## Deployment Architecture

### Development
- Local Node.js and Python servers
- Local databases
- Hot reloading enabled

### Production
- Docker containers
- Docker Compose orchestration
- Nginx reverse proxy
- Automated backups
- Health monitoring
- Log aggregation

### High Availability Setup (Future)
- Kubernetes orchestration
- Database replication
- Auto-scaling
- Multiple availability zones
- Disaster recovery plan

## Data Standards Compliance

### Darwin Core
- Taxonomic information
- Occurrence records
- Event data

### OBIS (Ocean Biodiversity Information System)
- Marine species occurrences
- Spatial-temporal data
- Abundance information

### MIxS (Minimum Information about Sequences)
- eDNA sequence metadata
- Environmental context
- Sampling protocols

### ISO 19115 (Geographic Metadata)
- Spatial data description
- Data quality information
- Distribution information

## Monitoring & Logging

### Application Logging
- Winston logger (structured JSON)
- Log levels: error, warn, info, debug
- Log rotation
- Centralized logging (future: ELK stack)

### Monitoring
- Health check endpoints
- System metrics (CPU, memory, disk)
- API response times
- Database performance
- Error tracking

### Analytics
- User activity tracking
- API usage statistics
- Data quality metrics
- Platform utilization reports

## Integration Points

### External APIs (Optional)
- **GBIF**: Global Biodiversity Information Facility
- **WoRMS**: World Register of Marine Species
- **OBIS**: Ocean Biodiversity Information System
- **NCBI**: For BLAST searches
- **Satellite Data**: MODIS, VIIRS for oceanographic parameters

### Data Export
- CSV, Excel, JSON formats
- Darwin Core Archive
- OBIS-compliant format
- GIS shapefiles
- API for programmatic access

## Future Enhancements

1. **Real-time Data Streaming**: Live oceanographic sensor data
2. **Mobile Application**: Field data collection app
3. **Advanced ML Models**: Deep learning for species recognition
4. **Predictive Analytics**: Species distribution modeling
5. **Collaborative Features**: Shared datasets and annotations
6. **GraphQL API**: Alternative to REST for complex queries
7. **Blockchain**: Data provenance and integrity
8. **Edge Computing**: On-device processing for remote locations

## Technology Justification

### Why Node.js for Backend?
- JavaScript/TypeScript ecosystem
- Large package ecosystem (npm)
- Good performance for I/O operations
- Easy integration with frontend

### Why Python for AI Services?
- Best ML/AI libraries (PyTorch, TensorFlow)
- Strong data science ecosystem
- Excellent image processing libraries
- Bioinformatics tool availability

### Why MongoDB?
- Flexible schema for varied data types
- Good for rapid development
- Built-in geospatial capabilities
- Horizontal scaling

### Why PostgreSQL?
- ACID compliance for critical data
- PostGIS for advanced spatial operations
- Mature and reliable
- Strong query optimization

### Why Local LLMs?
- No API costs
- Data privacy
- No rate limits
- Full control
- Works offline

## Conclusion

This architecture provides a robust, scalable, and secure foundation for CMLRE's marine data integration needs. The modular design allows for easy maintenance, testing, and future enhancements. The use of modern, open-source technologies ensures long-term viability and community support.
