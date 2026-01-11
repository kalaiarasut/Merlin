/**
 * Abundance Trends & Forecasting Service
 * 
 * Time-series analysis and forecasting for fish abundance,
 * linking oceanographic parameters with stock trends.
 */

import logger from '../../utils/logger';
import { CatchRecord, calculateCPUETimeSeries } from './cpueAnalysis';

export interface TimeSeriesPoint {
    date: string;
    value: number;
    observations?: number;
}

export interface TrendAnalysis {
    species: string;
    parameter: string;
    period: { start: string; end: string };
    dataPoints: TimeSeriesPoint[];
    trend: {
        direction: 'increasing' | 'stable' | 'decreasing';
        slope: number;
        rSquared: number;
        changePercent: number;
    };
    seasonality?: {
        detected: boolean;
        peakMonth?: number;
        troughMonth?: number;
        amplitude?: number;
    };
    anomalies: Array<{
        date: string;
        value: number;
        zScore: number;
        type: 'high' | 'low';
    }>;
}

export interface Forecast {
    species: string;
    baseDate: string;
    horizonMonths: number;
    method: 'linear' | 'exponential' | 'arima_simple';
    predictions: Array<{
        date: string;
        predicted: number;
        lower95: number;
        upper95: number;
    }>;
    accuracy?: {
        mape?: number;  // Mean Absolute Percentage Error
        rmse?: number;  // Root Mean Square Error
    };
}

export interface OceanCorrelation {
    species: string;
    parameter: string;  // SST, salinity, chlorophyll, etc.
    correlation: number;
    pValue: number;
    lag: number;  // months
    relationship: 'positive' | 'negative' | 'none';
    interpretation: string;
}

export interface SpatialDistribution {
    species: string;
    period: string;
    hotspots: Array<{
        lat: number;
        lon: number;
        abundance: number;
        name?: string;
    }>;
    centroid: { lat: number; lon: number };
    spread: number;  // km radius
}

/**
 * Analyze abundance trend over time
 */
export function analyzeTrend(
    records: CatchRecord[],
    species: string,
    parameter: string = 'cpue'
): TrendAnalysis {
    const cpueSeries = calculateCPUETimeSeries(records, species, 'monthly');

    const dataPoints: TimeSeriesPoint[] = cpueSeries.dataPoints.map(d => ({
        date: d.date,
        value: d.cpue,
        observations: d.sampleSize,
    }));

    if (dataPoints.length === 0) {
        return {
            species,
            parameter,
            period: { start: '', end: '' },
            dataPoints: [],
            trend: { direction: 'stable', slope: 0, rSquared: 0, changePercent: 0 },
            anomalies: [],
        };
    }

    // Linear regression for trend
    const n = dataPoints.length;
    const values = dataPoints.map(d => d.value);

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumX2 += i * i;
        sumY2 += values[i] * values[i];
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // R-squared
    const yMean = sumY / n;
    const ssTotal = sumY2 - n * yMean * yMean;
    const ssRes = values.reduce((sum, y, i) => {
        const predicted = intercept + slope * i;
        return sum + Math.pow(y - predicted, 2);
    }, 0);
    const rSquared = ssTotal > 0 ? 1 - ssRes / ssTotal : 0;

    // Change percent
    const firstValue = values[0] || 1;
    const predictedChange = slope * (n - 1);
    const changePercent = (predictedChange / firstValue) * 100;

    // Trend direction
    let direction: 'increasing' | 'stable' | 'decreasing';
    if (changePercent > 15) direction = 'increasing';
    else if (changePercent < -15) direction = 'decreasing';
    else direction = 'stable';

    // Detect seasonality
    const seasonality = detectSeasonality(dataPoints);

    // Detect anomalies
    const anomalies = detectAnomalies(dataPoints);

    return {
        species,
        parameter,
        period: {
            start: dataPoints[0].date,
            end: dataPoints[n - 1].date,
        },
        dataPoints,
        trend: {
            direction,
            slope: Math.round(slope * 1000) / 1000,
            rSquared: Math.round(rSquared * 1000) / 1000,
            changePercent: Math.round(changePercent * 10) / 10,
        },
        seasonality,
        anomalies,
    };
}

/**
 * Detect seasonal patterns
 */
