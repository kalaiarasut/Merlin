import { useState, useEffect } from 'react';
import {
    GitBranch, GitCommit, RotateCcw, CheckCircle, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { auditService } from '@/services/api';
import { cn } from '@/lib/utils';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
    AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

interface VersionControlProps {
    datasetId: string;
    onVersionRestore?: () => void; // Callback to refresh parent data
    isOwner: boolean; // Access Control
}

export default function DatasetVersionControl({ datasetId, onVersionRestore, isOwner }: VersionControlProps) {
    const [history, setHistory] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState<any>(null);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const data = await auditService.getDatasetVersions(datasetId);
            setHistory(data);
        } catch (error) {
            console.error("Failed to fetch version history", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (datasetId) fetchHistory();
    }, [datasetId]);

    const handleRestore = async (version: number) => {
        setRestoring(true);
        try {
            await auditService.restoreVersion(datasetId, version);
            // Refresh history to show new version (which is a copy of the restored one)
            await fetchHistory();
            if (onVersionRestore) onVersionRestore();
        } catch (error) {
            console.error("Restore failed", error);
        } finally {
            setRestoring(false);
        }
    };

    if (loading && !history) return <div className="p-4 text-center">Loading version history...</div>;
    if (!history) return null;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-indigo-500" />
                    Version Timeline
                </h3>
                <Badge variant="outline">{history.totalVersions} Versions</Badge>
            </div>

            <div className="relative border-l-2 border-gray-200 ml-4 space-y-8">
                {history.versions.map((ver: any, index: number) => {
                    const isActive = ver.version === history.currentVersion;
                    const isSelected = selectedVersion?.version === ver.version;

                    return (
                        <div key={ver.version} className="relative pl-6">
                            {/* Dot on timeline */}
                            <div className={cn(
                                "absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 bg-white transition-colors",
                                isActive ? "border-green-500 bg-green-50" : "border-gray-400",
                                ver.changeType === 'restore' ? "border-amber-500" : ""
                            )} />

                            <div className={cn(
                                "p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md",
                                isActive ? "border-green-200 bg-green-50/30" : "border-gray-200 bg-white",
                                isSelected ? "ring-2 ring-indigo-500" : ""
                            )} onClick={() => setSelectedVersion(ver)}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <Badge variant={isActive ? "default" : "secondary"}>
                                            v{ver.version}
                                        </Badge>
                                        {isActive && (
                                            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3" /> Current
                                            </span>
                                        )}
                                        {ver.changeType === 'restore' && (
                                            <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                                                Restored
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center text-xs text-gray-400 gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(ver.createdAt).toLocaleString()}
                                    </div>
                                </div>

                                <p className="text-sm font-medium text-gray-900 mb-1">
                                    {ver.description || "No description"}
                                </p>

                                <div className="text-xs text-gray-500 flex gap-4 mt-2">
                                    <span>User: <b>{ver.createdByName}</b></span>
                                    <span>Records: <b>{ver.recordCount}</b></span>
                                    <span>Size: <b>{(ver.sizeBytes / 1024).toFixed(1)} KB</b></span>
                                </div>

                                {/* Restore Button (Access Control Protected) */}
                                {isOwner && !isActive && (
                                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="sm" className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 h-8">
                                                    <RotateCcw className="w-3 h-3 mr-1" />
                                                    Restore this version
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Restore Version {ver.version}?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will create a new version (v{history.totalVersions + 1}) containing exactly the data from v{ver.version}.
                                                        Current data will be preserved as v{history.currentVersion} in history.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleRestore(ver.version)}
                                                        className="bg-amber-600 hover:bg-amber-700"
                                                    >
                                                        {restoring ? "Restoring..." : "Yes, Restore"}
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
