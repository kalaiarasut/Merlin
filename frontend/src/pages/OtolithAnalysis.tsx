import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, AI_SERVICE_URL } from '../services/api';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Microscope } from 'lucide-react';

interface OtolithRecord {
  _id: string;
  sampleId: string;
  speciesId: string;
  speciesName?: string;
  collectionDate: string;
  location?: {
    type: string;
    coordinates: [number, number];
  };
  imageUrl?: string;
  measurements?: {
    length?: number;
    width?: number;
    area?: number;
    perimeter?: number;
  };
  age?: {
    estimated: number;
    confidence: number;
    method: string;
  };
  analysisStatus: string;
  analysisResults?: {
    shape_metrics?: Record<string, number>;
    fourier_descriptors?: number[];
    texture_features?: Record<string, number>;
    classification?: {
      predicted_class: string;
      confidence: number;
      probabilities: Record<string, number>;
    };
    age_estimation?: AgeEstimationResult;
  };
  createdAt: string;
  notes?: string;
}

interface AgeEstimationResult {
  estimated_age: number;
  confidence: number;
  ring_count: number;
  ring_positions: number[];
  method_contributions: Record<string, number>;
  uncertainty_range: [number, number];
  analysis_quality: string;
  preprocessing_applied: string[];
  nucleus_detected: boolean;
  average_ring_spacing: number;
}

interface UploadResponse {
  message: string;
  otolith: OtolithRecord;
}

interface AgeAnalysisResponse {
  success: boolean;
  analysis: AgeEstimationResult;
  record: OtolithRecord;
}

