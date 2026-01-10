/**
 * NASAOceanColorLayer Component
 * 
 * WMS tile layer for NASA OceanColor satellite imagery.
 * Provides chlorophyll-a concentration from MODIS/VIIRS sensors.
 * 
 * Uses WMSTileLayer for proper WMS protocol handling.
 */

import { WMSTileLayer } from 'react-leaflet';

interface NASAOceanColorLayerProps {
    layer?: 'chlorophyll' | 'sst' | 'par';
    opacity?: number;
    visible?: boolean;
}

// NASA Earth Observations (NEO) WMS endpoints
const NASA_WMS_CONFIG = {
    chlorophyll: {
        layers: 'MY1DMM_CHLORA',
        name: 'Chlorophyll-a (MODIS)',
    },
    sst: {
        layers: 'MYD28M',
        name: 'Sea Surface Temperature (MODIS)',
    },
    par: {
        layers: 'MYDAL2_M_CLOUD_OD',
        name: 'Photosynthetically Active Radiation',
    },
};

const NASA_WMS_BASE_URL = 'https://neo.gsfc.nasa.gov/wms/wms';

/**
 * NASA OceanColor WMS Layer
 * 
 * Displays satellite imagery from NASA's Earth Observations portal.
 * Uses react-leaflet's WMSTileLayer for proper WMS protocol support.
 * 
 * Note: This requires external network access to NASA servers.
 * Will fail gracefully if NASA servers are unreachable.
 */
export function NASAOceanColorLayer({
    layer = 'chlorophyll',
    opacity = 0.6,
    visible = true,
}: NASAOceanColorLayerProps) {
    if (!visible) return null;

    const config = NASA_WMS_CONFIG[layer] || NASA_WMS_CONFIG.chlorophyll;

    return (
        <WMSTileLayer
            url={NASA_WMS_BASE_URL}
            layers={config.layers}
            format="image/png"
            transparent={true}
            opacity={opacity}
            attribution="NASA Earth Observations (NEO)"
            version="1.1.1"
            // @ts-ignore - WMSTileLayer accepts these but types are incomplete
            crs={undefined} // Use map's CRS
        />
    );
}

/**
 * Get available NASA layers info
 */
export function getNASALayers() {
    return Object.entries(NASA_WMS_CONFIG).map(([key, config]) => ({
        id: key,
        name: config.name,
        layer: config.layers,
    }));
}

export default NASAOceanColorLayer;
