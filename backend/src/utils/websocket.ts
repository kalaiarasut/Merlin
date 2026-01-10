/**
 * WebSocket Service for Real-time Notifications
 * 
 * Provides real-time updates for:
 * - Data ingestion progress
 * - Analysis completion
 * - System notifications
 * - User-specific alerts
 */

import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import logger from './logger';
import jwt from 'jsonwebtoken';

// Event types for type safety
export enum SocketEvents {
  // Connection events
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',

  // Notification events
  NOTIFICATION = 'notification',
  NOTIFICATION_READ = 'notification:read',
  NOTIFICATION_CLEAR = 'notification:clear',

  // Ingestion events
  INGESTION_STARTED = 'ingestion:started',
  INGESTION_PROGRESS = 'ingestion:progress',
  INGESTION_COMPLETED = 'ingestion:completed',
  INGESTION_FAILED = 'ingestion:failed',

  // Analysis events
  ANALYSIS_STARTED = 'analysis:started',
  ANALYSIS_PROGRESS = 'analysis:progress',
  ANALYSIS_COMPLETED = 'analysis:completed',
  ANALYSIS_FAILED = 'analysis:failed',

  // Data update events
  SPECIES_UPDATED = 'species:updated',
  OCEANOGRAPHY_UPDATED = 'oceanography:updated',
  EDNA_UPDATED = 'edna:updated',

  // System events
  SYSTEM_ALERT = 'system:alert',
  MAINTENANCE = 'maintenance',
}

export interface SocketNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  data?: Record<string, any>;
  timestamp: Date;
  userId?: string;
}

export interface ProgressUpdate {
  jobId: string;
  progress: number;
  stage: string;
  details?: string;
}

