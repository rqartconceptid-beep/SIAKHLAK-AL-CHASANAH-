/**
 * SIAKHLAK — SUPER ADMIN BOOTSTRAP UTILITY
 *
 * Secure administrative procedure to bootstrap the initial Super Admin in Firebase.
 *
 * Safety Invariants:
 * 1. Zero hardcoded passwords or secrets in source code.
 * 2. Zero hardcoded email bypass. Requires explicit target identity.
 * 3. Idempotent: Refuses to overwrite existing privileged accounts without --force.
 * 4. Logs audit trail for administrative tracking.
 * 5. Uses trusted administrative context (REST API with admin bearer / service credentials).
 */

import {
  ALL_PERMISSIONS,
  DEFAULT_ORGANIZATION_ID,
  EDUCATION_LEVELS,
} from '../src/types/siakhlak';
import { EMULATOR_CONFIG } from '../src/lib/firebase';
import firebaseConfig from '../firebase-applet-config.json';

export interface BootstrapSuperAdminOptions {
  uid: string;
  email: string;
  fullName: string;
  force?: boolean;
  projectId?: string;
  firestoreHost?: string;
  firestorePort?: number;
  adminToken?: string;
}

export interface BootstrapResult {
  success: boolean;
  status: 'CREATED' | 'ALREADY_EXISTS' | 'UPDATED' | 'REFUSED';
  uid: string;
  email: string;
  message: string;
  rollbackInstruction: string;
}

function valueToFirestoreField(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => valueToFirestoreField(item)) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = valueToFirestoreField(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function objectToFirestoreFields(obj: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = valueToFirestoreField(v);
  }
  return fields;
}

function parseFirestoreFields(fields: Record<string, unknown> = {}): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fields)) {
    const f = val as Record<string, unknown>;
    if ('stringValue' in f) result[key] = f.stringValue;
    else if ('booleanValue' in f) result[key] = f.booleanValue;
    else if ('integerValue' in f) result[key] = Number(f.integerValue);
    else if ('doubleValue' in f) result[key] = f.doubleValue;
    else if ('nullValue' in f) result[key] = null;
    else if ('arrayValue' in f) {
      const arr = (f.arrayValue as { values?: unknown[] })?.values || [];
      result[key] = arr.map((item) => {
        const itemObj = item as Record<string, unknown>;
        if ('stringValue' in itemObj) return itemObj.stringValue;
        return item;
      });
    }
  }
  return result;
}

