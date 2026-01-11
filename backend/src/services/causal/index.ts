/**
 * Causal Analysis Services Index
 */

// Correlation Analysis
import correlationAnalysis from './correlationAnalysis';
export { correlationAnalysis };
export type {
    TimeSeries,
    CorrelationResult,
    MultivariateResult,
    FeatureImportance,
    CorrelationMatrix
} from './correlationAnalysis';

// Lag Analysis
import lagAnalysis from './lagAnalysis';
export { lagAnalysis };
export type {
    LagCorrelation,
    LagAnalysisResult,
    GrangerCausalityResult
} from './lagAnalysis';

// Causal Inference
import causalInference from './causalInference';
export { causalInference };
export type {
    CausalHypothesis,
    HypothesisTestResult,
    CausalAnalysisResult,
    CausalPathway
} from './causalInference';

export default {
    correlationAnalysis,
    lagAnalysis,
    causalInference,
};