class WebSocketService {
  private io: SocketServer | null = null;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> socketIds

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: HttpServer): SocketServer {
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;

        if (!token) {
          // Allow anonymous connections for public notifications
          socket.data.userId = 'anonymous';
          socket.data.authenticated = false;
          return next();
        }

        const decoded = jwt.verify(
          token as string,
          process.env.JWT_SECRET || 'your-secret-key'
        ) as { userId: string; email: string };

        socket.data.userId = decoded.userId;
        socket.data.email = decoded.email;
        socket.data.authenticated = true;
        next();
      } catch (error) {
        // Allow connection but mark as unauthenticated
        socket.data.userId = 'anonymous';
        socket.data.authenticated = false;
        next();
      }
    });

    // Connection handler
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    logger.info('🔌 WebSocket server initialized');
    return this.io;
  }

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: Socket): void {
    const userId = socket.data.userId || 'anonymous';

    // Track user's sockets
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket.id);

    logger.info(`Socket connected: ${socket.id} (user: ${userId})`);

    // Join user-specific room if authenticated
    if (socket.data.authenticated) {
      socket.join(`user:${userId}`);
    }

    // Join public room for broadcast notifications
    socket.join('public');

    // Handle subscription to specific channels
    socket.on('subscribe', (channel: string) => {
      socket.join(channel);
      logger.debug(`Socket ${socket.id} subscribed to ${channel}`);
    });

    socket.on('unsubscribe', (channel: string) => {
      socket.leave(channel);
      logger.debug(`Socket ${socket.id} unsubscribed from ${channel}`);
    });

    // Handle notification acknowledgment
    socket.on(SocketEvents.NOTIFICATION_READ, (notificationId: string) => {
      this.handleNotificationRead(userId, notificationId);
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      this.userSockets.get(userId)?.delete(socket.id);
      if (this.userSockets.get(userId)?.size === 0) {
        this.userSockets.delete(userId);
      }
      logger.info(`Socket disconnected: ${socket.id} (reason: ${reason})`);
    });

    // Send welcome notification
    socket.emit(SocketEvents.NOTIFICATION, {
      id: `welcome-${Date.now()}`,
      type: 'system',
      title: 'Connected',
      message: 'Real-time notifications enabled',
      severity: 'info',
      timestamp: new Date(),
    } as SocketNotification);
  }

  /**
   * Handle notification read acknowledgment
   */
  private handleNotificationRead(userId: string, notificationId: string): void {
    // Could update database here to mark notification as read
    logger.debug(`Notification ${notificationId} read by user ${userId}`);
  }

  /**
   * Send notification to specific user
   */
  sendToUser(userId: string, event: SocketEvents, data: any): void {
    if (!this.io) return;
    this.io.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Send notification to all connected clients
   */
  broadcast(event: SocketEvents, data: any): void {
    if (!this.io) return;
    this.io.to('public').emit(event, data);
  }

  /**
   * Send notification to specific channel
   */
  sendToChannel(channel: string, event: SocketEvents, data: any): void {
    if (!this.io) return;
    this.io.to(channel).emit(event, data);
  }

  /**
   * Send progress update for a job
   */
  sendProgress(jobId: string, userId: string, progress: ProgressUpdate): void {
    this.sendToUser(userId, SocketEvents.INGESTION_PROGRESS, progress);
    // Also send to job-specific channel
    this.sendToChannel(`job:${jobId}`, SocketEvents.INGESTION_PROGRESS, progress);
  }

  /**
   * Notify about ingestion job status
   */
  notifyIngestion(
    userId: string,
    jobId: string,
    status: 'started' | 'completed' | 'failed',
    details?: Record<string, any>
  ): void {
    const eventMap = {
      started: SocketEvents.INGESTION_STARTED,
      completed: SocketEvents.INGESTION_COMPLETED,
      failed: SocketEvents.INGESTION_FAILED,
    };

    const notification: SocketNotification = {
      id: `ingestion-${jobId}-${Date.now()}`,
      type: 'ingestion',
      title: status === 'completed' ? 'Import Complete' :
        status === 'failed' ? 'Import Failed' : 'Import Started',
      message: details?.message || `Data ingestion ${status}`,
      severity: status === 'completed' ? 'success' :
        status === 'failed' ? 'error' : 'info',
      data: { jobId, ...details },
      timestamp: new Date(),
      userId,
    };

    this.sendToUser(userId, eventMap[status], notification);
    this.sendToUser(userId, SocketEvents.NOTIFICATION, notification);
  }

  /**
   * Notify about analysis completion
   */
  notifyAnalysis(
    userId: string,
    analysisType: string,
    status: 'started' | 'completed' | 'failed',
    results?: Record<string, any>
  ): void {
    const eventMap = {
      started: SocketEvents.ANALYSIS_STARTED,
      completed: SocketEvents.ANALYSIS_COMPLETED,
      failed: SocketEvents.ANALYSIS_FAILED,
    };

    const notification: SocketNotification = {
      id: `analysis-${analysisType}-${Date.now()}`,
      type: 'analysis',
      title: `${analysisType} Analysis ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message: results?.message || `${analysisType} analysis ${status}`,
      severity: status === 'completed' ? 'success' :
        status === 'failed' ? 'error' : 'info',
      data: { analysisType, ...results },
      timestamp: new Date(),
      userId,
    };

    this.sendToUser(userId, eventMap[status], notification);
    this.sendToUser(userId, SocketEvents.NOTIFICATION, notification);
  }

  /**
   * Send system-wide alert
   */
  systemAlert(
    title: string,
    message: string,
    severity: 'info' | 'warning' | 'error' = 'info'
  ): void {
    const notification: SocketNotification = {
      id: `system-${Date.now()}`,
      type: 'system',
      title,
      message,
      severity,
      timestamp: new Date(),
    };

    this.broadcast(SocketEvents.SYSTEM_ALERT, notification);
    this.broadcast(SocketEvents.NOTIFICATION, notification);
  }

  /**
   * Get connected user count
   */
  getConnectedUsers(): number {
    return this.userSockets.size;
  }

  /**
   * Check if user is connected
   */
  isUserConnected(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
  }

  /**
   * Get the Socket.IO server instance
   */
  getIO(): SocketServer | null {
    return this.io;
  }

  // ====================================
  // REAL-TIME OCEANOGRAPHIC DATA STREAMING
  // ====================================

  private activeStreams: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Start streaming live oceanographic data to a channel
   * 
   * This simulates live sensor data updates. In production, this would
   * connect to actual sensor feeds (buoys, satellites, CTD sensors).
   * 
   * @param channel - Channel name (e.g., 'oceanography:arabian-sea')
   * @param parameters - Parameters to stream (temperature, salinity, etc.)
   * @param intervalMs - Update interval in milliseconds
   */
  startLiveDataStream(
    channel: string,
    parameters: string[] = ['temperature', 'salinity', 'chlorophyll'],
    intervalMs: number = 5000
  ): void {
    if (!this.io) return;

    // Prevent duplicate streams
    if (this.activeStreams.has(channel)) {
      logger.warn(`Stream already active for channel: ${channel}`);
      return;
    }

    logger.info(`Starting live data stream for channel: ${channel}`);

    const streamInterval = setInterval(() => {
      this.emitLiveOceanographyData(channel, parameters);
    }, intervalMs);

    this.activeStreams.set(channel, streamInterval);

    // Emit initial data immediately
    this.emitLiveOceanographyData(channel, parameters);
  }

  /**
   * Stop a live data stream
   */
  stopLiveDataStream(channel: string): void {
    const interval = this.activeStreams.get(channel);
    if (interval) {
      clearInterval(interval);
      this.activeStreams.delete(channel);
      logger.info(`Stopped live data stream for channel: ${channel}`);
    }
  }

  /**
   * Emit live oceanographic data update
   * Uses fixed sensor station locations to prevent marker jumping
   */
  private emitLiveOceanographyData(channel: string, parameters: string[]): void {
    if (!this.io) return;

    const timestamp = new Date();
    const data: Record<string, any> = {
      timestamp: timestamp.toISOString(),
      channel,
      readings: []
    };

    // Fixed sensor stations (buoys/moorings) - these DON'T move
    const sensorStations = [
      { id: 'ARABIAN-1', name: 'Arabian Sea Buoy', lat: 15.5, lon: 68.5, depth: 50 },
      { id: 'ARABIAN-2', name: 'Lakshadweep Station', lat: 11.0, lon: 72.0, depth: 25 },
      { id: 'BOB-1', name: 'Bay of Bengal Mooring', lat: 13.0, lon: 87.0, depth: 75 },
      { id: 'BOB-2', name: 'Chennai Coastal', lat: 13.1, lon: 80.3, depth: 15 },
      { id: 'INDIAN-1', name: 'Equatorial Indian Ocean', lat: 0.5, lon: 77.0, depth: 100 }
    ];

    // Select 2-3 stations that are "reporting" this cycle
    const activeStations = sensorStations.slice(0, 3);

    activeStations.forEach(station => {
      parameters.forEach(param => {
        let value: number;
        let unit: string;

        // Add small variation to simulate real sensor readings
        const noise = (Math.random() - 0.5) * 0.5;

        switch (param) {
          case 'temperature':
            // SST typically 26-31°C in Indian Ocean, varies slightly by station
            const baseTempByLat = 28 - Math.abs(station.lat) * 0.1;
            value = baseTempByLat + noise + Math.sin(timestamp.getHours() * Math.PI / 12) * 1;
            unit = '°C';
            break;
          case 'salinity':
            // Salinity typically 34-37 PSU
            value = 35 + noise;
            unit = 'PSU';
            break;
          case 'chlorophyll':
            // Chlorophyll-a typically 0.1-2.0 mg/m³
            value = 0.8 + noise * 0.5;
            unit = 'mg/m³';
            break;
          case 'dissolved_oxygen':
            // DO typically 4-8 mg/L
            value = 6 + noise;
            unit = 'mg/L';
            break;
          case 'ph':
            // pH typically 7.9-8.3
            value = 8.1 + noise * 0.1;
            unit = '';
            break;
          default:
            value = 50 + noise * 10;
            unit = '';
        }

        data.readings.push({
          stationId: station.id,
          stationName: station.name,
          parameter: param,
          value: Number(value.toFixed(2)),
          unit,
          latitude: station.lat,  // FIXED coordinates - no random offset!
          longitude: station.lon,
          region: station.name,
          depth: station.depth,
          quality: 'good',
          source: 'live_sensor'
        });
      });
    });

    this.io.to(channel).emit(SocketEvents.OCEANOGRAPHY_UPDATED, data);
  }

  /**
   * Get list of active data streams
   */
  getActiveStreams(): string[] {
    return Array.from(this.activeStreams.keys());
  }

  /**
   * Stream a single oceanographic data point
   * Used when new data is ingested or sensors report
   */
  streamOceanographyData(data: {
    parameter: string;
    value: number;
    unit: string;
    latitude: number;
    longitude: number;
    depth?: number;
    timestamp?: Date;
    source?: string;
  }): void {
    if (!this.io) return;

    const payload = {
      ...data,
      timestamp: (data.timestamp || new Date()).toISOString(),
      id: `live-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      source: data.source || 'manual'
    };

    // Broadcast to all oceanography subscribers
    this.io.to('oceanography:live').emit(SocketEvents.OCEANOGRAPHY_UPDATED, payload);

    // Also broadcast to public channel for dashboard
    this.broadcast(SocketEvents.OCEANOGRAPHY_UPDATED, payload);
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
export default websocketService;
