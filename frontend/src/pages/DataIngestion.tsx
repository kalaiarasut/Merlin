import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Upload, FileIcon, Loader, CheckCircle2, XCircle, Clock,
  Database, FileText, Image, FileCode, Archive, Trash2,
  RefreshCw, ChevronRight, AlertCircle, Sparkles, Zap,
  AlertTriangle, Info, Eye
} from 'lucide-react';
import { ingestionService } from '@/services/api';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

const DATA_TYPES = [
  { value: 'species', label: 'Species Records', icon: '🐟', description: 'Taxonomic and species data' },
  { value: 'oceanography', label: 'Oceanographic Data', icon: '🌊', description: 'CTD, temperature, salinity' },
  { value: 'otolith', label: 'Otolith Images', icon: '🔬', description: 'Fish ear bone images' },
  { value: 'edna', label: 'eDNA Sequences', icon: '🧬', description: 'FASTA/FASTQ files' },
  { value: 'survey', label: 'Survey Data', icon: '📊', description: 'Field survey records' },
  { value: 'taxonomy', label: 'Taxonomic Data', icon: '📚', description: 'Classification data' },
];

const FILE_ICONS: Record<string, typeof FileIcon> = {
  'application/json': FileCode,
  'text/csv': FileText,
  'application/vnd.ms-excel': FileText,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FileText,
  'application/pdf': FileText,
  'image/jpeg': Image,
  'image/png': Image,
  'image/tiff': Image,
  'application/zip': Archive,
};

