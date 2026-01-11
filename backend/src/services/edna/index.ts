/**
 * eDNA Analysis Services Index
 */

// Quality filtering
import qualityFilter from './qualityFilter';
export { qualityFilter };
export type { QualityMetrics, SequenceRead, FilteredResult, FilterOptions } from './qualityFilter';

// Diversity calculations
import diversityCalculator from './diversityCalculator';
export { diversityCalculator };
export type {
    AbundanceData,
    SampleSet,
    AlphaDiversityResult,
    BetaDiversityResult,
    RarefactionCurve
} from './diversityCalculator';

// ASV clustering
import asvClustering from './asvClustering';
export { asvClustering };
export type { ASV, ClusteringResult, ClusteringOptions } from './asvClustering';

// Taxonomic assignment
import taxonomicAssignment from './taxonomicAssignment';
export { taxonomicAssignment };
export type { TaxonomicAssignment, AssignmentResult } from './taxonomicAssignment';

// Contamination detection
import contaminationDetector from './contaminationDetector';
export { contaminationDetector };
export type { ContaminationFlag, ContaminationReport } from './contaminationDetector';

export default {
    qualityFilter,
    diversityCalculator,
    asvClustering,
    taxonomicAssignment,
    contaminationDetector,
};
