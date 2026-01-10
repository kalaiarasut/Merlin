/**
 * Real-time Oceanographic Data Hook
 * 
 * Connects to WebSocket server for live ocean data streaming.
 * Uses Socket.io client to receive real-time updates.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// Types for oceanographic data
export interface OceanReading {
    parameter: string;
    value: number;
    unit: string;
    latitude: number;
    longitude: number;
    depth: number;
    region: string;
    quality: string;
    source: string;
}

export interface OceanDataUpdate {
    timestamp: string;
    channel: string;
    readings: OceanReading[];
}

export interface LiveOceanDataState {
    connected: boolean;
    connecting: boolean;
    data: OceanDataUpdate | null;
    history: OceanDataUpdate[];
    lastUpdate: Date | null;
    error: string | null;
}

interface UseLiveOceanDataOptions {
    channel?: string;
    autoConnect?: boolean;
    maxHistoryLength?: number;
}

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export function useLiveOceanData(options: UseLiveOceanDataOptions = {}) {
    const {
        channel = 'oceanography:live',
        autoConnect = true,
        maxHistoryLength = 50,
    } = options;

    const [state, setState] = useState<LiveOceanDataState>({
        connected: false,
        connecting: false,
        data: null,
        history: [],
        lastUpdate: null,
        error: null,
    });

    const socketRef = useRef<Socket | null>(null);

    // Get auth token from storage
    const getAuthToken = (): string | null => {
        // Try direct key first
        let token = localStorage.getItem('authToken');
        if (token) return token;

        // Try Zustand auth store
        const authStorage = localStorage.getItem('auth-storage');
        if (authStorage) {
            try {
                const parsed = JSON.parse(authStorage);
                return parsed?.state?.token || null;
            } catch {
                return null;
            }
        }
        return null;
    };

    // Connect to WebSocket
    const connect = useCallback(() => {
        if (socketRef.current?.connected) return;

        setState(prev => ({ ...prev, connecting: true, error: null }));

        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            autoConnect: true,
        });

        socket.on('connect', async () => {
            console.log('🔌 WebSocket connected');
            setState(prev => ({ ...prev, connected: true, connecting: false }));

            // Subscribe to oceanography channel
            socket.emit('subscribe', channel);

            // Auto-start the backend live stream
            const token = getAuthToken();
            if (token) {
                try {
                    await fetch(`${SOCKET_URL}/api/oceanography/live/start`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            channel,
                            parameters: ['temperature', 'salinity', 'chlorophyll'],
                            intervalMs: 5000,
                        }),
                    });
                    console.log('📡 Live data stream started');
                } catch (err) {
                    console.warn('Could not auto-start stream:', err);
                }
            }
        });

        socket.on('disconnect', (reason) => {
            console.log('🔌 WebSocket disconnected:', reason);
            setState(prev => ({ ...prev, connected: false }));
        });

        socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
            setState(prev => ({
                ...prev,
                connecting: false,
                error: 'Connection failed. Retrying...',
            }));
        });

        // Listen for oceanography updates
        socket.on('oceanography:updated', (data: OceanDataUpdate) => {
            console.log('📊 Live data received:', data);
            setState(prev => ({
                ...prev,
                data,
                lastUpdate: new Date(),
                history: [data, ...prev.history].slice(0, maxHistoryLength),
            }));
        });

        socketRef.current = socket;
    }, [channel, maxHistoryLength]);

    // Disconnect from WebSocket
    const disconnect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.emit('unsubscribe', channel);
            socketRef.current.disconnect();
            socketRef.current = null;
            setState(prev => ({ ...prev, connected: false }));
        }
    }, [channel]);

    // Auto-connect on mount
    useEffect(() => {
        if (autoConnect) {
            connect();
        }

        return () => {
            disconnect();
        };
    }, [autoConnect, connect, disconnect]);

    // Get latest reading for a specific parameter
    const getLatestReading = useCallback((parameter: string): OceanReading | null => {
        if (!state.data?.readings) return null;
        return state.data.readings.find(r => r.parameter === parameter) || null;
    }, [state.data]);

    // Get temperature with fallback
    const temperature = getLatestReading('temperature');
    const salinity = getLatestReading('salinity');
    const chlorophyll = getLatestReading('chlorophyll');

    return {
        ...state,
        connect,
        disconnect,
        getLatestReading,
        // Convenience accessors
        temperature: temperature?.value,
        salinity: salinity?.value,
        chlorophyll: chlorophyll?.value,
        region: state.data?.readings[0]?.region,
    };
}

export default useLiveOceanData;
