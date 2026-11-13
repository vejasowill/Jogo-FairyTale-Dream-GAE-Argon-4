import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  doc,
  type Firestore,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';
import {
  deleteObject,
  getBytes,
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage';
import appletFirebaseConfig from '../firebase-applet-config.json';

const env = (import.meta as any).env || {};
const rawEnvDbId = env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;
const resolvedProjectId =
  env.VITE_FIREBASE_PROJECT_ID || appletFirebaseConfig.projectId;

/**
 * Resolves the Cloud Firestore database ID safely across AI Studio and external deployments (e.g. Vercel):
 * - If unset, `(default)`, `default`, or accidentally set to the `projectId` (`fairytale-dream`),
 *   uses the provisioned AI Studio Firestore database ID (`appletFirebaseConfig.firestoreDatabaseId`).
 */
function resolveClientDatabaseId(raw: string | undefined): string {
  const cleaned = (raw || '').trim();
  if (
    !cleaned ||
    cleaned === '(default)' ||
    cleaned.toLowerCase() === 'default' ||
    cleaned === resolvedProjectId
  ) {
    return appletFirebaseConfig.firestoreDatabaseId || '(default)';
  }
  return cleaned;
}

const resolvedConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || appletFirebaseConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || appletFirebaseConfig.authDomain,
  projectId: resolvedProjectId,
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET || appletFirebaseConfig.storageBucket,
  messagingSenderId:
    env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    appletFirebaseConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || appletFirebaseConfig.appId,
  firestoreDatabaseId: resolveClientDatabaseId(rawEnvDbId),
};

export const firebaseApp = initializeApp(resolvedConfig);

export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export const db: Firestore =
  resolvedConfig.firestoreDatabaseId === '(default)'
    ? getFirestore(firebaseApp)
    : getFirestore(firebaseApp, resolvedConfig.firestoreDatabaseId);

/**
 * Secondary reference to the `(default)` Firestore database when the primary database is a named
 * instance, allowing discovery fallback if any world was previously stored in `(default)`.
 */
export const fallbackDefaultDb: Firestore | null =
  resolvedConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(firebaseApp)
    : null;

export const storage = getStorage(
  firebaseApp,
  resolvedConfig.storageBucket
    ? `gs://${resolvedConfig.storageBucket}`
    : undefined
);

export {
  deleteObject,
  getBytes,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  storageRef,
  updateProfile,
  uploadBytesResumable,
  type User,
};

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
  databaseId: string;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
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
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
    databaseId: resolvedConfig.firestoreDatabaseId,
  };
  console.error(
    'Firestore Error: ',
    JSON.stringify(errInfo)
  );
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Returns non-sensitive client-side configuration diagnostics to confirm whether
 * `VITE_FIREBASE_*` variables are loaded and that no `FIREBASE_ADMIN_*` secrets leak to the frontend.
 */
export function getClientFirebaseDiagnostics() {
  const exposedAdminKeys = Object.keys(env).filter((k) =>
    k.toUpperCase().includes('ADMIN') || k.toUpperCase().includes('PRIVATE_KEY')
  );
  return {
    projectId: resolvedConfig.projectId,
    authDomain: resolvedConfig.authDomain,
    storageBucket: resolvedConfig.storageBucket,
    firestoreDatabaseId: resolvedConfig.firestoreDatabaseId,
    usingViteEnvConfig: Boolean(
      env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID
    ),
    adminSecretsAbsentFromFrontend: exposedAdminKeys.length === 0,
  };
}

let connectionTested = false;
let lastConnectionResult = false;
let firestoreWriteQuotaExhausted = false;
let firestoreQuotaExhaustedReason: string | null = null;
const quotaExhaustedListeners = new Set<(reason: string) => void>();

export interface FirestoreQuotaResetInfo {
  isExhausted: boolean;
  errorReason: string;
  remainingHours: number;
  remainingMinutes: number;
  formattedCountdown: string;
  resetLocalTimeFormatted: string;
}

export function isFirestoreWriteQuotaExhausted(): boolean {
  return firestoreWriteQuotaExhausted;
}

/**
 * Computes the exact time remaining until Firebase / Google Cloud Firestore resets its daily
 * free-tier quota (which occurs daily at 00:00 Midnight Pacific Time - America/Los_Angeles).
 */
