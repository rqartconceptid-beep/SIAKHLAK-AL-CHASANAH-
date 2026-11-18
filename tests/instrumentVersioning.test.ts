import assert from 'node:assert/strict';
import {
  assertPermittedCreationVersion,
  getSelectableCreationVersions,
  resolveAssessmentInstrument,
} from '../src/utils/instrumentResolver';
import {
  computeCanonicalAssessmentSummary,
  predicateFromAverage,
  resolveIndicatorScore,
} from '../src/utils/scoreValidation';
import {
  CANONICAL_31_INDICATORS,
  INSTRUMENT_DEFINITIONS,
  LEGACY_31_INDICATORS,
} from '../src/types/siakhlak';

console.log('=== RUNNING SIAKHLAK INSTRUMENT VERSIONING & SCORE ENGINE TEST SUITE ===');

// --- TC-04 to TC-10: INSTRUMENT RESOLVER PROVENANCE TESTS ---
console.log('\n[TEST GROUP 1] Instrument Resolver Provenance & Environmental Gates');

// TC-04: Missing version with fallback allowed -> RESOLVED_LEGACY
const resFallback = resolveAssessmentInstrument(undefined, { allowHistoricalFallback: true });
assert.equal(resFallback.status, 'RESOLVED_LEGACY');
assert.equal(resFallback.version, 'v1.0-legacy');
assert.equal(resFallback.isHistoricalDefault, true);
assert.equal(resFallback.instrument?.indicators.length, 31);
console.log('PASS TC-04: Missing version resolves to legacy when fallback enabled.');

// TC-05: Missing version with fallback disabled -> MISSING_VERSION
const resNoFallback = resolveAssessmentInstrument(undefined, { allowHistoricalFallback: false });
assert.equal(resNoFallback.status, 'MISSING_VERSION');
assert.equal(resNoFallback.version, null);
assert.ok(resNoFallback.error?.includes('Missing Version'));
console.log('PASS TC-05: Missing version strictly rejected when fallback disabled.');

// TC-06: Explicit 'v1.0-legacy'
const resV1 = resolveAssessmentInstrument('v1.0-legacy');
assert.equal(resV1.status, 'RESOLVED_LEGACY');
assert.equal(resV1.version, 'v1.0-legacy');
assert.equal(resV1.isHistoricalDefault, false);
assert.equal(resV1.instrument?.name, 'Instrumen Penilaian Akhlakul Karimah v1.0 (Legacy Operational)');
console.log('PASS TC-06: Explicit v1.0-legacy resolved accurately.');

// TC-07: Explicit 'v2.0-canonical' in Emulator mode
const resV2Emu = resolveAssessmentInstrument('v2.0-canonical', { isEmulator: true });
assert.equal(resV2Emu.status, 'RESOLVED_CANONICAL');
assert.equal(resV2Emu.version, 'v2.0-canonical');
assert.equal(resV2Emu.instrument?.name, 'Instrumen Penilaian Akhlakul Karimah v2.0 (Resmi Yayasan Al-Chasanah)');
assert.equal(resV2Emu.instrument?.sourceDocument, 'Format Penilaian Akhlakul Karimah(1).docx [S2]');
console.log('PASS TC-07: Explicit v2.0-canonical resolves in Emulator environment.');

// TC-08: Explicit 'v2.0-canonical' in Production mode -> DENIED
const resV2Prod = resolveAssessmentInstrument('v2.0-canonical', { isEmulator: false });
assert.equal(resV2Prod.status, 'ENVIRONMENT_VERSION_DENIED');
assert.equal(resV2Prod.instrument, null);
assert.ok(resV2Prod.error?.includes('SECURITY GATE'));
console.log('PASS TC-08: Explicit v2.0-canonical strictly denied in Production mode.');

// TC-09: Unknown version string
const resUnknown = resolveAssessmentInstrument('v3.0-custom');
assert.equal(resUnknown.status, 'UNKNOWN_VERSION');
assert.equal(resUnknown.instrument, null);
assert.ok(resUnknown.error?.includes('tidak dikenal'));
console.log('PASS TC-09: Unknown version string blocked with typed error.');

// TC-10: Malformed non-string version
const resInvalid = resolveAssessmentInstrument(12345);
assert.equal(resInvalid.status, 'INVALID_VERSION');
assert.ok(resInvalid.error?.includes('Tipe instrumentVersion tidak valid'));
console.log('PASS TC-10: Malformed non-string version blocked.');

