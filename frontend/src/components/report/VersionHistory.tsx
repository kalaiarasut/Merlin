import { useState, useEffect, useCallback } from 'react';
import {
    History, Save, RotateCcw, Clock, ChevronDown, ChevronUp,
    Trash2, Eye, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ReportSection {
    id: string;
    title: string;
    content: string;
    level: number;
    key_findings: string[];
    bullet_points: string[];
    chart_type?: 'bar' | 'pie' | 'line' | 'area' | 'none';
    chart_data?: Record<string, number>;
}

interface ReportConfig {
    reportType: string;
    title: string;
    abstract: string;
    keywords: string[];
    sections: ReportSection[];
}

interface VersionSnapshot {
    id: string;
    timestamp: Date;
    label: string;
    config: ReportConfig;
    isAutoSave: boolean;
}

interface VersionHistoryProps {
    currentConfig: ReportConfig;
    onRestore: (config: ReportConfig) => void;
    onConfigChange?: (config: ReportConfig) => void;
    autoSaveInterval?: number; // in milliseconds
    maxVersions?: number;
    storageKey?: string;
    className?: string;
}

const STORAGE_KEY_PREFIX = 'cmlre-report-history';

export default function VersionHistory({
    currentConfig,
    onRestore,
    autoSaveInterval = 30000, // 30 seconds
    maxVersions = 20,
    storageKey = 'default',
    className
}: VersionHistoryProps) {
    const [versions, setVersions] = useState<VersionSnapshot[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [previewVersion, setPreviewVersion] = useState<string | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    const fullStorageKey = `${STORAGE_KEY_PREFIX}-${storageKey}`;

    // Load versions from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(fullStorageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                setVersions(parsed.map((v: any) => ({
                    ...v,
                    timestamp: new Date(v.timestamp)
                })));
            }
        } catch (err) {
            console.error('Failed to load version history:', err);
        }
    }, [fullStorageKey]);

    // Save versions to localStorage
    const saveVersions = useCallback((newVersions: VersionSnapshot[]) => {
        try {
            // Keep only maxVersions
            const trimmed = newVersions.slice(0, maxVersions);
            setVersions(trimmed);
            localStorage.setItem(fullStorageKey, JSON.stringify(trimmed));
        } catch (err) {
            console.error('Failed to save version history:', err);
        }
    }, [fullStorageKey, maxVersions]);

    // Create a new snapshot
    const createSnapshot = useCallback((isAutoSave: boolean = false, label?: string) => {
        const snapshot: VersionSnapshot = {
            id: Date.now().toString(),
            timestamp: new Date(),
            label: label || (isAutoSave ? 'Auto-save' : 'Manual save'),
            config: JSON.parse(JSON.stringify(currentConfig)), // Deep copy
            isAutoSave
        };

        const newVersions = [snapshot, ...versions];
        saveVersions(newVersions);
        setLastSaved(snapshot.timestamp);
        setHasUnsavedChanges(false);
    }, [currentConfig, versions, saveVersions]);

    // Auto-save effect
    useEffect(() => {
        if (autoSaveInterval <= 0) return;

        const interval = setInterval(() => {
            // Only auto-save if there are changes
            if (hasUnsavedChanges && currentConfig.sections.length > 0) {
                createSnapshot(true);
            }
        }, autoSaveInterval);

        return () => clearInterval(interval);
    }, [autoSaveInterval, hasUnsavedChanges, currentConfig, createSnapshot]);

    // Track changes
    useEffect(() => {
        setHasUnsavedChanges(true);
    }, [currentConfig]);

    // Restore a version
    const restoreVersion = (version: VersionSnapshot) => {
        onRestore(JSON.parse(JSON.stringify(version.config)));
        setPreviewVersion(null);
        createSnapshot(false, `Before restore to ${formatTime(version.timestamp)}`);
    };

    // Delete a version
    const deleteVersion = (id: string) => {
        const newVersions = versions.filter(v => v.id !== id);
        saveVersions(newVersions);
    };

    // Clear all versions
    const clearAllVersions = () => {
        saveVersions([]);
    };

    // Format time
    const formatTime = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Get version preview
    const getVersionPreview = (version: VersionSnapshot) => {
        const { config } = version;
        return {
            sections: config.sections.length,
            title: config.title || 'Untitled',
            words: config.sections.reduce((sum, s) => sum + (s.content?.split(/\s+/).length || 0), 0)
        };
    };

    return (
        <div className={cn("border rounded-lg bg-white dark:bg-deep-800", className)}>
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-deep-700/50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-ocean-500" />
                    <span className="text-sm font-medium text-deep-900 dark:text-gray-100">Version History</span>
                    <span className="text-xs text-deep-400">({versions.length})</span>
                </div>
                <div className="flex items-center gap-2">
                    {hasUnsavedChanges && (
                        <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <AlertCircle className="w-3 h-3" />
                            Unsaved
                        </span>
                    )}
                    {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-deep-400" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-deep-400" />
                    )}
                </div>
            </button>

            {/* Content */}
            {isExpanded && (
                <div className="border-t px-3 pb-3 space-y-3">
                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-3">
                        <Button
                            size="sm"
                            onClick={() => createSnapshot(false, 'Manual save')}
                            className="flex-1"
                        >
                            <Save className="w-4 h-4 mr-1" />
                            Save Now
                        </Button>
                        {versions.length > 0 && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={clearAllVersions}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        )}
                    </div>

                    {/* Auto-save indicator */}
                    <div className="flex items-center gap-2 text-xs text-deep-500 dark:text-gray-400">
                        <Clock className="w-3 h-3" />
                        Auto-saves every {Math.floor(autoSaveInterval / 1000)}s
                    </div>

                    {/* Version List */}
                    {versions.length === 0 ? (
                        <div className="text-center py-6 text-deep-400 dark:text-gray-500">
                            <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No saved versions yet</p>
                            <p className="text-xs">Click "Save Now" to create a snapshot</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {versions.map((version) => {
                                const preview = getVersionPreview(version);
                                const isPreview = previewVersion === version.id;

                                return (
                                    <div
                                        key={version.id}
                                        className={cn(
                                            "p-2 rounded-lg border transition-all",
                                            isPreview
                                                ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                                                : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "text-xs font-medium",
                                                        version.isAutoSave
                                                            ? "text-deep-500 dark:text-gray-400"
                                                            : "text-violet-600 dark:text-violet-400"
                                                    )}>
                                                        {version.label}
                                                    </span>
                                                    {version.isAutoSave && (
                                                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-deep-400">
                                                            auto
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-deep-500 dark:text-gray-400 mt-0.5">
                                                    {formatTime(version.timestamp)}
                                                </p>
                                                <p className="text-xs text-deep-400 dark:text-gray-500 mt-1">
                                                    "{preview.title}" • {preview.sections} sections • ~{preview.words} words
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => setPreviewVersion(isPreview ? null : version.id)}
                                                    className={cn(
                                                        "p-1.5 rounded transition-colors",
                                                        isPreview
                                                            ? "bg-violet-100 dark:bg-violet-800 text-violet-600"
                                                            : "text-deep-400 hover:text-violet-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                    )}
                                                    title="Preview"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => restoreVersion(version)}
                                                    className="p-1.5 text-deep-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                                                    title="Restore"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => deleteVersion(version.id)}
                                                    className="p-1.5 text-deep-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Preview details */}
                                        {isPreview && (
                                            <div className="mt-2 pt-2 border-t border-violet-200 dark:border-violet-800">
                                                <p className="text-xs font-medium text-deep-600 dark:text-gray-300 mb-1">
                                                    Sections:
                                                </p>
                                                <ul className="text-xs text-deep-500 dark:text-gray-400 space-y-0.5">
                                                    {version.config.sections.slice(0, 5).map((section, i) => (
                                                        <li key={i} className="truncate">
                                                            • {section.title}
                                                        </li>
                                                    ))}
                                                    {version.config.sections.length > 5 && (
                                                        <li className="text-deep-400">
                                                            +{version.config.sections.length - 5} more...
                                                        </li>
                                                    )}
                                                </ul>
                                                <Button
                                                    size="sm"
                                                    variant="premium"
                                                    className="w-full mt-2"
                                                    onClick={() => restoreVersion(version)}
                                                >
                                                    <RotateCcw className="w-3 h-3 mr-1" />
                                                    Restore This Version
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
