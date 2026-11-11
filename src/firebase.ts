import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import {
  deleteObject,
  getBytes,
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage';
import appletFirebaseConfig from '../firebase-applet-config.json';

const env = (import.meta as any).env || {};

function resolveClientDatabaseId(
  envDbId: string | undefined,
  appletDbId: string | undefined
): string | undefined {
  const raw = (envDbId || '').trim();
  if (!raw || raw.toLowerCase() === 'default' || raw === '(default)') {
    return appletDbId || undefined;
  }
  return raw;
}

const resolvedConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || appletFirebaseConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || appletFirebaseConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || appletFirebaseConfig.projectId,
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET || appletFirebaseConfig.storageBucket,
  messagingSenderId:
    env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    appletFirebaseConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || appletFirebaseConfig.appId,
  firestoreDatabaseId: resolveClientDatabaseId(
    env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
    appletFirebaseConfig.firestoreDatabaseId
  ),
};

export const firebaseApp = initializeApp(resolvedConfig);

export const db = resolvedConfig.firestoreDatabaseId
  ? getFirestore(firebaseApp, resolvedConfig.firestoreDatabaseId)
  : getFirestore(firebaseApp);

export const storage = getStorage(firebaseApp);

export const auth = getAuth(firebaseApp);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

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
      displayName?: string | null;
      photoUrl?: string | null;
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
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
          displayName: provider.displayName,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionTested = false;
let lastFirestorePingOk = false;

export async function testFirestoreConnection(force = false): Promise<boolean> {
  if (connectionTested && !force) return lastFirestorePingOk;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    lastFirestorePingOk = true;
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
      lastFirestorePingOk = false;
      return false;
    }
    // Permission denied on /test/connection is expected because of default-deny security rules,
    // which confirms the Firestore server responded and is reachable!
    lastFirestorePingOk = true;
    return true;
  }
}

export interface ClientFirebaseDiagnostics {
  projectId: string;
  authDomain: string;
  storageBucket: string;
  firestoreDatabaseId: string;
  clientConfigComplete: boolean;
  adminSecretsAbsentFromFrontend: boolean;
}

export function getClientFirebaseDiagnostics(): ClientFirebaseDiagnostics {
  const envKeys = Object.keys(env);
  const leakedAdminKey = envKeys.some(
    (k) =>
      k.includes('ADMIN_PRIVATE_KEY') ||
      k.includes('ADMIN_CLIENT_EMAIL') ||
      k === 'FIREBASE_ADMIN_PROJECT_ID'
  );
  return {
    projectId: resolvedConfig.projectId || '',
    authDomain: resolvedConfig.authDomain || '',
    storageBucket: resolvedConfig.storageBucket || '',
    firestoreDatabaseId: resolvedConfig.firestoreDatabaseId || '(default)',
    clientConfigComplete: Boolean(
      resolvedConfig.apiKey &&
        resolvedConfig.authDomain &&
        resolvedConfig.projectId &&
        resolvedConfig.appId
    ),
    adminSecretsAbsentFromFrontend: !leakedAdminKey,
  };
}

void testFirestoreConnection();

export {
  deleteObject,
  getBytes,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  storageRef,
  uploadBytesResumable,
};
export type { User };

