/**
 * Stock Assessment Service
 * 
 * Provides mortality estimation, recruitment indices, and population
 * dynamics analysis for fisheries management.
 */

import logger from '../../utils/logger';
import { CatchRecord, calculateCPUETimeSeries } from './cpueAnalysis';
import { LengthRecord, calculateLengthDistribution, identifyCohorts } from './lengthFrequency';

export interface MortalityEstimate {
    species: string;
    Z: number;           // Total mortality
    M: number;           // Natural mortality
    F: number;           // Fishing mortality
    exploitationRate: number;  // E = F / Z
    status: 'underexploited' | 'optimal' | 'overexploited';
    confidenceInterval: {
        Z: { lower: number; upper: number };
    };
}

export interface StockStatus {
    species: string;
    year: number;
    biomass: number;            // Relative or absolute
    biomassStatus: 'increasing' | 'stable' | 'declining';
    spawningStockBiomass?: number;
    recruitmentIndex: number;
    cpue: number;
    exploitationLevel: 'low' | 'moderate' | 'high' | 'overfishing';
    sustainabilityScore: number; // 0-100
    recommendations: string[];
}

export interface RecruitmentAnalysis {
    species: string;
    years: Array<{
        year: number;
        recruitmentIndex: number;
        yoyCount: number;          // Young of year
        cpue: number;
    }>;
    averageRecruitment: number;
    trend: 'improving' | 'stable' | 'declining';
    stockRecruitRelation?: 'Beverton-Holt' | 'Ricker';
}

export interface PopulationDynamics {
    species: string;
    currentBiomass: number;
    carryingCapacity?: number;
    msy?: number;                  // Maximum sustainable yield
    fmsy?: number;                 // F at MSY
    currentF: number;
    fOverFmsy?: number;
    status: string;
}

/**
 * Estimate mortality rates using catch curve analysis
 */
export function estimateMortality(
    lengthRecords: LengthRecord[],
    species: string,
    options: {
        Linf?: number;
        K?: number;
        naturalMortalityMethod?: 'Pauly' | 'Hoenig' | 'Then';
        maxAge?: number;
        meanTemp?: number;
    } = {}
): MortalityEstimate {
    const filtered = lengthRecords.filter(r =>
        r.species.toLowerCase() === species.toLowerCase()
    );

    const {
        Linf = 100,  // Default asymptotic length
        K = 0.2,     // Default growth coefficient
        naturalMortalityMethod = 'Pauly',
        maxAge = 15,
        meanTemp = 25,
    } = options;

    // Estimate natural mortality (M)
    let M: number;

    switch (naturalMortalityMethod) {
        case 'Pauly':
            // Pauly's empirical formula
            M = Math.exp(-0.0152 - 0.279 * Math.log(Linf) + 0.6543 * Math.log(K) + 0.463 * Math.log(meanTemp));
            break;
        case 'Hoenig':
            // Hoenig's longevity-based method
            M = 4.22 / maxAge;
            break;
        case 'Then':
            // Then et al. method
            M = 4.118 * Math.pow(maxAge, -0.73);
            break;
        default:
            M = 0.3;
    }

    // Estimate total mortality (Z) from length-converted catch curve
    const distribution = calculateLengthDistribution(filtered, species, 5);

    // Use descending limb of length distribution
    const bins = distribution.bins;
    const modeIndex = bins.findIndex(b => b.lengthClass === distribution.mode);
    const descendingBins = bins.slice(modeIndex).filter(b => b.count > 0);

    let Z = M + 0.5; // Default estimate

    if (descendingBins.length >= 3) {
        // Convert lengths to relative ages and fit line
        const catchCurve = descendingBins.map(bin => {
            const relativeAge = (-1 / K) * Math.log(1 - bin.lengthClass / Linf);
            return {
                age: relativeAge,
                lnN: Math.log(bin.count),
            };
        }).filter(d => isFinite(d.age) && isFinite(d.lnN) && d.age > 0);

        if (catchCurve.length >= 3) {
            // Linear regression for Z (negative slope)
            const n = catchCurve.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

            for (const point of catchCurve) {
                sumX += point.age;
                sumY += point.lnN;
                sumXY += point.age * point.lnN;
                sumX2 += point.age * point.age;
            }

            const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            Z = Math.abs(slope);
        }
    }

    // Fishing mortality
    const F = Math.max(0, Z - M);

    // Exploitation rate
    const exploitationRate = Z > 0 ? F / Z : 0;

    // Determine status
    let status: 'underexploited' | 'optimal' | 'overexploited';
    if (exploitationRate < 0.3) {
        status = 'underexploited';
    } else if (exploitationRate < 0.5) {
        status = 'optimal';
    } else {
        status = 'overexploited';
    }

    return {
        species,
        Z: Math.round(Z * 1000) / 1000,
        M: Math.round(M * 1000) / 1000,
        F: Math.round(F * 1000) / 1000,
        exploitationRate: Math.round(exploitationRate * 1000) / 1000,
        status,
        confidenceInterval: {
            Z: {
                lower: Math.round((Z * 0.8) * 1000) / 1000,
                upper: Math.round((Z * 1.2) * 1000) / 1000,
            },
        },
    };
}

