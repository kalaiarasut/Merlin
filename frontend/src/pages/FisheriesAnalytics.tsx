import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { Select, Input } from '@/components/ui/input';
import { useThemeStore } from '@/store/themeStore';
import { useFisheriesStore } from '@/store/fisheriesStore';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import {
    Anchor, TrendingUp, TrendingDown, Activity, BarChart2, RefreshCw,
    AlertTriangle, CheckCircle, Loader2, Fish, Calendar, MapPin, Info,
    Database, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// API service for fisheries
const fisheriesService = {
    getInfo: async () => {
        const res = await fetch(`${API_BASE}/api/fisheries/info`);
        return res.json();
    },
    calculateCPUE: async (data: any) => {
        const res = await fetch(`${API_BASE}/api/fisheries/cpue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },
    analyzeLengthFrequency: async (data: any) => {
        const res = await fetch(`${API_BASE}/api/fisheries/length-analysis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },
    assessStock: async (data: any) => {
        const res = await fetch(`${API_BASE}/api/fisheries/stock-assessment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },
    // NEW: Get uploaded datasets
    getDatasets: async () => {
        const res = await fetch(`${API_BASE}/api/fisheries/datasets`);
        return res.json();
    },
    // NEW: Analyze using uploaded data
    analyzeWithData: async (species: string, datasetId?: string) => {
        const res = await fetch(`${API_BASE}/api/fisheries/analyze-with-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ species, datasetId }),
        });
        return res.json();
    },
    // Spatial CPUE for heatmap
    getSpatialCpue: async (species?: string) => {
        const params = species ? `?species=${encodeURIComponent(species)}` : '';
        const res = await fetch(`${API_BASE}/api/fisheries/spatial-cpue${params}`);
        return res.json();
    },
    // Depth distribution
    getDepthDistribution: async (species?: string) => {
        const params = species ? `?species=${encodeURIComponent(species)}` : '';
        const res = await fetch(`${API_BASE}/api/fisheries/depth-distribution${params}`);
        return res.json();
    },
};

const CHART_COLORS = ['#0891b2', '#10b981', '#f97316', '#8b5cf6', '#ec4899'];

