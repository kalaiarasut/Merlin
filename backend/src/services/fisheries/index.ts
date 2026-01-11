/**
 * Fisheries Services Index
 */

// CPUE Analysis
import cpueAnalysis from './cpueAnalysis';
export { cpueAnalysis };
export type { CatchRecord, CPUEResult, CPUESeries, CPUEComparison } from './cpueAnalysis';

// Length-Frequency Analysis
import lengthFrequency from './lengthFrequency';
export { lengthFrequency };
export type {
    LengthRecord,
    LengthDistribution,
    CohortAnalysis,
    GrowthParameters,
    LengthWeightRelation
} from './lengthFrequency';

// Stock Assessment
import stockAssessment from './stockAssessment';
export { stockAssessment };
export type {
    MortalityEstimate,
    StockStatus,
    RecruitmentAnalysis,
    PopulationDynamics
} from './stockAssessment';

// Abundance Trends
import abundanceTrends from './abundanceTrends';
export { abundanceTrends };
export type {
    TimeSeriesPoint,
    TrendAnalysis,
    Forecast,
    OceanCorrelation,
    SpatialDistribution
} from './abundanceTrends';

// Data Storage
import dataStorage from './dataStorage';
export { dataStorage };
export type {
    CatchRecord as StoredCatchRecord,
    LengthRecord as StoredLengthRecord,
    FisheriesDataset
} from './dataStorage';

export default {
    cpueAnalysis,
    lengthFrequency,
    stockAssessment,
    abundanceTrends,
    dataStorage,
};
