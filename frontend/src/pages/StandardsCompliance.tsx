import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    Shield, FileCheck, Upload, Loader, CheckCircle2, XCircle,
    AlertTriangle, Download, FileText, ChevronRight, Info,
    BarChart3, Award, RefreshCw, FileCode, BookOpen, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

// Standards information
const STANDARDS = [
    { id: 'dwc', name: 'Darwin Core', icon: '🐟', color: 'ocean', description: 'Biodiversity occurrence standard' },
    { id: 'obis', name: 'OBIS Schema', icon: '🌊', color: 'marine', description: 'Ocean biodiversity data' },
    { id: 'mixs', name: 'MIxS 6.0', icon: '🧬', color: 'coral', description: 'eDNA/metabarcoding data' },
    { id: 'iso19115', name: 'ISO 19115', icon: '🗺️', color: 'deep', description: 'Geographic metadata' },
    { id: 'cf', name: 'CF Conventions', icon: '📊', color: 'abyss', description: 'NetCDF climate data' },
];

const EXPORT_FORMATS = [
    { id: 'dwc-a', name: 'Darwin Core Archive', ext: '.zip', icon: FileCode },
    { id: 'obis-csv', name: 'OBIS-CSV', ext: '.csv', icon: FileText },
    { id: 'mixs-json', name: 'MIxS-JSON', ext: '.json', icon: FileCode },
];

interface ValidationResult {
    valid: boolean;
    score: number;
    totalFields: number;
    validFields: number;
    errors: Array<{ field: string; message: string; code: string; severity: string }>;
    warnings: Array<{ field: string; message: string; code: string; severity: string }>;
    standard: string;
    standardName: string;
    requiredFor?: string[];
}

interface ComplianceReport {
    datasetId: string;
    timestamp: string;
    overallScore: number;
    overallValid: boolean;
    standardResults: ValidationResult[];
    summary: {
        totalErrors: number;
        totalWarnings: number;
        passedStandards: string[];
        failedStandards: string[];
    };
    recommendations: string[];
}

interface Grade {
    grade: string;
    label: string;
    color: string;
}

