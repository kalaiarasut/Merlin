import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Database, Fish, Circle, Dna, Activity,
  ArrowUpRight, Clock, Zap, Globe2, Layers, BarChart3,
  ChevronRight, Sparkles, FileUp, AlertCircle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 dark:bg-deep-800/95 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-gray-200/50 dark:border-gray-700/50">
        <p className="text-sm font-semibold text-deep-900 dark:text-gray-100">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm text-deep-600 dark:text-gray-300">
            <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: entry.color }} />
            {entry.name}: {entry.value.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => analyticsService.getStats(),
  });

  const { data: chartData } = useQuery({
    queryKey: ['dashboard-growth'],
    queryFn: () => analyticsService.getGrowth(6),
  });

  const { data: phylumData } = useQuery({
    queryKey: ['dashboard-phylum'],
    queryFn: () => analyticsService.getSpeciesByPhylum(),
  });

const statsCards = [
    { 
      title: 'Total Species', 
      value: stats?.totalSpecies || 0, 
      icon: Fish, 
      iconColor: 'text-ocean-600',
      iconBg: 'bg-ocean-50',
      change: { value: 12, type: 'increase' as const },
      subtitle: 'Marine species catalogued'
    },
    { 
      title: 'Occurrences', 
      value: stats?.totalOccurrences || 0, 
      icon: Globe2, 
      iconColor: 'text-marine-600',
      iconBg: 'bg-marine-50',
      change: { value: 8, type: 'increase' as const },
      subtitle: 'Geographic records'
    },
    { 
      title: 'Otolith Records', 
      value: stats?.totalOtoliths || 0, 
      icon: Circle, 
      iconColor: 'text-coral-600',
      iconBg: 'bg-coral-50',
      change: { value: 5, type: 'increase' as const },
      subtitle: 'Images analyzed'
    },
    { 
      title: 'eDNA Detections', 
      value: stats?.totalEdnaDetections || 0, 
      icon: Dna, 
      iconColor: 'text-purple-600',
      iconBg: 'bg-purple-50',
      change: { value: 23, type: 'increase' as const },
      subtitle: 'Sequence matches'
    },
    { 
      title: 'Active Surveys', 
      value: stats?.totalSurveys || 0, 
      icon: Layers, 
      iconColor: 'text-indigo-600',
      iconBg: 'bg-indigo-50',
      change: { value: 3, type: 'neutral' as const },
      subtitle: 'Research campaigns'
    },
    { 
      title: 'Data Quality', 
      value: `${stats?.dataQualityScore || 94}%`, 
      icon: Sparkles, 
      iconColor: 'text-amber-600',
      iconBg: 'bg-amber-50',
      change: { value: 2, type: 'increase' as const },
      subtitle: 'Validation score'
    },
  ];

  // Use real activity data from stats or fallback
  const recentActivity = (stats?.recentActivity || []).map((activity: any, index: number) => ({
    id: activity.id || index,
    action: activity.action || 'Activity',
    description: activity.description || '',
    time: activity.timestamp ? new Date(activity.timestamp).toLocaleString() : 'Recently',
    type: activity.type === 'ingestion' ? 'success' : 
          activity.type === 'error' ? 'warning' : 'info'
  })).slice(0, 5);

  // Fallback data if API returns empty
  const displayChartData = (chartData && chartData.length > 0) ? chartData : [
    { month: 'Jan', species: 0, occurrences: 0, edna: 0 },
    { month: 'Feb', species: 0, occurrences: 0, edna: 0 },
    { month: 'Mar', species: 0, occurrences: 0, edna: 0 },
    { month: 'Apr', species: 0, occurrences: 0, edna: 0 },
    { month: 'May', species: 0, occurrences: 0, edna: 0 },
    { month: 'Jun', species: 0, occurrences: 0, edna: 0 },
  ];

  const displayPhylumData = (phylumData && phylumData.length > 0) ? phylumData : [
    { phylum: 'No Data', count: 0, color: '#94a3b8' }
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-deep-500 dark:text-gray-400 mb-1">
            <Clock className="w-4 h-4" />
            <span>Last updated: {new Date().toLocaleString()}</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-deep-900 dark:text-gray-100">Dashboard</h1>
          <p className="text-deep-500 dark:text-gray-400 mt-1">
            Welcome to the CMLRE Marine Data Platform. Here's your overview.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="default">
            <FileUp className="w-4 h-4 mr-2" />
            Quick Import
          </Button>
          <Button variant="premium">
            <Zap className="w-4 h-4 mr-2" />
            Generate Report
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {statsCards.map((stat) => (
          <StatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            icon={stat.icon}
            iconColor={stat.iconColor}
            iconBg={stat.iconBg}
            change={stat.change}
            subtitle={stat.subtitle}
            loading={isLoading}
          />
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Trends Chart */}
        <Card variant="default">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Data Growth Trends</CardTitle>
                <CardDescription>Monthly data acquisition overview</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-ocean-600">
                View Details <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={displayChartData}>
                <defs>
                  <linearGradient id="colorSpecies" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorOccurrences" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" vertical={false} />
                <XAxis dataKey="month" stroke="currentColor" className="text-gray-500 dark:text-gray-400" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="currentColor" className="text-gray-500 dark:text-gray-400" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ paddingTop: 20 }}
                  formatter={(value) => <span className="text-sm text-deep-600 dark:text-gray-300">{value}</span>}
                />
                <Area type="monotone" dataKey="occurrences" name="Occurrences" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorOccurrences)" />
                <Area type="monotone" dataKey="species" name="Species" stroke="#0ea5e9" strokeWidth={2} fillOpacity={1} fill="url(#colorSpecies)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Species by Phylum */}
        <Card variant="default">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Species by Phylum</CardTitle>
                <CardDescription>Taxonomic distribution</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-ocean-600">
                Explore <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={displayPhylumData} layout="vertical" barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" horizontal={false} />
                <XAxis type="number" stroke="currentColor" className="text-gray-500 dark:text-gray-400" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis dataKey="phylum" type="category" stroke="currentColor" className="text-gray-500 dark:text-gray-400" fontSize={12} tickLine={false} axisLine={false} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Species Count" radius={[0, 6, 6, 0]}>
                  {displayPhylumData.map((entry, index) => (
                    <rect key={`bar-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <Card variant="default" className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest data processing and system events</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-ocean-600">
                View All <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity: { id: string | number; action: string; description: string; time: string; type: string }) => (
                <div 
                  key={activity.id} 
                  className="flex items-start gap-4 p-4 rounded-xl bg-gray-50/50 dark:bg-deep-800/50 hover:bg-gray-100/50 dark:hover:bg-deep-700/50 transition-colors border border-gray-100 dark:border-gray-700/50"
                >
                  <div className={`p-2 rounded-lg ${
                    activity.type === 'success' ? 'bg-marine-100 dark:bg-marine-900/30 text-marine-600 dark:text-marine-400' :
                    activity.type === 'warning' ? 'bg-coral-100 dark:bg-coral-900/30 text-coral-600 dark:text-coral-400' :
                    activity.type === 'processing' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' :
                    'bg-ocean-100 dark:bg-ocean-900/30 text-ocean-600 dark:text-ocean-400'
                  }`}>
                    {activity.type === 'success' ? <Activity className="w-4 h-4" /> :
                     activity.type === 'warning' ? <AlertCircle className="w-4 h-4" /> :
                     activity.type === 'processing' ? <Zap className="w-4 h-4" /> :
                     <Database className="w-4 h-4" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-deep-900 dark:text-gray-100">{activity.action}</p>
                      <Badge 
                        variant={
                          activity.type === 'success' ? 'success' :
                          activity.type === 'warning' ? 'warning' :
                          activity.type === 'processing' ? 'default' :
                          'secondary'
                        }
                        size="sm"
                      >
                        {activity.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-deep-500 dark:text-gray-400 mt-0.5">{activity.description}</p>
                    <p className="text-xs text-deep-400 dark:text-gray-500 mt-1">{activity.time}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" className="flex-shrink-0">
                    <ArrowUpRight className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions & System Status */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card variant="premium">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-ocean-600" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start" size="default">
                <FileUp className="w-4 h-4 mr-3 text-ocean-500" />
                Import Dataset
              </Button>
              <Button variant="outline" className="w-full justify-start" size="default">
                <Fish className="w-4 h-4 mr-3 text-marine-500" />
                Add Species Record
              </Button>
              <Button variant="outline" className="w-full justify-start" size="default">
                <BarChart3 className="w-4 h-4 mr-3 text-purple-500" />
                Run Analysis
              </Button>
              <Button variant="outline" className="w-full justify-start" size="default">
                <Sparkles className="w-4 h-4 mr-3 text-amber-500" />
                AI Classification
              </Button>
            </CardContent>
          </Card>

          {/* System Status */}
          <Card variant="default">
            <CardHeader className="pb-3">
              <CardTitle>System Health</CardTitle>
              <CardDescription>Infrastructure status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-deep-600 dark:text-gray-300">Database</span>
                  <Badge variant="success" dot>Healthy</Badge>
                </div>
                <Progress value={23} variant="success" />
                <p className="text-xs text-deep-400 dark:text-gray-500">23% of 500GB used</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-deep-600 dark:text-gray-300">AI Services</span>
                  <Badge variant="success" dot>Online</Badge>
                </div>
                <Progress value={45} variant="default" />
                <p className="text-xs text-deep-400 dark:text-gray-500">45% GPU utilization</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-deep-600 dark:text-gray-300">API Requests</span>
                  <Badge variant="default" dot>Normal</Badge>
                </div>
                <Progress value={67} variant="gradient" />
                <p className="text-xs text-deep-400 dark:text-gray-500">2,340 requests/hour</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
