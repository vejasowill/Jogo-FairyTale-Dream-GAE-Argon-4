import {
  CHEST_STORAGE_SIZE,
  GameSettings,
  HOTBAR_SIZE,
  PlaceableType,
  PlayerState,
  TOTAL_INVENTORY_SIZE,
  WorldMetadata,
  WorldSaveData,
} from '../core/types';
import { WorldManager } from '../world/WorldManager';

const INDEX_KEY = 'wildborn_worlds_index_v1';
const SETTINGS_KEY = 'wildborn_settings_v1';
const WORLD_PREFIX = 'wildborn_world_v1_';

export const CURRENT_SAVE_VERSION = 2;

export interface SaveEnvelope {
  checksum: string;
  savedAt: number;
  data: WorldSaveData;
}

export function computeChecksum(payload: string): string {
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function seedFromText(text: string): number {
  const clean = text.trim();
  if (!clean) {
    return Math.floor(Math.random() * 899999 + 100000);
  }
  const asNum = Number(clean);
  if (!Number.isNaN(asNum) && Number.isFinite(asNum)) {
    return Math.abs(Math.floor(asNum)) % 99999999;
  }
  let h = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    h ^= clean.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 99999999;
}

export function createInitialPlayerState(): PlayerState {
  const inventory = new Array(TOTAL_INVENTORY_SIZE).fill(null);
  // 8 Hotbar slots (0..7): give starter survival gear + workbench + placeable storage chest
  inventory[0] = { itemId: 'stone_axe', count: 1 };
  inventory[1] = { itemId: 'stone_pickaxe', count: 1 };
  inventory[2] = { itemId: 'wood_sword', count: 1 };
  inventory[3] = { itemId: 'berry', count: 6 };
  inventory[4] = { itemId: 'torch', count: 3 };
  inventory[5] = { itemId: 'workbench', count: 1 };
  inventory[6] = { itemId: 'chest', count: 1 };
  inventory[7] = { itemId: 'stone_hoe', count: 1 };
  inventory[8] = { itemId: 'watering_can_full', count: 1 };
  inventory[9] = { itemId: 'wheat_seeds', count: 5 };
  inventory[10] = { itemId: 'carrot_seeds', count: 3 };

  return {
    x: 16,
    y: 16,
    vx: 0,
    vy: 0,
    direction: 'down',
    hp: 100,
    maxHp: 100,
    hunger: 100,
    maxHunger: 100,
    stamina: 100,
    maxStamina: 100,
    level: 1,
    xp: 0,
    xpToNext: 100,
    attributePoints: 0,
    attributes: {
      vitality: 1,
      strength: 1,
      agility: 1,
      survival: 1,
    },
    inventory,
    selectedHotbarIndex: 0,
    equippedArmorId: null,
    equippedBySlot: {
      head: null,
      body: null,
      legs: null,
      feet: null,
    },
    appearance: {
      skinColor: '#fdba74',
      hairColor: '#451a03',
      hairStyle: 'adventurer',
      eyeColor: '#0f172a',
      shirtColor: '#2563eb',
      pantsColor: '#334155',
    },
    isMoving: false,
    animFrame: 0,
    animTimer: 0,
    swingTimer: 0,
    swingDuration: 0.28,
    hitFlashTimer: 0,
  };
}

/**
 * Backward-compatible migration: upgrades v1 saves (6 hotbar + 18 backpack = 24 slots)
 * or any older save format to v2 (8 hotbar + 24 backpack = 32 slots + waypoints + interactive chests + 4-slot equipment) without losing data.
 */
export function migrateSaveData(rawSave: WorldSaveData): WorldSaveData {
  const migrated: WorldSaveData = {
    ...rawSave,
    version: CURRENT_SAVE_VERSION,
    metadata: {
      ...rawSave.metadata,
      // Preserve worldGenVersion = 1 for all existing saves so their terrain/chunks never change
      worldGenVersion: rawSave.metadata?.worldGenVersion ?? 1,
    },
    waypoints: Array.isArray(rawSave.waypoints) ? rawSave.waypoints : [],
    droppedItems: Array.isArray(rawSave.droppedItems) ? rawSave.droppedItems : [],
    creatures: Array.isArray(rawSave.creatures) ? rawSave.creatures : [],
  };

  if (!migrated.player.equippedBySlot || typeof migrated.player.equippedBySlot !== 'object') {
    migrated.player.equippedBySlot = {
      head: null,
      body: migrated.player.equippedArmorId || null,
      legs: null,
      feet: null,
    };
  } else {
    migrated.player.equippedBySlot = {
      head: migrated.player.equippedBySlot.head || null,
      body: migrated.player.equippedBySlot.body || migrated.player.equippedArmorId || null,
      legs: migrated.player.equippedBySlot.legs || null,
      feet: migrated.player.equippedBySlot.feet || null,
    };
  }
  migrated.player.equippedArmorId = migrated.player.equippedBySlot.body;

  const defaultApp = createInitialPlayerState().appearance;
  migrated.player.appearance = {
    ...defaultApp,
    ...(migrated.player.appearance || {}),
  };

  if (!migrated.player.inventory || !Array.isArray(migrated.player.inventory)) {
    migrated.player.inventory = createInitialPlayerState().inventory;
  } else if (migrated.player.inventory.length < TOTAL_INVENTORY_SIZE) {
    // v1 had 6 hotbar slots (0..5) and 18 backpack slots (6..23).
    // Preserve v1 hotbar items in 0..5, leave 6..7 empty on hotbar, and shift old backpack (6..23) into new backpack (8..25)!
    const oldInv = migrated.player.inventory;
    const newInv = new Array(TOTAL_INVENTORY_SIZE).fill(null);
    if (oldInv.length === 24 && (rawSave.version || 1) === 1) {
      for (let i = 0; i < 6; i++) {
        newInv[i] = oldInv[i] || null;
      }
      for (let i = 6; i < 24; i++) {
        newInv[i + 2] = oldInv[i] || null;
      }
    } else {
      for (let i = 0; i < oldInv.length; i++) {
        newInv[i] = oldInv[i] || null;
      }
    }
    migrated.player.inventory = newInv;
  }

  if (
    typeof migrated.player.selectedHotbarIndex !== 'number' ||
    migrated.player.selectedHotbarIndex < 0 ||
    migrated.player.selectedHotbarIndex >= HOTBAR_SIZE
  ) {
    migrated.player.selectedHotbarIndex = 0;
  }

  // Ensure all existing placed or world-generated Chests have a 24-slot storageSlots array
  if (migrated.chunks && typeof migrated.chunks === 'object') {
    for (const chunk of Object.values(migrated.chunks)) {
      if (!chunk || !Array.isArray(chunk.structures)) continue;
      for (const st of chunk.structures) {
        if (st.type === PlaceableType.CHEST) {
          if (!Array.isArray(st.storageSlots) || st.storageSlots.length < CHEST_STORAGE_SIZE) {
            const slots = new Array(CHEST_STORAGE_SIZE).fill(null);
            if (Array.isArray(st.storageSlots)) {
              for (let i = 0; i < Math.min(st.storageSlots.length, CHEST_STORAGE_SIZE); i++) {
                slots[i] = st.storageSlots[i] || null;
              }
            } else if (Array.isArray(st.lootItems) && st.lootItems.length > 0) {
              for (let i = 0; i < Math.min(st.lootItems.length, CHEST_STORAGE_SIZE); i++) {
                slots[i] = {
                  itemId: st.lootItems[i].itemId,
                  count: st.lootItems[i].count,
                };
              }
            }
            st.storageSlots = slots;
          }
          if (!st.customName && st.landmarkName) {
            st.customName = st.landmarkName;
          }
        }
      }
    }
  }

  return migrated;
}

export class SaveManager {
  public static getDefaultControlLayout() {
    return {
      joystick: { offsetX: 0, offsetY: 0, scale: 1.0 },
      attackBtn: { offsetX: 0, offsetY: 0, scale: 1.0 },
      interactBtn: { offsetX: 0, offsetY: 0, scale: 1.0 },
      placeBtn: { offsetX: 0, offsetY: 0, scale: 1.0 },
      hotbar: { offsetX: 0, offsetY: 0, scale: 1.0 },
      statusPlaque: { offsetX: 0, offsetY: 0, scale: 1.0 },
      topMenu: { offsetX: 0, offsetY: 0, scale: 1.0 },
    };
  }

  public static getDefaultSettings(): GameSettings {
    return {
      soundEnabled: true,
      soundVolume: 0.35,
      autoSaveIntervalSec: 20,
      serverSyncEnabled: true,
      customServerUrl: '',
      showTouchControls: true,
      cameraZoom: 1.15,
      hudScale: 1.0,
      hudOpacity: 0.96,
      controlLayout: this.getDefaultControlLayout(),
    };
  }

  public static loadSettings(): GameSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return this.getDefaultSettings();
      const parsed = JSON.parse(raw);
      const defaults = this.getDefaultSettings();
      let resolvedZoom =
        typeof parsed.cameraZoom === 'number' ? parsed.cameraZoom : defaults.cameraZoom;
      if (!parsed._wideCamMigrated && resolvedZoom >= 1.8) {
        resolvedZoom = 1.15;
        try {
          localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify({ ...parsed, cameraZoom: 1.15, _wideCamMigrated: true })
          );
        } catch {
          // ignore
        }
      }
      return {
        ...defaults,
        ...parsed,
        cameraZoom: Math.max(0.55, Math.min(2.5, resolvedZoom)),
        controlLayout: {
          ...defaults.controlLayout,
          ...(parsed.controlLayout || {}),
        },
      };
    } catch {
      return this.getDefaultSettings();
    }
  }

  public static saveSettings(settings: GameSettings): void {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ ...settings, _wideCamMigrated: true })
      );
    } catch {
      // ignore storage quota errors
    }
  }

  public static listWorlds(): WorldMetadata[] {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw) as WorldMetadata[];
      return Array.isArray(list) ? list.sort((a, b) => b.updatedAt - a.updatedAt) : [];
    } catch {
      return [];
    }
  }

  private static saveWorldIndex(list: WorldMetadata[]): void {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  }

  public static createNewWorld(
    name: string,
    seedInput: string,
    difficulty: 'normal' | 'survival' | 'hardcore'
  ): WorldSaveData {
    const seed = seedFromText(seedInput);
    const now = Date.now();
    const id = `world_${now}_${Math.floor(Math.random() * 9999)}`;
    const player = createInitialPlayerState();
    const worldMgr = new WorldManager(seed, undefined, 2);
    worldMgr.revealAround(player.x, player.y, 11);

    const metadata: WorldMetadata = {
      id,
      name: name.trim() || 'Fronteira Selvagem',
      seed,
      seedText: seedInput.trim() || String(seed),
      difficulty,
      createdAt: now,
      updatedAt: now,
      dayCount: 1,
      timeOfDay: 8.0,
      playerLevel: 1,
      exploredChunksCount: worldMgr.getExploredChunksCount(),
      worldGenVersion: 2,
    };

    const saveData: WorldSaveData = {
      version: CURRENT_SAVE_VERSION,
      metadata,
      player,
      chunks: worldMgr.chunks,
      creatures: [],
      droppedItems: [],
      waypoints: [
        {
          id: 'wp_origin',
          label: 'Acampamento Inicial',
          tileX: 0,
          tileY: 0,
          color: '#f59e0b',
        },
      ],
    };

    this.saveWorldLocal(saveData);
    return saveData;
  }

  public static saveWorldLocal(saveData: WorldSaveData): boolean {
    try {
      saveData.version = CURRENT_SAVE_VERSION;
      saveData.metadata.updatedAt = Date.now();
      const serialized = JSON.stringify(saveData);
      const checksum = computeChecksum(serialized);
      const envelope: SaveEnvelope = {
        checksum,
        savedAt: Date.now(),
        data: saveData,
      };
      const envelopeStr = JSON.stringify(envelope);

      const primaryKey = `${WORLD_PREFIX}${saveData.metadata.id}`;
      const backupKey = `${WORLD_PREFIX}${saveData.metadata.id}_bak`;

      const existingPrimary = localStorage.getItem(primaryKey);
      if (existingPrimary) {
        localStorage.setItem(backupKey, existingPrimary);
      }

      localStorage.setItem(primaryKey, envelopeStr);

      const list = this.listWorlds().filter((w) => w.id !== saveData.metadata.id);
      list.unshift(saveData.metadata);
      this.saveWorldIndex(list);
      return true;
    } catch (e) {
      console.error('Failed to save world locally:', e);
      return false;
    }
  }

  public static loadWorldLocal(worldId: string): WorldSaveData | null {
    const primaryKey = `${WORLD_PREFIX}${worldId}`;
    const backupKey = `${WORLD_PREFIX}${worldId}_bak`;

    const tryParseEnvelope = (raw: string | null): WorldSaveData | null => {
      if (!raw) return null;
      try {
        const env = JSON.parse(raw) as SaveEnvelope;
        if (!env || !env.data || !env.checksum) return null;
        const verify = computeChecksum(JSON.stringify(env.data));
        if (verify !== env.checksum) {
          console.warn('Save checksum mismatch, attempting recovery...');
          return null;
        }
        return migrateSaveData(env.data);
      } catch {
        return null;
      }
    };

    const primary = tryParseEnvelope(localStorage.getItem(primaryKey));
    if (primary) return primary;

    const backup = tryParseEnvelope(localStorage.getItem(backupKey));
    if (backup) {
      this.saveWorldLocal(backup);
      return backup;
    }

    return null;
  }

  public static updateWorldMetadata(
    worldId: string,
    newName: string,
    newDifficulty: 'normal' | 'survival' | 'hardcore'
  ): WorldMetadata | null {
    const data = this.loadWorldLocal(worldId);
    if (!data) return null;
    data.metadata.name = newName.trim() || data.metadata.name;
    data.metadata.difficulty = newDifficulty;
    data.metadata.updatedAt = Date.now();
    this.saveWorldLocal(data);
    return data.metadata;
  }

  public static deleteWorld(worldId: string, settings?: GameSettings): void {
    localStorage.removeItem(`${WORLD_PREFIX}${worldId}`);
    localStorage.removeItem(`${WORLD_PREFIX}${worldId}_bak`);
    const list = this.listWorlds().filter((w) => w.id !== worldId);
    this.saveWorldIndex(list);

    const cfg = settings || this.loadSettings();
    if (cfg.serverSyncEnabled) {
      const base = cfg.customServerUrl.trim().replace(/\/$/, '');
      fetch(`${base}/api/worlds/${encodeURIComponent(worldId)}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
  }

  public static async syncWorldToServer(
    saveData: WorldSaveData,
    settings?: GameSettings
  ): Promise<{ ok: boolean; message: string }> {
    const cfg = settings || this.loadSettings();
    if (!cfg.serverSyncEnabled) {
      return { ok: false, message: 'Sincronização com servidor desativada.' };
    }
    const base = cfg.customServerUrl.trim().replace(/\/$/, '');
    const url = `${base}/api/worlds`;
    try {
      const checksum = computeChecksum(JSON.stringify(saveData));
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ world: saveData, checksum }),
      });
      if (!res.ok) {
        return { ok: false, message: `Erro HTTP ${res.status}` };
      }
      return { ok: true, message: 'Salvo no servidor com sucesso.' };
    } catch {
      return { ok: false, message: 'Servidor offline (salvo localmente com segurança).' };
    }
  }

  public static async fetchWorldsFromServer(settings?: GameSettings): Promise<WorldMetadata[]> {
    const cfg = settings || this.loadSettings();
    if (!cfg.serverSyncEnabled) return this.listWorlds();
    const base = cfg.customServerUrl.trim().replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/api/worlds`);
      if (!res.ok) return this.listWorlds();
      const json = await res.json();
      if (Array.isArray(json.worlds)) {
        const localIds = new Set(this.listWorlds().map((w) => w.id));
        for (const serverWorld of json.worlds as WorldSaveData[]) {
          if (serverWorld && serverWorld.metadata && !localIds.has(serverWorld.metadata.id)) {
            this.saveWorldLocal(migrateSaveData(serverWorld));
          }
        }
      }
    } catch {
      // ignore offline
    }
    return this.listWorlds();
  }

  public static downloadWorldFile(saveData: WorldSaveData): void {
    const serialized = JSON.stringify(saveData);
    const envelope: SaveEnvelope = {
      checksum: computeChecksum(serialized),
      savedAt: Date.now(),
      data: saveData,
    };
    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = saveData.metadata.name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '_')
      .slice(0, 30);
    a.href = url;
    a.download = `${safeName || 'mundo'}_${saveData.metadata.seed}.wildborn.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public static importWorldFromJson(rawJson: string): {
    ok: boolean;
    world?: WorldSaveData;
    error?: string;
  } {
    try {
      const parsed = JSON.parse(rawJson);
      let saveData: WorldSaveData;

      if (parsed.checksum && parsed.data) {
        const verify = computeChecksum(JSON.stringify(parsed.data));
        if (verify !== parsed.checksum) {
          return {
            ok: false,
            error: 'Arquivo corrompido: falha na verificação de checksum.',
          };
        }
        saveData = parsed.data;
      } else if (parsed.metadata && parsed.player && parsed.chunks) {
        saveData = parsed;
      } else {
        return { ok: false, error: 'Formato de arquivo de mundo inválido.' };
      }

      const migrated = migrateSaveData(saveData);
      this.saveWorldLocal(migrated);
      return { ok: true, world: migrated };
    } catch {
      return { ok: false, error: 'Não foi possível ler o arquivo JSON.' };
    }
  }
}