// --- CREATION GUARDS & SELECTION ---
console.log('\n[TEST GROUP 2] Assessment Creation Guards & UI Selection');

// TC-21: Creation permission asserts
assert.doesNotThrow(() => assertPermittedCreationVersion('v1.0-legacy', { isEmulator: false }));
assert.doesNotThrow(() => assertPermittedCreationVersion('v1.0-legacy', { isEmulator: true }));
assert.doesNotThrow(() => assertPermittedCreationVersion('v2.0-canonical', { isEmulator: true }));
assert.throws(
  () => assertPermittedCreationVersion('v2.0-canonical', { isEmulator: false }),
  /SECURITY GATE: Pembuatan penilaian dengan instrumen v2.0-canonical DITOLAK di lingkungan Production/
);
console.log('PASS TC-21: assertPermittedCreationVersion enforces production vs emulator bounds.');

// TC-22: Selectable creation versions
assert.deepEqual(getSelectableCreationVersions({ isEmulator: false }), ['v1.0-legacy']);
assert.deepEqual(getSelectableCreationVersions({ isEmulator: true }), ['v1.0-legacy', 'v2.0-canonical']);
console.log('PASS TC-22: getSelectableCreationVersions hides v2 in production.');

// --- TC-11 to TC-19: SCORE RESOLUTION & ALIAS COMPATIBILITY ---
console.log('\n[TEST GROUP 3] Score Domain Validation & Alias Resolution');

// TC-11: Valid scores 1, 2, 3, 4, null
for (const val of [1, 2, 3, 4, null]) {
  const r = resolveIndicatorScore({ P01: val }, 1);
  if (val === null) {
    assert.equal(r.status, 'UNASSESSED');
    assert.equal(r.value, null);
  } else {
    assert.equal(r.status, 'VALID');
    assert.equal(r.value, val);
  }
}
console.log('PASS TC-11: Valid score domain (1, 2, 3, 4, null) verified.');

// TC-12: Invalid scores rejected
const invalidScores = ['4', '3', 3.5, 0, 5, -1, NaN, Infinity, {}, []];
for (const inv of invalidScores) {
  const r = resolveIndicatorScore({ P01: inv }, 1);
  assert.equal(r.status, 'INVALID_VALUE', `Value ${JSON.stringify(inv)} must be rejected`);
  assert.equal(r.value, null);
  assert.ok(r.error?.includes('tidak sah'));
}
console.log('PASS TC-12: Strings, decimals, out-of-range, NaN, and objects strictly rejected.');

// TC-13: Missing score remains unassessed
const rMissing = resolveIndicatorScore({}, 1);
assert.equal(rMissing.status, 'UNASSESSED');
assert.equal(rMissing.value, null);
console.log('PASS TC-13: Missing scores remain unassessed (never converted to 0 or 4).');

// TC-14: P01-only and P1-only resolution
const rP01 = resolveIndicatorScore({ P01: 4 }, 1);
assert.equal(rP01.status, 'VALID');
assert.equal(rP01.value, 4);

const rP1 = resolveIndicatorScore({ P1: 4 }, 1);
assert.equal(rP1.status, 'VALID');
assert.equal(rP1.value, 4);
console.log('PASS TC-14: P01-only and P1-only resolve to identical logical score.');

// TC-15: Equal alias values counted once (Truth Table Case 3)
const rAliasEqual = resolveIndicatorScore({ P01: 4, P1: 4 }, 1);
assert.equal(rAliasEqual.status, 'VALID');
assert.equal(rAliasEqual.value, 4);
console.log('PASS TC-15: Consistent alias keys (P01=4, P1=4) accepted as single value 4.');

// TC-16: Conflicting alias values rejected (Truth Table Case 4)
const rAliasConflict = resolveIndicatorScore({ P01: 4, P1: 3 }, 1);
assert.equal(rAliasConflict.status, 'CONFLICT_ALIAS');
assert.equal(rAliasConflict.value, null);
assert.ok(rAliasConflict.error?.includes('Inkonsistensi alias skor'));
console.log('PASS TC-16: Conflicting alias values (P01=4, P1=3) blocked as CONFLICT_ALIAS.');

// TC-17: Null vs numeric alias conflict (Truth Table Cases 5 & 6)
const rNullConflict1 = resolveIndicatorScore({ P01: null, P1: 4 }, 1);
assert.equal(rNullConflict1.status, 'CONFLICT_ALIAS');

