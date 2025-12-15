import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  FileText, Download, FileJson, FileCode,
  Plus, Trash2, Loader2, CheckCircle, AlertCircle,
  Sparkles, FileOutput
} from 'lucide-react';
import { analyticsService, speciesService, ednaService } from '@/services/api';
import { cn } from '@/lib/utils';

interface ReportSection {
  id: string;
  title: string;
  content: string;
  level: number;
  key_findings: string[];
  bullet_points: string[];
  chart_type?: 'bar' | 'pie' | 'line' | 'area' | 'none';
  chart_data?: Record<string, number>;
}

const REPORT_TYPES = [
  { value: 'biodiversity', label: 'Biodiversity Analysis', icon: '🌿', description: 'Species diversity metrics and community analysis' },
  { value: 'species_analysis', label: 'Species Analysis', icon: '🐟', description: 'Detailed species profile report' },
  { value: 'edna_analysis', label: 'eDNA Analysis', icon: '🧬', description: 'Environmental DNA sequence analysis' },
  { value: 'niche_model', label: 'Niche Model', icon: '🗺️', description: 'Species distribution modeling results' },
  { value: 'survey_summary', label: 'Survey Summary', icon: '📋', description: 'Field survey data summary' },
  { value: 'custom', label: 'Custom Report', icon: '✏️', description: 'Build your own report structure' },
];

const FORMAT_OPTIONS = [
  { value: 'html', label: 'HTML', icon: FileCode, description: 'Interactive web report' },
  { value: 'pdf', label: 'PDF', icon: FileText, description: 'Professional document' },
  { value: 'markdown', label: 'Markdown', icon: FileText, description: 'Documentation format' },
  { value: 'json', label: 'JSON', icon: FileJson, description: 'Structured data export' },
];

