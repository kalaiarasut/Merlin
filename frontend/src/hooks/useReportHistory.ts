import { useState, useCallback, useEffect, useRef } from 'react';

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

interface ReportState {
    reportType: string;
    title: string;
    abstract: string;
    keywords: string[];
    sections: ReportSection[];
}

interface UseReportHistoryOptions {
    maxHistory?: number;
    debounceMs?: number;
}

interface UseReportHistoryReturn {
    // State
    canUndo: boolean;
    canRedo: boolean;
    historyIndex: number;
    historyLength: number;

    // Actions
    pushState: (state: ReportState) => void;
    undo: () => ReportState | null;
    redo: () => ReportState | null;
    clear: () => void;
}

/**
 * Hook for managing report editing history with undo/redo functionality.
 * Supports keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y)
 */
export function useReportHistory(
    currentState: ReportState,
    onStateChange: (state: ReportState) => void,
    options: UseReportHistoryOptions = {}
): UseReportHistoryReturn {
    const { maxHistory = 50, debounceMs = 500 } = options;

    // History stack
    const [history, setHistory] = useState<ReportState[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Debounce timer
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);
    const lastPushedState = useRef<string>('');

    // Push new state to history (debounced to avoid flooding)
    const pushState = useCallback((state: ReportState) => {
        // Clear existing timer
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        // Debounce the push
        debounceTimer.current = setTimeout(() => {
            const stateString = JSON.stringify(state);

            // Don't push if same as last state
            if (stateString === lastPushedState.current) return;

            lastPushedState.current = stateString;

            setHistory(prev => {
                // If we're not at the end, truncate forward history
                const newHistory = historyIndex < prev.length - 1
                    ? prev.slice(0, historyIndex + 1)
                    : [...prev];

                // Add new state
                newHistory.push(JSON.parse(stateString));

                // Trim if exceeds max
                if (newHistory.length > maxHistory) {
                    newHistory.shift();
                }

                return newHistory;
            });

            setHistoryIndex(prev => Math.min(prev + 1, maxHistory - 1));
        }, debounceMs);
    }, [historyIndex, maxHistory, debounceMs]);

    // Undo - go back in history
    const undo = useCallback((): ReportState | null => {
        if (historyIndex <= 0) return null;

        const newIndex = historyIndex - 1;
        const previousState = history[newIndex];

        if (previousState) {
            setHistoryIndex(newIndex);
            onStateChange(previousState);
            return previousState;
        }

        return null;
    }, [history, historyIndex, onStateChange]);

    // Redo - go forward in history
    const redo = useCallback((): ReportState | null => {
        if (historyIndex >= history.length - 1) return null;

        const newIndex = historyIndex + 1;
        const nextState = history[newIndex];

        if (nextState) {
            setHistoryIndex(newIndex);
            onStateChange(nextState);
            return nextState;
        }

        return null;
    }, [history, historyIndex, onStateChange]);

    // Clear all history
    const clear = useCallback(() => {
        setHistory([]);
        setHistoryIndex(-1);
        lastPushedState.current = '';
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check for Ctrl/Cmd key
            const isCtrl = e.ctrlKey || e.metaKey;

            if (!isCtrl) return;

            // Undo: Ctrl+Z
            if (e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            }

            // Redo: Ctrl+Shift+Z or Ctrl+Y
            if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
                e.preventDefault();
                redo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

    // Initialize with current state
    useEffect(() => {
        if (history.length === 0 && currentState.sections.length > 0) {
            setHistory([currentState]);
            setHistoryIndex(0);
            lastPushedState.current = JSON.stringify(currentState);
        }
    }, []);

    return {
        canUndo: historyIndex > 0,
        canRedo: historyIndex < history.length - 1,
        historyIndex,
        historyLength: history.length,
        pushState,
        undo,
        redo,
        clear,
    };
}

/**
 * Hook for keyboard shortcuts in the report editor
 */
export function useKeyboardShortcuts(shortcuts: {
    onSave?: () => void;
    onGenerate?: () => void;
    onPreview?: () => void;
    onNewSection?: () => void;
}) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isCtrl = e.ctrlKey || e.metaKey;

            if (!isCtrl) return;

            switch (e.key.toLowerCase()) {
                case 's':
                    // Ctrl+S - Save
                    if (shortcuts.onSave) {
                        e.preventDefault();
                        shortcuts.onSave();
                    }
                    break;

                case 'g':
                    // Ctrl+G - Generate report
                    if (shortcuts.onGenerate) {
                        e.preventDefault();
                        shortcuts.onGenerate();
                    }
                    break;

                case 'p':
                    // Ctrl+P - Preview (if not printing)
                    if (e.shiftKey && shortcuts.onPreview) {
                        e.preventDefault();
                        shortcuts.onPreview();
                    }
                    break;

                case 'n':
                    // Ctrl+N - New section
                    if (e.shiftKey && shortcuts.onNewSection) {
                        e.preventDefault();
                        shortcuts.onNewSection();
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcuts]);
}
