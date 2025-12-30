import { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input, Select } from '@/components/ui/input';
import { ednaService } from '@/services/api';
import {
  Dna, Upload, FileText, Loader, CheckCircle2, XCircle,
  Database, Search, Filter, Download, Play, RefreshCw,
  ChevronRight, Sparkles, AlertCircle, BarChart3, MapPin,
  TreeDeciduous, Microscope, GitBranch, PieChart, TrendingUp,
  Layers, Eye, Copy, Maximize2, Minimize2, ZoomIn, ZoomOut,
  FileCode, Share2, Settings, Info, ChevronDown, ChevronUp,
  Globe, Activity, Waves, Clock, Hash, Percent, List, Grid3X3,
  FlaskConical, BookOpen, Target, Network
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================
// TYPES & INTERFACES
// ============================
interface SequenceData {
  id: string;
  header: string;
  sequence: string;
  quality?: string;
  length: number;
  gcContent: number;
  avgQuality?: number;
}

interface TaxonomyNode {
  name: string;
  rank: string;
  count: number;
  confidence: number;
  children?: TaxonomyNode[];
  color?: string;
}

interface BiodiversityMetrics {
  shannonIndex: number;
  simpsonIndex: number;
  chao1: number;
  observedSpecies: number;
  evenness: number;
  dominance: number;
}

interface QualityMetrics {
  totalReads: number;
  passedQC: number;
  avgQScore: number;
  gcContent: number;
  avgLength: number;
  lengthDistribution: { range: string; count: number }[];
  qualityDistribution: { score: number; count: number }[];
}

interface ProcessingStep {
  name: string;
  desc: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress?: number;
  details?: string;
}

// ============================
// CONSTANTS
// ============================
const PIPELINE_STEPS: ProcessingStep[] = [
  { name: 'Quality Control', desc: 'Filtering low-quality reads', status: 'pending' },
  { name: 'Trimming', desc: 'Removing adapters and primers', status: 'pending' },
  { name: 'Denoising', desc: 'Error correction with DADA2', status: 'pending' },
  { name: 'Taxonomy', desc: 'BLAST against reference database', status: 'pending' },
  { name: 'Visualization', desc: 'Generating reports', status: 'pending' },
];

const TAXONOMY_RANKS = ['Kingdom', 'Phylum', 'Class', 'Order', 'Family', 'Genus', 'Species'];

const RANK_COLORS: Record<string, string> = {
  Kingdom: '#3b82f6',
  Phylum: '#8b5cf6',
  Class: '#ec4899',
  Order: '#f97316',
  Family: '#eab308',
  Genus: '#22c55e',
  Species: '#06b6d4',
};

const NUCLEOTIDE_COLORS: Record<string, string> = {
  A: '#22c55e', // Green
  T: '#ef4444', // Red
  G: '#f59e0b', // Amber
  C: '#3b82f6', // Blue
  N: '#9ca3af', // Gray
};

// ============================
// UTILITY FUNCTIONS
// ============================
const calculateGCContent = (sequence: string): number => {
  const gc = (sequence.match(/[GC]/gi) || []).length;
  return (gc / sequence.length) * 100;
};

const parseSequenceFile = (content: string, filename: string): SequenceData[] => {
  const sequences: SequenceData[] = [];
  const isFastq = filename.toLowerCase().endsWith('.fastq') || filename.toLowerCase().endsWith('.fq');

  if (isFastq) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length - 3; i += 4) {
      const header = lines[i].substring(1);
      const sequence = lines[i + 1].trim();
      const quality = lines[i + 3]?.trim();
      if (header && sequence) {
        const qualityScores = quality ? quality.split('').map(c => c.charCodeAt(0) - 33) : [];
        const avgQuality = qualityScores.length > 0
          ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
          : undefined;
        sequences.push({
          id: `seq_${sequences.length + 1}`,
          header,
          sequence,
          quality,
          length: sequence.length,
          gcContent: calculateGCContent(sequence),
          avgQuality,
        });
      }
    }
  } else {
    // FASTA format
    const entries = content.split('>').filter(Boolean);
    entries.forEach((entry, idx) => {
      const lines = entry.split('\n');
      const header = lines[0].trim();
      const sequence = lines.slice(1).join('').replace(/\s/g, '');
      if (header && sequence) {
        sequences.push({
          id: `seq_${idx + 1}`,
          header,
          sequence,
          length: sequence.length,
          gcContent: calculateGCContent(sequence),
        });
      }
    });
  }
  return sequences;
};

const calculateBiodiversity = (detections: any[]): BiodiversityMetrics => {
  const speciesCounts: Record<string, number> = {};
  detections.forEach(d => {
    speciesCounts[d._id] = (speciesCounts[d._id] || 0) + d.count;
  });

  const counts = Object.values(speciesCounts);
  const total = counts.reduce((a, b) => a + b, 0);
  const S = counts.length; // Species richness

  // Shannon Index: H' = -Σ(pi * ln(pi))
  const shannonIndex = counts.reduce((sum, count) => {
    const p = count / total;
    return sum - (p > 0 ? p * Math.log(p) : 0);
  }, 0);

  // Simpson Index: D = 1 - Σ(pi^2)
  const simpsonIndex = 1 - counts.reduce((sum, count) => {
    const p = count / total;
    return sum + p * p;
  }, 0);

  // Pielou's Evenness: J = H' / ln(S)
  const evenness = S > 1 ? shannonIndex / Math.log(S) : 0;

  // Dominance: λ = Σ(pi^2)
  const dominance = counts.reduce((sum, count) => {
    const p = count / total;
    return sum + p * p;
  }, 0);

  // Chao1 estimator (simplified)
  const singletons = counts.filter(c => c === 1).length;
  const doubletons = counts.filter(c => c === 2).length;
  const chao1 = doubletons > 0
    ? S + (singletons * singletons) / (2 * doubletons)
    : S + (singletons * (singletons - 1)) / 2;

  return {
    shannonIndex,
    simpsonIndex,
    chao1,
    observedSpecies: S,
    evenness,
    dominance,
  };
};