export function getFirestoreQuotaResetInfo(): FirestoreQuotaResetInfo {
  const now = new Date();
  let remainingSec = 3600;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value || 0) % 24;
    const m = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    const s = Number(parts.find((p) => p.type === 'second')?.value || 0);
    const elapsedSec = h * 3600 + m * 60 + s;
    remainingSec = Math.max(60, 86400 - elapsedSec);
  } catch {
    // Fallback to UTC-8 calculation if Intl timeZone is unavailable
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const ptHours = (utcHours - 8 + 24) % 24;
    const elapsedSec = ptHours * 3600 + utcMinutes * 60;
    remainingSec = Math.max(60, 86400 - elapsedSec);
  }

  let remainingHours = Math.floor(remainingSec / 3600);
  let remainingMinutes = Math.ceil((remainingSec % 3600) / 60);
  if (remainingMinutes >= 60) {
    remainingHours += 1;
    remainingMinutes = 0;
  }

  const resetDate = new Date(now.getTime() + remainingSec * 1000);
  let resetLocalTimeFormatted = '04:00';
  try {
    resetLocalTimeFormatted = resetDate.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    // ignore
  }

  const formattedCountdown =
    remainingHours > 0
      ? `${remainingHours}h ${remainingMinutes}min`
      : `${Math.max(1, remainingMinutes)}min`;

  return {
    isExhausted: firestoreWriteQuotaExhausted,
    errorReason:
      firestoreQuotaExhaustedReason ||
      'Limite diário gratuito de operações (leitura/gravação) do banco de dados Cloud Firestore atingido.',
    remainingHours,
    remainingMinutes,
    formattedCountdown,
    resetLocalTimeFormatted,
  };
}

export function isFirestoreQuotaExhaustedError(error: unknown): boolean {
  if (firestoreWriteQuotaExhausted) return true;
  const text =
    error instanceof Error
      ? `${error.name} ${error.message} ${(error as any).code || ''}`
      : String(error ?? '');
  if (
    text.includes('RESOURCE_EXHAUSTED') ||
    text.includes('resource-exhausted') ||
    text.includes('Quota limit exceeded') ||
    text.includes('Quota exceeded') ||
    text.includes('FIRESTORE_WRITE_QUOTA_EXHAUSTED') ||
    text.includes('FIRESTORE_QUOTA_EXHAUSTED')
  ) {
    const isReadQuota = text.includes('Free daily read units');
    const friendlyReason = isReadQuota
      ? 'Cota diária gratuita de leituras do Cloud Firestore excedida (Free daily read units per project).'
      : 'Cota diária gratuita de operações do Cloud Firestore excedida (Quota limit exceeded).';
    markFirestoreWriteQuotaExhausted(friendlyReason);
    return true;
  }
  return false;
}

export function markFirestoreWriteQuotaExhausted(
  reason = 'Cota diária gratuita do Cloud Firestore atingida.'
): void {
  if (!firestoreWriteQuotaExhausted) {
    firestoreWriteQuotaExhausted = true;
  }
  if (reason && !firestoreQuotaExhaustedReason) {
    firestoreQuotaExhaustedReason = reason;
  }
  for (const listener of Array.from(quotaExhaustedListeners)) {
    try {
      listener(firestoreQuotaExhaustedReason || reason);
    } catch {
      // ignore
    }
  }
}

export function onFirestoreWriteQuotaExhausted(
  listener: (reason: string) => void
): () => void {
  quotaExhaustedListeners.add(listener);
  if (firestoreWriteQuotaExhausted) {
    listener(
      'RESOURCE_EXHAUSTED: Cota diária gratuita do Firestore atingida.'
    );
  }
  return () => {
    quotaExhaustedListeners.delete(listener);
  };
}

// Intercept @firebase/firestore's internal GrpcConnection / WebChannel 'Write' stream
// RESOURCE_EXHAUSTED log messages so pending write promises abort in < 5ms instead of
// hanging indefinitely in Firebase SDK's 60s maximum backoff loop.
(() => {
  const checkArgsForQuotaError = (args: unknown[]) => {
    for (const arg of args) {
      const str = typeof arg === 'string' ? arg : String(arg ?? '');
      if (
        (str.includes('@firebase/firestore') ||
          str.includes('Firestore') ||
          str.includes('RESOURCE_EXHAUSTED') ||
          str.includes('resource-exhausted')) &&
        (str.includes('RESOURCE_EXHAUSTED') ||
          str.includes('resource-exhausted') ||
          str.includes('Quota limit exceeded') ||
          str.includes('Quota exceeded') ||
          str.includes('Using maximum backoff delay'))
      ) {
        markFirestoreWriteQuotaExhausted(
          'RESOURCE_EXHAUSTED: Limite diário de gravações do plano gratuito do Firestore atingido.'
        );
        return true;
      }
    }
    return false;
  };

  if (typeof console !== 'undefined') {
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    console.error = (...args: unknown[]) => {
      checkArgsForQuotaError(args);
      origError(...args);
    };
    console.warn = (...args: unknown[]) => {
      checkArgsForQuotaError(args);
      origWarn(...args);
    };
  }
})();

export async function testFirestoreConnection(force = false): Promise<boolean> {
  if (connectionTested && !force) return lastConnectionResult;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, '_connection_health', 'ping'));
    lastConnectionResult = true;
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error(
        'Please check your Firebase configuration. The client appears to be offline.'
      );
      lastConnectionResult = false;
      return false;
    }
    // Permission-denied or not-found on the health probe still proves Firestore is reachable
    lastConnectionResult = true;
    return true;
  }
}