const rNullConflict2 = resolveIndicatorScore({ P01: 4, P1: null }, 1);
assert.equal(rNullConflict2.status, 'CONFLICT_ALIAS');
console.log('PASS TC-17: Null vs numeric alias discrepancies blocked as CONFLICT_ALIAS.');

// TC-18 & 19: Null/null and absent/absent
const rBothNull = resolveIndicatorScore({ P01: null, P1: null }, 1);
assert.equal(rBothNull.status, 'UNASSESSED');
assert.equal(rBothNull.value, null);

const rBothAbsent = resolveIndicatorScore({}, 1);
assert.equal(rBothAbsent.status, 'UNASSESSED');
assert.equal(rBothAbsent.value, null);
console.log('PASS TC-18 & TC-19: Explicit null/null and absent/absent resolve to unassessed null.');

// --- TC-20: CANONICAL CALCULATION & SKEW ELIMINATION ---
console.log('\n[TEST GROUP 4] Canonical Calculation & Arithmetic Skew Elimination');

// Build scores with dual-write aliases for P01-P09
const dualWriteScores: Record<string, number> = {};
for (let i = 1; i <= 31; i += 1) {
  const pCode = i < 10 ? `P0${i}` : `P${i}`;
  dualWriteScores[pCode] = 4;
  if (i < 10) {
    dualWriteScores[`P${i}`] = 4; // Dual-write alias
  }
}
// Object has 40 keys (31 + 9 aliases)
assert.equal(Object.keys(dualWriteScores).length, 40);

const summary = computeCanonicalAssessmentSummary(dualWriteScores, 'v1.0-legacy');
assert.equal(summary.status, 'VALID');
assert.equal(summary.assessedCount, 31, 'Must assess exactly 31 indicators, not 40');
assert.equal(summary.unassessedCount, 0);
assert.equal(summary.totalScore, 124, '31 * 4 = 124');
assert.equal(summary.averageScore, 4.0);
assert.equal(summary.averagePercentage, 100.0);
assert.equal(summary.predicate, 'SB');
console.log('PASS TC-20: Canonical summary assesses exactly 31 items (dual-write aliases do NOT cause +12% skew).');

// Verify calculation blocking on alias conflict
const conflictingScores = { ...dualWriteScores, P1: 2 }; // P01=4, P1=2
const conflictSummary = computeCanonicalAssessmentSummary(conflictingScores, 'v1.0-legacy');
assert.equal(conflictSummary.status, 'ALIAS_CONFLICT');
assert.equal(conflictSummary.averageScore, null, 'Must NOT return plausible average on conflict');
assert.equal(conflictSummary.predicate, '-');
assert.ok(conflictSummary.errors.length > 0);
console.log('PASS: Calculation engine refuses to generate average when alias conflict exists.');

// Verify partial assessment calculation
const partialScores: Record<string, number | null> = { P01: 3, P02: 4, P03: 3 };
const partialSummary = computeCanonicalAssessmentSummary(partialScores, 'v1.0-legacy');
assert.equal(partialSummary.status, 'PARTIAL');
assert.equal(partialSummary.assessedCount, 3);
assert.equal(partialSummary.unassessedCount, 28);
assert.equal(partialSummary.totalScore, 10);
assert.equal(partialSummary.averageScore, 3.33);
assert.equal(partialSummary.predicate, 'B');
console.log('PASS: Partial assessment accurately calculated based on assessed items only.');

// Predicate thresholds
assert.equal(predicateFromAverage(4.0), 'SB');
assert.equal(predicateFromAverage(3.5), 'SB');
assert.equal(predicateFromAverage(3.49), 'B');
assert.equal(predicateFromAverage(2.5), 'B');
assert.equal(predicateFromAverage(2.49), 'C');
assert.equal(predicateFromAverage(1.5), 'C');
assert.equal(predicateFromAverage(1.49), 'K');
assert.equal(predicateFromAverage(1.0), 'K');
assert.equal(predicateFromAverage(null), '-');
console.log('PASS: Predicate thresholds (SB >= 3.5, B >= 2.5, C >= 1.5, K < 1.5) verified.');

console.log('\n=== ALL INSTRUMENT VERSIONING & SCORE ENGINE TESTS PASSED (100%) ===\n');