export default function FisheriesAnalytics() {
    const navigate = useNavigate();
    const { resolvedTheme } = useThemeStore();
    const isDark = resolvedTheme === 'dark';
    const [activeTab, setActiveTab] = useState<'overview' | 'cpue' | 'length' | 'stock'>('overview');
    const [useUploadedData, setUseUploadedData] = useState(true); // Default to uploaded data

    // Session store for persistence across tab switches - stores entire raw API response
    const { selectedSpecies, setSelectedSpecies, analysisData, setAnalysisData } = useFisheriesStore();

    // Use store species as input (synced)
    const speciesInput = selectedSpecies;
    const setSpeciesInput = setSelectedSpecies;

    // Chart colors based on theme
    const chartColors = {
        grid: isDark ? '#374151' : '#e5e7eb',
        text: isDark ? '#9ca3af' : '#64748b',
        tooltipBg: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        tooltipText: isDark ? '#f3f4f6' : '#1e293b',
    };

    // Fetch module info
    const { data: moduleInfo } = useQuery({
        queryKey: ['fisheries-info'],
        queryFn: fisheriesService.getInfo,
    });

    // CPUE calculation mutation
    const cpueMutation = useMutation({
        mutationFn: fisheriesService.calculateCPUE,
        onSuccess: (data) => {
            if (data.success) {
                toast.success('CPUE analysis completed');
            } else {
                toast.error(data.error || 'Analysis failed');
            }
        },
        onError: () => toast.error('Failed to connect to API'),
    });

    // Stock assessment mutation
    const stockMutation = useMutation({
        mutationFn: fisheriesService.assessStock,
        onSuccess: (data) => {
            if (data.success) {
                toast.success('Stock assessment completed');
            } else {
                toast.error(data.error || 'Assessment failed');
            }
        },
        onError: () => toast.error('Failed to connect to API'),
    });

    // NEW: Fetch uploaded datasets
    const { data: datasetsData } = useQuery({
        queryKey: ['fisheries-datasets'],
        queryFn: fisheriesService.getDatasets,
        refetchOnWindowFocus: false,
    });

    // NEW: Analyze with uploaded data mutation
    const analyzeWithDataMutation = useMutation({
        mutationFn: ({ species }: { species: string }) =>
            fisheriesService.analyzeWithData(species),
        onSuccess: (data) => {
            if (data.success) {
                toast.success(`Analysis complete using ${data.recordsUsed?.catch || 0} uploaded records`);
                // Save entire raw API response to session store
                setAnalysisData(data);
            } else {
                toast.error(data.error || 'No data found for this species');
            }
        },
        onError: () => toast.error('Failed to analyze data'),
    });

    // Depth distribution query (for uploaded data with depth info)
    const { data: depthDistData } = useQuery({
        queryKey: ['depth-distribution', speciesInput],
        queryFn: () => fisheriesService.getDepthDistribution(speciesInput),
        enabled: useUploadedData && speciesInput.length > 0,
        staleTime: 1000 * 60 * 5,
    });

    // Run CPUE analysis - uses uploaded data if available
    const runCPUEAnalysis = () => {
        if (!speciesInput.trim()) {
            toast.error('Please enter a species name first');
            return;
        }

        if (useUploadedData) {
            // Use uploaded data from database
            analyzeWithDataMutation.mutate({ species: speciesInput });
        } else {
            // Use sample data (for demo)
            cpueMutation.mutate({
                species: speciesInput,
                records: [
                    { date: '2024-01-15', catch: 1520, effort: 100, species: speciesInput },
                    { date: '2024-02-10', catch: 1680, effort: 100, species: speciesInput },
                    { date: '2024-03-20', catch: 1850, effort: 100, species: speciesInput },
                    { date: '2024-04-05', catch: 2210, effort: 100, species: speciesInput },
                    { date: '2024-05-12', catch: 2560, effort: 100, species: speciesInput },
                    { date: '2024-06-18', catch: 2340, effort: 100, species: speciesInput },
                ],
            });
        }
    };

    // Run stock assessment
    const runStockAssessment = () => {
        if (!speciesInput.trim()) {
            toast.error('Please enter a species name first');
            return;
        }

        if (useUploadedData && analyzeWithDataMutation.data?.stock) {
            // Already have stock data from analyzeWithData
            toast.success('Stock data available from uploaded records');
        } else {
            // Use sample data
            stockMutation.mutate({
                species: speciesInput,
                catchRecords: [
                    { date: '2024-01-15', catch: 500, species: speciesInput },
                    { date: '2024-02-10', catch: 800, species: speciesInput },
                    { date: '2024-03-20', catch: 600, species: speciesInput },
                    { date: '2024-04-05', catch: 350, species: speciesInput },
                    { date: '2024-05-12', catch: 150, species: speciesInput },
                ],
                lengthRecords: [
                    { length: 45, species: speciesInput },
                    { length: 52, species: speciesInput },
                    { length: 38, species: speciesInput },
                    { length: 60, species: speciesInput },
                ],
                options: { averageTemperature: 28.5 },
            });
        }
    };

    // Prepare chart data from API results
    // Use session store analysisData (persisted) when available, otherwise use mutation data
    const storedData = analysisData || analyzeWithDataMutation.data;

    // CPUE data
    const cpueData = useUploadedData && storedData?.cpue ? storedData.cpue : cpueMutation.data?.cpue;
    const cpueTimeSeries = useUploadedData && storedData?.timeSeries ? storedData.timeSeries : (cpueMutation.data?.timeSeries || []);
    const yearlyTimeSeries = useUploadedData && storedData?.yearlyTimeSeries ? storedData.yearlyTimeSeries : [];
    const dateRange = storedData?.dateRange;

    // Stock data - API returns 'stock' object containing stockStatus, mortality, etc.
    const stockData = storedData?.stock;
    const stockStatus = useUploadedData && stockData?.stockStatus
        ? stockData.stockStatus
        : stockMutation.data?.stockStatus;
    const mortality = useUploadedData && stockData?.mortality
        ? stockData.mortality
        : stockMutation.data?.mortality;
    const recruitment = useUploadedData && stockData?.recruitment
        ? stockData.recruitment
        : stockMutation.data?.recruitment;
    const fmRatio = stockData?.fmRatio ?? storedData?.fmRatio ?? null;
    const sustainabilityStatus = stockData?.sustainabilityStatus ?? storedData?.sustainabilityStatus ?? null;

    // Length frequency data
    const lengthData = storedData?.length;
    const lengthDistribution = useUploadedData && lengthData?.distribution ? lengthData.distribution : null;
    const cohorts = useUploadedData && lengthData?.cohorts ? lengthData.cohorts : null;
    const growthParams = useUploadedData && lengthData?.growthParams ? lengthData.growthParams : null;
    const lengthWeight = useUploadedData && lengthData?.lengthWeight ? lengthData.lengthWeight : null;
    const maturityOgive = useUploadedData && lengthData?.maturityOgive ? lengthData.maturityOgive : null;

    // Data source info for UI
    const localDataStats = datasetsData?.stats;
    const isAnalyzing = cpueMutation.isPending || stockMutation.isPending || analyzeWithDataMutation.isPending;

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Anchor className="w-5 h-5 text-ocean-500" />
                        <span className="text-sm font-medium text-ocean-600 dark:text-ocean-400">Fisheries Module</span>
                    </div>
                    <h1 className="text-3xl lg:text-4xl font-bold text-deep-900 dark:text-gray-100">
                        Stock & Abundance Analysis
                    </h1>
                    <p className="text-deep-500 dark:text-gray-400 mt-1">
                        CPUE calculations, length-frequency analysis, and stock assessments
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        onClick={runCPUEAnalysis}
                        disabled={cpueMutation.isPending}
                    >
                        {cpueMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                        Analyze CPUE
                    </Button>
                    <Button
                        variant="premium"
                        onClick={runStockAssessment}
                        disabled={stockMutation.isPending}
                    >
                        {stockMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Fish className="w-4 h-4 mr-2" />}
                        Assess Stock
                    </Button>
                </div>
            </div>

            {/* Species Input */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex gap-4 items-start flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-sm font-medium text-deep-700 dark:text-gray-300 mb-2">
                                Target Species
                            </label>
                            <Input
                                value={speciesInput}
                                onChange={(e) => setSpeciesInput(e.target.value)}
                                placeholder="e.g., Thunnus albacares, Sardina pilchardus"
                            />
                        </div>

                        {/* Data Stats or Upload Prompt */}
                        <div className={cn(
                            "flex-1 min-w-[280px] p-3 rounded-lg border",
                            useUploadedData && localDataStats?.totalCatchRecords > 0
                                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                                : useUploadedData
                                    ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                                    : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                        )}>
                            {useUploadedData ? (
                                localDataStats?.totalCatchRecords > 0 ? (
                                    <div className="flex items-start gap-2">
                                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                                        <div className="text-sm text-green-700 dark:text-green-300">
                                            <p className="font-medium">Real Data Available</p>
                                            <p className="text-xs">{localDataStats.totalCatchRecords} catch records • {localDataStats.totalLengthRecords} length records • {localDataStats.species?.length || 0} species</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                                        <div className="text-sm text-yellow-700 dark:text-yellow-300">
                                            <p className="font-medium">No Data Uploaded</p>
                                            <p className="text-xs">Go to <a href="/ingestion" className="underline font-medium">Data Ingestion</a> and upload "Fisheries Catch Data" CSV</p>
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div className="flex items-start gap-2">
                                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                    <div className="text-sm text-blue-700 dark:text-blue-300">
                                        <p className="font-medium">Demo Mode</p>
                                        <p className="text-xs">Using simulated sample data for demonstration</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tabs */}
            <div className="flex gap-2 flex-wrap">
                {['overview', 'cpue', 'length', 'stock'].map(tab => (
                    <Button
                        key={tab}
                        variant={activeTab === tab ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setActiveTab(tab as any)}
                        className="capitalize"
                    >
                        {tab === 'cpue' ? 'CPUE Analysis' : tab}
                    </Button>
                ))}
            </div>

            {/* Data Source Label Banner */}
            {useUploadedData && dateRange && (
                <div className="flex items-center gap-2 text-sm bg-ocean-50 dark:bg-ocean-900/20 border border-ocean-200 dark:border-ocean-800 rounded-lg px-4 py-2">
                    <Database className="w-4 h-4 text-ocean-600 dark:text-ocean-400" />
                    <span className="text-ocean-700 dark:text-ocean-300">
                        Based on uploaded survey data ({dateRange?.startYear || '—'}–{dateRange?.endYear || '—'})
                    </span>
                    <Badge variant="outline" className="ml-auto">
                        {analyzeWithDataMutation.data?.recordsUsed?.catch?.toLocaleString() || 0} catch records
                    </Badge>
                </div>
            )}

            {activeTab === 'overview' && (
                <>
                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            title="Average CPUE"
                            value={cpueData?.cpue?.toFixed(1) || '—'}
                            change={cpueData ? (cpueData.trend === 'increasing' ? 8.5 : cpueData.trend === 'decreasing' ? -5.2 : 0) : undefined}
                            changeLabel="kg/hour"
                            icon={<BarChart2 className="w-5 h-5" />}
                            iconColor="ocean"
                        />
                        <StatCard
                            title="Total Catch"
                            value={cpueData?.totalCatch?.toLocaleString() || '—'}
                            change={cpueData?.totalCatch ? undefined : undefined}
                            changeLabel="this period"
                            icon={<Fish className="w-5 h-5" />}
                            iconColor="marine"
                        />
                        <StatCard
                            title="Fishing Effort"
                            value={cpueData?.totalEffort?.toLocaleString() || '—'}
                            change={cpueData?.totalEffort ? undefined : undefined}
                            changeLabel="tows"
                            icon={<Calendar className="w-5 h-5" />}
                            iconColor="coral"
                        />
                        <StatCard
                            title="Sustainability"
                            value={stockStatus?.sustainabilityScore?.toFixed(0) || '—'}
                            change={stockStatus?.sustainabilityScore ? (stockStatus.sustainabilityScore >= 70 ? 5 : stockStatus.sustainabilityScore < 40 ? -15 : -5) : undefined}
                            changeLabel="score"
                            icon={stockStatus?.sustainabilityScore >= 70 ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                            iconColor={stockStatus?.sustainabilityScore >= 70 ? 'marine' : 'coral'}
                        />
                    </div>

                    {/* Results Display */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* CPUE Results */}
                        <Card>
                            <CardHeader>
                                <CardTitle>CPUE Analysis Results</CardTitle>
                                <CardDescription>Latest catch per unit effort calculations</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {cpueMutation.isPending ? (
                                    <div className="h-60 flex items-center justify-center">
                                        <Loader2 className="w-8 h-8 animate-spin text-ocean-500" />
                                    </div>
                                ) : cpueData ? (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-ocean-50 dark:bg-ocean-900/20 rounded-xl">
                                                <div className="text-sm text-ocean-600 dark:text-ocean-400">CPUE</div>
                                                <div className="text-2xl font-bold text-deep-900 dark:text-gray-100">
                                                    {cpueData.cpue?.toFixed(2)} kg/hr
                                                </div>
                                            </div>
                                            <div className="p-4 bg-marine-50 dark:bg-marine-900/20 rounded-xl">
                                                <div className="text-sm text-marine-600 dark:text-marine-400">Trend</div>
                                                <div className="text-2xl font-bold text-deep-900 dark:text-gray-100 flex items-center gap-2">
                                                    {cpueData.trend === 'increasing' ? (
                                                        <><TrendingUp className="text-green-500" /> Increasing</>
                                                    ) : cpueData.trend === 'decreasing' ? (
                                                        <><TrendingDown className="text-red-500" /> Decreasing</>
                                                    ) : (
                                                        <><Activity className="text-blue-500" /> Stable</>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        {cpueData.confidence95 && (
                                            <div className="p-3 bg-gray-50 dark:bg-deep-800 rounded-lg">
                                                <span className="text-sm text-deep-600 dark:text-gray-300">
                                                    95% CI: {cpueData.confidence95.lower?.toFixed(2)} - {cpueData.confidence95.upper?.toFixed(2)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="h-60 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                                        <Fish className="w-12 h-12 mb-4 text-ocean-300" />
                                        <p>Click "Analyze CPUE" to run analysis</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Stock Assessment */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Stock Assessment</CardTitle>
                                <CardDescription>Mortality and sustainability analysis</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {stockMutation.isPending ? (
                                    <div className="h-60 flex items-center justify-center">
                                        <Loader2 className="w-8 h-8 animate-spin text-ocean-500" />
                                    </div>
                                ) : stockStatus ? (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-gray-50 dark:bg-deep-800 rounded-xl">
                                                <div className="text-sm text-deep-500 dark:text-gray-400">Biomass Status</div>
                                                <div className="text-lg font-bold text-deep-900 dark:text-gray-100">{stockStatus.biomassStatus}</div>
                                            </div>
                                            <div className="p-4 bg-gray-50 dark:bg-deep-800 rounded-xl">
                                                <div className="text-sm text-deep-500 dark:text-gray-400">Exploitation</div>
                                                <div className="text-lg font-bold text-deep-900 dark:text-gray-100">{stockStatus.exploitationLevel}</div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between mb-2">
                                                <span className="text-sm text-deep-600 dark:text-gray-300">Sustainability Score</span>
                                                <span className="text-sm font-medium text-deep-900 dark:text-gray-100">{stockStatus.sustainabilityScore}%</span>
                                            </div>
                                            <Progress value={stockStatus.sustainabilityScore} variant="gradient" />
                                        </div>
                                        {stockStatus.recommendations?.length > 0 && (
                                            <div className="space-y-2">
                                                <div className="text-sm font-medium text-deep-700 dark:text-gray-300">Recommendations:</div>
                                                {stockStatus.recommendations.slice(0, 3).map((rec: string, i: number) => (
                                                    <div key={i} className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-sm">
                                                        <Info className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                                                        <span className="text-yellow-800 dark:text-yellow-200">{rec}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="h-60 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                                        <BarChart2 className="w-12 h-12 mb-4 text-ocean-300" />
                                        <p>Click "Assess Stock" to run assessment</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}

            {activeTab === 'cpue' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Yearly CPUE Bar Chart */}
                    <Card>
                        <CardHeader>
                            <CardTitle>CPUE by Year</CardTitle>
                            <CardDescription>Annual catch per unit effort trend</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {yearlyTimeSeries.length > 0 ? (
                                <ResponsiveContainer width="100%" height={350}>
                                    <BarChart data={yearlyTimeSeries}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                                        <XAxis dataKey="year" stroke={chartColors.text} />
                                        <YAxis stroke={chartColors.text} label={{ value: 'CPUE (kg/tow)', angle: -90, position: 'insideLeft', fill: chartColors.text }} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: chartColors.tooltipBg, color: chartColors.tooltipText, border: 'none', borderRadius: '12px' }}
                                            formatter={(value: any, name: string) => {
                                                if (name === 'cpue') return [`${value} kg/tow`, 'CPUE'];
                                                if (name === 'catch') return [`${value} kg`, 'Total Catch'];
                                                if (name === 'effort') return [`${value} tows`, 'Effort'];
                                                return [value, name];
                                            }}
                                        />
                                        <Bar dataKey="cpue" fill="#0891b2" name="cpue" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-80 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                                    <BarChart2 className="w-12 h-12 mb-4 text-ocean-300" />
                                    <p>Run CPUE analysis to see yearly trend</p>
                                    <Button variant="outline" className="mt-4" onClick={runCPUEAnalysis}>
                                        Analyze CPUE
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Monthly CPUE Line Chart */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Monthly Time Series</CardTitle>
                            <CardDescription>Catch per unit effort by month</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {cpueTimeSeries.length > 0 ? (
                                <ResponsiveContainer width="100%" height={350}>
                                    <LineChart data={cpueTimeSeries}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                                        <XAxis dataKey="period" stroke={chartColors.text} />
                                        <YAxis stroke={chartColors.text} />
                                        <Tooltip contentStyle={{ backgroundColor: chartColors.tooltipBg, color: chartColors.tooltipText, border: 'none', borderRadius: '12px' }} />
                                        <Line type="monotone" dataKey="cpue" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} name="CPUE" />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-80 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                                    <Activity className="w-12 h-12 mb-4 text-ocean-300" />
                                    <p>Monthly time series will appear after analysis</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {activeTab === 'length' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Length Distribution Chart */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Length-Frequency Distribution</CardTitle>
                            <CardDescription>Size distribution analysis for population assessment</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {lengthDistribution?.bins?.length > 0 ? (
                                <ResponsiveContainer width="100%" height={350}>
                                    <BarChart data={lengthDistribution.bins}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                                        <XAxis dataKey="lengthClass" stroke={chartColors.text} label={{ value: 'Length (cm)', position: 'bottom', fill: chartColors.text }} />
                                        <YAxis stroke={chartColors.text} label={{ value: 'Frequency', angle: -90, position: 'insideLeft', fill: chartColors.text }} />
                                        <Tooltip contentStyle={{ backgroundColor: chartColors.tooltipBg, color: chartColors.tooltipText, border: 'none', borderRadius: '12px' }} />
                                        <Bar dataKey="count" fill="#0891b2" name="Count" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-80 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                                    <BarChart2 className="w-12 h-12 mb-4 text-ocean-300" />
                                    <p>Run CPUE analysis to generate length distribution</p>
                                    <Button variant="outline" className="mt-4" onClick={runCPUEAnalysis}>
                                        Analyze Data
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Length Statistics */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Distribution Statistics</CardTitle>
                            <CardDescription>Key metrics from length frequency analysis</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {lengthDistribution ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-ocean-50 dark:bg-ocean-900/20 rounded-xl p-4">
                                            <p className="text-xs text-deep-500 dark:text-gray-400">Sample Size</p>
                                            <p className="text-2xl font-bold text-deep-900 dark:text-white">{lengthDistribution.sampleSize?.toLocaleString()}</p>
                                        </div>
                                        <div className="bg-marine-50 dark:bg-marine-900/20 rounded-xl p-4">
                                            <p className="text-xs text-deep-500 dark:text-gray-400">Mean Length</p>
                                            <p className="text-2xl font-bold text-deep-900 dark:text-white">{lengthDistribution.meanLength?.toFixed(1)} cm</p>
                                        </div>
                                        <div className="bg-coral-50 dark:bg-coral-900/20 rounded-xl p-4">
                                            <p className="text-xs text-deep-500 dark:text-gray-400">Min Length</p>
                                            <p className="text-2xl font-bold text-deep-900 dark:text-white">{lengthDistribution.minLength?.toFixed(1)} cm</p>
                                        </div>
                                        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4">
                                            <p className="text-xs text-deep-500 dark:text-gray-400">Max Length</p>
                                            <p className="text-2xl font-bold text-deep-900 dark:text-white">{lengthDistribution.maxLength?.toFixed(1)} cm</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                        <div className="flex justify-between text-sm mb-2">
                                            <span className="text-deep-500 dark:text-gray-400">Mode</span>
                                            <span className="font-medium text-deep-900 dark:text-white">{lengthDistribution.mode?.toFixed(1)} cm</span>
                                        </div>
                                        <div className="flex justify-between text-sm mb-2">
                                            <span className="text-deep-500 dark:text-gray-400">Median</span>
                                            <span className="font-medium text-deep-900 dark:text-white">{lengthDistribution.medianLength?.toFixed(1)} cm</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-deep-500 dark:text-gray-400">Std Deviation</span>
                                            <span className="font-medium text-deep-900 dark:text-white">{lengthDistribution.standardDeviation?.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    {growthParams && (
                                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                            <h4 className="font-medium text-deep-900 dark:text-white mb-2">Von Bertalanffy Growth</h4>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-deep-500 dark:text-gray-400">L∞ (asymptotic)</span>
                                                <span className="font-medium text-deep-900 dark:text-white">{growthParams.Linf?.toFixed(1)} cm</span>
                                            </div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-deep-500 dark:text-gray-400">K (growth rate)</span>
                                                <span className="font-medium text-deep-900 dark:text-white">{growthParams.K?.toFixed(3)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-deep-500 dark:text-gray-400">R² (fit)</span>
                                                <span className="font-medium text-deep-900 dark:text-white">{growthParams.r2?.toFixed(3)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="h-60 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                                    <Activity className="w-10 h-10 mb-3 text-ocean-300" />
                                    <p className="text-sm">Upload length data and run analysis</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Maturity Ogive */}
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle>Maturity Ogive</CardTitle>
                            <CardDescription>Percentage mature by length class (S-curve)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {maturityOgive && maturityOgive.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={maturityOgive}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                                        <XAxis
                                            dataKey="lengthClass"
                                            stroke={chartColors.text}
                                            label={{ value: 'Length (cm)', position: 'bottom', fill: chartColors.text }}
                                        />
                                        <YAxis
                                            stroke={chartColors.text}
                                            domain={[0, 100]}
                                            label={{ value: '% Mature', angle: -90, position: 'insideLeft', fill: chartColors.text }}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: chartColors.tooltipBg, color: chartColors.tooltipText, border: 'none', borderRadius: '12px' }}
                                            formatter={(value: any, name: string) => {
                                                if (name === 'percentMature') return [`${value}%`, 'Mature'];
                                                return [value, name];
                                            }}
                                        />
                                        {/* Reference line at 50% */}
                                        <Line
                                            type="monotone"
                                            dataKey="percentMature"
                                            stroke="#8b5cf6"
                                            strokeWidth={3}
                                            dot={{ fill: '#8b5cf6' }}
                                            name="percentMature"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-60 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                                    <TrendingUp className="w-10 h-10 mb-3 text-purple-300" />
                                    <p className="text-sm">Maturity data requires records with maturity field</p>
                                    <p className="text-xs text-deep-400 dark:text-gray-500 mt-1">Values: immature, maturing, mature, spawning, spent</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Depth Distribution - Species distribution by depth */}
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-blue-500" />
                                Depth Distribution
                            </CardTitle>
                            <CardDescription>
                                Species catch distribution by depth range (25m bins)
                                {depthDistData?.summary?.peakDepth && (
                                    <span className="ml-2 text-blue-600 dark:text-blue-400 font-medium">
                                        • Peak: {depthDistData.summary.peakDepth.depthRange}
                                    </span>
                                )}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {depthDistData?.data && depthDistData.data.length > 0 ? (
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart data={depthDistData.data} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                                        <XAxis
                                            type="number"
                                            stroke={chartColors.text}
                                            label={{ value: 'Total Catch (kg)', position: 'bottom', fill: chartColors.text }}
                                        />
                                        <YAxis
                                            dataKey="depthRange"
                                            type="category"
                                            stroke={chartColors.text}
                                            width={80}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: chartColors.tooltipBg, color: chartColors.tooltipText, border: 'none', borderRadius: '12px' }}
                                            formatter={(value: any, name: string) => {
                                                if (name === 'totalCatch') return [`${value} kg`, 'Total Catch'];
                                                if (name === 'sampleCount') return [value, 'Samples'];
                                                return [value, name];
                                            }}
                                        />
                                        <Bar
                                            dataKey="totalCatch"
                                            fill="#3b82f6"
                                            radius={[0, 4, 4, 0]}
                                            name="totalCatch"
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-60 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                                    <MapPin className="w-10 h-10 mb-3 text-blue-300" />
                                    <p className="text-sm">Depth distribution requires data with depth field</p>
                                    <p className="text-xs text-deep-400 dark:text-gray-500 mt-1">Re-run NOAA transform with enhanced columns</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {activeTab === 'stock' && (
                <div className="space-y-6">
                    {/* Sustainability Status Banner */}
                    {(stockStatus || stockMutation.data?.stockStatus) && (
                        <div className={cn(
                            "flex items-center justify-between p-4 rounded-xl border",
                            sustainabilityStatus === 'sustainable' && "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
                            sustainabilityStatus === 'fully_exploited' && "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
                            sustainabilityStatus === 'overfished' && "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
                            !sustainabilityStatus && "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        )}>
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-4 h-4 rounded-full",
                                    sustainabilityStatus === 'sustainable' && "bg-green-500",
                                    sustainabilityStatus === 'fully_exploited' && "bg-yellow-500",
                                    sustainabilityStatus === 'overfished' && "bg-red-500",
                                    !sustainabilityStatus && "bg-gray-400"
                                )} />
                                <div>
                                    <p className={cn(
                                        "font-semibold",
                                        sustainabilityStatus === 'sustainable' && "text-green-800 dark:text-green-200",
                                        sustainabilityStatus === 'fully_exploited' && "text-yellow-800 dark:text-yellow-200",
                                        sustainabilityStatus === 'overfished' && "text-red-800 dark:text-red-200",
                                        !sustainabilityStatus && "text-gray-700 dark:text-gray-300"
                                    )}>
                                        {sustainabilityStatus === 'sustainable' && '🟢 Sustainable'}
                                        {sustainabilityStatus === 'fully_exploited' && '🟡 Fully Exploited'}
                                        {sustainabilityStatus === 'overfished' && '🔴 Overfished'}
                                        {!sustainabilityStatus && 'Stock Status Unknown'}
                                    </p>
                                    <p className="text-sm text-deep-600 dark:text-gray-400">
                                        Score: {stockStatus?.sustainabilityScore?.toFixed(0) || '—'}/100
                                    </p>
                                </div>
                            </div>
                            {fmRatio !== null && (
                                <div className="text-right">
                                    <p className="text-sm text-deep-500 dark:text-gray-400">F/M Ratio</p>
                                    <p className={cn(
                                        "text-2xl font-bold",
                                        fmRatio < 1 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                                    )}>
                                        {fmRatio.toFixed(2)}
                                    </p>
                                    <p className="text-xs text-deep-500 dark:text-gray-400">
                                        {fmRatio < 1 ? 'Below optimal' : 'Above optimal'}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Detailed Stock Assessment</CardTitle>
                                    <CardDescription>Comprehensive mortality and recruitment analysis</CardDescription>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => navigate('/oceanography', {
                                        state: {
                                            parameter: 'fisheries_cpue',
                                            center: [43.0, -68.0],
                                            zoom: 6,
                                            mode: 'database'
                                        }
                                    })}
                                >
                                    <Fish className="w-4 h-4 mr-2 text-blue-500" />
                                    Analyze Spatial CPUE
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {(mortality || stockMutation.data?.success) ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {/* Mortality */}
                                    <div className="p-6 bg-gray-50 dark:bg-deep-800 rounded-xl">
                                        <h3 className="text-lg font-semibold text-deep-900 dark:text-gray-100 mb-4">Mortality Rates</h3>
                                        <div className="space-y-3">
                                            <div className="flex justify-between">
                                                <span className="text-deep-600 dark:text-gray-400">Total (Z)</span>
                                                <span className="font-mono text-deep-900 dark:text-gray-100">{mortality?.totalMortality?.toFixed(3) || '—'}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-deep-600 dark:text-gray-400">Natural (M)</span>
                                                <span className="font-mono text-deep-900 dark:text-gray-100">{mortality?.naturalMortality?.toFixed(3) || mortality?.naturalMortalityEstimates?.pauly?.toFixed(3) || '—'}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-deep-600 dark:text-gray-400">Fishing (F)</span>
                                                <span className="font-mono text-deep-900 dark:text-gray-100">{mortality?.fishingMortality?.toFixed(3) || '—'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Exploitation */}
                                    <div className="p-6 bg-gray-50 dark:bg-deep-800 rounded-xl">
                                        <h3 className="text-lg font-semibold text-deep-900 dark:text-gray-100 mb-4">Exploitation</h3>
                                        <div className="space-y-3">
                                            <div className="flex justify-between">
                                                <span className="text-deep-600 dark:text-gray-400">Rate (E)</span>
                                                <span className="font-mono text-deep-900 dark:text-gray-100">{mortality?.exploitationRate?.toFixed(3) || '—'}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-deep-600 dark:text-gray-400">Optimal</span>
                                                <span className="font-mono text-deep-900 dark:text-gray-100">0.50</span>
                                            </div>
                                            <div className="mt-3">
                                                {mortality?.exploitationRate !== undefined && mortality?.exploitationRate !== null && mortality?.exploitationRate > 0 ? (
                                                    <Badge variant={mortality.exploitationRate < 0.5 ? 'success' : 'warning'}>
                                                        {mortality.exploitationRate < 0.5 ? 'Sustainable' : 'Overfished'}
                                                    </Badge>
                                                ) : sustainabilityStatus ? (
                                                    <Badge variant={sustainabilityStatus === 'sustainable' ? 'success' : sustainabilityStatus === 'overfished' ? 'destructive' : 'warning'}>
                                                        {sustainabilityStatus === 'sustainable' ? 'Sustainable' : sustainabilityStatus === 'overfished' ? 'Overfished' : 'Fully Exploited'}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline">Unknown</Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Recruitment */}
                                    <div className="p-6 bg-gray-50 dark:bg-deep-800 rounded-xl">
                                        <h3 className="text-lg font-semibold text-deep-900 dark:text-gray-100 mb-4">Recruitment</h3>
                                        {recruitment ? (
                                            <div className="space-y-3">
                                                <div className="flex justify-between">
                                                    <span className="text-deep-600 dark:text-gray-400">Pattern</span>
                                                    <span className="font-mono text-deep-900 dark:text-gray-100">{recruitment.pattern}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-deep-600 dark:text-gray-400">Index</span>
                                                    <span className="font-mono text-deep-900 dark:text-gray-100">{(recruitment.index * 100).toFixed(1)}%</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-deep-500 dark:text-gray-400 text-sm">No recruitment data</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-60 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                                    <Fish className="w-12 h-12 mb-4 text-ocean-300" />
                                    <p>Run stock assessment to see detailed analysis</p>
                                    <Button variant="outline" className="mt-4" onClick={runStockAssessment}>
                                        Assess Stock
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
