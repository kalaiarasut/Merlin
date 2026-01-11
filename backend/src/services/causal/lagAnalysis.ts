/**
 * Lag Analysis Service
 * 
 * Analyzes time-lagged relationships between environmental
 * variables and biological responses.
 */

import logger from '../../utils/logger';
import { TimeSeries, calculatePearson } from './correlationAnalysis';

export interface LagCorrelation {
    lag: number;
    unit: 'days' | 'weeks' | 'months';
    correlation: number;
    pValue: number;
    significant: boolean;
}

export interface LagAnalysisResult {
    driver: string;
    response: string;
    optimalLag: number;
    optimalLagUnit: string;
    maxCorrelation: number;
    lagCorrelations: LagCorrelation[];
    interpretation: string;
    mechanism?: string;
}

export interface GrangerCausalityResult {
    cause: string;
    effect: string;
    fStatistic: number;
    pValue: number;
    significant: boolean;
    optimalLag: number;
    interpretation: string;
}

export interface CrossCorrelationResult {
    lag: number;
    correlation: number;
}

/**
 * Calculate cross-correlation at different lags
 */
export function crossCorrelation(
    driver: TimeSeries,
    response: TimeSeries,
    maxLag: number = 12,
    lagUnit: 'days' | 'weeks' | 'months' = 'months'
): LagAnalysisResult {
    // Sort and align data
    const driverMap = new Map(driver.dataPoints.map(d => [d.date, d.value]));
    const responseMap = new Map(response.dataPoints.map(d => [d.date, d.value]));

    const driverDates = [...driverMap.keys()].sort();
    const responseDates = [...responseMap.keys()].sort();

    const lagCorrelations: LagCorrelation[] = [];
    let maxCorr = -1;
    let optimalLag = 0;

    for (let lag = 0; lag <= maxLag; lag++) {
        // Shift response data by lag
        const pairs: Array<{ driver: number; response: number }> = [];

        for (let i = 0; i < driverDates.length; i++) {
            const driverDate = driverDates[i];
            const driverVal = driverMap.get(driverDate);

            // Find response value at lagged date
            const responseIndex = i + lag;
            if (responseIndex >= responseDates.length) continue;

            const responseDate = responseDates[responseIndex];
            const responseVal = responseMap.get(responseDate);

            if (driverVal !== undefined && responseVal !== undefined) {
                pairs.push({ driver: driverVal, response: responseVal });
            }
        }

        if (pairs.length < 5) continue;

        const driverVals = pairs.map(p => p.driver);
        const responseVals = pairs.map(p => p.response);

        const { r, pValue } = calculatePearson(driverVals, responseVals);

        lagCorrelations.push({
            lag,
            unit: lagUnit,
            correlation: r,
            pValue,
            significant: pValue < 0.05,
        });

        if (Math.abs(r) > maxCorr) {
            maxCorr = Math.abs(r);
            optimalLag = lag;
        }
    }

    // Generate interpretation
    const bestLag = lagCorrelations.find(l => l.lag === optimalLag);
    let interpretation: string;
    let mechanism: string | undefined;

    if (!bestLag || !bestLag.significant) {
        interpretation = `No significant lagged relationship found between ${driver.name} and ${response.name}`;
    } else {
        const direction = bestLag.correlation > 0 ? 'positively' : 'negatively';
        interpretation = `${driver.name} ${direction} affects ${response.name} with a ${optimalLag}-${lagUnit} delay (r=${bestLag.correlation})`;

        // Suggest possible mechanism
        if (driver.name.toLowerCase().includes('temperature')) {
            mechanism = 'Temperature effects on metabolism, reproduction, or prey availability';
        } else if (driver.name.toLowerCase().includes('chlorophyll')) {
            mechanism = 'Primary productivity cascade through food web';
        } else if (driver.name.toLowerCase().includes('salinity')) {
            mechanism = 'Osmoregulatory stress or habitat preference shifts';
        }
    }

    return {
        driver: driver.name,
        response: response.name,
        optimalLag,
        optimalLagUnit: lagUnit,
        maxCorrelation: bestLag?.correlation || 0,
        lagCorrelations,
        interpretation,
        mechanism,
    };
}

/**
 * Multi-lag analysis with multiple drivers
 */
export function multiDriverLagAnalysis(
    response: TimeSeries,
    drivers: TimeSeries[],
    maxLag: number = 12
): {
    response: string;
    drivers: LagAnalysisResult[];
    summary: {
        mostInfluential: string;
        optimalLag: number;
        correlation: number;
    };
} {
    const results = drivers.map(driver => crossCorrelation(driver, response, maxLag));

    // Find most influential driver
    let mostInfluential = results[0];
    for (const result of results) {
        if (Math.abs(result.maxCorrelation) > Math.abs(mostInfluential?.maxCorrelation || 0)) {
            mostInfluential = result;
        }
    }

    return {
        response: response.name,
        drivers: results,
        summary: {
            mostInfluential: mostInfluential?.driver || 'None',
            optimalLag: mostInfluential?.optimalLag || 0,
            correlation: mostInfluential?.maxCorrelation || 0,
        },
    };
}

/**
 * Simplified Granger causality test
 * Tests if past values of X help predict Y
 */
