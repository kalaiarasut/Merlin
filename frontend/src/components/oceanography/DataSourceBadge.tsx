/**
 * DataSourceBadge Component
 * 
 * Displays data source attribution with visual indicators for:
 * - Source name (NOAA, NASA, INCOIS, Demo)
 * - Data type (Observed, Modeled, Simulated)
 * - Last updated timestamp
 */

import { Badge } from '@/components/ui/badge';
import {
    Satellite,
    Radio,
    Waves,
    FlaskConical,
    Clock,
    CheckCircle2,
    AlertCircle,
    Info
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type DataSourceType = 'NOAA_ERDDAP' | 'NASA_OCEANCOLOR' | 'INCOIS' | 'COPERNICUS' | 'DEMO' | 'DATABASE';
export type DataType = 'observed' | 'modeled' | 'simulated';

interface DataSourceBadgeProps {
    source: DataSourceType;
    dataType: DataType;
    parameter?: string;
    lastUpdated?: string;
    resolution?: string;
    showDetails?: boolean;
    className?: string;
}

const sourceConfig: Record<DataSourceType, {
    label: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
    attribution: string;
}> = {
    NOAA_ERDDAP: {
        label: 'NOAA ERDDAP',
        icon: Satellite,
        color: 'text-blue-700',
        bgColor: 'bg-blue-50 border-blue-200',
        attribution: 'NOAA CoastWatch, NASA JPL',
    },
    NASA_OCEANCOLOR: {
        label: 'NASA OceanColor',
        icon: Satellite,
        color: 'text-indigo-700',
        bgColor: 'bg-indigo-50 border-indigo-200',
        attribution: 'NASA GSFC OceanColor',
    },
    INCOIS: {
        label: 'INCOIS',
        icon: Waves,
        color: 'text-cyan-700',
        bgColor: 'bg-cyan-50 border-cyan-200',
        attribution: 'Indian National Centre for Ocean Information Services',
    },
    COPERNICUS: {
        label: 'Copernicus Marine',
        icon: Satellite,
        color: 'text-purple-700',
        bgColor: 'bg-purple-50 border-purple-200',
        attribution: 'EU Copernicus Marine Service',
    },
    DEMO: {
        label: 'Demo Mode',
        icon: FlaskConical,
        color: 'text-amber-700',
        bgColor: 'bg-amber-50 border-amber-200',
        attribution: 'Simulated data for demonstration',
    },
    DATABASE: {
        label: 'Local Database',
        icon: Radio,
        color: 'text-gray-700',
        bgColor: 'bg-gray-50 border-gray-200',
        attribution: 'Marlin Platform Database',
    },
};

const dataTypeConfig: Record<DataType, {
    label: string;
    icon: React.ElementType;
    color: string;
}> = {
    observed: {
        label: 'Observed',
        icon: CheckCircle2,
        color: 'text-emerald-600',
    },
    modeled: {
        label: 'Modeled',
        icon: Info,
        color: 'text-blue-600',
    },
    simulated: {
        label: 'Simulated',
        icon: AlertCircle,
        color: 'text-amber-600',
    },
};

export function DataSourceBadge({
    source,
    dataType,
    parameter,
    lastUpdated,
    resolution,
    showDetails = false,
    className,
}: DataSourceBadgeProps) {
    const sourceInfo = sourceConfig[source] || sourceConfig.DATABASE;
    const dataTypeInfo = dataTypeConfig[dataType] || dataTypeConfig.observed;
    const SourceIcon = sourceInfo.icon;
    const DataTypeIcon = dataTypeInfo.icon;

    // Format last updated time
    const formatLastUpdated = (timestamp: string) => {
        try {
            const date = new Date(timestamp);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;
            return date.toLocaleDateString();
        } catch {
            return 'Unknown';
        }
    };

    if (!showDetails) {
        // Compact badge
        return (
            <Badge
                variant="outline"
                className={cn(
                    'gap-1.5 font-medium',
                    sourceInfo.bgColor,
                    sourceInfo.color,
                    className
                )}
            >
                <SourceIcon className="w-3 h-3" />
                {sourceInfo.label}
            </Badge>
        );
    }

    // Detailed badge with all info
    return (
        <div className={cn(
            'inline-flex flex-col gap-1 p-2 rounded-lg border text-xs',
            sourceInfo.bgColor,
            className
        )}>
            {/* Source */}
            <div className={cn('flex items-center gap-1.5 font-semibold', sourceInfo.color)}>
                <SourceIcon className="w-3.5 h-3.5" />
                <span>{sourceInfo.label}</span>
            </div>

            {/* Data Type */}
            <div className={cn('flex items-center gap-1.5', dataTypeInfo.color)}>
                <DataTypeIcon className="w-3 h-3" />
                <span>{dataTypeInfo.label} Data</span>
            </div>

            {/* Parameter */}
            {parameter && (
                <div className="text-gray-600 capitalize">
                    Parameter: {parameter}
                </div>
            )}

            {/* Resolution */}
            {resolution && (
                <div className="text-gray-500">
                    Resolution: {resolution}
                </div>
            )}

            {/* Last Updated */}
            {lastUpdated && (
                <div className="flex items-center gap-1 text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>{formatLastUpdated(lastUpdated)}</span>
                </div>
            )}

            {/* Attribution */}
            <div className="text-gray-400 text-[10px] mt-1 border-t pt-1">
                {sourceInfo.attribution}
            </div>
        </div>
    );
}

/**
 * Inline source indicator for map markers
 */
export function SourceIndicator({
    source,
    size = 'sm'
}: {
    source: DataSourceType;
    size?: 'sm' | 'md';
}) {
    const sourceInfo = sourceConfig[source] || sourceConfig.DATABASE;
    const SourceIcon = sourceInfo.icon;

    const sizeClasses = size === 'sm'
        ? 'w-4 h-4 p-0.5'
        : 'w-5 h-5 p-1';

    return (
        <div
            className={cn(
                'rounded-full flex items-center justify-center',
                sourceInfo.bgColor,
                sizeClasses
            )}
            title={sourceInfo.label}
        >
            <SourceIcon className={cn('w-full h-full', sourceInfo.color)} />
        </div>
    );
}

export default DataSourceBadge;
