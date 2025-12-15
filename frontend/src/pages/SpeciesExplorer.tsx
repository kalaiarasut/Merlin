import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { speciesService } from '@/services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Search, MapPin, Shield, Fish, Grid3X3, List, 
  ChevronLeft, ChevronRight, SlidersHorizontal, Sparkles,
  Globe2, Layers, ArrowUpRight, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Cache for fetched species images
const speciesImageCache: Record<string, string | null> = {};

// Generate a consistent color based on species name for placeholder
const getSpeciesColor = (name: string): string => {
  const colors = [
    'from-blue-400 to-cyan-500',
    'from-teal-400 to-emerald-500',
    'from-indigo-400 to-purple-500',
    'from-orange-400 to-amber-500',
    'from-pink-400 to-rose-500',
    'from-cyan-400 to-blue-500',
    'from-emerald-400 to-teal-500',
    'from-violet-400 to-indigo-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// Fetch image from iNaturalist API
const fetchSpeciesImage = async (scientificName: string): Promise<string | null> => {
  // Check cache first
  if (speciesImageCache[scientificName] !== undefined) {
    return speciesImageCache[scientificName];
  }
  
  try {
    const response = await fetch(
      `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientificName)}&per_page=1`
    );
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const taxon = data.results[0];
      if (taxon.default_photo && taxon.default_photo.medium_url) {
        const imageUrl = taxon.default_photo.medium_url;
        speciesImageCache[scientificName] = imageUrl;
        return imageUrl;
      }
    }
    speciesImageCache[scientificName] = null;
    return null;
  } catch (error) {
    console.error('Error fetching species image:', error);
    speciesImageCache[scientificName] = null;
    return null;
  }
};

// Image component with dynamic fetching from iNaturalist
const SpeciesImage: React.FC<{ 
  scientificName: string; 
  images?: string[];
  className?: string;
}> = ({ scientificName, images, className }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // First check if species has images in database
    if (images && images.length > 0 && images[0]) {
      setImageUrl(images[0]);
      setIsLoading(false);
      return;
    }

    // Otherwise fetch from iNaturalist
    setIsLoading(true);
    fetchSpeciesImage(scientificName).then((url) => {
      setImageUrl(url);
      setIsLoading(false);
    });
  }, [scientificName, images]);

  // Get initials from scientific name (e.g., "Thunnus albacares" -> "Ta")
  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Beautiful placeholder with gradient and initials
  const PlaceholderImage = ({ loading = false }: { loading?: boolean }) => (
    <div className={cn(
      "flex flex-col items-center justify-center bg-gradient-to-br",
      getSpeciesColor(scientificName),
      className
    )}>
      <div className={cn(
        "flex flex-col items-center justify-center transform group-hover:scale-110 transition-transform duration-300",
        loading && "animate-pulse"
      )}>
        <span className="text-3xl font-bold text-white/90 drop-shadow-md">{getInitials(scientificName)}</span>
        <Fish className="w-10 h-10 text-white/70 mt-1" />
      </div>
    </div>
  );

  if (isLoading) {
    return <PlaceholderImage loading={true} />;
  }

  if (!imageUrl || imageError) {
    return <PlaceholderImage />;
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {!imageLoaded && (
        <div className={cn(
          "absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br",
          getSpeciesColor(scientificName)
        )}>
          <span className="text-3xl font-bold text-white/90 drop-shadow-md animate-pulse">{getInitials(scientificName)}</span>
          <Fish className="w-10 h-10 text-white/70 mt-1 animate-pulse" />
        </div>
      )}
      <img
        src={imageUrl}
        alt={scientificName}
        className={cn(
          "w-full h-full object-cover transition-all duration-500 group-hover:scale-110",
          imageLoaded ? "opacity-100" : "opacity-0"
        )}
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
      />
    </div>
  );
};