export async function bootstrapSuperAdmin(
  options: BootstrapSuperAdminOptions
): Promise<BootstrapResult> {
  const {
    uid,
    email,
    fullName,
    force = false,
    projectId = 'siakhlak-local-test',
    firestoreHost = EMULATOR_CONFIG.firestoreHost,
    firestorePort = EMULATOR_CONFIG.firestorePort,
    adminToken = 'owner', // Firebase Emulator accepts 'owner' bearer for admin REST operations
  } = options;

  if (!uid || !uid.trim()) {
    throw new Error('Bootstrap gagal: Parameter UID wajib diisi.');
  }
  if (!email || !email.includes('@')) {
    throw new Error('Bootstrap gagal: Format email tidak valid.');
  }

  const baseUrl = `http://${firestoreHost}:${firestorePort}/v1/projects/${projectId}/databases/(default)/documents`;
  const headers = {
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  };

  // 1. Check if user already exists
  const userUrl = `${baseUrl}/users/${encodeURIComponent(uid)}`;
  let existingUser: Record<string, unknown> | null = null;

  const checkRes = await fetch(userUrl, { headers });
  if (checkRes.ok) {
    const data = await checkRes.json();
    existingUser = parseFirestoreFields(data.fields);
  }

  if (existingUser) {
    const existingRole = existingUser.role;
    if (existingRole === 'SUPER_ADMIN' && !force) {
      return {
        success: true,
        status: 'ALREADY_EXISTS',
        uid,
        email,
        message: `Akun UID '${uid}' (${email}) sudah memiliki role SUPER_ADMIN aktif. Tindakan dilewati (idempotent).`,
        rollbackInstruction: `Untuk mencabut, hapus dokumen 'users/${uid}' dan 'user_permissions/${uid}'.`,
      };
    }

    if (!force) {
      return {
        success: false,
        status: 'REFUSED',
        uid,
        email,
        message: `REFUSED: Akun UID '${uid}' sudah ada dengan role '${existingRole}'. Gunakan parameter force=true untuk menimpa.`,
        rollbackInstruction: 'Tidak ada perubahan data dilakukan.',
      };
    }
  }

  const nowIso = new Date().toISOString();

  // 2. Write User Profile document
  const userPayload = {
    uid,
    email: email.trim().toLowerCase(),
    full_name: fullName.trim(),
    displayName: fullName.trim(),
    role: 'SUPER_ADMIN',
    roles: ['SUPER_ADMIN', 'FOUNDATION_ADMIN'],
    account_status: 'ACTIVE',
    profile_status: 'VERIFIED',
    emailVerified: true,
    organization_id: DEFAULT_ORGANIZATION_ID,
    assignedUnits: [...EDUCATION_LEVELS],
    assignedClassIds: [],
    linkedStudentIds: [],
    allowIndividualStudentAccess: true,
    created_at: existingUser ? String(existingUser.created_at || nowIso) : nowIso,
    updated_at: nowIso,
  };

  const putUserRes = await fetch(userUrl, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: objectToFirestoreFields(userPayload) }),
  });

  if (!putUserRes.ok) {
    const errText = await putUserRes.text();
    throw new Error(`Gagal menulis user document: ${putUserRes.status} ${errText}`);
  }

  // 3. Write User Permissions document
  const permUrl = `${baseUrl}/user_permissions/${encodeURIComponent(uid)}`;
  const allPermissionKeys = ALL_PERMISSIONS.map((p) => p.key);
  const permPayload = {
    uid,
    organization_id: DEFAULT_ORGANIZATION_ID,
    permissions: allPermissionKeys,
    assigned_units: [...EDUCATION_LEVELS],
    assigned_classes: [],
    updated_by: 'system_bootstrap',
    updated_at: nowIso,
  };

  const putPermRes = await fetch(permUrl, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: objectToFirestoreFields(permPayload) }),
  });

  if (!putPermRes.ok) {
    const errText = await putPermRes.text();
    throw new Error(`Gagal menulis permissions document: ${putPermRes.status} ${errText}`);
  }

  // 4. Write Audit Trail
  const auditId = `audit_bootstrap_${uid}_${Date.now()}`;
  const auditUrl = `${baseUrl}/audit_logs/${encodeURIComponent(auditId)}`;
  const auditPayload = {
    actorUid: 'system_bootstrap',
    actorName: 'Administrative Bootstrap CLI',
    actorRole: 'SYSTEM',
    action: 'BOOTSTRAP_SUPER_ADMIN',
    targetCollection: 'users',
    targetId: uid,
    summary: `Akun '${email}' (UID: ${uid}) ditetapkan sebagai SUPER_ADMIN dengan seluruh matriks izin.`,
    createdAt: nowIso,
  };

  await fetch(auditUrl, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: objectToFirestoreFields(auditPayload) }),
  });

  // 5. Also sync to active project & database scopes in emulator (e.g. firebase-applet-config custom database)
  const targetProjectIds = Array.from(
    new Set([projectId, firebaseConfig.projectId, 'siakhlak-local-test'].filter(Boolean))
  );
  const targetDatabaseIds = Array.from(
    new Set(['(default)', firebaseConfig.firestoreDatabaseId].filter(Boolean))
  );

  for (const pId of targetProjectIds) {
    for (const dId of targetDatabaseIds) {
      if (pId === projectId && dId === '(default)') continue;
      const bUrl = `http://${firestoreHost}:${firestorePort}/v1/projects/${pId}/databases/${dId}/documents`;
      await fetch(`${bUrl}/users/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: objectToFirestoreFields(userPayload) }),
      });
      await fetch(`${bUrl}/user_permissions/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: objectToFirestoreFields(permPayload) }),
      });
      await fetch(`${bUrl}/audit_logs/${encodeURIComponent(auditId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: objectToFirestoreFields(auditPayload) }),
      });
    }
  }

  return {
    success: true,
    status: existingUser ? 'UPDATED' : 'CREATED',
    uid,
    email,
    message: `BERHASIL: Akun '${email}' (UID: ${uid}) berhasil di-bootstrap sebagai SUPER_ADMIN.`,
    rollbackInstruction: `Rollback endpoint: DELETE ${userUrl} dan DELETE ${permUrl}`,
  };
}

// Standalone CLI execution
if (import.meta.main) {
  const args = process.argv.slice(2);
  const uid = args.find((a) => a.startsWith('--uid='))?.split('=')[1] || process.env.BOOTSTRAP_UID;
  const email = args.find((a) => a.startsWith('--email='))?.split('=')[1] || process.env.BOOTSTRAP_EMAIL;
  const name = args.find((a) => a.startsWith('--name='))?.split('=')[1] || 'Super Administrator SIAKHLAK';
  const force = args.includes('--force');

  if (!uid || !email) {
    console.log(`
SIAKHLAK Super Admin Bootstrap CLI
Penggunaan:
  bun run scripts/bootstrapSuperAdmin.ts --uid=<FIREBASE_AUTH_UID> --email=<EMAIL> [--name="<NAMA>"] [--force]

Contoh (Emulator):
  bun run scripts/bootstrapSuperAdmin.ts --uid=uid_superadmin_001 --email=superadmin@alchasanah.sch.id
`);
    process.exit(0);
  }

  bootstrapSuperAdmin({ uid, email, fullName: name, force })
    .then((res) => {
      console.log('\n[HASIL BOOTSTRAP SUPER ADMIN]');
      console.log(`Status:  ${res.status}`);
      console.log(`Pesan:   ${res.message}`);
      console.log(`Petunjuk Rollback: ${res.rollbackInstruction}\n`);
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Error executing bootstrap:', err);
      process.exit(1);
    });
}
