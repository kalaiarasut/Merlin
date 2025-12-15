/**
 * WebSocket Hook for Real-time Notifications
 * 
 * Provides real-time updates from the backend
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Event types matching backend
export enum SocketEvents {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',
  NOTIFICATION = 'notification',
  NOTIFICATION_READ = 'notification:read',
  INGESTION_STARTED = 'ingestion:started',
  INGESTION_PROGRESS = 'ingestion:progress',
  INGESTION_COMPLETED = 'ingestion:completed',
  INGESTION_FAILED = 'ingestion:failed',
  ANALYSIS_STARTED = 'analysis:started',
  ANALYSIS_PROGRESS = 'analysis:progress',
  ANALYSIS_COMPLETED = 'analysis:completed',
  ANALYSIS_FAILED = 'analysis:failed',
  SPECIES_UPDATED = 'species:updated',
  OCEANOGRAPHY_UPDATED = 'oceanography:updated',
  EDNA_UPDATED = 'edna:updated',
  SYSTEM_ALERT = 'system:alert',
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

interface UseWebSocketOptions {
  autoConnect?: boolean;
  onNotification?: (notification: SocketNotification) => void;
  onProgress?: (progress: ProgressUpdate) => void;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
}

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    autoConnect = true,
    onNotification,
    onProgress,
    onConnect,
    onDisconnect,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<SocketNotification[]>([]);
  const [lastProgress, setLastProgress] = useState<ProgressUpdate | null>(null);

  // Initialize socket connection
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const token = localStorage.getItem('token');

    socketRef.current = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Connection events
    socketRef.current.on('connect', () => {
      setIsConnected(true);
      onConnect?.();
      console.log('🔌 WebSocket connected');
    });

    socketRef.current.on('disconnect', (reason) => {
      setIsConnected(false);
      onDisconnect?.(reason);
      console.log('🔌 WebSocket disconnected:', reason);
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    // Notification events
    socketRef.current.on(SocketEvents.NOTIFICATION, (notification: SocketNotification) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 50)); // Keep last 50
      onNotification?.(notification);
    });

    // Progress events
    socketRef.current.on(SocketEvents.INGESTION_PROGRESS, (progress: ProgressUpdate) => {
      setLastProgress(progress);
      onProgress?.(progress);
    });

    socketRef.current.on(SocketEvents.ANALYSIS_PROGRESS, (progress: ProgressUpdate) => {
      setLastProgress(progress);
      onProgress?.(progress);
    });
  }, [onConnect, onDisconnect, onNotification, onProgress]);

  // Disconnect socket
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  // Subscribe to channel
  const subscribe = useCallback((channel: string) => {
    socketRef.current?.emit('subscribe', channel);
  }, []);

  // Unsubscribe from channel
  const unsubscribe = useCallback((channel: string) => {
    socketRef.current?.emit('unsubscribe', channel);
  }, []);

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    socketRef.current?.emit(SocketEvents.NOTIFICATION_READ, notificationId);
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  }, []);

  // Clear all notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Listen for specific event
  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler);
    return () => {
      socketRef.current?.off(event, handler);
    };
  }, []);

  // Emit event
  const emit = useCallback((event: string, data?: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    socket: socketRef.current,
    isConnected,
    notifications,
    lastProgress,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    markAsRead,
    clearNotifications,
    on,
    emit,
  };
}

// Singleton socket instance for global use
let globalSocket: Socket | null = null;

export function getSocket(): Socket | null {
  return globalSocket;
}

export function initializeSocket(token?: string): Socket {
  if (globalSocket?.connected) return globalSocket;

  globalSocket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
  });

  return globalSocket;
}

export function disconnectSocket(): void {
  if (globalSocket) {
    globalSocket.disconnect();
    globalSocket = null;
  }
}

export default useWebSocket;
