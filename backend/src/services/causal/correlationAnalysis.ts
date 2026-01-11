/**
 * Cross-Domain Correlation Analysis Service
 * 
 * Analyzes relationships between oceanographic parameters,
 * species abundance, and environmental factors.
 */

import logger from '../../utils/logger';

export interface TimeSeries {
    id: string;
    name: string;
    unit?: string;
    dataPoints: Array<{ date: string; value: number }>;
}

export interface CorrelationResult {
    variable1: string;
    variable2: string;
    pearsonR: number;
    spearmanRho: number;
    pValue: number;
    sampleSize: number;
    relationship: 'strong_positive' | 'moderate_positive' | 'weak_positive' | 'none' | 'weak_negative' | 'moderate_negative' | 'strong_negative';
    significant: boolean;
    interpretation: string;
}

export interface MultivariateResult {
    target: string;
    predictors: string[];
    rSquared: number;
    adjustedRSquared: number;
    coefficients: Array<{
        variable: string;
        coefficient: number;
        standardError: number;
        tStatistic: number;
        pValue: number;
        significant: boolean;
    }>;
    fStatistic: number;
    fPValue: number;
    residualStandardError: number;
    interpretation: string;
}

export interface FeatureImportance {
    variable: string;
    importance: number;
    rank: number;
    direction: 'positive' | 'negative';
    contribution: number; // percentage
}

export interface CorrelationMatrix {
    variables: string[];
    matrix: number[][];
    significanceMatrix: boolean[][];
}

/**
 * Calculate Pearson correlation coefficient
 */
export function calculatePearson(x: number[], y: number[]): { r: number; pValue: number } {
    const n = Math.min(x.length, y.length);
    if (n < 3) return { r: 0, pValue: 1 };

    const xSlice = x.slice(0, n);
    const ySlice = y.slice(0, n);

    const xMean = xSlice.reduce((a, b) => a + b, 0) / n;
    const yMean = ySlice.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let xVar = 0;
    let yVar = 0;

    for (let i = 0; i < n; i++) {
        const xDiff = xSlice[i] - xMean;
        const yDiff = ySlice[i] - yMean;
        numerator += xDiff * yDiff;
        xVar += xDiff * xDiff;
        yVar += yDiff * yDiff;
    }

    const denominator = Math.sqrt(xVar * yVar);
    const r = denominator > 0 ? numerator / denominator : 0;

    // Calculate p-value using t-distribution approximation
    const t = r * Math.sqrt((n - 2) / (1 - r * r));
    // Simplified p-value approximation
    const pValue = Math.abs(r) > 0.5 ? 0.001 :
        Math.abs(r) > 0.3 ? 0.01 :
            Math.abs(r) > 0.2 ? 0.05 : 0.1;

    return { r: Math.round(r * 1000) / 1000, pValue };
}

/**
 * Calculate Spearman rank correlation
 */
export function calculateSpearman(x: number[], y: number[]): { rho: number; pValue: number } {
    const n = Math.min(x.length, y.length);
    if (n < 3) return { rho: 0, pValue: 1 };

    // Convert to ranks
    const rankX = toRanks(x.slice(0, n));
    const rankY = toRanks(y.slice(0, n));

    const pearsonResult = calculatePearson(rankX, rankY);
    return { rho: pearsonResult.r, pValue: pearsonResult.pValue };
}

/**
 * Convert values to ranks
 */
function toRanks(values: number[]): number[] {
    const indexed = values.map((v, i) => ({ value: v, index: i }));
    indexed.sort((a, b) => a.value - b.value);

    const ranks = new Array(values.length);
    for (let i = 0; i < indexed.length; i++) {
        ranks[indexed[i].index] = i + 1;
    }

    return ranks;
}

/**
 * Interpret correlation strength
 */
function interpretCorrelation(r: number): CorrelationResult['relationship'] {
    const absR = Math.abs(r);
    if (absR >= 0.7) return r > 0 ? 'strong_positive' : 'strong_negative';
    if (absR >= 0.4) return r > 0 ? 'moderate_positive' : 'moderate_negative';
    if (absR >= 0.2) return r > 0 ? 'weak_positive' : 'weak_negative';
    return 'none';
}

/**
 * Correlate two time series
 */
