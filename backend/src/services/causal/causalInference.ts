/**
 * Causal Inference Service
 * 
 * Provides hypothesis testing and causal explanation generation
 * for understanding ocean-species relationships.
 */

import logger from '../../utils/logger';
import {
    TimeSeries,
    correlateTimeSeries,
    multipleRegression,
    calculateFeatureImportance,
    CorrelationResult,
    MultivariateResult,
    FeatureImportance
} from './correlationAnalysis';
import {
    crossCorrelation,
    grangerCausality,
    LagAnalysisResult,
    GrangerCausalityResult
} from './lagAnalysis';

export interface CausalHypothesis {
    id: string;
    cause: string;
    effect: string;
    mechanism: string;
    direction: 'positive' | 'negative';
    expectedLag?: number;
    expectedLagUnit?: string;
}

export interface HypothesisTestResult {
    hypothesis: CausalHypothesis;
    supported: boolean;
    confidence: number;
    evidence: {
        correlation: CorrelationResult;
        lagAnalysis?: LagAnalysisResult;
        granger?: GrangerCausalityResult;
    };
    conclusion: string;
    caveats: string[];
}

export interface CausalPathway {
    name: string;
    steps: Array<{
        from: string;
        to: string;
        mechanism: string;
        lag: number;
        strength: number;
    }>;
    totalLag: number;
    overallStrength: number;
}

export interface CausalAnalysisResult {
    targetVariable: string;
    drivers: Array<{
        variable: string;
        causalStrength: number;
        lag: number;
        direction: 'positive' | 'negative';
        mechanism?: string;
        confidence: number;
    }>;
    modelFit: {
        rSquared: number;
        adjustedRSquared: number;
    };
    featureImportance: FeatureImportance[];
    pathways: CausalPathway[];
    summary: string;
    recommendations: string[];
}

// Common marine ecological hypotheses
const KNOWN_MECHANISMS: Array<{
    driver: string;
    response: string;
    mechanism: string;
    expectedDirection: 'positive' | 'negative';
    typicalLag: number;
}> = [
        {
            driver: 'SST',
            response: 'fish_abundance',
            mechanism: 'Temperature influences metabolism, reproduction timing, and spatial distribution',
            expectedDirection: 'positive',
            typicalLag: 2,
        },
        {
            driver: 'chlorophyll',
            response: 'fish_abundance',
            mechanism: 'Phytoplankton productivity drives food web from bottom up',
            expectedDirection: 'positive',
            typicalLag: 3,
        },
        {
            driver: 'SST',
            response: 'chlorophyll',
            mechanism: 'Warmer waters can enhance or inhibit phytoplankton growth depending on stratification',
            expectedDirection: 'negative',
            typicalLag: 1,
        },
        {
            driver: 'salinity',
            response: 'fish_abundance',
            mechanism: 'Salinity affects osmoregulation and habitat suitability',
            expectedDirection: 'negative',
            typicalLag: 1,
        },
        {
            driver: 'upwelling',
            response: 'chlorophyll',
            mechanism: 'Nutrient-rich deep water enhances primary productivity',
            expectedDirection: 'positive',
            typicalLag: 1,
        },
    ];

/**
 * Test a specific causal hypothesis
 */
export function testHypothesis(
    hypothesis: CausalHypothesis,
    causeSeries: TimeSeries,
    effectSeries: TimeSeries
): HypothesisTestResult {
    // Run correlation analysis
    const correlation = correlateTimeSeries(causeSeries, effectSeries);

    // Run lag analysis
    const lagAnalysis = crossCorrelation(causeSeries, effectSeries, 12, 'months');

    // Run Granger causality
    const granger = grangerCausality(causeSeries, effectSeries, 4);

    // Determine if hypothesis is supported
    let supported = false;
    let confidence = 0;
    const caveats: string[] = [];

    // Check correlation direction matches hypothesis
    const correlationDirection = correlation.pearsonR >= 0 ? 'positive' : 'negative';
    const directionMatches = correlationDirection === hypothesis.direction;

    if (correlation.significant && directionMatches) {
        confidence += 30;
        supported = true;
    } else if (correlation.significant && !directionMatches) {
        caveats.push('Observed correlation direction opposite to hypothesis');
    } else {
        caveats.push('No significant correlation found');
    }

    // Check lag analysis
    if (lagAnalysis.maxCorrelation > 0.3) {
        confidence += 25;

        if (hypothesis.expectedLag !== undefined) {
            if (Math.abs(lagAnalysis.optimalLag - hypothesis.expectedLag) <= 2) {
                confidence += 15;
            } else {
                caveats.push(`Observed lag (${lagAnalysis.optimalLag}) differs from expected (${hypothesis.expectedLag})`);
            }
        }
    }

    // Check Granger causality
    if (granger.significant) {
        confidence += 30;
    } else {
        caveats.push('Granger causality test not significant');
    }

    // Cap confidence at 100
    confidence = Math.min(100, confidence);
    supported = confidence >= 50;

    // Generate conclusion
    let conclusion: string;
    if (supported) {
        conclusion = `Evidence supports the hypothesis that ${hypothesis.cause} causes ${hypothesis.effect} ` +
            `via ${hypothesis.mechanism} (confidence: ${confidence}%).`;
    } else {
        conclusion = `Insufficient evidence to support the hypothesis. ` +
            `The relationship between ${hypothesis.cause} and ${hypothesis.effect} could not be confirmed.`;
    }

    return {
        hypothesis,
        supported,
        confidence,
        evidence: {
            correlation,
            lagAnalysis,
            granger,
        },
        conclusion,
        caveats,
    };
}

