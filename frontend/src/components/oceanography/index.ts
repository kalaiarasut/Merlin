/**
 * Oceanography Components
 * 
 * Export all oceanography-specific components for easy imports.
 */

export { DataSourceBadge, SourceIndicator } from './DataSourceBadge';
export type { DataSourceType, DataType } from './DataSourceBadge';

export { EnhancedLegend, CompactLegend } from './EnhancedLegend';

export { HeatmapLayer } from './HeatmapLayer';
export type { HeatmapPoint } from './HeatmapLayer';

export { GriddedHeatmapLayer } from './GriddedHeatmapLayer';
export type { GridPoint } from './GriddedHeatmapLayer';

export { NASAOceanColorLayer, getNASALayers } from './NASAOceanColorLayer';

export { LayerControl } from './LayerControl';
export type { DataSourceMode, VisibleLayer } from './LayerControl';

export { TemporalAnimationControl } from './TemporalAnimationControl';
export type { TimeFrame } from './TemporalAnimationControl';

export { ArgoFloatLayer } from './ArgoFloatLayer';

