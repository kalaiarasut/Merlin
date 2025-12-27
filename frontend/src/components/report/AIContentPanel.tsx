import { useState } from 'react';
import {
    Sparkles, Wand2, Maximize2, Minimize2, RefreshCw,
    Loader2, ChevronDown, ChevronUp, Lightbulb,
    MessageSquare, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { aiService } from '@/services/api';

interface AIContentPanelProps {
    selectedText: string;
    onApply: (newContent: string) => void;
    className?: string;
}

type AIAction = 'summarize' | 'expand' | 'rewrite' | 'generate' | 'improve';

interface AIActionConfig {
    id: AIAction;
    label: string;
    icon: typeof Sparkles;
    description: string;
    prompt: (text: string) => string;
    color: string;
}

const AI_ACTIONS: AIActionConfig[] = [
    {
        id: 'summarize',
        label: 'Summarize',
        icon: Minimize2,
        description: 'Condense into key points',
        prompt: (text) => `Summarize the following text concisely, keeping only the most important points:\n\n${text}`,
        color: 'text-blue-500'
    },
    {
        id: 'expand',
        label: 'Expand',
        icon: Maximize2,
        description: 'Add more detail',
        prompt: (text) => `Expand the following text with more detail, examples, and explanations while maintaining the same style and tone:\n\n${text}`,
        color: 'text-green-500'
    },
    {
        id: 'rewrite',
        label: 'Rewrite',
        icon: RefreshCw,
        description: 'Improve clarity & flow',
        prompt: (text) => `Rewrite the following text to improve clarity, readability, and professional tone while keeping the same meaning:\n\n${text}`,
        color: 'text-purple-500'
    },
    {
        id: 'improve',
        label: 'Improve',
        icon: Wand2,
        description: 'Fix grammar & style',
        prompt: (text) => `Improve the following text by fixing any grammar issues, improving word choice, and enhancing the writing style:\n\n${text}`,
        color: 'text-orange-500'
    },
    {
        id: 'generate',
        label: 'Generate',
        icon: Sparkles,
        description: 'Create from prompt',
        prompt: (text) => `Based on the following topic or prompt, generate well-written content suitable for a professional research report:\n\n${text}`,
        color: 'text-ocean-500'
    }
];

export default function AIContentPanel({ selectedText, onApply, className }: AIContentPanelProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [activeAction, setActiveAction] = useState<AIAction | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<string>('');
    const [customPrompt, setCustomPrompt] = useState('');
    const [showCustom, setShowCustom] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');

    const handleAction = async (action: AIActionConfig) => {
        if (!selectedText && action.id !== 'generate') {
            return;
        }

        setActiveAction(action.id);
        setIsProcessing(true);
        setResult('');
        setStreamingContent('');

        try {
            const prompt = action.prompt(selectedText || customPrompt);
            let fullContent = '';

            // Use streaming for real-time feedback
            for await (const chunk of aiService.chatStream(prompt)) {
                if (chunk.type === 'token') {
                    fullContent += chunk.content;
                    setStreamingContent(fullContent);
                } else if (chunk.type === 'done') {
                    fullContent = chunk.content;
                } else if (chunk.type === 'error') {
                    throw new Error(chunk.content);
                }
            }

            setResult(fullContent);
            setStreamingContent('');
        } catch (error) {
            console.error('AI action failed:', error);
            setResult('Sorry, AI processing failed. Please try again.');
        } finally {
            setIsProcessing(false);
            setActiveAction(null);
        }
    };

    const handleCustomGenerate = async () => {
        if (!customPrompt.trim()) return;

        const generateAction = AI_ACTIONS.find(a => a.id === 'generate')!;
        await handleAction({ ...generateAction, prompt: () => customPrompt });
    };

    const handleApply = () => {
        if (result) {
            onApply(result);
            setResult('');
        }
    };

    return (
        <div className={cn(
            "border rounded-lg bg-gradient-to-br from-ocean-50 to-marine-50 dark:from-ocean-900/20 dark:to-marine-900/20",
            className
        )}>
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-3 hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-ocean-500" />
                    <span className="text-sm font-medium text-deep-900 dark:text-gray-100">
                        {selectedText ? `${selectedText.length} characters selected` : 'Select text to transform'}
                    </span>
                </div>
                {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-deep-400" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-deep-400" />
                )}
            </button>

            {/* Content */}
            {isExpanded && (
                <div className="px-3 pb-3 space-y-3">
                    {/* Quick Actions */}
                    <div className="grid grid-cols-5 gap-1">
                        {AI_ACTIONS.map((action) => {
                            const Icon = action.icon;
                            const isActive = activeAction === action.id;
                            const isDisabled = isProcessing || (!selectedText && action.id !== 'generate');

                            return (
                                <button
                                    key={action.id}
                                    onClick={() => action.id === 'generate' ? setShowCustom(!showCustom) : handleAction(action)}
                                    disabled={isDisabled}
                                    title={action.description}
                                    className={cn(
                                        "flex flex-col items-center gap-1 p-2 rounded-lg transition-all",
                                        "hover:bg-white dark:hover:bg-white/10",
                                        "disabled:opacity-50 disabled:cursor-not-allowed",
                                        isActive && "bg-white dark:bg-white/10 ring-2 ring-ocean-500"
                                    )}
                                >
                                    {isActive && isProcessing ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-ocean-500" />
                                    ) : (
                                        <Icon className={cn("w-4 h-4", action.color)} />
                                    )}
                                    <span className="text-[10px] font-medium text-deep-600 dark:text-gray-300">
                                        {action.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Custom Prompt */}
                    {showCustom && (
                        <div className="space-y-2">
                            <Textarea
                                value={customPrompt}
                                onChange={(e) => setCustomPrompt(e.target.value)}
                                placeholder="Describe what you want to generate..."
                                rows={2}
                                className="text-sm"
                            />
                            <Button
                                size="sm"
                                variant="premium"
                                className="w-full"
                                onClick={handleCustomGenerate}
                                disabled={!customPrompt.trim() || isProcessing}
                            >
                                {isProcessing ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Zap className="w-4 h-4 mr-2" />
                                )}
                                Generate Content
                            </Button>
                        </div>
                    )}

                    {/* Streaming Preview */}
                    {streamingContent && (
                        <div className="p-3 bg-white dark:bg-deep-800 rounded-lg border">
                            <div className="flex items-center gap-2 mb-2">
                                <Loader2 className="w-4 h-4 animate-spin text-ocean-500" />
                                <span className="text-xs font-medium text-ocean-600 dark:text-ocean-400">
                                    Generating...
                                </span>
                            </div>
                            <p className="text-sm text-deep-700 dark:text-gray-300 whitespace-pre-wrap">
                                {streamingContent}
                                <span className="animate-pulse">▌</span>
                            </p>
                        </div>
                    )}

                    {/* Result */}
                    {result && !streamingContent && (
                        <div className="p-3 bg-white dark:bg-deep-800 rounded-lg border space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Lightbulb className="w-4 h-4 text-yellow-500" />
                                    <span className="text-xs font-medium text-deep-600 dark:text-gray-300">
                                        AI Result
                                    </span>
                                </div>
                                <span className="text-xs text-deep-400">
                                    {result.length} characters
                                </span>
                            </div>
                            <p className="text-sm text-deep-700 dark:text-gray-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                                {result}
                            </p>
                            <div className="flex gap-2">
                                <Button size="sm" variant="premium" onClick={handleApply} className="flex-1">
                                    Apply to Report
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setResult('')}>
                                    Discard
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Tips */}
                    {!result && !streamingContent && !showCustom && (
                        <div className="flex items-start gap-2 p-2 bg-white/50 dark:bg-white/5 rounded-lg">
                            <MessageSquare className="w-4 h-4 text-ocean-500 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-deep-500 dark:text-gray-400">
                                <strong>Tip:</strong> Select text in the editor, then click an action to transform it.
                                Or use "Generate" to create new content from a prompt.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
