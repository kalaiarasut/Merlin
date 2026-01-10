import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Fish, MapPin, Globe, ExternalLink, Edit,
  Download, Share2, BookOpen, Dna, Waves, Thermometer,
  Camera, ChevronRight, AlertTriangle, X, Save, Loader2
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
  const queryClient = useQueryClient();

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    commonName: '',
    habitat: '',
    conservationStatus: '',
    description: '',
  });

  const { data: species, isLoading } = useQuery({
    queryKey: ['species', id],
    queryFn: () => speciesService.getById(id!),
    enabled: !!id,
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: any) => speciesService.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['species', id] });
      setShowEditModal(false);
      alert('Species updated successfully!');
    },
    onError: (error: any) => {
      alert(error?.message || 'Failed to update species');
    },
  });

  // Use sample data for demo
  const displaySpecies = species || SAMPLE_SPECIES;

  // Handle Edit button click
  const handleEditClick = () => {
    setEditForm({
      commonName: displaySpecies.commonName || '',
      habitat: displaySpecies.habitat || '',
      conservationStatus: displaySpecies.conservationStatus || '',
      description: displaySpecies.description || '',
    });
    setShowEditModal(true);
  };

  // Handle save edit
  const handleSaveEdit = () => {
    updateMutation.mutate(editForm);
  };

  // Handle Export to JSON
  const handleExport = () => {
    const exportData = {
      ...displaySpecies,
      exportedAt: new Date().toISOString(),
      source: 'CMLRE Marine Database',
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${displaySpecies.scientificName.replace(/\s+/g, '_')}_data.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
                  <Button variant="outline" size="sm" onClick={handleEditClick}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="w-4 h-4 mr-2" />
                    Export
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

          {/* CMFRI INMARLH Life History Data */}
          {(displaySpecies.inmarlh || displaySpecies.lifeHistory) && (
            <Card variant="default" className="bg-gradient-to-br from-amber-50 to-orange-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-xl">📊</span>
                  Life History Data
                  <Badge variant="secondary" className="ml-2 text-xs">CMFRI INMARLH</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Growth Parameters */}
                  {displaySpecies.inmarlh?.K && (
                    <div className="p-3 bg-white rounded-xl shadow-sm">
                      <p className="text-xs text-gray-500 uppercase">Growth Rate (K)</p>
                      <p className="text-xl font-bold text-amber-600">{displaySpecies.inmarlh.K.toFixed(2)}</p>
                      <p className="text-xs text-gray-400">per year</p>
                    </div>
                  )}
                  {displaySpecies.inmarlh?.Linf && (
                    <div className="p-3 bg-white rounded-xl shadow-sm">
                      <p className="text-xs text-gray-500 uppercase">Max Length (L∞)</p>
                      <p className="text-xl font-bold text-orange-600">{(displaySpecies.inmarlh.Linf / 10).toFixed(1)} cm</p>
                      <p className="text-xs text-gray-400">asymptotic</p>
                    </div>
                  )}
                  {displaySpecies.inmarlh?.Lm && displaySpecies.inmarlh.Lm > 0 && (
                    <div className="p-3 bg-white rounded-xl shadow-sm">
                      <p className="text-xs text-gray-500 uppercase">Maturity Length</p>
                      <p className="text-xl font-bold text-teal-600">{(displaySpecies.inmarlh.Lm / 10).toFixed(1)} cm</p>
                      <p className="text-xs text-gray-400">first maturity</p>
                    </div>
                  )}
                  {displaySpecies.inmarlh?.fecundity && displaySpecies.inmarlh.fecundity > 0 && (
                    <div className="p-3 bg-white rounded-xl shadow-sm">
                      <p className="text-xs text-gray-500 uppercase">Fecundity</p>
                      <p className="text-xl font-bold text-pink-600">
                        {displaySpecies.inmarlh.fecundity > 1000
                          ? `${(displaySpecies.inmarlh.fecundity / 1000).toFixed(0)}K`
                          : displaySpecies.inmarlh.fecundity}
                      </p>
                      <p className="text-xs text-gray-400">eggs</p>
                    </div>
                  )}
                </div>

                {/* Spawning & Ecology */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {displaySpecies.inmarlh?.spawningSeason && (
                    <div className="p-4 bg-white rounded-xl shadow-sm">
                      <p className="text-xs text-gray-500 uppercase mb-2">Spawning Season</p>
                      <p className="font-medium text-gray-800">{displaySpecies.inmarlh.spawningSeason}</p>
                      {displaySpecies.inmarlh.numSpawningMonths > 0 && (
                        <p className="text-sm text-gray-500 mt-1">
                          {displaySpecies.inmarlh.numSpawningMonths} months/year
                        </p>
                      )}
                    </div>
                  )}
                  {displaySpecies.inmarlh?.MTL && (
                    <div className="p-4 bg-white rounded-xl shadow-sm">
                      <p className="text-xs text-gray-500 uppercase mb-2">Trophic Level</p>
                      <p className="font-medium text-gray-800">{displaySpecies.inmarlh.MTL.toFixed(2)}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {displaySpecies.inmarlh.MTL > 4 ? 'Top predator' :
                          displaySpecies.inmarlh.MTL > 3 ? 'Carnivore' :
                            displaySpecies.inmarlh.MTL > 2.5 ? 'Omnivore' : 'Herbivore'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Mortality Rates */}
                {(displaySpecies.inmarlh?.M || displaySpecies.inmarlh?.F) && (
                  <div className="mt-4 p-4 bg-white rounded-xl shadow-sm">
                    <p className="text-xs text-gray-500 uppercase mb-3">Mortality Rates</p>
                    <div className="grid grid-cols-3 gap-4">
                      {displaySpecies.inmarlh?.M && (
                        <div>
                          <p className="text-sm text-gray-500">Natural (M)</p>
                          <p className="text-lg font-semibold">{displaySpecies.inmarlh.M.toFixed(2)}</p>
                        </div>
                      )}
                      {displaySpecies.inmarlh?.F && (
                        <div>
                          <p className="text-sm text-gray-500">Fishing (F)</p>
                          <p className="text-lg font-semibold text-red-600">{displaySpecies.inmarlh.F.toFixed(2)}</p>
                        </div>
                      )}
                      {displaySpecies.inmarlh?.Z && (
                        <div>
                          <p className="text-sm text-gray-500">Total (Z)</p>
                          <p className="text-lg font-semibold">{displaySpecies.inmarlh.Z.toFixed(2)}</p>
                        </div>
                      )}
                    </div>
                    {displaySpecies.inmarlh?.F && displaySpecies.inmarlh?.M && (
                      <div className="mt-3">
                        <p className="text-xs text-gray-400">
                          Exploitation ratio (F/Z): {(displaySpecies.inmarlh.F / (displaySpecies.inmarlh.F + displaySpecies.inmarlh.M)).toFixed(2)}
                          {displaySpecies.inmarlh.F / (displaySpecies.inmarlh.F + displaySpecies.inmarlh.M) > 0.5 && (
                            <span className="text-red-500 ml-2">⚠️ Potentially overfished</span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Data Source */}
                <div className="mt-4 text-center">
                  <p className="text-xs text-gray-400">
                    Source: {displaySpecies.inmarlh?.studyLocality || 'CMFRI'}
                    {displaySpecies.inmarlh?.region && ` (${displaySpecies.inmarlh.region} Coast)`}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
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

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-deep-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-deep-900 dark:text-gray-100">Edit Species</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowEditModal(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <p className="text-sm text-deep-500 dark:text-gray-400 mt-1 italic">{displaySpecies.scientificName}</p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-deep-700 dark:text-gray-300 mb-2">Common Name</label>
                <input
                  type="text"
                  value={editForm.commonName}
                  onChange={(e) => setEditForm({ ...editForm, commonName: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border-2 border-gray-200 dark:border-gray-600 dark:bg-deep-700 text-sm focus:outline-none focus:border-ocean-400"
                  placeholder="e.g., Indian Mackerel"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-deep-700 dark:text-gray-300 mb-2">Habitat</label>
                <input
                  type="text"
                  value={editForm.habitat}
                  onChange={(e) => setEditForm({ ...editForm, habitat: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border-2 border-gray-200 dark:border-gray-600 dark:bg-deep-700 text-sm focus:outline-none focus:border-ocean-400"
                  placeholder="e.g., Coral reefs, Pelagic"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-deep-700 dark:text-gray-300 mb-2">Conservation Status</label>
                <select
                  value={editForm.conservationStatus}
                  onChange={(e) => setEditForm({ ...editForm, conservationStatus: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border-2 border-gray-200 dark:border-gray-600 dark:bg-deep-700 text-sm focus:outline-none focus:border-ocean-400"
                >
                  <option value="">Select Status</option>
                  <option value="LC">Least Concern (LC)</option>
                  <option value="NT">Near Threatened (NT)</option>
                  <option value="VU">Vulnerable (VU)</option>
                  <option value="EN">Endangered (EN)</option>
                  <option value="CR">Critically Endangered (CR)</option>
                  <option value="DD">Data Deficient (DD)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-deep-700 dark:text-gray-300 mb-2">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 dark:bg-deep-700 text-sm focus:outline-none focus:border-ocean-400 resize-none"
                  placeholder="Species description..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
              <Button variant="default" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
