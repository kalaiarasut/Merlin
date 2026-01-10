import logger from '../utils/logger';
import { erddapService } from '../utils/erddapService';
import { getSequelize } from '../config/database';
import { notificationService } from '../utils/notificationService';

/**
 * Service to handle ingestion of external oceanographic data into the local database
 * used for long-term analysis and correlation.
 */
class OceanDataIngestionService {
    /**
     * Fetch daily data from ERDDAP and ingest into PostgreSQL
     * @param date Optional specific date to fetch (YYYY-MM-DD)
     */
    async ingestDailyData(date?: string): Promise<{ success: boolean; stats: any; error?: string }> {
        const sequelize = getSequelize();
        const ingestDate = date || new Date().toISOString().split('T')[0];

        logger.info(`Starting ocean data ingestion for date: ${ingestDate}`);

        const stats = {
            temperature: 0,
            chlorophyll: 0,
            salinity: 0,
            errors: 0
        };

        try {
            // 1. Ingest SST (Temperature)
            const sstData = await erddapService.fetchSST({
                date: ingestDate,
                stride: 10 // Subsample to avoid DB explosion (approx 100km grid)
            });

            if (sstData.success && sstData.data.length > 0) {
                stats.temperature = await this.bulkInsert(sstData.data);
            } else {
                logger.warn(`No SST data found for ${ingestDate}`);
            }

            // 2. Ingest Chlorophyll
            const chlaData = await erddapService.fetchChlorophyll({
                date: ingestDate,
                stride: 10
            });

            if (chlaData.success && chlaData.data.length > 0) {
                stats.chlorophyll = await this.bulkInsert(chlaData.data);
            } else {
                logger.warn(`No Chlorophyll data found for ${ingestDate}`);
            }

            // 3. Ingest Salinity
            const sssData = await erddapService.fetchSalinity({
                date: ingestDate,
                stride: 10
            });

            if (sssData.success && sssData.data.length > 0) {
                stats.salinity = await this.bulkInsert(sssData.data);
            } else {
                logger.warn(`No Salinity data found for ${ingestDate}`);
            }

            logger.info('Ocean data ingestion completed', stats);

            // Notify admins if configured
            // await notificationService.notifySystemEvent('ingestion_complete', stats);

            return { success: true, stats };

        } catch (error: any) {
            logger.error('Ingestion failed:', error);
            return { success: false, stats, error: error.message };
        }
    }

    /**
     * Bulk insert data points into oceanographic_data table
     */
    private async bulkInsert(dataPoints: any[]): Promise<number> {
        const sequelize = getSequelize();
        let insertedCount = 0;

        // Process in chunks of 100 to avoid query size limits
        const CHUNK_SIZE = 100;

        for (let i = 0; i < dataPoints.length; i += CHUNK_SIZE) {
            const chunk = dataPoints.slice(i, i + CHUNK_SIZE);

            try {
                const values = chunk.map(point => {
                    // Point structure from erddapService:
                    // { latitude, longitude, value, time, parameter, unit, source, dataType, quality }

                    return `(
            '${point.parameter}', 
            ${point.value}, 
            '${point.unit}', 
            ST_SetSRID(ST_MakePoint(${point.longitude}, ${point.latitude}), 4326), 
            0, 
            '${point.time || new Date().toISOString()}', 
            '${point.source}', 
            '${point.quality || 'good'}', 
            '{"ingest": true}'
          )`;
                }).join(',');

                await sequelize.query(`
          INSERT INTO oceanographic_data 
          (parameter, value, unit, location, depth, timestamp, source, quality_flag, metadata)
          VALUES ${values}
          ON CONFLICT DO NOTHING
        `);

                insertedCount += chunk.length;
            } catch (err: any) {
                logger.error(`Failed to insert chunk at index ${i}:`, err.message);
            }
        }

        return insertedCount;
    }
}

export const oceanDataIngestionService = new OceanDataIngestionService();
export default oceanDataIngestionService;
