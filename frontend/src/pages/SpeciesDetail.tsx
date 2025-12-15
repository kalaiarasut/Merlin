import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Fish, MapPin, Globe, ExternalLink, Edit,
  Download, Share2, BookOpen, Dna, Waves, Thermometer,
  Camera, ChevronRight, AlertTriangle
} from 'lucide-react';
import { speciesService } from '@/services/api';

const SAMPLE_SPECIES = {
  _id: '1',
  scientificName: 'Rastrelliger kanagurta',
  commonName: 'Indian Mackerel',
  kingdom: 'Animalia',
  phylum: 'Chordata',
  class: 'Actinopterygii',
  order: 'Scombriformes',
  family: 'Scombridae',
  genus: 'Rastrelliger',
  habitat: 'Pelagic',
  depth: { min: 20, max: 90 },
  temperature: { min: 24, max: 29 },
  conservationStatus: 'LC',
  description: 'The Indian mackerel is a species of mackerel in the scombrid family of order Perciformes. It is commonly found in the Indian and West Pacific oceans, and their surrounding seas. It is an important food fish and is commonly used in South and Southeast Asian cuisines.',
  distribution: ['Indian Ocean', 'Bay of Bengal', 'Arabian Sea', 'South China Sea'],
  observations: 12450,
  lastObserved: '2024-01-15',
  images: ['/placeholder1.jpg', '/placeholder2.jpg'],
};

