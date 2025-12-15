# CMLRE Marine Data Platform - Deployment Guide

This guide covers deployment options for the CMLRE Marine Data Platform, from local development to production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Docker Deployment](#docker-deployment)
4. [Production Deployment](#production-deployment)
5. [Environment Configuration](#environment-configuration)
6. [Database Setup](#database-setup)
7. [SSL/TLS Configuration](#ssltls-configuration)
8. [Monitoring & Logging](#monitoring--logging)
9. [Backup & Recovery](#backup--recovery)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Storage | 20 GB | 50+ GB SSD |
| Node.js | 18.x | 20.x LTS |
| Python | 3.9 | 3.11+ |

### Required Software

- **Docker** (20.10+) and **Docker Compose** (2.0+)
- **Node.js** (18.x or 20.x LTS)
- **Python** (3.9+) with pip
- **Git**
- **PostgreSQL** (14+) - if running without Docker
- **MongoDB** (6.0+) - if running without Docker

---

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/cmlre-platform.git
cd cmlre-platform
```

### 2. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install

# AI Services
cd ../ai-services
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
# Copy example environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp ai-services/.env.example ai-services/.env
```

Edit each `.env` file with your configuration (see [Environment Configuration](#environment-configuration)).

### 4. Start Databases

```bash
# Using Docker for databases only
docker-compose up -d postgres mongodb
```

### 5. Start Services

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev

# Terminal 3 - AI Services
cd ai-services
python main.py
```

### 6. Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **API Documentation**: http://localhost:5000/api-docs
- **AI Services**: http://localhost:8000

---

## Docker Deployment

### Quick Start with Docker Compose

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### Service URLs (Docker)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:80 |
| Backend API | http://localhost:5000 |
| AI Services | http://localhost:8000 |
| PostgreSQL | localhost:5432 |
| MongoDB | localhost:27017 |

### Building Individual Images

```bash
# Build backend
docker build -f docker/backend.Dockerfile -t cmlre-backend .

# Build frontend
docker build -f docker/frontend.Dockerfile -t cmlre-frontend .

# Build AI services
docker build -f docker/ai-services.Dockerfile -t cmlre-ai .
```

---

## Production Deployment

### Option 1: Docker Swarm

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml cmlre

# Scale services
docker service scale cmlre_backend=3
docker service scale cmlre_ai-services=2
```

### Option 2: Kubernetes

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmaps.yaml
kubectl apply -f k8s/deployments/
kubectl apply -f k8s/services/
kubectl apply -f k8s/ingress.yaml
```

### Option 3: Traditional Server Deployment

#### Backend (PM2)

```bash
cd backend
npm run build

# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start dist/server.js --name cmlre-backend -i max

# Save PM2 configuration
pm2 save
pm2 startup
```

#### Frontend (Nginx)

```bash
cd frontend
npm run build

# Copy build to nginx directory
sudo cp -r dist/* /var/www/cmlre/

# Configure nginx (see nginx.conf in frontend/)
sudo cp frontend/nginx.conf /etc/nginx/sites-available/cmlre
sudo ln -s /etc/nginx/sites-available/cmlre /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### AI Services (Gunicorn/Uvicorn)

```bash
cd ai-services

# Using Uvicorn with multiple workers
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

# Or with Gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

---

## Environment Configuration

### Backend (.env)

```env
# Server
NODE_ENV=production
PORT=5000
HOST=0.0.0.0

# Database - PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=ocean_data
POSTGRES_USER=cmlre_user
POSTGRES_PASSWORD=secure_password_here

# Database - MongoDB
MONGODB_URI=mongodb://localhost:27017/ocean_platform

# Authentication
JWT_SECRET=your-super-secure-jwt-secret-min-32-chars
JWT_EXPIRES_IN=7d

# AI Services
AI_SERVICE_URL=http://localhost:8000

# File Storage
UPLOAD_PATH=./storage/uploads
MAX_FILE_SIZE=50mb

# Logging
LOG_LEVEL=info
LOG_FORMAT=combined
```

### Frontend (.env)

```env
VITE_API_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5000
VITE_AI_SERVICE_URL=http://localhost:8000
```

### AI Services (.env)

```env
# Server
HOST=0.0.0.0
PORT=8000
DEBUG=false

# Ollama (Local LLM)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama2

# Database connections (if needed)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=ocean_data
POSTGRES_USER=cmlre_user
POSTGRES_PASSWORD=secure_password_here

# Processing
MAX_WORKERS=4
BATCH_SIZE=1000
```

---

## Database Setup

### PostgreSQL

```sql
-- Create database and user
CREATE DATABASE ocean_data;
CREATE USER cmlre_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE ocean_data TO cmlre_user;

-- Run migrations (handled by Sequelize)
cd backend
npm run db:migrate
```

### MongoDB

```javascript
// Create database and user
use ocean_platform

db.createUser({
  user: "cmlre_user",
  pwd: "your_password",
  roles: [{ role: "readWrite", db: "ocean_platform" }]
})
```

### Seed Data

```bash
# Import seed data
cd database/seeds
node ../../import-data.js
```

---

## SSL/TLS Configuration

### Using Let's Encrypt (Certbot)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com -d api.your-domain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Nginx SSL Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # ... rest of configuration
}
```

---

## Monitoring & Logging

### Application Logs

```bash
# Backend logs
tail -f backend/logs/combined.log
tail -f backend/logs/error.log

# Docker logs
docker-compose logs -f backend
docker-compose logs -f ai-services

# PM2 logs
pm2 logs cmlre-backend
```

### Health Checks

```bash
# Backend health
curl http://localhost:5000/health

# AI Services health
curl http://localhost:8000/health
```

### Recommended Monitoring Tools

- **Prometheus** + **Grafana** for metrics
- **ELK Stack** (Elasticsearch, Logstash, Kibana) for logs
- **Sentry** for error tracking

---

## Backup & Recovery

### Database Backups

```bash
# PostgreSQL backup
pg_dump -U cmlre_user -h localhost ocean_data > backup_$(date +%Y%m%d).sql

# MongoDB backup
mongodump --db ocean_platform --out ./backups/$(date +%Y%m%d)
```

### Automated Backup Script

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/cmlre"
DATE=$(date +%Y%m%d_%H%M%S)

# PostgreSQL
pg_dump -U cmlre_user ocean_data | gzip > $BACKUP_DIR/postgres_$DATE.sql.gz

# MongoDB
mongodump --db ocean_platform --archive=$BACKUP_DIR/mongo_$DATE.gz --gzip

# Clean old backups (keep 7 days)
find $BACKUP_DIR -type f -mtime +7 -delete
```

### Recovery

```bash
# PostgreSQL restore
gunzip -c backup_20240115.sql.gz | psql -U cmlre_user ocean_data

# MongoDB restore
mongorestore --db ocean_platform --archive=mongo_20240115.gz --gzip
```

---

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Find process using port
netstat -tulpn | grep :5000

# Kill process
kill -9 <PID>
```

#### Database Connection Failed

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check MongoDB status
sudo systemctl status mongod

# Test connection
psql -U cmlre_user -h localhost -d ocean_data
mongosh --host localhost --port 27017
```

#### Out of Memory (AI Services)

```bash
# Increase swap
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### Docker Container Restart Loop

```bash
# Check container logs
docker logs <container_id> --tail 100

# Inspect container
docker inspect <container_id>

# Reset container
docker-compose down
docker-compose up -d
```

### Getting Help

1. Check the [API Documentation](./API.md)
2. Review [Architecture Guide](./ARCHITECTURE.md)
3. Search existing issues on GitHub
4. Open a new issue with:
   - Error messages
   - Steps to reproduce
   - Environment details

---

## Security Checklist

- [ ] Change all default passwords
- [ ] Enable SSL/TLS
- [ ] Configure firewall rules
- [ ] Set up rate limiting
- [ ] Enable CORS with specific origins
- [ ] Use environment variables for secrets
- [ ] Regular security updates
- [ ] Enable audit logging
- [ ] Set up intrusion detection
- [ ] Regular penetration testing

---

*Last updated: January 2024*
