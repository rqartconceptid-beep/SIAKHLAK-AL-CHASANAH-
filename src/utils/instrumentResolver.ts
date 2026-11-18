import {
  CANONICAL_31_INDICATORS,
  InstrumentDefinition,
  INSTRUMENT_DEFINITIONS,
  InstrumentVersion,
  LEGACY_31_INDICATORS,
} from '../types/siakhlak';
import { isEmulatorMode } from '../lib/firebase';

export type ResolutionStatus =
  | 'RESOLVED_LEGACY'
  | 'RESOLVED_CANONICAL'
  | 'MISSING_VERSION'
  | 'UNKNOWN_VERSION'
  | 'INVALID_VERSION'
  | 'ENVIRONMENT_VERSION_DENIED';

export interface InstrumentResolutionResult {
  status: ResolutionStatus;
  version: InstrumentVersion | null;
  instrument: InstrumentDefinition | null;
  error?: string;
  isHistoricalDefault: boolean;
}

/**
 * Resolves the instrument definition for an assessment record based on explicit provenance.
 *
 * Rules:
 * 1. Explicit 'v1.0-legacy' -> RESOLVED_LEGACY
 * 2. Explicit 'v2.0-canonical' ->
 *      - If in Emulator/DEV mode -> RESOLVED_CANONICAL
 *      - If in Production mode -> ENVIRONMENT_VERSION_DENIED
 * 3. Missing/undefined version on existing historical record:
 *      - If allowHistoricalFallback is true -> RESOLVED_LEGACY (marked as historical fallback)
 *      - If allowHistoricalFallback is false -> MISSING_VERSION
 * 4. Unknown string -> UNKNOWN_VERSION
 * 5. Malformed non-string -> INVALID_VERSION
 */
export function resolveAssessmentInstrument(
  versionInput: unknown,
  options?: {
    allowHistoricalFallback?: boolean;
    isEmulator?: boolean;
  }
): InstrumentResolutionResult {
  const allowFallback = options?.allowHistoricalFallback ?? true;
  const isEmu = options?.isEmulator ?? isEmulatorMode();

  // Case 1: Missing or undefined version
  if (versionInput === undefined || versionInput === null || versionInput === '') {
    if (allowFallback) {
      return {
        status: 'RESOLVED_LEGACY',
        version: 'v1.0-legacy',
        instrument: INSTRUMENT_DEFINITIONS['v1.0-legacy'],
        isHistoricalDefault: true,
      };
    }
    return {
      status: 'MISSING_VERSION',
      version: null,
      instrument: null,
      error: 'Dokumen penilaian tidak memiliki field instrumentVersion (Missing Version).',
      isHistoricalDefault: false,
    };
  }

  // Case 2: Not a string
  if (typeof versionInput !== 'string') {
    return {
      status: 'INVALID_VERSION',
      version: null,
      instrument: null,
      error: `Tipe instrumentVersion tidak valid: expected string, received ${typeof versionInput}.`,
      isHistoricalDefault: false,
    };
  }

  const normalized = versionInput.trim();

  // Case 3: Explicit v1.0-legacy
  if (normalized === 'v1.0-legacy') {
    return {
      status: 'RESOLVED_LEGACY',
      version: 'v1.0-legacy',
      instrument: INSTRUMENT_DEFINITIONS['v1.0-legacy'],
      isHistoricalDefault: false,
    };
  }

  // Case 4: Explicit v2.0-canonical
  if (normalized === 'v2.0-canonical') {
    if (!isEmu) {
      return {
        status: 'ENVIRONMENT_VERSION_DENIED',
        version: 'v2.0-canonical',
        instrument: null,
        error:
          'SECURITY GATE: Instrumen v2.0-canonical belum diaktifkan untuk Production (EMULATOR TESTING ONLY). Akses di lingkungan Production ditolak.',
        isHistoricalDefault: false,
      };
    }
    return {
      status: 'RESOLVED_CANONICAL',
      version: 'v2.0-canonical',
      instrument: INSTRUMENT_DEFINITIONS['v2.0-canonical'],
      isHistoricalDefault: false,
    };
  }

  // Case 5: Unknown version
  return {
    status: 'UNKNOWN_VERSION',
    version: null,
    instrument: null,
    error: `Versi instrumen tidak dikenal: '${normalized}'. Sistem hanya mendukung 'v1.0-legacy' dan 'v2.0-canonical'.`,
    isHistoricalDefault: false,
  };
}

/**
 * Asserts whether a new assessment record is permitted to be created with the requested version.
 * Production allows only 'v1.0-legacy'.
 * Emulator allows both 'v1.0-legacy' and 'v2.0-canonical'.
 */
export function assertPermittedCreationVersion(
  version: InstrumentVersion,
  options?: { isEmulator?: boolean }
): void {
  const isEmu = options?.isEmulator ?? isEmulatorMode();

  if (version === 'v1.0-legacy') {
    return; // Always permitted
  }

  if (version === 'v2.0-canonical') {
    if (!isEmu) {
      throw new Error(
        'SECURITY GATE: Pembuatan penilaian dengan instrumen v2.0-canonical DITOLAK di lingkungan Production. Menunggu Surat Keputusan Yayasan.'
      );
    }
    return; // Permitted in emulator
  }

  throw new Error(`Versi instrumen '${String(version)}' tidak sah untuk pembuatan penilaian baru.`);
}

/**
 * Returns available selectable instrument versions for creation UI.
 * Production UI returns only ['v1.0-legacy'].
 * Emulator UI returns ['v1.0-legacy', 'v2.0-canonical'].
 */
export function getSelectableCreationVersions(options?: {
  isEmulator?: boolean;
}): readonly InstrumentVersion[] {
  const isEmu = options?.isEmulator ?? isEmulatorMode();
  if (isEmu) {
    return ['v1.0-legacy', 'v2.0-canonical'] as const;
  }
  return ['v1.0-legacy'] as const;
}
