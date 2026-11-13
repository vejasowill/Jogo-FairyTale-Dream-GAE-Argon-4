import Peer, { DataConnection } from 'peerjs';
import {
  FriendLiveStatus,
  FriendProfileEntry,
  WorldJoinRequestInfo,
} from '../core/types';
import { SaveManager } from '../persistence/SaveManager';

const SOCIAL_CACHE_STORAGE_KEY = 'wildborn_social_directory_cache_v2';
const ACTIVE_WORLD_SESSION_STORAGE_KEY =
  'wildborn_active_world_session_lock_v1';
const P2P_SOCIAL_ID_PREFIX = 'wildborn-social-id-';
const P2P_SOCIAL_HUB_IDS = [
  'wildborn-social-hub-v1-0',
  'wildborn-social-hub-v1-1',
];

const FALLBACK_CLOUD_RUN_ORIGINS = [
  'https://ais-pre-nhbwd2rigz63jxcesl5fyc-452713893501.us-east1.run.app',
  'https://ais-dev-nhbwd2rigz63jxcesl5fyc-452713893501.us-east1.run.app',
];

export interface SocialSearchResultEntry {
  playerPublicId: string;
  username: string;
  isOnline?: boolean;
  inOpenWorld?: boolean;
  worldName?: string | null;
  inviteCode?: string | null;
}

export interface ActiveWorldSessionLockInfo {
  playerPublicId: string;
  sessionId: string;
  worldId: string;
  worldName: string;
  deviceLabel: string;
  startedAt: number;
  updatedAt: number;
}

interface CachedSocialProfile {
  playerPublicId: string;
  username: string;
  isOnline?: boolean;
  inOpenWorld?: boolean;
  worldId?: string | null;
  worldName?: string | null;
  inviteCode?: string | null;
  sessionId?: string | null;
  updatedAt: number;
}