export default function ReportGenerator() {
  const [reportType, setReportType] = useState('biodiversity');
  const [format, setFormat] = useState('html');
  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [keywords, setKeywords] = useState('');
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [generatedReport, setGeneratedReport] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  // Fetch data for auto-population
  const { data: biodiversityData } = useQuery({
    queryKey: ['biodiversity-data'],
    queryFn: () => ednaService.getStats(),
    enabled: reportType === 'biodiversity',
  });

  const { data: speciesData } = useQuery({
    queryKey: ['species-for-report'],
    queryFn: () => speciesService.getAll({ limit: 100 }),
    enabled: reportType === 'species_analysis',
  });

  // Report generation mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await analyticsService.generateReport({
        title: title || `${REPORT_TYPES.find(t => t.value === reportType)?.label || 'Analysis'} Report`,
        report_type: reportType,
        format,
        abstract,
        keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
        sections: sections.map(s => ({
          title: s.title,
          content: s.content,
          level: s.level,
          key_findings: s.key_findings,
          bullet_points: s.bullet_points,
          chart_configs: s.chart_type && s.chart_type !== 'none' ? [{
            chart_type: s.chart_type,
            title: `${s.title} Chart`,
            data: s.chart_data || {}
          }] : []
        })),
        data: getAutoData(),
      });
      return response;
    },
    onSuccess: (data: any) => {
      if (data.content) {
        setGeneratedReport(data.content);
        setPreviewMode(true);
      }
    },
  });

  // Quick report mutation
  const quickReportMutation = useMutation({
    mutationFn: async () => {
      const response = await analyticsService.quickReport({
        analysis_type: reportType,
        data: getAutoData(),
        format,
      });
      return response;
    },
    onSuccess: (data: any) => {
      if (data.content) {
        setGeneratedReport(data.content);
        setPreviewMode(true);
      }
    },
  });

  // Get auto-populated data based on report type
  const getAutoData = () => {
    if (reportType === 'biodiversity' && biodiversityData) {
      return {
        shannon_index: biodiversityData.biodiversity?.shannon_index || 2.5,
        simpson_index: biodiversityData.biodiversity?.simpson_index || 0.85,
        species_richness: biodiversityData.speciesDetected || 25,
        evenness: biodiversityData.biodiversity?.evenness || 0.78,
        total_sequences: biodiversityData.totalSamples || 1000,
        species_abundances: biodiversityData.topSpecies?.reduce((acc: any, s: any) => {
          acc[s.name] = s.count;
          return acc;
        }, {}) || {}
      };
    }
    if (reportType === 'species_analysis' && speciesData) {
      const species = (speciesData as any).data?.[0];
      return {
        species: species?.scientificName || 'Unknown Species',
        common_name: species?.commonName || '',
        observations: (speciesData as any).pagination?.total || 0,
        description: species?.description || '',
        status: species?.conservationStatus || 'Not assessed',
        range: 'Indian Ocean'
      };
    }
    return {};
  };

  // Add a new section
  const addSection = () => {
    const newSection: ReportSection = {
      id: Date.now().toString(),
      title: 'New Section',
      content: '',
      level: 1,
      key_findings: [],
      bullet_points: [],
      chart_type: 'none',
    };
    setSections([...sections, newSection]);
  };

  // Update a section
  const updateSection = (id: string, updates: Partial<ReportSection>) => {
    setSections(sections.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  // Remove a section
  const removeSection = (id: string) => {
    setSections(sections.filter(s => s.id !== id));
  };

  // Add finding to section
  const addFinding = (sectionId: string) => {
    setSections(sections.map(s => 
      s.id === sectionId 
        ? { ...s, key_findings: [...s.key_findings, ''] }
        : s
    ));
  };

  // Update finding
  const updateFinding = (sectionId: string, index: number, value: string) => {
    setSections(sections.map(s => 
      s.id === sectionId 
        ? { ...s, key_findings: s.key_findings.map((f, i) => i === index ? value : f) }
        : s
    ));
  };

  // Download generated report
  const downloadReport = () => {
    if (!generatedReport) return;
    
    const blob = format === 'pdf' 
      ? new Blob([atob(generatedReport)], { type: 'application/pdf' })
      : new Blob([generatedReport], { type: format === 'html' ? 'text/html' : 'text/plain' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'report'}.${format === 'markdown' ? 'md' : format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileOutput className="w-5 h-5 text-ocean-500" />
            <span className="text-sm font-medium text-ocean-600 dark:text-ocean-400">Documentation</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-deep-900 dark:text-gray-100">Report Generator</h1>
          <p className="text-deep-500 dark:text-gray-400 mt-1">
            Generate professional research reports with AI-powered insights
          </p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={() => quickReportMutation.mutate()}
            disabled={quickReportMutation.isPending}
          >
            {quickReportMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Quick Report
          </Button>
          <Button 
            variant="premium"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 mr-2" />
            )}
            Generate Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="space-y-6">
          {/* Report Type Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Report Type</CardTitle>
              <CardDescription>Choose the type of analysis report</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {REPORT_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setReportType(type.value)}
                  className={cn(
                    "w-full p-3 rounded-lg border text-left transition-all",
                    reportType === type.value
                      ? "border-ocean-500 bg-ocean-50 dark:bg-ocean-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-ocean-300"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{type.icon}</span>
                    <div>
                      <p className="font-medium text-sm text-deep-900 dark:text-gray-100">
                        {type.label}
                      </p>
                      <p className="text-xs text-deep-500 dark:text-gray-400">
                        {type.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Output Format */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Output Format</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {FORMAT_OPTIONS.map((fmt) => {
                  const Icon = fmt.icon;
                  return (
                    <button
                      key={fmt.value}
                      onClick={() => setFormat(fmt.value)}
                      className={cn(
                        "p-3 rounded-lg border text-center transition-all",
                        format === fmt.value
                          ? "border-ocean-500 bg-ocean-50 dark:bg-ocean-900/20"
                          : "border-gray-200 dark:border-gray-700 hover:border-ocean-300"
                      )}
                    >
                      <Icon className="w-5 h-5 mx-auto mb-1 text-ocean-600 dark:text-ocean-400" />
                      <p className="text-sm font-medium">{fmt.label}</p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Report Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Report Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-deep-700 dark:text-gray-300">
                  Report Title
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Marine Biodiversity Survey Report Q1 2024"
                  className="mt-1"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-deep-700 dark:text-gray-300">
                  Abstract / Summary
                </label>
                <Textarea
                  value={abstract}
                  onChange={(e) => setAbstract(e.target.value)}
                  placeholder="Brief description of the report contents..."
                  className="mt-1"
                  rows={3}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-deep-700 dark:text-gray-300">
                  Keywords
                </label>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="marine, biodiversity, indian ocean (comma separated)"
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Custom Sections */}
          {reportType === 'custom' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Report Sections</CardTitle>
                    <CardDescription>Add custom sections to your report</CardDescription>
                  </div>
                  <Button size="sm" onClick={addSection}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Section
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {sections.length === 0 ? (
                  <div className="text-center py-8 text-deep-500 dark:text-gray-400">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No sections added yet</p>
                    <p className="text-sm">Click "Add Section" to start building your report</p>
                  </div>
                ) : (
                  sections.map((section, index) => (
                    <div key={section.id} className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-deep-500">
                          Section {index + 1}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeSection(section.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                      
                      <Input
                        value={section.title}
                        onChange={(e) => updateSection(section.id, { title: e.target.value })}
                        placeholder="Section Title"
                      />
                      
                      <Textarea
                        value={section.content}
                        onChange={(e) => updateSection(section.id, { content: e.target.value })}
                        placeholder="Section content..."
                        rows={3}
                      />
                      
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-deep-500">Key Findings</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => addFinding(section.id)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                        {section.key_findings.map((finding, i) => (
                          <Input
                            key={i}
                            value={finding}
                            onChange={(e) => updateFinding(section.id, i, e.target.value)}
                            placeholder={`Finding ${i + 1}`}
                            className="mb-2 text-sm"
                          />
                        ))}
                      </div>

                      <div>
                        <span className="text-xs font-medium text-deep-500">Include Chart</span>
                        <Select
                          value={section.chart_type || 'none'}
                          onChange={(e) => updateSection(section.id, { 
                            chart_type: e.target.value as any 
                          })}
                          className="mt-1"
                        >
                          <option value="none">No Chart</option>
                          <option value="bar">Bar Chart</option>
                          <option value="pie">Pie Chart</option>
                          <option value="line">Line Chart</option>
                          <option value="area">Area Chart</option>
                        </Select>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {/* Preview / Generated Report */}
          {generatedReport && previewMode && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      Report Generated
                    </CardTitle>
                    <CardDescription>
                      Your report is ready for download
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setPreviewMode(false)}>
                      Edit
                    </Button>
                    <Button variant="premium" onClick={downloadReport}>
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {format === 'html' && (
                  <div className="border rounded-lg overflow-hidden max-h-[600px] overflow-y-auto">
                    <iframe
                      srcDoc={generatedReport}
                      className="w-full h-[500px] border-0"
                      title="Report Preview"
                    />
                  </div>
                )}
                {format === 'markdown' && (
                  <pre className="p-4 bg-gray-50 dark:bg-deep-800 rounded-lg text-sm overflow-auto max-h-[500px]">
                    {generatedReport}
                  </pre>
                )}
                {format === 'json' && (
                  <pre className="p-4 bg-gray-50 dark:bg-deep-800 rounded-lg text-sm overflow-auto max-h-[500px]">
                    {generatedReport}
                  </pre>
                )}
                {format === 'pdf' && (
                  <div className="text-center py-8">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-ocean-500" />
                    <p className="text-deep-600 dark:text-gray-300">
                      PDF generated successfully
                    </p>
                    <p className="text-sm text-deep-500 dark:text-gray-400">
                      Click download to save the file
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Generation Progress */}
          {(generateMutation.isPending || quickReportMutation.isPending) && (
            <Card>
              <CardContent className="py-8">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-ocean-500" />
                  <h3 className="text-lg font-medium text-deep-900 dark:text-gray-100 mb-2">
                    Generating Report
                  </h3>
                  <p className="text-deep-500 dark:text-gray-400 mb-4">
                    Creating your professional report with charts and analysis...
                  </p>
                  <Progress value={65} variant="gradient" className="max-w-xs mx-auto" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {(generateMutation.isError || quickReportMutation.isError) && (
            <Card className="border-red-200 dark:border-red-800">
              <CardContent className="py-6">
                <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
                  <AlertCircle className="w-6 h-6" />
                  <div>
                    <p className="font-medium">Report generation failed</p>
                    <p className="text-sm opacity-80">
                      {(generateMutation.error || quickReportMutation.error)?.message || 
                       'Please try again or contact support'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
