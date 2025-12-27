import { useState } from 'react';
import {
    Save, Download, Upload,
    Trash2, Star, StarOff, Plus, Check,
    FileText, BarChart3, Compass, Leaf, LucideIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

interface ReportTemplate {
    id: string;
    name: string;
    description: string;
    icon: LucideIcon | string;
    reportType: string;
    title: string;
    abstract: string;
    keywords: string[];
    sections: ReportSection[];
    isFavorite: boolean;
    isBuiltIn: boolean;
    createdAt: Date;
}

interface ReportTemplatesProps {
    currentConfig: {
        reportType: string;
        title: string;
        abstract: string;
        keywords: string[];
        sections: ReportSection[];
    };
    onApplyTemplate: (template: Partial<ReportTemplate>) => void;
    className?: string;
}

// Built-in templates
const BUILT_IN_TEMPLATES: Omit<ReportTemplate, 'createdAt'>[] = [
    {
        id: 'scientific-paper',
        name: 'Scientific',
        description: 'Standard scientific paper structure with IMRAD format',
        icon: FileText,
        reportType: 'custom',
        title: 'Research Paper',
        abstract: '',
        keywords: ['research', 'analysis', 'findings'],
        isFavorite: false,
        isBuiltIn: true,
        sections: [
            { id: '1', title: 'Abstract', content: 'A brief summary of the research objectives, methods, results, and conclusions.', level: 1, key_findings: [], bullet_points: [], chart_type: 'none' },
            { id: '2', title: 'Introduction', content: 'Background information, research questions, and study objectives.', level: 1, key_findings: [], bullet_points: [], chart_type: 'none' },
            { id: '3', title: 'Methods', content: 'Detailed description of data collection, sampling, and analysis methods.', level: 1, key_findings: [], bullet_points: [], chart_type: 'none' },
            { id: '4', title: 'Results', content: 'Presentation of findings with supporting data and visualizations.', level: 1, key_findings: [], bullet_points: [], chart_type: 'bar' },
            { id: '5', title: 'Discussion', content: 'Interpretation of results, limitations, and implications.', level: 1, key_findings: [], bullet_points: [], chart_type: 'none' },
            { id: '6', title: 'Conclusion', content: 'Summary of key findings and recommendations.', level: 1, key_findings: [], bullet_points: [], chart_type: 'none' },
            { id: '7', title: 'References', content: '', level: 1, key_findings: [], bullet_points: [], chart_type: 'none' },
        ],
    },
    {
        id: 'executive-summary',
        name: 'Executive',
        description: 'Concise report for decision makers',
        icon: BarChart3,
        reportType: 'custom',
        title: 'Executive Summary Report',
        abstract: '',
        keywords: ['summary', 'recommendations', 'key findings'],
        isFavorite: false,
        isBuiltIn: true,
        sections: [
            { id: '1', title: 'Executive Summary', content: 'High-level overview of the most important findings and recommendations.', level: 1, key_findings: ['Key finding 1', 'Key finding 2', 'Key finding 3'], bullet_points: [], chart_type: 'pie' },
            { id: '2', title: 'Key Metrics', content: 'Essential metrics and KPIs at a glance.', level: 1, key_findings: [], bullet_points: [], chart_type: 'bar' },
            { id: '3', title: 'Recommendations', content: 'Actionable recommendations based on the analysis.', level: 1, key_findings: [], bullet_points: [], chart_type: 'none' },
            { id: '4', title: 'Next Steps', content: 'Proposed timeline and action items.', level: 1, key_findings: [], bullet_points: [], chart_type: 'none' },
        ],
    },
    {
        id: 'field-survey',
        name: 'Field Survey',
        description: 'Template for field survey documentation',
        icon: Compass,
        reportType: 'survey_summary',
        title: 'Field Survey Report',
        abstract: '',
        keywords: ['survey', 'field work', 'observations', 'marine'],
        isFavorite: false,
        isBuiltIn: true,
        sections: [
            { id: '1', title: 'Survey Overview', content: 'Date, location, team members, and survey objectives.', level: 1, key_findings: [], bullet_points: [], chart_type: 'none' },
            { id: '2', title: 'Site Description', content: 'Physical characteristics, environmental conditions, and habitat type.', level: 1, key_findings: [], bullet_points: [], chart_type: 'none' },
            { id: '3', title: 'Species Observations', content: 'List of species observed with abundance estimates.', level: 1, key_findings: [], bullet_points: [], chart_type: 'bar' },
            { id: '4', title: 'Environmental Parameters', content: 'Temperature, salinity, depth, and other measurements.', level: 1, key_findings: [], bullet_points: [], chart_type: 'line' },
            { id: '5', title: 'Notable Findings', content: 'Unusual observations, rare species, or significant events.', level: 1, key_findings: [], bullet_points: [], chart_type: 'none' },
            { id: '6', title: 'Photos & Evidence', content: 'Documentation of observations.', level: 1, key_findings: [], bullet_points: [], chart_type: 'none' },
        ],
    },
    {
        id: 'biodiversity-assessment',
        name: 'Biodiversity',
        description: 'Comprehensive biodiversity analysis report',
        icon: Leaf,
        reportType: 'biodiversity',
        title: 'Biodiversity Assessment Report',
        abstract: '',
        keywords: ['biodiversity', 'species richness', 'diversity index', 'marine'],
        isFavorite: false,
        isBuiltIn: true,
        sections: [
            { id: '1', title: 'Study Area', content: 'Geographic scope and sampling locations.', level: 1, key_findings: [], bullet_points: [], chart_type: 'none' },
            { id: '2', title: 'Species Inventory', content: 'Complete list of species identified.', level: 1, key_findings: [], bullet_points: [], chart_type: 'bar' },
            { id: '3', title: 'Diversity Indices', content: 'Shannon index, Simpson index, and evenness calculations.', level: 1, key_findings: ['Shannon Index: 2.5', 'Simpson Index: 0.85', 'Species Evenness: 0.78'], bullet_points: [], chart_type: 'pie' },
            { id: '4', title: 'Community Composition', content: 'Analysis of taxonomic groups and functional guilds.', level: 1, key_findings: [], bullet_points: [], chart_type: 'area' },
            { id: '5', title: 'Temporal Trends', content: 'Changes in biodiversity over time.', level: 1, key_findings: [], bullet_points: [], chart_type: 'line' },
            { id: '6', title: 'Conservation Status', content: 'Status of threatened or protected species.', level: 1, key_findings: [], bullet_points: [], chart_type: 'none' },
        ],
    },
];

const STORAGE_KEY = 'cmlre-report-templates';

export default function ReportTemplates({ currentConfig, onApplyTemplate, className }: ReportTemplatesProps) {
    const [customTemplates, setCustomTemplates] = useState<ReportTemplate[]>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [newTemplateDesc, setNewTemplateDesc] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

    // Save templates to localStorage
    const saveTemplates = (templates: ReportTemplate[]) => {
        setCustomTemplates(templates);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    };

    // Save current config as template
    const saveAsTemplate = () => {
        if (!newTemplateName.trim()) return;

        const newTemplate: ReportTemplate = {
            id: Date.now().toString(),
            name: newTemplateName,
            description: newTemplateDesc || 'Custom template',
            icon: FileText,
            reportType: currentConfig.reportType,
            title: currentConfig.title,
            abstract: currentConfig.abstract,
            keywords: currentConfig.keywords,
            sections: currentConfig.sections,
            isFavorite: false,
            isBuiltIn: false,
            createdAt: new Date(),
        };

        saveTemplates([...customTemplates, newTemplate]);
        setShowSaveModal(false);
        setNewTemplateName('');
        setNewTemplateDesc('');
    };

    // Delete custom template
    const deleteTemplate = (id: string) => {
        saveTemplates(customTemplates.filter(t => t.id !== id));
    };

    // Toggle favorite
    const toggleFavorite = (id: string) => {
        saveTemplates(customTemplates.map(t =>
            t.id === id ? { ...t, isFavorite: !t.isFavorite } : t
        ));
    };

    // Export template
    const exportTemplate = (template: ReportTemplate) => {
        const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${template.name.replace(/\s+/g, '_').toLowerCase()}_template.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Import template
    const importTemplate = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const template = JSON.parse(e.target?.result as string);
                const newTemplate: ReportTemplate = {
                    ...template,
                    id: Date.now().toString(),
                    isBuiltIn: false,
                    createdAt: new Date(),
                };
                saveTemplates([...customTemplates, newTemplate]);
            } catch (err) {
                console.error('Failed to import template:', err);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const applyTemplate = (template: ReportTemplate) => {
        onApplyTemplate({
            reportType: template.reportType,
            title: template.title,
            abstract: template.abstract,
            keywords: template.keywords,
            sections: template.sections.map(s => ({ ...s, id: Date.now().toString() + Math.random() })),
        });
        setSelectedTemplateId(template.id);
    };

    return (
        <div className={cn("space-y-4", className)}>
            {/* Header */}
            <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                    <input type="file" accept=".json" onChange={importTemplate} className="hidden" />
                    <Button size="sm" variant="ghost" asChild>
                        <span className="flex items-center">
                            <Upload className="w-4 h-4 mr-1" />
                            Import
                        </span>
                    </Button>
                </label>
                <Button size="sm" variant="outline" onClick={() => setShowSaveModal(true)}>
                    <Save className="w-4 h-4 mr-1" />
                    Save Current
                </Button>
            </div>

            {/* Save Modal */}
            {showSaveModal && (
                <div className="p-4 bg-ocean-50 dark:bg-ocean-900/20 rounded-lg border border-ocean-200 dark:border-ocean-800 space-y-3">
                    <h4 className="font-medium text-deep-900 dark:text-gray-100">Save as Template</h4>
                    <Input
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        placeholder="Template name..."
                        className="text-sm"
                    />
                    <Input
                        value={newTemplateDesc}
                        onChange={(e) => setNewTemplateDesc(e.target.value)}
                        placeholder="Description (optional)..."
                        className="text-sm"
                    />
                    <div className="flex gap-2">
                        <Button size="sm" onClick={saveAsTemplate} disabled={!newTemplateName.trim()}>
                            Save Template
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowSaveModal(false)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            {/* Built-in Templates */}
            <div>
                <p className="text-xs font-medium text-deep-500 mb-2">Built-in Templates</p>
                <div className="grid grid-cols-2 gap-2">
                    {BUILT_IN_TEMPLATES.map((template) => {
                        const Icon = template.icon;
                        return (
                            <button
                                key={template.id}
                                onClick={() => applyTemplate({ ...template, createdAt: new Date() })}
                                className={cn(
                                    "p-3 rounded-lg border text-left transition-all hover:border-ocean-400",
                                    selectedTemplateId === template.id
                                        ? "border-ocean-500 bg-ocean-50 dark:bg-ocean-900/20"
                                        : "border-gray-200 dark:border-gray-700"
                                )}
                            >
                                <div className="flex items-start gap-2">
                                    <Icon className="w-5 h-5 text-ocean-500 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1">
                                            <p className="font-medium text-sm text-deep-900 dark:text-gray-100 truncate">
                                                {template.name}
                                            </p>
                                            {selectedTemplateId === template.id && (
                                                <Check className="w-4 h-4 text-ocean-500 flex-shrink-0" />
                                            )}
                                        </div>
                                        <p className="text-xs text-deep-500 dark:text-gray-400 truncate">
                                            {template.description}
                                        </p>
                                        <p className="text-xs text-ocean-500 mt-1">
                                            {template.sections.length} sections
                                        </p>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Custom Templates */}
            {customTemplates.length > 0 && (
                <div>
                    <p className="text-xs font-medium text-deep-500 mb-2">My Templates</p>
                    <div className="space-y-2">
                        {customTemplates.map((template) => (
                            <div
                                key={template.id}
                                className={cn(
                                    "p-3 rounded-lg border flex items-center gap-3 transition-all",
                                    selectedTemplateId === template.id
                                        ? "border-ocean-500 bg-ocean-50 dark:bg-ocean-900/20"
                                        : "border-gray-200 dark:border-gray-700"
                                )}
                            >
                                <button
                                    onClick={() => applyTemplate(template)}
                                    className="flex-1 flex items-center gap-2 text-left"
                                >
                                    {typeof template.icon === 'string'
                                        ? <span className="text-xl">{template.icon}</span>
                                        : <template.icon className="w-5 h-5 text-ocean-500" />
                                    }
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm text-deep-900 dark:text-gray-100 truncate flex items-center gap-1">
                                            {template.name}
                                            {template.isFavorite && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                                        </p>
                                        <p className="text-xs text-deep-500 dark:text-gray-400">
                                            {template.sections.length} sections
                                        </p>
                                    </div>
                                </button>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => toggleFavorite(template.id)}
                                        className="p-1.5 text-deep-400 hover:text-yellow-500"
                                        title="Toggle favorite"
                                    >
                                        {template.isFavorite ? (
                                            <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                                        ) : (
                                            <StarOff className="w-4 h-4" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => exportTemplate(template)}
                                        className="p-1.5 text-deep-400 hover:text-ocean-500"
                                        title="Export template"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => deleteTemplate(template.id)}
                                        className="p-1.5 text-deep-400 hover:text-red-500"
                                        title="Delete template"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Quick Actions */}
            <div className="flex items-center gap-2 pt-2 border-t">
                <Button size="sm" variant="ghost" onClick={() => onApplyTemplate({ sections: [] })}>
                    <Plus className="w-4 h-4 mr-1" />
                    Start Blank
                </Button>
            </div>
        </div>
    );
}
