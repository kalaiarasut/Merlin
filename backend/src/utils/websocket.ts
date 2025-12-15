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
}

// Export singleton instance
export const websocketService = new WebSocketService();
export default websocketService;
