import { create } from 'zustand';

/**
 * Fisheries Session Store
 * Persists fisheries analysis data across tab switches and navigation
 * Data clears when browser tab is closed (no persist middleware)
 */

interface FisheriesSessionState {
    // Species selection
    selectedSpecies: string;
    setSelectedSpecies: (species: string) => void;

    // Raw API response from analyzeWithData - stores everything as-is
    analysisData: any | null;
    setAnalysisData: (data: any | null) => void;

    // Clear all session data
    clearSession: () => void;
}

export const useFisheriesStore = create<FisheriesSessionState>()((set) => ({
    // Initial state
    selectedSpecies: '',
    analysisData: null,

    // Setters
    setSelectedSpecies: (species) => set({ selectedSpecies: species }),
    setAnalysisData: (data) => set({ analysisData: data }),

    // Clear all
    clearSession: () => set({
        selectedSpecies: '',
        analysisData: null,
    }),
}));
