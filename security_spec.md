# Security Specification — FairyTale Dream / Wildborn Firebase Integration

## 1. Data Invariants

1. **Master Gate & Ownership Isolation**:
   - Every `/users/{userId}` document can only be read, created, or updated by the authenticated user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
   - Every sub-document in `/users/{userId}/private/{docId}`, `/users/{userId}/worlds/{worldId}`, `/users/{userId}/worlds/{worldId}/chunks/{chunkKey}`, and `/users/{userId}/guestProfiles/{worldId}` requires:
     - `request.auth != null` and `request.auth.uid == userId`
     - On `allow get`: `(resource == null || existing().uid == request.auth.uid)` (for `/private/{docId}`) or `(resource == null || existing().ownerId == request.auth.uid)` (for `/worlds/{worldId}`, `/worlds/{worldId}/chunks/{chunkKey}`, `/guestProfiles/{worldId}`, and `/entitlements/{entitlementId}`) so that `getDoc` before `setDoc` on a non-existent document succeeds for the authenticated owner (`userId == request.auth.uid`) while blocking any other user.
     - Parent `/users/{userId}` existence (`exists(/databases/$(database)/documents/users/$(userId)) || existsAfter(/databases/$(database)/documents/users/$(userId))`) and ownership check on single-document writes (`create`, `update`, `delete`).
     - Parent `/users/{userId}/worlds/{worldId}` existence (`exists` or `existsAfter`) on `/chunks/{chunkKey}` writes.
     - Explicit `resource.data.ownerId == request.auth.uid` check on `list` queries (without `get()` inside `allow list` to prevent $O(n)$ read cost attacks).
2. **PII Split Collection Strategy**:
   - Email (`email`) is strictly isolated in `/users/{userId}/private/{docId}` (`docId == 'account'`) and never stored in `/users/{userId}`. Access is strictly restricted to `isOwner(userId)` and only fields `['uid', 'email', 'createdAt', 'updatedAt']` are allowed.
3. **Immutable Identity & Creation Timestamps**:
   - `uid`, `ownerId`, `worldId`, `chunkKey`, and `createdAt` are strictly immutable across all `update` operations.
   - `createdAt` on `create` and `updatedAt` on `create`/`update` must equal `request.time`.
