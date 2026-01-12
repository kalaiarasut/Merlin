import { Link, useLocation } from 'react-router-dom';
import {
  Home, Database, Waves, Fish, Circle, Dna, BarChart3,
  MessageSquare, Settings, FileText, ChevronRight, Sparkles, Camera, GraduationCap,
  Globe, FileOutput, Shield, Search, Anchor, GitBranch
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home, description: 'Overview & metrics' },
  { name: 'Data Ingestion', href: '/ingest', icon: Database, description: 'Upload datasets' },
  { name: 'Standards Check', href: '/standards', icon: Shield, description: 'Data compliance' },
  { name: 'Species Resolver', href: '/taxonomy', icon: Search, description: 'Taxonomic lookup' },
  { name: 'Oceanography', href: '/oceanography', icon: Waves, description: 'GIS & mapping' },
  { name: 'Species Explorer', href: '/species', icon: Fish, description: 'Marine species' },
  { name: 'Fish Identifier', href: '/fish-id', icon: Camera, badge: 'AI', description: 'Photo ID' },
  { name: 'Otolith Analysis', href: '/otolith', icon: Circle, description: 'Image analysis' },
  { name: 'eDNA Manager', href: '/edna', icon: Dna, description: 'Sequence data' },
  { name: 'Fisheries', href: '/fisheries', icon: Anchor, description: 'Stock & CPUE' },
  { name: 'Causal Analysis', href: '/causal', icon: GitBranch, description: 'Correlations' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, description: 'Insights & reports' },
  { name: 'Niche Modeling', href: '/niche-modeling', icon: Globe, description: 'Species distribution' },
  { name: 'Report Generator', href: '/reports', icon: FileOutput, description: 'MoES & custom reports' },
  { name: 'Validation', href: '/validation', icon: Shield, description: 'Compliance dashboard' },
  { name: 'Scientific Curation', href: '/curation', icon: Shield, badge: 'STAFF', description: 'Expert review queue' },
  { name: 'AI Assistant', href: '/ai-assistant', icon: MessageSquare, badge: 'AI', description: 'Natural language' },
  { name: 'Research Assistant', href: '/research-assistant', icon: GraduationCap, badge: 'AI', description: 'Literature & methods' },
];

const bottomNavigation = [
  { name: 'Admin Console', href: '/admin', icon: Settings },
  { name: 'API Documentation', href: '/api-docs', icon: FileText },
];

export default function Sidebar() {
  const { user } = useAuthStore();
  const location = useLocation();

  const filteredBottomNavigation = bottomNavigation.filter(item => {
    if (item.name === 'Admin Console' && user?.role !== 'admin') {
      return false;
    }
    return true;
  });

  const filteredNavigation = navigation.filter(item => {
    if (item.href === '/curation' && user?.role !== 'admin' && user?.role !== 'expert') {
      return false;
    }
    return true;
  });

  return (
    <div className="w-72 bg-white/80 dark:bg-deep-900/80 backdrop-blur-xl border-r border-gray-200/50 dark:border-gray-700/50 flex flex-col shadow-lg">
      {/* Logo Section */}
      <div className="p-6 border-b border-gray-200/50 dark:border-gray-700/50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-ocean-500 to-ocean-700 flex items-center justify-center shadow-lg shadow-ocean-500/30">
              <img src="/favicon.png" alt="Marlin Logo" className="w-8 h-8 object-contain" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-marine-500 rounded-full border-2 border-white dark:border-deep-900 flex items-center justify-center">
              <Sparkles className="w-2 h-2 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-ocean-600 to-ocean-800 dark:from-ocean-400 dark:to-ocean-600 bg-clip-text text-transparent">
              Marlin
            </h1>
            <p className="text-xs text-deep-500 dark:text-gray-400 font-medium">Marine Data Platform</p>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-premium dark:scrollbar-premium-dark">
        <p className="px-3 py-2 text-xs font-semibold text-deep-400 dark:text-gray-500 uppercase tracking-wider">
          Main Menu
        </p>
        {filteredNavigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ease-premium relative overflow-hidden',
                isActive
                  ? 'bg-gradient-to-r from-ocean-500 to-ocean-600 text-white shadow-lg shadow-ocean-500/25'
                  : 'text-deep-600 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-deep-800/80 hover:text-deep-900 dark:hover:text-white'
              )}
            >
              <div className={cn(
                "p-2 rounded-lg transition-colors",
                isActive
                  ? "bg-white/20"
                  : "bg-gray-100 dark:bg-deep-800 group-hover:bg-gray-200/80 dark:group-hover:bg-deep-700"
              )}>
                <item.icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block truncate">{item.name}</span>
                {!isActive && (
                  <span className="text-xs text-deep-400 dark:text-gray-500 truncate block">{item.description}</span>
                )}
              </div>
              {item.badge && (
                <span className={cn(
                  "px-2 py-0.5 text-xs font-semibold rounded-full",
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-gradient-to-r from-ocean-500 to-ocean-600 text-white"
                )}>
                  {item.badge}
                </span>
              )}
              {isActive && (
                <ChevronRight className="w-4 h-4 opacity-80" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Navigation */}
      <div className="p-4 border-t border-gray-200/50 dark:border-gray-700/50 space-y-1">
        {filteredBottomNavigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200',
                isActive
                  ? 'bg-deep-100 dark:bg-deep-800 text-deep-900 dark:text-white'
                  : 'text-deep-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-deep-800 hover:text-deep-700 dark:hover:text-gray-200'
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.name}
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200/50 dark:border-gray-700/50">
        <div className="p-4 rounded-xl bg-gradient-to-br from-ocean-50 to-ocean-100/50 dark:from-ocean-900/30 dark:to-ocean-800/20 border border-ocean-200/30 dark:border-ocean-700/30">
          <p className="text-xs font-semibold text-ocean-700 dark:text-ocean-300">Ministry of Earth Sciences</p>
          <p className="text-xs text-ocean-600/80 dark:text-ocean-400/80 mt-0.5">Government of India</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-marine-500 animate-pulse" />
            <span className="text-xs text-deep-500 dark:text-gray-400">System Online</span>
          </div>
        </div>
      </div>
    </div>
  );
}
