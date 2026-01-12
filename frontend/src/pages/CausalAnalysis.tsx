import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Input, Textarea } from '@/components/ui/input';
import { useThemeStore } from '@/store/themeStore';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
    GitBranch, TrendingUp, TrendingDown, Activity, RefreshCw, Zap,
    Loader2, CheckCircle, AlertTriangle, Clock, Target, Info, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// API service for causal analysis
const causalService = {
    getInfo: async () => {
        const res = await fetch(`${API_BASE}/api/causal/info`);
        return res.json();
    },
    getAvailableSeries: async () => {
        const res = await fetch(`${API_BASE}/api/causal/available-series`);
        return res.json();
    },
    getTimeSeries: async (seriesId: string, aggregation: string = 'monthly') => {
        const res = await fetch(`${API_BASE}/api/causal/time-series/${seriesId}?aggregation=${aggregation}`);
        return res.json();
    },
    correlate: async (data: any) => {
        const res = await fetch(`${API_BASE}/api/causal/correlate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },
    lagAnalysis: async (data: any) => {
        const res = await fetch(`${API_BASE}/api/causal/lag-analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },
    grangerCausality: async (data: any) => {
        const res = await fetch(`${API_BASE}/api/causal/granger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },
    fullAnalysis: async (data: any) => {
        const res = await fetch(`${API_BASE}/api/causal/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },
    getMechanisms: async () => {
        const res = await fetch(`${API_BASE}/api/causal/mechanisms`);
        return res.json();
    },
};

// Sample time series for demo
const SAMPLE_SST = {
    id: 'sst', name: 'Sea Surface Temperature',
    dataPoints: [
        { date: '2024-01', value: 28.5 }, { date: '2024-02', value: 29.0 },
        { date: '2024-03', value: 29.5 }, { date: '2024-04', value: 30.0 },
        { date: '2024-05', value: 30.5 }, { date: '2024-06', value: 29.8 },
        { date: '2024-07', value: 29.2 }, { date: '2024-08', value: 28.8 },
    ],
};

const SAMPLE_CPUE = {
    id: 'cpue', name: 'Fish Abundance (CPUE)',
    dataPoints: [
        { date: '2024-01', value: 15.2 }, { date: '2024-02', value: 16.8 },
        { date: '2024-03', value: 18.5 }, { date: '2024-04', value: 22.1 },
        { date: '2024-05', value: 25.6 }, { date: '2024-06', value: 23.4 },
        { date: '2024-07', value: 21.2 }, { date: '2024-08', value: 19.8 },
    ],
};

const SAMPLE_CHLOROPHYLL = {
    id: 'chl', name: 'Chlorophyll-a',
    dataPoints: [
        { date: '2024-01', value: 2.1 }, { date: '2024-02', value: 2.3 },
        { date: '2024-03', value: 2.8 }, { date: '2024-04', value: 3.2 },
        { date: '2024-05', value: 3.5 }, { date: '2024-06', value: 3.0 },
        { date: '2024-07', value: 2.5 }, { date: '2024-08', value: 2.2 },
    ],
};

export default function CausalAnalysis() {
    const { resolvedTheme } = useThemeStore();
    const isDark = resolvedTheme === 'dark';
    const [activeTab, setActiveTab] = useState<'overview' | 'correlation' | 'lag' | 'granger'>('overview');

    // Dataset selection state
    const [driverSeriesId, setDriverSeriesId] = useState<string>('sst');
    const [responseSeriesId, setResponseSeriesId] = useState<string>('');
    const [aggregation, setAggregation] = useState<'monthly' | 'weekly'>('monthly');

    const chartColors = {
        grid: isDark ? '#374151' : '#e5e7eb',
        text: isDark ? '#9ca3af' : '#64748b',
        tooltipBg: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        tooltipText: isDark ? '#f3f4f6' : '#1e293b',
    };

    // Fetch available time series
    const { data: availableSeries } = useQuery({
        queryKey: ['causal-available-series'],
        queryFn: causalService.getAvailableSeries,
    });

    // Fetch driver time series
    const { data: driverData, isLoading: driverLoading } = useQuery({
        queryKey: ['causal-driver-series', driverSeriesId, aggregation],
        queryFn: () => causalService.getTimeSeries(driverSeriesId, aggregation),
        enabled: !!driverSeriesId && driverSeriesId.startsWith('cpue_'),
    });

    // Fetch response time series
    const { data: responseData, isLoading: responseLoading } = useQuery({
        queryKey: ['causal-response-series', responseSeriesId, aggregation],
        queryFn: () => causalService.getTimeSeries(responseSeriesId, aggregation),
        enabled: !!responseSeriesId && responseSeriesId.startsWith('cpue_'),
    });

    // Fetch module info
    const { data: moduleInfo } = useQuery({
        queryKey: ['causal-info'],
        queryFn: causalService.getInfo,
    });

    // Fetch known mechanisms
    const { data: mechanisms } = useQuery({
        queryKey: ['causal-mechanisms'],
        queryFn: causalService.getMechanisms,
    });

    // Correlation mutation
    const correlationMutation = useMutation({
        mutationFn: causalService.correlate,
        onSuccess: (data) => {
            if (data.success) {
                toast.success('Correlation analysis completed');
            } else {
                toast.error(data.error || 'Analysis failed');
            }
        },
        onError: () => toast.error('Failed to connect to API'),
    });

    // Lag analysis mutation
    const lagMutation = useMutation({
        mutationFn: causalService.lagAnalysis,
        onSuccess: (data) => {
            if (data.success) {
                toast.success('Lag analysis completed');
            } else {
                toast.error(data.error || 'Analysis failed');
            }
        },
        onError: () => toast.error('Failed to connect to API'),
    });

    // Granger causality mutation
    const grangerMutation = useMutation({
        mutationFn: causalService.grangerCausality,
        onSuccess: (data) => {
            if (data.success) {
                toast.success('Granger causality test completed');
            } else {
                toast.error(data.error || 'Test failed');
            }
        },
        onError: () => toast.error('Failed to connect to API'),
    });

    // Run analyses - use fetched data or fall back to samples
    const getDriverSeries = () => {
        if (driverData?.timeSeries?.length > 0) {
            return {
                id: driverSeriesId,
                name: driverData.metadata?.name || driverSeriesId,
                dataPoints: driverData.timeSeries.map((d: any) => ({ date: d.date, value: d.value })),
            };
        }
        // Fall back to sample for oceanographic series (not yet integrated with ERDDAP)
        if (driverSeriesId === 'sst') return SAMPLE_SST;
        if (driverSeriesId === 'chlorophyll') return SAMPLE_CHLOROPHYLL;
        return SAMPLE_SST;
    };

    const getResponseSeries = () => {
        if (responseData?.timeSeries?.length > 0) {
            return {
                id: responseSeriesId,
                name: responseData.metadata?.name || responseSeriesId,
                dataPoints: responseData.timeSeries.map((d: any) => ({ date: d.date, value: d.value })),
            };
        }
        // Fall back to sample if no response selected
        return SAMPLE_CPUE;
    };

    const runCorrelation = () => {
        const series1 = getDriverSeries();
        const series2 = getResponseSeries();
        correlationMutation.mutate({ series1, series2 });
    };

    const runLagAnalysis = () => {
        const driver = getDriverSeries();
        const response = getResponseSeries();
        lagMutation.mutate({ driver, response, maxLag: aggregation === 'weekly' ? 12 : 6 });
    };

    const runGrangerTest = () => {
        const cause = getDriverSeries();
        const effect = getResponseSeries();
        grangerMutation.mutate({ cause, effect, maxLag: aggregation === 'weekly' ? 8 : 4 });
    };

    const correlation = correlationMutation.data?.correlation;
    const lagResult = lagMutation.data?.lagAnalysis;
    const grangerResult = grangerMutation.data?.granger;

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <GitBranch className="w-5 h-5 text-abyss-500" />
                        <span className="text-sm font-medium text-abyss-600 dark:text-abyss-400">Causal Module</span>
                    </div>
                    <h1 className="text-3xl lg:text-4xl font-bold text-deep-900 dark:text-gray-100">
                        Cross-Domain Causal Analysis
                    </h1>
                    <p className="text-deep-500 dark:text-gray-400 mt-1">
                        Correlation, lag effects, and Granger causality testing
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={runCorrelation} disabled={correlationMutation.isPending}>
                        {correlationMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
                        Correlate
                    </Button>
                    <Button variant="premium" onClick={runGrangerTest} disabled={grangerMutation.isPending}>
                        {grangerMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                        Granger Test
                    </Button>
                </div>
            </div>

            {/* Dataset Selection Panel */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Data Selection</CardTitle>
                    <CardDescription>Select oceanographic driver and fisheries response for causal analysis</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* Driver Series (Oceanographic) */}
                        <div>
                            <label className="text-sm font-medium text-deep-700 dark:text-gray-300 mb-2 block">
                                Driver Variable (X)
                            </label>
                            <select
                                value={driverSeriesId}
                                onChange={(e) => setDriverSeriesId(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-deep-800 text-deep-900 dark:text-gray-100"
                            >
                                <optgroup label="Oceanographic (ERDDAP)">
                                    {availableSeries?.oceanographic?.map((s: any) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="Fisheries CPUE (Uploaded)">
                                    {availableSeries?.fisheries?.map((s: any) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>

                        {/* Response Series (CPUE) */}
                        <div>
                            <label className="text-sm font-medium text-deep-700 dark:text-gray-300 mb-2 block">
                                Response Variable (Y)
                            </label>
                            <select
                                value={responseSeriesId}
                                onChange={(e) => setResponseSeriesId(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-deep-800 text-deep-900 dark:text-gray-100"
                            >
                                <option value="">-- Select Response --</option>
                                <optgroup label="Fisheries CPUE (Uploaded)">
                                    {availableSeries?.fisheries?.map((s: any) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="Oceanographic (ERDDAP)">
                                    {availableSeries?.oceanographic?.map((s: any) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>

                        {/* Aggregation */}
                        <div>
                            <label className="text-sm font-medium text-deep-700 dark:text-gray-300 mb-2 block">
                                Time Aggregation
                            </label>
                            <div className="flex gap-2">
                                <Button
                                    variant={aggregation === 'monthly' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setAggregation('monthly')}
                                    className="flex-1"
                                >
                                    Monthly
                                </Button>
                                <Button
                                    variant={aggregation === 'weekly' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setAggregation('weekly')}
                                    className="flex-1"
                                >
                                    Weekly
                                </Button>
                            </div>
                        </div>

                        {/* Data Status */}
                        <div>
                            <label className="text-sm font-medium text-deep-700 dark:text-gray-300 mb-2 block">
                                Data Status
                            </label>
                            <div className="p-2 bg-gray-50 dark:bg-deep-800 rounded-lg text-sm">
                                {availableSeries?.dataStatus?.hasUploadedData ? (
                                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                                        <CheckCircle className="w-4 h-4" />
                                        {availableSeries.dataStatus.speciesCount} species • {availableSeries.dataStatus.totalCatchRecords} records
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                                        <AlertTriangle className="w-4 h-4" />
                                        Upload data first
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tabs */}
            <div className="flex gap-2 flex-wrap">
                {['overview', 'correlation', 'lag', 'granger'].map(tab => (
                    <Button
                        key={tab}
                        variant={activeTab === tab ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setActiveTab(tab as any)}
                        className="capitalize"
                    >
                        {tab === 'lag' ? 'Lag Analysis' : tab === 'granger' ? 'Granger Causality' : tab}
                    </Button>
                ))}
            </div>

            {activeTab === 'overview' && (
                <>
                    {/* Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            title="Correlation (r)"
                            value={correlation?.pearsonR?.toFixed(3) || '—'}
                            change={correlation?.significant ? 5 : 0}
                            changeLabel={correlation?.relationship || 'pending'}
                            icon={<Activity className="w-5 h-5" />}
                            iconColor="ocean"
                        />
                        <StatCard
                            title="Optimal Lag"
                            value={lagResult?.optimalLag !== undefined ? `${lagResult.optimalLag} mo` : '—'}
                            change={0}
                            changeLabel={lagResult?.optimalLagUnit || 'months'}
                            icon={<Clock className="w-5 h-5" />}
                            iconColor="marine"
                        />
                        <StatCard
                            title="Granger F-stat"
                            value={grangerResult?.fStatistic?.toFixed(2) || '—'}
                            change={grangerResult?.significant ? 10 : -5}
                            changeLabel={grangerResult?.significant ? 'significant' : 'not sig'}
                            icon={<Target className="w-5 h-5" />}
                            iconColor="coral"
                        />
                        <StatCard
                            title="Methods"
                            value={moduleInfo?.module?.methods?.correlation?.length || '—'}
                            change={0}
                            changeLabel="available"
                            icon={<Zap className="w-5 h-5" />}
                            iconColor="abyss"
                        />
                    </div>

                    {/* Results Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Correlation Result */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Correlation Analysis</CardTitle>
                                <CardDescription>Relationship between SST and CPUE</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {correlationMutation.isPending ? (
                                    <div className="h-48 flex items-center justify-center">
                                        <Loader2 className="w-8 h-8 animate-spin text-ocean-500" />
                                    </div>
                                ) : correlation ? (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-ocean-50 dark:bg-ocean-900/20 rounded-xl">
                                                <div className="text-sm text-ocean-600 dark:text-ocean-400">Pearson r</div>
                                                <div className="text-2xl font-bold text-deep-900 dark:text-gray-100">{correlation.pearsonR?.toFixed(3)}</div>
                                            </div>
                                            <div className="p-4 bg-marine-50 dark:bg-marine-900/20 rounded-xl">
                                                <div className="text-sm text-marine-600 dark:text-marine-400">Spearman ρ</div>
                                                <div className="text-2xl font-bold text-deep-900 dark:text-gray-100">{correlation.spearmanRho?.toFixed(3)}</div>
                                            </div>
                                        </div>
                                        <div className="p-3 bg-gray-50 dark:bg-deep-800 rounded-lg">
                                            <p className="text-sm text-deep-600 dark:text-gray-300">{correlation.interpretation}</p>
                                        </div>
                                        <Badge variant={correlation.significant ? 'success' : 'secondary'}>
                                            {correlation.significant ? 'Statistically Significant' : 'Not Significant'}
                                        </Badge>
                                    </div>
                                ) : (
                                    <div className="h-48 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                                        <Activity className="w-12 h-12 mb-4 text-ocean-300" />
                                        <p>Click "Correlate" to analyze</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Granger Result */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Granger Causality</CardTitle>
                                <CardDescription>Does SST Granger-cause CPUE?</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {grangerMutation.isPending ? (
                                    <div className="h-48 flex items-center justify-center">
                                        <Loader2 className="w-8 h-8 animate-spin text-ocean-500" />
                                    </div>
                                ) : grangerResult ? (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="p-3 bg-gray-50 dark:bg-deep-800 rounded-xl text-center">
                                                <div className="text-xs text-deep-500 dark:text-gray-400">F-statistic</div>
                                                <div className="text-xl font-bold text-deep-900 dark:text-gray-100">{grangerResult.fStatistic?.toFixed(2)}</div>
                                            </div>
                                            <div className="p-3 bg-gray-50 dark:bg-deep-800 rounded-xl text-center">
                                                <div className="text-xs text-deep-500 dark:text-gray-400">p-value</div>
                                                <div className="text-xl font-bold text-deep-900 dark:text-gray-100">{grangerResult.pValue?.toFixed(3)}</div>
                                            </div>
                                            <div className="p-3 bg-gray-50 dark:bg-deep-800 rounded-xl text-center">
                                                <div className="text-xs text-deep-500 dark:text-gray-400">Optimal Lag</div>
                                                <div className="text-xl font-bold text-deep-900 dark:text-gray-100">{grangerResult.optimalLag}</div>
                                            </div>
                                        </div>
                                        <div className={`p-4 rounded-lg border ${grangerResult.significant ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-gray-50 dark:bg-deep-800 border-gray-200 dark:border-gray-700'}`}>
                                            <div className="flex items-start gap-3">
                                                {grangerResult.significant ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" /> : <Info className="w-5 h-5 text-gray-500" />}
                                                <p className="text-sm text-deep-700 dark:text-gray-300">{grangerResult.interpretation}</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-48 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                                        <Target className="w-12 h-12 mb-4 text-ocean-300" />
                                        <p>Click "Granger Test" to analyze</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Known Mechanisms */}
                    {mechanisms?.mechanisms && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Known Ecological Mechanisms</CardTitle>
                                <CardDescription>Pre-loaded driver-response relationships</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {mechanisms.mechanisms.map((m: any, i: number) => (
                                        <div key={i} className="p-4 bg-gray-50 dark:bg-deep-800 rounded-xl border border-gray-100 dark:border-gray-700">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="font-medium text-deep-900 dark:text-gray-100">{m.driver}</span>
                                                <ChevronRight className="w-4 h-4 text-deep-400" />
                                                <span className="font-medium text-deep-900 dark:text-gray-100">{m.response}</span>
                                            </div>
                                            <p className="text-sm text-deep-600 dark:text-gray-400">{m.mechanism}</p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <Badge variant={m.expectedDirection === 'positive' ? 'success' : 'warning'} size="sm">
                                                    {m.expectedDirection}
                                                </Badge>
                                                <span className="text-xs text-deep-500 dark:text-gray-500">~{m.typicalLag}mo lag</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}

            {activeTab === 'correlation' && (
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle>Pairwise Correlation</CardTitle>
                                <CardDescription>Analyze relationship between two time series</CardDescription>
                            </div>
                            <Button variant="outline" onClick={runCorrelation} disabled={correlationMutation.isPending}>
                                {correlationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Run Analysis'}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {correlation ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="p-4 bg-ocean-50 dark:bg-ocean-900/20 rounded-xl">
                                        <div className="text-sm text-ocean-600 dark:text-ocean-400">Pearson r</div>
                                        <div className="text-2xl font-bold text-deep-900 dark:text-gray-100">{correlation.pearsonR?.toFixed(3)}</div>
                                    </div>
                                    <div className="p-4 bg-marine-50 dark:bg-marine-900/20 rounded-xl">
                                        <div className="text-sm text-marine-600 dark:text-marine-400">Spearman ρ</div>
                                        <div className="text-2xl font-bold text-deep-900 dark:text-gray-100">{correlation.spearmanRho?.toFixed(3)}</div>
                                    </div>
                                    <div className="p-4 bg-coral-50 dark:bg-coral-900/20 rounded-xl">
                                        <div className="text-sm text-coral-600 dark:text-coral-400">p-value</div>
                                        <div className="text-2xl font-bold text-deep-900 dark:text-gray-100">{correlation.pValue?.toFixed(4)}</div>
                                    </div>
                                    <div className="p-4 bg-abyss-50 dark:bg-abyss-900/20 rounded-xl">
                                        <div className="text-sm text-abyss-600 dark:text-abyss-400">Sample Size</div>
                                        <div className="text-2xl font-bold text-deep-900 dark:text-gray-100">{correlation.sampleSize}</div>
                                    </div>
                                </div>
                                <div className="p-4 bg-gray-50 dark:bg-deep-800 rounded-xl">
                                    <h4 className="font-medium text-deep-900 dark:text-gray-100 mb-2">Interpretation</h4>
                                    <p className="text-deep-600 dark:text-gray-400">{correlation.interpretation}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="h-60 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                                <Activity className="w-12 h-12 mb-4 text-ocean-300" />
                                <p>Click "Run Analysis" to calculate correlations</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'lag' && (
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle>Lag Analysis</CardTitle>
                                <CardDescription>Find optimal time lag between driver and response</CardDescription>
                            </div>
                            <Button variant="outline" onClick={runLagAnalysis} disabled={lagMutation.isPending}>
                                {lagMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Run Analysis'}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {lagResult ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="p-4 bg-ocean-50 dark:bg-ocean-900/20 rounded-xl text-center">
                                        <div className="text-sm text-ocean-600 dark:text-ocean-400">Optimal Lag</div>
                                        <div className="text-3xl font-bold text-deep-900 dark:text-gray-100">{lagResult.optimalLag}</div>
                                        <div className="text-sm text-ocean-500 dark:text-ocean-400">{lagResult.optimalLagUnit}</div>
                                    </div>
                                    <div className="p-4 bg-marine-50 dark:bg-marine-900/20 rounded-xl text-center">
                                        <div className="text-sm text-marine-600 dark:text-marine-400">Max Correlation</div>
                                        <div className="text-3xl font-bold text-deep-900 dark:text-gray-100">{lagResult.maxCorrelation?.toFixed(3)}</div>
                                    </div>
                                    <div className="p-4 bg-coral-50 dark:bg-coral-900/20 rounded-xl text-center">
                                        <div className="text-sm text-coral-600 dark:text-coral-400">Mechanism</div>
                                        <div className="text-sm font-medium text-deep-900 dark:text-gray-100 mt-2">{lagResult.mechanism || 'Unknown'}</div>
                                    </div>
                                </div>

                                {/* Lag correlations chart */}
                                {lagResult.lagCorrelations?.length > 0 && (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={lagResult.lagCorrelations}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                                            <XAxis dataKey="lag" stroke={chartColors.text} label={{ value: 'Lag (months)', position: 'bottom' }} />
                                            <YAxis stroke={chartColors.text} domain={[-1, 1]} />
                                            <Tooltip contentStyle={{ backgroundColor: chartColors.tooltipBg, color: chartColors.tooltipText, border: 'none', borderRadius: '12px' }} />
                                            <Bar dataKey="correlation" fill="#0891b2" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}

                                <div className="p-4 bg-gray-50 dark:bg-deep-800 rounded-xl">
                                    <p className="text-deep-600 dark:text-gray-300">{lagResult.interpretation}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="h-60 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                                <Clock className="w-12 h-12 mb-4 text-ocean-300" />
                                <p>Click "Run Analysis" to find optimal lag</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'granger' && (
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle>Granger Causality Test</CardTitle>
                                <CardDescription>Test if past values of X help predict Y</CardDescription>
                            </div>
                            <Button variant="outline" onClick={runGrangerTest} disabled={grangerMutation.isPending}>
                                {grangerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Run Test'}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {grangerResult ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="p-4 bg-gray-50 dark:bg-deep-800 rounded-xl text-center">
                                        <div className="text-sm text-deep-500 dark:text-gray-400">Cause</div>
                                        <div className="text-lg font-bold text-deep-900 dark:text-gray-100">{grangerResult.cause}</div>
                                    </div>
                                    <div className="p-4 bg-gray-50 dark:bg-deep-800 rounded-xl text-center">
                                        <div className="text-sm text-deep-500 dark:text-gray-400">Effect</div>
                                        <div className="text-lg font-bold text-deep-900 dark:text-gray-100">{grangerResult.effect}</div>
                                    </div>
                                    <div className="p-4 bg-ocean-50 dark:bg-ocean-900/20 rounded-xl text-center">
                                        <div className="text-sm text-ocean-600 dark:text-ocean-400">F-statistic</div>
                                        <div className="text-2xl font-bold text-deep-900 dark:text-gray-100">{grangerResult.fStatistic?.toFixed(2)}</div>
                                    </div>
                                    <div className="p-4 bg-marine-50 dark:bg-marine-900/20 rounded-xl text-center">
                                        <div className="text-sm text-marine-600 dark:text-marine-400">p-value</div>
                                        <div className="text-2xl font-bold text-deep-900 dark:text-gray-100">{grangerResult.pValue?.toFixed(3)}</div>
                                    </div>
                                </div>

                                <div className={`p-6 rounded-xl border ${grangerResult.significant ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'}`}>
                                    <div className="flex items-start gap-4">
                                        {grangerResult.significant ? (
                                            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                                        ) : (
                                            <AlertTriangle className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
                                        )}
                                        <div>
                                            <h4 className="font-semibold text-deep-900 dark:text-gray-100 mb-2">
                                                {grangerResult.significant ? 'Granger Causality Confirmed' : 'No Granger Causality'}
                                            </h4>
                                            <p className="text-deep-600 dark:text-gray-400">{grangerResult.interpretation}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="h-60 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                                <Target className="w-12 h-12 mb-4 text-ocean-300" />
                                <p>Click "Run Test" to test Granger causality</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
