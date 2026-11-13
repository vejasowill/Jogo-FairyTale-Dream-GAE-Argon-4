import { cert, getApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const TMP_SOCIAL_FILE = path.join('/tmp', 'fairytale_social_profiles.json');

interface ServerActiveWorldSession {
  sessionId: string;
  worldId: string;
  worldName: string;
  deviceLabel?: string;
  startedAt: number;
  updatedAt: number;
}

interface ServerSocialProfile {
  uid?: string | null;
  playerPublicId: string;
  username: string;
  usernameUpdatedAt?: number;
  appearanceSlots?: any[];
  activeAppearanceSlotIndex?: number;
  accountAppearance?: any;
  appearanceUpdatedAt?: number;
  friendsList: {
    playerPublicId: string;
    username: string;
    addedAt: number;
  }[];
  removedFriendIds?: string[];
  deletedWorldIds: string[];
  activeWorldSession?: ServerActiveWorldSession | null;
  presence?: {
    isOnline: boolean;
    inOpenWorld: boolean;
    worldId?: string | null;
    worldName?: string | null;
    inviteCode?: string | null;
    sessionId?: string | null;
    updatedAt: number;
  };
  updatedAt: number;
}

interface SocialStoreData {
  profilesByPublicId: Record<string, ServerSocialProfile>;
  publicIdByUid: Record<string, string>;
}

interface ServerJoinRequest {
  requestId: string;
  requesterPublicId: string;
  requesterName: string;
  targetPublicId: string;
  worldId: string;
  worldName: string;
  inviteCode: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: number;
}

let memoryStore: SocialStoreData | null = null;
const memoryJoinRequests = new Map<string, ServerJoinRequest>();
let lastFirebaseSyncAt = 0;
let adminReady = false;

function normalizePrivateKey(rawKey?: string): string {
  if (!rawKey) return '';
  let cleaned = rawKey.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }
  return cleaned.replace(/\\n/g, '\n');
}

function ensureAdminInit(): boolean {
  if (adminReady || getApps().length > 0) {
    adminReady = true;
    return true;
  }
  const projectId = (
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    'fairytale-dream'
  ).trim();
  const clientEmail = (process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '').trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);
  try {
    if (projectId && clientEmail && privateKey) {
      initializeAdminApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId,
      });
    } else {
      initializeAdminApp({ projectId });
    }
    adminReady = true;
    return true;
  } catch {
    return false;
  }
}

function computePlayerPublicIdFromSeed(seedStr: string): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const clean = (seedStr || 'default_seed').trim();
  let h1 = 0x811c9dc5 | 0;
  let h2 = 0x6a09e667 | 0;
  for (let i = 0; i < clean.length; i++) {
    const c = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i * 17), 0x85ebca6b);
  }
  let p1 = '';
  let p2 = '';
  let v1 = h1 >>> 0;
  let v2 = h2 >>> 0;
  for (let i = 0; i < 4; i++) {
    p1 += alphabet[v1 % alphabet.length];
    v1 = Math.floor(v1 / alphabet.length) ^ ((h2 >>> (i * 4)) & 0xff);
    p2 += alphabet[v2 % alphabet.length];
    v2 = Math.floor(v2 / alphabet.length) ^ ((h1 >>> (i * 4)) & 0xff);
  }
  return `SE-${p1}-${p2}`;
}

function normalizePublicPlayerId(raw: string): string {
  const clean = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
  if (!clean) return '';
  const alnum = clean.replace(/-/g, '');
  if (alnum.startsWith('SE') && alnum.length === 10) {
    return `SE-${alnum.slice(2, 6)}-${alnum.slice(6, 10)}`;
  }
  if (alnum.length === 8) {
    return `SE-${alnum.slice(0, 4)}-${alnum.slice(4, 8)}`;
  }
  return clean;
}

const SEED_SOCIAL_FILE = path.join(
  process.cwd(),
  'server_data',
  'social_profiles.json'
);

function getResolvedProfileAppearance(prof?: ServerSocialProfile | null): any {
  if (!prof) return null;
  if (prof.accountAppearance && typeof prof.accountAppearance === 'object') {
    return prof.accountAppearance;
  }
  if (
    Array.isArray(prof.appearanceSlots) &&
    prof.appearanceSlots.length > 0
  ) {
    const idx =
      typeof prof.activeAppearanceSlotIndex === 'number'
        ? Math.max(
            0,
            Math.min(
              prof.appearanceSlots.length - 1,
              prof.activeAppearanceSlotIndex
            )
          )
        : 0;
    return prof.appearanceSlots[idx]?.appearance || null;
  }
  return null;
}