export default function DataIngestion() {
  const [files, setFiles] = useState<File[]>([]);
  const [dataType, setDataType] = useState('species');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: jobs, refetch: refetchJobs } = useQuery({
    queryKey: ['ingestion-jobs'],
    queryFn: () => ingestionService.getJobs(),
    refetchInterval: 5000,
  });

  const deleteMutation = useMutation({
    mutationFn: (jobId: string) => ingestionService.deleteJob(jobId),
    onSuccess: () => {
      toast.success(`Job and associated data deleted successfully`);
      queryClient.invalidateQueries({ queryKey: ['ingestion-jobs'] });
      setShowDeleteModal(false);
      setJobToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete job');
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/json': ['.json'],
      'application/pdf': ['.pdf'],
      'image/*': ['.jpg', '.jpeg', '.png', '.tiff'],
      'text/plain': ['.fasta', '.fastq', '.fa', '.fq'],
      'application/zip': ['.zip'],
    },
  });

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Analyze file before upload
  const analyzeAndUpload = async () => {
    if (files.length === 0) {
      toast.error('Please select files to upload');
      return;
    }

    // Analyze the first file to detect data type
    setAnalyzing(true);
    try {
      const result = await ingestionService.analyze(files[0]);
      setAnalysisResult(result);

      // Check if detected type matches selected type
      if (result.detectedType !== 'unknown' && result.detectedType !== dataType && result.confidence > 50) {
        setShowConfirmModal(true);
      } else {
        // Proceed with upload directly
        await performUpload();
      }
    } catch (error) {
      console.error('Analysis failed, proceeding with upload:', error);
      await performUpload();
    } finally {
      setAnalyzing(false);
    }
  };

  const performUpload = async () => {
    setShowConfirmModal(false);
    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
      try {
        await ingestionService.upload(file, dataType, (progress) => {
          setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
        });
        successCount++;
      } catch (error) {
        failCount++;
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully uploaded ${successCount} file(s)`);
      refetchJobs();
    }

    setUploading(false);
    setFiles([]);
    setUploadProgress({});
    setAnalysisResult(null);
  };

  const handleUpload = async () => {
    await analyzeAndUpload();
  };

  const confirmDeleteJob = (job: any) => {
    setJobToDelete(job);
    setShowDeleteModal(true);
  };

  const getFileIcon = (type: string) => {
    const Icon = FILE_ICONS[type] || FileIcon;
    return Icon;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success" dot><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'processing':
        return <Badge variant="default" dot className="animate-pulse"><Loader className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
      case 'failed':
        return <Badge variant="destructive" dot><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary" dot><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-5 h-5 text-ocean-500" />
            <span className="text-sm font-medium text-ocean-600 dark:text-ocean-400">Data Pipeline</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-deep-900 dark:text-white">Data Ingestion</h1>
          <p className="text-deep-500 dark:text-gray-400 mt-1">
            Upload and process marine datasets with intelligent validation
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => refetchJobs()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Jobs
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Upload Section */}
        <div className="xl:col-span-2 space-y-6">
          {/* Drop Zone */}
          <Card variant="default">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-ocean-500" />
                Upload Files
              </CardTitle>
              <CardDescription>
                Drag and drop files or click to browse. Supports CSV, Excel, JSON, PDF, Images, and FASTA/FASTQ.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                {...getRootProps()}
                className={cn(
                  "relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300",
                  isDragActive
                    ? "border-ocean-400 bg-ocean-50 scale-[1.02]"
                    : "border-gray-200 hover:border-ocean-300 hover:bg-gray-50"
                )}
              >
                <input {...getInputProps()} />
                <div className={cn(
                  "w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center transition-all duration-300",
                  isDragActive ? "bg-ocean-100 scale-110" : "bg-gray-100"
                )}>
                  <Upload className={cn(
                    "w-10 h-10 transition-colors",
                    isDragActive ? "text-ocean-600" : "text-gray-400"
                  )} />
                </div>
                {isDragActive ? (
                  <div>
                    <p className="text-lg font-semibold text-ocean-600">Drop files here</p>
                    <p className="text-sm text-ocean-500 mt-1">Release to upload</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-lg font-semibold text-deep-700">
                      Drag & drop files here
                    </p>
                    <p className="text-sm text-deep-500 mt-1">
                      or <span className="text-ocean-600 font-medium">browse</span> to select files
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                      {['CSV', 'JSON', 'Excel', 'PDF', 'Images', 'FASTA'].map((format) => (
                        <span key={format} className="px-2 py-1 bg-gray-100 rounded-lg text-xs text-deep-500">
                          {format}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Files */}
              {files.length > 0 && (
                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-deep-900">
                      Selected Files ({files.length})
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFiles([])}
                      className="text-abyss-600 hover:text-abyss-700"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Clear All
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {files.map((file, idx) => {
                      const FileTypeIcon = getFileIcon(file.type);
                      const progress = uploadProgress[file.name];
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100 group"
                        >
                          <div className="p-2 bg-white rounded-lg shadow-sm">
                            <FileTypeIcon className="w-5 h-5 text-ocean-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-deep-900 truncate">{file.name}</p>
                            <p className="text-xs text-deep-500">{formatFileSize(file.size)}</p>
                            {progress !== undefined && (
                              <Progress value={progress} size="sm" className="mt-2" variant={progress === 100 ? 'success' : 'default'} />
                            )}
                          </div>
                          {progress !== undefined ? (
                            <span className="text-sm font-medium text-ocean-600">{progress}%</span>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeFile(idx)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-deep-400 hover:text-abyss-600"
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Jobs */}
          <Card variant="default">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Processing Jobs</CardTitle>
                  <CardDescription>Recent data ingestion tasks</CardDescription>
                </div>
                <Badge variant="secondary">{jobs?.length || 0} jobs</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {!jobs || jobs.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
                    <Database className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm text-deep-500">No processing jobs yet</p>
                  <p className="text-xs text-deep-400 mt-1">Upload files to start processing</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {jobs.slice(0, 10).map((job: any) => (
                    <div
                      key={job._id}
                      className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-deep-800/50 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-gray-100/50 dark:hover:bg-deep-700/50 transition-colors group"
                    >
                      <div className={cn(
                        "p-2 rounded-lg",
                        job.status === 'completed' ? "bg-marine-100 dark:bg-marine-900/30" :
                          job.status === 'processing' ? "bg-ocean-100 dark:bg-ocean-900/30" :
                            job.status === 'failed' ? "bg-abyss-100 dark:bg-abyss-900/30" : "bg-gray-100 dark:bg-gray-800"
                      )}>
                        {job.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-marine-600 dark:text-marine-400" /> :
                          job.status === 'processing' ? <Loader className="w-5 h-5 text-ocean-600 dark:text-ocean-400 animate-spin" /> :
                            job.status === 'failed' ? <XCircle className="w-5 h-5 text-abyss-600 dark:text-abyss-400" /> :
                              <Clock className="w-5 h-5 text-gray-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-deep-900 dark:text-gray-100 truncate">{job.filename}</p>
                          {getStatusBadge(job.status)}
                          {job.status === 'completed' && (
                            <Badge variant="secondary" className="bg-ocean-100 text-ocean-700 dark:bg-ocean-900/30 dark:text-ocean-400">
                              <Sparkles className="w-3 h-3 mr-1" />
                              AI Enhanced
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-deep-500 dark:text-gray-400 capitalize">{job.dataType}</span>
                          {job.recordsProcessed > 0 && (
                            <span className="text-xs text-deep-500 dark:text-gray-400">
                              {job.recordsProcessed.toLocaleString()} records
                            </span>
                          )}
                          {job.metadata?.created > 0 && (
                            <span className="text-xs text-marine-600 dark:text-marine-400">
                              +{job.metadata.created} new
                            </span>
                          )}
                          {job.metadata?.updated > 0 && (
                            <span className="text-xs text-ocean-600 dark:text-ocean-400">
                              ↻{job.metadata.updated} updated
                            </span>
                          )}
                          <span className="text-xs text-deep-400 dark:text-gray-500">
                            {new Date(job.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {job.status === 'processing' && (
                          <div className="mt-2">
                            <Progress value={job.progress} size="sm" animated />
                            <span className="text-xs text-deep-400 mt-1">
                              {job.progress <= 30 ? 'Parsing file...' :
                                job.progress <= 40 ? '🤖 AI metadata extraction...' :
                                  job.progress <= 50 ? '🧹 AI data cleaning...' :
                                    'Saving records...'}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => confirmDeleteJob(job)}
                          className="opacity-0 group-hover:opacity-100 text-deep-400 hover:text-abyss-600 dark:text-gray-500 dark:hover:text-abyss-400 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" className="text-deep-400 dark:text-gray-500">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Configuration Panel */}
        <div className="space-y-6">
          <Card variant="premium">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-ocean-500" />
                Configuration
              </CardTitle>
              <CardDescription>Select data type and options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Data Type Selection */}
              <div>
                <label className="block text-sm font-medium text-deep-700 mb-3">
                  Data Type
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {DATA_TYPES.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setDataType(type.value)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                        dataType === type.value
                          ? "border-ocean-400 bg-ocean-50"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      )}
                    >
                      <span className="text-2xl">{type.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm font-medium",
                          dataType === type.value ? "text-ocean-700" : "text-deep-700"
                        )}>
                          {type.label}
                        </p>
                        <p className="text-xs text-deep-500 truncate">{type.description}</p>
                      </div>
                      {dataType === type.value && (
                        <CheckCircle2 className="w-5 h-5 text-ocean-500 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Upload Button */}
              <Button
                onClick={handleUpload}
                disabled={uploading || analyzing || files.length === 0}
                className="w-full"
                variant="premium"
                size="lg"
              >
                {analyzing ? (
                  <>
                    <Eye className="w-5 h-5 mr-2 animate-pulse" />
                    Analyzing...
                  </>
                ) : uploading ? (
                  <>
                    <Loader className="w-5 h-5 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" />
                    Upload {files.length > 0 ? `${files.length} File(s)` : 'Files'}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card variant="glass">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <div className="p-2 rounded-lg bg-ocean-100 dark:bg-ocean-900/30">
                  <Sparkles className="w-5 h-5 text-ocean-600 dark:text-ocean-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-deep-900 dark:text-white">AI-Powered Processing</h4>
                  <p className="text-xs text-deep-500 dark:text-gray-400 mt-1">
                    Our system automatically validates, cleans, and enriches your data using machine learning.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tips */}
          <Card variant="default">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upload Tips</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-deep-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-marine-500 mt-0.5 flex-shrink-0" />
                  <span>Ensure CSV files have headers in the first row</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-marine-500 mt-0.5 flex-shrink-0" />
                  <span>JSON files should be arrays of objects</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-marine-500 mt-0.5 flex-shrink-0" />
                  <span>Max file size: 500MB per file</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-coral-500 mt-0.5 flex-shrink-0" />
                  <span>Duplicate records are automatically merged</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Data Type Mismatch Confirmation Modal */}
      {showConfirmModal && analysisResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative bg-white dark:bg-deep-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-coral-100 dark:bg-coral-900/30">
                  <AlertTriangle className="w-6 h-6 text-coral-600 dark:text-coral-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-deep-900 dark:text-gray-100">
                    Data Type Mismatch Detected
                  </h3>
                  <p className="text-sm text-deep-500 dark:text-gray-400">
                    The file content doesn't match the selected type
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-deep-900/50 rounded-xl">
                <div>
                  <p className="text-xs text-deep-500 dark:text-gray-500 uppercase tracking-wider">Selected Type</p>
                  <p className="text-sm font-medium text-deep-900 dark:text-gray-100 capitalize mt-1">{dataType}</p>
                </div>
                <div className="text-2xl">→</div>
                <div>
                  <p className="text-xs text-deep-500 dark:text-gray-500 uppercase tracking-wider">Detected Type</p>
                  <p className="text-sm font-medium text-ocean-600 dark:text-ocean-400 capitalize mt-1">
                    {analysisResult.detectedType}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-ocean-50 dark:bg-ocean-900/20 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-deep-900 dark:text-gray-100">Detection Confidence</p>
                  <Badge variant={analysisResult.confidence > 70 ? 'success' : 'warning'}>
                    {analysisResult.confidence}%
                  </Badge>
                </div>
                <p className="text-xs text-deep-500 dark:text-gray-400">
                  Based on {analysisResult.recordCount} records analyzed
                </p>
                {analysisResult.indicators.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-deep-500 dark:text-gray-400 mb-1">Matching fields:</p>
                    <div className="flex flex-wrap gap-1">
                      {analysisResult.indicators.slice(0, 5).map((field: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-white dark:bg-deep-800 rounded text-xs text-deep-600 dark:text-gray-300">
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sample Fields */}
              <div>
                <p className="text-xs text-deep-500 dark:text-gray-500 mb-2">Fields found in file:</p>
                <div className="flex flex-wrap gap-1">
                  {analysisResult.sampleFields.map((field: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-gray-100 dark:bg-deep-700 rounded text-xs text-deep-600 dark:text-gray-300">
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-deep-900/50">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setDataType(analysisResult.detectedType);
                    setShowConfirmModal(false);
                    toast.success(`Changed data type to ${analysisResult.detectedType}`);
                  }}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Use Detected Type
                </Button>
                <Button
                  variant="default"
                  className="flex-1"
                  onClick={() => performUpload()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload as {dataType}
                </Button>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="w-full mt-3 text-sm text-deep-500 dark:text-gray-400 hover:text-deep-700 dark:hover:text-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && jobToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)} />
          <div className="relative bg-white dark:bg-deep-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-abyss-100 dark:bg-abyss-900/30">
                  <Trash2 className="w-6 h-6 text-abyss-600 dark:text-abyss-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-deep-900 dark:text-gray-100">
                    Delete Ingestion Job
                  </h3>
                  <p className="text-sm text-deep-500 dark:text-gray-400">
                    This action cannot be undone
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="p-4 bg-gray-50 dark:bg-deep-900/50 rounded-xl space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-deep-500 dark:text-gray-400">File:</span>
                  <span className="text-sm font-medium text-deep-900 dark:text-gray-100">{jobToDelete.filename}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-deep-500 dark:text-gray-400">Type:</span>
                  <span className="text-sm font-medium text-deep-900 dark:text-gray-100 capitalize">{jobToDelete.dataType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-deep-500 dark:text-gray-400">Status:</span>
                  {getStatusBadge(jobToDelete.status)}
                </div>
                {jobToDelete.recordsProcessed > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-deep-500 dark:text-gray-400">Records:</span>
                    <span className="text-sm font-medium text-deep-900 dark:text-gray-100">
                      {jobToDelete.recordsProcessed.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 p-4 bg-abyss-50 dark:bg-abyss-900/20 rounded-xl">
                <div className="flex gap-2">
                  <Info className="w-4 h-4 text-abyss-600 dark:text-abyss-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-abyss-700 dark:text-abyss-300">
                    Deleting this job will remove the job record AND all associated data (Species, Oceanography, eDNA) imported with this job.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-deep-900/50">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setJobToDelete(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => deleteMutation.mutate(jobToDelete._id)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Job
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