export default function SpeciesDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: species, isLoading } = useQuery({
    queryKey: ['species', id],
    queryFn: () => speciesService.getById(id!),
    enabled: !!id,
  });

  // Use sample data for demo
  const displaySpecies = species || SAMPLE_SPECIES;

  const getConservationBadge = (status: string) => {
    const variants: Record<string, { variant: 'success' | 'warning' | 'destructive' | 'secondary', label: string }> = {
      LC: { variant: 'success', label: 'Least Concern' },
      NT: { variant: 'secondary', label: 'Near Threatened' },
      VU: { variant: 'warning', label: 'Vulnerable' },
      EN: { variant: 'destructive', label: 'Endangered' },
      CR: { variant: 'destructive', label: 'Critically Endangered' },
    };
    const info = variants[status] || { variant: 'secondary', label: status };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded-lg" />
        <div className="h-64 bg-gray-200 rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-32 bg-gray-200 rounded-xl" />
          <div className="h-32 bg-gray-200 rounded-xl" />
          <div className="h-32 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <Link 
        to="/species"
        className="inline-flex items-center gap-2 text-sm text-deep-500 hover:text-ocean-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Species Explorer
      </Link>

      {/* Header Section */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Info Card */}
        <Card variant="premium" className="flex-1">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Image Placeholder */}
              <div className="w-full md:w-64 h-48 md:h-64 rounded-2xl bg-gradient-to-br from-ocean-100 to-marine-100 flex items-center justify-center">
                <Fish className="w-24 h-24 text-ocean-300" />
              </div>

              {/* Species Info */}
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-3xl lg:text-4xl font-bold text-deep-900 italic">
                      {displaySpecies.scientificName}
                    </h1>
                    <p className="text-xl text-deep-500 mt-1">{displaySpecies.commonName}</p>
                  </div>
                  {getConservationBadge(displaySpecies.conservationStatus)}
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  <div className="p-3 bg-ocean-50 rounded-xl">
                    <div className="flex items-center gap-2 text-ocean-600 mb-1">
                      <Globe className="w-4 h-4" />
                      <span className="text-xs font-medium">Habitat</span>
                    </div>
                    <p className="font-semibold text-deep-900">{displaySpecies.habitat}</p>
                  </div>
                  <div className="p-3 bg-marine-50 rounded-xl">
                    <div className="flex items-center gap-2 text-marine-600 mb-1">
                      <Waves className="w-4 h-4" />
                      <span className="text-xs font-medium">Depth</span>
                    </div>
                    <p className="font-semibold text-deep-900">{displaySpecies.depth?.min}-{displaySpecies.depth?.max}m</p>
                  </div>
                  <div className="p-3 bg-coral-50 rounded-xl">
                    <div className="flex items-center gap-2 text-coral-600 mb-1">
                      <Thermometer className="w-4 h-4" />
                      <span className="text-xs font-medium">Temperature</span>
                    </div>
                    <p className="font-semibold text-deep-900">{displaySpecies.temperature?.min}-{displaySpecies.temperature?.max}°C</p>
                  </div>
                  <div className="p-3 bg-abyss-50 rounded-xl">
                    <div className="flex items-center gap-2 text-abyss-600 mb-1">
                      <Camera className="w-4 h-4" />
                      <span className="text-xs font-medium">Observations</span>
                    </div>
                    <p className="font-semibold text-deep-900">{displaySpecies.observations?.toLocaleString()}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                  <Button variant="outline" size="sm">
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                  <Button variant="outline" size="sm">
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <Card variant="default">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-ocean-500" />
                Description
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-deep-600 leading-relaxed">{displaySpecies.description}</p>
            </CardContent>
          </Card>

          {/* Taxonomy */}
          <Card variant="default">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Dna className="w-5 h-5 text-marine-500" />
                Taxonomy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: 'Kingdom', value: displaySpecies.kingdom },
                  { label: 'Phylum', value: displaySpecies.phylum },
                  { label: 'Class', value: displaySpecies.class },
                  { label: 'Order', value: displaySpecies.order },
                  { label: 'Family', value: displaySpecies.family },
                  { label: 'Genus', value: displaySpecies.genus },
                ].map((item, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs text-deep-500 mb-1">{item.label}</p>
                    <p className="font-semibold text-deep-900">{item.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Distribution Map Placeholder */}
          <Card variant="default">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-coral-500" />
                Geographic Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-gradient-to-br from-ocean-100 to-marine-100 rounded-xl flex items-center justify-center mb-4">
                <div className="text-center">
                  <MapPin className="w-12 h-12 text-ocean-300 mx-auto mb-2" />
                  <p className="text-ocean-600 font-medium">Distribution Map</p>
                  <p className="text-sm text-ocean-500">Interactive map coming soon</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {displaySpecies.distribution?.map((region: string, idx: number) => (
                  <Badge key={idx} variant="secondary">{region}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quick Facts */}
          <Card variant="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Facts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-2">
                <span className="text-sm text-deep-500">Family</span>
                <span className="text-sm font-medium text-deep-900">{displaySpecies.family}</span>
              </div>
              <div className="flex items-center justify-between p-2">
                <span className="text-sm text-deep-500">Last Observed</span>
                <span className="text-sm font-medium text-deep-900">{displaySpecies.lastObserved}</span>
              </div>
              <div className="flex items-center justify-between p-2">
                <span className="text-sm text-deep-500">Total Records</span>
                <span className="text-sm font-medium text-deep-900">{displaySpecies.observations?.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* External Links */}
          <Card variant="default">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">External Resources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <a
                href={`https://www.fishbase.se/summary/${displaySpecies.scientificName?.replace(' ', '-')}.html`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
              >
                <div className="p-2 rounded-lg bg-ocean-100">
                  <ExternalLink className="w-4 h-4 text-ocean-600" />
                </div>
                <span className="flex-1 text-sm font-medium text-deep-700">FishBase</span>
                <ChevronRight className="w-4 h-4 text-deep-300 group-hover:text-ocean-500" />
              </a>
              <a
                href={`https://www.iucnredlist.org/search?query=${displaySpecies.scientificName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
              >
                <div className="p-2 rounded-lg bg-coral-100">
                  <AlertTriangle className="w-4 h-4 text-coral-600" />
                </div>
                <span className="flex-1 text-sm font-medium text-deep-700">IUCN Red List</span>
                <ChevronRight className="w-4 h-4 text-deep-300 group-hover:text-ocean-500" />
              </a>
              <a
                href={`https://www.gbif.org/species/search?q=${displaySpecies.scientificName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
              >
                <div className="p-2 rounded-lg bg-marine-100">
                  <Globe className="w-4 h-4 text-marine-600" />
                </div>
                <span className="flex-1 text-sm font-medium text-deep-700">GBIF</span>
                <ChevronRight className="w-4 h-4 text-deep-300 group-hover:text-ocean-500" />
              </a>
            </CardContent>
          </Card>

          {/* Related Species */}
          <Card variant="default">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Related Species</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-deep-500 text-center py-4">
                Coming soon...
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
