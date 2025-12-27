import { useState, useCallback } from 'react';
import {
    GripVertical, ChevronDown, ChevronUp, Copy, Trash2,
    Plus, FileText, LayoutTemplate, BarChart3, Edit2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import ChartEditor from './ChartEditor';

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

interface SectionBuilderProps {
    sections: ReportSection[];
    onSectionsChange: (sections: ReportSection[]) => void;
    onEditSection?: (sectionId: string, field: 'content') => void;
    className?: string;
}

const SECTION_TEMPLATES = [
    { id: 'introduction', title: 'Introduction', content: 'Provide an overview of the study objectives, scope, and significance.' },
    { id: 'methods', title: 'Methods', content: 'Describe the data collection and analysis methods used.' },
    { id: 'results', title: 'Results', content: 'Present the main findings from the analysis.' },
    { id: 'discussion', title: 'Discussion', content: 'Interpret the results and discuss their implications.' },
    { id: 'conclusion', title: 'Conclusion', content: 'Summarize the key findings and recommendations.' },
    { id: 'references', title: 'References', content: 'List all cited sources and references.' },
];

export default function SectionBuilder({
    sections,
    onSectionsChange,
    onEditSection,
    className
}: SectionBuilderProps) {
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(sections.map(s => s.id)));
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [showTemplates, setShowTemplates] = useState(false);

    // Toggle section expand/collapse
    const toggleSection = (id: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Add a new section
    const addSection = useCallback((template?: typeof SECTION_TEMPLATES[0]) => {
        const newSection: ReportSection = {
            id: Date.now().toString(),
            title: template?.title || 'New Section',
            content: template?.content || '',
            level: 1,
            key_findings: [],
            bullet_points: [],
            chart_type: 'none',
        };
        onSectionsChange([...sections, newSection]);
        setExpandedSections(prev => new Set([...prev, newSection.id]));
        setShowTemplates(false);
    }, [sections, onSectionsChange]);

    // Duplicate a section
    const duplicateSection = (id: string) => {
        const section = sections.find(s => s.id === id);
        if (section) {
            const newSection = {
                ...section,
                id: Date.now().toString(),
                title: `${section.title} (Copy)`,
            };
            const index = sections.findIndex(s => s.id === id);
            const newSections = [...sections];
            newSections.splice(index + 1, 0, newSection);
            onSectionsChange(newSections);
            setExpandedSections(prev => new Set([...prev, newSection.id]));
        }
    };

    // Remove a section
    const removeSection = (id: string) => {
        onSectionsChange(sections.filter(s => s.id !== id));
        setExpandedSections(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    // Update section
    const updateSection = (id: string, updates: Partial<ReportSection>) => {
        onSectionsChange(sections.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    // Add key finding
    const addKeyFinding = (sectionId: string) => {
        onSectionsChange(sections.map(s =>
            s.id === sectionId
                ? { ...s, key_findings: [...s.key_findings, ''] }
                : s
        ));
    };

    // Update key finding
    const updateKeyFinding = (sectionId: string, index: number, value: string) => {
        onSectionsChange(sections.map(s =>
            s.id === sectionId
                ? { ...s, key_findings: s.key_findings.map((f, i) => i === index ? value : f) }
                : s
        ));
    };

    // Remove key finding
    const removeKeyFinding = (sectionId: string, index: number) => {
        onSectionsChange(sections.map(s =>
            s.id === sectionId
                ? { ...s, key_findings: s.key_findings.filter((_, i) => i !== index) }
                : s
        ));
    };

    // Drag and drop handlers
    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedId || draggedId === targetId) return;

        const draggedIndex = sections.findIndex(s => s.id === draggedId);
        const targetIndex = sections.findIndex(s => s.id === targetId);

        const newSections = [...sections];
        const [removed] = newSections.splice(draggedIndex, 1);
        newSections.splice(targetIndex, 0, removed);

        onSectionsChange(newSections);
        setDraggedId(null);
    };

    const handleDragEnd = () => {
        setDraggedId(null);
    };

    return (
        <div className={cn("space-y-4", className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="font-medium text-deep-900 dark:text-gray-100">
                    Report Sections ({sections.length})
                </h3>
                <div className="flex gap-2">
                    <div className="relative">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowTemplates(!showTemplates)}
                        >
                            <LayoutTemplate className="w-4 h-4 mr-1" />
                            Templates
                        </Button>

                        {/* Template Dropdown */}
                        {showTemplates && (
                            <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-deep-800 rounded-lg shadow-lg border z-10">
                                <div className="p-2 space-y-1">
                                    <p className="text-xs font-medium text-deep-500 px-2 py-1">Quick Templates</p>
                                    {SECTION_TEMPLATES.map((template) => (
                                        <button
                                            key={template.id}
                                            onClick={() => addSection(template)}
                                            className="w-full flex items-center gap-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left transition-colors"
                                        >
                                            <FileText className="w-4 h-4 text-ocean-500" />
                                            <span className="text-sm text-deep-700 dark:text-gray-200">{template.title}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <Button size="sm" onClick={() => addSection()}>
                        <Plus className="w-4 h-4 mr-1" />
                        Add Section
                    </Button>
                </div>
            </div>

            {/* Empty State */}
            {sections.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-deep-300 dark:text-gray-600" />
                    <p className="text-deep-600 dark:text-gray-400 mb-2">No sections added yet</p>
                    <p className="text-sm text-deep-400 dark:text-gray-500 mb-4">
                        Add sections to build your report structure
                    </p>
                    <div className="flex justify-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setShowTemplates(true)}>
                            <LayoutTemplate className="w-4 h-4 mr-1" />
                            Use Template
                        </Button>
                        <Button size="sm" onClick={() => addSection()}>
                            <Plus className="w-4 h-4 mr-1" />
                            Blank Section
                        </Button>
                    </div>
                </div>
            ) : (
                /* Section List */
                <div className="space-y-3">
                    {sections.map((section, index) => {
                        const isExpanded = expandedSections.has(section.id);
                        const isDragging = draggedId === section.id;

                        return (
                            <div
                                key={section.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, section.id)}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, section.id)}
                                onDragEnd={handleDragEnd}
                                className={cn(
                                    "border rounded-lg bg-white dark:bg-deep-800 transition-all",
                                    isDragging && "opacity-50 border-ocean-500 border-dashed"
                                )}
                            >
                                {/* Section Header */}
                                <div className="flex items-center gap-2 p-3">
                                    <div className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                                        <GripVertical className="w-4 h-4 text-deep-400" />
                                    </div>

                                    <span className="w-6 h-6 flex items-center justify-center rounded bg-ocean-100 dark:bg-ocean-900/30 text-ocean-600 dark:text-ocean-400 text-xs font-medium">
                                        {index + 1}
                                    </span>

                                    <Input
                                        value={section.title}
                                        onChange={(e) => updateSection(section.id, { title: e.target.value })}
                                        className="flex-1 font-medium border-0 bg-transparent focus:ring-0 p-0"
                                        placeholder="Section Title"
                                    />

                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => duplicateSection(section.id)}
                                            className="p-1.5 text-deep-400 hover:text-ocean-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                            title="Duplicate section"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => removeSection(section.id)}
                                            className="p-1.5 text-deep-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                            title="Delete section"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => toggleSection(section.id)}
                                            className="p-1.5 text-deep-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                        >
                                            {isExpanded ? (
                                                <ChevronUp className="w-4 h-4" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Section Content */}
                                {isExpanded && (
                                    <div className="px-3 pb-3 space-y-3 border-t">
                                        {/* Content Editor */}
                                        <div className="pt-3">
                                            <label className="text-xs font-medium text-deep-500 mb-1 block">Content</label>
                                            <Textarea
                                                value={section.content}
                                                onChange={(e) => updateSection(section.id, { content: e.target.value })}
                                                placeholder="Write your section content here..."
                                                rows={4}
                                                className="text-sm"
                                            />
                                            {onEditSection && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="mt-1 text-xs"
                                                    onClick={() => onEditSection(section.id, 'content')}
                                                >
                                                    Open in Rich Editor
                                                </Button>
                                            )}
                                        </div>

                                        {/* Key Findings */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-medium text-deep-500">Key Findings</label>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 text-xs"
                                                    onClick={() => addKeyFinding(section.id)}
                                                >
                                                    <Plus className="w-3 h-3 mr-1" />
                                                    Add
                                                </Button>
                                            </div>
                                            <div className="space-y-2">
                                                {section.key_findings.map((finding, i) => (
                                                    <div key={i} className="flex items-center gap-2">
                                                        <span className="text-xs text-deep-400 w-4">{i + 1}.</span>
                                                        <Input
                                                            value={finding}
                                                            onChange={(e) => updateKeyFinding(section.id, i, e.target.value)}
                                                            placeholder={`Finding ${i + 1}`}
                                                            className="flex-1 text-sm h-8"
                                                        />
                                                        <button
                                                            onClick={() => removeKeyFinding(section.id, i)}
                                                            className="p-1 text-deep-400 hover:text-red-500"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                                {section.key_findings.length === 0 && (
                                                    <p className="text-xs text-deep-400 italic">No key findings added</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Chart Type */}
                                        <div className="flex items-center gap-3">
                                            <BarChart3 className="w-4 h-4 text-deep-400" />
                                            <label className="text-xs font-medium text-deep-500">Include Chart</label>
                                            <Select
                                                value={section.chart_type || 'none'}
                                                onChange={(e) => updateSection(section.id, { chart_type: e.target.value as any })}
                                                className="flex-1 h-8 text-sm"
                                            >
                                                <option value="none">No Chart</option>
                                                <option value="bar">Bar Chart</option>
                                                <option value="pie">Pie Chart</option>
                                                <option value="line">Line Chart</option>
                                                <option value="area">Area Chart</option>
                                            </Select>
                                        </div>

                                        {/* Chart Data Editor */}
                                        {section.chart_type && section.chart_type !== 'none' && (
                                            <div className="mt-3 pt-3 border-t">
                                                <ChartEditor
                                                    chartType={section.chart_type}
                                                    chartData={section.chart_data || {}}
                                                    onChartTypeChange={(type) => updateSection(section.id, { chart_type: type })}
                                                    onChartDataChange={(data) => updateSection(section.id, { chart_data: data })}
                                                    compact
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
