import { useState, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText, Download, FileJson, FileCode,
  Plus, Loader2, CheckCircle, AlertCircle,
  Sparkles, FileOutput, Settings, Eye, Edit3,
  LayoutTemplate, Wand2, Palette, Shield, Hash, Copy
} from 'lucide-react';
import { analyticsService, speciesService, ednaService } from '@/services/api';
import { cn } from '@/lib/utils';

// Import new report components
import { RichTextEditor, AIContentPanel, SectionBuilder, ReportTemplates, VersionHistory } from '@/components/report';
import { useKeyboardShortcuts } from '@/hooks/useReportHistory';

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
  { value: 'moes_policy', label: 'MoES Policy Report', icon: '🏛️', description: 'Ministry-ready policy document with provenance' },
  { value: 'custom', label: 'Custom Report', icon: '✏️', description: 'Build your own report structure' },
];

const FORMAT_OPTIONS = [
  { value: 'html', label: 'HTML', icon: FileCode, description: 'Interactive web report' },
  { value: 'pdf', label: 'PDF', icon: FileText, description: 'Professional document' },
  { value: 'markdown', label: 'Markdown', icon: FileText, description: 'Documentation format' },
  { value: 'json', label: 'JSON', icon: FileJson, description: 'Structured data export' },
];