function detectSeasonality(dataPoints: TimeSeriesPoint[]): TrendAnalysis['seasonality'] {
    if (dataPoints.length < 24) {
        return { detected: false };
    }

    // Group by month
    const byMonth: Record<number, number[]> = {};
    for (const point of dataPoints) {
        const month = parseInt(point.date.split('-')[1]) || 1;
        if (!byMonth[month]) byMonth[month] = [];
        byMonth[month].push(point.value);
    }

    // Calculate monthly averages
    const monthlyAvg: Record<number, number> = {};
    for (const [month, values] of Object.entries(byMonth)) {
        monthlyAvg[parseInt(month)] = values.reduce((a, b) => a + b, 0) / values.length;
    }

    // Find peak and trough
    const months = Object.entries(monthlyAvg);
    if (months.length < 6) return { detected: false };

    const sorted = [...months].sort((a, b) => b[1] - a[1]);
    const peakMonth = parseInt(sorted[0][0]);
    const troughMonth = parseInt(sorted[sorted.length - 1][0]);

    // Check if seasonality is significant
    const maxAvg = sorted[0][1];
    const minAvg = sorted[sorted.length - 1][1];
    const amplitude = maxAvg - minAvg;
    const mean = Object.values(monthlyAvg).reduce((a, b) => a + b, 0) / months.length;

    const detected = amplitude > mean * 0.3; // >30% variation

    return {
        detected,
        peakMonth,
        troughMonth,
        amplitude: Math.round(amplitude * 100) / 100,
    };
}

/**
 * Detect statistical anomalies
 */
function detectAnomalies(
    dataPoints: TimeSeriesPoint[],
    threshold: number = 2.0
): TrendAnalysis['anomalies'] {
    if (dataPoints.length < 5) return [];

    const values = dataPoints.map(d => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);

    if (std === 0) return [];

    return dataPoints
        .map(point => {
            const zScore = (point.value - mean) / std;
            if (Math.abs(zScore) > threshold) {
                return {
                    date: point.date,
                    value: point.value,
                    zScore: Math.round(zScore * 100) / 100,
                    type: zScore > 0 ? 'high' as const : 'low' as const,
                };
            }
            return null;
        })
        .filter((a): a is NonNullable<typeof a> => a !== null);
}

/**
 * Generate abundance forecast
 */
export function forecastAbundance(
    records: CatchRecord[],
    species: string,
    horizonMonths: number = 12,
    method: 'linear' | 'exponential' | 'arima_simple' = 'linear'
): Forecast {
    const trend = analyzeTrend(records, species);
    const dataPoints = trend.dataPoints;

    if (dataPoints.length < 6) {
        return {
            species,
            baseDate: new Date().toISOString().slice(0, 7),
            horizonMonths,
            method,
            predictions: [],
        };
    }

    const values = dataPoints.map(d => d.value);
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;

    // Get last date
    const lastDate = dataPoints[n - 1].date;
    const [year, month] = lastDate.split('-').map(Number);

    // Calculate prediction parameters
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate error for confidence interval
    const residuals = values.map((y, i) => y - (intercept + slope * i));
    const rmse = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / n);

    // Generate predictions
    const predictions: Forecast['predictions'] = [];

    for (let h = 1; h <= horizonMonths; h++) {
        const futureMonth = month + h;
        const futureYear = year + Math.floor((futureMonth - 1) / 12);
        const monthNum = ((futureMonth - 1) % 12) + 1;

        const dateStr = `${futureYear}-${String(monthNum).padStart(2, '0')}`;
        const x = n - 1 + h;

        let predicted: number;
        switch (method) {
            case 'exponential':
                const growthRate = values.length > 1 ? values[n - 1] / values[0] : 1;
                const monthlyRate = Math.pow(growthRate, 1 / n);
                predicted = values[n - 1] * Math.pow(monthlyRate, h);
                break;
            case 'linear':
            default:
                predicted = intercept + slope * x;
                break;
        }

        // Ensure non-negative
        predicted = Math.max(0, predicted);

        // Confidence interval (widens with horizon)
        const uncertainty = rmse * Math.sqrt(1 + 1 / n + Math.pow(x - (n - 1) / 2, 2) / sumX2) * 1.96;

        predictions.push({
            date: dateStr,
            predicted: Math.round(predicted * 1000) / 1000,
            lower95: Math.max(0, Math.round((predicted - uncertainty) * 1000) / 1000),
            upper95: Math.round((predicted + uncertainty) * 1000) / 1000,
        });
    }

    return {
        species,
        baseDate: lastDate,
        horizonMonths,
        method,
        predictions,
        accuracy: {
            rmse: Math.round(rmse * 1000) / 1000,
        },
    };
}

/**
 * Correlate abundance with oceanographic parameters
 */