const buildTaxonomyTree = (samples: any[]): TaxonomyNode => {
  // Build a hierarchical taxonomy tree from samples
  const root: TaxonomyNode = { name: 'All Taxa', rank: 'Root', count: 0, confidence: 1, children: [] };

  // Group by taxonomy (simulated based on species names)
  const speciesGroups: Record<string, any[]> = {};
  samples.forEach(sample => {
    const species = sample.detected_species;
    if (!speciesGroups[species]) speciesGroups[species] = [];
    speciesGroups[species].push(sample);
  });

  // Simulate taxonomy hierarchy based on species names
  const taxonomyMap: Record<string, TaxonomyNode> = {};

  Object.entries(speciesGroups).forEach(([species, sampleList]) => {
    // Extract genus from species name (first word)
    const parts = species.split(' ');
    const genus = parts[0] || 'Unknown';

    // Simulated higher taxonomy based on common patterns
    let family = 'Unknown Family';
    let order = 'Unknown Order';
    let classRank = 'Actinopterygii'; // Default to ray-finned fish
    let phylum = 'Chordata';
    let kingdom = 'Animalia';

    // Common fish family patterns
    if (genus.endsWith('us') || genus.endsWith('a')) {
      if (['Thunnus', 'Scomber', 'Katsuwonus'].includes(genus)) {
        family = 'Scombridae'; order = 'Scombriformes';
      } else if (['Carcharodon', 'Galeocerdo', 'Prionace'].includes(genus)) {
        family = 'Lamnidae'; order = 'Lamniformes'; classRank = 'Chondrichthyes';
      } else if (['Coryphaena'].includes(genus)) {
        family = 'Coryphaenidae'; order = 'Carangiformes';
      } else if (['Hippocampus'].includes(genus)) {
        family = 'Syngnathidae'; order = 'Syngnathiformes';
      } else if (['Tursiops', 'Delphinus', 'Orcinus'].includes(genus)) {
        family = 'Delphinidae'; order = 'Cetacea'; classRank = 'Mammalia';
      }
    }

    const count = sampleList.length;
    const avgConfidence = sampleList.reduce((sum: number, s: any) => sum + s.confidence, 0) / count;

    // Build hierarchy
    if (!taxonomyMap[kingdom]) {
      taxonomyMap[kingdom] = { name: kingdom, rank: 'Kingdom', count: 0, confidence: 0, children: [], color: RANK_COLORS.Kingdom };
      root.children!.push(taxonomyMap[kingdom]);
    }
    taxonomyMap[kingdom].count += count;

    const phylumKey = `${kingdom}>${phylum}`;
    if (!taxonomyMap[phylumKey]) {
      taxonomyMap[phylumKey] = { name: phylum, rank: 'Phylum', count: 0, confidence: 0, children: [], color: RANK_COLORS.Phylum };
      taxonomyMap[kingdom].children!.push(taxonomyMap[phylumKey]);
    }
    taxonomyMap[phylumKey].count += count;

    const classKey = `${phylumKey}>${classRank}`;
    if (!taxonomyMap[classKey]) {
      taxonomyMap[classKey] = { name: classRank, rank: 'Class', count: 0, confidence: 0, children: [], color: RANK_COLORS.Class };
      taxonomyMap[phylumKey].children!.push(taxonomyMap[classKey]);
    }
    taxonomyMap[classKey].count += count;

    const orderKey = `${classKey}>${order}`;
    if (!taxonomyMap[orderKey]) {
      taxonomyMap[orderKey] = { name: order, rank: 'Order', count: 0, confidence: 0, children: [], color: RANK_COLORS.Order };
      taxonomyMap[classKey].children!.push(taxonomyMap[orderKey]);
    }
    taxonomyMap[orderKey].count += count;

    const familyKey = `${orderKey}>${family}`;
    if (!taxonomyMap[familyKey]) {
      taxonomyMap[familyKey] = { name: family, rank: 'Family', count: 0, confidence: 0, children: [], color: RANK_COLORS.Family };
      taxonomyMap[orderKey].children!.push(taxonomyMap[familyKey]);
    }
    taxonomyMap[familyKey].count += count;

    const genusKey = `${familyKey}>${genus}`;
    if (!taxonomyMap[genusKey]) {
      taxonomyMap[genusKey] = { name: genus, rank: 'Genus', count: 0, confidence: 0, children: [], color: RANK_COLORS.Genus };
      taxonomyMap[familyKey].children!.push(taxonomyMap[genusKey]);
    }
    taxonomyMap[genusKey].count += count;

    const speciesKey = `${genusKey}>${species}`;
    if (!taxonomyMap[speciesKey]) {
      taxonomyMap[speciesKey] = { name: species, rank: 'Species', count, confidence: avgConfidence, children: [], color: RANK_COLORS.Species };
      taxonomyMap[genusKey].children!.push(taxonomyMap[speciesKey]);
    }
  });

  root.count = samples.length;
  return root;
};

// ============================
// SUB-COMPONENTS
// ============================