export function normalizeSocialPlayerId(raw: string): string {
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

function PublicIdToPeerId(publicId: string): string {
  const clean = normalizeSocialPlayerId(publicId).replace(/[^A-Z0-9-]/g, '');
  return `${P2P_SOCIAL_ID_PREFIX}${clean}`;
}

class SocialDirectoryClientService {
  private directoryCache = new Map<string, CachedSocialProfile>();
  private personalPeer: Peer | null = null;
  private personalPeerPublicId: string | null = null;
  private hubHostPeer: Peer | null = null;
  private hubClientConnections = new Map<string, DataConnection>();
  private hubHostedConnections = new Set<DataConnection>();
  private localPresence: CachedSocialProfile | null = null;
  private incomingJoinRequests = new Map<string, WorldJoinRequestInfo>();
  private outgoingJoinRequests = new Map<string, WorldJoinRequestInfo>();
  private p2pInitialized = false;
  private readonly clientSessionId: string;

  constructor() {
    this.clientSessionId = `sess_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    this.loadLocalCache();
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.releaseLocalTabWorldLockSync();
      });
    }
  }

  public getClientSessionId(): string {
    return this.clientSessionId;
  }

  public getDeviceLabel(): string {
    if (typeof navigator === 'undefined') return 'Navegador Web';
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'Dispositivo Android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'Dispositivo iOS';
    if (/Windows/i.test(ua)) return 'Computador Windows';
    if (/Mac/i.test(ua)) return 'Computador Mac';
    return 'Navegador Web';
  }

  private loadLocalCache(): void {
    try {
      const raw = localStorage.getItem(SOCIAL_CACHE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.playerPublicId && item.username) {
            const normId = normalizeSocialPlayerId(item.playerPublicId);
            this.directoryCache.set(normId, {
              ...item,
              playerPublicId: normId,
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private saveLocalCache(): void {
    try {
      const arr = Array.from(this.directoryCache.values()).slice(-500);
      localStorage.setItem(SOCIAL_CACHE_STORAGE_KEY, JSON.stringify(arr));
    } catch {
      // ignore
    }
  }

  private upsertDirectoryEntry(entry: Partial<CachedSocialProfile>): void {
    const normId = normalizeSocialPlayerId(entry.playerPublicId || '');
    if (!normId || normId.length < 4) return;
    const existing = this.directoryCache.get(normId);
    const cleanUsername = (entry.username || existing?.username || '')
      .trim()
      .slice(0, 22);
    if (!cleanUsername) return;

    this.directoryCache.set(normId, {
      playerPublicId: normId,
      username:
        cleanUsername === 'Aventureiro' &&
        existing?.username &&
        existing.username !== 'Aventureiro'
          ? existing.username
          : cleanUsername,
      isOnline:
        typeof entry.isOnline === 'boolean'
          ? entry.isOnline
          : existing?.isOnline ?? false,
      inOpenWorld:
        typeof entry.inOpenWorld === 'boolean'
          ? entry.inOpenWorld
          : existing?.inOpenWorld ?? false,
      worldId:
        entry.worldId !== undefined ? entry.worldId : existing?.worldId ?? null,
      worldName:
        entry.worldName !== undefined
          ? entry.worldName
          : existing?.worldName ?? null,
      inviteCode:
        entry.inviteCode !== undefined
          ? entry.inviteCode
          : existing?.inviteCode ?? null,
      sessionId:
        entry.sessionId !== undefined
          ? entry.sessionId
          : existing?.sessionId ?? null,
      updatedAt: entry.updatedAt || Date.now(),
    });
  }

  private getApiCandidateBaseUrls(): string[] {
    const urls: string[] = ['']; // 1. Relative origin (/api/social/...)
    try {
      const settings = SaveManager.loadSettings();
      if (settings.customServerUrl && settings.customServerUrl.trim()) {
        const cleanCustom = settings.customServerUrl
          .trim()
          .replace(/\/+$/, '');
        if (!urls.includes(cleanCustom)) {
          urls.push(cleanCustom);
        }
      }
    } catch {
      // ignore
    }
    const currentOrigin =
      typeof window !== 'undefined' ? window.location.origin : '';
    for (const origin of FALLBACK_CLOUD_RUN_ORIGINS) {
      if (origin !== currentOrigin && !urls.includes(origin)) {
        urls.push(origin);
      }
    }
    return urls;
  }

  private async fetchJsonEndpoint(
    baseUrl: string,
    pathAndQuery: string,
    init?: RequestInit,
    timeoutMs = 5500,
    allowErrorJson = false
  ): Promise<any | null> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const fullUrl = `${baseUrl}${pathAndQuery}`;
      const res = await fetch(fullUrl, {
        ...init,
        signal: controller.signal,
      });
      if (!res.ok && !allowErrorJson) return null;
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json')) {
        return null;
      }
      return await res.json();
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }

  /**
   * Initializes the PeerJS P2P Social Presence & Directory Mesh for this player
   * so players on static deployments (e.g. Vercel) can also discover each other directly via WebRTC.
   */
  public ensureP2PSocialMesh(
    myPublicId: string,
    myUsername: string,
    presence?: Partial<CachedSocialProfile>
  ): void {
    const normId = normalizeSocialPlayerId(myPublicId);
    if (!normId || typeof window === 'undefined') return;

    this.localPresence = {
      playerPublicId: normId,
      username: (myUsername || 'Aventureiro').trim().slice(0, 22),
      isOnline: presence?.isOnline ?? true,
      inOpenWorld: presence?.inOpenWorld ?? false,
      worldId: presence?.worldId ?? null,
      worldName: presence?.worldName ?? null,
      inviteCode: presence?.inviteCode ?? null,
      sessionId: this.clientSessionId,
      updatedAt: Date.now(),
    };
    this.upsertDirectoryEntry(this.localPresence);

    // 1. Ensure personal PeerJS listener (`wildborn-social-id-SE-XXXX-XXXX`)
    if (
      !this.personalPeer ||
      this.personalPeer.destroyed ||
      this.personalPeerPublicId !== normId
    ) {
      try {
        this.personalPeer?.destroy();
      } catch {
        // ignore
      }
      this.personalPeerPublicId = normId;
      try {
        const peer = new Peer(PublicIdToPeerId(normId));
        this.personalPeer = peer;
        peer.on('connection', (conn) => {
          this.setupIncomingSocialConnection(conn);
        });
        peer.on('error', () => {
          // ignore ID collision if multiple tabs of same account are open
        });
      } catch {
        // ignore
      }
    }

    // 2. Connect to or host P2P Directory Hub (`wildborn-social-hub-v1-0`)
    if (!this.p2pInitialized) {
      this.p2pInitialized = true;
      this.connectOrHostDirectoryHub();
      window.setInterval(() => {
        this.broadcastMyPresenceToHubs();
      }, 10000);
    } else {
      this.broadcastMyPresenceToHubs();
    }
  }

  private setupIncomingSocialConnection(conn: DataConnection): void {
    conn.on('open', () => {
      if (this.localPresence) {
        conn.send({
          type: 'social_profile_reply',
          profile: this.localPresence,
          directory: Array.from(this.directoryCache.values()).slice(-120),
        });
      }
    });
    conn.on('data', (raw: any) => {
      if (!raw || typeof raw !== 'object') return;
      if (raw.type === 'social_profile_probe') {
        if (raw.senderProfile) {
          this.upsertDirectoryEntry(raw.senderProfile);
          this.saveLocalCache();
        }
        if (this.localPresence) {
          conn.send({
            type: 'social_profile_reply',
            profile: this.localPresence,
            directory: Array.from(this.directoryCache.values()).slice(-120),
          });
        }
      } else if (raw.type === 'social_join_request' && raw.request) {
        const jr = raw.request as WorldJoinRequestInfo;
        if (this.localPresence?.inOpenWorld && this.localPresence?.inviteCode) {
          const enriched: WorldJoinRequestInfo = {
            ...jr,
            worldId: this.localPresence.worldId || jr.worldId || 'world',
            worldName:
              this.localPresence.worldName || jr.worldName || 'Mundo Online',
            inviteCode: this.localPresence.inviteCode,
            status: 'PENDING',
          };
          this.incomingJoinRequests.set(enriched.requestId, enriched);
          conn.send({
            type: 'social_join_request_ack',
            ok: true,
            request: enriched,
          });
        } else {
          conn.send({
            type: 'social_join_request_ack',
            ok: false,
            error:
              'Este amigo não está em um mundo com disponibilidade online ativada no momento.',
          });
        }
      } else if (raw.type === 'social_join_poll' && raw.requestId) {
        const jr = this.incomingJoinRequests.get(String(raw.requestId));
        if (jr) {
          conn.send({
            type: 'social_join_poll_reply',
            ok: true,
            request: jr,
          });
        }
      }
    });
  }

  private connectOrHostDirectoryHub(): void {
    for (const hubId of P2P_SOCIAL_HUB_IDS) {
      try {
        const candidateHub = new Peer(hubId);
        candidateHub.on('open', () => {
          this.hubHostPeer = candidateHub;
          candidateHub.on('connection', (conn) => {
            this.hubHostedConnections.add(conn);
            conn.on('open', () => {
              conn.send({
                type: 'hub_directory_sync',
                directory: Array.from(this.directoryCache.values()).slice(-200),
              });
            });
            conn.on('data', (msg: any) => {
              if (!msg || typeof msg !== 'object') return;
              if (msg.type === 'hub_announce' && msg.profile) {
                this.upsertDirectoryEntry(msg.profile);
                if (Array.isArray(msg.directory)) {
                  for (const d of msg.directory) this.upsertDirectoryEntry(d);
                }
                this.saveLocalCache();
                const snapshot = Array.from(
                  this.directoryCache.values()
                ).slice(-200);
                for (const c of this.hubHostedConnections) {
                  if (c.open) {
                    c.send({
                      type: 'hub_directory_sync',
                      directory: snapshot,
                    });
                  }
                }
              }
            });
            conn.on('close', () => {
              this.hubHostedConnections.delete(conn);
            });
          });
        });
        candidateHub.on('error', () => {
          try {
            candidateHub.destroy();
          } catch {
            // ignore
          }
          this.connectToHubAsClient(hubId);
        });
      } catch {
        this.connectToHubAsClient(hubId);
      }
    }
  }

  private connectToHubAsClient(hubId: string): void {
    if (!this.personalPeer || this.personalPeer.destroyed) return;
    try {
      const conn = this.personalPeer.connect(hubId, { reliable: true });
      conn.on('open', () => {
        this.hubClientConnections.set(hubId, conn);
        if (this.localPresence) {
          conn.send({
            type: 'hub_announce',
            profile: this.localPresence,
            directory: Array.from(this.directoryCache.values()).slice(-100),
          });
        }
      });
      conn.on('data', (msg: any) => {
        if (msg?.type === 'hub_directory_sync' && Array.isArray(msg.directory)) {
          for (const item of msg.directory) {
            this.upsertDirectoryEntry(item);
          }
          this.saveLocalCache();
        }
      });
      conn.on('close', () => {
        this.hubClientConnections.delete(hubId);
      });
    } catch {
      // ignore
    }
  }

  private broadcastMyPresenceToHubs(): void {
    if (!this.localPresence) return;
    this.localPresence.updatedAt = Date.now();
    this.upsertDirectoryEntry(this.localPresence);

    for (const conn of this.hubClientConnections.values()) {
      if (conn.open) {
        conn.send({
          type: 'hub_announce',
          profile: this.localPresence,
        });
      }
    }
    const snapshot = Array.from(this.directoryCache.values()).slice(-200);
    for (const conn of this.hubHostedConnections) {
      if (conn.open) {
        conn.send({
          type: 'hub_directory_sync',
          directory: snapshot,
        });
      }
    }
  }

  private probePeerByPublicId(
    targetPublicId: string,
    timeoutMs = 2400,
    allowSelfProbe = false
  ): Promise<CachedSocialProfile | null> {
    const normTarget = normalizeSocialPlayerId(targetPublicId);
    if (
      !normTarget ||
      (!allowSelfProbe && normTarget === this.personalPeerPublicId)
    ) {
      return Promise.resolve(null);
    }

    // If probing self (to detect another open tab/device on the same account), create a temporary probe peer
    const useTempPeer =
      allowSelfProbe || !this.personalPeer || this.personalPeer.destroyed;

    return new Promise((resolve) => {
      let settled = false;
      let tempPeer: Peer | null = null;
      const finish = (val: CachedSocialProfile | null) => {
        if (settled) return;
        settled = true;
        if (tempPeer) {
          try {
            tempPeer.destroy();
          } catch {
            // ignore
          }
        }
        resolve(val);
      };

      const timer = window.setTimeout(() => finish(null), timeoutMs);
      const connectWithPeer = (activePeer: Peer) => {
        try {
          const conn = activePeer.connect(PublicIdToPeerId(normTarget), {
            reliable: true,
          });
          conn.on('open', () => {
            conn.send({
              type: 'social_profile_probe',
              senderProfile: this.localPresence,
            });
          });
          conn.on('data', (msg: any) => {
            if (msg?.type === 'social_profile_reply' && msg.profile) {
              window.clearTimeout(timer);
              this.upsertDirectoryEntry(msg.profile);
              if (Array.isArray(msg.directory)) {
                for (const d of msg.directory) this.upsertDirectoryEntry(d);
              }
              this.saveLocalCache();
              try {
                conn.close();
              } catch {
                // ignore
              }
              finish(msg.profile);
            }
          });
          conn.on('error', () => {
            window.clearTimeout(timer);
            finish(null);
          });
        } catch {
          window.clearTimeout(timer);
          finish(null);
        }
      };

      if (useTempPeer) {
        try {
          tempPeer = new Peer();
          tempPeer.on('open', () => {
            if (tempPeer) connectWithPeer(tempPeer);
          });
          tempPeer.on('error', () => {
            window.clearTimeout(timer);
            finish(null);
          });
        } catch {
          window.clearTimeout(timer);
          finish(null);
        }
      } else {
        connectWithPeer(this.personalPeer!);
      }
    });
  }

  /**
   * Synchronizes the local player's profile with all reachable social backends + P2P mesh,
   * adopts newer remote username/appearance/friends tombstones, and returns server confirmation.
   */
  public async syncProfile(payload: {
    uid: string | null;
    playerPublicId: string;
    username?: string;
    usernameUpdatedAt?: number;
    appearanceSlots?: any[];
    activeAppearanceSlotIndex?: number;
    accountAppearance?: any;
    appearanceUpdatedAt?: number;
    friendsList?: FriendProfileEntry[];
    removedFriendIds?: string[];
    deletedWorldIds?: string[];
    presence?: {
      isOnline: boolean;
      inOpenWorld: boolean;
      worldId: string | null;
      worldName: string | null;
      inviteCode: string | null;
    };
  }): Promise<{
    ok: boolean;
    confirmedByServer: boolean;
    profile?: any;
    friendsStatus?: FriendLiveStatus[];
  }> {
    const localSettings = SaveManager.loadSettings();
    const resolvedUsername =
      payload.username || SaveManager.getEffectiveUsername();
    const enrichedPayload = {
      ...payload,
      username: resolvedUsername,
      usernameUpdatedAt:
        payload.usernameUpdatedAt ?? localSettings.usernameUpdatedAt ?? 0,
      appearanceUpdatedAt:
        payload.appearanceUpdatedAt ?? localSettings.appearanceUpdatedAt ?? 0,
      removedFriendIds:
        payload.removedFriendIds ??
        Array.from(SaveManager.getRemovedFriendIds()),
      presence: payload.presence
        ? {
            ...payload.presence,
            sessionId: this.clientSessionId,
          }
        : undefined,
    };

    this.ensureP2PSocialMesh(payload.playerPublicId, resolvedUsername, {
      isOnline: payload.presence?.isOnline ?? true,
      inOpenWorld: payload.presence?.inOpenWorld ?? false,
      worldId: payload.presence?.worldId ?? null,
      worldName: payload.presence?.worldName ?? null,
      inviteCode: payload.presence?.inviteCode ?? null,
      sessionId: this.clientSessionId,
    });

    const baseUrls = this.getApiCandidateBaseUrls();
    const responses = await Promise.all(
      baseUrls.map((base) =>
        this.fetchJsonEndpoint(base, '/api/social/sync-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enrichedPayload),
        })
      )
    );

    // Also pull directory snapshot from reachable backends so local cache has all Firebase Auth users
    void Promise.all(
      baseUrls.map(async (base) => {
        const dirJson = await this.fetchJsonEndpoint(
          base,
          `/api/social/search?excludeId=${encodeURIComponent(
            payload.playerPublicId
          )}`
        );
        if (Array.isArray(dirJson?.results)) {
          for (const item of dirJson.results) {
            this.upsertDirectoryEntry(item);
          }
          this.saveLocalCache();
        }
      })
    );

    const validResponses = responses.filter((r) => r && r.ok && r.profile);
    if (validResponses.length > 0) {
      // Pick the profile with the most recent usernameUpdatedAt / updatedAt
      validResponses.sort(
        (a, b) =>
          (b.profile?.usernameUpdatedAt || b.profile?.updatedAt || 0) -
          (a.profile?.usernameUpdatedAt || a.profile?.updatedAt || 0)
      );
      const best = validResponses[0];
      const remoteProf = best.profile;

      // Reconcile remote profile into local settings if remote has newer data
      const latestSettings = SaveManager.loadSettings();
      let settingsChanged = false;
      const patch: Record<string, any> = {};

      if (
        remoteProf?.username &&
        remoteProf.username !== 'Aventureiro' &&
        !String(remoteProf.username).startsWith('Jogador ')
      ) {
        const remoteNameTs = remoteProf.usernameUpdatedAt || 0;
        const localNameTs = latestSettings.usernameUpdatedAt || 0;
        const localIsUnset =
          !latestSettings.accountUsername ||
          latestSettings.accountUsername === 'Aventureiro';
        if (remoteNameTs > localNameTs || localIsUnset) {
          patch.accountUsername = remoteProf.username;
          patch.playerName = remoteProf.username;
          patch.usernameUpdatedAt = Math.max(remoteNameTs, localNameTs, 1);
          settingsChanged = true;
        }
      }

      if (
        Array.isArray(remoteProf?.appearanceSlots) &&
        remoteProf.appearanceSlots.length > 0
      ) {
        const remoteAppTs = remoteProf.appearanceUpdatedAt || 0;
        const localAppTs = latestSettings.appearanceUpdatedAt || 0;
        if (remoteAppTs > localAppTs || !latestSettings.appearanceSlots) {
          patch.appearanceSlots = remoteProf.appearanceSlots;
          if (typeof remoteProf.activeAppearanceSlotIndex === 'number') {
            patch.activeAppearanceSlotIndex =
              remoteProf.activeAppearanceSlotIndex;
          }
          if (remoteProf.accountAppearance) {
            patch.accountAppearance = remoteProf.accountAppearance;
          }
          patch.appearanceUpdatedAt = Math.max(remoteAppTs, localAppTs);
          settingsChanged = true;
        }
      }

      if (Array.isArray(remoteProf?.removedFriendIds)) {
        const remSet = new Set<string>(SaveManager.getRemovedFriendIds());
        for (const rId of remoteProf.removedFriendIds) {
          const normR = normalizeSocialPlayerId(rId);
          if (normR) remSet.add(normR);
        }
        patch.removedFriendIds = Array.from(remSet);
        settingsChanged = true;
      }

      if (Array.isArray(remoteProf?.friendsList)) {
        const remSet = new Set<string>(
          patch.removedFriendIds || SaveManager.getRemovedFriendIds()
        );
        const fMap = new Map<string, FriendProfileEntry>();
        for (const f of SaveManager.getFriendsList()) {
          const normF = normalizeSocialPlayerId(f.playerPublicId);
          if (normF && !remSet.has(normF)) fMap.set(normF, f);
        }
        for (const rf of remoteProf.friendsList) {
          if (rf && rf.playerPublicId) {
            const normF = normalizeSocialPlayerId(rf.playerPublicId);
            if (normF && !remSet.has(normF)) {
              fMap.set(normF, {
                playerPublicId: normF,
                username: rf.username || 'Aventureiro',
                addedAt: rf.addedAt || Date.now(),
              });
            }
          }
        }
        patch.friendsList = Array.from(fMap.values());
        settingsChanged = true;
      }

      if (settingsChanged) {
        SaveManager.saveSettings({
          ...latestSettings,
          ...patch,
        });
      }

      if (Array.isArray(best.friendsStatus)) {
        for (const st of best.friendsStatus) {
          this.upsertDirectoryEntry(st);
        }
        this.saveLocalCache();
      }
      return {
        ok: true,
        confirmedByServer: true,
        profile: remoteProf,
        friendsStatus: best.friendsStatus,
      };
    }

    return { ok: true, confirmedByServer: false };
  }

  /**
   * Searches for players by Player ID (`SE-XXXX-XXXX` or partial) OR by Username across:
   * 1. All reachable HTTP backends (local `/api/social/search` + Vercel serverless + Cloud Run),
   * 2. Real-time PeerJS P2P Direct ID probe & Directory Hub,
   * 3. Local federated directory cache.
   */
  public async searchPlayers(params: {
    playerId?: string;
    username?: string;
    excludeId?: string;
  }): Promise<{
    ok: boolean;
    error?: string;
    results: SocialSearchResultEntry[];
  }> {
    const rawId = (params.playerId || '').trim().toUpperCase();
    const rawUsername = (params.username || '').trim();
    const excludeNorm = normalizeSocialPlayerId(params.excludeId || '');

    const queryParts: string[] = [];
    if (rawId) queryParts.push(`playerId=${encodeURIComponent(rawId)}`);
    if (rawUsername)
      queryParts.push(`username=${encodeURIComponent(rawUsername)}`);
    if (excludeNorm)
      queryParts.push(`excludeId=${encodeURIComponent(excludeNorm)}`);
    const queryString = queryParts.join('&');

    const baseUrls = this.getApiCandidateBaseUrls();
    const normTargetId = rawId ? normalizeSocialPlayerId(rawId) : '';

    // Query all HTTP backends AND P2P direct ID probe in parallel
    const [httpResponses, p2pDirectProfile] = await Promise.all([
      Promise.all(
        baseUrls.map((base) =>
          this.fetchJsonEndpoint(base, `/api/social/search?${queryString}`)
        )
      ),
      normTargetId && normTargetId.length >= 6
        ? this.probePeerByPublicId(normTargetId)
        : Promise.resolve(null),
    ]);

    for (const res of httpResponses) {
      if (Array.isArray(res?.results)) {
        for (const item of res.results) {
          this.upsertDirectoryEntry(item);
        }
      }
    }
    if (p2pDirectProfile) {
      this.upsertDirectoryEntry(p2pDirectProfile);
    }
    this.saveLocalCache();

    // Now filter across the merged directory cache so results from all sources are unified
    const resultsMap = new Map<string, SocialSearchResultEntry>();
    const allEntries = Array.from(this.directoryCache.values());

    if (rawId && !rawUsername) {
      const strippedQuery = rawId.replace(/[^A-Z0-9]/g, '');
      const exact = this.directoryCache.get(normTargetId);
      if (exact && exact.playerPublicId !== excludeNorm) {
        resultsMap.set(exact.playerPublicId, {
          playerPublicId: exact.playerPublicId,
          username: exact.username,
          isOnline: exact.isOnline,
          inOpenWorld: exact.inOpenWorld,
          worldName: exact.worldName,
          inviteCode: exact.inviteCode,
        });
      }
      if (strippedQuery.length >= 2) {
        for (const entry of allEntries) {
          if (!entry.playerPublicId || entry.playerPublicId === excludeNorm)
            continue;
          const entryStripped = entry.playerPublicId.replace(/[^A-Z0-9]/g, '');
          if (entryStripped.includes(strippedQuery)) {
            resultsMap.set(entry.playerPublicId, {
              playerPublicId: entry.playerPublicId,
              username: entry.username,
              isOnline: entry.isOnline,
              inOpenWorld: entry.inOpenWorld,
              worldName: entry.worldName,
              inviteCode: entry.inviteCode,
            });
          }
        }
      }
    } else if (rawUsername) {
      const lowerQ = rawUsername.toLowerCase();
      const matches = allEntries.filter(
        (entry) =>
          entry.playerPublicId &&
          entry.playerPublicId !== excludeNorm &&
          (entry.username.toLowerCase().includes(lowerQ) ||
            entry.playerPublicId.toLowerCase().includes(lowerQ))
      );
      matches.sort((a, b) => {
        const aExact = a.username.toLowerCase() === lowerQ ? 0 : 1;
        const bExact = b.username.toLowerCase() === lowerQ ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
      for (const m of matches.slice(0, 25)) {
        resultsMap.set(m.playerPublicId, {
          playerPublicId: m.playerPublicId,
          username: m.username,
          isOnline: m.isOnline,
          inOpenWorld: m.inOpenWorld,
          worldName: m.worldName,
          inviteCode: m.inviteCode,
        });
      }
    }

    return {
      ok: true,
      results: Array.from(resultsMap.values()),
    };
  }

  public async addFriend(payload: {
    myPublicId: string;
    myUsername: string;
    targetPublicId: string;
    targetUsername?: string;
  }): Promise<{
    ok: boolean;
    error?: string;
    friendsList: FriendProfileEntry[];
    friendsStatus: FriendLiveStatus[];
  }> {
    const myNorm = normalizeSocialPlayerId(payload.myPublicId);
    const targetNorm = normalizeSocialPlayerId(payload.targetPublicId);
    if (!myNorm || !targetNorm || targetNorm.length < 4) {
      return {
        ok: false,
        error: 'ID de jogador inválido.',
        friendsList: SaveManager.getFriendsList(),
        friendsStatus: [],
      };
    }
    if (myNorm === targetNorm) {
      return {
        ok: false,
        error: 'Você não pode adicionar seu próprio ID como amigo.',
        friendsList: SaveManager.getFriendsList(),
        friendsStatus: [],
      };
    }

    // Clear target from removedFriendIds tombstones since user is explicitly adding them
    SaveManager.clearFriendRemoved(targetNorm);

    const cachedTargetBefore = this.directoryCache.get(targetNorm);
    const resolvedHint =
      payload.targetUsername || cachedTargetBefore?.username || '';

    const baseUrls = this.getApiCandidateBaseUrls();
    const [httpResponses, p2pProfile] = await Promise.all([
      Promise.all(
        baseUrls.map((base) =>
          this.fetchJsonEndpoint(
            base,
            '/api/social/friends/add',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...payload,
                myPublicId: myNorm,
                targetPublicId: targetNorm,
                targetUsername: resolvedHint,
              }),
            },
            5500,
            true
          )
        )
      ),
      this.probePeerByPublicId(targetNorm, 1800),
    ]);

    if (p2pProfile) {
      this.upsertDirectoryEntry(p2pProfile);
    }

    let serverConfirmed = false;
    for (const res of httpResponses) {
      if (res?.ok && Array.isArray(res.friendsList)) {
        serverConfirmed = true;
        for (const f of res.friendsList) {
          this.upsertDirectoryEntry(f);
        }
        if (Array.isArray(res.friendsStatus)) {
          for (const st of res.friendsStatus) {
            this.upsertDirectoryEntry(st);
          }
        }
      }
    }

    const cachedTarget = this.directoryCache.get(targetNorm);
    const resolvedUsername =
      payload.targetUsername ||
      p2pProfile?.username ||
      cachedTarget?.username ||
      '';

    if (!resolvedUsername && !serverConfirmed) {
      return {
        ok: false,
        error:
          'Jogador não encontrado na busca. Pesquise pelo ID ou Username e selecione o jogador na lista de resultados.',
        friendsList: SaveManager.getFriendsList(),
        friendsStatus: [],
      };
    }

    this.upsertDirectoryEntry({
      playerPublicId: targetNorm,
      username: resolvedUsername || 'Aventureiro',
    });
    this.saveLocalCache();

    const remSet = new Set<string>(SaveManager.getRemovedFriendIds());
    const currentFriends = SaveManager.getFriendsList();
    const friendMap = new Map<string, FriendProfileEntry>();
    for (const f of currentFriends) {
      const fNorm = normalizeSocialPlayerId(f.playerPublicId);
      if (remSet.has(fNorm)) continue;
      const cached = this.directoryCache.get(fNorm);
      friendMap.set(fNorm, {
        playerPublicId: fNorm,
        username: cached?.username || f.username || 'Aventureiro',
        addedAt: f.addedAt || Date.now(),
      });
    }
    for (const res of httpResponses) {
      if (res?.ok && Array.isArray(res?.friendsList)) {
        for (const f of res.friendsList) {
          const fNorm = normalizeSocialPlayerId(f.playerPublicId);
          if (remSet.has(fNorm)) continue;
          const cached = this.directoryCache.get(fNorm);
          friendMap.set(fNorm, {
            playerPublicId: fNorm,
            username: cached?.username || f.username || 'Aventureiro',
            addedAt: f.addedAt || Date.now(),
          });
        }
      }
    }
    friendMap.set(targetNorm, {
      playerPublicId: targetNorm,
      username: resolvedUsername || 'Aventureiro',
      addedAt: friendMap.get(targetNorm)?.addedAt || Date.now(),
    });

    const mergedFriends = Array.from(friendMap.values());
    SaveManager.setFriendsList(mergedFriends);

    const friendsStatus: FriendLiveStatus[] = mergedFriends.map((f) => {
      const cached = this.directoryCache.get(f.playerPublicId);
      return {
        playerPublicId: f.playerPublicId,
        username: cached?.username || f.username,
        isOnline: Boolean(cached?.isOnline),
        inOpenWorld: Boolean(cached?.inOpenWorld),
        worldName: cached?.worldName || null,
        inviteCode: cached?.inviteCode || null,
        lastSeenAt: cached?.updatedAt || Date.now(),
      };
    });

    return {
      ok: true,
      friendsList: mergedFriends,
      friendsStatus,
    };
  }

  public async removeFriend(payload: {
    myPublicId: string;
    targetPublicId: string;
  }): Promise<{
    ok: boolean;
    confirmedByServer: boolean;
    friendsList: FriendProfileEntry[];
  }> {
    const myNorm = normalizeSocialPlayerId(payload.myPublicId);
    const targetNorm = normalizeSocialPlayerId(payload.targetPublicId);

    // Record permanent removal tombstone and update local list immediately
    SaveManager.markFriendRemoved(targetNorm);
    const filtered = SaveManager.getFriendsList().filter(
      (f) => normalizeSocialPlayerId(f.playerPublicId) !== targetNorm
    );
    SaveManager.setFriendsList(filtered);

    const baseUrls = this.getApiCandidateBaseUrls();
    const responses = await Promise.all(
      baseUrls.map((base) =>
        this.fetchJsonEndpoint(base, '/api/social/friends/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            myPublicId: myNorm,
            targetPublicId: targetNorm,
          }),
        })
      )
    );

    const confirmedByServer = responses.some((r) => Boolean(r && r.ok));
    return { ok: true, confirmedByServer, friendsList: filtered };
  }

  public async reportPresence(payload: {
    playerPublicId: string;
    username: string;
    isOnline: boolean;
    inOpenWorld: boolean;
    worldId: string | null;
    worldName: string | null;
    inviteCode: string | null;
  }): Promise<{
    ok: boolean;
    friendsList: FriendProfileEntry[];
    friendsStatus: FriendLiveStatus[];
    pendingJoinRequests: WorldJoinRequestInfo[];
  }> {
    this.ensureP2PSocialMesh(payload.playerPublicId, payload.username, payload);

    if (payload.worldId) {
      this.writeLocalTabWorldLock(
        payload.playerPublicId,
        payload.worldId,
        payload.worldName || 'Mundo'
      );
    }

    const baseUrls = this.getApiCandidateBaseUrls();
    const responses = await Promise.all(
      baseUrls.map((base) =>
        this.fetchJsonEndpoint(base, '/api/social/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            sessionId: this.clientSessionId,
            deviceLabel: this.getDeviceLabel(),
          }),
        })
      )
    );

    const removedSet = new Set<string>(SaveManager.getRemovedFriendIds());
    const currentFriends = SaveManager.getFriendsList().filter(
      (f) => !removedSet.has(normalizeSocialPlayerId(f.playerPublicId))
    );

    // Also probe up to 8 friends directly via PeerJS P2P if they aren't marked online yet
    await Promise.all(
      currentFriends.slice(0, 8).map((f) =>
        this.probePeerByPublicId(f.playerPublicId, 1500)
      )
    );

    const pendingRequestsMap = new Map<string, WorldJoinRequestInfo>();
    for (const [id, jr] of this.incomingJoinRequests.entries()) {
      if (Date.now() - jr.createdAt > 90000) {
        this.incomingJoinRequests.delete(id);
      } else if (jr.status === 'PENDING') {
        pendingRequestsMap.set(id, jr);
      }
    }

    for (const res of responses) {
      if (!res?.ok) continue;
      if (Array.isArray(res.friendsStatus)) {
        for (const st of res.friendsStatus) {
          this.upsertDirectoryEntry(st);
        }
      }
      if (Array.isArray(res.pendingJoinRequests)) {
        for (const jr of res.pendingJoinRequests) {
          if (jr && jr.requestId && jr.status === 'PENDING') {
            pendingRequestsMap.set(jr.requestId, jr);
          }
        }
      }
    }
    this.saveLocalCache();

    // Update local friend usernames if resolved in directoryCache
    let friendsUpdated = false;
    const updatedFriends = currentFriends.map((f) => {
      const norm = normalizeSocialPlayerId(f.playerPublicId);
      const cached = this.directoryCache.get(norm);
      if (
        cached?.username &&
        cached.username !== f.username &&
        !cached.username.startsWith('Jogador ')
      ) {
        friendsUpdated = true;
        return { ...f, playerPublicId: norm, username: cached.username };
      }
      return { ...f, playerPublicId: norm };
    });
    if (friendsUpdated) {
      SaveManager.setFriendsList(updatedFriends);
    }

    const friendsStatus: FriendLiveStatus[] = updatedFriends.map((f) => {
      const cached = this.directoryCache.get(f.playerPublicId);
      return {
        playerPublicId: f.playerPublicId,
        username: cached?.username || f.username,
        isOnline: Boolean(cached?.isOnline),
        inOpenWorld: Boolean(cached?.inOpenWorld),
        worldName: cached?.worldName || null,
        inviteCode: cached?.inviteCode || null,
        lastSeenAt: cached?.updatedAt || Date.now(),
      };
    });

    return {
      ok: true,
      friendsList: updatedFriends,
      friendsStatus,
      pendingJoinRequests: Array.from(pendingRequestsMap.values()),
    };
  }

  private readLocalTabWorldLock(
    myPublicId: string
  ): ActiveWorldSessionLockInfo | null {
    try {
      const raw = localStorage.getItem(ACTIVE_WORLD_SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ActiveWorldSessionLockInfo;
      if (!parsed || typeof parsed !== 'object') return null;
      const normId = normalizeSocialPlayerId(parsed.playerPublicId || '');
      if (normId !== normalizeSocialPlayerId(myPublicId)) return null;
      if (Date.now() - (parsed.updatedAt || 0) > 25000) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private writeLocalTabWorldLock(
    myPublicId: string,
    worldId: string,
    worldName: string
  ): void {
    try {
      const normId = normalizeSocialPlayerId(myPublicId);
      if (!normId) return;
      const existing = this.readLocalTabWorldLock(normId);
      const lock: ActiveWorldSessionLockInfo = {
        playerPublicId: normId,
        sessionId: this.clientSessionId,
        worldId,
        worldName: worldName || 'Mundo',
        deviceLabel: this.getDeviceLabel(),
        startedAt: existing?.startedAt || Date.now(),
        updatedAt: Date.now(),
      };
      localStorage.setItem(
        ACTIVE_WORLD_SESSION_STORAGE_KEY,
        JSON.stringify(lock)
      );
    } catch {
      // ignore
    }
  }

  private releaseLocalTabWorldLockSync(): void {
    try {
      const raw = localStorage.getItem(ACTIVE_WORLD_SESSION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ActiveWorldSessionLockInfo;
      if (!parsed || parsed.sessionId === this.clientSessionId) {
        localStorage.removeItem(ACTIVE_WORLD_SESSION_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Verifies and acquires an exclusive active world session lock for this account (`playerPublicId`).
   * Prevents opening any world if the same account already has a world open in another tab or device.
   */
  public async acquireAccountWorldSessionLock(params: {
    playerPublicId: string;
    worldId: string;
    worldName: string;
  }): Promise<{
    ok: boolean;
    conflict: boolean;
    error?: string;
    activeSession?: ActiveWorldSessionLockInfo | null;
  }> {
    const normId = normalizeSocialPlayerId(params.playerPublicId);
    if (!normId) {
      return { ok: true, conflict: false, activeSession: null };
    }

    // 1. Check cross-tab localStorage lock on the same browser
    const localLock = this.readLocalTabWorldLock(normId);
    if (localLock && localLock.sessionId !== this.clientSessionId) {
      return {
        ok: false,
        conflict: true,
        error: `Sua conta já está com o mundo "${localLock.worldName}" aberto em outra aba ou janela neste dispositivo. Feche o mundo na outra aba antes de abrir um mundo aqui para evitar conflito nos saves.`,
        activeSession: localLock,
      };
    }

    // 2. Check all HTTP social backends AND PeerJS P2P personal peer in parallel
    const baseUrls = this.getApiCandidateBaseUrls();
    const [httpResults, p2pSelfReply] = await Promise.all([
      Promise.all(
        baseUrls.map((base) =>
          this.fetchJsonEndpoint(
            base,
            '/api/social/world-session',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'acquire',
                playerPublicId: normId,
                sessionId: this.clientSessionId,
                worldId: params.worldId,
                worldName: params.worldName,
                deviceLabel: this.getDeviceLabel(),
              }),
            },
            4000,
            true
          )
        )
      ),
      this.probePeerByPublicId(normId, 1600, true),
    ]);

    // Check if any HTTP backend reported a live conflict from another sessionId
    for (const res of httpResults) {
      if (
        res?.conflict &&
        res.activeSession &&
        res.activeSession.sessionId !== this.clientSessionId
      ) {
        return {
          ok: false,
          conflict: true,
          error:
            res.error ||
            `Sua conta já está com o mundo "${
              res.activeSession.worldName || 'Mundo'
            }" aberto em outra sessão (${
              res.activeSession.deviceLabel || 'Outro Dispositivo'
            }). Feche o mundo na outra sessão antes de abrir um mundo aqui para evitar perda ou conflito nos saves.`,
          activeSession: res.activeSession,
        };
      }
    }

    // Check if another P2P session for our own Public ID responded that it is inside a world
    if (
      p2pSelfReply &&
      p2pSelfReply.worldId &&
      p2pSelfReply.sessionId &&
      p2pSelfReply.sessionId !== this.clientSessionId &&
      Date.now() - (p2pSelfReply.updatedAt || 0) < 30000
    ) {
      const conflictSession: ActiveWorldSessionLockInfo = {
        playerPublicId: normId,
        sessionId: p2pSelfReply.sessionId,
        worldId: p2pSelfReply.worldId,
        worldName: p2pSelfReply.worldName || 'Mundo Ativo',
        deviceLabel: 'Outro Dispositivo Conectado',
        startedAt: p2pSelfReply.updatedAt || Date.now(),
        updatedAt: p2pSelfReply.updatedAt || Date.now(),
      };
      return {
        ok: false,
        conflict: true,
        error: `Sua conta já está com o mundo "${conflictSession.worldName}" aberto em outro dispositivo. Feche o mundo no outro dispositivo antes de abrir um mundo aqui para evitar conflito nos saves.`,
        activeSession: conflictSession,
      };
    }

    // Lock acquired! Persist local cross-tab lock
    this.writeLocalTabWorldLock(normId, params.worldId, params.worldName);
    if (this.localPresence) {
      this.localPresence.worldId = params.worldId;
      this.localPresence.worldName = params.worldName;
      this.localPresence.sessionId = this.clientSessionId;
      this.localPresence.updatedAt = Date.now();
    }

    return {
      ok: true,
      conflict: false,
      activeSession: this.readLocalTabWorldLock(normId),
    };
  }

  public async releaseAccountWorldSessionLock(
    playerPublicId?: string
  ): Promise<void> {
    this.releaseLocalTabWorldLockSync();
    if (this.localPresence) {
      this.localPresence.worldId = null;
      this.localPresence.worldName = null;
      this.localPresence.inOpenWorld = false;
      this.localPresence.inviteCode = null;
      this.localPresence.updatedAt = Date.now();
    }
    const normId = normalizeSocialPlayerId(
      playerPublicId || SaveManager.getPlayerPublicId()
    );
    if (!normId) return;

    const baseUrls = this.getApiCandidateBaseUrls();
    await Promise.all(
      baseUrls.map((base) =>
        this.fetchJsonEndpoint(
          base,
          '/api/social/world-session',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'release',
              playerPublicId: normId,
              sessionId: this.clientSessionId,
            }),
          },
          3500
        )
      )
    );
  }

  public async sendJoinRequest(payload: {
    requesterPublicId: string;
    requesterName: string;
    targetPublicId: string;
  }): Promise<{
    ok: boolean;
    error?: string;
    request?: WorldJoinRequestInfo;
  }> {
    const reqNorm = normalizeSocialPlayerId(payload.requesterPublicId);
    const targetNorm = normalizeSocialPlayerId(payload.targetPublicId);
    const baseUrls = this.getApiCandidateBaseUrls();

    const httpResponses = await Promise.all(
      baseUrls.map((base) =>
        this.fetchJsonEndpoint(base, '/api/social/join-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requesterPublicId: reqNorm,
            requesterName: payload.requesterName,
            targetPublicId: targetNorm,
          }),
        })
      )
    );

    const validHttp = httpResponses.find((r) => r && r.ok && r.request);
    if (validHttp) {
      this.outgoingJoinRequests.set(
        validHttp.request.requestId,
        validHttp.request
      );
      return { ok: true, request: validHttp.request };
    }

    // Fallback: Send join request directly over PeerJS P2P to targetPublicId
    if (this.personalPeer && !this.personalPeer.destroyed) {
      const p2pResult = await new Promise<{
        ok: boolean;
        error?: string;
        request?: WorldJoinRequestInfo;
      }>((resolve) => {
        let settled = false;
        const finish = (res: {
          ok: boolean;
          error?: string;
          request?: WorldJoinRequestInfo;
        }) => {
          if (settled) return;
          settled = true;
          resolve(res);
        };
        const timer = window.setTimeout(
          () =>
            finish({
              ok: false,
              error:
                'Não foi possível contatar o mundo deste amigo no momento.',
            }),
          3500
        );
        try {
          const conn = this.personalPeer!.connect(PublicIdToPeerId(targetNorm), {
            reliable: true,
          });
          const reqObj: WorldJoinRequestInfo = {
            requestId: `jreq_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            requesterPublicId: reqNorm,
            requesterName: payload.requesterName,
            targetPublicId: targetNorm,
            worldId: 'world',
            worldName:
              this.directoryCache.get(targetNorm)?.worldName || 'Mundo Online',
            inviteCode: '',
            status: 'PENDING',
            createdAt: Date.now(),
          };
          conn.on('open', () => {
            conn.send({
              type: 'social_join_request',
              request: reqObj,
            });
          });
          conn.on('data', (msg: any) => {
            if (msg?.type === 'social_join_request_ack') {
              window.clearTimeout(timer);
              try {
                conn.close();
              } catch {
                // ignore
              }
              if (msg.ok && msg.request) {
                this.outgoingJoinRequests.set(
                  msg.request.requestId,
                  msg.request
                );
                finish({ ok: true, request: msg.request });
              } else {
                finish({
                  ok: false,
                  error:
                    msg.error || 'Este amigo não está em um mundo aberto.',
                });
              }
            }
          });
          conn.on('error', () => {
            window.clearTimeout(timer);
            finish({
              ok: false,
              error: 'Não foi possível conectar ao anfitrião.',
            });
          });
        } catch {
          window.clearTimeout(timer);
          finish({
            ok: false,
            error: 'Erro ao solicitar entrada.',
          });
        }
      });
      if (p2pResult.ok) return p2pResult;
    }

    return {
      ok: false,
      error:
        'Este amigo não está em um mundo com disponibilidade online ativada no momento.',
    };
  }

  public async pollJoinRequestStatus(
    requestId: string,
    targetPublicId?: string
  ): Promise<{ ok: boolean; request?: WorldJoinRequestInfo }> {
    const baseUrls = this.getApiCandidateBaseUrls();
    const responses = await Promise.all(
      baseUrls.map((base) =>
        this.fetchJsonEndpoint(
          base,
          `/api/social/join-request/${encodeURIComponent(requestId)}`
        )
      )
    );
    const valid = responses.find((r) => r && r.ok && r.request);
    if (valid) {
      return { ok: true, request: valid.request };
    }

    // Poll via PeerJS if it was a P2P request
    const tracked = this.outgoingJoinRequests.get(requestId);
    const hostId = targetPublicId || tracked?.targetPublicId;
    if (hostId && this.personalPeer && !this.personalPeer.destroyed) {
      const p2pPoll = await new Promise<WorldJoinRequestInfo | null>(
        (resolve) => {
          let settled = false;
          const finish = (val: WorldJoinRequestInfo | null) => {
            if (settled) return;
            settled = true;
            resolve(val);
          };
          const timer = window.setTimeout(() => finish(null), 1400);
          try {
            const conn = this.personalPeer!.connect(PublicIdToPeerId(hostId), {
              reliable: true,
            });
            conn.on('open', () => {
              conn.send({
                type: 'social_join_poll',
                requestId,
              });
            });
            conn.on('data', (msg: any) => {
              if (msg?.type === 'social_join_poll_reply' && msg.request) {
                window.clearTimeout(timer);
                try {
                  conn.close();
                } catch {
                  // ignore
                }
                finish(msg.request);
              }
            });
            conn.on('error', () => {
              window.clearTimeout(timer);
              finish(null);
            });
          } catch {
            window.clearTimeout(timer);
            finish(null);
          }
        }
      );
      if (p2pPoll) {
        return { ok: true, request: p2pPoll };
      }
    }

    return { ok: false };
  }

  public async respondToJoinRequest(
    requestId: string,
    accept: boolean
  ): Promise<void> {
    const localReq = this.incomingJoinRequests.get(requestId);
    if (localReq) {
      localReq.status = accept ? 'ACCEPTED' : 'DECLINED';
      if (accept && this.localPresence?.inviteCode) {
        localReq.inviteCode = this.localPresence.inviteCode;
      }
    }

    const baseUrls = this.getApiCandidateBaseUrls();
    await Promise.all(
      baseUrls.map((base) =>
        this.fetchJsonEndpoint(base, '/api/social/join-request/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId, accept }),
        })
      )
    );
  }
}

export const socialDirectoryClient = new SocialDirectoryClientService();