const OtolithAnalysis: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sampleId, setSampleId] = useState('');
  const [speciesId, setSpeciesId] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedOtolith, setSelectedOtolith] = useState<OtolithRecord | null>(null);
  const [ageAnalysisResult, setAgeAnalysisResult] = useState<AgeEstimationResult | null>(null);
  const [analysisMethod, setAnalysisMethod] = useState('ensemble');

  // Shape analysis state
  const [shapeDescriptor, setShapeDescriptor] = useState<any>(null);
  const [similarOtoliths, setSimilarOtoliths] = useState<any[]>([]);
  const [showShapeResults, setShowShapeResults] = useState(false);

  // Available analysis methods
  const analysisMethods = [
    { value: 'ensemble', label: 'Ensemble (Best Accuracy)', description: 'Combines all methods for highest accuracy' },
    { value: 'canny', label: 'Canny Edge Detection', description: 'Classical edge detection, good for clear rings' },
    { value: 'sobel', label: 'Sobel Gradient', description: 'Gradient-based detection, robust to noise' },
    { value: 'laplacian', label: 'Laplacian of Gaussian', description: 'Second derivative method, sensitive to fine details' },
    { value: 'adaptive', label: 'Adaptive Threshold', description: 'Local thresholding, handles uneven lighting' },
    { value: 'radial', label: 'Radial Profile Analysis', description: 'Analyzes intensity along radial lines from nucleus' },
  ];

  // Fetch existing otolith records
  const { data: otolithsData, isLoading: otolithsLoading } = useQuery({
    queryKey: ['otoliths'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: OtolithRecord[] }>('/otoliths');
      return response.data;
    }
  });

  // Fetch species for dropdown
  const { data: speciesData } = useQuery({
    queryKey: ['species'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: any[] }>('/species');
      return response.data;
    }
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData): Promise<UploadResponse> => {
      const response = await apiClient.upload<UploadResponse>('/otoliths/upload', formData);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['otoliths'] });
      resetForm();
    }
  });

  // Analysis mutation
  const analysisMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post<any>(`/otoliths/${id}/analyze`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['otoliths'] });
    }
  });

  // Age estimation mutation
  const ageEstimationMutation = useMutation({
    mutationFn: async ({ file, species, method }: { file: File; species: string; method: string }): Promise<AgeAnalysisResponse> => {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('species', species || 'unknown');
      formData.append('method', method);
      const response = await apiClient.upload<AgeAnalysisResponse>('/otoliths/analyze-age', formData);
      return response;
    },
    onSuccess: (data) => {
      setAgeAnalysisResult(data.analysis);
      queryClient.invalidateQueries({ queryKey: ['otoliths'] });
    }
  });

  // Shape analysis mutation
  const shapeAnalysisMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${AI_SERVICE_URL}/otolith/shape/analyze`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error('Shape analysis failed');
      return response.json();
    },
    onSuccess: (data) => {
      setShapeDescriptor(data.shape_descriptor);
      setShowShapeResults(true);
    }
  });

  // Find similar otoliths mutation
  const findSimilarMutation = useMutation({
    mutationFn: async (descriptor: any) => {
      const response = await fetch(`${AI_SERVICE_URL}/otolith/shape/find-similar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shape_descriptor: descriptor, top_k: 10 })
      });
      if (!response.ok) throw new Error('Similarity search failed');
      return response.json();
    },
    onSuccess: (data) => {
      setSimilarOtoliths(data.matches || []);
    }
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setAgeAnalysisResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.tiff', '.bmp'] },
    maxFiles: 1
  });

  const resetForm = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setSampleId('');
    setSpeciesId('');
    setNotes('');
    setAgeAnalysisResult(null);
  };

  const handleUpload = () => {
    if (!selectedFile || !sampleId) return;

    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('sampleId', sampleId);
    formData.append('speciesId', speciesId);
    formData.append('notes', notes);

    uploadMutation.mutate(formData);
  };

  const handleAnalyze = (otolith: OtolithRecord) => {
    analysisMutation.mutate(otolith._id);
  };

  const handleAgeEstimation = () => {
    if (!selectedFile) return;
    const speciesName = speciesData?.find((s: any) => s._id === speciesId)?.scientificName || 'unknown';
    ageEstimationMutation.mutate({ file: selectedFile, species: speciesName, method: analysisMethod });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'processing': return 'bg-yellow-100 text-yellow-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getQualityColor = (quality: string) => {
    switch (quality?.toLowerCase()) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'moderate': return 'text-yellow-600';
      case 'poor': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-blue-600';
    if (confidence >= 0.4) return 'text-yellow-600';
    return 'text-red-600';
  };

  const otoliths: OtolithRecord[] = otolithsData || [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Microscope className="w-5 h-5 text-ocean-500" />
          <span className="text-sm font-medium text-ocean-600 dark:text-ocean-400">Age Estimation</span>
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white">Otolith Analysis</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Advanced otolith image analysis with state-of-the-art age estimation using multi-algorithm ensemble detection
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle>Upload Otolith Image</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors dark:border-gray-700
                ${isDragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            >
              <input {...getInputProps()} />
              {previewUrl ? (
                <div className="space-y-4">
                  <img
                    src={previewUrl}
                    alt="Otolith preview"
                    className="max-h-64 mx-auto rounded-lg shadow-md"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400">{selectedFile?.name}</p>
                </div>
              ) : (
                <div>
                  <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {isDragActive ? 'Drop the image here' : 'Drag & drop an otolith image, or click to select'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">PNG, JPG, TIFF up to 50MB</p>
                </div>
              )}
            </div>

            {selectedFile && (
              <div className="mt-4 space-y-4">
                <Input
                  placeholder="Sample ID *"
                  value={sampleId}
                  onChange={(e) => setSampleId(e.target.value)}
                />
                <select
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={speciesId}
                  onChange={(e) => setSpeciesId(e.target.value)}
                >
                  <option value="">Select Species (optional)</option>
                  {speciesData?.map((species: any) => (
                    <option key={species._id} value={species._id}>
                      {species.scientificName} ({species.commonName})
                    </option>
                  ))}
                </select>

                {/* Analysis Method Selector */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Analysis Method
                  </label>
                  <select
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-purple-500 bg-gradient-to-r from-purple-50 to-indigo-50"
                    value={analysisMethod}
                    onChange={(e) => setAnalysisMethod(e.target.value)}
                  >
                    {analysisMethods.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">
                    {analysisMethods.find(m => m.value === analysisMethod)?.description}
                  </p>
                </div>

                <textarea
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Notes (optional)"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleUpload}
                    disabled={!sampleId || uploadMutation.isPending}
                    className="flex-1"
                  >
                    {uploadMutation.isPending ? 'Uploading...' : 'Upload & Save'}
                  </Button>
                  <Button
                    onClick={handleAgeEstimation}
                    disabled={ageEstimationMutation.isPending}
                    variant="outline"
                    className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600"
                  >
                    {ageEstimationMutation.isPending ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Analyzing...
                      </span>
                    ) : '🔬 Estimate Age'}
                  </Button>
                </div>

                {/* Shape Analysis Button */}
                <Button
                  onClick={() => selectedFile && shapeAnalysisMutation.mutate(selectedFile)}
                  disabled={shapeAnalysisMutation.isPending || !selectedFile}
                  variant="outline"
                  className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:from-teal-600 hover:to-cyan-600"
                >
                  {shapeAnalysisMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Extracting Shape...
                    </span>
                  ) : '📐 Analyze Shape'}
                </Button>

                <Button variant="outline" onClick={resetForm} className="w-full">
                  Clear
                </Button>
              </div>
            )}

            {uploadMutation.isError && (
              <p className="mt-2 text-sm text-red-600">Upload failed. Please try again.</p>
            )}
            {uploadMutation.isSuccess && (
              <p className="mt-2 text-sm text-green-600">Upload successful!</p>
            )}
          </CardContent>
        </Card>

        {/* Age Estimation Results */}
        <Card className="bg-gradient-to-br from-indigo-50 to-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>🎯</span> Age Estimation Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ageEstimationMutation.isPending && (
              <div className="text-center py-12">
                <div className="animate-pulse space-y-4">
                  <div className="w-16 h-16 mx-auto bg-gradient-to-r from-purple-400 to-indigo-400 rounded-full flex items-center justify-center">
                    <svg className="animate-spin h-8 w-8 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                  <p className="text-indigo-600 font-medium">Running multi-algorithm ensemble analysis...</p>
                  <p className="text-sm text-gray-500">Detecting growth rings using 5 advanced methods</p>
                </div>
              </div>
            )}

            {ageEstimationMutation.isError && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-2xl">❌</span>
                </div>
                <p className="text-red-600 font-medium">Age estimation failed</p>
                <p className="text-sm text-gray-500 mt-2">Please ensure the image is a clear otolith photograph</p>
              </div>
            )}

            {ageAnalysisResult && (
              <div className="space-y-6">
                {/* Main Age Display */}
                <div className="text-center bg-white rounded-xl p-6 shadow-md">
                  <p className="text-sm text-gray-500 uppercase tracking-wide">Estimated Age</p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <span className="text-6xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                      {ageAnalysisResult.estimated_age}
                    </span>
                    <span className="text-2xl text-gray-400">years</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    Range: {ageAnalysisResult.uncertainty_range[0]} - {ageAnalysisResult.uncertainty_range[1]} years
                  </p>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase">Confidence</p>
                    <p className={`text-2xl font-bold ${getConfidenceColor(ageAnalysisResult.confidence)}`}>
                      {(ageAnalysisResult.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase">Rings Detected</p>
                    <p className="text-2xl font-bold text-indigo-600">{ageAnalysisResult.ring_count}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase">Quality</p>
                    <p className={`text-lg font-semibold ${getQualityColor(ageAnalysisResult.analysis_quality)}`}>
                      {ageAnalysisResult.analysis_quality}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase">Avg Ring Spacing</p>
                    <p className="text-lg font-semibold text-gray-700">
                      {ageAnalysisResult.average_ring_spacing?.toFixed(1) || 'N/A'} px
                    </p>
                  </div>
                </div>

                {/* Method Contributions */}
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <p className="text-sm font-medium text-gray-700 mb-3">Algorithm Contributions</p>
                  <div className="space-y-2">
                    {Object.entries(ageAnalysisResult.method_contributions || {}).map(([method, weight]) => (
                      <div key={method} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-24 capitalize">{method.replace('_', ' ')}</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full"
                            style={{ width: `${(weight as number) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 w-12 text-right">
                          {((weight as number) * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Ring Positions Visualization */}
                {ageAnalysisResult.ring_positions && ageAnalysisResult.ring_positions.length > 0 && (
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-sm font-medium text-gray-700 mb-3">Ring Positions (from center)</p>
                    <div className="flex flex-wrap gap-2">
                      {ageAnalysisResult.ring_positions.slice(0, 20).map((pos, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-mono"
                        >
                          {pos.toFixed(0)}px
                        </span>
                      ))}
                      {ageAnalysisResult.ring_positions.length > 20 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs">
                          +{ageAnalysisResult.ring_positions.length - 20} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Preprocessing Info */}
                <div className="text-xs text-gray-500">
                  <p className="font-medium">Preprocessing: {ageAnalysisResult.preprocessing_applied?.join(', ') || 'Standard'}</p>
                  <p className="mt-1">
                    Nucleus detected: {ageAnalysisResult.nucleus_detected ? '✓ Yes' : '✗ No (used image center)'}
                  </p>
                </div>
              </div>
            )}

            {!ageAnalysisResult && !ageEstimationMutation.isPending && !ageEstimationMutation.isError && (
              <div className="text-center py-12 text-gray-500">
                <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-2xl">🔬</span>
                </div>
                <p>Upload an otolith image and click "Estimate Age"</p>
                <p className="text-sm mt-2">Uses 5 detection algorithms for accurate results</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Shape Analysis Results */}
      {showShapeResults && shapeDescriptor && (
        <Card className="mt-6 bg-gradient-to-br from-teal-50 to-cyan-50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>📐</span> Shape Analysis Results
              </span>
              <Button variant="outline" size="sm" onClick={() => setShowShapeResults(false)}>
                Close
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Shape Metrics */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-700">Shape Metrics</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase">Circularity</p>
                    <p className="text-2xl font-bold text-teal-600">
                      {(shapeDescriptor.circularity * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-400">1.0 = perfect circle</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase">Aspect Ratio</p>
                    <p className="text-2xl font-bold text-cyan-600">
                      {shapeDescriptor.aspect_ratio?.toFixed(2) || 'N/A'}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase">Area</p>
                    <p className="text-lg font-semibold text-gray-700">
                      {shapeDescriptor.area?.toFixed(0)} px²
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase">Perimeter</p>
                    <p className="text-lg font-semibold text-gray-700">
                      {shapeDescriptor.perimeter?.toFixed(0)} px
                    </p>
                  </div>
                </div>
              </div>

              {/* Fourier Coefficients Visualization */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-700">Fourier Shape Signature</h4>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="flex items-end gap-1 h-20">
                    {shapeDescriptor.coefficients?.slice(0, 20).map((coef: number, idx: number) => (
                      <div
                        key={idx}
                        className="bg-gradient-to-t from-teal-500 to-cyan-400 rounded-t flex-1"
                        style={{ height: `${Math.min(Math.abs(coef) * 50, 100)}%` }}
                        title={`Harmonic ${idx + 1}: ${coef.toFixed(4)}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    First 20 harmonics ({shapeDescriptor.num_harmonics} total)
                  </p>
                </div>

                {/* Find Similar Button */}
                <Button
                  onClick={() => findSimilarMutation.mutate(shapeDescriptor)}
                  disabled={findSimilarMutation.isPending}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
                >
                  {findSimilarMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Searching...
                    </span>
                  ) : '🔍 Find Similar Otoliths'}
                </Button>
              </div>
            </div>

            {/* Similar Otoliths Results */}
            {similarOtoliths.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Similar Otoliths Found</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {similarOtoliths.map((match, idx) => (
                    <div key={idx} className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-teal-500">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-800">{match.species || 'Unknown Species'}</p>
                          <p className="text-xs text-gray-500">ID: {match.id?.substring(0, 8)}...</p>
                        </div>
                        <span className={`px-2 py-1 rounded text-sm font-bold ${match.similarity > 80 ? 'bg-green-100 text-green-700' :
                            match.similarity > 50 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-700'
                          }`}>
                          {match.similarity}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {findSimilarMutation.isSuccess && similarOtoliths.length === 0 && (
              <div className="mt-6 text-center py-4 bg-gray-50 rounded-lg">
                <p className="text-gray-500">No similar otoliths found in database yet.</p>
                <p className="text-sm text-gray-400 mt-1">Upload and analyze more otoliths to build the shape database.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Existing Records */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Otolith Records</CardTitle>
        </CardHeader>
        <CardContent>
          {otolithsLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-500">Loading records...</p>
            </div>
          ) : otoliths.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No otolith records yet. Upload an image to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sample ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Species</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-950 dark:divide-gray-800">
                  {otoliths.map((otolith) => (
                    <tr
                      key={otolith._id}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors dark:hover:bg-gray-800 ${selectedOtolith?._id === otolith._id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                      onClick={() => setSelectedOtolith(otolith)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{otolith.sampleId}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {otolith.speciesName || otolith.speciesId || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {otolith.age ? (
                          <span className="font-medium text-indigo-600">
                            {otolith.age.estimated} yrs
                            <span className="text-xs text-gray-400 ml-1">
                              ({(otolith.age.confidence * 100).toFixed(0)}%)
                            </span>
                          </span>
                        ) : otolith.analysisResults?.age_estimation ? (
                          <span className="font-medium text-indigo-600">
                            {otolith.analysisResults.age_estimation.estimated_age} yrs
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(otolith.analysisStatus)}`}>
                          {otolith.analysisStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(otolith.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAnalyze(otolith);
                          }}
                          disabled={analysisMutation.isPending}
                        >
                          {analysisMutation.isPending ? 'Analyzing...' : 'Analyze'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Otolith Details */}
      {selectedOtolith && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Analysis Details: {selectedOtolith.sampleId}</span>
              <Button variant="outline" size="sm" onClick={() => setSelectedOtolith(null)}>
                Close
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Image */}
              {selectedOtolith.imageUrl && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Otolith Image</h4>
                  <img
                    src={selectedOtolith.imageUrl}
                    alt={`Otolith ${selectedOtolith.sampleId}`}
                    className="rounded-lg shadow-md max-h-64 w-auto"
                  />
                </div>
              )}

              {/* Measurements */}
              {selectedOtolith.measurements && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Measurements</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedOtolith.measurements.length && (
                      <div className="bg-gray-50 p-3 rounded">
                        <p className="text-xs text-gray-500">Length</p>
                        <p className="text-lg font-semibold">{selectedOtolith.measurements.length.toFixed(2)} mm</p>
                      </div>
                    )}
                    {selectedOtolith.measurements.width && (
                      <div className="bg-gray-50 p-3 rounded">
                        <p className="text-xs text-gray-500">Width</p>
                        <p className="text-lg font-semibold">{selectedOtolith.measurements.width.toFixed(2)} mm</p>
                      </div>
                    )}
                    {selectedOtolith.measurements.area && (
                      <div className="bg-gray-50 p-3 rounded">
                        <p className="text-xs text-gray-500">Area</p>
                        <p className="text-lg font-semibold">{selectedOtolith.measurements.area.toFixed(2)} mm²</p>
                      </div>
                    )}
                    {selectedOtolith.measurements.perimeter && (
                      <div className="bg-gray-50 p-3 rounded">
                        <p className="text-xs text-gray-500">Perimeter</p>
                        <p className="text-lg font-semibold">{selectedOtolith.measurements.perimeter.toFixed(2)} mm</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Age Estimation from record */}
              {selectedOtolith.analysisResults?.age_estimation && (
                <div className="col-span-full">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Age Estimation</h4>
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-lg">
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-gray-500">Estimated Age</p>
                        <p className="text-2xl font-bold text-indigo-600">
                          {selectedOtolith.analysisResults.age_estimation.estimated_age} years
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Confidence</p>
                        <p className="text-lg font-semibold">
                          {(selectedOtolith.analysisResults.age_estimation.confidence * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Rings Detected</p>
                        <p className="text-lg font-semibold">
                          {selectedOtolith.analysisResults.age_estimation.ring_count}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Quality</p>
                        <p className={`text-lg font-semibold ${getQualityColor(selectedOtolith.analysisResults.age_estimation.analysis_quality)}`}>
                          {selectedOtolith.analysisResults.age_estimation.analysis_quality}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Classification Results */}
              {selectedOtolith.analysisResults?.classification && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Classification</h4>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-lg font-semibold">{selectedOtolith.analysisResults.classification.predicted_class}</p>
                    <p className="text-sm text-gray-500">
                      Confidence: {(selectedOtolith.analysisResults.classification.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              )}

              {/* Shape Metrics */}
              {selectedOtolith.analysisResults?.shape_metrics && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Shape Metrics</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(selectedOtolith.analysisResults.shape_metrics).slice(0, 8).map(([key, value]) => (
                      <div key={key} className="bg-gray-50 p-2 rounded">
                        <p className="text-xs text-gray-500 capitalize">{key.replace(/_/g, ' ')}</p>
                        <p className="text-sm font-medium">{typeof value === 'number' ? value.toFixed(4) : value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedOtolith.notes && (
                <div className="col-span-full">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Notes</h4>
                  <p className="text-gray-600 bg-gray-50 p-3 rounded">{selectedOtolith.notes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Algorithm Information */}
      <Card className="mt-6 bg-gradient-to-r from-gray-50 to-gray-100">
        <CardHeader>
          <CardTitle className="text-lg">About Our Age Estimation Technology</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-2xl mb-2">🔍</div>
              <h4 className="font-medium text-sm">Radial Profile Analysis</h4>
              <p className="text-xs text-gray-500 mt-1">Multi-angle intensity profiles with peak detection (35% weight)</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-2xl mb-2">📊</div>
              <h4 className="font-medium text-sm">Canny Edge Detection</h4>
              <p className="text-xs text-gray-500 mt-1">High-precision edge detection for ring boundaries (25% weight)</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-2xl mb-2">🌊</div>
              <h4 className="font-medium text-sm">Laplacian Analysis</h4>
              <p className="text-xs text-gray-500 mt-1">Second derivative for gradient changes (15% weight)</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-2xl mb-2">🎯</div>
              <h4 className="font-medium text-sm">LoG Blob Detection</h4>
              <p className="text-xs text-gray-500 mt-1">Scale-space blob detection for ring features (15% weight)</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-2xl mb-2">〰️</div>
              <h4 className="font-medium text-sm">Gabor Filters</h4>
              <p className="text-xs text-gray-500 mt-1">Multi-orientation texture analysis (10% weight)</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4 text-center">
            Our ensemble approach combines multiple state-of-the-art computer vision algorithms for robust and accurate age estimation
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default OtolithAnalysis;
