/**
 * ArgoFloatLayer Component
 * 
 * Renders Argo BGC (Biogeochemical) float positions on the map.
 * 
 * Features:
 * - Float markers with color coding by QC mode
 * - Click to show depth profile popup
 * - Tooltip with float ID, timestamp, surface values
 * 
 * NOTE: Argo data is near real-time / delayed-mode QC, NOT truly real-time.
 * Coverage is sparse - only where floats happen to be.
 */

import { useEffect, useState } from 'react';
import { CircleMarker, Popup, Tooltip } from 'react-leaflet';
import { argoService, ArgoProfile, ArgoResponse } from '@/services/argoService';

interface ArgoFloatLayerProps {
    visible: boolean;
    bounds?: {
        latMin: number;
        latMax: number;
        lonMin: number;
        lonMax: number;
    };
    onFloatClick?: (floatId: string) => void;
}

export function ArgoFloatLayer({
    visible,
    bounds = { latMin: -15, latMax: 25, lonMin: 50, lonMax: 100 },
    onFloatClick,
}: ArgoFloatLayerProps) {
    const [floats, setFloats] = useState<ArgoProfile[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch Argo data when component becomes visible
    useEffect(() => {
        if (!visible) {
            setFloats([]);
            return;
        }

        const fetchFloats = async () => {
            setIsLoading(true);
            try {
                const response = await argoService.fetchBGCProfiles({
                    latMin: bounds.latMin,
                    latMax: bounds.latMax,
                    lonMin: bounds.lonMin,
                    lonMax: bounds.lonMax,
                    maxFloats: 200, // Safety limit
                });

                if (response.success) {
                    setFloats(response.floats);
                }
            } catch (error) {
                console.error('Failed to fetch Argo floats:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchFloats();
    }, [visible, bounds.latMin, bounds.latMax, bounds.lonMin, bounds.lonMax]);

    if (!visible || floats.length === 0) {
        return null;
    }

    /**
     * Get marker color based on QC mode
     */
    const getMarkerColor = (qcMode: string): string => {
        return qcMode === 'delayed-mode' ? '#22c55e' : '#f59e0b'; // Green for verified, amber for NRT
    };

    /**
     * Get surface value from depth profile
     */
    const getSurfaceValue = (profile: ArgoProfile, param: 'doxy' | 'ph'): string => {
        const values = profile.profiles[param];
        if (!values || values.length === 0) return 'N/A';
        return values[0].toFixed(param === 'doxy' ? 1 : 2);
    };

    /**
     * Format timestamp for display
     */
    const formatTimestamp = (timestamp: string): string => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    return (
        <>
            {floats.map((float) => (
                <CircleMarker
                    key={`argo-${float.floatId}-${float.cycleNumber}`}
                    center={[float.latitude, float.longitude]}
                    radius={8}
                    pathOptions={{
                        fillColor: getMarkerColor(float.qcMode),
                        fillOpacity: 0.8,
                        color: '#ffffff',
                        weight: 2,
                        opacity: 1,
                    }}
                    eventHandlers={{
                        click: () => onFloatClick?.(float.floatId),
                    }}
                >
                    {/* Tooltip on hover */}
                    <Tooltip
                        direction="top"
                        offset={[0, -8]}
                        opacity={0.95}
                        className="argo-tooltip"
                    >
                        <div className="text-xs font-medium">
                            <div className="flex items-center gap-1 mb-1">
                                <span className="text-cyan-600">⚓</span>
                                <span>Float {float.floatId}</span>
                                <span className={`px-1 py-0.5 rounded text-[10px] ${float.qcMode === 'delayed-mode'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-amber-100 text-amber-700'
                                    }`}>
                                    {float.qcMode === 'delayed-mode' ? 'QC' : 'NRT'}
                                </span>
                            </div>
                            <div className="text-gray-600">
                                <div>DO: {getSurfaceValue(float, 'doxy')} µmol/kg</div>
                                <div>pH: {getSurfaceValue(float, 'ph')}</div>
                                <div className="text-gray-400 mt-1">{formatTimestamp(float.timestamp)}</div>
                            </div>
                        </div>
                    </Tooltip>

                    {/* Popup on click */}
                    <Popup>
                        <div className="min-w-[200px]">
                            <div className="font-semibold text-base mb-2 flex items-center gap-2">
                                <span className="text-cyan-600">⚓</span>
                                Float {float.floatId}
                            </div>

                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Cycle:</span>
                                    <span className="font-medium">{float.cycleNumber}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Date:</span>
                                    <span className="font-medium">{formatTimestamp(float.timestamp)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Position:</span>
                                    <span className="font-medium">
                                        {float.latitude.toFixed(3)}°, {float.longitude.toFixed(3)}°
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">QC Mode:</span>
                                    <span className={`px-1.5 py-0.5 rounded text-xs ${float.qcMode === 'delayed-mode'
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-amber-100 text-amber-700'
                                        }`}>
                                        {float.qcMode === 'delayed-mode' ? 'Delayed-mode QC' : 'Near real-time'}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-3 pt-2 border-t">
                                <div className="text-xs text-gray-500 mb-1">Surface values (0-5m)</div>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="bg-blue-50 rounded p-2 text-center">
                                        <div className="text-xs text-gray-500">DO</div>
                                        <div className="font-semibold text-blue-700">
                                            {getSurfaceValue(float, 'doxy')}
                                        </div>
                                        <div className="text-[10px] text-gray-400">µmol/kg</div>
                                    </div>
                                    <div className="bg-purple-50 rounded p-2 text-center">
                                        <div className="text-xs text-gray-500">pH</div>
                                        <div className="font-semibold text-purple-700">
                                            {getSurfaceValue(float, 'ph')}
                                        </div>
                                        <div className="text-[10px] text-gray-400">pH units</div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-2 text-[10px] text-gray-400 text-center">
                                Click for full depth profile
                            </div>
                        </div>
                    </Popup>
                </CircleMarker>
            ))}
        </>
    );
}

export default ArgoFloatLayer;
