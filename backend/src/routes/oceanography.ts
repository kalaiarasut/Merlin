import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getSequelize } from '../config/database';
import { QueryTypes } from 'sequelize';
import logger from '../utils/logger';

const router = Router();

// Get oceanographic data with filtering
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sequelize = getSequelize();
    const {
      parameter,
      startDate,
      endDate,
      minDepth,
      maxDepth,
      region,
      source,
      limit = 1000,
      offset = 0
    } = req.query;

    let whereClause = 'WHERE 1=1';
    const replacements: any = {};

    if (parameter) {
      whereClause += ' AND parameter = :parameter';
      replacements.parameter = parameter;
    }
    if (startDate) {
      whereClause += ' AND timestamp >= :startDate';
      replacements.startDate = startDate;
    }
    if (endDate) {
      whereClause += ' AND timestamp <= :endDate';
      replacements.endDate = endDate;
    }
    if (minDepth) {
      whereClause += ' AND depth >= :minDepth';
      replacements.minDepth = parseFloat(minDepth as string);
    }
    if (maxDepth) {
      whereClause += ' AND depth <= :maxDepth';
      replacements.maxDepth = parseFloat(maxDepth as string);
    }
    if (source) {
      whereClause += ' AND source = :source';
      replacements.source = source;
    }

    const query = `
      SELECT 
        id,
        parameter,
        value,
        unit,
        ST_X(location::geometry) as longitude,
        ST_Y(location::geometry) as latitude,
        depth,
        timestamp,
        source,
        quality_flag as quality,
        metadata
      FROM oceanographic_data
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT :limit OFFSET :offset
    `;

    replacements.limit = parseInt(limit as string);
    replacements.offset = parseInt(offset as string);

    const data = await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT
    });

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM oceanographic_data ${whereClause}`;
    const countResult: any = await sequelize.query(countQuery, {
      replacements,
      type: QueryTypes.SELECT
    });

    res.json({
      data,
      pagination: {
        total: parseInt(countResult[0]?.total || '0'),
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
  } catch (error) {
    logger.error('Error fetching oceanographic data:', error);
    res.status(500).json({ error: 'Failed to fetch oceanographic data' });
  }
});

// Get available parameters
router.get('/parameters', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sequelize = getSequelize();
    const result = await sequelize.query(
      `SELECT DISTINCT parameter, unit, COUNT(*) as count 
       FROM oceanographic_data 
       GROUP BY parameter, unit 
       ORDER BY count DESC`,
      { type: QueryTypes.SELECT }
    );
    res.json(result);
  } catch (error) {
    logger.error('Error fetching parameters:', error);
    // Return default parameters if database is empty
    res.json([
      { parameter: 'temperature', unit: '°C', count: 0 },
      { parameter: 'salinity', unit: 'PSU', count: 0 },
      { parameter: 'chlorophyll', unit: 'mg/m³', count: 0 },
      { parameter: 'dissolved_oxygen', unit: 'mg/L', count: 0 },
      { parameter: 'pH', unit: '', count: 0 }
    ]);
  }
});

// Get time range of data
router.get('/time-range', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sequelize = getSequelize();
    const result: any = await sequelize.query(
      `SELECT 
        MIN(timestamp) as start_date, 
        MAX(timestamp) as end_date,
        COUNT(*) as total_records
       FROM oceanographic_data`,
      { type: QueryTypes.SELECT }
    );
    res.json(result[0] || { start_date: null, end_date: null, total_records: 0 });
  } catch (error) {
    logger.error('Error fetching time range:', error);
    res.status(500).json({ error: 'Failed to fetch time range' });
  }
});

// Get data statistics by parameter
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sequelize = getSequelize();
    const { parameter } = req.query;

    let whereClause = '';
    const replacements: any = {};

    if (parameter) {
      whereClause = 'WHERE parameter = :parameter';
      replacements.parameter = parameter;
    }

    const result = await sequelize.query(
      `SELECT 
        parameter,
        COUNT(*) as count,
        AVG(value) as avg_value,
        MIN(value) as min_value,
        MAX(value) as max_value,
        STDDEV(value) as std_dev,
        AVG(depth) as avg_depth
       FROM oceanographic_data
       ${whereClause}
       GROUP BY parameter`,
      { replacements, type: QueryTypes.SELECT }
    );
    res.json(result);
  } catch (error) {
    logger.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get data for heatmap visualization
router.get('/heatmap', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sequelize = getSequelize();
    const { parameter = 'temperature', gridSize = 1 } = req.query;

    const result = await sequelize.query(
      `SELECT 
        ROUND(ST_X(location::geometry)::numeric / :gridSize) * :gridSize as lng,
        ROUND(ST_Y(location::geometry)::numeric / :gridSize) * :gridSize as lat,
        AVG(value) as avg_value,
        COUNT(*) as count
       FROM oceanographic_data
       WHERE parameter = :parameter
       GROUP BY lng, lat`,
      {
        replacements: { parameter, gridSize: parseFloat(gridSize as string) },
        type: QueryTypes.SELECT
      }
    );
    res.json(result);
  } catch (error) {
    logger.error('Error fetching heatmap data:', error);
    res.status(500).json({ error: 'Failed to fetch heatmap data' });
  }
});

// Get sources
router.get('/sources', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sequelize = getSequelize();
    const result = await sequelize.query(
      `SELECT DISTINCT source, COUNT(*) as count 
       FROM oceanographic_data 
       GROUP BY source 
       ORDER BY count DESC`,
      { type: QueryTypes.SELECT }
    );
    res.json(result);
  } catch (error) {
    logger.error('Error fetching sources:', error);
    res.json([]);
  }
});

// ====================================
// NOAA ERDDAP REAL DATA ENDPOINTS
// ====================================

import { erddapService } from '../utils/erddapService';
import { oceanDataIngestionService } from '../services/oceanDataIngestionService';

// Trigger manual ingestion from external sources to DB
router.post('/ingest', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.body; // Optional date YYYY-MM-DD
    const result = await oceanDataIngestionService.ingestDailyData(date);
    res.json(result);
  } catch (error) {
    logger.error('Manual ingestion error:', error);
    res.status(500).json({ error: 'Ingestion triggering failed' });
  }
});

// Get real SST data from NOAA ERDDAP
router.get('/erddap/sst', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      latMin = -15,
      latMax = 25,
      lonMin = 50,
      lonMax = 100,
      date,
      stride = 5
    } = req.query;

    const result = await erddapService.fetchSST({
      bounds: {
        latMin: parseFloat(latMin as string),
        latMax: parseFloat(latMax as string),
        lonMin: parseFloat(lonMin as string),
        lonMax: parseFloat(lonMax as string),
      },
      date: date as string,
      stride: parseInt(stride as string),
    });

    res.json(result);
  } catch (error) {
    logger.error('Error fetching ERDDAP SST:', error);
    res.status(500).json({ error: 'Failed to fetch SST data from ERDDAP' });
  }
});

// Get real Chlorophyll data from NOAA ERDDAP
router.get('/erddap/chlorophyll', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      latMin = -15,
      latMax = 25,
      lonMin = 50,
      lonMax = 100,
      date,
      stride = 10
    } = req.query;

    const result = await erddapService.fetchChlorophyll({
      bounds: {
        latMin: parseFloat(latMin as string),
        latMax: parseFloat(latMax as string),
        lonMin: parseFloat(lonMin as string),
        lonMax: parseFloat(lonMax as string),
      },
      date: date as string,
      stride: parseInt(stride as string),
    });

    res.json(result);
  } catch (error) {
    logger.error('Error fetching ERDDAP Chlorophyll:', error);
    res.status(500).json({ error: 'Failed to fetch Chlorophyll data from ERDDAP' });
  }
});

// Get real Salinity data from NOAA ERDDAP
router.get('/erddap/salinity', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      latMin = -15,
      latMax = 25,
      lonMin = 50,
      lonMax = 100,
      date,
      stride = 5
    } = req.query;

    const result = await erddapService.fetchSalinity({
      bounds: {
        latMin: parseFloat(latMin as string),
        latMax: parseFloat(latMax as string),
        lonMin: parseFloat(lonMin as string),
        lonMax: parseFloat(lonMax as string),
      },
      date: date as string,
      stride: parseInt(stride as string),
    });

    res.json(result);
  } catch (error) {
    logger.error('Error fetching ERDDAP Salinity:', error);
    res.status(500).json({ error: 'Failed to fetch Salinity data from ERDDAP' });
  }
});

// Get available external data sources
router.get('/erddap/sources', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sources = erddapService.getDataSources();
    const cacheStats = erddapService.getCacheStats();

    res.json({
      sources,
      cache: cacheStats,
      status: 'online',
    });
  } catch (error) {
    logger.error('Error getting ERDDAP sources:', error);
    res.status(500).json({ error: 'Failed to get data sources' });
  }
});

// Clear ERDDAP cache (for manual refresh)
router.post('/erddap/refresh', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    erddapService.clearCache();
    res.json({
      success: true,
      message: 'ERDDAP cache cleared. Next requests will fetch fresh data.',
    });
  } catch (error) {
    logger.error('Error clearing ERDDAP cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// ====================================
// REAL-TIME LIVE DATA STREAMING
// ====================================

// Start live data stream
router.post('/live/start', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { websocketService } = await import('../utils/websocket');

    const {
      channel = 'oceanography:live',
      parameters = ['temperature', 'salinity', 'chlorophyll'],
      intervalMs = 5000
    } = req.body;

    // Validate interval (min 1 second, max 30 seconds)
    const interval = Math.max(1000, Math.min(30000, intervalMs));

    websocketService.startLiveDataStream(channel, parameters, interval);

    logger.info(`Live data stream started: ${channel}`);

    res.json({
      success: true,
      message: `Live data stream started on channel: ${channel}`,
      channel,
      parameters,
      intervalMs: interval,
      note: 'Subscribe to this channel via WebSocket to receive updates'
    });
  } catch (error) {
    logger.error('Error starting live stream:', error);
    res.status(500).json({ error: 'Failed to start live data stream' });
  }
});

// Stop live data stream  
router.post('/live/stop', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { websocketService } = await import('../utils/websocket');

    const { channel = 'oceanography:live' } = req.body;

    websocketService.stopLiveDataStream(channel);

    logger.info(`Live data stream stopped: ${channel}`);

    res.json({
      success: true,
      message: `Live data stream stopped on channel: ${channel}`
    });
  } catch (error) {
    logger.error('Error stopping live stream:', error);
    res.status(500).json({ error: 'Failed to stop live data stream' });
  }
});

// Get live stream status
router.get('/live/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { websocketService } = await import('../utils/websocket');

    const activeStreams = websocketService.getActiveStreams();
    const connectedUsers = websocketService.getConnectedUsers();

    res.json({
      success: true,
      activeStreams,
      streamCount: activeStreams.length,
      connectedUsers,
      availableParameters: [
        'temperature',
        'salinity',
        'chlorophyll',
        'dissolved_oxygen',
        'ph'
      ]
    });
  } catch (error) {
    logger.error('Error getting stream status:', error);
    res.status(500).json({ error: 'Failed to get stream status' });
  }
});

export default router;