export function correlateWithOceanParameters(
    abundanceData: TimeSeriesPoint[],
    oceanData: TimeSeriesPoint[],
    species: string,
    parameterName: string,
    maxLag: number = 6
): OceanCorrelation {
    // Align time series by date
    const aligned: Array<{ abundance: number; ocean: number }> = [];

    for (const aPoint of abundanceData) {
        const oPoint = oceanData.find(o => o.date === aPoint.date);
        if (oPoint) {
            aligned.push({ abundance: aPoint.value, ocean: oPoint.value });
        }
    }

    if (aligned.length < 10) {
        return {
            species,
            parameter: parameterName,
            correlation: 0,
            pValue: 1,
            lag: 0,
            relationship: 'none',
            interpretation: 'Insufficient data for correlation analysis',
        };
    }

    // Calculate Pearson correlation
    const n = aligned.length;
    const sumA = aligned.reduce((s, d) => s + d.abundance, 0);
    const sumO = aligned.reduce((s, d) => s + d.ocean, 0);
    const sumAO = aligned.reduce((s, d) => s + d.abundance * d.ocean, 0);
    const sumA2 = aligned.reduce((s, d) => s + d.abundance * d.abundance, 0);
    const sumO2 = aligned.reduce((s, d) => s + d.ocean * d.ocean, 0);

    const numerator = n * sumAO - sumA * sumO;
    const denominator = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumO2 - sumO * sumO));

    const correlation = denominator > 0 ? numerator / denominator : 0;

    // Approximate p-value
    const t = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
    // Simplified p-value approximation
    const pValue = Math.abs(correlation) > 0.5 ? 0.01 : Math.abs(correlation) > 0.3 ? 0.05 : 0.1;

    // Determine relationship
    let relationship: 'positive' | 'negative' | 'none';
    if (Math.abs(correlation) < 0.2) {
        relationship = 'none';
    } else if (correlation > 0) {
        relationship = 'positive';
    } else {
        relationship = 'negative';
    }

    // Generate interpretation
    let interpretation: string;
    if (relationship === 'none') {
        interpretation = `No significant correlation found between ${species} abundance and ${parameterName}`;
    } else if (relationship === 'positive') {
        interpretation = `Higher ${parameterName} is associated with higher ${species} abundance (r=${correlation.toFixed(2)})`;
    } else {
        interpretation = `Higher ${parameterName} is associated with lower ${species} abundance (r=${correlation.toFixed(2)})`;
    }

    return {
        species,
        parameter: parameterName,
        correlation: Math.round(correlation * 1000) / 1000,
        pValue: Math.round(pValue * 1000) / 1000,
        lag: 0,
        relationship,
        interpretation,
    };
}

/**
 * Analyze spatial distribution
 */
export function analyzeSpatialDistribution(
    records: CatchRecord[],
    species: string,
    period?: string
): SpatialDistribution {
    const filtered = records.filter(r =>
        r.species.toLowerCase() === species.toLowerCase() &&
        r.location?.lat !== undefined &&
        r.location?.lon !== undefined
    );

    if (filtered.length === 0) {
        return {
            species,
            period: period || 'all',
            hotspots: [],
            centroid: { lat: 0, lon: 0 },
            spread: 0,
        };
    }

    // Group by location
    const byLocation: Record<string, { lat: number; lon: number; abundance: number; name?: string }> = {};

    for (const record of filtered) {
        const key = `${record.location!.lat.toFixed(2)},${record.location!.lon.toFixed(2)}`;
        if (!byLocation[key]) {
            byLocation[key] = {
                lat: record.location!.lat,
                lon: record.location!.lon,
                abundance: 0,
                name: record.location!.name,
            };
        }
        byLocation[key].abundance += record.catch;
    }

    const hotspots = Object.values(byLocation)
        .sort((a, b) => b.abundance - a.abundance)
        .slice(0, 10);

    // Calculate centroid
    const totalAbundance = hotspots.reduce((s, h) => s + h.abundance, 0);
    const centroidLat = hotspots.reduce((s, h) => s + h.lat * h.abundance, 0) / totalAbundance;
    const centroidLon = hotspots.reduce((s, h) => s + h.lon * h.abundance, 0) / totalAbundance;

    // Calculate spread (approximate radius in km)
    const distances = hotspots.map(h => {
        const dlat = (h.lat - centroidLat) * 111; // km per degree
        const dlon = (h.lon - centroidLon) * 111 * Math.cos(centroidLat * Math.PI / 180);
        return Math.sqrt(dlat * dlat + dlon * dlon);
    });
    const spread = distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : 0;

    return {
        species,
        period: period || 'all',
        hotspots,
        centroid: { lat: Math.round(centroidLat * 1000) / 1000, lon: Math.round(centroidLon * 1000) / 1000 },
        spread: Math.round(spread * 10) / 10,
    };
}

export default {
    analyzeTrend,
    forecastAbundance,
    correlateWithOceanParameters,
    analyzeSpatialDistribution,
};
