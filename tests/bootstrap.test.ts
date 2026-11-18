import assert from 'node:assert/strict';
import { bootstrapSuperAdmin } from '../scripts/bootstrapSuperAdmin';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
} from 'firebase/firestore';
import { EMULATOR_CONFIG } from '../src/lib/firebase';

console.log('=== RUNNING SUPER ADMIN BOOTSTRAP UNIT & INTEGRATION TESTS ===');

const TEST_PROJECT_ID = 'siakhlak-local-test';
const TEST_SUPER_UID = `test_sa_${Date.now()}`;
const TEST_SUPER_EMAIL = `superadmin_${Date.now()}@alchasanah.sch.id`;

const app = initializeApp(
  {
    apiKey: 'dummy-api-key',
    projectId: TEST_PROJECT_ID,
  },
  `test-bootstrap-verifier-${Date.now()}`
);
const db = getFirestore(app);
connectFirestoreEmulator(db, EMULATOR_CONFIG.firestoreHost, EMULATOR_CONFIG.firestorePort);

try {
  // TEST 1: Initial Bootstrap
  console.log('\n[TEST 1] Testing first-time bootstrap...');
  const res1 = await bootstrapSuperAdmin({
    uid: TEST_SUPER_UID,
    email: TEST_SUPER_EMAIL,
    fullName: 'Ust. H. Ahmad Fauzi (Super Admin)',
    projectId: TEST_PROJECT_ID,
  });

  assert.equal(res1.success, true);
  assert.equal(res1.status, 'CREATED');
  assert.equal(res1.uid, TEST_SUPER_UID);
  assert.ok(res1.rollbackInstruction.includes('DELETE'));

  // Verify Firestore documents written via admin REST endpoint
  const checkRes = await fetch(`http://${EMULATOR_CONFIG.firestoreHost}:${EMULATOR_CONFIG.firestorePort}/v1/projects/${TEST_PROJECT_ID}/databases/(default)/documents/users/${TEST_SUPER_UID}`, {
    headers: { Authorization: 'Bearer owner' }
  });
  assert.equal(checkRes.ok, true);
  const data = await checkRes.json();
  assert.equal(data.fields.role.stringValue, 'SUPER_ADMIN');
  assert.equal(data.fields.account_status.stringValue, 'ACTIVE');
  assert.equal(data.fields.emailVerified.booleanValue, true);
  assert.equal(data.fields.allowIndividualStudentAccess.booleanValue, true);

  const permRes = await fetch(`http://${EMULATOR_CONFIG.firestoreHost}:${EMULATOR_CONFIG.firestorePort}/v1/projects/${TEST_PROJECT_ID}/databases/(default)/documents/user_permissions/${TEST_SUPER_UID}`, {
    headers: { Authorization: 'Bearer owner' }
  });
  assert.equal(permRes.ok, true);
  const permData = await permRes.json();
  const perms = permData.fields.permissions.arrayValue.values.map((v: { stringValue: string }) => v.stringValue);
  assert.ok(perms.includes('super_admin:manage_governance'));
  assert.ok(perms.includes('users:manage_roles'));
  assert.ok(perms.includes('permissions:manage_matrix'));

  console.log('PASS TEST 1: Super admin documents created with all privileges.');

  // TEST 2: Idempotent Execution
  console.log('\n[TEST 2] Testing idempotent re-execution...');
  const res2 = await bootstrapSuperAdmin({
    uid: TEST_SUPER_UID,
    email: TEST_SUPER_EMAIL,
    fullName: 'Ust. H. Ahmad Fauzi (Super Admin)',
    projectId: TEST_PROJECT_ID,
  });

  assert.equal(res2.success, true);
  assert.equal(res2.status, 'ALREADY_EXISTS');
  assert.ok(res2.message.includes('sudah memiliki role SUPER_ADMIN'));
  console.log('PASS TEST 2: Idempotent re-run skips safely without corrupting data.');

  // TEST 3: Validation Error on missing parameters
  console.log('\n[TEST 3] Testing missing parameter validation...');
  await assert.rejects(
    async () => bootstrapSuperAdmin({ uid: '', email: 'admin@test.com', fullName: 'Admin' }),
    /Parameter UID wajib diisi/
  );
  await assert.rejects(
    async () => bootstrapSuperAdmin({ uid: 'some_uid', email: 'invalid_email', fullName: 'Admin' }),
    /Format email tidak valid/
  );
  console.log('PASS TEST 3: Invalid parameter inputs safely rejected.');

  console.log('\n=== ALL SUPER ADMIN BOOTSTRAP TESTS PASSED (100%) ===\n');
} finally {
  try {
    await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${TEST_PROJECT_ID}/databases/(default)/documents/users/${TEST_SUPER_UID}`, {
      method: 'DELETE',
    });
    await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${TEST_PROJECT_ID}/databases/(default)/documents/user_permissions/${TEST_SUPER_UID}`, {
      method: 'DELETE',
    });
  } catch {
    // Ignore cleanup error
  }
  await deleteApp(app);
}
