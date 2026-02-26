import express, { Application, Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import { connectMongoDB, connectPostgreSQL } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import logger from './utils/logger';
import swaggerSpec from './config/swagger';
import { websocketService } from './utils/websocket';

import authRoutes from './routes/auth';
import speciesRoutes from './routes/species';
import oceanographyRoutes from './routes/oceanography';
import otolithRoutes from './routes/otoliths';
import ednaRoutes from './routes/edna';
import ingestionRoutes from './routes/ingestion';
import analyticsRoutes from './routes/analytics';
import aiRoutes from './routes/ai';
import notificationRoutes from './routes/notifications';
import exportRoutes from './routes/export';
import correlationRoutes from './routes/correlation';
import publicApiRoutes from './routes/publicApi';
import standardsRoutes from './routes/standards';
import taxonomyRoutes from './routes/taxonomy';
import ednaAnalysisRoutes from './routes/ednaAnalysis';
import fisheriesRoutes from './routes/fisheries';
import causalRoutes from './routes/causal';
import reportingRoutes from './routes/reporting';
import auditRoutes from './routes/audit';
import validationRoutes from './routes/validation';
import governanceRoutes from './routes/governance';
import performanceRoutes from './routes/performance';
import curationRoutes from './routes/curation';
import institutesRoutes from './routes/institutes';
import projectsRoutes from './routes/projects';

// Load env from multiple candidates to ensure root-level .env is picked up
const candidateEnvPaths = [
  path.resolve(process.cwd(), '.env'),            // current working dir
  path.resolve(process.cwd(), '..', '.env'),     // parent of CWD (workspace root when running from backend)
  path.resolve(__dirname, '../.env'),            // backend/.env next to src
  path.resolve(__dirname, '../../.env'),         // workspace root relative to src
];

// First load default if present
dotenv.config();
// Then layer any existing candidate files (later ones override earlier values)
for (const p of candidateEnvPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
}

// Optional: log which DB settings are loaded (without password)
const envInfo = {
  pgHost: process.env.POSTGRES_HOST,
  pgPort: process.env.POSTGRES_PORT,
  pgDB: process.env.POSTGRES_DB,
  pgUser: process.env.POSTGRES_USER,
};
logger.info(`🔧 Env loaded for PostgreSQL: ${JSON.stringify(envInfo)}`);

const app: Application = express();

// Trust reverse proxy headers (e.g., Render/NGINX) so req.ip and rate limiting work correctly.
// - In production we default to trusting a single proxy hop.
// - You can override with TRUST_PROXY (e.g., "true", "false", "1", "2", "loopback").
const trustProxyRaw = process.env.TRUST_PROXY;
if (typeof trustProxyRaw === 'string' && trustProxyRaw.length > 0) {
  const lower = trustProxyRaw.toLowerCase();
  if (lower === 'true') {
    app.set('trust proxy', true);
  } else if (lower === 'false') {
    app.set('trust proxy', false);
  } else {
    const asNumber = Number(trustProxyRaw);
    app.set('trust proxy', Number.isFinite(asNumber) ? asNumber : trustProxyRaw);
  }
} else if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
const httpServer = createServer(app);
const PORT = process.env.BACKEND_PORT || 5000;

// Initialize WebSocket
websocketService.initialize(httpServer);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(rateLimiter);

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Public API (National Data Backbone - no auth required)
app.use('/api/public', publicApiRoutes);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/species', speciesRoutes);
app.use('/api/oceanography', oceanographyRoutes);
app.use('/api/otoliths', otolithRoutes);
app.use('/api/edna', ednaRoutes);
app.use('/api/ingest', ingestionRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/correlation', correlationRoutes);
app.use('/api/standards', standardsRoutes);
app.use('/api/taxonomy', taxonomyRoutes);
app.use('/api/edna-analysis', ednaAnalysisRoutes);
app.use('/api/fisheries', fisheriesRoutes);
app.use('/api/causal', causalRoutes);
app.use('/api/reporting', reportingRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/validation', validationRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/institutes', institutesRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/curation', curationRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use(errorHandler);

// Database connections and server start
const startServer = async () => {
  try {
    await connectMongoDB();
    await connectPostgreSQL();

    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`🔌 WebSocket server ready`);
      logger.info(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export { httpServer, websocketService };
export default app;
