import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const EMULATOR_CONFIG = {
  authHost: '127.0.0.1',
  authPort: 9099,
  authUrl: 'http://127.0.0.1:9099',
  firestoreHost: '127.0.0.1',
  firestorePort: 8080,
  firestoreUrl: 'http://127.0.0.1:8080',
  uiUrl: 'http://127.0.0.1:4000',
} as const;

let isEmulatorConnected = false;

/**
 * Returns true if the application is running in local development or test mode
 * where emulator isolation is strictly required.
 * Returns false in production build.
 */
export function isEmulatorMode(): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (import.meta.env.PROD) return false;
    if (import.meta.env.DEV) return true;
  }
  return process.env.NODE_ENV !== 'production';
}

export function getEmulatorConfig() {
  return EMULATOR_CONFIG;
}

/**
 * Initialize emulator connections in local development mode.
 * In production builds (import.meta.env.PROD === true), this returns false
 * and never attaches emulator hooks.
 */
export function initializeFirebaseEmulators(): boolean {
  if (!isEmulatorMode()) {
    return false;
  }

  if (!isEmulatorConnected) {
    try {
      connectAuthEmulator(auth, EMULATOR_CONFIG.authUrl, { disableWarnings: true });
    } catch (err: unknown) {
      if (!String(err).includes('already')) {
        console.error('[SafetyGate] Failed to connect Auth emulator:', err);
      }
    }

    try {
      connectFirestoreEmulator(db, EMULATOR_CONFIG.firestoreHost, EMULATOR_CONFIG.firestorePort);
    } catch (err: unknown) {
      if (!String(err).includes('already')) {
        console.error('[SafetyGate] Failed to connect Firestore emulator:', err);
      }
    }

    isEmulatorConnected = true;
    return true;
  }

  return isEmulatorConnected;
}

// Auto-initialize when in dev / emulator mode
if (isEmulatorMode()) {
  initializeFirebaseEmulators();
}

export interface EmulatorHealthResult {
  ok: boolean;
  auth: boolean;
  firestore: boolean;
  error?: string;
}

/**
 * Probes the local Firebase Emulators directly.
 * Rejects silent fallback to Firebase Production.
 */
export async function checkEmulatorHealth(): Promise<EmulatorHealthResult> {
  if (!isEmulatorMode()) {
    return { ok: true, auth: true, firestore: true };
  }

  let authOk = false;
  let firestoreOk = false;

  try {
    const authRes = await fetch(EMULATOR_CONFIG.authUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    authOk = authRes.ok || authRes.status === 200;
  } catch {
    authOk = false;
  }

  try {
    const fsRes = await fetch(EMULATOR_CONFIG.firestoreUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    firestoreOk = fsRes.ok || fsRes.status === 200;
  } catch {
    firestoreOk = false;
  }

  const ok = authOk && firestoreOk;
  let error: string | undefined;

  if (!ok) {
    const missing: string[] = [];
    if (!authOk) {
      missing.push(`Auth Emulator (${EMULATOR_CONFIG.authHost}:${EMULATOR_CONFIG.authPort})`);
    }
    if (!firestoreOk) {
      missing.push(`Firestore Emulator (${EMULATOR_CONFIG.firestoreHost}:${EMULATOR_CONFIG.firestorePort})`);
    }
    error = `HARD PRODUCTION SAFETY GATE: Local development terisolasi penuh dari Firebase Production. ${missing.join(' dan ')} OFFLINE. Fallback ke Firebase Production DIBLOKIR SECARA KETAT untuk mencegah kebocoran atau kerusakan data. Jalankan emulator lokal: bun x firebase-tools emulators:start --only auth,firestore`;
  }

  return { ok, auth: authOk, firestore: firestoreOk, error };
}

/**
 * Asserts emulator is active; throws an error if offline, blocking execution.
 */
export async function assertEmulatorActive(): Promise<void> {
  if (!isEmulatorMode()) return;
  const health = await checkEmulatorHealth();
  if (!health.ok) {
    throw new Error(health.error);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  if (isEmulatorMode()) {
    const health = await checkEmulatorHealth();
    if (!health.ok) {
      console.error(health.error);
      return false;
    }
  }

  try {
    await getDocFromServer(doc(db, 'systemConfig', 'main'));
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';

    // Permission denied confirms the server is reached and evaluating rules
    if (
      code === 'permission-denied' ||
      message.includes('permission-denied') ||
      message.includes('PERMISSION_DENIED') ||
      message.includes("false for 'get'") ||
      message.includes('Missing or insufficient permissions')
    ) {
      return true;
    }

    // Offline or unreachable states mean NOT CONNECTED
    if (
      code === 'unavailable' ||
      code === 'failed-precondition' ||
      message.includes('the client is offline') ||
      message.includes('unavailable') ||
      message.includes('Failed to get document because the client is offline')
    ) {
      return false;
    }

    if (isEmulatorMode()) {
      return true;
    }

    return navigator.onLine;
  }
}