/**
 * Assess current stock status
 */
export function assessStockStatus(
    catchRecords: CatchRecord[],
    lengthRecords: LengthRecord[],
    species: string,
    year?: number
): StockStatus {
    const currentYear = year || new Date().getFullYear();

    // Get CPUE trend
    const cpueSeries = calculateCPUETimeSeries(catchRecords, species, 'yearly');
    const latestCPUE = cpueSeries.dataPoints[cpueSeries.dataPoints.length - 1]?.cpue || 0;

    // Get mortality estimates
    const mortality = estimateMortality(lengthRecords, species);

    // Get cohort analysis
    const cohorts = identifyCohorts(lengthRecords, species);

    // Determine exploitation level
    let exploitationLevel: 'low' | 'moderate' | 'high' | 'overfishing';
    if (mortality.exploitationRate < 0.25) {
        exploitationLevel = 'low';
    } else if (mortality.exploitationRate < 0.4) {
        exploitationLevel = 'moderate';
    } else if (mortality.exploitationRate < 0.5) {
        exploitationLevel = 'high';
    } else {
        exploitationLevel = 'overfishing';
    }

    // Determine biomass status
    let biomassStatus: 'increasing' | 'stable' | 'declining';
    if (cpueSeries.trend.direction === 'increasing') {
        biomassStatus = 'increasing';
    } else if (cpueSeries.trend.direction === 'decreasing') {
        biomassStatus = 'declining';
    } else {
        biomassStatus = 'stable';
    }

    // Calculate sustainability score
    let sustainabilityScore = 50; // Base score

    if (cohorts.recruitmentIndex > 0.3) sustainabilityScore += 15;
    if (cohorts.spawningStockIndex > 0.4) sustainabilityScore += 15;
    if (mortality.status === 'optimal') sustainabilityScore += 10;
    if (biomassStatus === 'increasing') sustainabilityScore += 10;

    if (exploitationLevel === 'overfishing') sustainabilityScore -= 30;
    if (biomassStatus === 'declining') sustainabilityScore -= 15;
    if (cohorts.recruitmentIndex < 0.1) sustainabilityScore -= 20;

    sustainabilityScore = Math.max(0, Math.min(100, sustainabilityScore));

    // Generate recommendations
    const recommendations: string[] = [];

    if (exploitationLevel === 'overfishing') {
        recommendations.push('Reduce fishing effort immediately to prevent stock collapse');
    }
    if (cohorts.recruitmentIndex < 0.2) {
        recommendations.push('Implement seasonal closures during spawning period');
    }
    if (mortality.F > mortality.M * 1.5) {
        recommendations.push('Consider reducing fishing mortality to F=M level');
    }
    if (biomassStatus === 'declining') {
        recommendations.push('Continue monitoring and consider precautionary measures');
    }
    if (sustainabilityScore > 70) {
        recommendations.push('Stock appears healthy - maintain current management');
    }

    return {
        species,
        year: currentYear,
        biomass: latestCPUE, // Using CPUE as relative biomass index
        biomassStatus,
        recruitmentIndex: cohorts.recruitmentIndex,
        cpue: latestCPUE,
        exploitationLevel,
        sustainabilityScore,
        recommendations,
    };
}