/**
 * Comprehensive causal analysis for a target variable
 */
export function analyzeCausalDrivers(
    target: TimeSeries,
    potentialDrivers: TimeSeries[]
): CausalAnalysisResult {
    const drivers: CausalAnalysisResult['drivers'] = [];
    const pathways: CausalPathway[] = [];

    // Analyze each potential driver
    for (const driver of potentialDrivers) {
        const correlation = correlateTimeSeries(driver, target);
        const lagResult = crossCorrelation(driver, target, 12, 'months');
        const granger = grangerCausality(driver, target, 4);

        // Calculate causal strength (weighted combination)
        let causalStrength = 0;
        causalStrength += Math.abs(correlation.pearsonR) * 0.3;
        causalStrength += Math.abs(lagResult.maxCorrelation) * 0.3;
        causalStrength += granger.significant ? 0.4 : 0;

        // Find known mechanism if available
        const knownMech = KNOWN_MECHANISMS.find(m =>
            driver.name.toLowerCase().includes(m.driver.toLowerCase()) &&
            target.name.toLowerCase().includes(m.response.toLowerCase())
        );

        drivers.push({
            variable: driver.name,
            causalStrength: Math.round(causalStrength * 100) / 100,
            lag: lagResult.optimalLag,
            direction: correlation.pearsonR >= 0 ? 'positive' : 'negative',
            mechanism: knownMech?.mechanism || lagResult.mechanism,
            confidence: granger.significant ? 80 : correlation.significant ? 60 : 30,
        });

        // Build pathway if significant
        if (causalStrength > 0.3) {
            pathways.push({
                name: `${driver.name} → ${target.name}`,
                steps: [{
                    from: driver.name,
                    to: target.name,
                    mechanism: knownMech?.mechanism || 'Direct effect',
                    lag: lagResult.optimalLag,
                    strength: causalStrength,
                }],
                totalLag: lagResult.optimalLag,
                overallStrength: causalStrength,
            });
        }
    }

    // Sort by causal strength
    drivers.sort((a, b) => b.causalStrength - a.causalStrength);

    // Run multiple regression for model fit
    const regression = multipleRegression(target, potentialDrivers);
    const featureImportance = calculateFeatureImportance(regression);

    // Generate summary
    const significantDrivers = drivers.filter(d => d.confidence >= 60);
    let summary: string;

    if (significantDrivers.length === 0) {
        summary = `No significant causal drivers identified for ${target.name}. ` +
            `The variation may be driven by unmeasured factors or complex interactions.`;
    } else {
        const topDrivers = significantDrivers.slice(0, 3).map(d =>
            `${d.variable} (${d.direction}, lag=${d.lag}mo)`
        ).join(', ');
        summary = `${target.name} is primarily influenced by: ${topDrivers}. ` +
            `Model explains ${Math.round(regression.rSquared * 100)}% of variance.`;
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (regression.rSquared < 0.3) {
        recommendations.push('Consider including additional environmental variables');
    }
    if (drivers.some(d => d.lag > 6)) {
        recommendations.push('Long lag effects detected - consider seasonal and interannual patterns');
    }
    if (significantDrivers.length > 0) {
        const topDriver = significantDrivers[0];
        recommendations.push(`Monitor ${topDriver.variable} changes for early warning of ${target.name} shifts`);
    }

    return {
        targetVariable: target.name,
        drivers,
        modelFit: {
            rSquared: regression.rSquared,
            adjustedRSquared: regression.adjustedRSquared,
        },
        featureImportance,
        pathways,
        summary,
        recommendations,
    };
}

/**
 * Generate causal explanation report
 */
export function generateCausalReport(
    analysis: CausalAnalysisResult
): string {
    let report = `# Causal Analysis Report: ${analysis.targetVariable}\n\n`;

    report += `## Summary\n${analysis.summary}\n\n`;

    report += `## Model Performance\n`;
    report += `- R-squared: ${analysis.modelFit.rSquared}\n`;
    report += `- Adjusted R-squared: ${analysis.modelFit.adjustedRSquared}\n\n`;

    report += `## Identified Drivers\n\n`;
    for (const driver of analysis.drivers.slice(0, 5)) {
        report += `### ${driver.variable}\n`;
        report += `- Causal Strength: ${driver.causalStrength}\n`;
        report += `- Direction: ${driver.direction}\n`;
        report += `- Time Lag: ${driver.lag} months\n`;
        report += `- Confidence: ${driver.confidence}%\n`;
        if (driver.mechanism) {
            report += `- Mechanism: ${driver.mechanism}\n`;
        }
        report += '\n';
    }

    if (analysis.pathways.length > 0) {
        report += `## Causal Pathways\n\n`;
        for (const pathway of analysis.pathways) {
            report += `- ${pathway.name} (strength: ${pathway.overallStrength}, lag: ${pathway.totalLag}mo)\n`;
        }
        report += '\n';
    }

    if (analysis.recommendations.length > 0) {
        report += `## Recommendations\n\n`;
        for (const rec of analysis.recommendations) {
            report += `- ${rec}\n`;
        }
    }

    return report;
}

export default {
    testHypothesis,
    analyzeCausalDrivers,
    generateCausalReport,
    KNOWN_MECHANISMS,
};
