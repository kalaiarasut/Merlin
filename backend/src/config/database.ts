import mongoose from 'mongoose';
import { Sequelize } from 'sequelize';
import logger from '../utils/logger';

// MongoDB Connection
export const connectMongoDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cmlre_marine';
    await mongoose.connect(mongoUri);
    logger.info('✅ MongoDB connected successfully');
  } catch (error) {
    logger.error('❌ MongoDB connection error:', error);
    throw error;
  }
};

// PostgreSQL Connection with PostGIS
let sequelize: Sequelize | null = null;

export const getSequelize = (): Sequelize => {
  if (!sequelize) {
    sequelize = new Sequelize({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'cmlre_marine',
      username: process.env.POSTGRES_USER || 'cmlre_admin',
      password: process.env.POSTGRES_PASSWORD || 'password',
      dialect: 'postgres',
      logging: (msg) => logger.debug(msg),
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    });
  }
  return sequelize;
};

export const connectPostgreSQL = async (): Promise<void> => {
  try {
    const sequelize = getSequelize();
    await sequelize.authenticate();
    logger.info('✅ PostgreSQL connected successfully');
    
    // Enable PostGIS extension
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    logger.info('✅ PostGIS extension enabled');
    
    // Create oceanographic_data table if it doesn't exist
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS oceanographic_data (
        id SERIAL PRIMARY KEY,
        parameter VARCHAR(100) NOT NULL,
        value NUMERIC NOT NULL,
        unit VARCHAR(50),
        location GEOMETRY(POINT, 4326),
        depth NUMERIC,
        timestamp TIMESTAMP NOT NULL,
        source VARCHAR(255),
        quality_flag VARCHAR(20),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create indexes if they don't exist
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_oceanographic_location ON oceanographic_data USING GIST(location);
      CREATE INDEX IF NOT EXISTS idx_oceanographic_timestamp ON oceanographic_data(timestamp);
      CREATE INDEX IF NOT EXISTS idx_oceanographic_parameter ON oceanographic_data(parameter);
    `);
    logger.info('✅ Oceanographic data table ready');
    
    // Sync models
    await sequelize.sync({ alter: true });
    logger.info('✅ Database models synchronized');
  } catch (error) {
    logger.error('❌ PostgreSQL connection error:', error);
    throw error;
  }
};

export default { connectMongoDB, connectPostgreSQL, getSequelize };