export default function StandardsCompliance() {
    const [files, setFiles] = useState<File[]>([]);
    const [validating, setValidating] = useState(false);
    const [report, setReport] = useState<ComplianceReport | null>(null);
    const [grade, setGrade] = useState<Grade | null>(null);
    const [selectedStandard, setSelectedStandard] = useState<ValidationResult | null>(null);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        setFiles(acceptedFiles);
        setReport(null);
        setGrade(null);
        setSelectedStandard(null);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/json': ['.json'],
            'text/csv': ['.csv'],
        },
        maxFiles: 1,
    });

    const validateMutation = useMutation({
        mutationFn: async (data: any[]) => {
            const response = await fetch('http://localhost:5000/api/standards/report/validation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data }),
            });
            return response.json();
        },
        onSuccess: (data) => {
            if (data.success) {
                setReport(data.report);
                setGrade(data.grade);
                if (data.report.standardResults.length > 0) {
                    setSelectedStandard(data.report.standardResults[0]);
                }
                if (data.report.overallValid) {
                    toast.success(`Compliance check passed! Score: ${data.report.overallScore}%`);
                } else {
                    toast.error(`Compliance issues found. Score: ${data.report.overallScore}%`);
                }
            } else {
                toast.error(data.error || 'Validation failed');
            }
        },
        onError: () => {
            toast.error('Failed to validate data');
        },
    });

    const handleValidate = async () => {
        if (files.length === 0) {
            toast.error('Please upload a file first');
            return;
        }

        setValidating(true);
        try {
            const file = files[0];
            const text = await file.text();
            let data: any[];

            if (file.name.endsWith('.json')) {
                const parsed = JSON.parse(text);
                data = Array.isArray(parsed) ? parsed : [parsed];
            } else {
                // Parse CSV
                const lines = text.split('\n').filter(l => l.trim());
                const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                data = lines.slice(1).map(line => {
                    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                    const obj: any = {};
                    headers.forEach((h, i) => {
                        obj[h] = values[i];
                    });
                    return obj;
                });
            }

            validateMutation.mutate(data);
        } catch (error) {
            console.error('Error parsing file:', error);
            toast.error('Failed to parse file');
        } finally {
            setValidating(false);
        }
    };

    const getGradeColor = (gradeVal: string) => {
        switch (gradeVal) {
            case 'A': return 'bg-gradient-to-br from-marine-400 to-marine-600 text-white';
            case 'B': return 'bg-gradient-to-br from-ocean-400 to-ocean-600 text-white';
            case 'C': return 'bg-gradient-to-br from-coral-400 to-coral-500 text-white';
            case 'D': return 'bg-gradient-to-br from-orange-400 to-orange-500 text-white';
            default: return 'bg-gradient-to-br from-abyss-400 to-abyss-600 text-white';
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 90) return 'text-marine-600';
        if (score >= 80) return 'text-ocean-600';
        if (score >= 70) return 'text-coral-600';
        if (score >= 60) return 'text-orange-600';
        return 'text-abyss-600';
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Shield className="w-5 h-5 text-ocean-500" />
                        <span className="text-sm font-medium text-ocean-600 dark:text-ocean-400">Data Quality</span>
                    </div>
                    <h1 className="text-3xl lg:text-4xl font-bold text-deep-900 dark:text-white">Standards Compliance</h1>
                    <p className="text-deep-500 dark:text-gray-400 mt-1">
                        Validate your data against international biodiversity standards
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={() => window.open('/api-docs', '_blank')}>
                        <BookOpen className="w-4 h-4 mr-2" />
                        Documentation
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="xl:col-span-2 space-y-6">
                    {/* Upload Zone */}
                    <Card variant="default">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileCheck className="w-5 h-5 text-ocean-500" />
                                Validate Data
                            </CardTitle>
                            <CardDescription>
                                Upload a JSON or CSV file to check compliance with marine data standards
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div
                                {...getRootProps()}
                                className={cn(
                                    "relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300",
                                    isDragActive
                                        ? "border-ocean-400 bg-ocean-50 scale-[1.02]"
                                        : "border-gray-200 hover:border-ocean-300 hover:bg-gray-50"
                                )}
                            >
                                <input {...getInputProps()} />
                                <div className={cn(
                                    "w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center transition-all duration-300",
                                    isDragActive ? "bg-ocean-100 scale-110" : "bg-gray-100"
                                )}>
                                    <Upload className={cn(
                                        "w-8 h-8 transition-colors",
                                        isDragActive ? "text-ocean-600" : "text-gray-400"
                                    )} />
                                </div>
                                {files.length > 0 ? (
                                    <div>
                                        <p className="text-lg font-semibold text-ocean-600">{files[0].name}</p>
                                        <p className="text-sm text-deep-500 mt-1">Click to change file</p>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-lg font-semibold text-deep-700">Drop your data file here</p>
                                        <p className="text-sm text-deep-500 mt-1">JSON or CSV format</p>
                                    </div>
                                )}
                            </div>

                            <Button
                                onClick={handleValidate}
                                disabled={validating || files.length === 0}
                                className="w-full mt-4"
                                variant="premium"
                                size="lg"
                            >
                                {validating ? (
                                    <>
                                        <Loader className="w-5 h-5 mr-2 animate-spin" />
                                        Validating...
                                    </>
                                ) : (
                                    <>
                                        <Shield className="w-5 h-5 mr-2" />
                                        Check Compliance
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Validation Results */}
                    {report && (
                        <Card variant="default">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="flex items-center gap-2">
                                            <BarChart3 className="w-5 h-5 text-ocean-500" />
                                            Validation Results
                                        </CardTitle>
                                        <CardDescription>
                                            {report.standardResults.length} standard(s) checked
                                        </CardDescription>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => setReport(null)}>
                                        <RefreshCw className="w-4 h-4 mr-1" />
                                        Clear
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {/* Standards List */}
                                <div className="space-y-2 mb-6">
                                    {report.standardResults.map((result) => (
                                        <button
                                            key={result.standard}
                                            onClick={() => setSelectedStandard(result)}
                                            className={cn(
                                                "w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                                                selectedStandard?.standard === result.standard
                                                    ? "border-ocean-400 bg-ocean-50"
                                                    : "border-gray-100 hover:border-gray-200 bg-gray-50/50"
                                            )}
                                        >
                                            <div className={cn(
                                                "p-2 rounded-lg",
                                                result.valid ? "bg-marine-100" : "bg-abyss-100"
                                            )}>
                                                {result.valid ? (
                                                    <CheckCircle2 className="w-5 h-5 text-marine-600" />
                                                ) : (
                                                    <XCircle className="w-5 h-5 text-abyss-600" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-deep-900">{result.standardName}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Progress
                                                        value={result.score}
                                                        size="sm"
                                                        className="flex-1 max-w-32"
                                                        variant={result.score >= 80 ? 'success' : result.score >= 50 ? 'default' : 'destructive'}
                                                    />
                                                    <span className={cn("text-sm font-bold", getScoreColor(result.score))}>
                                                        {result.score}%
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {result.errors.length > 0 && (
                                                    <Badge variant="destructive" className="text-xs">
                                                        {result.errors.length} errors
                                                    </Badge>
                                                )}
                                                {result.warnings.length > 0 && (
                                                    <Badge variant="warning" className="text-xs">
                                                        {result.warnings.length} warnings
                                                    </Badge>
                                                )}
                                                <ChevronRight className="w-4 h-4 text-gray-400" />
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {/* Selected Standard Details */}
                                {selectedStandard && (
                                    <div className="border-t pt-4">
                                        <h4 className="font-semibold text-deep-900 mb-3 flex items-center gap-2">
                                            <Info className="w-4 h-4 text-ocean-500" />
                                            {selectedStandard.standardName} Details
                                        </h4>

                                        {/* Errors */}
                                        {selectedStandard.errors.length > 0 && (
                                            <div className="mb-4">
                                                <p className="text-sm font-medium text-abyss-600 mb-2 flex items-center gap-1">
                                                    <XCircle className="w-4 h-4" />
                                                    Errors ({selectedStandard.errors.length})
                                                </p>
                                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                                    {selectedStandard.errors.slice(0, 10).map((error, i) => (
                                                        <div key={i} className="p-3 bg-abyss-50 rounded-lg border border-abyss-100">
                                                            <p className="text-sm text-abyss-700">
                                                                <span className="font-mono text-xs bg-abyss-100 px-1 rounded mr-2">
                                                                    {error.field}
                                                                </span>
                                                                {error.message}
                                                            </p>
                                                        </div>
                                                    ))}
                                                    {selectedStandard.errors.length > 10 && (
                                                        <p className="text-xs text-deep-500 text-center pt-2">
                                                            ... and {selectedStandard.errors.length - 10} more errors
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Warnings */}
                                        {selectedStandard.warnings.length > 0 && (
                                            <div>
                                                <p className="text-sm font-medium text-coral-600 mb-2 flex items-center gap-1">
                                                    <AlertTriangle className="w-4 h-4" />
                                                    Warnings ({selectedStandard.warnings.length})
                                                </p>
                                                <div className="space-y-2 max-h-32 overflow-y-auto">
                                                    {selectedStandard.warnings.slice(0, 5).map((warning, i) => (
                                                        <div key={i} className="p-3 bg-coral-50 rounded-lg border border-coral-100">
                                                            <p className="text-sm text-coral-700">
                                                                <span className="font-mono text-xs bg-coral-100 px-1 rounded mr-2">
                                                                    {warning.field}
                                                                </span>
                                                                {warning.message}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {selectedStandard.errors.length === 0 && selectedStandard.warnings.length === 0 && (
                                            <div className="text-center py-8">
                                                <CheckCircle2 className="w-12 h-12 text-marine-500 mx-auto mb-3" />
                                                <p className="text-marine-700 font-medium">Perfect compliance!</p>
                                                <p className="text-sm text-deep-500">No errors or warnings found</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Overall Score Card */}
                    {report && grade && (
                        <Card variant="premium" className="overflow-hidden">
                            <CardContent className="p-6">
                                <div className="text-center">
                                    <div className={cn(
                                        "w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg",
                                        getGradeColor(grade.grade)
                                    )}>
                                        <span className="text-4xl font-bold">{grade.grade}</span>
                                    </div>
                                    <p className="text-2xl font-bold text-deep-900 dark:text-white">{report.overallScore}%</p>
                                    <p className="text-sm text-deep-500 dark:text-gray-400 capitalize">{grade.label}</p>

                                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                        <div className="flex justify-around text-center">
                                            <div>
                                                <p className="text-2xl font-bold text-abyss-600">{report.summary.totalErrors}</p>
                                                <p className="text-xs text-deep-500">Errors</p>
                                            </div>
                                            <div>
                                                <p className="text-2xl font-bold text-coral-600">{report.summary.totalWarnings}</p>
                                                <p className="text-xs text-deep-500">Warnings</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Recommendations */}
                    {report && report.recommendations.length > 0 && (
                        <Card variant="glass">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-ocean-500" />
                                    Recommendations
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2">
                                    {report.recommendations.map((rec, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-deep-600">
                                            <CheckCircle2 className="w-4 h-4 text-ocean-500 mt-0.5 flex-shrink-0" />
                                            <span>{rec}</span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    )}

                    {/* Export Options */}
                    {report && report.overallValid && (
                        <Card variant="default">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Download className="w-4 h-4 text-ocean-500" />
                                    Export Formats
                                </CardTitle>
                                <CardDescription>Download standards-compliant versions</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {EXPORT_FORMATS.map((format) => (
                                        <Button
                                            key={format.id}
                                            variant="outline"
                                            className="w-full justify-start"
                                            onClick={() => toast.success(`${format.name} export coming soon!`)}
                                        >
                                            <format.icon className="w-4 h-4 mr-2" />
                                            {format.name}
                                            <span className="ml-auto text-xs text-deep-400">{format.ext}</span>
                                        </Button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Supported Standards */}
                    <Card variant="default">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Award className="w-4 h-4 text-ocean-500" />
                                Supported Standards
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {STANDARDS.map((std) => (
                                    <div key={std.id} className="flex items-center gap-3">
                                        <span className="text-xl">{std.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-deep-900 dark:text-gray-100">{std.name}</p>
                                            <p className="text-xs text-deep-500 dark:text-gray-400">{std.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
