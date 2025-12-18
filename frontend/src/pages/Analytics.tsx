import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { Select } from '@/components/ui/input';
import { analyticsService, speciesService, ednaService, otolithService, correlationService } from '@/services/api';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import {
  TrendingUp, BarChart3, Database,
  Download, Play, Zap, ArrowUpRight,
  Fish, Dna, Sparkles, Loader2, AlertCircle
} from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';

const CHART_COLORS = ['#0891b2', '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function Analytics() {
  const [timeRange, setTimeRange] = useState('12m');
  const { resolvedTheme } = useThemeStore();
  const isDark = resolvedTheme === 'dark';

  // Fetch real data from APIs
  const { data: stats } = useQuery({
    queryKey: ['analytics-stats'],
    queryFn: () => analyticsService.getStats(),
  });

  const { data: speciesData } = useQuery({
    queryKey: ['species-list'],
    queryFn: () => speciesService.getAll({ limit: 1000 }),
  });

  const { data: phylumData, isLoading: phylumLoading } = useQuery({
    queryKey: ['species-by-phylum'],
    queryFn: () => analyticsService.getSpeciesByPhylum(),
  });

  const { data: growthData, isLoading: growthLoading } = useQuery({
    queryKey: ['analytics-growth', timeRange],
    queryFn: () => analyticsService.getGrowth(timeRange === '12m' ? 12 : timeRange === '3m' ? 3 : 6),
  });

  const { data: ednaStats } = useQuery({
    queryKey: ['edna-stats'],
    queryFn: () => ednaService.getStats(),
  });

  const { data: otolithStats } = useQuery({
    queryKey: ['otolith-stats'],
    queryFn: () => otolithService.getStats(),
  });

  // Fetch cross-domain correlation data
  const { data: correlationData, isLoading: correlationLoading } = useQuery({
    queryKey: ['correlation-summary'],
    queryFn: () => correlationService.summary(),
  });

  const { data: speciesEnvCorr } = useQuery({
    queryKey: ['species-environment-correlation'],
    queryFn: () => correlationService.speciesEnvironment({}),
  });

  // Calculate real stats
  const totalSpecies = (speciesData as any)?.pagination?.total || stats?.totalSpecies || 0;
  const totalEdna = ednaStats?.totalSamples || 0;
  const totalOtoliths = otolithStats?.total || 0;
  const totalObservations = totalSpecies + totalEdna + totalOtoliths;

  // Transform phylum data for pie chart
  const habitatDistribution = (phylumData || []).map((item: any, index: number) => ({
    name: item._id || 'Unknown',
    value: item.count,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  // Transform growth data for area chart
  const trendData = (growthData || []).map((item: any) => ({
    month: item.month,
    species: item.speciesCount || 0,
    edna: item.ednaCount || 0,
    otoliths: item.otolithCount || 0,
  }));

  // Data coverage metrics
  const radarData = [
    { metric: 'Biodiversity', value: Math.min(100, (totalSpecies / 50) * 100) },
    { metric: 'eDNA Coverage', value: Math.min(100, (totalEdna / 100) * 100) },
    { metric: 'Data Quality', value: 95 },
    { metric: 'Analysis', value: Math.min(100, (totalOtoliths / 50) * 100) },
    { metric: 'Integration', value: 85 },
    { metric: 'Completeness', value: 78 },
  ];

  // Chart styling based on theme
  const chartColors = {
    grid: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#9ca3af' : '#64748b',
    tooltipBg: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    tooltipText: isDark ? '#f3f4f6' : '#1e293b',
  };

  const handleExport = async () => {
    try {
      await analyticsService.export('csv', 'all');
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-5 h-5 text-ocean-500" />
            <span className="text-sm font-medium text-ocean-600 dark:text-ocean-400">Intelligence Hub</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-deep-900 dark:text-gray-100">Cross-Domain Analytics</h1>
          <p className="text-deep-500 dark:text-gray-400 mt-1">
            Real-time correlation analysis and insights across marine datasets
          </p>
        </div>
        <div className="flex gap-3">
          <Select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="w-40"
          >
            <option value="3m">Last 3 months</option>
            <option value="6m">Last 6 months</option>
            <option value="12m">Last 12 months</option>
          </Select>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button variant="premium">
            <Play className="w-4 h-4 mr-2" />
            Analyze
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Observations"
          value={totalObservations.toLocaleString()}
          change={12.5}
          changeLabel="vs last period"
          icon={<Database className="w-5 h-5" />}
          iconColor="ocean"
        />
        <StatCard
          title="Species Identified"
          value={totalSpecies.toLocaleString()}
          change={8.3}
          changeLabel="in database"
          icon={<Fish className="w-5 h-5" />}
          iconColor="marine"
        />
        <StatCard
          title="eDNA Samples"
          value={totalEdna.toLocaleString()}
          change={24.7}
          changeLabel="processed"
          icon={<Dna className="w-5 h-5" />}
          iconColor="coral"
        />
        <StatCard
          title="Otolith Records"
          value={totalOtoliths.toLocaleString()}
          change={15.2}
          changeLabel="analyzed"
          icon={<Sparkles className="w-5 h-5" />}
          iconColor="abyss"
        />
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Data Growth Trend Chart */}
        <Card variant="default" className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Data Growth Trends</CardTitle>
                <CardDescription>Species, eDNA, and Otolith records over time</CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary" className="gap-1">
                  <span className="w-2 h-2 rounded-full bg-ocean-500" />
                  Species
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <span className="w-2 h-2 rounded-full bg-marine-500" />
                  eDNA
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {growthLoading ? (
              <div className="h-80 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-ocean-500" />
              </div>
            ) : trendData.length === 0 ? (
              <div className="h-80 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                <AlertCircle className="w-12 h-12 mb-4 text-ocean-300" />
                <p>No trend data available</p>
                <p className="text-sm">Data will appear as records are added</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="speciesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0891b2" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0891b2" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ednaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis dataKey="month" stroke={chartColors.text} fontSize={12} />
                  <YAxis stroke={chartColors.text} fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chartColors.tooltipBg,
                      color: chartColors.tooltipText,
                      border: 'none',
                      borderRadius: '12px',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                    }}
                  />
                  <Area type="monotone" dataKey="species" name="Species" stroke="#0891b2" strokeWidth={2} fill="url(#speciesGradient)" />
                  <Area type="monotone" dataKey="edna" name="eDNA" stroke="#10b981" strokeWidth={2} fill="url(#ednaGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Phylum Distribution Pie */}
        <Card variant="default">
          <CardHeader>
            <CardTitle>Species by Phylum</CardTitle>
            <CardDescription>Distribution of species across phyla</CardDescription>
          </CardHeader>
          <CardContent>
            {phylumLoading ? (
              <div className="h-60 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-ocean-500" />
              </div>
            ) : habitatDistribution.length === 0 ? (
              <div className="h-60 flex flex-col items-center justify-center text-deep-500 dark:text-gray-400">
                <AlertCircle className="w-12 h-12 mb-4 text-ocean-300" />
                <p>No data available</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={habitatDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {habitatDistribution.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: chartColors.tooltipBg,
                        color: chartColors.tooltipText,
                        border: 'none',
                        borderRadius: '12px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {habitatDistribution.slice(0, 6).map((item: any) => (
                    <div key={item.name} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-deep-600 dark:text-gray-300 truncate">{item.name}</span>
                      <span className="text-deep-400 dark:text-gray-500 ml-auto">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Second Row Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Coverage Radar */}
        <Card variant="default">
          <CardHeader>
            <CardTitle>Data Coverage Index</CardTitle>
            <CardDescription>Multi-dimensional data completeness assessment</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={chartColors.grid} />
                <PolarAngleAxis dataKey="metric" stroke={chartColors.text} fontSize={11} />
                <PolarRadiusAxis stroke={chartColors.text} fontSize={10} domain={[0, 100]} />
                <Radar
                  name="Coverage"
                  dataKey="value"
                  stroke="#0891b2"
                  fill="#0891b2"
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    color: chartColors.tooltipText,
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Data Breakdown Bar Chart */}
        <Card variant="default">
          <CardHeader>
            <CardTitle>Data Breakdown</CardTitle>
            <CardDescription>Records by category</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={[
                { name: 'Species', value: totalSpecies, fill: '#0891b2' },
                { name: 'eDNA Samples', value: totalEdna, fill: '#10b981' },
                { name: 'Otolith Records', value: totalOtoliths, fill: '#f97316' },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="name" stroke={chartColors.text} fontSize={12} />
                <YAxis stroke={chartColors.text} fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    color: chartColors.tooltipText,
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                  }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  <Cell fill="#0891b2" />
                  <Cell fill="#10b981" />
                  <Cell fill="#f97316" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Data Summary */}
      <Card variant="premium">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Data Summary</CardTitle>
              <CardDescription>Overview of all marine data collections</CardDescription>
            </div>
            <Badge variant="premium">
              <TrendingUp className="w-3 h-3 mr-1" />
              Growing database
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: 'Species Records', value: totalSpecies, total: 5000, color: 'ocean' },
              { name: 'eDNA Samples', value: totalEdna, total: 500, color: 'marine' },
              { name: 'Otolith Images', value: totalOtoliths, total: 200, color: 'coral' },
              { name: 'Total Records', value: totalObservations, total: 5700, color: 'abyss' },
            ].map((item) => (
              <div key={item.name} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-deep-600 dark:text-gray-300">{item.name}</span>
                  <Badge variant="success" className="text-xs">
                    <ArrowUpRight className="w-3 h-3 mr-0.5" />
                    {Math.round((item.value / item.total) * 100)}%
                  </Badge>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-bold text-deep-900 dark:text-gray-100">{item.value.toLocaleString()}</span>
                  <span className="text-sm text-deep-400 dark:text-gray-500 mb-1">/ {item.total.toLocaleString()}</span>
                </div>
                <Progress
                  value={Math.min(100, (item.value / item.total) * 100)}
                  variant="gradient"
                  size="sm"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cross-Domain Correlation Insights */}
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-ocean-500" />
                AI-Generated Insights
              </CardTitle>
              <CardDescription>Cross-domain correlation analysis powered by AI</CardDescription>
            </div>
            <Badge variant="premium">
              <Zap className="w-3 h-3 mr-1" />
              Live Analysis
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {correlationLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-ocean-500" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* AI Enhanced Records */}
              <div className="p-4 bg-gradient-to-br from-ocean-50 to-ocean-100 dark:from-ocean-900/20 dark:to-ocean-800/20 rounded-xl border border-ocean-200 dark:border-ocean-800">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-ocean-600 dark:text-ocean-400" />
                  <span className="text-sm font-medium text-ocean-700 dark:text-ocean-300">AI Enhanced</span>
                </div>
                <div className="text-2xl font-bold text-ocean-900 dark:text-ocean-100">
                  {correlationData?.species?.aiEnhanced || 0}
                </div>
                <p className="text-xs text-ocean-600 dark:text-ocean-400 mt-1">
                  Records with AI metadata
                </p>
              </div>

              {/* Species Families */}
              <div className="p-4 bg-gradient-to-br from-marine-50 to-marine-100 dark:from-marine-900/20 dark:to-marine-800/20 rounded-xl border border-marine-200 dark:border-marine-800">
                <div className="flex items-center gap-2 mb-2">
                  <Fish className="w-4 h-4 text-marine-600 dark:text-marine-400" />
                  <span className="text-sm font-medium text-marine-700 dark:text-marine-300">Families</span>
                </div>
                <div className="text-2xl font-bold text-marine-900 dark:text-marine-100">
                  {correlationData?.species?.families || speciesEnvCorr?.species?.families?.length || 0}
                </div>
                <p className="text-xs text-marine-600 dark:text-marine-400 mt-1">
                  Unique taxonomic families
                </p>
              </div>

              {/* Environmental Parameters */}
              <div className="p-4 bg-gradient-to-br from-coral-50 to-coral-100 dark:from-coral-900/20 dark:to-coral-800/20 rounded-xl border border-coral-200 dark:border-coral-800">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="w-4 h-4 text-coral-600 dark:text-coral-400" />
                  <span className="text-sm font-medium text-coral-700 dark:text-coral-300">Parameters</span>
                </div>
                <div className="text-2xl font-bold text-coral-900 dark:text-coral-100">
                  {correlationData?.oceanography?.unique_parameters || speciesEnvCorr?.environment?.summary?.parametersAnalyzed || 0}
                </div>
                <p className="text-xs text-coral-600 dark:text-coral-400 mt-1">
                  Environmental variables tracked
                </p>
              </div>
            </div>
          )}

          {/* Insights List */}
          {speciesEnvCorr?.insights && speciesEnvCorr.insights.length > 0 && (
            <div className="mt-6 space-y-3">
              <h4 className="text-sm font-medium text-deep-700 dark:text-gray-300">Key Findings</h4>
              {speciesEnvCorr.insights.map((insight: string, index: number) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-deep-800 rounded-lg border border-gray-100 dark:border-gray-700"
                >
                  <div className="w-6 h-6 rounded-full bg-ocean-100 dark:bg-ocean-900/50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-ocean-600 dark:text-ocean-400">{index + 1}</span>
                  </div>
                  <p className="text-sm text-deep-600 dark:text-gray-300">{insight}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Query Builder Section */}
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-ocean-500" />
                Query Builder
              </CardTitle>
              <CardDescription>Build custom analytical queries across datasets</CardDescription>
            </div>
            <Badge variant="secondary">
              <Sparkles className="w-3 h-3 mr-1" />
              AI-Assisted
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <Select className="w-full">
              <option value="">Select Dataset</option>
              <option value="species">Species Observations</option>
              <option value="oceanography">Oceanographic Data</option>
              <option value="edna">eDNA Sequences</option>
              <option value="otolith">Otolith Records</option>
            </Select>
            <Select className="w-full">
              <option value="">Select Metric</option>
              <option value="count">Count</option>
              <option value="avg">Average</option>
              <option value="sum">Sum</option>
              <option value="distribution">Distribution</option>
            </Select>
            <Select className="w-full">
              <option value="">Group By</option>
              <option value="species">Species</option>
              <option value="location">Location</option>
              <option value="date">Date</option>
              <option value="habitat">Habitat</option>
            </Select>
            <Button variant="premium" className="w-full">
              <Play className="w-4 h-4 mr-2" />
              Execute Query
            </Button>
          </div>
          <div className="mt-4 p-4 bg-gray-50 dark:bg-deep-800 rounded-xl border border-gray-100 dark:border-gray-700">
            <p className="text-sm text-deep-500 dark:text-gray-400 font-mono">
              SELECT species.name, COUNT(*) as observations
              FROM species
              WHERE created_at &gt; '2024-01-01'
              GROUP BY species.phylum
              ORDER BY observations DESC
              LIMIT 10;
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