function sanitizeUsernameValue(
  candidate?: string | null,
  fallback = 'Aventureiro'
): string {
  const clean = String(candidate || '').trim().slice(0, 22);
  if (!clean || /^Jogador\s+[A-Z0-9-]{2,12}$/i.test(clean)) {
    return fallback;
  }
  return clean;
}

function readStore(): SocialStoreData {
  if (memoryStore) return memoryStore;
  const merged: SocialStoreData = {
    profilesByPublicId: {},
    publicIdByUid: {},
  };

  for (const filePath of [SEED_SOCIAL_FILE, TMP_SOCIAL_FILE]) {
    try {
      if (fs.existsSync(filePath)) {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          if (
            parsed.publicIdByUid &&
            typeof parsed.publicIdByUid === 'object'
          ) {
            Object.assign(merged.publicIdByUid, parsed.publicIdByUid);
          }
          if (
            parsed.profilesByPublicId &&
            typeof parsed.profilesByPublicId === 'object'
          ) {
            for (const [k, v] of Object.entries(parsed.profilesByPublicId)) {
              const p = v as ServerSocialProfile;
              if (!p || !p.playerPublicId) continue;
              const existing = merged.profilesByPublicId[k];
              if (!existing || (p.updatedAt || 0) >= (existing.updatedAt || 0)) {
                merged.profilesByPublicId[k] = {
                  ...existing,
                  ...p,
                  username: sanitizeUsernameValue(
                    p.username,
                    sanitizeUsernameValue(existing?.username, 'Aventureiro')
                  ),
                };
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  memoryStore = merged;
  return memoryStore;
}

function writeStore(store: SocialStoreData): void {
  memoryStore = store;
  try {
    fs.writeFileSync(TMP_SOCIAL_FILE, JSON.stringify(store), 'utf-8');
  } catch {
    // ignore
  }
}

async function syncFromFirebaseAuthAndFirestore(
  store: SocialStoreData
): Promise<boolean> {
  const now = Date.now();
  if (
    now - lastFirebaseSyncAt < 15000 &&
    Object.keys(store.profilesByPublicId).length > 0
  ) {
    return false;
  }
  lastFirebaseSyncAt = now;
  if (!ensureAdminInit()) return false;

  let dirty = false;

  try {
    const authList = await getAdminAuth().listUsers(1000);
    for (const u of authList.users) {
      if (!u.uid) continue;
      const pubId = computePlayerPublicIdFromSeed(`google_uid_${u.uid}`);
      store.publicIdByUid[u.uid] = pubId;
      const displayUsername = sanitizeUsernameValue(
        u.displayName || (u.email ? u.email.split('@')[0] : ''),
        'Aventureiro'
      );

      const existing = store.profilesByPublicId[pubId];
      if (!existing) {
        store.profilesByPublicId[pubId] = {
          uid: u.uid,
          playerPublicId: pubId,
          username: displayUsername,
          friendsList: [],
          deletedWorldIds: [],
          updatedAt: now,
        };
        dirty = true;
      } else {
        if (!existing.uid) {
          existing.uid = u.uid;
          dirty = true;
        }
        if (
          displayUsername &&
          displayUsername !== 'Aventureiro' &&
          (!existing.username ||
            existing.username === 'Aventureiro' ||
            existing.username.startsWith('Jogador '))
        ) {
          existing.username = displayUsername;
          dirty = true;
        }
      }
    }
  } catch {
    // ignore
  }

  const dbCandidates = [
    '(default)',
    process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
      'ai-studio-remix2pixelsurvi-82a1c441-67e6-40f5-b2fb-00c7ebfba58d',
  ];
  for (const dbId of dbCandidates) {
    try {
      const adminDb =
        dbId === '(default)' || dbId === 'default'
          ? getAdminFirestore()
          : getAdminFirestore(undefined as any, dbId);
      const snap = await adminDb.collection('users').limit(250).get();
      for (const docSnap of snap.docs) {
        const data = docSnap.data() || {};
        const uid = String(data.uid || docSnap.id || '').trim();
        if (!uid) continue;
        const settings = (data.settings || {}) as Record<string, any>;
        const pubId = normalizePublicPlayerId(
          settings.playerPublicId ||
            computePlayerPublicIdFromSeed(`google_uid_${uid}`)
        );
        if (!pubId) continue;
        store.publicIdByUid[uid] = pubId;
        const customUsername = sanitizeUsernameValue(
          settings.accountUsername ||
            settings.playerName ||
            data.displayName ||
            '',
          ''
        );

        const existing = store.profilesByPublicId[pubId];
        if (!existing) {
          store.profilesByPublicId[pubId] = {
            uid,
            playerPublicId: pubId,
            username: customUsername || 'Aventureiro',
            usernameUpdatedAt:
              typeof settings.usernameUpdatedAt === 'number'
                ? settings.usernameUpdatedAt
                : 0,
            appearanceSlots: Array.isArray(settings.appearanceSlots)
              ? settings.appearanceSlots
              : undefined,
            activeAppearanceSlotIndex:
              typeof settings.activeAppearanceSlotIndex === 'number'
                ? settings.activeAppearanceSlotIndex
                : 0,
            accountAppearance:
              settings.accountAppearance || data.appearance || undefined,
            appearanceUpdatedAt:
              typeof settings.appearanceUpdatedAt === 'number'
                ? settings.appearanceUpdatedAt
                : 0,
            friendsList: Array.isArray(settings.friendsList)
              ? settings.friendsList
              : [],
            removedFriendIds: Array.isArray(settings.removedFriendIds)
              ? settings.removedFriendIds
              : [],
            deletedWorldIds: Array.isArray(settings.deletedWorldIds)
              ? settings.deletedWorldIds
              : [],
            updatedAt: now,
          };
          dirty = true;
        } else if (
          customUsername &&
          customUsername !== 'Aventureiro' &&
          (existing.username === 'Aventureiro' ||
            existing.username.startsWith('Jogador '))
        ) {
          existing.username = customUsername;
          dirty = true;
        }
      }
    } catch {
      // ignore quota or db errors
    }
  }

  return dirty;
}

function computeLiveStatusForPublicId(
  store: SocialStoreData,
  publicId: string,
  fallbackUsername = 'Aventureiro'
) {
  const cleanId = normalizePublicPlayerId(publicId);
  const prof = store.profilesByPublicId[cleanId];
  const now = Date.now();
  const username = sanitizeUsernameValue(
    prof?.username,
    sanitizeUsernameValue(fallbackUsername, 'Aventureiro')
  );
  const appearance = getResolvedProfileAppearance(prof);
  const pres = prof?.presence;
  const isRecent = Boolean(pres && now - (pres.updatedAt || 0) < 45000);
  if (!isRecent || !pres?.isOnline) {
    return {
      playerPublicId: cleanId,
      username,
      appearance,
      isOnline: false,
      inOpenWorld: false,
      worldName: null,
      inviteCode: null,
      lastSeenAt: pres?.updatedAt || prof?.updatedAt || 0,
    };
  }
  const code = String(pres.inviteCode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const inOpenWorld = Boolean(pres.inOpenWorld && code);
  return {
    playerPublicId: cleanId,
    username,
    appearance,
    isOnline: true,
    inOpenWorld,
    worldName: inOpenWorld ? pres.worldName || 'Mundo Online' : null,
    inviteCode: inOpenWorld ? code : null,
    lastSeenAt: pres.updatedAt,
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Player-Uid'
  );
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const rawUrl = String(req.url || '');
  const routeParam = Array.isArray(req.query?.route)
    ? req.query.route.join('/')
    : String(req.query?.route || '');
  const cleanRoute =
    routeParam ||
    rawUrl
      .split('?')[0]
      .replace(/^\/api\/social\/?/, '')
      .replace(/\/+$/, '');

  const store = readStore();
  if (await syncFromFirebaseAuthAndFirestore(store)) {
    writeStore(store);
  }

  // 1. GET /api/social/search
  if (cleanRoute === 'search' || (req.method === 'GET' && !cleanRoute)) {
    const rawQ = String(req.query?.q || '').trim();
    const playerIdQuery = String(req.query?.playerId || rawQ)
      .trim()
      .toUpperCase();
    const usernameQuery = String(req.query?.username || rawQ)
      .trim()
      .toLowerCase();
    const excludeId = normalizePublicPlayerId(
      String(req.query?.excludeId || '')
    );

    const resultsMap = new Map<string, any>();
    const all = Object.values(store.profilesByPublicId);
    const normalizedIdQuery = normalizePublicPlayerId(playerIdQuery);
    const strippedIdQuery = playerIdQuery.replace(/[^A-Z0-9]/g, '');

    if (playerIdQuery && !req.query?.username) {
      const exact =
        store.profilesByPublicId[normalizedIdQuery] ||
        store.profilesByPublicId[playerIdQuery];
      if (exact && exact.playerPublicId !== excludeId) {
        const st = computeLiveStatusForPublicId(
          store,
          exact.playerPublicId,
          exact.username
        );
        resultsMap.set(exact.playerPublicId, {
          playerPublicId: exact.playerPublicId,
          username: st.username,
          appearance: st.appearance,
          isOnline: st.isOnline,
          inOpenWorld: st.inOpenWorld,
          worldName: st.worldName,
        });
      }
      if (strippedIdQuery.length >= 3) {
        for (const p of all) {
          if (!p || !p.playerPublicId || p.playerPublicId === excludeId)
            continue;
          const pStripped = p.playerPublicId.replace(/[^A-Z0-9]/g, '');
          if (pStripped.includes(strippedIdQuery)) {
            const st = computeLiveStatusForPublicId(
              store,
              p.playerPublicId,
              p.username
            );
            resultsMap.set(p.playerPublicId, {
              playerPublicId: p.playerPublicId,
              username: st.username,
              appearance: st.appearance,
              isOnline: st.isOnline,
              inOpenWorld: st.inOpenWorld,
              worldName: st.worldName,
            });
          }
        }
      }
    }

    if (usernameQuery && !req.query?.playerId) {
      const matches = all.filter(
        (p) =>
          p &&
          p.playerPublicId &&
          p.playerPublicId !== excludeId &&
          (sanitizeUsernameValue(p.username)
            .toLowerCase()
            .includes(usernameQuery) ||
            p.playerPublicId.toLowerCase().includes(usernameQuery))
      );
      matches.sort((a, b) => {
        const aExact =
          sanitizeUsernameValue(a.username).toLowerCase() === usernameQuery
            ? 0
            : 1;
        const bExact =
          sanitizeUsernameValue(b.username).toLowerCase() === usernameQuery
            ? 0
            : 1;
        if (aExact !== bExact) return aExact - bExact;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
      for (const m of matches.slice(0, 25)) {
        const st = computeLiveStatusForPublicId(
          store,
          m.playerPublicId,
          m.username
        );
        resultsMap.set(m.playerPublicId, {
          playerPublicId: m.playerPublicId,
          username: st.username,
          appearance: st.appearance,
          isOnline: st.isOnline,
          inOpenWorld: st.inOpenWorld,
          worldName: st.worldName,
        });
      }
    }

    if (!playerIdQuery && !usernameQuery) {
      for (const p of all.slice(0, 100)) {
        if (!p || !p.playerPublicId || p.playerPublicId === excludeId) continue;
        const st = computeLiveStatusForPublicId(
          store,
          p.playerPublicId,
          p.username
        );
        resultsMap.set(p.playerPublicId, {
          playerPublicId: p.playerPublicId,
          username: st.username,
          appearance: st.appearance,
          isOnline: st.isOnline,
          inOpenWorld: st.inOpenWorld,
          worldName: st.worldName,
        });
      }
    }

    res.status(200).json({ ok: true, results: Array.from(resultsMap.values()) });
    return;
  }

  // 2. POST /api/social/sync-profile
  if (cleanRoute === 'sync-profile') {
    const body = req.body || {};
    const cleanPubId = normalizePublicPlayerId(String(body.playerPublicId || ''));
    if (!cleanPubId) {
      res.status(400).json({ ok: false, error: 'Missing playerPublicId' });
      return;
    }
    if (body.uid && typeof body.uid === 'string') {
      store.publicIdByUid[body.uid] = cleanPubId;
    }
    const existing = store.profilesByPublicId[cleanPubId];
    const incomingUsername = sanitizeUsernameValue(body.username, '');
    const incomingUsernameTs =
      typeof body.usernameUpdatedAt === 'number' ? body.usernameUpdatedAt : 0;
    const existingUsernameTs = existing?.usernameUpdatedAt || 0;

    let resolvedUsername = sanitizeUsernameValue(
      existing?.username,
      'Aventureiro'
    );
    let resolvedUsernameTs = existingUsernameTs;

    if (incomingUsername) {
      const isIncomingDefault = incomingUsername === 'Aventureiro';
      const isExistingDefault =
        !existing?.username ||
        existing.username === 'Aventureiro' ||
        existing.username.startsWith('Jogador ');

      if (
        incomingUsernameTs > existingUsernameTs ||
        (isExistingDefault && !isIncomingDefault) ||
        !existing?.username
      ) {
        resolvedUsername = incomingUsername;
        resolvedUsernameTs = Math.max(incomingUsernameTs, existingUsernameTs);
      }
    }

    // Update Firebase Auth displayName via Admin SDK if we have a newer custom username
    const resolvedUid = body.uid || existing?.uid || null;
    if (
      resolvedUid &&
      resolvedUsername &&
      resolvedUsername !== 'Aventureiro' &&
      incomingUsernameTs > existingUsernameTs &&
      ensureAdminInit()
    ) {
      try {
        await getAdminAuth().updateUser(resolvedUid, {
          displayName: resolvedUsername,
        });
      } catch {
        // ignore admin auth update errors
      }
    }

    const incomingRemovedSet = new Set<string>(
      Array.isArray(body.removedFriendIds)
        ? body.removedFriendIds
            .map((id: any) => normalizePublicPlayerId(String(id || '')))
            .filter(Boolean)
        : []
    );
    const incomingFriendsSet = new Set<string>(
      Array.isArray(body.friendsList)
        ? body.friendsList
            .map((f: any) => normalizePublicPlayerId(String(f?.playerPublicId || '')))
            .filter(Boolean)
        : []
    );

    // Merge removedFriendIds tombstones while allowing re-added friends to clear old tombstones
    const removedSet = new Set<string>(
      Array.isArray(existing?.removedFriendIds)
        ? existing.removedFriendIds.map((id) => normalizePublicPlayerId(id))
        : []
    );
    for (const rId of incomingRemovedSet) {
      removedSet.add(rId);
    }
    for (const fId of incomingFriendsSet) {
      if (!incomingRemovedSet.has(fId)) {
        removedSet.delete(fId);
      }
    }

    const friendMap = new Map<
      string,
      { playerPublicId: string; username: string; addedAt: number; appearance?: any }
    >();
    if (Array.isArray(existing?.friendsList)) {
      for (const f of existing.friendsList) {
        if (f && f.playerPublicId) {
          const fId = normalizePublicPlayerId(f.playerPublicId);
          if (removedSet.has(fId)) continue;
          const tProf = store.profilesByPublicId[fId];
          friendMap.set(fId, {
            playerPublicId: fId,
            username: sanitizeUsernameValue(
              tProf?.username,
              sanitizeUsernameValue(f.username, 'Aventureiro')
            ),
            addedAt: f.addedAt || Date.now(),
            appearance: getResolvedProfileAppearance(tProf),
          });
        }
      }
    }
    if (Array.isArray(body.friendsList)) {
      for (const f of body.friendsList) {
        if (f && f.playerPublicId) {
          const fId = normalizePublicPlayerId(f.playerPublicId);
          if (fId === cleanPubId || removedSet.has(fId)) continue;
          const tProf = store.profilesByPublicId[fId];
          friendMap.set(fId, {
            playerPublicId: fId,
            username: sanitizeUsernameValue(
              tProf?.username,
              sanitizeUsernameValue(f.username, 'Aventureiro')
            ),
            addedAt: f.addedAt || Date.now(),
            appearance: getResolvedProfileAppearance(tProf),
          });
        }
      }
    }

    const delSet = new Set<string>(
      Array.isArray(existing?.deletedWorldIds) ? existing.deletedWorldIds : []
    );
    if (Array.isArray(body.deletedWorldIds)) {
      for (const wId of body.deletedWorldIds) {
        if (wId && typeof wId === 'string') delSet.add(wId);
      }
    }

    const incomingAppTs =
      typeof body.appearanceUpdatedAt === 'number'
        ? body.appearanceUpdatedAt
        : 0;
    const existingAppTs = existing?.appearanceUpdatedAt || 0;
    const useIncomingAppearance =
      incomingAppTs >= existingAppTs || !existing?.appearanceSlots;

    const mergedProfile: ServerSocialProfile = {
      uid: resolvedUid,
      playerPublicId: cleanPubId,
      username: resolvedUsername,
      usernameUpdatedAt: resolvedUsernameTs,
      appearanceSlots:
        useIncomingAppearance &&
        Array.isArray(body.appearanceSlots) &&
        body.appearanceSlots.length > 0
          ? body.appearanceSlots
          : existing?.appearanceSlots || body.appearanceSlots,
      activeAppearanceSlotIndex:
        useIncomingAppearance &&
        typeof body.activeAppearanceSlotIndex === 'number'
          ? body.activeAppearanceSlotIndex
          : existing?.activeAppearanceSlotIndex ?? 0,
      accountAppearance: useIncomingAppearance
        ? body.accountAppearance || existing?.accountAppearance
        : existing?.accountAppearance || body.accountAppearance,
      appearanceUpdatedAt: Math.max(incomingAppTs, existingAppTs),
      friendsList: Array.from(friendMap.values()),
      removedFriendIds: Array.from(removedSet),
      deletedWorldIds: Array.from(delSet),
      activeWorldSession: existing?.activeWorldSession || null,
      presence: body.presence
        ? {
            isOnline: Boolean(body.presence.isOnline),
            inOpenWorld: Boolean(body.presence.inOpenWorld),
            worldId: body.presence.worldId || null,
            worldName: body.presence.worldName || null,
            inviteCode: body.presence.inviteCode || null,
            sessionId: body.presence.sessionId || null,
            updatedAt: Date.now(),
          }
        : existing?.presence,
      updatedAt: Date.now(),
    };

    store.profilesByPublicId[cleanPubId] = mergedProfile;
    writeStore(store);

    const friendsStatus = mergedProfile.friendsList.map((f) =>
      computeLiveStatusForPublicId(store, f.playerPublicId, f.username)
    );
    res.status(200).json({ ok: true, profile: mergedProfile, friendsStatus });
    return;
  }

  // 3. POST /api/social/presence
  if (cleanRoute === 'presence') {
    const body = req.body || {};
    const cleanPubId = normalizePublicPlayerId(String(body.playerPublicId || ''));
    if (!cleanPubId) {
      res.status(400).json({ ok: false, error: 'Missing playerPublicId' });
      return;
    }
    const now = Date.now();
    let prof = store.profilesByPublicId[cleanPubId];
    if (!prof) {
      prof = {
        playerPublicId: cleanPubId,
        username:
          String(body.username || 'Aventureiro')
            .trim()
            .slice(0, 22) || 'Aventureiro',
        friendsList: [],
        deletedWorldIds: [],
        updatedAt: now,
      };
      store.profilesByPublicId[cleanPubId] = prof;
    } else if (
      body.username &&
      String(body.username).trim() &&
      String(body.username).trim() !== 'Aventureiro' &&
      (!prof.username || prof.username === 'Aventureiro')
    ) {
      prof.username = String(body.username).trim().slice(0, 22);
    }

    prof.presence = {
      isOnline: Boolean(body.isOnline),
      inOpenWorld: Boolean(body.inOpenWorld),
      worldId: body.worldId || null,
      worldName: body.worldName || null,
      inviteCode: body.inviteCode || null,
      sessionId: body.sessionId || null,
      updatedAt: now,
    };

    if (body.worldId && body.sessionId) {
      prof.activeWorldSession = {
        sessionId: String(body.sessionId),
        worldId: String(body.worldId),
        worldName: String(body.worldName || 'Mundo'),
        deviceLabel: String(body.deviceLabel || 'Dispositivo Ativo'),
        startedAt: prof.activeWorldSession?.startedAt || now,
        updatedAt: now,
      };
    } else if (
      !body.worldId &&
      body.sessionId &&
      prof.activeWorldSession?.sessionId === String(body.sessionId)
    ) {
      prof.activeWorldSession = null;
    }

    prof.updatedAt = now;
    writeStore(store);

    const friendsStatus = prof.friendsList.map((f) =>
      computeLiveStatusForPublicId(store, f.playerPublicId, f.username)
    );
    const pendingJoinRequests: ServerJoinRequest[] = [];
    for (const [reqId, jr] of memoryJoinRequests.entries()) {
      if (now - jr.createdAt > 90000) {
        memoryJoinRequests.delete(reqId);
        continue;
      }
      if (jr.targetPublicId === cleanPubId && jr.status === 'PENDING') {
        pendingJoinRequests.push(jr);
      }
    }

    res.status(200).json({
      ok: true,
      friendsList: prof.friendsList,
      friendsStatus,
      pendingJoinRequests,
      activeWorldSession: prof.activeWorldSession || null,
    });
    return;
  }

  // 3B. POST /api/social/world-session
  if (cleanRoute === 'world-session') {
    const body = req.body || {};
    const cleanPubId = normalizePublicPlayerId(String(body.playerPublicId || ''));
    const action = String(body.action || 'check');
    const sessionId = String(body.sessionId || '').trim();
    const worldId = String(body.worldId || '').trim();
    const worldName = String(body.worldName || 'Mundo').trim();
    const deviceLabel = String(body.deviceLabel || 'Outra Sessão').trim();
    const now = Date.now();
    const SESSION_LOCK_TTL_MS = 25000;

    if (!cleanPubId) {
      res.status(400).json({ ok: false, error: 'Missing playerPublicId' });
      return;
    }

    let prof = store.profilesByPublicId[cleanPubId];
    if (!prof) {
      prof = {
        playerPublicId: cleanPubId,
        username: 'Aventureiro',
        friendsList: [],
        deletedWorldIds: [],
        updatedAt: now,
      };
      store.profilesByPublicId[cleanPubId] = prof;
    }

    const currentLock = prof.activeWorldSession;
    const isLockAlive = Boolean(
      currentLock && now - (currentLock.updatedAt || 0) < SESSION_LOCK_TTL_MS
    );

    if (!isLockAlive && currentLock) {
      prof.activeWorldSession = null;
    }

    if (action === 'release') {
      if (
        !prof.activeWorldSession ||
        !sessionId ||
        prof.activeWorldSession.sessionId === sessionId
      ) {
        prof.activeWorldSession = null;
        writeStore(store);
      }
      res.status(200).json({ ok: true, activeSession: null });
      return;
    }

    if (action === 'check') {
      const conflict = Boolean(
        isLockAlive &&
          currentLock &&
          sessionId &&
          currentLock.sessionId !== sessionId
      );
      res.status(200).json({
        ok: true,
        conflict,
        activeSession: isLockAlive ? prof.activeWorldSession : null,
      });
      return;
    }

    if (action === 'acquire' || action === 'heartbeat') {
      if (
        isLockAlive &&
        currentLock &&
        sessionId &&
        currentLock.sessionId !== sessionId
      ) {
        res.status(409).json({
          ok: false,
          conflict: true,
          error: `Esta conta já está com o mundo "${currentLock.worldName}" aberto em outra sessão ou dispositivo. Feche o mundo na outra sessão antes de abrir um mundo aqui para evitar conflito nos saves.`,
          activeSession: currentLock,
        });
        return;
      }

      prof.activeWorldSession = {
        sessionId: sessionId || `sess_${now}`,
        worldId: worldId || currentLock?.worldId || 'world',
        worldName: worldName || currentLock?.worldName || 'Mundo',
        deviceLabel: deviceLabel || currentLock?.deviceLabel || 'Sessão Ativa',
        startedAt: currentLock?.startedAt || now,
        updatedAt: now,
      };
      writeStore(store);
      res.status(200).json({
        ok: true,
        conflict: false,
        activeSession: prof.activeWorldSession,
      });
      return;
    }

    res.status(200).json({
      ok: true,
      conflict: false,
      activeSession: isLockAlive ? prof.activeWorldSession : null,
    });
    return;
  }

  // 4. POST /api/social/friends/add
  if (cleanRoute === 'friends/add') {
    const body = req.body || {};
    const myPublicId = normalizePublicPlayerId(String(body.myPublicId || ''));
    const myUsername =
      String(body.myUsername || 'Aventureiro')
        .trim()
        .slice(0, 22) || 'Aventureiro';
    const targetPublicId = normalizePublicPlayerId(
      String(body.targetPublicId || '')
    );
    const targetUsernameHint = String(body.targetUsername || '')
      .trim()
      .slice(0, 22);

    if (!myPublicId || !targetPublicId || targetPublicId.length < 4) {
      res.status(400).json({ ok: false, error: 'ID de jogador inválido.' });
      return;
    }
    if (myPublicId === targetPublicId) {
      res
        .status(400)
        .json({ ok: false, error: 'Você não pode adicionar seu próprio ID.' });
      return;
    }

    const now = Date.now();
    let targetProfile = store.profilesByPublicId[targetPublicId];
    if (!targetProfile) {
      if (targetUsernameHint && !targetUsernameHint.startsWith('Jogador ')) {
        targetProfile = {
          playerPublicId: targetPublicId,
          username: targetUsernameHint,
          friendsList: [],
          deletedWorldIds: [],
          updatedAt: now,
        };
        store.profilesByPublicId[targetPublicId] = targetProfile;
      } else {
        res.status(404).json({
          ok: false,
          error:
            'Jogador não encontrado no diretório. Busque o jogador na aba Buscar Jogadores primeiro.',
        });
        return;
      }
    } else if (
      targetUsernameHint &&
      !targetUsernameHint.startsWith('Jogador ') &&
      targetProfile.username.startsWith('Jogador ')
    ) {
      targetProfile.username = targetUsernameHint;
    }

    let myProfile = store.profilesByPublicId[myPublicId];
    if (!myProfile) {
      myProfile = {
        playerPublicId: myPublicId,
        username: myUsername,
        friendsList: [],
        removedFriendIds: [],
        deletedWorldIds: [],
        updatedAt: now,
      };
      store.profilesByPublicId[myPublicId] = myProfile;
    }

    myProfile.removedFriendIds = (myProfile.removedFriendIds || []).filter(
      (id) => normalizePublicPlayerId(id) !== targetPublicId
    );
    targetProfile.removedFriendIds = (
      targetProfile.removedFriendIds || []
    ).filter((id) => normalizePublicPlayerId(id) !== myPublicId);

    if (
      !myProfile.friendsList.some((f) => f.playerPublicId === targetPublicId)
    ) {
      myProfile.friendsList.push({
        playerPublicId: targetPublicId,
        username: targetProfile.username,
        addedAt: now,
      });
    }
    if (
      !targetProfile.friendsList.some((f) => f.playerPublicId === myPublicId)
    ) {
      targetProfile.friendsList.push({
        playerPublicId: myPublicId,
        username: myProfile.username,
        addedAt: now,
      });
    }

    writeStore(store);
    const friendsStatus = myProfile.friendsList.map((f) =>
      computeLiveStatusForPublicId(store, f.playerPublicId, f.username)
    );
    res
      .status(200)
      .json({ ok: true, friendsList: myProfile.friendsList, friendsStatus });
    return;
  }

  // 5. POST /api/social/friends/remove
  if (cleanRoute === 'friends/remove') {
    const body = req.body || {};
    const myPublicId = normalizePublicPlayerId(String(body.myPublicId || ''));
    const targetPublicId = normalizePublicPlayerId(
      String(body.targetPublicId || '')
    );
    const myProfile = store.profilesByPublicId[myPublicId];
    if (myProfile) {
      myProfile.friendsList = myProfile.friendsList.filter(
        (f) => normalizePublicPlayerId(f.playerPublicId) !== targetPublicId
      );
      const remSet = new Set(myProfile.removedFriendIds || []);
      if (targetPublicId) remSet.add(targetPublicId);
      myProfile.removedFriendIds = Array.from(remSet);
    }
    const targetProfile = store.profilesByPublicId[targetPublicId];
    if (targetProfile) {
      targetProfile.friendsList = targetProfile.friendsList.filter(
        (f) => normalizePublicPlayerId(f.playerPublicId) !== myPublicId
      );
      const remSet = new Set(targetProfile.removedFriendIds || []);
      if (myPublicId) remSet.add(myPublicId);
      targetProfile.removedFriendIds = Array.from(remSet);
    }
    writeStore(store);
    const friendsList = myProfile?.friendsList || [];
    const friendsStatus = friendsList.map((f) =>
      computeLiveStatusForPublicId(store, f.playerPublicId, f.username)
    );
    res.status(200).json({ ok: true, friendsList, friendsStatus });
    return;
  }

  // 6. POST /api/social/join-request
  if (cleanRoute === 'join-request') {
    const body = req.body || {};
    const requesterPublicId = normalizePublicPlayerId(
      String(body.requesterPublicId || '')
    );
    const requesterName =
      String(body.requesterName || 'Amigo')
        .trim()
        .slice(0, 22) || 'Amigo';
    const targetPublicId = normalizePublicPlayerId(
      String(body.targetPublicId || '')
    );
    const targetStatus = computeLiveStatusForPublicId(store, targetPublicId);
    if (!targetStatus.inOpenWorld || !targetStatus.inviteCode) {
      res.status(400).json({
        ok: false,
        error:
          'Este amigo não está em um mundo com disponibilidade online ativada no momento.',
      });
      return;
    }
    const requestId = `jreq_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const joinReq: ServerJoinRequest = {
      requestId,
      requesterPublicId,
      requesterName,
      targetPublicId,
      worldId:
        store.profilesByPublicId[targetPublicId]?.presence?.worldId || 'world',
      worldName: targetStatus.worldName || 'Mundo Online',
      inviteCode: targetStatus.inviteCode,
      status: 'PENDING',
      createdAt: Date.now(),
    };
    memoryJoinRequests.set(requestId, joinReq);
    res.status(200).json({ ok: true, request: joinReq });
    return;
  }

  // 7. POST /api/social/join-request/respond
  if (cleanRoute === 'join-request/respond') {
    const body = req.body || {};
    const reqId = String(body.requestId || '').trim();
    const accept = Boolean(body.accept);
    const joinReq = memoryJoinRequests.get(reqId);
    if (!joinReq) {
      res
        .status(404)
        .json({ ok: false, error: 'Solicitação não encontrada.' });
      return;
    }
    joinReq.status = accept ? 'ACCEPTED' : 'DECLINED';
    res.status(200).json({ ok: true, request: joinReq });
    return;
  }

  // 8. GET /api/social/join-request/:requestId
  if (cleanRoute.startsWith('join-request/')) {
    const reqId = cleanRoute.slice('join-request/'.length).trim();
    const joinReq = memoryJoinRequests.get(reqId);
    if (!joinReq) {
      res
        .status(404)
        .json({ ok: false, error: 'Solicitação expirada ou não encontrada.' });
      return;
    }
    res.status(200).json({ ok: true, request: joinReq });
    return;
  }

  res.status(200).json({ ok: true, results: [] });
}