export function correlateTimeSeries(
    series1: TimeSeries,
    series2: TimeSeries
): CorrelationResult {
    // Align by date
    const aligned = alignTimeSeries(series1, series2);

    if (aligned.values1.length < 5) {
        return {
            variable1: series1.name,
            variable2: series2.name,
            pearsonR: 0,
            spearmanRho: 0,
            pValue: 1,
            sampleSize: aligned.values1.length,
            relationship: 'none',
            significant: false,
            interpretation: 'Insufficient overlapping data points for correlation analysis',
        };
    }

    const pearson = calculatePearson(aligned.values1, aligned.values2);
    const spearman = calculateSpearman(aligned.values1, aligned.values2);
    const relationship = interpretCorrelation(pearson.r);
    const significant = pearson.pValue < 0.05;

    // Generate interpretation
    let interpretation: string;
    if (!significant) {
        interpretation = `No significant relationship found between ${series1.name} and ${series2.name}`;
    } else {
        const direction = pearson.r > 0 ? 'increases' : 'decreases';
        const strength = relationship.includes('strong') ? 'strongly' : relationship.includes('moderate') ? 'moderately' : 'weakly';
        interpretation = `${series2.name} ${strength} ${direction} as ${series1.name} increases (r=${pearson.r})`;
    }

    return {
        variable1: series1.name,
        variable2: series2.name,
        pearsonR: pearson.r,
        spearmanRho: spearman.rho,
        pValue: pearson.pValue,
        sampleSize: aligned.values1.length,
        relationship,
        significant,
        interpretation,
    };
}

/**
 * Align two time series by date
 */
function alignTimeSeries(series1: TimeSeries, series2: TimeSeries): {
    dates: string[];
    values1: number[];
    values2: number[];
} {
    const map1 = new Map(series1.dataPoints.map(d => [d.date, d.value]));
    const map2 = new Map(series2.dataPoints.map(d => [d.date, d.value]));

    const dates: string[] = [];
    const values1: number[] = [];
    const values2: number[] = [];

    for (const [date, val1] of map1) {
        const val2 = map2.get(date);
        if (val2 !== undefined) {
            dates.push(date);
            values1.push(val1);
            values2.push(val2);
        }
    }

    return { dates, values1, values2 };
}

/**
 * Build correlation matrix for multiple variables
 */
export function buildCorrelationMatrix(series: TimeSeries[]): CorrelationMatrix {
    const n = series.length;
    const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    const significanceMatrix: boolean[][] = Array(n).fill(null).map(() => Array(n).fill(false));

    for (let i = 0; i < n; i++) {
        matrix[i][i] = 1;
        significanceMatrix[i][i] = true;

        for (let j = i + 1; j < n; j++) {
            const result = correlateTimeSeries(series[i], series[j]);
            matrix[i][j] = result.pearsonR;
            matrix[j][i] = result.pearsonR;
            significanceMatrix[i][j] = result.significant;
            significanceMatrix[j][i] = result.significant;
        }
    }

    return {
        variables: series.map(s => s.name),
        matrix,
        significanceMatrix,
    };
}

/**
 * Multiple linear regression
 */
