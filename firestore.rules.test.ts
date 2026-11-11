/**
 * Security Rules Specification & Dirty Dozen Verification Suite
 * Validates that all 12 adversarial payloads defined in security_spec.md
 * are strictly rejected with PERMISSION_DENIED by firestore.rules.
 */

export interface AdversarialTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  authUid: string | null;
  emailVerified: boolean;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TEST_CASES: AdversarialTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on UserProfile Create',
    collectionPath: '/users/victim_uid_123',
    operation: 'create',
    authUid: 'attacker_uid_999',
    emailVerified: true,
    payload: {
      uid: 'victim_uid_123',
      displayName: 'Attacker',
      photoURL: '',
      legacyLocalUid: 'player_abc123',
      appearance: {},
      settings: {},
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write on UserProfile',
    collectionPath: '/users/user_123',
    operation: 'create',
    authUid: 'user_123',
    emailVerified: false,
    payload: {
      uid: 'user_123',
      displayName: 'Unverified',
      photoURL: '',
      legacyLocalUid: 'player_abc123',
      appearance: {},
      settings: {},
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow / Ghost Field Injection (isAdmin: true)',
    collectionPath: '/users/user_123',
    operation: 'update',
    authUid: 'user_123',
    emailVerified: true,
    payload: {
      isAdmin: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'PII Cross-User Read on /users/{userId}/private/account',
    collectionPath: '/users/victim_uid_123/private/account',
    operation: 'get',
    authUid: 'attacker_uid_999',
    emailVerified: true,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Orphaned World Save Creation Without Parent User Document',
    collectionPath: '/users/ghost_uid/worlds/world_1',
    operation: 'create',
    authUid: 'ghost_uid',
    emailVerified: true,
    payload: {
      worldId: 'world_1',
      ownerId: 'ghost_uid',
      name: 'Orphan World',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Immutable ownerId Mutation on World Update',
    collectionPath: '/users/user_123/worlds/world_1',
    operation: 'update',
    authUid: 'user_123',
    emailVerified: true,
    payload: {
      ownerId: 'other_user_456',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Resource Poisoning (Oversized world name > 64 chars)',
    collectionPath: '/users/user_123/worlds/world_1',
    operation: 'update',
    authUid: 'user_123',
    emailVerified: true,
    payload: {
      name: 'A'.repeat(100),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Invalid Enum Value (difficulty: godmode)',
    collectionPath: '/users/user_123/worlds/world_1',
    operation: 'update',
    authUid: 'user_123',
    emailVerified: true,
    payload: {
      difficulty: 'godmode',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Forged Client Timestamp (updatedAt != request.time)',
    collectionPath: '/users/user_123/worlds/world_1',
    operation: 'update',
    authUid: 'user_123',
    emailVerified: true,
    payload: {
      name: 'Valid Name',
      updatedAt: '2099-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'ID Poisoning (Invalid Characters in Document ID)',
    collectionPath: '/users/user_123/worlds/world$bad!id',
    operation: 'create',
    authUid: 'user_123',
    emailVerified: true,
    payload: {
      worldId: 'world$bad!id',
      ownerId: 'user_123',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unauthorized Client Self-Grant of Entitlement',
    collectionPath: '/users/user_123/entitlements/vip_pack_1',
    operation: 'create',
    authUid: 'user_123',
    emailVerified: true,
    payload: {
      entitlementId: 'vip_pack_1',
      ownerId: 'user_123',
      sku: 'royal_mount_pack',
      category: 'cosmetic',
      status: 'active',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Cross-User World List Scraping',
    collectionPath: '/users/victim_uid_123/worlds',
    operation: 'list',
    authUid: 'attacker_uid_999',
    emailVerified: true,
    expectedResult: 'PERMISSION_DENIED',
  },
];
