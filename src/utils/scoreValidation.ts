import {
  AkhlakIndicatorDef,
  INSTRUMENT_DEFINITIONS,
  InstrumentVersion,
} from '../types/siakhlak';
import {
  InstrumentResolutionResult,
  resolveAssessmentInstrument,
} from './instrumentResolver';

export type ValidAkhlakScore = 1 | 2 | 3 | 4 | null;

export type ScoreResolutionStatus =
  | 'VALID'
  | 'UNASSESSED'
  | 'CONFLICT_ALIAS'
  | 'INVALID_VALUE';

export interface IndicatorScoreResolution {
  status: ScoreResolutionStatus;
  value: ValidAkhlakScore;
  resolvedKey?: string;
  error?: string;
  rawValues?: {
    canonical?: unknown;
    legacy?: unknown;
  };
}

/**
 * Resolves a single Akhlak indicator score (1..31) from a raw scores map.
 * Strictly handles P01/P1 dual-write alias compatibility:
 *
 * Rules:
 * | Canonical (P01) | Legacy (P1) | Status          | Value |
 * |-----------------|-------------|-----------------|-------|
 * | 4               | absent      | VALID           | 4     |
 * | absent          | 4           | VALID           | 4     |
 * | 4               | 4           | VALID           | 4     |
 * | 4               | 3           | CONFLICT_ALIAS  | null  |
 * | null            | 4           | CONFLICT_ALIAS  | null  |
 * | 4               | null        | CONFLICT_ALIAS  | null  |
 * | null            | null        | UNASSESSED      | null  |
 * | absent          | absent      | UNASSESSED      | null  |
 */
export function resolveIndicatorScore(
  scores: Record<string, unknown> | undefined | null,
  indicatorNumber: number
): IndicatorScoreResolution {
  if (indicatorNumber < 1 || indicatorNumber > 31 || !Number.isInteger(indicatorNumber)) {
    return {
      status: 'INVALID_VALUE',
      value: null,
      error: `Nomor indikator tidak valid: ${indicatorNumber}. Harus bilangan bulat 1-31.`,
    };
  }

  if (!scores || typeof scores !== 'object') {
    return { status: 'UNASSESSED', value: null };
  }

  const numStr = String(indicatorNumber);
  const canonicalKey = indicatorNumber < 10 ? `P0${numStr}` : `P${numStr}`;
  const legacyKey = `P${numStr}`;

  const hasCanonical = Object.prototype.hasOwnProperty.call(scores, canonicalKey);
  const hasLegacy = indicatorNumber < 10 && Object.prototype.hasOwnProperty.call(scores, legacyKey);

  const rawCanonical = hasCanonical ? scores[canonicalKey] : undefined;
  const rawLegacy = hasLegacy ? scores[legacyKey] : undefined;

  // Case 1: Neither exists
  if (!hasCanonical && !hasLegacy) {
    return { status: 'UNASSESSED', value: null, resolvedKey: canonicalKey };
  }

  // Case 2: Both exist (indicators 1-9)
  if (hasCanonical && hasLegacy) {
    // Both explicitly null
    if (rawCanonical === null && rawLegacy === null) {
      return { status: 'UNASSESSED', value: null, resolvedKey: canonicalKey };
    }

    // Discrepancy between alias keys
    if (rawCanonical !== rawLegacy) {
      return {
        status: 'CONFLICT_ALIAS',
        value: null,
        resolvedKey: canonicalKey,
        error: `Inkonsistensi alias skor: ${canonicalKey}=${String(rawCanonical)} vs ${legacyKey}=${String(rawLegacy)}. Agregasi diblokir.`,
        rawValues: { canonical: rawCanonical, legacy: rawLegacy },
      };
    }
  }

  // Selected candidate value
  const candidate = hasCanonical ? rawCanonical : rawLegacy;
  const resolvedKey = hasCanonical ? canonicalKey : legacyKey;

  if (candidate === null || candidate === undefined) {
    return { status: 'UNASSESSED', value: null, resolvedKey };
  }

  // Strict integer domain check: 1 | 2 | 3 | 4
  if (
    typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate >= 1 &&
    candidate <= 4
  ) {
    return {
      status: 'VALID',
      value: candidate as ValidAkhlakScore,
      resolvedKey,
    };
  }

  return {
    status: 'INVALID_VALUE',
    value: null,
    resolvedKey,
    error: `Nilai skor untuk ${resolvedKey} (${JSON.stringify(candidate)}) tidak sah. Harus bilangan bulat 1-4 atau null.`,
    rawValues: { canonical: rawCanonical, legacy: rawLegacy },
  };
}

export type CalculationSummaryStatus =
  | 'VALID'
  | 'PARTIAL'
  | 'UNASSESSED'
  | 'ALIAS_CONFLICT'
  | 'INVALID_SCORE'
  | 'VERSION_DENIED';

