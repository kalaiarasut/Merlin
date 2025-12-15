# CMLRE Marine Data Platform - Setup Guide

## Prerequisites

### Required Software
- **Node.js** 18+ and npm 9+
- **Python** 3.10+
- **Docker** and Docker Compose
- **PostgreSQL** 14+ with PostGIS extension
- **MongoDB** 6+
- **Redis** 7+

### Optional (for local development without Docker)
- Tesseract OCR
- BLAST+ toolkit
- Kraken2

## Quick Start with Docker

### 1. Clone and Navigate
```powershell
cd d:\Ocean
```

### 2. Environment Configuration
```powershell
# Copy example environment file
Copy-Item .env.example .env

# Edit .env with your configurations
notepad .env
```

**Important:** Update the following in `.env`:
- Database passwords
- JWT secrets
- API keys (if using external services)

### 3. Start Services with Docker Compose
```powershell
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

### 4. Initialize Databases
```powershell
# PostgreSQL tables are auto-created via init script
# MongoDB collections are auto-created on first use

# Verify connections
docker-compose exec postgres psql -U cmlre_admin -d cmlre_marine -c "\dt"
docker-compose exec mongodb mongosh -u cmlre_admin -p cmlre_pass cmlre_marine
```

### 5. Access the Platform
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **API Documentation**: http://localhost:5000/api-docs
- **AI Services**: http://localhost:8000
- **MinIO Console**: http://localhost:9001

### Default Credentials
- **Email**: admin@cmlre.gov.in
- **Password**: cmlre2024

## Manual Setup (Without Docker)

### Frontend Setup
```powershell
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### Backend Setup
```powershell
cd backend

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start server
npm run dev
```

### AI Services Setup
```powershell
cd ai-services

# Create virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Download spaCy model
python -m spacy download en_core_web_sm

# Start FastAPI server
uvicorn main:app --reload --port 8000
```

### Database Setup

#### PostgreSQL with PostGIS
```powershell
# Install PostgreSQL 14+ and PostGIS extension

# Create database
psql -U postgres
CREATE DATABASE cmlre_marine;
\c cmlre_marine
CREATE EXTENSION postgis;

# Run initialization script
psql -U postgres -d cmlre_marine -f database/postgresql/init/01-init.sql
```

#### MongoDB
```powershell
# Install MongoDB 6+

# Start MongoDB
mongod --dbpath C:\data\db

# Initialize database
mongosh < database/mongodb/init/init.js
```

#### Redis
```powershell
# Install Redis for Windows or use Docker
docker run -d -p 6379:6379 redis:7-alpine
```

## Configuration

### Frontend Configuration
Edit `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000
VITE_AI_SERVICE_URL=http://localhost:8000
```

### Backend Configuration
Edit `backend/.env`:
```env
NODE_ENV=development
PORT=5000
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=cmlre_marine
POSTGRES_USER=cmlre_admin
POSTGRES_PASSWORD=your_password

MONGODB_URI=mongodb://localhost:27017/cmlre_marine
REDIS_HOST=localhost
REDIS_PORT=6379

JWT_SECRET=your_jwt_secret_change_in_production
```

### AI Services Configuration
Edit `ai-services/.env`:
```env
MONGODB_URI=mongodb://localhost:27017/cmlre_marine
REDIS_HOST=localhost
MODEL_PATH=./models
BLAST_PATH=/usr/bin/blastn
KRAKEN2_DB_PATH=/data/kraken2_db
```

## Testing

### Frontend Tests
```powershell
cd frontend
npm test
```

### Backend Tests
```powershell
cd backend
npm test
```

### AI Services Tests
```powershell
cd ai-services
pytest
```

## Building for Production

### Build All Services
```powershell
# Build frontend
cd frontend
npm run build

# Build backend
cd backend
npm run build

# Build Docker images for production
docker-compose -f docker-compose.prod.yml build
```

### Deploy to Production
```powershell
# Start production services
docker-compose -f docker-compose.prod.yml up -d

# Scale services
docker-compose -f docker-compose.prod.yml up -d --scale backend=3
```

## Troubleshooting

### Port Already in Use
```powershell
# Check what's using the port
netstat -ano | findstr :5000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### Database Connection Issues
```powershell
# Verify database is running
docker-compose ps postgres mongodb

# Check database logs
docker-compose logs postgres
docker-compose logs mongodb

# Test connection
docker-compose exec postgres psql -U cmlre_admin -d cmlre_marine
```

### AI Service Dependencies
```powershell
# If PyTorch installation fails, use CPU version
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# For Tesseract OCR on Windows
# Download installer from: https://github.com/UB-Mannheim/tesseract/wiki
```

### File Upload Issues
```powershell
# Ensure storage directories exist
mkdir -p storage/uploads
mkdir -p storage/datasets
mkdir -p storage/images
mkdir -p storage/sequences

# Check permissions
icacls storage /grant Everyone:F /T
```

## Development Workflow

### Adding New API Endpoints

1. **Create route handler** in `backend/src/routes/`
2. **Add controller logic** in `backend/src/controllers/`
3. **Define model** in `backend/src/models/`
4. **Add Swagger documentation** in route file
5. **Update frontend service** in `frontend/src/services/api.ts`

### Adding New AI Models

1. **Create model class** in `ai-services/`
2. **Add endpoint** in `ai-services/main.py`
3. **Update backend** to call new AI endpoint
4. **Add UI components** in frontend

## Performance Optimization

### Database Indexing
```sql
-- Add indexes for frequently queried fields
CREATE INDEX idx_species_phylum ON species(phylum);
CREATE INDEX idx_oceanographic_parameter_date ON oceanographic_data(parameter, timestamp);
```

### Caching with Redis
```javascript
// Example: Cache frequently accessed data
const cachedData = await redis.get('species:all');
if (cachedData) {
  return JSON.parse(cachedData);
}
```

### API Rate Limiting
Adjust rate limits in `backend/src/middleware/rateLimiter.ts`

## Security

### Production Checklist
- [ ] Change all default passwords
- [ ] Generate strong JWT secrets
- [ ] Enable HTTPS
- [ ] Configure CORS properly
- [ ] Enable helmet security headers
- [ ] Set up regular database backups
- [ ] Implement audit logging
- [ ] Review file upload restrictions

## Monitoring

### Health Checks
```powershell
# Check backend health
curl http://localhost:5000/health

# Check AI services
curl http://localhost:8000/
```

### Logs
```powershell
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend
docker-compose logs -f ai-services
```

## Backup and Restore

### Database Backup
```powershell
# PostgreSQL backup
docker-compose exec postgres pg_dump -U cmlre_admin cmlre_marine > backup.sql

# MongoDB backup
docker-compose exec mongodb mongodump --out /backup
```

### Restore
```powershell
# PostgreSQL restore
docker-compose exec postgres psql -U cmlre_admin cmlre_marine < backup.sql

# MongoDB restore
docker-compose exec mongodb mongorestore /backup
```

## Support

For issues and questions:
- **Email**: support@cmlre.gov.in
- **Documentation**: See `docs/` folder
- **API Docs**: http://localhost:5000/api-docs

## License

Developed for CMLRE, Ministry of Earth Sciences, Government of India.
