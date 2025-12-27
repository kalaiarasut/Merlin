import { useState } from 'react';
import {
    BarChart3, PieChart, LineChart, AreaChart,
    Plus, Trash2, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ChartData {
    label: string;
    value: number;
    color?: string;
}

interface ChartEditorProps {
    chartType: 'bar' | 'pie' | 'line' | 'area' | 'none';
    chartData: Record<string, number>;
    onChartTypeChange: (type: 'bar' | 'pie' | 'line' | 'area' | 'none') => void;
    onChartDataChange: (data: Record<string, number>) => void;
    title?: string;
    onTitleChange?: (title: string) => void;
    className?: string;
    compact?: boolean; // Simplified view for inline use
}

const CHART_TYPES = [
    { id: 'none', label: 'No Chart', icon: null, description: 'No visualization' },
    { id: 'bar', label: 'Bar Chart', icon: BarChart3, description: 'Compare values' },
    { id: 'pie', label: 'Pie Chart', icon: PieChart, description: 'Show proportions' },
    { id: 'line', label: 'Line Chart', icon: LineChart, description: 'Show trends' },
    { id: 'area', label: 'Area Chart', icon: AreaChart, description: 'Show cumulative data' },
];

const DEFAULT_COLORS = [
    '#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444',
    '#06b6d4', '#84cc16', '#ec4899', '#f97316', '#6366f1'
];

export default function ChartEditor({
    chartType,
    chartData,
    onChartTypeChange,
    onChartDataChange,
    title = '',
    onTitleChange,
    className,
    compact = false
}: ChartEditorProps) {
    const [showPreview, setShowPreview] = useState(false);
    const [dataEntries, setDataEntries] = useState<ChartData[]>(() => {
        return Object.entries(chartData || {}).map(([label, value], index) => ({
            label,
            value,
            color: DEFAULT_COLORS[index % DEFAULT_COLORS.length]
        }));
    });

    // Add new data entry
    const addDataEntry = () => {
        const newEntry: ChartData = {
            label: `Item ${dataEntries.length + 1}`,
            value: 0,
            color: DEFAULT_COLORS[dataEntries.length % DEFAULT_COLORS.length]
        };
        const newEntries = [...dataEntries, newEntry];
        setDataEntries(newEntries);
        updateChartData(newEntries);
    };

    // Remove data entry
    const removeDataEntry = (index: number) => {
        const newEntries = dataEntries.filter((_, i) => i !== index);
        setDataEntries(newEntries);
        updateChartData(newEntries);
    };

    // Update data entry
    const updateDataEntry = (index: number, field: keyof ChartData, value: string | number) => {
        const newEntries = [...dataEntries];
        newEntries[index] = { ...newEntries[index], [field]: value };
        setDataEntries(newEntries);
        updateChartData(newEntries);
    };

    // Convert entries to chart data format
    const updateChartData = (entries: ChartData[]) => {
        const data: Record<string, number> = {};
        entries.forEach(entry => {
            if (entry.label) {
                data[entry.label] = entry.value;
            }
        });
        onChartDataChange(data);
    };

    // Calculate percentages for preview
    const total = dataEntries.reduce((sum, entry) => sum + entry.value, 0);

    return (
        <div className={cn("space-y-4", className)}>
            {/* Chart Type Selector - hidden in compact mode */}
            {!compact && (
                <div>
                    <label className="text-xs font-medium text-deep-500 mb-2 block">Chart Type</label>
                    <div className="grid grid-cols-5 gap-1">
                        {CHART_TYPES.map((type) => {
                            const Icon = type.icon;
                            const isSelected = chartType === type.id;

                            return (
                                <button
                                    key={type.id}
                                    onClick={() => onChartTypeChange(type.id as any)}
                                    title={type.description}
                                    className={cn(
                                        "flex flex-col items-center gap-1 p-2 rounded-lg transition-all",
                                        "hover:bg-gray-100 dark:hover:bg-gray-700",
                                        isSelected && "bg-ocean-100 dark:bg-ocean-900/30 ring-2 ring-ocean-500"
                                    )}
                                >
                                    {Icon ? (
                                        <Icon className={cn("w-5 h-5", isSelected ? "text-ocean-500" : "text-deep-400")} />
                                    ) : (
                                        <div className="w-5 h-5 flex items-center justify-center text-deep-400">—</div>
                                    )}
                                    <span className="text-[10px] font-medium text-deep-600 dark:text-gray-300">
                                        {type.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Chart Configuration (only show if chart type is not 'none') */}
            {chartType !== 'none' && (
                <>
                    {/* Chart Title */}
                    {onTitleChange && (
                        <div>
                            <label className="text-xs font-medium text-deep-500 mb-1 block">Chart Title</label>
                            <Input
                                value={title}
                                onChange={(e) => onTitleChange(e.target.value)}
                                placeholder="Enter chart title..."
                                className="text-sm"
                            />
                        </div>
                    )}

                    {/* Data Entries */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium text-deep-500">Data Points</label>
                            <div className="flex gap-2">
                                <Button size="sm" variant="ghost" onClick={() => setShowPreview(!showPreview)}>
                                    <Eye className="w-3 h-3 mr-1" />
                                    Preview
                                </Button>
                                <Button size="sm" variant="ghost" onClick={addDataEntry}>
                                    <Plus className="w-3 h-3 mr-1" />
                                    Add
                                </Button>
                            </div>
                        </div>

                        {/* Data Table */}
                        <div className="space-y-2">
                            {dataEntries.length === 0 ? (
                                <div className="text-center py-4 text-deep-400 dark:text-gray-500 text-sm">
                                    No data points. Click "Add" to add data.
                                </div>
                            ) : (
                                <>
                                    {/* Header */}
                                    <div className="grid grid-cols-12 gap-2 text-xs font-medium text-deep-500 px-1">
                                        <div className="col-span-1">Color</div>
                                        <div className="col-span-5">Label</div>
                                        <div className="col-span-4">Value</div>
                                        <div className="col-span-2 text-right">Actions</div>
                                    </div>

                                    {/* Rows */}
                                    {dataEntries.map((entry, index) => (
                                        <div key={index} className="grid grid-cols-12 gap-2 items-center">
                                            <div className="col-span-1">
                                                <input
                                                    type="color"
                                                    value={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                                                    onChange={(e) => updateDataEntry(index, 'color', e.target.value)}
                                                    className="w-6 h-6 rounded cursor-pointer border-0"
                                                />
                                            </div>
                                            <div className="col-span-5">
                                                <Input
                                                    value={entry.label}
                                                    onChange={(e) => updateDataEntry(index, 'label', e.target.value)}
                                                    placeholder="Label"
                                                    className="text-sm h-8"
                                                />
                                            </div>
                                            <div className="col-span-4">
                                                <Input
                                                    type="number"
                                                    value={entry.value}
                                                    onChange={(e) => updateDataEntry(index, 'value', parseFloat(e.target.value) || 0)}
                                                    placeholder="0"
                                                    className="text-sm h-8"
                                                />
                                            </div>
                                            <div className="col-span-2 flex justify-end">
                                                <button
                                                    onClick={() => removeDataEntry(index)}
                                                    className="p-1.5 text-deep-400 hover:text-red-500"
                                                    title="Remove"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Simple Preview */}
                    {showPreview && dataEntries.length > 0 && (
                        <div className="p-4 bg-gray-50 dark:bg-deep-900/50 rounded-lg">
                            <p className="text-xs font-medium text-deep-500 mb-3 flex items-center gap-2">
                                <Eye className="w-4 h-4" />
                                Preview ({CHART_TYPES.find(t => t.id === chartType)?.label})
                            </p>

                            {/* Bar Chart Preview */}
                            {chartType === 'bar' && (
                                <div className="space-y-2">
                                    {dataEntries.map((entry, index) => {
                                        const percentage = total > 0 ? (entry.value / Math.max(...dataEntries.map(e => e.value))) * 100 : 0;
                                        return (
                                            <div key={index} className="flex items-center gap-2">
                                                <span className="text-xs text-deep-600 dark:text-gray-300 w-20 truncate">
                                                    {entry.label}
                                                </span>
                                                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-300"
                                                        style={{
                                                            width: `${percentage}%`,
                                                            backgroundColor: entry.color
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-xs text-deep-500 w-12 text-right">
                                                    {entry.value}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Pie Chart Preview */}
                            {chartType === 'pie' && (
                                <div className="flex items-center gap-4">
                                    <div className="relative w-24 h-24">
                                        <svg viewBox="0 0 32 32" className="w-full h-full transform -rotate-90">
                                            {dataEntries.reduce((acc, entry, index) => {
                                                const percentage = total > 0 ? (entry.value / total) * 100 : 0;
                                                const offset = acc.offset;
                                                acc.elements.push(
                                                    <circle
                                                        key={index}
                                                        r="16"
                                                        cx="16"
                                                        cy="16"
                                                        fill="transparent"
                                                        stroke={entry.color}
                                                        strokeWidth="32"
                                                        strokeDasharray={`${percentage} ${100 - percentage}`}
                                                        strokeDashoffset={-offset}
                                                    />
                                                );
                                                acc.offset += percentage;
                                                return acc;
                                            }, { elements: [] as React.ReactNode[], offset: 0 }).elements}
                                        </svg>
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        {dataEntries.map((entry, index) => {
                                            const percentage = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0';
                                            return (
                                                <div key={index} className="flex items-center gap-2 text-xs">
                                                    <div
                                                        className="w-3 h-3 rounded-sm"
                                                        style={{ backgroundColor: entry.color }}
                                                    />
                                                    <span className="text-deep-600 dark:text-gray-300">{entry.label}</span>
                                                    <span className="text-deep-400 ml-auto">{percentage}%</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Line/Area Chart Preview */}
                            {(chartType === 'line' || chartType === 'area') && (
                                <div className="h-20 flex items-end gap-1">
                                    {dataEntries.map((entry, index) => {
                                        const percentage = total > 0 ? (entry.value / Math.max(...dataEntries.map(e => e.value))) * 100 : 0;
                                        return (
                                            <div
                                                key={index}
                                                className="flex-1 flex flex-col items-center gap-1"
                                            >
                                                <div
                                                    className="w-full rounded-t"
                                                    style={{
                                                        height: `${percentage}%`,
                                                        backgroundColor: chartType === 'area' ? entry.color : 'transparent',
                                                        borderTop: chartType === 'line' ? `3px solid ${entry.color}` : undefined,
                                                        minHeight: '4px'
                                                    }}
                                                />
                                                <span className="text-[8px] text-deep-400 truncate w-full text-center">
                                                    {entry.label.slice(0, 5)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
