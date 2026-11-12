import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
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
const quotaExhaustedListeners = new Set<(reason: string) => void>();

export function isFirestoreWriteQuotaExhausted(): boolean {
  return firestoreWriteQuotaExhausted;
}

export function markFirestoreWriteQuotaExhausted(
  reason = 'RESOURCE_EXHAUSTED: Cota diária gratuita de gravações do Firestore atingida.'
): void {
  if (!firestoreWriteQuotaExhausted) {
    firestoreWriteQuotaExhausted = true;
  }
  for (const listener of Array.from(quotaExhaustedListeners)) {
    try {
      listener(reason);
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
      'RESOURCE_EXHAUSTED: Cota diária gratuita de gravações do Firestore atingida.'
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