// Sequence Viewer Component
const SequenceViewer: React.FC<{
  sequences: SequenceData[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}> = ({ sequences, selectedIndex, onSelect }) => {
  const [showQuality, setShowQuality] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<'colored' | 'plain'>('colored');

  const selectedSeq = sequences[selectedIndex];
  if (!selectedSeq) return null;

  const renderSequence = (seq: string) => {
    if (viewMode === 'plain') {
      return <span className="font-mono text-deep-800">{seq}</span>;
    }
    return seq.split('').map((char, i) => (
      <span
        key={i}
        className="font-mono font-medium"
        style={{ color: NUCLEOTIDE_COLORS[char.toUpperCase()] || NUCLEOTIDE_COLORS.N }}
      >
        {char}
      </span>
    ));
  };

  const renderQuality = (qual: string) => {
    return qual.split('').map((char, i) => {
      const score = char.charCodeAt(0) - 33;
      const intensity = Math.min(score / 40, 1);
      return (
        <span
          key={i}
          className="font-mono text-xs"
          style={{
            backgroundColor: `rgba(34, 197, 94, ${intensity})`,
            color: intensity > 0.5 ? 'white' : 'inherit'
          }}
          title={`Q${score}`}
        >
          {char}
        </span>
      );
    });
  };

  return (
    <div className="space-y-4">
      {/* Sequence List */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {sequences.slice(0, 20).map((seq, idx) => (
          <button
            key={seq.id}
            onClick={() => onSelect(idx)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
              selectedIndex === idx
                ? "bg-ocean-500 text-white"
                : "bg-gray-100 text-deep-600 hover:bg-gray-200"
            )}
          >
            Seq {idx + 1} ({seq.length}bp)
          </button>
        ))}
        {sequences.length > 20 && (
          <span className="px-3 py-1.5 text-xs text-deep-400">
            +{sequences.length - 20} more
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'colored' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('colored')}
          >
            <Layers className="w-3 h-3 mr-1" />
            Colored
          </Button>
          <Button
            variant={viewMode === 'plain' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('plain')}
          >
            <FileCode className="w-3 h-3 mr-1" />
            Plain
          </Button>
          {selectedSeq.quality && (
            <Button
              variant={showQuality ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowQuality(!showQuality)}
            >
              <Activity className="w-3 h-3 mr-1" />
              Quality
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs text-deep-500 w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setZoom(Math.min(2, zoom + 0.25))}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(selectedSeq.sequence)}>
            <Copy className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Sequence Header */}
      <div className="p-3 bg-gray-50 rounded-lg">
        <p className="text-xs text-deep-500 mb-1">Header</p>
        <p className="font-mono text-sm text-deep-700 break-all">{selectedSeq.header}</p>
      </div>

      {/* Sequence Display */}
      <div
        className="p-4 bg-gray-50 rounded-lg overflow-auto max-h-64"
        style={{ fontSize: `${12 * zoom}px` }}
      >
        <div className="break-all leading-relaxed">
          {renderSequence(selectedSeq.sequence)}
        </div>
        {showQuality && selectedSeq.quality && (
          <div className="mt-2 pt-2 border-t border-gray-200 break-all leading-relaxed">
            {renderQuality(selectedSeq.quality)}
          </div>
        )}
      </div>

      {/* Sequence Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-2 bg-gray-50 rounded-lg text-center">
          <p className="text-lg font-bold text-deep-900">{selectedSeq.length}</p>
          <p className="text-xs text-deep-500">Length (bp)</p>
        </div>
        <div className="p-2 bg-gray-50 rounded-lg text-center">
          <p className="text-lg font-bold text-deep-900">{selectedSeq.gcContent.toFixed(1)}%</p>
          <p className="text-xs text-deep-500">GC Content</p>
        </div>
        {selectedSeq.avgQuality !== undefined && (
          <>
            <div className="p-2 bg-gray-50 rounded-lg text-center">
              <p className="text-lg font-bold text-deep-900">Q{selectedSeq.avgQuality.toFixed(0)}</p>
              <p className="text-xs text-deep-500">Avg Quality</p>
            </div>
            <div className="p-2 bg-gray-50 rounded-lg text-center">
              <p className="text-lg font-bold text-green-600">
                {selectedSeq.avgQuality >= 30 ? '✓' : selectedSeq.avgQuality >= 20 ? '~' : '✗'}
              </p>
              <p className="text-xs text-deep-500">Pass QC</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Taxonomy Tree Component
const TaxonomyTreeView: React.FC<{
  node: TaxonomyNode;
  depth?: number;
  expanded?: Set<string>;
  onToggle?: (name: string) => void;
}> = ({ node, depth = 0, expanded, onToggle }) => {
  const [localExpanded, setLocalExpanded] = useState(depth < 2);
  const isExpanded = expanded ? expanded.has(node.name) : localExpanded;
  const hasChildren = node.children && node.children.length > 0;

  const handleToggle = () => {
    if (onToggle) {
      onToggle(node.name);
    } else {
      setLocalExpanded(!localExpanded);
    }
  };

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors",
          "hover:bg-gray-100"
        )}
        onClick={handleToggle}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="w-4 h-4 text-deep-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-deep-400" />
          )
        ) : (
          <div className="w-4" />
        )}
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: node.color || RANK_COLORS[node.rank] || '#9ca3af' }}
        />
        <span className={cn(
          "text-sm",
          node.rank === 'Species' ? 'italic text-deep-800' : 'text-deep-700'
        )}>
          {node.name}
        </span>
        <Badge variant="outline" className="text-xs ml-auto">
          {node.count}
        </Badge>
      </div>
      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child, idx) => (
            <TaxonomyTreeView
              key={`${child.name}-${idx}`}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Biodiversity Metrics Component
const BiodiversityDashboard: React.FC<{
  metrics: BiodiversityMetrics;
  detections: any[];
}> = ({ metrics, detections }) => {
  return (
    <div className="space-y-4">
      {/* Main Indices */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 bg-gradient-to-br from-ocean-50 to-ocean-100 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-ocean-600" />
            <span className="text-sm font-medium text-ocean-800">Shannon Index (H')</span>
          </div>
          <p className="text-3xl font-bold text-ocean-900">{metrics.shannonIndex.toFixed(3)}</p>
          <p className="text-xs text-ocean-600 mt-1">
            {metrics.shannonIndex > 3 ? 'High diversity' :
              metrics.shannonIndex > 2 ? 'Moderate diversity' : 'Low diversity'}
          </p>
        </div>

        <div className="p-4 bg-gradient-to-br from-marine-50 to-marine-100 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <PieChart className="w-5 h-5 text-marine-600" />
            <span className="text-sm font-medium text-marine-800">Simpson Index (1-D)</span>
          </div>
          <p className="text-3xl font-bold text-marine-900">{metrics.simpsonIndex.toFixed(3)}</p>
          <p className="text-xs text-marine-600 mt-1">
            {metrics.simpsonIndex > 0.8 ? 'Very even' :
              metrics.simpsonIndex > 0.5 ? 'Moderately even' : 'Dominated by few'}
          </p>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-4 gap-2">
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-2xl font-bold text-deep-900">{metrics.observedSpecies}</p>
          <p className="text-xs text-deep-500">Observed (S)</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-2xl font-bold text-deep-900">{metrics.chao1.toFixed(0)}</p>
          <p className="text-xs text-deep-500">Chao1 Est.</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-2xl font-bold text-deep-900">{metrics.evenness.toFixed(3)}</p>
          <p className="text-xs text-deep-500">Evenness (J)</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-2xl font-bold text-deep-900">{metrics.dominance.toFixed(3)}</p>
          <p className="text-xs text-deep-500">Dominance (λ)</p>
        </div>
      </div>

      {/* Rank Abundance */}
      <div>
        <h4 className="text-sm font-semibold text-deep-700 mb-2">Rank Abundance Distribution</h4>
        <div className="h-32 flex items-end gap-1">
          {detections.slice(0, 15).map((d: any, idx: number) => {
            const maxCount = Math.max(...detections.slice(0, 15).map((x: any) => x.count));
            const height = (d.count / maxCount) * 100;
            return (
              <div
                key={d._id}
                className="flex-1 bg-ocean-400 rounded-t hover:bg-ocean-500 transition-colors cursor-pointer group relative"
                style={{ height: `${height}%` }}
                title={`${d._id}: ${d.count}`}
              >
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-deep-800 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {d.count}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-deep-400 mt-1">
          <span>Most abundant</span>
          <span>→</span>
          <span>Least abundant</span>
        </div>
      </div>

      {/* Interpretation */}
      <div className="p-3 bg-ocean-50 rounded-lg">
        <div className="flex gap-2">
          <Info className="w-4 h-4 text-ocean-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-ocean-800">
            <p className="font-medium mb-1">Interpretation</p>
            <p>
              {metrics.shannonIndex > 2.5 && metrics.simpsonIndex > 0.7
                ? "This community shows high biodiversity with good species evenness, indicating a healthy ecosystem."
                : metrics.shannonIndex > 1.5
                  ? "Moderate biodiversity detected. Some species may be more dominant than others."
                  : "Low biodiversity or high dominance by few species. This could indicate environmental stress or early successional stage."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Quality Metrics Dashboard Component
const QualityDashboard: React.FC<{
  sequences: SequenceData[];
}> = ({ sequences }) => {
  const metrics = useMemo(() => {
    if (sequences.length === 0) return null;

    const withQuality = sequences.filter(s => s.avgQuality !== undefined);
    const avgQScore = withQuality.length > 0
      ? withQuality.reduce((sum, s) => sum + (s.avgQuality || 0), 0) / withQuality.length
      : 0;

    const avgGC = sequences.reduce((sum, s) => sum + s.gcContent, 0) / sequences.length;
    const avgLength = sequences.reduce((sum, s) => sum + s.length, 0) / sequences.length;
    const passedQC = withQuality.filter(s => (s.avgQuality || 0) >= 20).length;

    // Length distribution
    const lengthBins = [
      { range: '<100', min: 0, max: 100, count: 0 },
      { range: '100-200', min: 100, max: 200, count: 0 },
      { range: '200-300', min: 200, max: 300, count: 0 },
      { range: '300-500', min: 300, max: 500, count: 0 },
      { range: '>500', min: 500, max: Infinity, count: 0 },
    ];
    sequences.forEach(s => {
      const bin = lengthBins.find(b => s.length >= b.min && s.length < b.max);
      if (bin) bin.count++;
    });

    return {
      totalReads: sequences.length,
      passedQC,
      avgQScore,
      gcContent: avgGC,
      avgLength,
      lengthDistribution: lengthBins,
      qualityDistribution: [], // Would need per-base quality
    };
  }, [sequences]);

  if (!metrics) {
    return (
      <div className="text-center py-8">
        <FlaskConical className="w-12 h-12 text-deep-300 mx-auto mb-2" />
        <p className="text-deep-500">Upload sequences to view quality metrics</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-5 gap-3">
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xl font-bold text-deep-900">{metrics.totalReads.toLocaleString()}</p>
          <p className="text-xs text-deep-500">Total Reads</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xl font-bold text-green-600">{metrics.passedQC.toLocaleString()}</p>
          <p className="text-xs text-deep-500">Passed QC</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xl font-bold text-deep-900">Q{metrics.avgQScore.toFixed(0)}</p>
          <p className="text-xs text-deep-500">Avg Quality</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xl font-bold text-deep-900">{metrics.gcContent.toFixed(1)}%</p>
          <p className="text-xs text-deep-500">GC Content</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-xl font-bold text-deep-900">{metrics.avgLength.toFixed(0)}</p>
          <p className="text-xs text-deep-500">Avg Length</p>
        </div>
      </div>

      {/* Length Distribution */}
      <div>
        <h4 className="text-sm font-semibold text-deep-700 mb-2">Read Length Distribution</h4>
        <div className="space-y-2">
          {metrics.lengthDistribution.map(bin => {
            const maxCount = Math.max(...metrics.lengthDistribution.map(b => b.count));
            const width = maxCount > 0 ? (bin.count / maxCount) * 100 : 0;
            return (
              <div key={bin.range} className="flex items-center gap-2">
                <span className="text-xs text-deep-500 w-16">{bin.range}bp</span>
                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-ocean-400 rounded-full transition-all"
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span className="text-xs text-deep-600 w-12 text-right">{bin.count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* QC Pass Rate */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-deep-700">QC Pass Rate</span>
          <span className="text-sm font-bold text-deep-900">
            {((metrics.passedQC / metrics.totalReads) * 100).toFixed(1)}%
          </span>
        </div>
        <Progress value={(metrics.passedQC / metrics.totalReads) * 100} className="h-2" />
      </div>
    </div>
  );
};

// Processing Pipeline Component
const ProcessingPipeline: React.FC<{
  steps: ProcessingStep[];
  currentStep: number;
  isRunning: boolean;
}> = ({ steps, currentStep, isRunning }) => {
  return (
    <div className="space-y-3">
      {steps.map((step, idx) => (
        <div
          key={step.name}
          className={cn(
            "flex items-center gap-4 p-3 rounded-lg transition-all",
            idx === currentStep && isRunning
              ? "bg-ocean-50 border border-ocean-200"
              : step.status === 'completed'
                ? "bg-green-50"
                : step.status === 'error'
                  ? "bg-red-50"
                  : "bg-gray-50"
          )}
        >
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center",
            idx === currentStep && isRunning
              ? "bg-ocean-500"
              : step.status === 'completed'
                ? "bg-green-500"
                : step.status === 'error'
                  ? "bg-red-500"
                  : "bg-gray-300"
          )}>
            {idx === currentStep && isRunning ? (
              <Loader className="w-4 h-4 animate-spin text-white" />
            ) : step.status === 'completed' ? (
              <CheckCircle2 className="w-4 h-4 text-white" />
            ) : step.status === 'error' ? (
              <XCircle className="w-4 h-4 text-white" />
            ) : (
              <span className="text-xs font-bold text-white">{idx + 1}</span>
            )}
          </div>
          <div className="flex-1">
            <p className={cn(
              "font-medium",
              idx === currentStep && isRunning
                ? "text-ocean-900"
                : step.status === 'completed'
                  ? "text-green-900"
                  : "text-deep-700"
            )}>
              {step.name}
            </p>
            <p className="text-xs text-deep-500">{step.desc}</p>
            {step.details && (
              <p className="text-xs text-deep-400 mt-1">{step.details}</p>
            )}
          </div>
          {idx === currentStep && isRunning && step.progress !== undefined && (
            <div className="w-24">
              <Progress value={step.progress} className="h-1" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ============================
// MAIN COMPONENT
// ============================
export default function EdnaManager() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UI State
  const [selectedSample, setSelectedSample] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'samples' | 'upload' | 'taxonomy' | 'biodiversity' | 'quality'>('samples');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Upload & Processing State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedSequences, setUploadedSequences] = useState<SequenceData[]>([]);
  const [selectedSeqIndex, setSelectedSeqIndex] = useState(0);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>(PIPELINE_STEPS);
  const [currentProcessingStep, setCurrentProcessingStep] = useState(-1);
  const [isProcessing, setIsProcessing] = useState(false);

  // Expanded state for taxonomy tree
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['All Taxa', 'Animalia']));

  // Fetch eDNA samples
  const { data: samplesData, isLoading: samplesLoading, refetch } = useQuery({
    queryKey: ['edna-samples', searchQuery, methodFilter],
    queryFn: () => ednaService.getAll({
      species: searchQuery || undefined,
      method: methodFilter || undefined,
      limit: 100
    }),
  });

  // Fetch eDNA statistics
  const { data: stats } = useQuery({
    queryKey: ['edna-stats'],
    queryFn: () => ednaService.getStats(),
  });

  // Fetch detections by species
  const { data: detections } = useQuery({
    queryKey: ['edna-detections'],
    queryFn: () => ednaService.getDetectionsBySpecies(),
  });

  // Fetch available methods
  const { data: methods } = useQuery({
    queryKey: ['edna-methods'],
    queryFn: () => ednaService.getMethods(),
  });

  const samples = samplesData?.data || [];

  // Computed values
  const taxonomyTree = useMemo(() => buildTaxonomyTree(samples), [samples]);
  const biodiversityMetrics = useMemo(() =>
    detections && detections.length > 0 ? calculateBiodiversity(detections) : null,
    [detections]
  );

  // File upload handler
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const sequences = parseSequenceFile(content, file.name);
        setUploadedSequences(sequences);
        setSelectedSeqIndex(0);
        setActiveTab('upload');
      };
      reader.readAsText(file);
    }
  }, []);

  // Simulate processing pipeline
  const startProcessing = useCallback(async () => {
    if (uploadedSequences.length === 0) return;

    setIsProcessing(true);
    const steps: ProcessingStep[] = PIPELINE_STEPS.map(s => ({ ...s, status: 'pending' as ProcessingStep['status'] }));
    setProcessingSteps(steps);

    for (let i = 0; i < steps.length; i++) {
      setCurrentProcessingStep(i);
      steps[i] = { ...steps[i], status: 'running' };
      setProcessingSteps([...steps]);

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

      steps[i] = { ...steps[i], status: 'completed', details: `Processed ${uploadedSequences.length} sequences` };
      setProcessingSteps([...steps]);
    }

    setCurrentProcessingStep(-1);
    setIsProcessing(false);
    queryClient.invalidateQueries({ queryKey: ['edna-samples'] });
  }, [uploadedSequences, queryClient]);

  // Toggle taxonomy node
  const toggleNode = useCallback((name: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  // Export functions
  const exportToCSV = useCallback(() => {
    if (samples.length === 0) return;
    const headers = ['Species', 'Confidence', 'Method', 'Reads', 'Region', 'Date', 'Latitude', 'Longitude'];
    const rows = samples.map((s: any) => [
      s.detected_species,
      s.confidence,
      s.method,
      s.reads,
      s.region,
      s.sampleDate,
      s.latitude,
      s.longitude
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edna_samples.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [samples]);

  const exportToFASTA = useCallback(() => {
    if (uploadedSequences.length === 0) return;
    const fasta = uploadedSequences.map(s => `>${s.header}\n${s.sequence}`).join('\n');
    const blob = new Blob([fasta], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sequences.fasta';
    a.click();
    URL.revokeObjectURL(url);
  }, [uploadedSequences]);

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.9) {
      return <Badge variant="success" dot><CheckCircle2 className="w-3 h-3 mr-1" />High ({(confidence * 100).toFixed(1)}%)</Badge>;
    } else if (confidence >= 0.7) {
      return <Badge variant="default" dot>Medium ({(confidence * 100).toFixed(1)}%)</Badge>;
    } else {
      return <Badge variant="secondary" dot>Low ({(confidence * 100).toFixed(1)}%)</Badge>;
    }
  };

  const selectedSampleData = samples.find((s: any) => s.id === selectedSample);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Dna className="w-5 h-5 text-ocean-500" />
            <span className="text-sm font-medium text-ocean-600 dark:text-ocean-400">Bioinformatics</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-deep-900 dark:text-white">eDNA Manager</h1>
          <p className="text-deep-500 dark:text-gray-400 mt-1">
            Process and analyze environmental DNA sequences for biodiversity monitoring
          </p>
        </div>
        <div className="flex gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".fasta,.fa,.fastq,.fq"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="premium" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            Upload Sequences
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="default" className="p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-ocean-50/60">
              <FileText className="w-6 h-6 text-ocean-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-deep-900">{stats?.totalSamples || 0}</p>
              <p className="text-sm text-deep-500">Total Samples</p>
            </div>
          </div>
        </Card>
        <Card variant="default" className="p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-marine-50/60">
              <Dna className="w-6 h-6 text-marine-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-deep-900">{stats?.uniqueSpecies || 0}</p>
              <p className="text-sm text-deep-500">Unique Species</p>
            </div>
          </div>
        </Card>
        <Card variant="default" className="p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-coral-50/60">
              <Database className="w-6 h-6 text-coral-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-deep-900">
                {stats?.methodStats?.length || 0}
              </p>
              <p className="text-sm text-deep-500">Analysis Methods</p>
            </div>
          </div>
        </Card>
        <Card variant="default" className="p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-50/60">
              <MapPin className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-deep-900">
                {stats?.regionStats?.length || 0}
              </p>
              <p className="text-sm text-deep-500">Regions Sampled</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 pb-2 overflow-x-auto">
        {[
          { id: 'samples', label: 'Sample Browser', icon: List },
          { id: 'upload', label: 'Sequence Upload', icon: Upload },
          { id: 'taxonomy', label: 'Taxonomy', icon: GitBranch },
          { id: 'biodiversity', label: 'Biodiversity', icon: TrendingUp },
          { id: 'quality', label: 'Quality Metrics', icon: Activity },
        ].map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab(tab.id as any)}
            className="whitespace-nowrap"
          >
            <tab.icon className="w-4 h-4 mr-2" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'samples' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Samples List */}
          <Card variant="default" className="xl:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>eDNA Samples</CardTitle>
                  <CardDescription>Environmental DNA sequence detections</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search species..."
                    icon={<Search className="w-4 h-4" />}
                    className="w-48"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <Select
                    className="w-32"
                    value={methodFilter}
                    onChange={(e) => setMethodFilter(e.target.value)}
                  >
                    <option value="">All Methods</option>
                    {methods?.map((method: string) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </Select>
                  <div className="flex border rounded-lg overflow-hidden">
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      className="rounded-none"
                      onClick={() => setViewMode('list')}
                    >
                      <List className="w-4 h-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'ghost'}
                      size="sm"
                      className="rounded-none"
                      onClick={() => setViewMode('grid')}
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {samplesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader className="w-8 h-8 animate-spin text-ocean-500" />
                </div>
              ) : samples.length === 0 ? (
                <div className="text-center py-12">
                  <Dna className="w-12 h-12 text-deep-300 mx-auto mb-3" />
                  <p className="text-deep-500">No eDNA samples found</p>
                  <p className="text-sm text-deep-400 mt-1">Upload sequences to get started</p>
                </div>
              ) : viewMode === 'list' ? (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {samples.map((sample: any) => (
                    <div
                      key={sample.id}
                      onClick={() => setSelectedSample(sample.id)}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all",
                        selectedSample === sample.id
                          ? "border-ocean-300 bg-ocean-50"
                          : "border-gray-100 bg-gray-50 hover:bg-gray-100"
                      )}
                    >
                      <div className="p-3 rounded-xl bg-ocean-50/60">
                        <Dna className="w-5 h-5 text-ocean-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-deep-900 italic">{sample.detected_species}</p>
                          {getConfidenceBadge(sample.confidence)}
                        </div>
                        <div className="flex items-center gap-4 mt-1 flex-wrap">
                          <span className="text-xs text-deep-500">{sample.method}</span>
                          <span className="text-xs text-deep-500">{sample.reads?.toLocaleString()} reads</span>
                          <span className="text-xs text-deep-500">{sample.region}</span>
                          <span className="text-xs text-deep-400">
                            {new Date(sample.sampleDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-deep-300" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto">
                  {samples.map((sample: any) => (
                    <div
                      key={sample.id}
                      onClick={() => setSelectedSample(sample.id)}
                      className={cn(
                        "p-4 rounded-xl border cursor-pointer transition-all",
                        selectedSample === sample.id
                          ? "border-ocean-300 bg-ocean-50"
                          : "border-gray-100 bg-gray-50 hover:bg-gray-100"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Dna className="w-4 h-4 text-ocean-400" />
                        {getConfidenceBadge(sample.confidence)}
                      </div>
                      <p className="font-medium text-deep-900 italic text-sm truncate">
                        {sample.detected_species}
                      </p>
                      <div className="mt-2 space-y-1 text-xs text-deep-500">
                        <p>{sample.method}</p>
                        <p>{sample.reads?.toLocaleString()} reads</p>
                        <p>{sample.region}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Side Panel */}
          <div className="space-y-4">
            {/* Selected Sample Details */}
            {selectedSampleData ? (
              <Card variant="premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-ocean-500" />
                    Sample Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-deep-500">Species</p>
                      <p className="font-medium text-deep-900 italic">{selectedSampleData.detected_species}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-deep-500">Confidence</p>
                        <p className="font-medium text-deep-900">{(selectedSampleData.confidence * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-deep-500">Method</p>
                        <p className="font-medium text-deep-900">{selectedSampleData.method}</p>
                      </div>
                      <div>
                        <p className="text-xs text-deep-500">Reads</p>
                        <p className="font-medium text-deep-900">{selectedSampleData.reads?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-deep-500">Depth</p>
                        <p className="font-medium text-deep-900">{selectedSampleData.depth}m</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-deep-500">Location</p>
                      <p className="font-medium text-deep-900">
                        {selectedSampleData.latitude?.toFixed(4)}, {selectedSampleData.longitude?.toFixed(4)}
                      </p>
                      <p className="text-xs text-deep-400">{selectedSampleData.region}</p>
                    </div>
                    <div>
                      <p className="text-xs text-deep-500">Sequence Length</p>
                      <p className="font-medium text-deep-900">{selectedSampleData.length} bp</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card variant="glass">
                <CardContent className="p-6 text-center">
                  <Dna className="w-10 h-10 text-deep-300 mx-auto mb-2" />
                  <p className="text-sm text-deep-500">Select a sample to view details</p>
                </CardContent>
              </Card>
            )}

            {/* Top Detected Species */}
            <Card variant="default">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top Species Detected</CardTitle>
                <CardDescription>Most frequently identified species</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {detections?.slice(0, 5).map((detection: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-ocean-50 flex items-center justify-center">
                        <span className="text-xs font-bold text-ocean-600">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-deep-900 truncate italic">
                          {detection._id}
                        </p>
                        <p className="text-xs text-deep-500">{detection.count} detections</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {(detection.avgConfidence * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  )) || (
                      <p className="text-sm text-deep-400 text-center py-4">No detections yet</p>
                    )}
                </div>
              </CardContent>
            </Card>

            {/* Method Statistics */}
            <Card variant="glass">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <div className="p-2 rounded-lg bg-ocean-50/60">
                    <Database className="w-5 h-5 text-ocean-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-deep-900">Analysis Methods</h4>
                    <div className="mt-2 space-y-1">
                      {stats?.methodStats?.map((method: any) => (
                        <div key={method._id} className="flex justify-between text-xs">
                          <span className="text-deep-600">{method._id}</span>
                          <span className="text-deep-400">{method.count} samples</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" size="sm" onClick={exportToCSV}>
                <Download className="w-4 h-4 mr-1" />
                Export CSV
              </Button>
              <Button variant="outline" className="flex-1" size="sm">
                <BarChart3 className="w-4 h-4 mr-1" />
                Report
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'upload' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Upload Panel */}
          <Card variant="default" className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-ocean-500" />
                Sequence Upload & Processing
              </CardTitle>
              <CardDescription>
                Upload FASTA or FASTQ files for analysis through our bioinformatics pipeline
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Drop Zone */}
              {!uploadedFile && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-ocean-200 rounded-xl p-12 text-center cursor-pointer hover:border-ocean-400 hover:bg-ocean-50/50 transition-all"
                >
                  <Upload className="w-12 h-12 text-ocean-300 mx-auto mb-4" />
                  <p className="text-lg font-medium text-deep-700">Drop your sequence file here</p>
                  <p className="text-sm text-deep-500 mt-1">or click to browse</p>
                  <p className="text-xs text-deep-400 mt-4">Supports .fasta, .fa, .fastq, .fq files</p>
                </div>
              )}

              {/* Uploaded File Info */}
              {uploadedFile && (
                <div className="p-4 bg-ocean-50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-ocean-100 rounded-lg">
                        <FileCode className="w-6 h-6 text-ocean-600" />
                      </div>
                      <div>
                        <p className="font-medium text-deep-900">{uploadedFile.name}</p>
                        <p className="text-xs text-deep-500">
                          {(uploadedFile.size / 1024).toFixed(1)} KB • {uploadedSequences.length} sequences
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setUploadedFile(null);
                          setUploadedSequences([]);
                        }}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Sequence Viewer */}
              {uploadedSequences.length > 0 && (
                <Card variant="glass">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Eye className="w-4 h-4 text-ocean-500" />
                      Sequence Viewer
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SequenceViewer
                      sequences={uploadedSequences}
                      selectedIndex={selectedSeqIndex}
                      onSelect={setSelectedSeqIndex}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Processing Pipeline */}
              {uploadedSequences.length > 0 && (
                <Card variant="glass">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Play className="w-4 h-4 text-ocean-500" />
                        Processing Pipeline
                      </CardTitle>
                      <Button
                        variant="premium"
                        size="sm"
                        onClick={startProcessing}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <>
                            <Loader className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            Start Analysis
                          </>
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ProcessingPipeline
                      steps={processingSteps}
                      currentStep={currentProcessingStep}
                      isRunning={isProcessing}
                    />
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>

          {/* Quality Preview Side Panel */}
          <div className="space-y-4">
            <Card variant="default">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 text-ocean-500" />
                  Upload Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                {uploadedSequences.length > 0 ? (
                  <QualityDashboard sequences={uploadedSequences} />
                ) : (
                  <div className="text-center py-8">
                    <Upload className="w-10 h-10 text-deep-300 mx-auto mb-2" />
                    <p className="text-sm text-deep-500">Upload a file to see quality metrics</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {uploadedSequences.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" size="sm" onClick={exportToFASTA}>
                  <Download className="w-4 h-4 mr-1" />
                  Export FASTA
                </Button>
                <Button variant="outline" className="flex-1" size="sm">
                  <Share2 className="w-4 h-4 mr-1" />
                  Share
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'taxonomy' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Taxonomy Tree */}
          <Card variant="default" className="xl:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-ocean-500" />
                    Taxonomic Classification
                  </CardTitle>
                  <CardDescription>Hierarchical view of detected species</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedNodes(new Set(['All Taxa', 'Animalia', 'Chordata']))}
                  >
                    <Maximize2 className="w-4 h-4 mr-1" />
                    Expand
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedNodes(new Set(['All Taxa']))}
                  >
                    <Minimize2 className="w-4 h-4 mr-1" />
                    Collapse
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {samples.length > 0 ? (
                <div className="max-h-[600px] overflow-y-auto">
                  <TaxonomyTreeView
                    node={taxonomyTree}
                    expanded={expandedNodes}
                    onToggle={toggleNode}
                  />
                </div>
              ) : (
                <div className="text-center py-12">
                  <TreeDeciduous className="w-12 h-12 text-deep-300 mx-auto mb-3" />
                  <p className="text-deep-500">No taxonomy data available</p>
                  <p className="text-sm text-deep-400 mt-1">Upload and process samples first</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Taxonomy Stats Side Panel */}
          <div className="space-y-4">
            <Card variant="premium">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Network className="w-4 h-4 text-ocean-500" />
                  Taxonomy Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {TAXONOMY_RANKS.map(rank => {
                    const count = rank === 'Species'
                      ? (stats?.uniqueSpecies || 0)
                      : Math.ceil((stats?.uniqueSpecies || 0) / (TAXONOMY_RANKS.indexOf(rank) + 1));
                    return (
                      <div key={rank} className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: RANK_COLORS[rank] }}
                        />
                        <span className="text-sm text-deep-700 flex-1">{rank}</span>
                        <Badge variant="outline" className="text-xs">{count}</Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card variant="glass">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <div className="p-2 rounded-lg bg-ocean-50/60">
                    <BookOpen className="w-5 h-5 text-ocean-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-deep-900">Reference Database</h4>
                    <p className="text-xs text-deep-500 mt-1">
                      NCBI GenBank + BOLD Systems
                    </p>
                    <p className="text-xs text-deep-400 mt-0.5">
                      Last updated: {new Date().toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'biodiversity' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Biodiversity Analysis */}
          <Card variant="default" className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-ocean-500" />
                Biodiversity Analysis
              </CardTitle>
              <CardDescription>
                Statistical measures of species diversity and community structure
              </CardDescription>
            </CardHeader>
            <CardContent>
              {biodiversityMetrics && detections ? (
                <BiodiversityDashboard
                  metrics={biodiversityMetrics}
                  detections={detections}
                />
              ) : (
                <div className="text-center py-12">
                  <PieChart className="w-12 h-12 text-deep-300 mx-auto mb-3" />
                  <p className="text-deep-500">No biodiversity data available</p>
                  <p className="text-sm text-deep-400 mt-1">Process samples to calculate metrics</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Biodiversity Reference */}
          <div className="space-y-4">
            <Card variant="glass">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="w-4 h-4 text-ocean-500" />
                  Index Reference
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-deep-800">Shannon Index (H')</p>
                  <p className="text-xs text-deep-500 mt-1">
                    Measures species diversity considering both abundance and evenness.
                    Higher values indicate greater diversity. Typical range: 1.5-3.5
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-deep-800">Simpson Index (1-D)</p>
                  <p className="text-xs text-deep-500 mt-1">
                    Probability that two randomly selected individuals are different species.
                    Range 0-1, higher = more diverse.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-deep-800">Chao1 Estimator</p>
                  <p className="text-xs text-deep-500 mt-1">
                    Estimates total species richness including undetected species based on
                    singleton/doubleton ratios.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-deep-800">Pielou's Evenness (J)</p>
                  <p className="text-xs text-deep-500 mt-1">
                    How evenly individuals are distributed among species.
                    Range 0-1, with 1 being perfectly even.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card variant="default">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-50">
                    <Target className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-deep-900">Conservation Status</h4>
                    <p className="text-xs text-deep-500 mt-0.5">
                      {biodiversityMetrics && biodiversityMetrics.shannonIndex > 2.5
                        ? "Healthy ecosystem diversity"
                        : "Monitor for changes"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'quality' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Quality Metrics */}
          <Card variant="default" className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-ocean-500" />
                Sequence Quality Metrics
              </CardTitle>
              <CardDescription>
                Quality control statistics for uploaded sequences
              </CardDescription>
            </CardHeader>
            <CardContent>
              {uploadedSequences.length > 0 ? (
                <QualityDashboard sequences={uploadedSequences} />
              ) : (
                <div className="text-center py-12">
                  <FlaskConical className="w-12 h-12 text-deep-300 mx-auto mb-3" />
                  <p className="text-deep-500">No sequence data available</p>
                  <p className="text-sm text-deep-400 mt-1">Upload FASTA/FASTQ files to view quality metrics</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Sequences
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quality Reference */}
          <div className="space-y-4">
            <Card variant="glass">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="w-4 h-4 text-ocean-500" />
                  Quality Thresholds
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                  <span className="text-sm text-green-800">Q30+</span>
                  <span className="text-xs text-green-600">High quality</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-yellow-50 rounded-lg">
                  <span className="text-sm text-yellow-800">Q20-Q30</span>
                  <span className="text-xs text-yellow-600">Acceptable</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-red-50 rounded-lg">
                  <span className="text-sm text-red-800">&lt;Q20</span>
                  <span className="text-xs text-red-600">Low quality</span>
                </div>
              </CardContent>
            </Card>

            <Card variant="default">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <div className="p-2 rounded-lg bg-ocean-50/60">
                    <Microscope className="w-5 h-5 text-ocean-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-deep-900">QC Pipeline</h4>
                    <p className="text-xs text-deep-500 mt-1">
                      Fastp + DADA2 for quality filtering and denoising
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card variant="glass">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-deep-900 mb-2">GC Content Guide</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-deep-600">Fish mtDNA</span>
                    <span className="text-deep-400">40-50%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-deep-600">Bacteria 16S</span>
                    <span className="text-deep-400">50-60%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-deep-600">Marine inverts</span>
                    <span className="text-deep-400">35-45%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