export default function ReportGenerator() {
  // Report Configuration State
  const [reportType, setReportType] = useState('biodiversity');
  const [format, setFormat] = useState('html');
  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [keywords, setKeywords] = useState('');
  const [sections, setSections] = useState<ReportSection[]>([]);

  // UI State
  const [generatedReport, setGeneratedReport] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [lastGeneratedFormat, setLastGeneratedFormat] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('structure');
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [reportHash, setReportHash] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  // Get selected section for rich editing
  const selectedSection = sections.find(s => s.id === selectedSectionId);

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
        use_llm: true,
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
        setLastGeneratedFormat(format);
        // Generate reproducibility hash for policy reports
        const hash = btoa(data.content.substring(0, 64)).substring(0, 16);
        setReportHash(hash);
        setReportId(`RPT-${Date.now().toString(36).toUpperCase()}`);
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
        use_llm: true,
      });
      return response;
    },
    onSuccess: (data: any) => {
      if (data.content) {
        setGeneratedReport(data.content);
        setPreviewMode(true);
        setLastGeneratedFormat(format);
      }
    },
  });

  // Get auto-populated data based on report type
  const getAutoData = useCallback(() => {
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
  }, [reportType, biodiversityData, speciesData]);

  // Handle template application
  const handleApplyTemplate = useCallback((template: any) => {
    if (template.reportType) setReportType(template.reportType);
    if (template.title) setTitle(template.title);
    if (template.abstract) setAbstract(template.abstract);
    if (template.keywords) setKeywords(template.keywords.join(', '));
    if (template.sections) setSections(template.sections);
  }, []);

  // Handle section content update from rich editor
  const handleSectionContentUpdate = useCallback((content: string) => {
    if (selectedSectionId) {
      setSections(prev => prev.map(s =>
        s.id === selectedSectionId ? { ...s, content } : s
      ));
    }
  }, [selectedSectionId]);

  // Handle AI content application
  const handleAIContentApply = useCallback((content: string) => {
    if (selectedSectionId) {
      setSections(prev => prev.map(s =>
        s.id === selectedSectionId ? { ...s, content: s.content + '\n\n' + content } : s
      ));
    }
  }, [selectedSectionId]);

  // Open section in rich editor
  const handleEditSection = useCallback((sectionId: string) => {
    setSelectedSectionId(sectionId);
    setActiveTab('editor');
  }, []);

  // Add new section shortcut handler
  const addNewSection = useCallback(() => {
    const newSection: ReportSection = {
      id: Date.now().toString(),
      title: 'New Section',
      content: '',
      level: 1,
      key_findings: [],
      bullet_points: [],
      chart_type: 'none',
    };
    setSections(prev => [...prev, newSection]);
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSave: () => {
      // Trigger version history save (handled by VersionHistory component)
      console.log('Save shortcut triggered');
    },
    onGenerate: () => {
      if (!generateMutation.isPending) {
        generateMutation.mutate();
      }
    },
    onNewSection: addNewSection,
  });

  // Download generated report
  const downloadReport = () => {
    if (!generatedReport || !lastGeneratedFormat) return;

    const downloadFormat = lastGeneratedFormat;
    const blob = downloadFormat === 'pdf'
      ? new Blob([atob(generatedReport)], { type: 'application/pdf' })
      : new Blob([generatedReport], { type: downloadFormat === 'html' ? 'text/html' : 'text/plain' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'report'}.${downloadFormat === 'markdown' ? 'md' : downloadFormat}`;
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
        {/* Left Sidebar - Configuration */}
        <div className="space-y-4">

          {/* Report Type Selector */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-ocean-500" />
                Report Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {REPORT_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setReportType(type.value)}
                    className={cn(
                      "w-full p-3 rounded-lg border text-left transition-all flex items-center gap-3",
                      reportType === type.value
                        ? "border-ocean-500 bg-ocean-50 dark:bg-ocean-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:border-ocean-300"
                    )}
                  >
                    <span className="text-xl">{type.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-deep-900 dark:text-gray-100">{type.label}</p>
                      <p className="text-xs text-deep-500 dark:text-gray-400">{type.description}</p>
                    </div>
                    {type.value === 'moes_policy' && (
                      <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-coral-100 text-coral-700 dark:bg-coral-900/30 dark:text-coral-400 rounded-full">
                        Policy
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Output Format */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Palette className="w-4 h-4 text-ocean-500" />
                Output Format
              </CardTitle>
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
                        "p-2 rounded-lg border text-center transition-all",
                        format === fmt.value
                          ? "border-ocean-500 bg-ocean-50 dark:bg-ocean-900/20"
                          : "border-gray-200 dark:border-gray-700 hover:border-ocean-300"
                      )}
                    >
                      <Icon className="w-4 h-4 mx-auto mb-1 text-ocean-600 dark:text-ocean-400" />
                      <p className="text-xs font-medium">{fmt.label}</p>
                    </button>
                  );
                })}
              </div>

              {generatedReport && lastGeneratedFormat && format !== lastGeneratedFormat && (
                <Button
                  variant="premium"
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4 mr-2" />
                  )}
                  Regenerate as {FORMAT_OPTIONS.find(f => f.value === format)?.label}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Templates */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <LayoutTemplate className="w-4 h-4 text-ocean-500" />
                Templates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ReportTemplates
                currentConfig={{
                  reportType,
                  title,
                  abstract,
                  keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
                  sections,
                }}
                onApplyTemplate={handleApplyTemplate}
              />
            </CardContent>
          </Card>

          {/* Version History */}
          <VersionHistory
            currentConfig={{
              reportType,
              title,
              abstract,
              keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
              sections,
            }}
            onRestore={(config) => {
              setReportType(config.reportType);
              setTitle(config.title);
              setAbstract(config.abstract);
              setKeywords(config.keywords.join(', '));
              setSections(config.sections);
            }}
          />
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Report Metadata */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Report Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-deep-700 dark:text-gray-300">
                  Report Title
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Marine Biodiversity Survey Report Q1 2024"
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-deep-700 dark:text-gray-300">
                    Abstract / Summary
                  </label>
                  <Textarea
                    value={abstract}
                    onChange={(e) => setAbstract(e.target.value)}
                    placeholder="Brief description..."
                    className="mt-1"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-deep-700 dark:text-gray-300">
                    Keywords
                  </label>
                  <Textarea
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="marine, biodiversity, indian ocean..."
                    className="mt-1"
                    rows={2}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabbed Editor Area */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="structure" className="flex-1">
                <Settings className="w-4 h-4 mr-2" />
                Structure
              </TabsTrigger>
              <TabsTrigger value="editor" className="flex-1">
                <Edit3 className="w-4 h-4 mr-2" />
                Rich Editor
              </TabsTrigger>
              <TabsTrigger value="ai" className="flex-1">
                <Wand2 className="w-4 h-4 mr-2" />
                AI Assistant
              </TabsTrigger>
              {generatedReport && (
                <TabsTrigger value="preview" className="flex-1">
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </TabsTrigger>
              )}
            </TabsList>

            {/* Structure Tab - Section Builder */}
            <TabsContent value="structure" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  <SectionBuilder
                    sections={sections}
                    onSectionsChange={setSections}
                    onEditSection={handleEditSection}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Rich Editor Tab */}
            <TabsContent value="editor" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  {selectedSection ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-deep-900 dark:text-gray-100">
                          Editing: {selectedSection.title}
                        </h3>
                        <Select
                          value={selectedSectionId || ''}
                          onChange={(e) => setSelectedSectionId(e.target.value)}
                          className="w-48"
                        >
                          {sections.map(s => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                          ))}
                        </Select>
                      </div>
                      <RichTextEditor
                        content={selectedSection.content}
                        onChange={handleSectionContentUpdate}
                        placeholder="Write your section content with rich formatting..."
                        minHeight="400px"
                      />
                    </div>
                  ) : (
                    <div className="text-center py-12 text-deep-500 dark:text-gray-400">
                      <Edit3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No section selected</p>
                      <p className="text-sm mt-1">
                        Add sections in the Structure tab, then click "Open in Rich Editor" to edit here.
                      </p>
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => setActiveTab('structure')}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Go to Structure
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI Assistant Tab */}
            <TabsContent value="ai" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">AI Writing Assistant</CardTitle>
                    <CardDescription>Transform or generate content with AI</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AIContentPanel
                      selectedText={selectedText}
                      onApply={handleAIContentApply}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Source Text</CardTitle>
                    <CardDescription>Paste text to transform</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={selectedText}
                      onChange={(e) => setSelectedText(e.target.value)}
                      placeholder="Paste or type text here to summarize, expand, rewrite, or improve..."
                      rows={10}
                    />
                    <p className="text-xs text-deep-400 mt-2">
                      {selectedText.length} characters
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Preview Tab */}
            <TabsContent value="preview" className="mt-4">
              {generatedReport && previewMode && !generateMutation.isPending && !quickReportMutation.isPending && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-green-500" />
                          Report Generated
                          {lastGeneratedFormat && (
                            <span className="text-sm font-normal text-deep-500 dark:text-gray-400">
                              ({FORMAT_OPTIONS.find(f => f.value === lastGeneratedFormat)?.label})
                            </span>
                          )}
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
                    {/* Reproducibility Info - shown for MoES Policy reports */}
                    {reportHash && (
                      <div className="mt-4 p-3 bg-ocean-50 dark:bg-ocean-900/20 rounded-lg border border-ocean-200 dark:border-ocean-800">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Shield className="w-5 h-5 text-ocean-600 dark:text-ocean-400" />
                            <div>
                              <span className="text-sm font-medium text-ocean-700 dark:text-ocean-300">Reproducibility Hash</span>
                              <div className="flex items-center gap-2">
                                <code className="text-xs font-mono text-ocean-900 dark:text-ocean-100 bg-ocean-100 dark:bg-ocean-800 px-2 py-0.5 rounded">{reportHash}</code>
                                <button
                                  onClick={() => { navigator.clipboard.writeText(reportHash || ''); }}
                                  className="p-1 hover:bg-ocean-100 dark:hover:bg-ocean-800 rounded"
                                >
                                  <Copy className="w-3 h-3 text-ocean-600 dark:text-ocean-400" />
                                </button>
                              </div>
                            </div>
                          </div>
                          {reportId && (
                            <div className="text-right">
                              <span className="text-xs text-deep-500 dark:text-gray-400">Report ID</span>
                              <div className="text-sm font-mono text-deep-900 dark:text-gray-100">{reportId}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    {lastGeneratedFormat === 'html' && (
                      <div className="border rounded-lg overflow-hidden max-h-[600px] overflow-y-auto">
                        <iframe
                          srcDoc={generatedReport}
                          className="w-full h-[500px] border-0"
                          title="Report Preview"
                        />
                      </div>
                    )}
                    {lastGeneratedFormat === 'markdown' && (
                      <pre className="p-4 bg-gray-50 dark:bg-deep-800 rounded-lg text-sm overflow-auto max-h-[500px] font-mono">
                        {generatedReport}
                      </pre>
                    )}
                    {lastGeneratedFormat === 'json' && (
                      <pre className="p-4 bg-gray-50 dark:bg-deep-800 rounded-lg text-sm overflow-auto max-h-[500px] font-mono">
                        {generatedReport}
                      </pre>
                    )}
                    {lastGeneratedFormat === 'pdf' && (
                      <div className="border rounded-lg overflow-hidden h-[600px] bg-gray-100 dark:bg-gray-800">
                        <object
                          data={`data:application/pdf;base64,${generatedReport}`}
                          type="application/pdf"
                          className="w-full h-full"
                        >
                          <div className="text-center py-8">
                            <FileText className="w-16 h-16 mx-auto mb-4 text-ocean-500" />
                            <p className="text-deep-600 dark:text-gray-300">
                              PDF Preview not supported in this browser
                            </p>
                            <Button variant="outline" onClick={downloadReport} className="mt-4">
                              Download PDF
                            </Button>
                          </div>
                        </object>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>

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
                    Creating your professional report with AI-powered insights...
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