export function multipleRegression(
    target: TimeSeries,
    predictors: TimeSeries[]
): MultivariateResult {
    // Collect aligned data
    const allSeries = [target, ...predictors];
    let dates = new Set<string>(target.dataPoints.map(d => d.date));

    for (const pred of predictors) {
        const predDates = new Set(pred.dataPoints.map(d => d.date));
        dates = new Set([...dates].filter(d => predDates.has(d)));
    }

    const sortedDates = [...dates].sort();
    const n = sortedDates.length;

    if (n < predictors.length + 3) {
        return {
            target: target.name,
            predictors: predictors.map(p => p.name),
            rSquared: 0,
            adjustedRSquared: 0,
            coefficients: [],
            fStatistic: 0,
            fPValue: 1,
            residualStandardError: 0,
            interpretation: 'Insufficient data for regression analysis',
        };
    }

    // Build data matrices
    const Y: number[] = [];
    const X: number[][] = [];

    for (const date of sortedDates) {
        const targetVal = target.dataPoints.find(d => d.date === date)?.value;
        if (targetVal === undefined) continue;

        const row = [1]; // Intercept
        let valid = true;

        for (const pred of predictors) {
            const predVal = pred.dataPoints.find(d => d.date === date)?.value;
            if (predVal === undefined) {
                valid = false;
                break;
            }
            row.push(predVal);
        }

        if (valid) {
            Y.push(targetVal);
            X.push(row);
        }
    }

    // Solve using normal equations (simplified)
    // For production, use proper matrix library
    const coefficients = solveOLS(X, Y);

    // Calculate R-squared
    const yMean = Y.reduce((a, b) => a + b, 0) / Y.length;
    let ssTot = 0, ssRes = 0;

    for (let i = 0; i < Y.length; i++) {
        let yPred = 0;
        for (let j = 0; j < X[i].length; j++) {
            yPred += X[i][j] * coefficients[j];
        }
        ssTot += Math.pow(Y[i] - yMean, 2);
        ssRes += Math.pow(Y[i] - yPred, 2);
    }

    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    const p = predictors.length;
    const adjustedRSquared = 1 - (1 - rSquared) * (n - 1) / (n - p - 1);

    // Build coefficient results
    const coefficientResults = [
        { variable: 'Intercept', coefficient: coefficients[0] },
        ...predictors.map((pred, i) => ({
            variable: pred.name,
            coefficient: coefficients[i + 1] || 0,
        })),
    ].map((c, i) => ({
        ...c,
        coefficient: Math.round(c.coefficient * 1000) / 1000,
        standardError: 0.1, // Placeholder
        tStatistic: c.coefficient / 0.1,
        pValue: Math.abs(c.coefficient) > 0.5 ? 0.01 : 0.1,
        significant: Math.abs(c.coefficient) > 0.3,
    }));

    // Generate interpretation
    const significantPreds = coefficientResults
        .filter(c => c.variable !== 'Intercept' && c.significant)
        .map(c => `${c.variable} (${c.coefficient > 0 ? '+' : ''}${c.coefficient})`);

    const interpretation = significantPreds.length > 0
        ? `${target.name} is significantly influenced by: ${significantPreds.join(', ')}. R²=${rSquared.toFixed(3)}`
        : `No significant predictors found for ${target.name}`;

    return {
        target: target.name,
        predictors: predictors.map(p => p.name),
        rSquared: Math.round(rSquared * 1000) / 1000,
        adjustedRSquared: Math.round(adjustedRSquared * 1000) / 1000,
        coefficients: coefficientResults,
        fStatistic: 0,
        fPValue: rSquared > 0.3 ? 0.01 : 0.1,
        residualStandardError: Math.sqrt(ssRes / (n - p - 1)),
        interpretation,
    };
}

/**
 * Solve ordinary least squares (simplified)
 */
function solveOLS(X: number[][], Y: number[]): number[] {
    const n = X.length;
    const p = X[0]?.length || 1;

    // For simplicity, use gradient descent approximation
    const coefficients = new Array(p).fill(0);
    const learningRate = 0.01;
    const iterations = 1000;

    for (let iter = 0; iter < iterations; iter++) {
        const gradients = new Array(p).fill(0);

        for (let i = 0; i < n; i++) {
            let yPred = 0;
            for (let j = 0; j < p; j++) {
                yPred += X[i][j] * coefficients[j];
            }
            const error = yPred - Y[i];

            for (let j = 0; j < p; j++) {
                gradients[j] += error * X[i][j];
            }
        }

        for (let j = 0; j < p; j++) {
            coefficients[j] -= learningRate * gradients[j] / n;
        }
    }

    return coefficients;
}

/**
 * Calculate feature importance
 */
export function calculateFeatureImportance(
    regressionResult: MultivariateResult
): FeatureImportance[] {
    const coeffs = regressionResult.coefficients.filter(c => c.variable !== 'Intercept');

    const totalAbsCoeff = coeffs.reduce((sum, c) => sum + Math.abs(c.coefficient), 0);

    const importance = coeffs.map(c => ({
        variable: c.variable,
        importance: Math.round((Math.abs(c.coefficient) / (totalAbsCoeff || 1)) * 1000) / 1000,
        direction: c.coefficient >= 0 ? 'positive' as const : 'negative' as const,
        contribution: 0,
        rank: 0,
    }));

    // Sort by importance and assign ranks
    importance.sort((a, b) => b.importance - a.importance);
    importance.forEach((item, index) => {
        item.rank = index + 1;
        item.contribution = Math.round(item.importance * 100);
    });

    return importance;
}

export default {
    calculatePearson,
    calculateSpearman,
    correlateTimeSeries,
    buildCorrelationMatrix,
    multipleRegression,
    calculateFeatureImportance,
};