4. **System-Only Entitlements (Microtransaction & Exclusive Content Readiness)**:
   - `/users/{userId}/entitlements/{entitlementId}` is strictly read-only (`get`, `list`) for the authenticated owner (`request.auth.uid == userId && (resource == null || resource.data.ownerId == request.auth.uid)`).
   - All client writes (`create`, `update`, `delete`) to `/users/{userId}/entitlements/{entitlementId}` are unconditionally denied (`if false;`), ensuring only the backend Firebase Admin SDK can grant or revoke purchases and exclusive items.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 — Identity Spoofing on UserProfile Create**:
   ```json
   {
     "path": "/users/victim_uid_123",
     "auth": { "uid": "attacker_uid_999", "email_verified": true },
     "op": "create",
     "data": {
       "uid": "victim_uid_123",
       "displayName": "Attacker",
       "photoURL": "",
       "legacyLocalUid": "player_abc123",
       "appearance": {},
       "settings": {},
       "createdAt": "SERVER_TIMESTAMP",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
2. **Payload 2 — Unverified Email Write**:
   ```json
   {
     "path": "/users/user_123",
     "auth": { "uid": "user_123", "email_verified": false },
     "op": "create",
     "data": {
       "uid": "user_123",
       "displayName": "Unverified",
       "photoURL": "",
       "legacyLocalUid": "player_abc123",
       "appearance": {},
       "settings": {},
       "createdAt": "SERVER_TIMESTAMP",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
3. **Payload 3 — Shadow / Ghost Field Injection (`isAdmin: true`)**:
   ```json
   {
     "path": "/users/user_123",
     "auth": { "uid": "user_123", "email_verified": true },
     "op": "update",
     "data": {
       "uid": "user_123",
       "displayName": "Hero",
       "photoURL": "",
       "legacyLocalUid": "player_abc123",
       "appearance": {},
       "settings": {},
       "isAdmin": true,
       "createdAt": "EXISTING_TIMESTAMP",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
4. **Payload 4 — PII Cross-User Read on `/users/{userId}/private/account`**:
   ```json
   {
     "path": "/users/victim_uid_123/private/account",
     "auth": { "uid": "attacker_uid_999", "email_verified": true },
     "op": "get"
   }
   ```
5. **Payload 5 — Orphaned World Save Creation (No Parent `/users/{userId}`)**:
   ```json
   {
     "path": "/users/ghost_uid/worlds/world_1",
     "auth": { "uid": "ghost_uid", "email_verified": true },
     "op": "create",
     "data": {
       "worldId": "world_1",
       "ownerId": "ghost_uid",
       "name": "Orphan World",
       "seed": 123456,
       "seedText": "123456",
       "difficulty": "normal",
       "dayCount": 1,
       "timeOfDay": 8,
       "playerLevel": 1,
       "exploredChunksCount": 1,
       "gameVersion": "0.4.3-beta",
       "worldGenVersion": 3,
       "checksum": "a1b2c3d4",
       "clientUpdatedAt": 1700000000000,
       "savePayload": { "version": 3, "metadata": {}, "player": {}, "chunks": {} },
       "createdAt": "SERVER_TIMESTAMP",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
6. **Payload 6 — Immutable `ownerId` Mutation on World Update**:
   ```json
   {
     "path": "/users/user_123/worlds/world_1",
     "auth": { "uid": "user_123", "email_verified": true },
     "op": "update",
     "data": {
       "ownerId": "other_user_456",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
7. **Payload 7 — Resource Poisoning (Oversized `name` > 64 chars)**:
   ```json
   {
     "path": "/users/user_123/worlds/world_1",
     "auth": { "uid": "user_123", "email_verified": true },
     "op": "update",
     "data": {
       "name": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
8. **Payload 8 — Invalid Enum Value (`difficulty: "godmode"`)**:
   ```json
   {
     "path": "/users/user_123/worlds/world_1",
     "auth": { "uid": "user_123", "email_verified": true },
     "op": "update",
     "data": {
       "difficulty": "godmode",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
9. **Payload 9 — Forged Client Timestamp (`updatedAt` in the future)**:
   ```json
   {
     "path": "/users/user_123/worlds/world_1",
     "auth": { "uid": "user_123", "email_verified": true },
     "op": "update",
     "data": {
       "name": "Valid Name",
       "updatedAt": "2099-01-01T00:00:00Z"
     }
   }
   ```
10. **Payload 10 — ID Poisoning (Invalid Characters in Document ID)**:
    ```json
    {
      "path": "/users/user_123/worlds/world$bad!id",
      "auth": { "uid": "user_123", "email_verified": true },
      "op": "create",
      "data": { "worldId": "world$bad!id", "ownerId": "user_123" }
    }
    ```
11. **Payload 11 — Unauthorized Client Self-Grant of Entitlement (Microtransaction Bypass)**:
    ```json
    {
      "path": "/users/user_123/entitlements/vip_pack_1",
      "auth": { "uid": "user_123", "email_verified": true },
      "op": "create",
      "data": {
        "entitlementId": "vip_pack_1",
        "ownerId": "user_123",
        "sku": "royal_mount_pack",
        "category": "cosmetic",
        "status": "active",
        "grantedAt": "SERVER_TIMESTAMP"
      }
    }
    ```
12. **Payload 12 — Cross-User World List Scraping**:
    ```json
    {
      "path": "/users/victim_uid_123/worlds",
      "auth": { "uid": "attacker_uid_999", "email_verified": true },
      "op": "list"
    }
    ```