export function grangerCausality(
    cause: TimeSeries,
    effect: TimeSeries,
    maxLag: number = 4
): GrangerCausalityResult {
    // Align series
    const causeMap = new Map(cause.dataPoints.map(d => [d.date, d.value]));
    const effectMap = new Map(effect.dataPoints.map(d => [d.date, d.value]));

    const dates = [...causeMap.keys()]
        .filter(d => effectMap.has(d))
        .sort();

    if (dates.length < maxLag + 5) {
        return {
            cause: cause.name,
            effect: effect.name,
            fStatistic: 0,
            pValue: 1,
            significant: false,
            optimalLag: 0,
            interpretation: 'Insufficient data for Granger causality test',
        };
    }

    // Build lagged datasets
    const Y: number[] = [];
    const XRestricted: number[][] = []; // Only past Y values
    const XUnrestricted: number[][] = []; // Past Y and past X values

    for (let i = maxLag; i < dates.length; i++) {
        const effectVal = effectMap.get(dates[i])!;
        Y.push(effectVal);

        const restrictedRow: number[] = [1]; // Intercept
        const unrestrictedRow: number[] = [1];

        // Add lagged Y values
        for (let lag = 1; lag <= maxLag; lag++) {
            const laggedY = effectMap.get(dates[i - lag])!;
            restrictedRow.push(laggedY);
            unrestrictedRow.push(laggedY);
        }

        // Add lagged X values (only for unrestricted)
        for (let lag = 1; lag <= maxLag; lag++) {
            const laggedX = causeMap.get(dates[i - lag])!;
            unrestrictedRow.push(laggedX);
        }

        XRestricted.push(restrictedRow);
        XUnrestricted.push(unrestrictedRow);
    }

    // Calculate RSS for both models
    const rssRestricted = calculateRSS(XRestricted, Y);
    const rssUnrestricted = calculateRSS(XUnrestricted, Y);

    // F-statistic
    const n = Y.length;
    const dfr = maxLag; // Number of added regressors
    const dfd = n - 2 * maxLag - 1;

    const fStat = ((rssRestricted - rssUnrestricted) / dfr) / (rssUnrestricted / dfd);

    // Approximate p-value
    const pValue = fStat > 4 ? 0.01 : fStat > 2 ? 0.05 : 0.1;
    const significant = pValue < 0.05;

    // Find optimal lag
    let optimalLag = 1;
    let maxImprovement = 0;

    for (let lag = 1; lag <= maxLag; lag++) {
        const { r } = calculatePearson(
            dates.slice(lag).map(d => causeMap.get(dates[dates.indexOf(d) - lag])!),
            dates.slice(lag).map(d => effectMap.get(d)!)
        );
        if (Math.abs(r) > maxImprovement) {
            maxImprovement = Math.abs(r);
            optimalLag = lag;
        }
    }

    const interpretation = significant
        ? `${cause.name} Granger-causes ${effect.name} (F=${fStat.toFixed(2)}, p=${pValue}). Past ${cause.name} values help predict future ${effect.name}.`
        : `No evidence that ${cause.name} Granger-causes ${effect.name}`;

    return {
        cause: cause.name,
        effect: effect.name,
        fStatistic: Math.round(fStat * 100) / 100,
        pValue,
        significant,
        optimalLag,
        interpretation,
    };
}

/**
 * Calculate residual sum of squares
 */
function calculateRSS(X: number[][], Y: number[]): number {
    const n = X.length;
    const p = X[0]?.length || 1;

    // Simple OLS using gradient descent
    const coefficients = new Array(p).fill(0);
    const learningRate = 0.001;
    const iterations = 500;

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

    // Calculate RSS
    let rss = 0;
    for (let i = 0; i < n; i++) {
        let yPred = 0;
        for (let j = 0; j < p; j++) {
            yPred += X[i][j] * coefficients[j];
        }
        rss += Math.pow(Y[i] - yPred, 2);
    }

    return rss;
}

/**
 * Detect seasonal patterns
 */
export function detectSeasonality(
    series: TimeSeries
): {
    hasSeasonality: boolean;
    period?: number;
    peakMonth?: number;
    troughMonth?: number;
    amplitude?: number;
} {
    if (series.dataPoints.length < 24) {
        return { hasSeasonality: false };
    }

    // Group by month
    const byMonth: Record<number, number[]> = {};
    for (const point of series.dataPoints) {
        const month = parseInt(point.date.split('-')[1]) || 1;
        if (!byMonth[month]) byMonth[month] = [];
        byMonth[month].push(point.value);
    }

    // Calculate monthly averages
    const monthlyAvg: Record<number, number> = {};
    for (const [month, values] of Object.entries(byMonth)) {
        monthlyAvg[parseInt(month)] = values.reduce((a, b) => a + b, 0) / values.length;
    }

    const months = Object.keys(monthlyAvg).map(Number);
    if (months.length < 6) return { hasSeasonality: false };

    const values = Object.values(monthlyAvg);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const amplitude = max - min;

    const hasSeasonality = amplitude > mean * 0.3;

    const peakMonth = parseInt(Object.entries(monthlyAvg).sort((a, b) => b[1] - a[1])[0][0]);
    const troughMonth = parseInt(Object.entries(monthlyAvg).sort((a, b) => a[1] - b[1])[0][0]);

    return {
        hasSeasonality,
        period: 12,
        peakMonth,
        troughMonth,
        amplitude: Math.round(amplitude * 100) / 100,
    };
}

export default {
    crossCorrelation,
    multiDriverLagAnalysis,
    grangerCausality,
    detectSeasonality,
};