const conservationStatusColors: Record<string, { bg: string, text: string, label: string }> = {
  'LC': { bg: 'bg-marine-100', text: 'text-marine-700', label: 'Least Concern' },
  'NT': { bg: 'bg-ocean-100', text: 'text-ocean-700', label: 'Near Threatened' },
  'VU': { bg: 'bg-coral-100', text: 'text-coral-700', label: 'Vulnerable' },
  'EN': { bg: 'bg-abyss-100', text: 'text-abyss-700', label: 'Endangered' },
  'CR': { bg: 'bg-abyss-200', text: 'text-abyss-800', label: 'Critically Endangered' },
  'DD': { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Data Deficient' },
};

export default function SpeciesExplorer() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    phylum: '',
    habitat: '',
    conservationStatus: '',
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['species', page, search, filters],
    queryFn: () => speciesService.getAll({ page, limit: 12, search: search || undefined }),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ phylum: '', habitat: '', conservationStatus: '' });
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Fish className="w-5 h-5 text-ocean-500" />
            <span className="text-sm font-medium text-ocean-600">Marine Database</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-deep-900">Species Explorer</h1>
          <p className="text-deep-500 mt-1">
            Browse and discover {data?.pagination?.total?.toLocaleString() || 'thousands of'} marine species in our database
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline">
            <Sparkles className="w-4 h-4 mr-2" />
            AI Identify
          </Button>
          <Button variant="premium">
            <Fish className="w-4 h-4 mr-2" />
            Add Species
          </Button>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <Card variant="glass" className="p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search Input */}
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-deep-400" />
              <input
                type="text"
                placeholder="Search by scientific name, common name, or taxonomy..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-12 pl-12 pr-4 rounded-xl border-2 border-gray-200 bg-white text-sm placeholder:text-deep-400 focus:outline-none focus:border-ocean-400 focus:ring-4 focus:ring-ocean-100 transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-deep-400 hover:text-deep-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>

          {/* Filter & View Controls */}
          <div className="flex gap-2">
            <Button
              variant={showFilters ? 'default' : 'outline'}
              onClick={() => setShowFilters(!showFilters)}
              className="relative"
            >
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-ocean-500 text-white text-xs rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            
            <div className="flex rounded-xl border-2 border-gray-200 overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  "p-3 transition-colors",
                  viewMode === 'grid' ? 'bg-ocean-500 text-white' : 'bg-white text-deep-500 hover:bg-gray-50'
                )}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  "p-3 transition-colors border-l-2 border-gray-200",
                  viewMode === 'list' ? 'bg-ocean-500 text-white' : 'bg-white text-deep-500 hover:bg-gray-50'
                )}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 animate-fade-in-down">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-deep-700 mb-2">Phylum</label>
                <select
                  value={filters.phylum}
                  onChange={(e) => setFilters({ ...filters, phylum: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border-2 border-gray-200 text-sm focus:outline-none focus:border-ocean-400"
                >
                  <option value="">All Phyla</option>
                  <option value="Chordata">Chordata</option>
                  <option value="Arthropoda">Arthropoda</option>
                  <option value="Mollusca">Mollusca</option>
                  <option value="Echinodermata">Echinodermata</option>
                  <option value="Cnidaria">Cnidaria</option>
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-deep-700 mb-2">Habitat</label>
                <select
                  value={filters.habitat}
                  onChange={(e) => setFilters({ ...filters, habitat: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border-2 border-gray-200 text-sm focus:outline-none focus:border-ocean-400"
                >
                  <option value="">All Habitats</option>
                  <option value="Pelagic">Pelagic</option>
                  <option value="Coral reefs">Coral Reefs</option>
                  <option value="Deep sea">Deep Sea</option>
                  <option value="Coastal waters">Coastal Waters</option>
                  <option value="Estuarine">Estuarine</option>
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-deep-700 mb-2">Conservation Status</label>
                <select
                  value={filters.conservationStatus}
                  onChange={(e) => setFilters({ ...filters, conservationStatus: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border-2 border-gray-200 text-sm focus:outline-none focus:border-ocean-400"
                >
                  <option value="">All Statuses</option>
                  <option value="LC">Least Concern</option>
                  <option value="NT">Near Threatened</option>
                  <option value="VU">Vulnerable</option>
                  <option value="EN">Endangered</option>
                  <option value="CR">Critically Endangered</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button variant="ghost" onClick={clearFilters} size="default">
                  <X className="w-4 h-4 mr-2" />
                  Clear All
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="h-48 bg-gradient-to-br from-gray-100 to-gray-200 animate-pulse" />
              <CardContent className="p-5 space-y-3">
                <div className="h-5 bg-gray-200 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2" />
                <div className="h-4 bg-gray-100 rounded animate-pulse w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card variant="default" className="p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-abyss-100 flex items-center justify-center">
            <Fish className="w-8 h-8 text-abyss-500" />
          </div>
          <h3 className="text-lg font-semibold text-deep-900 mb-2">Error Loading Species</h3>
          <p className="text-deep-500 mb-4">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </Card>
      ) : !data?.data || data.data.length === 0 ? (
        <Card variant="default" className="p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-ocean-100 flex items-center justify-center">
            <Search className="w-8 h-8 text-ocean-500" />
          </div>
          <h3 className="text-lg font-semibold text-deep-900 mb-2">No Species Found</h3>
          <p className="text-deep-500 mb-4">
            Try adjusting your search or filters to find what you're looking for
          </p>
          <Button variant="outline" onClick={() => { setSearch(''); clearFilters(); }}>
            Clear Search
          </Button>
        </Card>
      ) : (
        <>
          {/* Results Count */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-deep-500">
              Showing <span className="font-semibold text-deep-700">{data.data.length}</span> of{' '}
              <span className="font-semibold text-deep-700">{data.pagination?.total?.toLocaleString()}</span> species
            </p>
          </div>

          {/* Species Grid/List */}
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {data.data.map((species: any) => (
                <Card 
                  key={species._id} 
                  variant="default" 
                  hover 
                  className="overflow-hidden group"
                >
                  {/* Species Image */}
                  <div className="relative h-48 overflow-hidden">
                    <SpeciesImage 
                      scientificName={species.scientificName} 
                      images={species.images}
                      className="h-full w-full"
                    />
                    {species.conservationStatus && (
                      <div className="absolute top-3 right-3">
                        <Badge 
                          className={cn(
                            conservationStatusColors[species.conservationStatus]?.bg,
                            conservationStatusColors[species.conservationStatus]?.text
                          )}
                        >
                          <Shield className="w-3 h-3 mr-1" />
                          {species.conservationStatus}
                        </Badge>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  
                  <CardContent className="p-5">
                    <h3 className="text-lg font-semibold text-deep-900 group-hover:text-ocean-600 transition-colors truncate">
                      {species.scientificName}
                    </h3>
                    <p className="text-sm text-deep-500 mb-3">
                      {species.commonName || 'Common name not available'}
                    </p>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-deep-600">
                        <Layers className="w-4 h-4 text-ocean-400" />
                        <span>{species.family || 'Unknown'}</span>
                        <span className="text-deep-300">•</span>
                        <span>{species.order || 'Unknown'}</span>
                      </div>
                      
                      {species.habitat && (
                        <div className="flex items-center gap-2 text-deep-600">
                          <Globe2 className="w-4 h-4 text-marine-400" />
                          <span className="truncate">{species.habitat}</span>
                        </div>
                      )}
                      
                      {species.distribution && species.distribution.length > 0 && (
                        <div className="flex items-center gap-2 text-deep-600">
                          <MapPin className="w-4 h-4 text-coral-400" />
                          <span className="truncate">{species.distribution.slice(0, 2).join(', ')}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                      <Badge variant="secondary" size="sm">
                        {species.phylum || 'Unknown'}
                      </Badge>
                      <Button variant="ghost" size="sm" className="text-ocean-600 -mr-2">
                        Details <ArrowUpRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {data.data.map((species: any) => (
                <Card 
                  key={species._id} 
                  variant="default" 
                  hover
                  className="px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                      <SpeciesImage 
                        scientificName={species.scientificName} 
                        images={species.images}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-deep-900 dark:text-gray-100 truncate">{species.scientificName}</h3>
                          {species.conservationStatus && (
                            <Badge 
                              size="sm"
                              className={cn(
                                "text-[10px] px-1.5 py-0",
                                conservationStatusColors[species.conservationStatus]?.bg,
                                conservationStatusColors[species.conservationStatus]?.text
                              )}
                            >
                              {species.conservationStatus}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-deep-500 dark:text-gray-400 truncate">{species.commonName || 'No common name'}</p>
                      </div>
                      <div className="hidden md:flex items-center gap-3 text-xs text-deep-400 dark:text-gray-500">
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-deep-700 rounded">{species.family || 'Unknown'}</span>
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-deep-700 rounded">{species.habitat || 'Unknown'}</span>
                        {species.distribution?.[0] && (
                          <span className="px-2 py-0.5 bg-gray-100 dark:bg-deep-700 rounded truncate max-w-[120px]">{species.distribution[0]}</span>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon-sm" className="flex-shrink-0">
                      <ArrowUpRight className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {data?.pagination && data.pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <Button
                variant="outline"
                size="default"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              
              <div className="flex items-center gap-1">
                {[...Array(Math.min(5, data.pagination.pages))].map((_, i) => {
                  const pageNum = i + 1;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={cn(
                        "w-10 h-10 rounded-lg text-sm font-medium transition-all",
                        page === pageNum
                          ? "bg-ocean-500 text-white shadow-lg shadow-ocean-500/25"
                          : "text-deep-600 hover:bg-gray-100"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                {data.pagination.pages > 5 && (
                  <>
                    <span className="px-2 text-deep-400">...</span>
                    <button
                      onClick={() => setPage(data.pagination.pages)}
                      className={cn(
                        "w-10 h-10 rounded-lg text-sm font-medium transition-all",
                        page === data.pagination.pages
                          ? "bg-ocean-500 text-white"
                          : "text-deep-600 hover:bg-gray-100"
                      )}
                    >
                      {data.pagination.pages}
                    </button>
                  </>
                )}
              </div>
              
              <Button
                variant="outline"
                size="default"
                onClick={() => setPage(p => Math.min(data.pagination.pages, p + 1))}
                disabled={page === data.pagination.pages}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
