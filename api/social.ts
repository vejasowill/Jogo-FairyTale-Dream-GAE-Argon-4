import { cert, getApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const TMP_SOCIAL_FILE = path.join('/tmp', 'fairytale_social_profiles.json');

interface ServerSocialProfile {
  uid?: string | null;
  playerPublicId: string;
  username: string;
  appearanceSlots?: any[];
  activeAppearanceSlotIndex?: number;
  accountAppearance?: any;
  friendsList: {
    playerPublicId: string;
    username: string;
    addedAt: number;
  }[];
  deletedWorldIds: string[];
  presence?: {
    isOnline: boolean;
    inOpenWorld: boolean;
    worldId?: string | null;
    worldName?: string | null;
    inviteCode?: string | null;
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

function readStore(): SocialStoreData {
  if (memoryStore) return memoryStore;
  try {
    if (fs.existsSync(TMP_SOCIAL_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(TMP_SOCIAL_FILE, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        memoryStore = {
          profilesByPublicId: parsed.profilesByPublicId || {},
          publicIdByUid: parsed.publicIdByUid || {},
        };
        return memoryStore;
      }
    }
  } catch {
    // ignore
  }
  memoryStore = { profilesByPublicId: {}, publicIdByUid: {} };
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
      const displayUsername = (
        u.displayName ||
        (u.email ? u.email.split('@')[0] : '') ||
        'Aventureiro'
      )
        .trim()
        .slice(0, 22);

      const existing = store.profilesByPublicId[pubId];
      if (!existing) {
        store.profilesByPublicId[pubId] = {
          uid: u.uid,
          playerPublicId: pubId,
          username: displayUsername || 'Aventureiro',
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
        const customUsername = String(
          settings.accountUsername ||
            settings.playerName ||
            data.displayName ||
            ''
        )
          .trim()
          .slice(0, 22);

        const existing = store.profilesByPublicId[pubId];
        if (!existing) {
          store.profilesByPublicId[pubId] = {
            uid,
            playerPublicId: pubId,
            username: customUsername || 'Aventureiro',
            appearanceSlots: Array.isArray(settings.appearanceSlots)
              ? settings.appearanceSlots
              : undefined,
            activeAppearanceSlotIndex:
              typeof settings.activeAppearanceSlotIndex === 'number'
                ? settings.activeAppearanceSlotIndex
                : 0,
            accountAppearance:
              settings.accountAppearance || data.appearance || undefined,
            friendsList: Array.isArray(settings.friendsList)
              ? settings.friendsList
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
  const username = prof?.username || fallbackUsername;
  const pres = prof?.presence;
  const isRecent = Boolean(pres && now - (pres.updatedAt || 0) < 45000);
  if (!isRecent || !pres?.isOnline) {
    return {
      playerPublicId: cleanId,
      username,
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
          username: exact.username,
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
              username: p.username,
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
          ((p.username || '').toLowerCase().includes(usernameQuery) ||
            p.playerPublicId.toLowerCase().includes(usernameQuery))
      );
      matches.sort((a, b) => {
        const aExact = a.username.toLowerCase() === usernameQuery ? 0 : 1;
        const bExact = b.username.toLowerCase() === usernameQuery ? 0 : 1;
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
          username: m.username,
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
          username: p.username,
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
    const cleanUsername =
      String(body.username || existing?.username || 'Aventureiro')
        .trim()
        .slice(0, 22) || 'Aventureiro';

    const friendMap = new Map<
      string,
      { playerPublicId: string; username: string; addedAt: number }
    >();
    if (Array.isArray(existing?.friendsList)) {
      for (const f of existing.friendsList) {
        if (f && f.playerPublicId) {
          const fId = normalizePublicPlayerId(f.playerPublicId);
          const tProf = store.profilesByPublicId[fId];
          friendMap.set(fId, {
            playerPublicId: fId,
            username: tProf?.username || f.username || 'Aventureiro',
            addedAt: f.addedAt || Date.now(),
          });
        }
      }
    }
    if (Array.isArray(body.friendsList)) {
      for (const f of body.friendsList) {
        if (f && f.playerPublicId) {
          const fId = normalizePublicPlayerId(f.playerPublicId);
          if (fId === cleanPubId) continue;
          const tProf = store.profilesByPublicId[fId];
          friendMap.set(fId, {
            playerPublicId: fId,
            username: tProf?.username || f.username || 'Aventureiro',
            addedAt: f.addedAt || Date.now(),
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

    const mergedProfile: ServerSocialProfile = {
      uid: body.uid || existing?.uid || null,
      playerPublicId: cleanPubId,
      username: cleanUsername,
      appearanceSlots:
        Array.isArray(body.appearanceSlots) && body.appearanceSlots.length > 0
          ? body.appearanceSlots
          : existing?.appearanceSlots,
      activeAppearanceSlotIndex:
        typeof body.activeAppearanceSlotIndex === 'number'
          ? body.activeAppearanceSlotIndex
          : existing?.activeAppearanceSlotIndex ?? 0,
      accountAppearance: body.accountAppearance || existing?.accountAppearance,
      friendsList: Array.from(friendMap.values()),
      deletedWorldIds: Array.from(delSet),
      presence: body.presence
        ? {
            isOnline: Boolean(body.presence.isOnline),
            inOpenWorld: Boolean(body.presence.inOpenWorld),
            worldId: body.presence.worldId || null,
            worldName: body.presence.worldName || null,
            inviteCode: body.presence.inviteCode || null,
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
    } else if (body.username && String(body.username).trim()) {
      prof.username = String(body.username).trim().slice(0, 22);
    }

    prof.presence = {
      isOnline: Boolean(body.isOnline),
      inOpenWorld: Boolean(body.inOpenWorld),
      worldId: body.worldId || null,
      worldName: body.worldName || null,
      inviteCode: body.inviteCode || null,
      updatedAt: now,
    };
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
      targetProfile = {
        playerPublicId: targetPublicId,
        username: targetUsernameHint || `Jogador ${targetPublicId.slice(-4)}`,
        friendsList: [],
        deletedWorldIds: [],
        updatedAt: now,
      };
      store.profilesByPublicId[targetPublicId] = targetProfile;
    } else if (
      targetUsernameHint &&
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
        deletedWorldIds: [],
        updatedAt: now,
      };
      store.profilesByPublicId[myPublicId] = myProfile;
    }

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
        (f) => f.playerPublicId !== targetPublicId
      );
    }
    const targetProfile = store.profilesByPublicId[targetPublicId];
    if (targetProfile) {
      targetProfile.friendsList = targetProfile.friendsList.filter(
        (f) => f.playerPublicId !== myPublicId
      );
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
