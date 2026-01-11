import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    Search, Loader, CheckCircle2, XCircle, AlertTriangle,
    Database, Fish, BookOpen, RefreshCw, Sparkles, Globe
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface TaxonomyResult {
    success: boolean;
    source: 'worms' | 'itis' | 'unknown';
    originalName: string;
    resolvedName?: string;
    resolvedAuthority?: string;
    taxonId?: string;
    aphiaId?: number;
    lsid?: string;
    status?: string;
    isSynonym: boolean;
    acceptedName?: string;
    classification?: {
        kingdom?: string;
        phylum?: string;
        class?: string;
        order?: string;
        family?: string;
        genus?: string;
    };
    habitat?: {
        isMarine?: boolean;
        isBrackish?: boolean;
        isFreshwater?: boolean;
    };
    confidence: number;
    error?: string;
}

interface BatchResult {
    total: number;
    resolved: number;
    unresolved: number;
    results: TaxonomyResult[];
    summary: {
        wormsMatches: number;
        itisMatches: number;
        synonymsFound: number;
        averageConfidence: number;
    };
}

export default function TaxonomyResolver() {
    const [searchName, setSearchName] = useState('');
    const [batchNames, setBatchNames] = useState('');
    const [mode, setMode] = useState<'single' | 'batch'>('single');
    const [result, setResult] = useState<TaxonomyResult | null>(null);
    const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

    const resolveMutation = useMutation({
        mutationFn: async (name: string) => {
            const response = await fetch('http://localhost:5000/api/taxonomy/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            return response.json();
        },
        onSuccess: (data) => {
            // Always set result so UI shows feedback
            if (data.result) {
                setResult(data.result);
                if (data.result.success) {
                    toast.success(`Found: ${data.result.resolvedName}`);
                } else {
                    toast.error('No matching species found in WoRMS or ITIS');
                }
            } else {
                // API error case
                setResult({
                    success: false,
                    source: 'unknown',
                    originalName: searchName,
                    isSynonym: false,
                    confidence: 0,
                    error: data.error || 'Resolution failed',
                });
                toast.error(data.error || 'Resolution failed');
            }
        },
        onError: () => toast.error('Failed to resolve name'),
    });

    const batchMutation = useMutation({
        mutationFn: async (names: string[]) => {
            const response = await fetch('http://localhost:5000/api/taxonomy/resolve-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ names }),
            });
            return response.json();
        },
        onSuccess: (data) => {
            if (data.success) {
                setBatchResult(data);
                toast.success(`Resolved ${data.resolved}/${data.total} names`);
            }
        },
        onError: () => toast.error('Batch resolution failed'),
    });

    const handleSingleResolve = () => {
        if (!searchName.trim()) return;
        setResult(null);
        resolveMutation.mutate(searchName.trim());
    };

    const handleBatchResolve = () => {
        const names = batchNames.split('\n').map(n => n.trim()).filter(n => n);
        if (names.length === 0) return;
        if (names.length > 100) {
            toast.error('Maximum 100 names per batch');
            return;
        }
        setBatchResult(null);
        batchMutation.mutate(names);
    };

    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 90) return 'text-marine-600';
        if (confidence >= 70) return 'text-ocean-600';
        if (confidence >= 50) return 'text-coral-600';
        return 'text-abyss-600';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Fish className="w-5 h-5 text-ocean-500" />
                        <span className="text-sm font-medium text-ocean-600 dark:text-ocean-400">Taxonomic Authority</span>
                    </div>
                    <h1 className="text-3xl lg:text-4xl font-bold text-deep-900 dark:text-white">Species Resolver</h1>
                    <p className="text-deep-500 dark:text-gray-400 mt-1">
                        Validate and resolve scientific names using WoRMS and ITIS databases
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Search Panel */}
                <div className="xl:col-span-2 space-y-6">
                    {/* Mode Toggle */}
                    <div className="flex gap-2">
                        <Button
                            variant={mode === 'single' ? 'default' : 'outline'}
                            onClick={() => setMode('single')}
                        >
                            <Search className="w-4 h-4 mr-2" />
                            Single Name
                        </Button>
                        <Button
                            variant={mode === 'batch' ? 'default' : 'outline'}
                            onClick={() => setMode('batch')}
                        >
                            <Database className="w-4 h-4 mr-2" />
                            Batch Mode
                        </Button>
                    </div>

                    {/* Single Name Search */}
                    {mode === 'single' && (
                        <Card variant="default">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Search className="w-5 h-5 text-ocean-500" />
                                    Resolve Scientific Name
                                </CardTitle>
                                <CardDescription>
                                    Enter a species name to validate against WoRMS (marine) or ITIS
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        value={searchName}
                                        onChange={(e) => setSearchName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSingleResolve()}
                                        placeholder="e.g., Thunnus albacares"
                                        className="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-ocean-500 focus:border-transparent"
                                    />
                                    <Button
                                        onClick={handleSingleResolve}
                                        disabled={resolveMutation.isPending || !searchName.trim()}
                                        variant="premium"
                                    >
                                        {resolveMutation.isPending ? (
                                            <Loader className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Search className="w-4 h-4" />
                                        )}
                                    </Button>
                                </div>

                                {/* Result */}
                                {result && (
                                    <div className="mt-6">
                                        {result.success ? (
                                            <div className="p-4 bg-marine-50 dark:bg-marine-900/20 rounded-xl border border-marine-200 dark:border-marine-800">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <CheckCircle2 className="w-5 h-5 text-marine-600" />
                                                            <span className="font-semibold text-deep-900 dark:text-white">
                                                                {result.resolvedName}
                                                            </span>
                                                            <Badge variant="secondary" className="text-xs">
                                                                {result.source.toUpperCase()}
                                                            </Badge>
                                                        </div>
                                                        {result.resolvedAuthority && (
                                                            <p className="text-sm text-deep-500 dark:text-gray-400 mb-2">
                                                                {result.resolvedAuthority}
                                                            </p>
                                                        )}
                                                        {result.isSynonym && (
                                                            <div className="flex items-center gap-2 text-sm text-coral-600 mb-2">
                                                                <AlertTriangle className="w-4 h-4" />
                                                                Synonym of: <strong>{result.acceptedName}</strong>
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-4 text-xs text-deep-500 dark:text-gray-400">
                                                            {result.habitat?.isMarine && (
                                                                <span className="flex items-center gap-1">
                                                                    <Globe className="w-3 h-3" /> Marine
                                                                </span>
                                                            )}
                                                            <span className={cn("font-medium", getConfidenceColor(result.confidence))}>
                                                                {result.confidence}% confidence
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {result.taxonId && (
                                                        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                                            {result.aphiaId ? `AphiaID: ${result.aphiaId}` : result.taxonId}
                                                        </code>
                                                    )}
                                                </div>

                                                {/* Classification */}
                                                {result.classification && (
                                                    <div className="mt-4 pt-4 border-t border-marine-200 dark:border-marine-700">
                                                        <p className="text-xs font-medium text-deep-500 dark:text-gray-400 mb-2">Classification</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {Object.entries(result.classification).map(([rank, name]) => (
                                                                name && (
                                                                    <span key={rank} className="px-2 py-1 bg-white dark:bg-deep-800 rounded text-xs">
                                                                        <span className="text-deep-400">{rank}:</span> {name}
                                                                    </span>
                                                                )
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <XCircle className="w-5 h-5 text-red-600" />
                                                    <span className="font-medium text-red-700 dark:text-red-300">
                                                        No matching species found
                                                    </span>
                                                </div>
                                                <p className="text-sm text-red-600 dark:text-red-400">
                                                    No matching species found in WoRMS or ITIS. Please check spelling or try another name.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Batch Mode */}
                    {mode === 'batch' && (
                        <Card variant="default">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Database className="w-5 h-5 text-ocean-500" />
                                    Batch Resolution
                                </CardTitle>
                                <CardDescription>
                                    Enter multiple names (one per line, max 100)
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <textarea
                                    value={batchNames}
                                    onChange={(e) => setBatchNames(e.target.value)}
                                    placeholder="Thunnus albacares&#10;Sardina pilchardus&#10;Rastrelliger kanagurta"
                                    className="w-full h-40 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-ocean-500 resize-none font-mono text-sm"
                                />
                                <Button
                                    onClick={handleBatchResolve}
                                    disabled={batchMutation.isPending || !batchNames.trim()}
                                    className="w-full mt-4"
                                    variant="premium"
                                >
                                    {batchMutation.isPending ? (
                                        <>
                                            <Loader className="w-4 h-4 mr-2 animate-spin" />
                                            Resolving...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4 mr-2" />
                                            Resolve All Names
                                        </>
                                    )}
                                </Button>

                                {/* Batch Results */}
                                {batchResult && (
                                    <div className="mt-6 space-y-4">
                                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-deep-800/50 rounded-xl">
                                            <div className="flex gap-6">
                                                <div className="text-center">
                                                    <p className="text-2xl font-bold text-marine-600">{batchResult.resolved}</p>
                                                    <p className="text-xs text-deep-500">Resolved</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-2xl font-bold text-abyss-600">{batchResult.unresolved}</p>
                                                    <p className="text-xs text-deep-500">Failed</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-2xl font-bold text-coral-600">{batchResult.summary.synonymsFound}</p>
                                                    <p className="text-xs text-deep-500">Synonyms</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-medium">Avg Confidence</p>
                                                <p className={cn("text-xl font-bold", getConfidenceColor(batchResult.summary.averageConfidence))}>
                                                    {batchResult.summary.averageConfidence}%
                                                </p>
                                            </div>
                                        </div>

                                        <div className="max-h-64 overflow-y-auto space-y-2">
                                            {batchResult.results.map((r, i) => (
                                                <div
                                                    key={i}
                                                    className={cn(
                                                        "flex items-center justify-between p-3 rounded-lg",
                                                        r.success ? "bg-marine-50" : "bg-abyss-50"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {r.success ? (
                                                            <CheckCircle2 className="w-4 h-4 text-marine-600" />
                                                        ) : (
                                                            <XCircle className="w-4 h-4 text-abyss-600" />
                                                        )}
                                                        <span className="text-sm">
                                                            <span className="text-deep-500">{r.originalName}</span>
                                                            {r.success && r.resolvedName !== r.originalName && (
                                                                <span className="text-ocean-600"> → {r.resolvedName}</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                    {r.success && (
                                                        <span className={cn("text-xs font-medium", getConfidenceColor(r.confidence))}>
                                                            {r.confidence}%
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Data Sources */}
                    <Card variant="glass">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Globe className="w-4 h-4 text-ocean-500" />
                                Data Sources
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 rounded-lg bg-ocean-100">
                                        <span className="text-lg">🌊</span>
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm text-deep-900">WoRMS</p>
                                        <p className="text-xs text-deep-500">World Register of Marine Species</p>
                                        <Badge variant="secondary" className="mt-1 text-xs">Primary</Badge>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="p-2 rounded-lg bg-gray-100">
                                        <span className="text-lg">🌍</span>
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm text-deep-900">ITIS</p>
                                        <p className="text-xs text-deep-500">Integrated Taxonomic Information System</p>
                                        <Badge variant="outline" className="mt-1 text-xs">Fallback</Badge>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Info */}
                    <Card variant="default">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-ocean-500" />
                                How It Works
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2 text-sm text-deep-600">
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-marine-500 mt-0.5 flex-shrink-0" />
                                    <span>Searches WoRMS first for marine species</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-marine-500 mt-0.5 flex-shrink-0" />
                                    <span>Falls back to ITIS for non-marine species</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-marine-500 mt-0.5 flex-shrink-0" />
                                    <span>Resolves synonyms to accepted names</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-marine-500 mt-0.5 flex-shrink-0" />
                                    <span>Returns persistent AphiaID or TSN</span>
                                </li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