/**
 * Analyze recruitment patterns over time
 */
export function analyzeRecruitment(
    catchRecords: CatchRecord[],
    lengthRecords: LengthRecord[],
    species: string
): RecruitmentAnalysis {
    // Group by year
    const years = [...new Set(catchRecords.map(r => new Date(r.date).getFullYear()))].sort();

    const yearlyData = years.map(year => {
        const yearCatches = catchRecords.filter(r => new Date(r.date).getFullYear() === year);
        const yearLengths = lengthRecords.filter(r => new Date(r.date).getFullYear() === year);

        const cpueSeries = calculateCPUETimeSeries(yearCatches, species, 'yearly');
        const cohorts = identifyCohorts(yearLengths, species);

        // Count young of year (small fish)
        const distribution = calculateLengthDistribution(yearLengths, species);
        const yoyThreshold = distribution.meanLength * 0.5;
        const yoyCount = yearLengths.filter(r =>
            r.species.toLowerCase() === species.toLowerCase() && r.length < yoyThreshold
        ).length;

        return {
            year,
            recruitmentIndex: cohorts.recruitmentIndex,
            yoyCount,
            cpue: cpueSeries.overallCPUE,
        };
    });

    // Calculate average recruitment
    const avgRecruitment = yearlyData.length > 0
        ? yearlyData.reduce((sum, y) => sum + y.recruitmentIndex, 0) / yearlyData.length
        : 0;

    // Determine trend
    const recentYears = yearlyData.slice(-3);
    const olderYears = yearlyData.slice(-6, -3);

    const recentAvg = recentYears.length > 0
        ? recentYears.reduce((sum, y) => sum + y.recruitmentIndex, 0) / recentYears.length
        : 0;
    const olderAvg = olderYears.length > 0
        ? olderYears.reduce((sum, y) => sum + y.recruitmentIndex, 0) / olderYears.length
        : recentAvg;

    let trend: 'improving' | 'stable' | 'declining';
    if (recentAvg > olderAvg * 1.1) {
        trend = 'improving';
    } else if (recentAvg < olderAvg * 0.9) {
        trend = 'declining';
    } else {
        trend = 'stable';
    }

    return {
        species,
        years: yearlyData,
        averageRecruitment: Math.round(avgRecruitment * 1000) / 1000,
        trend,
    };
}

/**
 * Get multi-species stock summary
 */
export function getMultiSpeciesStockSummary(
    catchRecords: CatchRecord[],
    lengthRecords: LengthRecord[]
): Array<{
    species: string;
    cpue: number;
    exploitationRate: number;
    sustainabilityScore: number;
    status: string;
}> {
    const species = [...new Set(catchRecords.map(r => r.species))];

    return species.map(sp => {
        const status = assessStockStatus(catchRecords, lengthRecords, sp);
        const mortality = estimateMortality(lengthRecords, sp);

        return {
            species: sp,
            cpue: status.cpue,
            exploitationRate: mortality.exploitationRate,
            sustainabilityScore: status.sustainabilityScore,
            status: status.exploitationLevel,
        };
    });
}

export default {
    estimateMortality,
    assessStockStatus,
    analyzeRecruitment,
    getMultiSpeciesStockSummary,
};
