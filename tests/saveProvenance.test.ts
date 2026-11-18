import assert from 'node:assert/strict';
import {
  assertPermittedCreationVersion,
  getSelectableCreationVersions,
  resolveAssessmentInstrument,
} from '../src/utils/instrumentResolver';

console.log('=== RUNNING ASSESSMENT SAVE PROVENANCE TESTS ===');

// 1. Emulator mode allows v2.0-canonical creation and UI selection
assert.doesNotThrow(() => {
  assertPermittedCreationVersion('v2.0-canonical', { isEmulator: true });
});

const versionsEmu = getSelectableCreationVersions({ isEmulator: true });
assert.deepStrictEqual(versionsEmu, ['v1.0-legacy', 'v2.0-canonical']);

const resEmu = resolveAssessmentInstrument('v2.0-canonical', { isEmulator: true });
assert.strictEqual(resEmu.status, 'RESOLVED_CANONICAL');
assert.strictEqual(resEmu.version, 'v2.0-canonical');
assert.strictEqual(resEmu.instrument?.indicators.length, 31);
console.log('PASS 1: Emulator mode allows v2.0-canonical creation and UI selection.');

// 2. Production mode STRICTLY REJECTS v2.0-canonical creation and hides it from UI
assert.throws(
  () => {
    assertPermittedCreationVersion('v2.0-canonical', { isEmulator: false });
  },
  /SECURITY GATE: Pembuatan penilaian dengan instrumen v2.0-canonical DITOLAK/
);

const versionsProd = getSelectableCreationVersions({ isEmulator: false });
assert.deepStrictEqual(versionsProd, ['v1.0-legacy']);

const resProd = resolveAssessmentInstrument('v2.0-canonical', { isEmulator: false });
assert.strictEqual(resProd.status, 'ENVIRONMENT_VERSION_DENIED');
assert.ok(resProd.error?.includes('EMULATOR TESTING ONLY'));
console.log('PASS 2: Production mode strictly rejects v2.0-canonical creation and hides from UI.');

// 3. Production mode permits v1.0-legacy creation seamlessly
assert.doesNotThrow(() => {
  assertPermittedCreationVersion('v1.0-legacy', { isEmulator: false });
});

const resLegacy = resolveAssessmentInstrument('v1.0-legacy', { isEmulator: false });
assert.strictEqual(resLegacy.status, 'RESOLVED_LEGACY');
assert.strictEqual(resLegacy.version, 'v1.0-legacy');
console.log('PASS 3: Production mode permits v1.0-legacy creation.');

// 4. Historical document with missing version resolves to v1.0-legacy fallback
const resFallback = resolveAssessmentInstrument(undefined, { allowHistoricalFallback: true });
assert.strictEqual(resFallback.status, 'RESOLVED_LEGACY');
assert.strictEqual(resFallback.version, 'v1.0-legacy');
assert.strictEqual(resFallback.isHistoricalDefault, true);
console.log('PASS 4: Historical document resolves to v1.0-legacy fallback.');

// 5. Rejects invalid and unauthorized versions
assert.throws(
  () => {
    // @ts-expect-error testing invalid version
    assertPermittedCreationVersion('v3.0-unauthorized', { isEmulator: true });
  },
  /tidak sah untuk pembuatan penilaian baru/
);

const resUnknown = resolveAssessmentInstrument('v3.0-unauthorized', { isEmulator: true });
assert.strictEqual(resUnknown.status, 'UNKNOWN_VERSION');
assert.strictEqual(resUnknown.version, null);
console.log('PASS 5: Rejects invalid and unauthorized versions.');

console.log('=== ALL SAVE PROVENANCE TESTS PASSED ===');
