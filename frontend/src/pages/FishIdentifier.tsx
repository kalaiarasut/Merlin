import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation } from '@tanstack/react-query';
import { Upload, Fish, Camera, Loader2, CheckCircle, AlertCircle, Info, Sparkles, X } from 'lucide-react';
import { aiService } from '@/services/api';
import { cn } from '@/lib/utils';

interface ClassificationResult {
  species: string;
  scientificName: string;
  confidence: number;
  family: string;
  commonNames: string[];
  conservationStatus?: string;
  habitat?: string;
  description?: string;
  alternatives?: Array<{
    species: string;
    scientificName: string;
    confidence: number;
  }>;
}

export default function FishIdentifier() {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<ClassificationResult | null>(null);

  const classifyMutation = useMutation({
    mutationFn: (file: File) => aiService.classifyFish(file),
    onSuccess: (data) => {
      setResult(data);
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedImage(file);
      setResult(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.bmp'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const handleClassify = () => {
    if (selectedImage) {
      classifyMutation.mutate(selectedImage);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setResult(null);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 dark:text-green-400';
    if (confidence >= 0.5) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.9) return 'Very High';
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Moderate';
    if (confidence >= 0.4) return 'Low';
    return 'Very Low';
  };

  const getConservationColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'critically endangered':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'endangered':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'vulnerable':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'near threatened':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'least concern':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-deep-900 dark:text-white flex items-center gap-2">
            <Fish className="h-7 w-7 text-coral-500" />
            Fish Species Identifier
          </h1>
          <p className="text-deep-600 dark:text-gray-400 mt-1">
            Upload a fish image to identify the species using AI-powered classification
          </p>
        </div>
      </div>

      {/* Model Info Banner */}
      <div className="bg-gradient-to-r from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20 border border-cyan-200 dark:border-cyan-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-cyan-600 dark:text-cyan-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-cyan-900 dark:text-cyan-100">Custom Trained Indian Ocean Model</h3>
            <p className="text-sm text-cyan-700 dark:text-cyan-300 mt-1">
              Hierarchical deep learning classifier optimized for Indian Ocean species with habitat, family, and species-level identification.
              Unknown species are automatically flagged for expert review.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-cyan-100 text-cyan-800 dark:bg-cyan-800/50 dark:text-cyan-200">
                15+ Indian Ocean Species
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-cyan-100 text-cyan-800 dark:bg-cyan-800/50 dark:text-cyan-200">
                Hierarchical Classification
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-cyan-100 text-cyan-800 dark:bg-cyan-800/50 dark:text-cyan-200">
                EfficientNet-B0 Backbone
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-deep-800 rounded-xl shadow-sm border border-gray-200 dark:border-deep-700 p-6">
            <h2 className="text-lg font-semibold text-deep-900 dark:text-white mb-4 flex items-center gap-2">
              <Camera className="h-5 w-5 text-coral-500" />
              Upload Fish Image
            </h2>

            {!imagePreview ? (
              <div
                {...getRootProps()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
                  isDragActive
                    ? 'border-coral-500 bg-coral-50 dark:bg-coral-900/20'
                    : 'border-gray-300 dark:border-deep-600 hover:border-coral-400 hover:bg-gray-50 dark:hover:bg-deep-700/50'
                )}
              >
                <input {...getInputProps()} />
                <Upload className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
                <p className="text-deep-700 dark:text-gray-300 font-medium">
                  {isDragActive ? 'Drop the image here...' : 'Drag & drop a fish image here'}
                </p>
                <p className="text-sm text-deep-500 dark:text-gray-500 mt-2">
                  or click to select from your device
                </p>
                <p className="text-xs text-deep-400 dark:text-gray-600 mt-4">
                  Supported: JPEG, PNG, WebP • Max size: 10MB
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Selected fish"
                    className="w-full h-64 object-contain rounded-lg bg-gray-100 dark:bg-deep-700"
                  />
                  <button
                    onClick={clearImage}
                    className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-sm text-deep-600 dark:text-gray-400">
                  <span className="truncate">{selectedImage?.name}</span>
                  <span>{(selectedImage?.size || 0 / 1024).toFixed(1)} KB</span>
                </div>
                <button
                  onClick={handleClassify}
                  disabled={classifyMutation.isPending}
                  className={cn(
                    'w-full py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2',
                    classifyMutation.isPending
                      ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-coral-500 to-coral-600 hover:from-coral-600 hover:to-coral-700 text-white shadow-lg hover:shadow-xl'
                  )}
                >
                  {classifyMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5" />
                      Identify Species
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="bg-white dark:bg-deep-800 rounded-xl shadow-sm border border-gray-200 dark:border-deep-700 p-6">
            <h3 className="font-semibold text-deep-900 dark:text-white mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500" />
              Tips for Best Results
            </h3>
            <ul className="space-y-2 text-sm text-deep-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                Use clear, well-lit photos showing the whole fish
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                Side-view photos (lateral view) work best
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                Ensure the fish fills most of the frame
              </li>
              <li className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                Avoid blurry or low-resolution images
              </li>
            </ul>
          </div>
        </div>

        {/* Results Section */}
        <div className="bg-white dark:bg-deep-800 rounded-xl shadow-sm border border-gray-200 dark:border-deep-700 p-6">
          <h2 className="text-lg font-semibold text-deep-900 dark:text-white mb-4 flex items-center gap-2">
            <Fish className="h-5 w-5 text-coral-500" />
            Classification Results
          </h2>

          {classifyMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="relative">
                <div className="absolute inset-0 bg-coral-500/20 rounded-full animate-ping" />
                <Loader2 className="h-12 w-12 text-coral-500 animate-spin relative" />
              </div>
              <p className="mt-4 text-deep-600 dark:text-gray-400">Analyzing image with custom model...</p>
              <p className="text-sm text-deep-500 dark:text-gray-500 mt-1">Hierarchical classification in progress</p>
            </div>
          )}

          {classifyMutation.isError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">Classification Failed</span>
              </div>
              <p className="text-sm text-red-600 dark:text-red-300 mt-2">
                {(classifyMutation.error as any)?.message || 'Unable to classify the image. Please try again.'}
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-6">
              {/* Primary Result */}
              <div className="bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 border border-teal-200 dark:border-teal-800 rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-teal-600 dark:text-teal-400 font-medium">Identified Species</p>
                    <h3 className="text-2xl font-bold text-deep-900 dark:text-white mt-1">
                      {result.species}
                    </h3>
                    <p className="text-lg italic text-deep-600 dark:text-gray-400">
                      {result.scientificName}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-deep-500 dark:text-gray-500">Confidence</p>
                    <p className={cn('text-3xl font-bold', getConfidenceColor(result.confidence))}>
                      {(result.confidence * 100).toFixed(1)}%
                    </p>
                    <span className={cn('text-xs font-medium', getConfidenceColor(result.confidence))}>
                      {getConfidenceLabel(result.confidence)}
                    </span>
                  </div>
                </div>

                {/* Confidence Bar */}
                <div className="mt-4">
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full transition-all duration-500 rounded-full',
                        result.confidence >= 0.8 ? 'bg-green-500' :
                        result.confidence >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                      )}
                      style={{ width: `${result.confidence * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-deep-700/50 rounded-lg p-4">
                  <p className="text-xs text-deep-500 dark:text-gray-500 uppercase tracking-wide">Family</p>
                  <p className="text-deep-900 dark:text-white font-medium mt-1">{result.family || 'Unknown'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-deep-700/50 rounded-lg p-4">
                  <p className="text-xs text-deep-500 dark:text-gray-500 uppercase tracking-wide">Conservation</p>
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1', getConservationColor(result.conservationStatus))}>
                    {result.conservationStatus || 'Not Evaluated'}
                  </span>
                </div>
              </div>

              {/* Common Names */}
              {result.commonNames && result.commonNames.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-deep-700 dark:text-gray-300 mb-2">Common Names</p>
                  <div className="flex flex-wrap gap-2">
                    {result.commonNames.map((name, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-gray-100 dark:bg-deep-700 text-deep-700 dark:text-gray-300 rounded-full text-sm"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Habitat */}
              {result.habitat && (
                <div>
                  <p className="text-sm font-medium text-deep-700 dark:text-gray-300 mb-2">Habitat</p>
                  <p className="text-deep-600 dark:text-gray-400 text-sm">{result.habitat}</p>
                </div>
              )}

              {/* Description */}
              {result.description && (
                <div>
                  <p className="text-sm font-medium text-deep-700 dark:text-gray-300 mb-2">Description</p>
                  <p className="text-deep-600 dark:text-gray-400 text-sm">{result.description}</p>
                </div>
              )}

              {/* Alternative Predictions */}
              {result.alternatives && result.alternatives.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-deep-700 dark:text-gray-300 mb-3">Other Possible Species</p>
                  <div className="space-y-2">
                    {result.alternatives.map((alt, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-gray-50 dark:bg-deep-700/50 rounded-lg p-3"
                      >
                        <div>
                          <p className="font-medium text-deep-800 dark:text-gray-200">{alt.species}</p>
                          <p className="text-sm italic text-deep-500 dark:text-gray-500">{alt.scientificName}</p>
                        </div>
                        <span className={cn('font-semibold', getConfidenceColor(alt.confidence))}>
                          {(alt.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!classifyMutation.isPending && !result && !classifyMutation.isError && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Fish className="h-16 w-16 text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-deep-600 dark:text-gray-400">Upload an image to see classification results</p>
              <p className="text-sm text-deep-500 dark:text-gray-500 mt-1">
                The AI will identify the fish species and provide detailed information
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Supported Species Info */}
      <div className="bg-white dark:bg-deep-800 rounded-xl shadow-sm border border-gray-200 dark:border-deep-700 p-6">
        <h3 className="font-semibold text-deep-900 dark:text-white mb-4">About Our Custom Model</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-2xl font-bold text-coral-500">15+</p>
            <p className="text-sm text-deep-600 dark:text-gray-400">Indian Ocean Species</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-teal-500">Hierarchical</p>
            <p className="text-sm text-deep-600 dark:text-gray-400">Classification System</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-cyan-500">Trainable</p>
            <p className="text-sm text-deep-600 dark:text-gray-400">Add New Species</p>
          </div>
        </div>
        <p className="text-sm text-deep-500 dark:text-gray-500 mt-4">
          Our custom-trained model uses a hierarchical approach (Habitat → Family → Species) with EfficientNet-B0 backbone.
          It specializes in major Indian Ocean species including tunas, snappers, groupers, trevally, and more. Unknown species are automatically flagged for expert review.
        </p>
      </div>
    </div>
  );
}
