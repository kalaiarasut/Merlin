import { useState, useEffect } from 'react';
import {
    Play, CheckCircle, XCircle, AlertTriangle, ExternalLink,
    Database, RotateCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { auditService } from '@/services/api';
import { cn } from '@/lib/utils';
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger
} from '@/components/ui/accordion';

export default function ReproducibilityDashboard() {
    const [snapshots, setSnapshots] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [verifyingId, setVerifyingId] = useState<string | null>(null);

    const fetchSnapshots = async () => {
        setLoading(true);
        try {
            const data = await auditService.getSnapshots({ limit: 20 });
            setSnapshots(data.snapshots);
        } catch (error) {
            console.error("Failed to fetch snapshots", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSnapshots();
    }, []);

    const handleVerify = async (id: string) => {
        setVerifyingId(id);
        try {
            const result = await auditService.verifySnapshot(id);
            // Update local state to reflect verification result
            setSnapshots(prev => prev.map(snap => {
                if (snap._id === id) {
                    return {
                        ...snap,
                        status: result.matches ? 'verified' : 'failed',
                        verificationResult: result
                    };
                }
                return snap;
            }));
        } catch (error) {
            console.error("Verification failed", error);
        } finally {
            setVerifyingId(null);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'verified': return <Badge className="bg-green-100 text-green-800 border-green-200">Verified</Badge>;
            case 'failed': return <Badge variant="destructive">Failed</Badge>;
            case 'pending': return <Badge variant="outline" className="text-gray-500">Untested</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <RotateCw className="w-5 h-5 text-indigo-500" />
                    Reproducibility Dashboard
                </CardTitle>
            </CardHeader>
            <CardContent>
                {loading && <div className="text-center py-4">Loading snapshots...</div>}

                <Accordion type="single" collapsible className="w-full">
                    {snapshots.map((snap) => (
                        <AccordionItem key={snap._id} value={snap._id}>
                            <AccordionTrigger className="hover:no-underline">
                                <div className="flex items-center justify-between w-full pr-4">
                                    <div className="flex items-center gap-4">
                                        {getStatusBadge(snap.status)}
                                        <div className="text-left">
                                            <div className="font-medium text-sm">{snap.name}</div>
                                            <div className="text-xs text-gray-500">
                                                {new Date(snap.createdAt).toLocaleString()} • {snap.analysisType}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-xs font-mono text-gray-400">
                                        ID: {snap._id.substring(0, 8)}...
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="bg-gray-50/50 p-4 space-y-4">
                                {/* Provenance Details */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-semibold uppercase text-gray-500 flex items-center gap-1">
                                            <Database className="w-3 h-3" /> Input Data
                                        </h4>
                                        <div className="text-sm bg-white p-2 rounded border">
                                            {snap.inputDatasets.map((ds: any, i: number) => (
                                                <div key={i} className="flex justify-between items-center py-1 border-b last:border-0">
                                                    <span>{ds.datasetId}</span>
                                                    <Badge variant="secondary" className="text-xs">v{ds.version}</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-semibold uppercase text-gray-500">Parameters</h4>
                                        <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-32">
                                            {JSON.stringify(snap.parameters, null, 2)}
                                        </pre>
                                    </div>
                                </div>

                                {/* Verification Section */}
                                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            onClick={() => handleVerify(snap._id)}
                                            disabled={verifyingId === snap._id}
                                            className={cn(
                                                "gap-2",
                                                snap.status === 'verified' ? "bg-green-600 hover:bg-green-700" : ""
                                            )}
                                        >
                                            {verifyingId === snap._id ? (
                                                "Verifying..."
                                            ) : (
                                                <>
                                                    <CheckCircle className="w-4 h-4" />
                                                    {snap.status === 'verified' ? "Re-Verify" : "Verify Reproducibility"}
                                                </>
                                            )}
                                        </Button>

                                        {/* Deep Link / Replay Mode */}
                                        <Button variant="outline" size="sm" className="gap-2">
                                            <Play className="w-4 h-4" />
                                            Replay Analysis
                                        </Button>
                                    </div>

                                    {/* Checksum Evidence */}
                                    <div className="text-right">
                                        <div className="text-xs text-gray-500 mb-1">Result Checksum (SHA-256)</div>
                                        <code className="text-xs bg-gray-100 px-2 py-1 rounded block w-full max-w-[200px] truncate">
                                            {snap.resultsChecksum}
                                        </code>
                                    </div>
                                </div>

                                {snap.verificationResult && (
                                    <div className={cn(
                                        "mt-2 p-3 rounded text-sm flex items-start gap-2",
                                        snap.verificationResult.matches ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                                    )}>
                                        {snap.verificationResult.matches ? <CheckCircle className="w-4 h-4 mt-0.5" /> : <XCircle className="w-4 h-4 mt-0.5" />}
                                        <div>
                                            <p className="font-semibold">{snap.verificationResult.matches ? "Verification Successful" : "Verification Failed"}</p>
                                            <p className="text-xs mt-1">{snap.verificationResult.details}</p>
                                        </div>
                                    </div>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>

                {!loading && snapshots.length === 0 && (
                    <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                        <RotateCw className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900">No Analysis Snapshots</h3>
                        <p className="text-gray-500 max-w-xs mx-auto mt-2">
                            Snapshots are created automatically when you run complex oceanographic or species analyses.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