export interface CanonicalAssessmentSummary {
  status: CalculationSummaryStatus;
  resolvedInstrument: InstrumentResolutionResult;
  indicators: readonly AkhlakIndicatorDef[];
  indicatorScores: Record<string, ValidAkhlakScore>;
  assessedCount: number;
  unassessedCount: number;
  totalScore: number;
  averageScore: number | null;
  averagePercentage: number | null;
  predicate: 'SB' | 'B' | 'C' | 'K' | '-';
  errors: string[];
}

export function predicateFromAverage(avg: number | null): 'SB' | 'B' | 'C' | 'K' | '-' {
  if (avg === null || Number.isNaN(avg) || avg <= 0) return '-';
  if (avg >= 3.5) return 'SB';
  if (avg >= 2.5) return 'B';
  if (avg >= 1.5) return 'C';
  return 'K';
}

/**
 * Computes the canonical assessment summary across all 31 logical indicators.
 *
 * Guaranteed Invariants:
 * 1. Each indicator contributes EXACTLY ONCE to assessment calculations.
 * 2. Never uses Object.values(scores), eliminating double-counting alias distortion.
 * 3. Does not return a plausible average if an alias conflict or invalid score is present.
 */
export function computeCanonicalAssessmentSummary(
  scores: Record<string, unknown> | undefined | null,
  versionInput: unknown,
  options?: {
    allowHistoricalFallback?: boolean;
    isEmulator?: boolean;
  }
): CanonicalAssessmentSummary {
  const resolved = resolveAssessmentInstrument(versionInput, options);
  const errors: string[] = [];

  if (resolved.status === 'ENVIRONMENT_VERSION_DENIED' || !resolved.instrument) {
    return {
      status: 'VERSION_DENIED',
      resolvedInstrument: resolved,
      indicators: [],
      indicatorScores: {},
      assessedCount: 0,
      unassessedCount: 31,
      totalScore: 0,
      averageScore: null,
      averagePercentage: null,
      predicate: '-',
      errors: [resolved.error || 'Akses versi instrumen ditolak.'],
    };
  }

  const indicators = resolved.instrument.indicators;
  const indicatorScores: Record<string, ValidAkhlakScore> = {};
  let assessedCount = 0;
  let unassessedCount = 0;
  let totalScore = 0;
  let hasAliasConflict = false;
  let hasInvalidScore = false;

  for (let i = 1; i <= 31; i += 1) {
    const res = resolveIndicatorScore(scores, i);
    const key = i < 10 ? `P0${i}` : `P${i}`;

    if (res.status === 'CONFLICT_ALIAS') {
      hasAliasConflict = true;
      errors.push(res.error || `Konflik alias pada ${key}`);
      indicatorScores[key] = null;
    } else if (res.status === 'INVALID_VALUE') {
      hasInvalidScore = true;
      errors.push(res.error || `Nilai tidak valid pada ${key}`);
      indicatorScores[key] = null;
    } else if (res.status === 'VALID' && res.value !== null) {
      indicatorScores[key] = res.value;
      assessedCount += 1;
      totalScore += res.value;
    } else {
      indicatorScores[key] = null;
      unassessedCount += 1;
    }
  }

  // Conflict blocks calculation
  if (hasAliasConflict) {
    return {
      status: 'ALIAS_CONFLICT',
      resolvedInstrument: resolved,
      indicators,
      indicatorScores,
      assessedCount,
      unassessedCount,
      totalScore: 0,
      averageScore: null,
      averagePercentage: null,
      predicate: '-',
      errors,
    };
  }

  if (hasInvalidScore) {
    return {
      status: 'INVALID_SCORE',
      resolvedInstrument: resolved,
      indicators,
      indicatorScores,
      assessedCount,
      unassessedCount,
      totalScore: 0,
      averageScore: null,
      averagePercentage: null,
      predicate: '-',
      errors,
    };
  }

  if (assessedCount === 0) {
    return {
      status: 'UNASSESSED',
      resolvedInstrument: resolved,
      indicators,
      indicatorScores,
      assessedCount: 0,
      unassessedCount: 31,
      totalScore: 0,
      averageScore: null,
      averagePercentage: null,
      predicate: '-',
      errors: [],
    };
  }

  const avg = Number((totalScore / assessedCount).toFixed(2));
  // Percentage on 1-4 scale: ((avg - 1) / 3) * 100
  const avgPct = Number((((avg - 1) / 3) * 100).toFixed(1));
  const predicate = predicateFromAverage(avg);
  const status: CalculationSummaryStatus = assessedCount === 31 ? 'VALID' : 'PARTIAL';

  return {
    status,
    resolvedInstrument: resolved,
    indicators,
    indicatorScores,
    assessedCount,
    unassessedCount,
    totalScore,
    averageScore: avg,
    averagePercentage: avgPct,
    predicate,
    errors: [],
  };
}
