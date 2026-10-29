import {
  CONSTRUCTION_BLUEPRINTS,
  evaluateMaterialBreak,
  evaluateStallPriceDeal,
  FUEL_ITEM_ORDER,
  FUEL_ITEMS,
  getFuelBurnTimeSec,
  getItemBasePrice,
  getNatureBreakRequirement,
  getStructureBreakRequirement,
  isFuelItem,
  ITEMS,
  NATURE_BLUEPRINTS,
} from '../core/ItemRegistry';
import { CraftingRecipe, RECIPES } from '../core/RecipeRegistry';
import { soundManager } from '../core/SoundManager';
import {
  BiomeType,
  CHEST_STORAGE_SIZE,
  CreatureEntity,
  CreatureKind,
  DeathBag,
  DroppedItem,
  EcologicalZone,
  EquipmentSlot,
  FloatingText,
  GAME_VERSION,
  GameSettings,
  HOTBAR_SIZE,
  InventorySlot,
  ItemCategory,
  MapWaypoint,
  MARKET_STALL_SIZE,
  MarketPurchaseOffer,
  MarketStallSlot,
  MOUNT_STORAGE_SIZE,
  NatureNodeType,
  OnlineSessionInfo,
  PlaceableType,
  PlacedStructure,
  PlayerAppearance,
  PlayerAttributes,
  PlayerState,
  RemotePlayerState,
  TOTAL_INVENTORY_SIZE,
  ToolType,
  WorldMetadata,
  WorldSaveData,
} from '../core/types';
import {
  EntityManager,
  MAX_VILLAGERS_PER_HOUSE,
} from '../entities/EntityManager';
import { InputManager } from '../input/InputManager';
import { MultiplayerManager } from '../network/MultiplayerManager';
import {
  createInitialPlayerState,
  CURRENT_SAVE_VERSION,
  getOrCreatePersistentPlayerUid,
  migrateSaveData,
  SaveManager,
} from '../persistence/SaveManager';
import { Camera } from '../rendering/Camera';
import { AimedTargetInfo, GameRenderer } from '../rendering/GameRenderer';
import {
  ECOLOGICAL_ZONE_LABELS,
  TILE_SIZE,
  WorldManager,
} from '../world/WorldManager';

export interface HudSnapshot {
  metadata: WorldMetadata;
  player: PlayerState;
  currentBiome: BiomeType;
  currentZoneName: string;
  currentLandmarkName: string | null;
  nearbyStations: PlaceableType[];
  aimedTarget: AimedTargetInfo | null;
  nearbyWildAnimal: CreatureEntity | null;
  nearbyTamedAnimal: CreatureEntity | null;
  activeMount: CreatureEntity | null;
  tamedAnimals: CreatureEntity[];
  waypoints: MapWaypoint[];
  deathBags: DeathBag[];
  isPaused: boolean;
  canPause: boolean;
  isGameOver: boolean;
  lastSaveStatus: string;
  buildDemolishMode: boolean;
  buildOrientation: 'auto' | 'horizontal' | 'vertical';
  showHitboxPreview: boolean;
  innocentFireEnabled: boolean;
  onlineSession: OnlineSessionInfo;
  remotePlayers: RemotePlayerState[];
}

export class GameEngine {
  public world: WorldManager;
  public entities: EntityManager;
  public input: InputManager;
  public camera: Camera;
  public renderer: GameRenderer;
  public metadata: WorldMetadata;
  public player: PlayerState;
  public droppedItems: DroppedItem[] = [];
  public deathBags: DeathBag[] = [];
  public floatingTexts: FloatingText[] = [];
  public waypoints: MapWaypoint[] = [];
  public settings: GameSettings;
  public multiplayer: MultiplayerManager;
  public remotePlayersList: RemotePlayerState[] = [];

  public isPaused = false;
  private uiPauseRequested = false;
  private isPauseMenuOpen = false;
  private isMuffledOverlayOpen = false;
  public isGameOver = false;
  public lastSaveStatus = 'Salvo';
  public buildDemolishMode = false;
  public buildOrientation: 'auto' | 'horizontal' | 'vertical' = 'auto';
  public showHitboxPreview = false;
  public innocentFireEnabled = false;
  private preferredTargetCreatureId: string | null = null;
  private activeBreakingTargetId: string | null = null;

  private canvas: HTMLCanvasElement | null = null;
  private rafId: number | null = null;
  private lastTimestamp = 0;
  private globalTime = 0;
  private autoSaveTimer = 0;
  private uiUpdateTimer = 0;
  private netStateTimer = 0;
  private netCreaturesTimer = 0;
  private netTimeSyncTimer = 0;
  private isApplyingNetworkEvent = false;
  private totemZapTimer = 0;
  private spikeTrapTimer = 0;
  private campfireRestCooldown = 0;
  private hungerDamageTimer = 0;
  public activeStationStructureId: string | null = null;
  private fallbackThermalStations: Record<string, PlacedStructure> = {};
  private customTargetTile: { tx: number; ty: number } | null = null;
  // Multiplayer anti-duplication state locks
  private claimedDropIds = new Set<string>();
  private pendingDropClaimTimers = new Map<string, number>();
  private claimedDeathBagIds = new Set<string>();
  private pendingDeathBagClaims = new Set<string>();
  private claimedWorldActionKeys = new Map<string, number>();
  private pendingContainerWithdraws = new Set<string>();
  private stallCustomerSpawnTimer = 3.5;
  private onUiChange: ((snapshot: HudSnapshot) => void) | null = null;
  private onStationInteract: ((station: PlaceableType) => void) | null = null;
  private onNpcInteract: ((npc: CreatureEntity) => void) | null = null;
  private onChestInteract: ((chest: PlacedStructure) => void) | null = null;
  private onMarketStallInteract: ((stall: PlacedStructure) => void) | null =
    null;
  private onHostClosedRoom: ((reason: string) => void) | null = null;

  constructor(
    rawSaveData: WorldSaveData,
    settings: GameSettings,
    onUiChange?: (snapshot: HudSnapshot) => void,
    onStationInteract?: (station: PlaceableType) => void,
    onNpcInteract?: (npc: CreatureEntity) => void,
    onChestInteract?: (chest: PlacedStructure) => void,
    onMarketStallInteract?: (stall: PlacedStructure) => void,
    existingMultiplayer?: MultiplayerManager | null,
    onHostClosedRoom?: (reason: string) => void
  ) {
    const saveData = migrateSaveData(rawSaveData);
    this.metadata = { ...saveData.metadata };
    const isGuestSession = Boolean(
      existingMultiplayer && existingMultiplayer.role === 'GUEST'
    );

    if (isGuestSession) {
      let guestPlayer: PlayerState | null = null;
      let hasSavedPosition = false;
      try {
        const savedGuestRaw = localStorage.getItem(
          `wildborn_guest_player_${this.metadata.id}`
        );
        if (savedGuestRaw) {
          guestPlayer = JSON.parse(savedGuestRaw);
          if (
            guestPlayer &&
            typeof guestPlayer.x === 'number' &&
            Number.isFinite(guestPlayer.x) &&
            typeof guestPlayer.y === 'number' &&
            Number.isFinite(guestPlayer.y)
          ) {
            hasSavedPosition = true;
          }
        }
      } catch {
        guestPlayer = null;
      }
      if (!guestPlayer) {
        guestPlayer = createInitialPlayerState();
        guestPlayer.appearance.shirtColor = '#059669';
      }
      if (!hasSavedPosition) {
        guestPlayer.x = (saveData.player?.x ?? 16) + 24;
        guestPlayer.y = saveData.player?.y ?? 16;
      }
      this.player = guestPlayer;
    } else {
      this.player = JSON.parse(JSON.stringify(saveData.player));
    }

    if (!this.player.persistentPlayerId) {
      this.player.persistentPlayerId = getOrCreatePersistentPlayerUid();
    }

    this.player.goldCoins =
      typeof this.player.goldCoins === 'number' &&
      Number.isFinite(this.player.goldCoins)
        ? Math.max(0, Math.floor(this.player.goldCoins))
        : 0;
    if (Array.isArray(this.player.inventory)) {
      for (let i = 0; i < this.player.inventory.length; i++) {
        const slot = this.player.inventory[i];
        if (slot && slot.itemId === 'gold_coin') {
          if (slot.count > 0) {
            this.player.goldCoins += Math.floor(slot.count);
          }
          this.player.inventory[i] = null;
        }
      }
    }

    this.world = new WorldManager(
      this.metadata.seed,
      saveData.chunks,
      this.metadata.createdWorldGenVersion ?? this.metadata.worldGenVersion ?? 2
    );
    if (!this.player.swimSpeed || this.player.swimSpeed <= 0) {
      this.player.swimSpeed = 58;
    }
    this.player.isSwimming = this.world.isWorldPosInWater(
      this.player.x,
      this.player.y
    );
    // Ensure the player never spawns trapped inside a newly built structure or solid hitbox
    this.pushPlayerOutOfHitbox(0, true);
    this.entities = new EntityManager(saveData.creatures);
    this.droppedItems = saveData.droppedItems || [];
    this.deathBags = Array.isArray(saveData.deathBags) ? saveData.deathBags : [];
    this.waypoints = saveData.waypoints || [];
    this.settings = settings;
    this.onUiChange = onUiChange || null;
    this.onStationInteract = onStationInteract || null;
    this.onNpcInteract = onNpcInteract || null;
    this.onChestInteract = onChestInteract || null;
    this.onMarketStallInteract = onMarketStallInteract || null;
    this.onHostClosedRoom = onHostClosedRoom || null;

    this.multiplayer =
      existingMultiplayer ||
      new MultiplayerManager(
        settings.playerName || 'Aventureiro',
        settings.customServerUrl
      );
    this.bindMultiplayerCallbacks();

    // Restore any active mount integrated with the player's body from saved state
    this.restoreIntegratedPlayerMount();

    this.input = new InputManager();
    this.camera = new Camera();
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.camera.zoom = settings.cameraZoom || 1.15;
    this.renderer = new GameRenderer();

    if (this.player.bonusMaxHpFromItems === undefined) {
      const legacyExtra =
        (this.player.maxHp || 100) -
        this.getPlayerStatusMaxHp() -
        this.getTotalEquipmentMaxHpBonus();
      this.player.bonusMaxHpFromItems = Math.max(0, Math.round(legacyExtra));
    }
    this.recalculatePlayerMaxHp();

    soundManager.enabled = settings.soundEnabled;
    soundManager.volume = settings.soundVolume;
    soundManager.setMusicVolume(settings.musicVolume ?? 0.2);
    soundManager.setMusicPaused(this.isPauseMenuOpen || this.isGameOver);
    soundManager.setMusicMuffled(
      this.isMuffledOverlayOpen && !this.isPauseMenuOpen && !this.isGameOver
    );
    soundManager.updateAmbientMusic(
      this.metadata.timeOfDay >= 19.5 || this.metadata.timeOfDay < 5.5
    );

    const initialReveal = Math.max(
      10,
      Math.min(20, Math.round(13 / Math.max(0.55, this.camera.zoom)))
    );
    this.revealWorldAndPopulateIslands(
      this.player.x,
      this.player.y,
      initialReveal
    );
    if (!isGuestSession) {
      this.entities.spawnInitialAroundPlayer(
        this.world,
        this.player.x,
        this.player.y
      );
    }
  }

  // 1. INITIALIZE
  public initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.input.attach();
    this.lastTimestamp = performance.now();

    if (this.multiplayer.role !== 'GUEST' && !this.multiplayer.isOnline) {
      this.openOnlineInviteSession();
    } else if (this.multiplayer.role === 'GUEST') {
      this.remotePlayersList = Array.from(
        this.multiplayer.remotePlayers.values()
      );
      this.multiplayer.sendPlayerState(this.player);
    }

    this.emitUiSnapshot();
    this.loop(this.lastTimestamp);
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    soundManager.stopAmbientMusic();
    this.input.detach();
    this.multiplayer.disconnect(false);
  }

  /**
   * Returns true if the world currently has active network multiplayer players connected.
   * When playing solo (even with an invite code open waiting for guests), returns false so the game CAN be paused.
   * When playing as a Guest or as a Host with at least 1 connected Guest, returns true so the game CANNOT be paused.
   */
  public hasConnectedNetworkPlayers(): boolean {
    if (!this.multiplayer.isOnline) return false;
    if (this.multiplayer.role === 'GUEST') return true;
    if (this.multiplayer.remotePlayers.size > 0) return true;
    if (
      this.multiplayer.connectedPeers.some(
        (p) => p.peerId !== this.multiplayer.peerId
      )
    ) {
      return true;
    }
    return false;
  }

  /**
   * Requests or releases a real game pause from UI screens (Map, Inventory, Craft, Pause, Saddlebag, HUD Edit).
   * Automatically respects the multiplayer rule: never pauses when network players are connected.
   */
  public setAudioMenuState(
    isPauseMenu: boolean,
    isMuffledOverlay: boolean
  ): void {
    this.isPauseMenuOpen = Boolean(isPauseMenu);
    this.isMuffledOverlayOpen = Boolean(isMuffledOverlay);
    soundManager.setMusicPaused(this.isPauseMenuOpen || this.isGameOver);
    soundManager.setMusicMuffled(
      this.isMuffledOverlayOpen && !this.isPauseMenuOpen && !this.isGameOver
    );
  }

  public setUiPauseRequested(requested: boolean): void {
    this.uiPauseRequested = Boolean(requested);
    this.syncPauseState();
  }

  public syncPauseState(): void {
    const canPauseNow = !this.hasConnectedNetworkPlayers();
    const shouldPause = this.uiPauseRequested && canPauseNow;
    if (this.isPaused !== shouldPause) {
      this.isPaused = shouldPause;
      this.lastTimestamp = performance.now();
      if (shouldPause) {
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.isMoving = false;
      }
      soundManager.setMusicPaused(this.isPauseMenuOpen || this.isGameOver);
      soundManager.setMusicMuffled(
        this.isMuffledOverlayOpen && !this.isPauseMenuOpen && !this.isGameOver
      );
      this.emitUiSnapshot();
    }
  }

  private loop = (timestamp: number): void => {
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const dt = Math.min(0.1, Math.max(0.001, rawDt));

    this.syncPauseState();
    soundManager.setMusicPaused(this.isPauseMenuOpen || this.isGameOver);
    soundManager.setMusicMuffled(
      this.isMuffledOverlayOpen && !this.isPauseMenuOpen && !this.isGameOver
    );

    if (!this.isPaused && !this.isGameOver) {
      this.update(dt);
    } else if (this.isPaused && !this.isGameOver) {
      // Keep Campfire & Furnace thermal stations smelting/cooking AND Market Stall NPC visitors shopping in real time while the player watches the station/stall HUD!
      this.globalTime += dt;
      if (this.campfireRestCooldown > 0) {
        this.campfireRestCooldown = Math.max(0, this.campfireRestCooldown - dt);
      }
      this.updateThermalStations(dt);
      this.updatePausedMarketStallVisitors(dt);
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        this.floatingTexts[i].timer -= dt;
        if (this.floatingTexts[i].timer <= 0) {
          this.floatingTexts.splice(i, 1);
        }
      }
      this.uiUpdateTimer += dt;
      if (this.uiUpdateTimer >= 0.12) {
        this.uiUpdateTimer = 0;
        this.emitUiSnapshot();
      }
      if (this.multiplayer.isOnline) {
        this.updateMultiplayerSync(dt);
      }
    }
    this.render();

    this.rafId = requestAnimationFrame(this.loop);
  };

  // 2. UPDATE
  public update(dt: number): void {
    this.globalTime += dt;
    if (this.campfireRestCooldown > 0) {
      this.campfireRestCooldown = Math.max(0, this.campfireRestCooldown - dt);
    }

    // Advance Day & Night cycle
    this.metadata.timeOfDay += dt * 0.1;
    if (this.metadata.timeOfDay >= 24) {
      this.metadata.timeOfDay -= 24;
      this.metadata.dayCount += 1;
      for (const cr of this.entities.creatures) {
        if (
          cr.kind === CreatureKind.VILLAGER ||
          cr.kind === CreatureKind.WANDERER
        ) {
          cr.stallInspectionsToday = {};
          if (cr.kind === CreatureKind.WANDERER) {
            cr.hasBoughtToday = false;
            cr.attractedStallId = undefined;
          }
        }
      }
      this.addFloatingText(
        `Dia ${this.metadata.dayCount}`,
        this.player.x,
        this.player.y - 24,
        '#fde047'
      );
    }

    const isNight = this.metadata.timeOfDay >= 20 || this.metadata.timeOfDay < 5.5;
    const isNightMusic =
      this.metadata.timeOfDay >= 19.5 || this.metadata.timeOfDay < 5.5;
    soundManager.updateAmbientMusic(isNightMusic);

    // Hotbar number keys 1..8
    if (this.input.hotbarKeyPressed !== null) {
      this.selectHotbarSlot(this.input.hotbarKeyPressed);
      this.input.hotbarKeyPressed = null;
    }

    // Update Player movement & animations
    this.updatePlayer(dt);
    this.updateFishing(dt);

    // Update Camera
    this.camera.zoom = this.settings.cameraZoom;
    this.camera.follow(this.player.x, this.player.y, dt);

    // Update Creatures & Combat AI (Host/Offline simulates full AI; Guest interpolates synced state)
    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
      this.updateGuestCreatures(dt);
    } else {
      this.updateCreatures(dt);
      this.entities.updateSpawning(
        dt,
        this.world,
        this.player.x,
        this.player.y,
        isNight
      );
    }

    // Update Remote Players interpolation & multiplayer network packets
    this.updateMultiplayerSync(dt);

    // Update Dropped Items & Pickup
    this.updateDroppedItems(dt);

    // Update Nature Node & Structure hit flashes + Guardian Totem aura
    this.updateWorldObjects(dt);

    // Update Floating Texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      this.floatingTexts[i].timer -= dt;
      if (this.floatingTexts[i].timer <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Check Keyboard Action triggers
    if (this.input.actionPressed) {
      this.input.actionPressed = false;
      this.performAttackOrHarvestAction();
    }
    if (this.input.interactPressed) {
      this.input.interactPressed = false;
      this.performInteractAction();
    }
    if (this.input.placeOrUsePressed) {
      this.input.placeOrUsePressed = false;
      this.performUseOrPlaceHeldItemAction();
    }

    // Auto-save timer
    this.autoSaveTimer += dt;
    if (this.autoSaveTimer >= Math.max(10, this.settings.autoSaveIntervalSec)) {
      this.autoSaveTimer = 0;
      this.saveGame(true);
    }

    // Periodic UI HUD sync
    this.uiUpdateTimer += dt;
    if (this.uiUpdateTimer >= 0.16) {
      this.uiUpdateTimer = 0;
      this.emitUiSnapshot();
    }
  }

  // 3. RENDER
  public render(): void {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const targetTile = this.getTargetTileForPlacement();
    const aimedTarget = this.getAimedTarget();
    this.renderer.render(
      ctx,
      this.camera,
      this.world,
      this.player,
      this.entities.creatures,
      this.droppedItems,
      this.floatingTexts,
      this.metadata.timeOfDay,
      this.globalTime,
      targetTile,
      aimedTarget,
      {
        demolishMode: this.buildDemolishMode,
        orientation: this.buildOrientation,
        showHitboxPreview: this.showHitboxPreview,
      },
      this.remotePlayersList,
      this.deathBags
    );
  }

  private updatePlayer(dt: number): void {
    if (this.player.strengthBuffTimer && this.player.strengthBuffTimer > 0) {
      this.player.strengthBuffTimer = Math.max(0, this.player.strengthBuffTimer - dt);
    }
    if (this.player.speedBuffTimer && this.player.speedBuffTimer > 0) {
      this.player.speedBuffTimer = Math.max(0, this.player.speedBuffTimer - dt);
    }

    const move = this.input.getMoveVector();
    const hasCamelBuff = this.entities.creatures.some(
      (c) =>
        c.tamed &&
        c.kind === CreatureKind.CAMEL &&
        this.isCreatureOwnedByLocalPlayer(c) &&
        Math.hypot(c.x - this.player.x, c.y - this.player.y) < 180
    );

    // Check active mount (Saddled Horse, Saddled Camel, or Boat) — integrated with the player's body
    let activeMount = this.getActiveMount();
    if (this.player.mountedEntityId && !activeMount) {
      activeMount = this.restoreIntegratedPlayerMount();
      if (!activeMount) {
        this.player.mountedEntityId = null;
        this.player.mountedCreatureData = null;
        this.player.isGalloping = false;
      }
    }

    // Regenerate stamina for all unmounted or idle saddled horses & camels
    for (const cr of this.entities.creatures) {
      if (
        (cr.kind === CreatureKind.HORSE || cr.kind === CreatureKind.CAMEL) &&
        cr.tamed
      ) {
        const maxStam =
          cr.mountMaxStamina || (cr.kind === CreatureKind.CAMEL ? 165 : 100);
        cr.mountMaxStamina = maxStam;
        if (cr.mountStamina === undefined) cr.mountStamina = maxStam;
        if (!activeMount || activeMount.id !== cr.id) {
          cr.mountStamina = Math.min(maxStam, cr.mountStamina + dt * 16);
        }
      }
    }

    const pTile = this.world.worldToTile(this.player.x, this.player.y);
    const inWater = this.world.isTileSwimmableWater(pTile.tx, pTile.ty);
    const isBoatMount = activeMount?.kind === CreatureKind.BOAT;
    this.player.isSwimming = isBoatMount ? false : inWater;

    const groundStruct =
      this.world.getGroundStructureAtTile(pTile.tx, pTile.ty) ||
      this.world.getStructureAtTile(pTile.tx, pTile.ty);
    const floorMult = groundStruct
      ? CONSTRUCTION_BLUEPRINTS[groundStruct.type]?.speedMultiplier || 1.0
      : 1.0;

    const speedBuffMult =
      this.player.speedBuffTimer && this.player.speedBuffTimer > 0 ? 1.3 : 1.0;

    const agilityMult =
      1 + Math.max(0, this.player.attributes.agility || 0) * 0.06;
    const equipSpeedMult = 1 + this.getTotalEquipmentSpeedBonus();
    const camelMult = hasCamelBuff ? 1.18 : 1.0;

    const heldSlotForSpeed =
      this.player.inventory[this.player.selectedHotbarIndex];
    const heldItemForSpeed = heldSlotForSpeed
      ? ITEMS[heldSlotForSpeed.itemId]
      : null;
    let coastalMult = 1.0;
    if (
      heldItemForSpeed?.coastalSpeedBonus &&
      heldItemForSpeed.coastalSpeedBonus > 0
    ) {
      const tileBiome = this.world.getTileBiomeFast(pTile.tx, pTile.ty);
      const isCoastalOrWater =
        inWater ||
        tileBiome === BiomeType.ISLAND ||
        this.world.getEcologicalZoneAtWorld(this.player.x, this.player.y) ===
          EcologicalZone.COASTAL_TROPICS ||
        this.world.isTileNearWater(pTile.tx, pTile.ty, 3);
      if (isCoastalOrWater) {
        coastalMult = 1 + heldItemForSpeed.coastalSpeedBonus;
      }
    }

    const playerSwimSpeed =
      (this.player.swimSpeed || 58) *
      agilityMult *
      equipSpeedMult *
      coastalMult *
      speedBuffMult;
    const normalLandSpeed =
      96 *
      agilityMult *
      equipSpeedMult *
      camelMult *
      floorMult *
      coastalMult *
      speedBuffMult;

    let baseSpeed = inWater ? playerSwimSpeed : normalLandSpeed;
    const isInputMoving = Math.hypot(move.x, move.y) > 0.05;

    if (activeMount) {
      if (isBoatMount) {
        // Boat is fast on water (152 px/s) and never suffers water current drift
        baseSpeed = (activeMount.mountSpeed || 152) * speedBuffMult;
        this.player.isGalloping = false;
      } else {
        // Saddled Horse or Camel: uses its specific individual mountSpeed
        const mountBaseSpeed =
          activeMount.mountSpeed ||
          (activeMount.kind === CreatureKind.CAMEL ? 142 : 150);
        const maxStam =
          activeMount.mountMaxStamina ||
          (activeMount.kind === CreatureKind.CAMEL ? 165 : 100);
        activeMount.mountMaxStamina = maxStam;
        if (activeMount.mountStamina === undefined) {
          activeMount.mountStamina = maxStam;
        }

        if (this.player.isGalloping && isInputMoving && !inWater) {
          if (activeMount.mountStamina > 1) {
            activeMount.mountStamina = Math.max(
              0,
              activeMount.mountStamina - dt * 24
            );
            if (activeMount.mountStamina <= 0.5) {
              this.player.isGalloping = false;
            }
          } else {
            this.player.isGalloping = false;
          }
        } else {
          const regen = isInputMoving ? 14 : 22;
          activeMount.mountStamina = Math.min(
            maxStam,
            activeMount.mountStamina + dt * regen
          );
        }

        const gallopMult =
          this.player.isGalloping && isInputMoving && !inWater ? 1.42 : 1.0;
        baseSpeed = inWater
          ? (activeMount.swimSpeed || 34) * speedBuffMult
          : mountBaseSpeed * gallopMult * floorMult * speedBuffMult;
      }
    } else {
      this.player.isGalloping = false;
    }

    // Boats ignore water current completely!
    const waterCurrent =
      inWater && !isBoatMount
        ? this.world.getWaterCurrentAtWorld(
            this.player.x,
            this.player.y,
            this.globalTime
          )
        : { vx: 0, vy: 0, kind: 'none' as const };

    // If the local player is a 2nd-seat passenger on a Boat driven by another online player, follow the boat
    const isLocalPassenger =
      activeMount?.passengerPlayerId === 'LOCAL' ||
      activeMount?.passengerPlayerId === this.multiplayer.peerId;
    const isLocalPrimaryRider =
      activeMount?.riderPlayerId === 'LOCAL' ||
      activeMount?.riderPlayerId === this.multiplayer.peerId;
    const isBoatPassengerOnly =
      isBoatMount &&
      isLocalPassenger &&
      Boolean(activeMount!.riderPlayerId) &&
      !isLocalPrimaryRider;

    if (isBoatPassengerOnly && activeMount) {
      this.player.x = activeMount.x;
      this.player.y = activeMount.y;
      this.player.vx = activeMount.vx;
      this.player.vy = activeMount.vy;
      this.player.direction = activeMount.direction;
      this.player.isMoving = Math.hypot(activeMount.vx, activeMount.vy) > 2;
      if (activeMount.passengerPetId) {
        const pet = this.entities.creatures.find(
          (c) => c.id === activeMount.passengerPetId
        );
        if (pet) {
          pet.x = activeMount.x;
          pet.y = activeMount.y;
          pet.vx = 0;
          pet.vy = 0;
        }
      }
    } else {
      this.player.vx = move.x * baseSpeed + waterCurrent.vx;
      this.player.vy = move.y * baseSpeed + waterCurrent.vy;
      this.player.isMoving = isInputMoving;

      // If the player is overlapping any solid hitbox (e.g. structure built on last location, closed door, etc.), push out smoothly
      if (!isBoatMount && !this.canEntityOccupy(this.player.x, this.player.y)) {
        this.pushPlayerOutOfHitbox(dt, false);
      }

      if (this.player.isMoving) {
        this.player.direction = EntityManager.vectorToDirection(
          move.x,
          move.y,
          this.player.direction
        );
        this.customTargetTile = null;
        this.player.animTimer += dt;
        const animInterval = inWater && !isBoatMount ? 0.19 : this.player.isGalloping ? 0.09 : 0.14;
        if (this.player.animTimer >= animInterval) {
          this.player.animTimer = 0;
          this.player.animFrame = (this.player.animFrame + 1) % 4;
        }

        const nextX = this.player.x + this.player.vx * dt;
        const nextY = this.player.y + this.player.vy * dt;

        const canMoveTo = (wx: number, wy: number): boolean => {
          if (isBoatMount) {
            const t = this.world.worldToTile(wx, wy);
            return (
              this.world.isTileSwimmableWater(t.tx, t.ty) &&
              this.world.canEntityOccupyWorldCircle(wx, wy, 6.2, true)
            );
          }
          return this.canEntityOccupy(wx, wy);
        };

        if (canMoveTo(nextX, this.player.y)) {
          this.player.x = nextX;
        }
        if (canMoveTo(this.player.x, nextY)) {
          this.player.y = nextY;
        }

        const revealRad = Math.max(
          10,
          Math.min(20, Math.round(13 / Math.max(0.55, this.camera.zoom)))
        );
        this.revealWorldAndPopulateIslands(
          this.player.x,
          this.player.y,
          revealRad
        );
      } else {
        this.player.animFrame = 0;
        // Passive drift when floating in a river current or ocean coastal surf (never when in a Boat!)
        if (inWater && !isBoatMount && waterCurrent.kind !== 'none') {
          const nextX = this.player.x + waterCurrent.vx * dt;
          const nextY = this.player.y + waterCurrent.vy * dt;
          if (this.canEntityOccupy(nextX, this.player.y)) {
            this.player.x = nextX;
          }
          if (this.canEntityOccupy(this.player.x, nextY)) {
            this.player.y = nextY;
          }
          const revealRad = Math.max(
            10,
            Math.min(20, Math.round(13 / Math.max(0.55, this.camera.zoom)))
          );
          this.revealWorldAndPopulateIslands(
            this.player.x,
            this.player.y,
            revealRad
          );
        }
      }

      // Sync activeMount position, direction, and animation with the rider
      if (activeMount) {
        activeMount.x = this.player.x;
        activeMount.y = this.player.y;
        activeMount.vx = this.player.vx;
        activeMount.vy = this.player.vy;
        activeMount.direction = this.player.direction;
        activeMount.isSwimming = isBoatMount ? true : inWater;
        if (this.player.isMoving) {
          activeMount.animTimer += dt;
          const mStep = this.player.isGalloping ? 0.08 : 0.13;
          if (activeMount.animTimer >= mStep) {
            activeMount.animTimer = 0;
            activeMount.animFrame = (activeMount.animFrame + 1) % 4;
          }
        } else {
          activeMount.animFrame = 0;
        }
        // Keep any pet seated in the 2nd seat of the Boat synced with the Boat
        if (isBoatMount && activeMount.passengerPetId) {
          const pet = this.entities.creatures.find(
            (c) => c.id === activeMount.passengerPetId
          );
          if (pet) {
            pet.x = activeMount.x;
            pet.y = activeMount.y;
            pet.vx = 0;
            pet.vy = 0;
            pet.direction = activeMount.direction;
            pet.isSwimming = false;
          } else {
            activeMount.passengerPetId = null;
          }
        }
      }
    }

    // Keep player.mountedCreatureData continuously synchronized with activeMount (integrated with player body)
    this.syncPlayerMountedCreatureData();

    // Secondary post-movement check to guarantee the character never stays stuck inside a hitbox
    if (!isBoatMount && !this.canEntityOccupy(this.player.x, this.player.y)) {
      this.pushPlayerOutOfHitbox(dt, false);
    }

    if (this.player.swingTimer > 0) {
      this.player.swingTimer = Math.max(0, this.player.swingTimer - dt);
    }
    if (this.player.hitFlashTimer > 0) {
      this.player.hitFlashTimer = Math.max(0, this.player.hitFlashTimer - dt);
    }

    const survivalFactor = Math.max(
      0.4,
      1 - Math.max(0, this.player.attributes.survival || 0) * 0.08
    );
    const diffMult =
      this.metadata.difficulty === 'hardcore'
        ? 1.35
        : this.metadata.difficulty === 'survival'
        ? 1.15
        : 0.85;

    this.player.hunger = Math.max(
      0,
      this.player.hunger - dt * 0.32 * survivalFactor * diffMult
    );

    if (this.player.hunger > 20) {
      this.player.stamina = Math.min(
        this.player.maxStamina,
        this.player.stamina + dt * (hasCamelBuff ? 14 : 9)
      );
    }

    const nearWarmth = this.isPlayerNearStructure([
      PlaceableType.CAMPFIRE,
      PlaceableType.GUARDIAN_TOTEM,
    ]);
    const nearFountain = this.isPlayerNearStructure([
      PlaceableType.HEALING_FOUNTAIN,
    ]);
    const nearSheep = this.entities.creatures.some(
      (c) =>
        c.tamed &&
        c.kind === CreatureKind.SHEEP &&
        this.isCreatureOwnedByLocalPlayer(c) &&
        Math.hypot(c.x - this.player.x, c.y - this.player.y) < 150
    );

    if (nearFountain) {
      for (const pet of this.entities.creatures) {
        if (pet.tamed && pet.hp < pet.maxHp) {
          pet.hp = Math.min(pet.maxHp, pet.hp + dt * 6);
        }
      }
    }

    if (this.player.hunger > 65 || nearWarmth || nearFountain || nearSheep) {
      this.hungerDamageTimer = 0;
      const regenRate =
        (nearWarmth ? 2.5 : 0.6) +
        (nearFountain ? 5.0 : 0) +
        (nearSheep ? 1.0 : 0);
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + dt * regenRate);
    } else if (this.player.hunger <= 0) {
      // Hunger drains HP down to 10% of the character's pure status Max HP (ignoring any item or armor effects)
      const minStarveHp = Math.ceil(this.getPlayerStatusMaxHp() * 0.1);
      if (this.player.hp > minStarveHp) {
        this.hungerDamageTimer += dt;
        if (this.hungerDamageTimer >= 3.0) {
          this.hungerDamageTimer -= 3.0;
          const prevHp = this.player.hp;
          this.player.hp = Math.max(minStarveHp, this.player.hp - 5);
          const lost = Math.max(1, Math.round(prevHp - this.player.hp));
          this.player.hitFlashTimer = 0.25;
          soundManager.playPlayerHurt();
          this.renderer.spawnBurst(this.player.x, this.player.y, 'BLOOD', 7);
          this.renderer.spawnRipple(this.player.x, this.player.y, '#f87171', 18, 0.3);
          this.addFloatingText(
            `-${lost} HP (Fome)`,
            this.player.x,
            this.player.y - 20,
            '#ef4444'
          );
          this.emitUiSnapshot();
        }
      } else {
        this.hungerDamageTimer = 0;
      }
    } else {
      this.hungerDamageTimer = 0;
    }
  }

  private canEntityOccupy(wx: number, wy: number): boolean {
    return this.world.canEntityOccupyWorldCircle(wx, wy, 6.2);
  }

  /**
   * Pushes the player character out of any solid hitbox if they are ever inside one
   * (e.g., spawning at a previous location where the host built structures, having a block
   * placed on top of them, or any collision overlap).
   */
  private pushPlayerOutOfHitbox(dt: number, immediate = false): void {
    if (this.canEntityOccupy(this.player.x, this.player.y)) {
      return;
    }

    const safePos = this.world.findNearestSafePosition(
      this.player.x,
      this.player.y,
      6.2
    );
    const dx = safePos.x - this.player.x;
    const dy = safePos.y - this.player.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.01) return;

    if (immediate || dist <= 3.5 || dt <= 0) {
      this.player.x = safePos.x;
      this.player.y = safePos.y;
    } else {
      const pushSpeed = 260; // Smooth, responsive push-out velocity (px/s)
      const step = Math.min(dist, Math.max(3.5, pushSpeed * dt));
      this.player.x += (dx / dist) * step;
      this.player.y += (dy / dist) * step;
    }

    const revealRad = Math.max(
      10,
      Math.min(20, Math.round(13 / Math.max(0.55, this.camera?.zoom || 1.15)))
    );
    this.revealWorldAndPopulateIslands(
      this.player.x,
      this.player.y,
      revealRad
    );
  }

  /**
   * Reveals fog-of-war around `(wx, wy)` and triggers one-time discovery creature spawning
   * (+30% spawn chance) for any newly discovered Island (`BiomeType.ISLAND`) chunks.
   */
  private revealWorldAndPopulateIslands(
    wx: number,
    wy: number,
    radiusTiles: number
  ): void {
    const newlyDiscoveredIslandChunks = this.world.revealAround(
      wx,
      wy,
      radiusTiles
    );
    if (
      newlyDiscoveredIslandChunks.length > 0 &&
      (!this.multiplayer?.isOnline || this.multiplayer.role !== 'GUEST')
    ) {
      const isNight =
        this.metadata.timeOfDay >= 20 || this.metadata.timeOfDay < 5.5;
      for (const islandChunk of newlyDiscoveredIslandChunks) {
        this.entities.spawnIslandDiscoveryCreatures(
          this.world,
          islandChunk,
          isNight
        );
      }
      if (this.multiplayer?.isOnline && this.multiplayer.role === 'HOST') {
        this.multiplayer.sendCreaturesSync(this.entities.creatures);
      }
    }
  }

  /**
   * Returns true if the given structure is a Rest Point ("Ponto de Descanso"):
   * - Bed (`PlaceableType.BED`)
   * - Explorer Tent (`PlaceableType.EXPLORER_TENT`)
   * - Legacy Village House (`PlaceableType.VILLAGE_HOUSE`)
   */
  public isRestPointStructure(st: PlacedStructure): boolean {
    return (
      st.type === PlaceableType.BED ||
      st.type === PlaceableType.EXPLORER_TENT ||
      st.type === PlaceableType.VILLAGE_HOUSE
    );
  }

  /**
   * Checks whether a placed structure counts as a valid House/Dwelling or Rest Point.
   * Supports:
   * - Beds (`PlaceableType.BED`), Explorer Tents (`PlaceableType.EXPLORER_TENT`), and Legacy Village Houses (`PlaceableType.VILLAGE_HOUSE`)
   * - Walled houses (a Wood Door or Iron Gate connected to adjacent walls/windows)
   */
  public isStructureValidHouse(st: PlacedStructure): boolean {
    if (this.isRestPointStructure(st)) {
      return true;
    }
    if (
      st.type === PlaceableType.WOOD_DOOR ||
      st.type === PlaceableType.IRON_GATE
    ) {
      const mask = this.world.getStructureConnectionMask(
        st.tileX,
        st.tileY,
        st.type
      );
      return mask !== 0;
    }
    return false;
  }

  /**
   * Evaluates the Enclosed Structure Ownership ("Dono de Estrutura com Contorno Fechado e Telhado")
   * for any tile `(tx, ty)` belonging to an enclosed roofed building:
   * - An enclosed structure ONLY has an owner if a rest point is positioned inside it (`building.interiorSet`).
   * - If there is more than one rest point inside, the owner is whoever was defined as owner first (`isPrimaryStructureOwner` / earliest `ownerAssignedAt`).
   * - If the structure owner dies or their rest point is broken, the structure becomes UNOWNED (`ownerType: null`),
   *   even if there is another rest point inside that has an owner (`structureOwnerClearedAfterLoss = true`),
   *   and a new owner is ONLY defined when someone subsequently takes ownership ("tomar posse") of a rest point inside the structure!
   */
  public getEnclosedBuildingOwnerInfo(
    tx: number,
    ty: number
  ): {
    interiorRestPoints: PlacedStructure[];
    primaryRestPoint: PlacedStructure | null;
    ownerType: 'PLAYER' | 'VILLAGER' | null;
    ownerId?: string;
    ownerName?: string;
    villageId?: string;
    clearedAfterLoss: boolean;
  } | null {
    const building = this.renderer.getBuildingAtTile(this.world, tx, ty);
    if (!building) return null;

    const minCx = Math.floor(building.minTx / 16);
    const maxCx = Math.floor(building.maxTx / 16);
    const minCy = Math.floor(building.minTy / 16);
    const maxCy = Math.floor(building.maxTy / 16);

    const interiorRestPoints: PlacedStructure[] = [];
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
        if (!chunk) continue;
        for (const st of chunk.structures) {
          if (!this.isRestPointStructure(st)) continue;
          if (building.interiorSet.has(`${st.tileX},${st.tileY}`)) {
            interiorRestPoints.push(st);
          }
        }
      }
    }

    if (interiorRestPoints.length === 0) {
      return {
        interiorRestPoints: [],
        primaryRestPoint: null,
        ownerType: null,
        clearedAfterLoss: false,
      };
    }

    const isRestPointOwnerAlive = (rp: PlacedStructure): boolean => {
      if (!rp.ownerType) return false;
      if (rp.ownerType === 'PLAYER') return true;
      // Villager owner is valid if the villager is alive OR if the chunk hasn't spawned landmark mobs yet
      if (this.getHouseResidents(rp.id).length > 0) return true;
      if (
        rp.ownerId &&
        this.entities.creatures.some(
          (c) => c.id === rp.ownerId && c.hp > 0
        )
      ) {
        return true;
      }
      const { cx, cy } = this.world.tileToChunk(rp.tileX, rp.tileY);
      const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
      if (chunk && !chunk.mobsPopulated && rp.villageId) {
        return true;
      }
      return false;
    };

    // 1. Check if there is an active primary rest point (`isPrimaryStructureOwner === true`)
    let primary =
      interiorRestPoints.find((rp) => rp.isPrimaryStructureOwner) || null;

    if (primary) {
      if (!isRestPointOwnerAlive(primary)) {
        // The primary owner died! Clear structure ownership so the structure becomes unowned even if another bed inside has an owner.
        this.clearEnclosedBuildingOwnershipOnLoss(tx, ty, primary.id);
        return {
          interiorRestPoints,
          primaryRestPoint: null,
          ownerType: null,
          clearedAfterLoss: true,
        };
      }
      return {
        interiorRestPoints,
        primaryRestPoint: primary,
        ownerType: primary.ownerType || null,
        ownerId: primary.ownerId,
        ownerName: primary.ownerName,
        villageId: primary.villageId,
        clearedAfterLoss: false,
      };
    }

    // 2. If any rest point inside is marked `structureOwnerClearedAfterLoss`, the structure stays UNOWNED until someone claims a rest point inside!
    const clearedAfterLoss = interiorRestPoints.some(
      (rp) => rp.structureOwnerClearedAfterLoss
    );
    if (clearedAfterLoss) {
      return {
        interiorRestPoints,
        primaryRestPoint: null,
        ownerType: null,
        clearedAfterLoss: true,
      };
    }

    // 3. Otherwise (e.g., player just finished closing walls around existing rest point(s)),
    // pick the rest point whose owner was defined first (`ownerAssignedAt`).
    const validOwned = interiorRestPoints
      .filter((rp) => isRestPointOwnerAlive(rp))
      .sort(
        (a, b) =>
          (a.ownerAssignedAt ?? Number.MAX_SAFE_INTEGER) -
          (b.ownerAssignedAt ?? Number.MAX_SAFE_INTEGER)
      );

    if (validOwned.length > 0) {
      primary = validOwned[0];
      primary.isPrimaryStructureOwner = true;
      return {
        interiorRestPoints,
        primaryRestPoint: primary,
        ownerType: primary.ownerType || null,
        ownerId: primary.ownerId,
        ownerName: primary.ownerName,
        villageId: primary.villageId,
        clearedAfterLoss: false,
      };
    }

    return {
      interiorRestPoints,
      primaryRestPoint: null,
      ownerType: null,
      clearedAfterLoss: false,
    };
  }

  /**
   * Clears the ownership of an enclosed roofed structure when its primary owner dies or its primary rest point is broken.
   * Ensures the structure remains UNOWNED (`sem dono`) even if another rest point with an owner exists inside,
   * until someone takes ownership ("tomar posse") of a rest point inside the structure.
   */
  public clearEnclosedBuildingOwnershipOnLoss(
    tx: number,
    ty: number,
    lostRestPointId?: string
  ): void {
    const building = this.renderer.getBuildingAtTile(this.world, tx, ty);
    if (!building) return;

    const minCx = Math.floor(building.minTx / 16);
    const maxCx = Math.floor(building.maxTx / 16);
    const minCy = Math.floor(building.minTy / 16);
    const maxCy = Math.floor(building.maxTy / 16);

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
        if (!chunk) continue;
        for (const st of chunk.structures) {
          const key = `${st.tileX},${st.tileY}`;
          if (!building.footprintSet.has(key)) continue;

          if (this.isRestPointStructure(st)) {
            st.isPrimaryStructureOwner = false;
            st.structureOwnerClearedAfterLoss = true;
            if (lostRestPointId && st.id === lostRestPointId) {
              st.ownerType = undefined;
              st.ownerId = undefined;
              st.ownerName = undefined;
            }
          } else if (
            st.type === PlaceableType.WOOD_WALL ||
            st.type === PlaceableType.STONE_WALL ||
            st.type === PlaceableType.WOOD_WINDOW ||
            st.type === PlaceableType.STONE_WINDOW ||
            st.type === PlaceableType.WOOD_DOOR ||
            st.type === PlaceableType.IRON_GATE
          ) {
            st.ownerType = undefined;
            st.ownerId = undefined;
            st.ownerName = undefined;
          }
        }
      }
    }
  }

  /**
   * Called when someone takes ownership ("tomar posse") of a rest point `restPointSt` (or places a new owned rest point).
   * If the enclosing structure currently has NO owner, `restPointSt` becomes the primary structure owner (`isPrimaryStructureOwner = true`)
   * and defines the owner of the entire enclosed structure!
   */
  public assignEnclosedBuildingPrimaryOwner(restPointSt: PlacedStructure): void {
    if (!this.isRestPointStructure(restPointSt) || !restPointSt.ownerType) {
      return;
    }
    if (!restPointSt.ownerAssignedAt) {
      restPointSt.ownerAssignedAt = Date.now();
    }

    const building = this.renderer.getBuildingAtTile(
      this.world,
      restPointSt.tileX,
      restPointSt.tileY
    );
    if (!building) {
      restPointSt.isPrimaryStructureOwner = true;
      restPointSt.structureOwnerClearedAfterLoss = false;
      return;
    }

    const minCx = Math.floor(building.minTx / 16);
    const maxCx = Math.floor(building.maxTx / 16);
    const minCy = Math.floor(building.minTy / 16);
    const maxCy = Math.floor(building.maxTy / 16);

    // Check if another rest point inside this building is ALREADY the valid primary owner
    let existingPrimary: PlacedStructure | null = null;
    for (let cy = minCy; cy <= maxCy && !existingPrimary; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
        if (!chunk) continue;
        for (const st of chunk.structures) {
          if (
            st.id !== restPointSt.id &&
            this.isRestPointStructure(st) &&
            building.interiorSet.has(`${st.tileX},${st.tileY}`) &&
            st.isPrimaryStructureOwner &&
            st.ownerType
          ) {
            existingPrimary = st;
            break;
          }
        }
        if (existingPrimary) break;
      }
    }

    if (existingPrimary) {
      // Structure already has a primary owner defined first; keep it!
      restPointSt.structureOwnerClearedAfterLoss = false;
      return;
    }

    // Otherwise, this rest point becomes the new primary owner of the enclosed structure!
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
        if (!chunk) continue;
        for (const st of chunk.structures) {
          const key = `${st.tileX},${st.tileY}`;
          if (!building.footprintSet.has(key)) continue;

          if (this.isRestPointStructure(st)) {
            st.isPrimaryStructureOwner = st.id === restPointSt.id;
            st.structureOwnerClearedAfterLoss = false;
          } else if (
            st.type === PlaceableType.WOOD_WALL ||
            st.type === PlaceableType.STONE_WALL ||
            st.type === PlaceableType.WOOD_WINDOW ||
            st.type === PlaceableType.STONE_WINDOW ||
            st.type === PlaceableType.WOOD_DOOR ||
            st.type === PlaceableType.IRON_GATE
          ) {
            st.ownerType = restPointSt.ownerType;
            st.ownerId = restPointSt.ownerId;
            st.ownerName = restPointSt.ownerName;
            st.villageId = restPointSt.villageId;
          }
        }
      }
    }
  }

  /**
   * Returns all villagers currently sleeping (`isInsideHouse`) inside any rest point of the enclosed building at `(tx, ty)`,
   * or bound directly to `st.id`.
   */
  public getStructureSleepingResidents(
    st: PlacedStructure,
    precomputedInfo?: ReturnType<GameEngine['getEnclosedBuildingOwnerInfo']>
  ): CreatureEntity[] {
    const buildingInfo =
      precomputedInfo !== undefined
        ? precomputedInfo
        : this.getEnclosedBuildingOwnerInfo(st.tileX, st.tileY);
    if (buildingInfo && buildingInfo.interiorRestPoints.length > 0) {
      const result: CreatureEntity[] = [];
      for (const rp of buildingInfo.interiorRestPoints) {
        for (const r of this.getHouseResidents(rp.id)) {
          if (r.isInsideHouse && !result.some((existing) => existing.id === r.id)) {
            result.push(r);
          }
        }
      }
      return result;
    }
    return this.getHouseResidents(st.id).filter((r) => r.isInsideHouse);
  }

  /**
   * Returns true if the house/rest point is owned by a player.
   * NPCs (Villagers and Wanderers) are strictly forbidden from invading, claiming, or sleeping in player-owned houses!
   */
  public isHouseOwnedByPlayer(st: PlacedStructure): boolean {
    if (st.ownerType === 'PLAYER') return true;
    const buildingInfo = this.getEnclosedBuildingOwnerInfo(st.tileX, st.tileY);
    return buildingInfo?.ownerType === 'PLAYER';
  }

  /**
   * Returns true if an NPC (Villager or Wanderer) is allowed to occupy or sleep in this rest point / bed.
   * NPCs can ONLY occupy village beds/houses that are not owned by a player.
   */
  public canNpcOccupyHouse(st: PlacedStructure): boolean {
    if (!this.isRestPointStructure(st)) return false;
    if (st.ownerType === 'PLAYER') return false;
    // Only village beds/houses with a villageId or VILLAGER ownerType can be used by NPCs
    if (!st.villageId && st.ownerType !== 'VILLAGER') return false;
    return true;
  }

  /**
   * Returns true if a rest point (or a rest point inside an unowned enclosed structure) can be claimed ("Tomar Posse") by the player.
   * - If the rest point itself has no owner (and no living villager resident), the player can claim it.
   * - Or if the enclosed structure became UNOWNED (`ownerType === null`, e.g. after the primary owner died or their bed was broken),
   *   the player can take ownership of a rest point inside it to become the new owner of the structure!
   */
  public canPlayerClaimRestPoint(
    st: PlacedStructure,
    precomputedInfo?: ReturnType<GameEngine['getEnclosedBuildingOwnerInfo']>
  ): boolean {
    if (
      st.type === PlaceableType.WOOD_DOOR ||
      st.type === PlaceableType.IRON_GATE
    ) {
      const buildingInfo =
        precomputedInfo !== undefined
          ? precomputedInfo
          : this.getEnclosedBuildingOwnerInfo(st.tileX, st.tileY);
      if (!buildingInfo || buildingInfo.ownerType !== null) return false;
      return buildingInfo.interiorRestPoints.some(
        (rp) => this.getHouseResidents(rp.id).length === 0 || buildingInfo.clearedAfterLoss
      );
    }

    if (!this.isRestPointStructure(st)) return false;
    const buildingInfo =
      precomputedInfo !== undefined
        ? precomputedInfo
        : this.getEnclosedBuildingOwnerInfo(st.tileX, st.tileY);
    if (
      buildingInfo &&
      buildingInfo.ownerType === null &&
      buildingInfo.clearedAfterLoss
    ) {
      // Enclosed structure lost its primary owner and is currently unowned:
      // allow taking ownership of a rest point inside if that specific rest point has no living villager, or if it's the player's own bed!
      return this.getHouseResidents(st.id).length === 0;
    }

    if (st.ownerType === 'PLAYER') return false;
    return this.getHouseResidents(st.id).length === 0;
  }

  /**
   * "Tomar Posse": Claims ownership of an unowned rest point (and its enclosing roofed structure if unowned) for the player.
   */
  public claimRestPointOwnership(structureId?: string): boolean {
    let targetSt: PlacedStructure | null = null;
    if (structureId) {
      for (const chunk of Object.values(this.world.chunks)) {
        if (!chunk) continue;
        const found = chunk.structures.find((s) => s.id === structureId);
        if (found) {
          targetSt = found;
          break;
        }
      }
    }
    if (!targetSt) {
      const aimed = this.getAimedTarget();
      if (aimed?.structureId) {
        for (const chunk of Object.values(this.world.chunks)) {
          if (!chunk) continue;
          const found = chunk.structures.find(
            (s) => s.id === aimed.structureId
          );
          if (found) {
            targetSt = found;
            break;
          }
        }
      }
    }
    if (!targetSt || !this.canPlayerClaimRestPoint(targetSt)) {
      return false;
    }

    // If the player clicked "Tomar Posse" while aiming at the door of an unowned enclosed structure,
    // resolve the target to a claimable rest point inside that structure!
    if (
      targetSt.type === PlaceableType.WOOD_DOOR ||
      targetSt.type === PlaceableType.IRON_GATE
    ) {
      const buildingInfo = this.getEnclosedBuildingOwnerInfo(
        targetSt.tileX,
        targetSt.tileY
      );
      const claimableRp = buildingInfo?.interiorRestPoints.find(
        (rp) => this.getHouseResidents(rp.id).length === 0
      );
      if (!claimableRp) return false;
      targetSt = claimableRp;
    }

    const ownerName =
      this.multiplayer.localPlayerName ||
      this.settings.playerName ||
      'Aventureiro';
    targetSt.ownerType = 'PLAYER';
    targetSt.ownerId = this.getLocalOwnerId();
    targetSt.ownerName = ownerName;
    targetSt.ownerAssignedAt = Date.now();
    targetSt.villageId = undefined;

    // If the enclosing roofed structure has no owner, taking ownership of this rest point defines the new owner of the structure!
    this.assignEnclosedBuildingPrimaryOwner(targetSt);

    // Evict any stray NPC bindings to this structure
    for (const cr of this.entities.creatures) {
      if (cr.homeHouseId === targetSt.id) {
        if (cr.isInsideHouse) {
          this.exitVillagerFromHouse(cr, false);
        }
        cr.homeHouseId = undefined;
        cr.homeX = undefined;
        cr.homeY = undefined;
      }
    }

    const sx = targetSt.tileX * TILE_SIZE + TILE_SIZE / 2;
    const sy = targetSt.tileY * TILE_SIZE + TILE_SIZE / 2;
    const restLabel =
      targetSt.type === PlaceableType.BED
        ? 'Cama de Madeira'
        : targetSt.type === PlaceableType.VILLAGE_HOUSE
        ? 'Cabana Medieval'
        : targetSt.type === PlaceableType.EXPLORER_TENT
        ? 'Tenda de Explorador'
        : 'Casa do Jogador';
    this.setPlayerRespawnPoint(sx, sy, restLabel);

    soundManager.playLevelUp();
    this.renderer.spawnBurst(sx, sy - 6, 'GOLD', 16);
    this.renderer.spawnRipple(sx, sy, '#4ade80', 30, 0.55);
    this.addFloatingText(
      `🏠 Posse tomada! Agora ${restLabel} e a estrutura pertencem a ${ownerName}!`,
      sx,
      sy - 24,
      '#4ade80'
    );
    this.syncChunkAtTile(targetSt.tileX, targetSt.tileY);
    void this.saveGame(true);
    this.emitUiSnapshot();
    return true;
  }

  /**
   * Returns all living Villagers currently registered as residents of a specific Rest Point / Bed (`st.id`).
   */
  public getHouseResidents(houseId: string): CreatureEntity[] {
    return this.entities.creatures.filter(
      (c) =>
        c.kind === CreatureKind.VILLAGER &&
        c.hp > 0 &&
        c.homeHouseId === houseId
    );
  }

  /**
   * Synchronizes village bed/house assignments, protects player-owned structures from NPC invasion,
   * and enforces enclosed structure ownership rules if a villager resident dies.
   */
  private syncVillageHouseAssignments(): void {
    const validNpcHouseIds = new Set<string>();
    const npcHouses: PlacedStructure[] = [];
    const ownerName =
      this.multiplayer.localPlayerName ||
      this.settings.playerName ||
      'Aventureiro';

    for (const chunk of Object.values(this.world.chunks)) {
      if (!chunk) continue;
      for (const st of chunk.structures) {
        if (!this.isRestPointStructure(st)) continue;

        // Any bed/tent/house placed by a player (not generated as a world landmark structure) belongs to the player!
        if (
          !st.id.startsWith('world_struct_') &&
          !st.villageId &&
          !st.ownerType &&
          !st.structureOwnerClearedAfterLoss
        ) {
          st.ownerType = 'PLAYER';
          st.ownerId = this.getLocalOwnerId();
          st.ownerName = ownerName;
          st.ownerAssignedAt = st.ownerAssignedAt || Date.now();
        }

        if (this.canNpcOccupyHouse(st)) {
          validNpcHouseIds.add(st.id);
          npcHouses.push(st);
        }
      }
    }

    // Clear homeHouseId if a bed/house was dismantled OR if it belongs to a Player (NPCs cannot invade player houses!)
    for (const cr of this.entities.creatures) {
      if (cr.homeHouseId && !validNpcHouseIds.has(cr.homeHouseId)) {
        if (cr.isInsideHouse) {
          this.exitVillagerFromHouse(cr, false);
        }
        cr.homeHouseId = undefined;
        cr.homeX = undefined;
        cr.homeY = undefined;
        cr.isInsideHouse = false;
        cr.outsideNightTimer = 0;
      }
    }

    // Bind unbound village NPCs ONLY to valid non-player village beds/houses (1 villager per BED, up to 2 per legacy VILLAGE_HOUSE)
    for (const cr of this.entities.creatures) {
      if (
        cr.kind === CreatureKind.VILLAGER &&
        cr.hp > 0 &&
        !cr.homeHouseId
      ) {
        let bestHouse: PlacedStructure | null = null;
        let bestDist = 190;
        for (const h of npcHouses) {
          if (!this.canNpcOccupyHouse(h)) continue;
          const maxCap =
            h.type === PlaceableType.BED ? 1 : MAX_VILLAGERS_PER_HOUSE;
          if (this.getHouseResidents(h.id).length >= maxCap) {
            continue;
          }
          const hx = h.tileX * TILE_SIZE + TILE_SIZE / 2;
          const hy = h.tileY * TILE_SIZE + TILE_SIZE / 2;
          const d = Math.hypot(cr.x - hx, cr.y - hy);
          if (d < bestDist) {
            bestDist = d;
            bestHouse = h;
          }
        }
        if (bestHouse) {
          cr.homeHouseId = bestHouse.id;
          cr.homeX = bestHouse.tileX * TILE_SIZE + TILE_SIZE / 2;
          cr.homeY = bestHouse.tileY * TILE_SIZE + TILE_SIZE / 2;
          if (!bestHouse.ownerType) {
            bestHouse.ownerType = 'VILLAGER';
            bestHouse.ownerId = cr.id;
            bestHouse.ownerName = cr.name;
            this.assignEnclosedBuildingPrimaryOwner(bestHouse);
          }
        }
      }
    }

    // Update dynamic VILLAGER ownership labels on village beds/houses (or clear structure ownership if primary owner died)
    for (const h of npcHouses) {
      if (h.ownerType === 'PLAYER') continue;
      const { cx, cy } = this.world.tileToChunk(h.tileX, h.tileY);
      const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
      if (chunk && !chunk.mobsPopulated && h.villageId) {
        continue;
      }
      const residents = this.getHouseResidents(h.id);
      if (residents.length > 0) {
        h.ownerType = 'VILLAGER';
        h.ownerId = residents[0].id;
        h.ownerName = residents.map((r) => r.name).join(' & ');
      } else {
        if (h.isPrimaryStructureOwner) {
          this.clearEnclosedBuildingOwnershipOnLoss(h.tileX, h.tileY, h.id);
        }
        h.ownerType = undefined;
        h.ownerId = undefined;
        h.ownerName = undefined;
      }
    }

    // Ensure all existing Villagers and Wanderers have their trade offers initialized
    for (const cr of this.entities.creatures) {
      if (
        (cr.kind === CreatureKind.VILLAGER ||
          cr.kind === CreatureKind.WANDERER) &&
        cr.hp > 0 &&
        (!cr.trades || cr.trades.length === 0)
      ) {
        const defaultRole =
          cr.kind === CreatureKind.WANDERER
            ? 'andarilho'
            : cr.npcRole || 'mercador';
        cr.trades = EntityManager.getDefaultTradesForRole(defaultRole);
      }
    }

    // Also ensure every MARKET_STALL has a defined owner (Villager for village stalls, Player for player-placed stalls)
    for (const chunk of Object.values(this.world.chunks)) {
      if (!chunk) continue;
      for (const st of chunk.structures) {
        if (st.type !== PlaceableType.MARKET_STALL) continue;
        this.ensureMarketStallInitialized(st);

        if (st.ownerType === 'VILLAGER') {
          const currentOwnerAlive =
            st.ownerId &&
            this.entities.creatures.some(
              (c) =>
                c.id === st.ownerId &&
                (c.kind === CreatureKind.VILLAGER ||
                  c.kind === CreatureKind.WANDERER) &&
                c.hp > 0
            );

          if (!currentOwnerAlive) {
            const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
            const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
            let bestMerchant: CreatureEntity | null = null;
            let bestScore = Infinity;

            for (const cr of this.entities.creatures) {
              if (cr.kind !== CreatureKind.VILLAGER || cr.hp <= 0) continue;
              const d = Math.hypot(cr.x - sx, cr.y - sy);
              if (d > 380 && (!st.villageId || cr.villageId !== st.villageId)) {
                continue;
              }
              const roleBonus = cr.npcRole === 'mercador' ? -220 : 0;
              const villageBonus =
                st.villageId && cr.villageId === st.villageId ? -120 : 0;
              const score = d + roleBonus + villageBonus;
              if (score < bestScore) {
                bestScore = score;
                bestMerchant = cr;
              }
            }

            if (bestMerchant) {
              st.ownerId = bestMerchant.id;
              st.ownerName = `${bestMerchant.name} (${
                bestMerchant.npcProfessionLabel || 'Mercador'
              })`;
            } else if (!st.ownerName) {
              st.ownerName = 'Mercador da Vila';
            }
          }

          if (this.isVillagerStallOwnerAlive(st)) {
            const hasGoods =
              Array.isArray(st.stallSlots) &&
              st.stallSlots.some((s) => s !== null && s.count > 0);
            if (!hasGoods) {
              this.populateVillagerStallMerchandise(st);
            }
            st.ownerSleeping = this.isVillagerStallOwnerSleeping(st);
            st.stallOpen = !st.ownerSleeping;
          } else {
            st.ownerSleeping = false;
          }
        }
      }
    }
  }

  /**
   * Finds the living Villager/Wanderer entity that owns a Villager Market Stall.
   */
  public getVillagerStallOwnerEntity(
    stall: PlacedStructure
  ): CreatureEntity | null {
    if (stall.ownerType !== 'VILLAGER') return null;
    if (stall.ownerId) {
      const direct = this.entities.creatures.find(
        (c) =>
          c.id === stall.ownerId &&
          (c.kind === CreatureKind.VILLAGER ||
            c.kind === CreatureKind.WANDERER) &&
          c.hp > 0
      );
      if (direct) return direct;
    }
    if (stall.villageId) {
      const villageMerchant =
        this.entities.creatures.find(
          (c) =>
            c.kind === CreatureKind.VILLAGER &&
            c.villageId === stall.villageId &&
            c.hp > 0 &&
            c.npcRole === 'mercador'
        ) ||
        this.entities.creatures.find(
          (c) =>
            c.kind === CreatureKind.VILLAGER &&
            c.villageId === stall.villageId &&
            c.hp > 0
        );
      if (villageMerchant) return villageMerchant;
    }
    return null;
  }

  /**
   * Returns true if the Villager owner of a Market Stall is currently sleeping inside their house (`isInsideHouse`).
   * While sleeping, the stall's merchandise is hidden until they wake up.
   */
  public isVillagerStallOwnerSleeping(stall: PlacedStructure): boolean {
    if (stall.ownerType !== 'VILLAGER') return false;
    const ownerNpc = this.getVillagerStallOwnerEntity(stall);
    if (ownerNpc) {
      return Boolean(ownerNpc.isInsideHouse);
    }
    return Boolean(
      this.metadata.timeOfDay >= 20.0 || this.metadata.timeOfDay < 5.5
    );
  }

  /**
   * Populates a Villager-owned Market Stall (`stall.ownerType === 'VILLAGER'`) with the villager's showcase merchandise.
   */
  public populateVillagerStallMerchandise(stall: PlacedStructure): void {
    if (stall.ownerType !== 'VILLAGER') return;
    const ownerNpc = this.getVillagerStallOwnerEntity(stall);
    const nextSlots: (MarketStallSlot | null)[] = new Array(
      MARKET_STALL_SIZE
    ).fill(null);

    const showcaseList: Array<{ itemId: string; count: number }> = [];
    const seenIds = new Set<string>();

    if (ownerNpc && Array.isArray(ownerNpc.trades)) {
      for (const tr of ownerNpc.trades) {
        if (
          tr.receiveItemId &&
          ITEMS[tr.receiveItemId] &&
          tr.receiveItemId !== 'gold_coin' &&
          !seenIds.has(tr.receiveItemId)
        ) {
          seenIds.add(tr.receiveItemId);
          showcaseList.push({
            itemId: tr.receiveItemId,
            count: Math.max(2, tr.receiveCount * 2),
          });
        }
      }
    }

    const fallbackGoods: Array<{ itemId: string; count: number }> = [
      { itemId: 'healing_salve', count: 3 },
      { itemId: 'rope', count: 4 },
      { itemId: 'apple', count: 6 },
      { itemId: 'saddle', count: 1 },
      { itemId: 'iron_bar', count: 3 },
      { itemId: 'torch', count: 5 },
    ];
    for (const fg of fallbackGoods) {
      if (showcaseList.length >= 6) break;
      if (!seenIds.has(fg.itemId) && ITEMS[fg.itemId]) {
        seenIds.add(fg.itemId);
        showcaseList.push(fg);
      }
    }

    for (
      let i = 0;
      i < Math.min(showcaseList.length, MARKET_STALL_SIZE);
      i++
    ) {
      const entry = showcaseList[i];
      nextSlots[i] = {
        itemId: entry.itemId,
        count: entry.count,
        unitPrice: Math.max(1, getItemBasePrice(entry.itemId)),
        enabled: true,
      };
    }

    stall.stallSlots = nextSlots;
    stall.ownerSleeping = this.isVillagerStallOwnerSleeping(stall);
    stall.stallOpen = !stall.ownerSleeping;
  }

  /**
   * Checks whether a villager-owned Market Stall still has a living Villager owner.
   * If the villager owner died, returns false so the player can claim the stall.
   */
  public isVillagerStallOwnerAlive(stall: PlacedStructure): boolean {
    if (stall.ownerType !== 'VILLAGER') return false;
    if (this.getVillagerStallOwnerEntity(stall)) {
      return true;
    }
    // If the village chunk hasn't spawned its landmark mobs yet, treat the village merchant as alive
    const { cx, cy } = this.world.tileToChunk(stall.tileX, stall.tileY);
    const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
    if (chunk && !chunk.mobsPopulated && stall.villageId) {
      return true;
    }
    return false;
  }

  /**
   * Checks whether the player has permission from a village to open its Guild Chest (`chestStruct.villageId`).
   * Requires either all villagers of that village to be dead, or average affinity >= 75 and no hostile villagers.
   */
  public hasVillageChestPermission(villageId?: string): boolean {
    if (!villageId) return true;
    const villageNpcs = this.entities.creatures.filter(
      (c) =>
        c.kind === CreatureKind.VILLAGER &&
        c.villageId === villageId &&
        c.hp > 0
    );
    if (villageNpcs.length === 0) return true;
    if (villageNpcs.some((n) => n.isHostile)) return false;
    const avgAff =
      villageNpcs.reduce((sum, n) => sum + (n.affinity ?? 55), 0) /
      villageNpcs.length;
    return avgAff >= 75;
  }

  /**
   * Finds the nearest House (village house or player-built house) within `maxRadius` that has `< 2` residents.
   */
  public findAvailableHouseNear(
    wx: number,
    wy: number,
    maxRadius = 230
  ): { house: PlacedStructure; wx: number; wy: number; dist: number; residents: number } | null {
    const centerTile = this.world.worldToTile(wx, wy);
    const centerChunk = this.world.tileToChunk(centerTile.tx, centerTile.ty);
    let best: {
      house: PlacedStructure;
      wx: number;
      wy: number;
      dist: number;
      residents: number;
    } | null = null;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk =
          this.world.chunks[
            WorldManager.chunkKey(centerChunk.cx + dx, centerChunk.cy + dy)
          ];
        if (!chunk) continue;

        for (const st of chunk.structures) {
          if (!this.canNpcOccupyHouse(st)) continue;
          const maxCap =
            st.type === PlaceableType.BED ? 1 : MAX_VILLAGERS_PER_HOUSE;
          const residents = this.getHouseResidents(st.id).length;
          if (residents >= maxCap) continue;

          const hx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
          const hy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
          const dist = Math.hypot(wx - hx, wy - hy);
          if (dist <= maxRadius && (!best || dist < best.dist)) {
            best = { house: st, wx: hx, wy: hy, dist, residents };
          }
        }
      }
    }
    return best;
  }

  /**
   * Settles a Wanderer NPC into a specific non-player Village Bed/House, converting them into a Villager.
   * If the enclosing structure currently has no owner, taking ownership of this rest point defines the new owner of the structure!
   */
  public settleWandererIntoHouse(
    wanderer: CreatureEntity,
    house: PlacedStructure
  ): boolean {
    if (wanderer.kind !== CreatureKind.WANDERER) return false;
    if (!this.canNpcOccupyHouse(house)) return false;
    const maxCap =
      house.type === PlaceableType.BED ? 1 : MAX_VILLAGERS_PER_HOUSE;
    const currentResidents = this.getHouseResidents(house.id).length;
    if (currentResidents >= maxCap) return false;

    const hx = house.tileX * TILE_SIZE + TILE_SIZE / 2;
    const hy = house.tileY * TILE_SIZE + TILE_SIZE / 2;
    this.entities.convertWandererToVillager(
      wanderer,
      house.id,
      hx,
      hy,
      house.villageId
    );
    house.ownerType = 'VILLAGER';
    house.ownerId = wanderer.id;
    house.ownerName = wanderer.name;
    house.ownerAssignedAt = Date.now();
    this.assignEnclosedBuildingPrimaryOwner(house);

    const newCount = this.getHouseResidents(house.id).length;

    soundManager.playTameSuccess();
    this.renderer.spawnBurst(wanderer.x, wanderer.y - 6, 'GOLD', 16);
    this.renderer.spawnBurst(hx, hy - 6, 'TAME', 12);
    this.renderer.spawnRipple(hx, hy, '#4ade80', 30, 0.55);
    this.addFloatingText(
      `🏠 ${wanderer.name} virou Aldeão! (${newCount}/${maxCap})`,
      wanderer.x,
      wanderer.y - 24,
      '#4ade80'
    );
    this.emitUiSnapshot();
    return true;
  }

  /**
   * Brings a Villager out of their house/bed onto a valid passable tile in front of the house door (or bed).
   * When `calledByKnock` is true, starts the inactivity countdown (`outsideNightTimer`) before they go back inside.
   */
  private exitVillagerFromHouse(
    cr: CreatureEntity,
    calledByKnock = false,
    slotIndex = 0
  ): void {
    cr.isInsideHouse = false;
    cr.outsideNightTimer = calledByKnock ? 15 : 0;
    cr.vx = 0;
    cr.vy = 0;
    cr.aiState = calledByKnock ? 'idle' : 'wander';
    // When waking up naturally at dawn after sleeping in their house, reset the daily purchase & inspection limits!
    if (!calledByKnock) {
      cr.hasBoughtToday = false;
      cr.attractedStallId = undefined;
      cr.stallInspectionsToday = {};
    }

    let baseX = cr.homeX ?? cr.x;
    let baseY = cr.homeY ?? cr.y;

    // If the villager's bed is inside an enclosed roofed house, step out through the house's door!
    const homeTile = this.world.worldToTile(baseX, baseY);
    const building = this.renderer.getBuildingAtTile(
      this.world,
      homeTile.tx,
      homeTile.ty
    );
    if (building) {
      const minCx = Math.floor(building.minTx / 16);
      const maxCx = Math.floor(building.maxTx / 16);
      const minCy = Math.floor(building.minTy / 16);
      const maxCy = Math.floor(building.maxTy / 16);
      let foundDoor = false;
      for (let cy = minCy; cy <= maxCy && !foundDoor; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
          if (!chunk) continue;
          const doorSt = chunk.structures.find(
            (s) =>
              (s.type === PlaceableType.WOOD_DOOR ||
                s.type === PlaceableType.IRON_GATE) &&
              building.footprintSet.has(`${s.tileX},${s.tileY}`)
          );
          if (doorSt) {
            doorSt.isOpen = true;
            baseX = doorSt.tileX * TILE_SIZE + TILE_SIZE / 2;
            baseY = doorSt.tileY * TILE_SIZE + TILE_SIZE / 2;
            foundDoor = true;
            break;
          }
        }
      }
    }

    const spreadX = slotIndex === 0 ? -8 : 8;
    const candidateOffsets: [number, number][] = [
      [spreadX, 24],
      [0, 26],
      [spreadX, -24],
      [0, -26],
      [22, 16],
      [-22, 16],
      [24, 0],
      [-24, 0],
    ];

    for (const [ox, oy] of candidateOffsets) {
      const tx = baseX + ox;
      const ty = baseY + oy;
      if (this.canEntityOccupy(tx, ty)) {
        cr.x = tx;
        cr.y = ty;
        break;
      }
    }

    if (calledByKnock) {
      cr.direction = EntityManager.vectorToDirection(
        this.player.x - cr.x,
        this.player.y - cr.y,
        'down'
      );
    }
  }

  /**
   * "Bater na Porta": Knocks on a house door/entrance to call out any villagers currently sleeping/sheltered inside.
   */
  private knockOnHouseDoor(
    houseSt: PlacedStructure,
    insideResidents: CreatureEntity[]
  ): void {
    const sx = houseSt.tileX * TILE_SIZE + TILE_SIZE / 2;
    const sy = houseSt.tileY * TILE_SIZE + TILE_SIZE / 2;

    if (
      houseSt.type === PlaceableType.WOOD_DOOR ||
      houseSt.type === PlaceableType.IRON_GATE
    ) {
      houseSt.isOpen = true;
    }

    soundManager.playHitWood();
    this.renderer.spawnBurst(sx, sy, 'WOOD', 7);
    this.renderer.spawnRipple(sx, sy, '#fde047', 26, 0.45);

    insideResidents.forEach((resident, idx) => {
      this.exitVillagerFromHouse(resident, true, idx);
    });

    const names = insideResidents.map((r) => r.name).join(' & ');
    this.addFloatingText(
      `🚪 Toc toc! ${names} saiu para atender (15s)`,
      sx,
      sy - 24,
      '#fde047'
    );
    this.emitUiSnapshot();
  }

  private houseSyncTimer = 0;

  private updateCreatures(dt: number): void {
    this.houseSyncTimer -= dt;
    if (this.houseSyncTimer <= 0) {
      this.houseSyncTimer = 1.8;
      this.syncVillageHouseAssignments();
    }
    this.updatePlayerStallCustomerTraffic(dt);
    const isSunsetOrNight =
      this.metadata.timeOfDay >= 17.5 || this.metadata.timeOfDay < 5.5;

    for (let i = this.entities.creatures.length - 1; i >= 0; i--) {
      const cr = this.entities.creatures[i];
      if (!cr || cr.hp <= 0) continue;

      const distToPlayer = Math.hypot(
        this.player.x - cr.x,
        this.player.y - cr.y
      );

      // If Villager is currently inside their house:
      // - Stay invisible/safe inside until dawn (05:30), or until the player knocks on the door.
      // - At dawn, automatically step outside to resume daily village life (when within active range of the player)!
      if (cr.isInsideHouse) {
        if (!isSunsetOrNight && distToPlayer <= 820) {
          this.exitVillagerFromHouse(cr, false);
          this.addFloatingText(
            `☀️ ${cr.name} saiu de casa`,
            cr.x,
            cr.y - 20,
            '#fde047'
          );
        } else {
          cr.vx = 0;
          cr.vy = 0;
          if (cr.hp < cr.maxHp) {
            cr.hp = Math.min(cr.maxHp, cr.hp + dt * 3.5);
          }
          continue;
        }
      }

      cr.faction = EntityManager.getFaction(cr);
      cr.swimSpeed = EntityManager.getCreatureSwimSpeed(cr);
      // Skip AI & current drift for any creature currently mounted by a player, or a Boat, or a pet seated in a Boat
      if (
        cr.kind === CreatureKind.BOAT ||
        this.player.mountedEntityId === cr.id ||
        this.entities.creatures.some(
          (b) => b.kind === CreatureKind.BOAT && b.passengerPetId === cr.id
        ) ||
        this.remotePlayersList.some((rp) => rp.mountedEntityId === cr.id)
      ) {
        if (cr.hitFlashTimer > 0) {
          cr.hitFlashTimer = Math.max(0, cr.hitFlashTimer - dt);
        }
        if (cr.kind === CreatureKind.BOAT) {
          cr.vx = 0;
          cr.vy = 0;
          cr.isSwimming = true;
        }
        continue;
      }

      // Skip expensive per-frame raycast steering & world queries for creatures far outside the active simulation radius
      const isFollowingPet = Boolean(cr.tamed && cr.aiState === 'follow');
      if (!isFollowingPet && distToPlayer > 780) {
        cr.vx = 0;
        cr.vy = 0;
        cr.animFrame = 0;
        if (cr.hitFlashTimer > 0) {
          cr.hitFlashTimer = Math.max(0, cr.hitFlashTimer - dt);
        }
        if (
          isSunsetOrNight &&
          cr.kind === CreatureKind.VILLAGER &&
          cr.homeHouseId &&
          cr.homeX !== undefined &&
          cr.homeY !== undefined
        ) {
          cr.isInsideHouse = true;
          cr.x = cr.homeX;
          cr.y = cr.homeY;
        }
        continue;
      }

      cr.isSwimming = this.world.isWorldPosInWater(cr.x, cr.y);

      if (cr.hitFlashTimer > 0) cr.hitFlashTimer = Math.max(0, cr.hitFlashTimer - dt);
      if (cr.attackTimer > 0) cr.attackTimer = Math.max(0, cr.attackTimer - dt);
      if (cr.attackCooldown > 0) cr.attackCooldown = Math.max(0, cr.attackCooldown - dt);

      if (cr.specialCooldown && cr.specialCooldown > 0) {
        cr.specialCooldown = Math.max(0, cr.specialCooldown - dt);
      }
      if (cr.stallInspectCooldown && cr.stallInspectCooldown > 0) {
        cr.stallInspectCooldown = Math.max(0, cr.stallInspectCooldown - dt);
      }
      if (cr.provokedTimer && cr.provokedTimer > 0) {
        cr.provokedTimer = Math.max(0, cr.provokedTimer - dt);
        if (
          cr.provokedTimer === 0 &&
          (cr.kind === CreatureKind.VILLAGER || cr.kind === CreatureKind.WANDERER) &&
          (cr.affinity ?? 55) >= 22
        ) {
          cr.isHostile = false;
        }
      }

      // Validate retaliateTargetId (clear if target died, entered a house, or moved too far away)
      let retaliateTarget: CreatureEntity | null = null;
      if (cr.retaliateTargetId) {
        const found = this.entities.creatures.find(
          (o) => o.id === cr.retaliateTargetId && o.hp > 0 && !o.isInsideHouse
        );
        if (found && Math.hypot(found.x - cr.x, found.y - cr.y) <= 280) {
          retaliateTarget = found;
        } else {
          cr.retaliateTargetId = undefined;
        }
      }

      // =====================================================================
      // 1. FACTION: PLAYER_ALLY (Tamed Pets — 3 States: 'stay', 'follow', 'graze')
      // =====================================================================
      if (cr.tamed) {
        if (cr.kind === CreatureKind.SHEEP) {
          cr.produceTimer -= dt;
          if (cr.produceTimer <= 0) {
            cr.produceTimer = 45;
            this.spawnDrop('wool', 1, cr.x, cr.y + 8);
            this.addFloatingText('+1 Lã Macia', cr.x, cr.y - 16, '#f8fafc');
          }
        }

        // Normalize any legacy aiState on a tamed pet into one of the 3 official states ('stay', 'follow', 'graze')
        if (
          cr.aiState !== 'stay' &&
          cr.aiState !== 'follow' &&
          cr.aiState !== 'graze'
        ) {
          cr.aiState = 'follow';
        }

        // STATE 1: BASE ('stay') — Pet stays still at the spot
        if (cr.aiState === 'stay') {
          cr.combatTargetId = null;
          cr.retaliateTargetId = undefined;
          cr.vx = 0;
          cr.vy = 0;
        }
        // STATE 2: PASTAR ('graze') — Pet roams freely around its area while remaining tamed
        else if (cr.aiState === 'graze') {
          cr.combatTargetId = null;
          cr.retaliateTargetId = undefined;
          this.updatePetGrazeAi(cr, dt);
        }
        // STATE 3: SEGUINDO ('follow') — Pet follows owner as an ally; ONLY Camel and Boar engage in combat
        else if (cr.aiState === 'follow') {
          const ownerTarget = this.getPetOwnerTarget(cr);
          const canFightAsAlly = EntityManager.isCombatAllyKind(cr.kind);

          // Resolve single focused combat target (`combatTargetId`) ONLY for combat-capable allies (Camel & Boar)
          let enemyTarget: CreatureEntity | null = null;
          if (!canFightAsAlly) {
            cr.combatTargetId = null;
            cr.retaliateTargetId = undefined;
          } else if (cr.combatTargetId) {
            const foundTarget = this.entities.creatures.find(
              (o) =>
                o.id === cr.combatTargetId &&
                o.hp > 0 &&
                !o.isInsideHouse &&
                !o.tamed &&
                !EntityManager.isPeacefulAnimalKind(o.kind)
            );
            if (foundTarget) {
              enemyTarget = foundTarget;
            } else {
              cr.combatTargetId = null;
            }
          }

          // If a combat-capable ally itself was directly attacked while following and has no locked target yet, lock onto that attacker
          if (
            canFightAsAlly &&
            !enemyTarget &&
            retaliateTarget &&
            !retaliateTarget.tamed &&
            !EntityManager.isPeacefulAnimalKind(retaliateTarget.kind)
          ) {
            cr.combatTargetId = retaliateTarget.id;
            enemyTarget = retaliateTarget;
          }

          // Rule: If the player moves away from the battle area, the ally stops battling and follows the player!
          if (enemyTarget && ownerTarget) {
            const distOwnerToEnemy = Math.hypot(
              ownerTarget.x - enemyTarget.x,
              ownerTarget.y - enemyTarget.y
            );
            const distOwnerToPet = Math.hypot(
              ownerTarget.x - cr.x,
              ownerTarget.y - cr.y
            );
            if (distOwnerToEnemy > 235 || distOwnerToPet > 225) {
              cr.combatTargetId = null;
              cr.retaliateTargetId = undefined;
              enemyTarget = null;
            }
          }

          if (enemyTarget) {
            const dx = enemyTarget.x - cr.x;
            const dy = enemyTarget.y - cr.y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            if (dist > 26) {
              this.steerCreatureToward(
                cr,
                enemyTarget.x,
                enemyTarget.y,
                cr.moveSpeed * 1.25,
                dt,
                false
              );
            } else {
              cr.vx = 0;
              cr.vy = 0;
              if (cr.attackCooldown <= 0) {
                cr.attackCooldown = 1.05;
                cr.attackTimer = 0.25;
                const allyDamage = Math.max(8, cr.attackDamage || 10);
                this.damageCreature(
                  enemyTarget,
                  allyDamage,
                  cr.x,
                  cr.y,
                  1.0,
                  cr
                );
              }
            }
          } else if (!ownerTarget) {
            // Owner is offline right now; pet waits patiently in place
            cr.vx = 0;
            cr.vy = 0;
          } else {
            const distToOwner = Math.hypot(
              ownerTarget.x - cr.x,
              ownerTarget.y - cr.y
            );
            // If pet got stranded very far away (e.g. across water/cliffs), bring it to a clear spot near its owner
            if (distToOwner > 440) {
              const telePos = this.findClearSpotNear(
                ownerTarget.x,
                ownerTarget.y,
                36
              );
              cr.x = telePos.x;
              cr.y = telePos.y;
              cr.vx = 0;
              cr.vy = 0;
            } else if (distToOwner > 54) {
              // Smooth arrival speed as the pet gets close to its owner
              const arrivalFactor = Math.min(
                1.3,
                Math.max(0.55, (distToOwner - 44) / 55)
              );
              this.steerCreatureToward(
                cr,
                ownerTarget.x,
                ownerTarget.y,
                cr.moveSpeed * arrivalFactor,
                dt,
                false
              );
            } else {
              // Smoothly decelerate to rest beside its owner
              cr.vx *= Math.max(0, 1 - dt * 10);
              cr.vy *= Math.max(0, 1 - dt * 10);
              if (Math.hypot(cr.vx, cr.vy) < 2) {
                cr.vx = 0;
                cr.vy = 0;
              }
            }
          }
        }
      }
      // =====================================================================
      // 2. FACTION: VILLAGER & WANDERER
      //    - Peaceful by default (only attacks non-monsters if attacked first)
      //    - ALWAYS prioritizes rivaling/attacking nearby Monsters (`MONSTER` faction)
      //    - Wanderer converts into a Villager upon finding an available House (< 2 residents)
      // =====================================================================
      else if (
        cr.kind === CreatureKind.VILLAGER ||
        cr.kind === CreatureKind.WANDERER
      ) {
        // PRIORITY 1: Always scan for nearby MONSTERS and prioritize attacking them!
        let monsterTarget: CreatureEntity | null = null;
        let bestMonsterDist =
          cr.npcRole === 'guardiao'
            ? 275
            : cr.kind === CreatureKind.VILLAGER
            ? 235
            : 185;

        for (const other of this.entities.creatures) {
          if (
            other.id !== cr.id &&
            other.hp > 0 &&
            !other.isInsideHouse &&
            EntityManager.isMonsterKind(other.kind)
          ) {
            const d = Math.hypot(other.x - cr.x, other.y - cr.y);
            if (d < bestMonsterDist) {
              bestMonsterDist = d;
              monsterTarget = other;
            }
          }
        }

        // If attacked by a non-monster creature, retaliate if no monster is closer
        const creatureTarget = monsterTarget || retaliateTarget;

        if (creatureTarget) {
          cr.aiState = 'chase';
          const dx = creatureTarget.x - cr.x;
          const dy = creatureTarget.y - cr.y;
          const dist = Math.max(1, Math.hypot(dx, dy));
          if (dist > 28) {
            this.steerCreatureToward(
              cr,
              creatureTarget.x,
              creatureTarget.y,
              cr.moveSpeed * 1.22,
              dt,
              true
            );
          } else {
            cr.vx = 0;
            cr.vy = 0;
            if (cr.attackCooldown <= 0) {
              cr.attackCooldown = 1.05;
              cr.attackTimer = 0.28;
              this.damageCreature(
                creatureTarget,
                cr.attackDamage,
                cr.x,
                cr.y,
                1.0,
                cr
              );
            }
          }
        } else if (cr.isHostile && distToPlayer < 220) {
          // PRIORITY 2: Only if provoked/attacked by the Player AND no Monster is nearby, retaliate against Player
          // EXCEPT when the player is holding the Peace Item (Tratado da Paz Real) in hand to negotiate forgiveness!
          if (this.isPlayerHoldingPeaceItem()) {
            cr.vx = 0;
            cr.vy = 0;
            cr.aiState = 'idle';
            cr.direction = EntityManager.vectorToDirection(
              this.player.x - cr.x,
              this.player.y - cr.y,
              cr.direction
            );
          } else {
            cr.aiState = 'chase';
            if (distToPlayer > 27) {
              this.steerCreatureToward(
                cr,
                this.player.x,
                this.player.y,
                cr.moveSpeed * 1.12,
                dt,
                true
              );
            } else {
              cr.vx = 0;
              cr.vy = 0;
              if (cr.attackCooldown <= 0) {
                cr.attackCooldown = 1.15;
                cr.attackTimer = 0.28;
                this.damagePlayer(cr.attackDamage, cr.x, cr.y, cr);
              }
            }
          }
        } else if (cr.kind === CreatureKind.WANDERER) {
          // PRIORITY 3 (Wanderer): If attracted to or passing near an open Player Market Stall during the day, visit & inspect the stall first!
          if (!isSunsetOrNight && this.updateNpcMarketStallShopping(cr, dt)) {
            // Wanderer is currently inspecting or walking to a Player Market Stall
          } else {
            // Throttle available-house scans using specialCooldown so Wanderers don't scan 9 chunks 60 times/sec
            let availableHouse: ReturnType<typeof this.findAvailableHouseNear> =
              null;
            if ((cr.specialCooldown ?? 0) <= 0) {
              availableHouse = this.findAvailableHouseNear(cr.x, cr.y, 235);
              if (!availableHouse) {
                cr.specialCooldown = 2.0 + Math.random() * 1.0;
              }
            }
            if (availableHouse) {
              if (availableHouse.dist <= 52) {
                this.settleWandererIntoHouse(cr, availableHouse.house);
              } else {
                this.steerCreatureToward(
                  cr,
                  availableHouse.wx,
                  availableHouse.wy,
                  cr.moveSpeed * 0.95,
                  dt,
                  true
                );
              }
            } else {
              this.updateDirectionalWandererAi(cr, dt);
            }
          }
        } else {
          // Peaceful Villager routine: during sunset and night (17:30 -> 05:30), head home and enter the house!
          if (isSunsetOrNight) {
            cr.attractedStallId = undefined;
            this.updateVillagerSunsetHomeRoutine(cr, dt);
          } else {
            cr.outsideNightTimer = 0;
            if (this.updateNpcMarketStallShopping(cr, dt)) {
              // Villager is currently attracted to / shopping at a Player Market Stall
            } else {
              if (cr.aiState === 'stay') {
                cr.aiState = 'wander';
              }
              this.updateWanderAi(cr, dt);
            }
          }
        }
      }
      // =====================================================================
      // 3. FACTION: MONSTER (Zombie, Ogre, Spider, Scorpion, Golem, Bandit)
      //    - Chooses to attack the CLOSEST enemy (Player, Villager, Wanderer, or Pet)!
      // =====================================================================
      else if (EntityManager.isMonsterKind(cr.kind) || cr.isHostile) {
        const aggroRadius =
          cr.kind === CreatureKind.OGRE
            ? 230
            : cr.kind === CreatureKind.STONE_GOLEM
            ? 165
            : 205;
        const attackReach =
          cr.kind === CreatureKind.OGRE || cr.kind === CreatureKind.STONE_GOLEM
            ? 38
            : 27;

        // Evaluate all rival enemies (Player + Villagers + Wanderers + Tamed Pets) and pick the closest one!
        let bestEnemyDist = aggroRadius;
        let closestEnemyType: 'none' | 'player' | 'creature' = 'none';
        let closestEnemyCreature: CreatureEntity | null = null;

        if (this.player.hp > 0 && distToPlayer < bestEnemyDist) {
          bestEnemyDist = distToPlayer;
          closestEnemyType = 'player';
        }

        for (const other of this.entities.creatures) {
          if (other.id === cr.id || other.hp <= 0 || other.isInsideHouse) continue;
          // Peaceful animals (Horse, Sheep, Boat) are never targeted or attacked by hostile mobs
          if (EntityManager.isPeacefulAnimalKind(other.kind)) continue;

          const isRivalCreature =
            other.kind === CreatureKind.VILLAGER ||
            other.kind === CreatureKind.WANDERER ||
            (other.tamed && EntityManager.isCombatAllyKind(other.kind)) ||
            other.retaliateTargetId === cr.id ||
            cr.retaliateTargetId === other.id;

          if (isRivalCreature) {
            const d = Math.hypot(other.x - cr.x, other.y - cr.y);
            if (d < bestEnemyDist) {
              bestEnemyDist = d;
              closestEnemyType = 'creature';
              closestEnemyCreature = other;
            }
          }
        }

        // STONE_GOLEM remains camouflaged as a dormant monolith until any enemy approaches within 155px or hits it
        if (
          cr.kind === CreatureKind.STONE_GOLEM &&
          closestEnemyType === 'none' &&
          cr.hp === cr.maxHp
        ) {
          cr.vx = 0;
          cr.vy = 0;
          continue;
        }

        // BANDIT emergency self-heal when below 35% HP
        if (
          cr.kind === CreatureKind.BANDIT &&
          cr.hp < cr.maxHp * 0.35 &&
          (cr.specialCooldown ?? 0) <= 0
        ) {
          cr.specialCooldown = 14;
          cr.hp = Math.min(cr.maxHp, cr.hp + 28);
          this.addFloatingText('+28 HP Bandagem!', cr.x, cr.y - 20, '#4ade80');
        }

        if (closestEnemyType !== 'none') {
          cr.aiState = 'chase';
          const targetX =
            closestEnemyType === 'player'
              ? this.player.x
              : closestEnemyCreature!.x;
          const targetY =
            closestEnemyType === 'player'
              ? this.player.y
              : closestEnemyCreature!.y;
          const distToTarget = Math.max(1, bestEnemyDist);

          if (distToTarget > attackReach) {
            let speedMult = 1.0;

            // FOREST_STALKER Ambush Lunge (land only)
            if (
              !cr.isSwimming &&
              cr.kind === CreatureKind.FOREST_STALKER &&
              distToTarget < 125 &&
              distToTarget > 42 &&
              (cr.specialCooldown ?? 0) <= 0
            ) {
              cr.specialCooldown = 4.2;
              speedMult = 2.35;
              this.addFloatingText('Salto de Teia!', cr.x, cr.y - 18, '#a855f7');
            }

            // DESERT_SCORPION Imperial Sting Dash (land only)
            if (
              !cr.isSwimming &&
              cr.kind === CreatureKind.DESERT_SCORPION &&
              distToTarget < 105 &&
              distToTarget > 36 &&
              (cr.specialCooldown ?? 0) <= 0
            ) {
              cr.specialCooldown = 4.8;
              speedMult = 2.15;
              this.addFloatingText(
                'Investida de Ferrão!',
                cr.x,
                cr.y - 18,
                '#f59e0b'
              );
            }

            this.steerCreatureToward(
              cr,
              targetX,
              targetY,
              cr.moveSpeed * speedMult,
              dt,
              cr.kind === CreatureKind.BANDIT
            );
          } else {
            cr.vx = 0;
            cr.vy = 0;
            if (cr.attackCooldown <= 0) {
              cr.attackCooldown =
                cr.kind === CreatureKind.OGRE ||
                cr.kind === CreatureKind.STONE_GOLEM
                  ? 1.65
                  : cr.kind === CreatureKind.FOREST_STALKER
                  ? 0.95
                  : 1.15;
              cr.attackTimer = 0.3;

              let dmg = cr.attackDamage;
              if (
                cr.kind === CreatureKind.STONE_GOLEM &&
                (cr.specialCooldown ?? 0) <= 0
              ) {
                cr.specialCooldown = 5.5;
                dmg = Math.round(cr.attackDamage * 1.25);
                this.addFloatingText(
                  '💥 Impacto Sísmico!',
                  cr.x,
                  cr.y - 22,
                  '#38bdf8'
                );
              }

              if (closestEnemyType === 'player') {
                this.damagePlayer(dmg, cr.x, cr.y, cr);
              } else if (closestEnemyCreature) {
                this.damageCreature(
                  closestEnemyCreature,
                  dmg,
                  cr.x,
                  cr.y,
                  1.0,
                  cr
                );
              }
            }
          }
        } else {
          this.updateWanderAi(cr, dt);
        }
      }
      // =====================================================================
      // 4. FACTION: WILDLIFE (Peaceful Animals: Sheep, Boar, Camel, Horse)
      //    - Retaliates if attacked (Boar/Camel)
      //    - Peaceful animals (Sheep/Horse) when attacked flee to keep a minimum safe distance from the attacker
      // =====================================================================
      else {
        const isPeacefulAnimal =
          cr.kind === CreatureKind.SHEEP || cr.kind === CreatureKind.HORSE;
        let handledFleeFromAttacker = false;

        if (
          isPeacefulAnimal &&
          (cr.fleeTargetId || (cr.fleeTimer !== undefined && cr.fleeTimer > 0))
        ) {
          const MIN_SAFE_FLEE_DIST = 210;
          let attackerX = cr.fleeFromX ?? cr.x;
          let attackerY = cr.fleeFromY ?? cr.y;
          let attackerActive = false;

          if (cr.fleeTargetId === 'PLAYER') {
            if (this.player.hp > 0) {
              attackerX = this.player.x;
              attackerY = this.player.y;
              attackerActive = true;
            }
          } else if (cr.fleeTargetId) {
            const attCr = this.entities.creatures.find(
              (o) =>
                o.id === cr.fleeTargetId && o.hp > 0 && !o.isInsideHouse
            );
            if (attCr) {
              attackerX = attCr.x;
              attackerY = attCr.y;
              attackerActive = true;
            }
          }

          cr.fleeFromX = attackerX;
          cr.fleeFromY = attackerY;
          const distToAttacker = Math.hypot(cr.x - attackerX, cr.y - attackerY);

          if (attackerActive && distToAttacker < MIN_SAFE_FLEE_DIST) {
            // Still inside danger radius: flee away from the author of the attack to reach minimum safe distance!
            cr.fleeTimer = Math.max(cr.fleeTimer || 0, 5.5);
            cr.aiState = 'flee';
            const awayX = cr.x - attackerX;
            const awayY = cr.y - attackerY;
            const fleeAngle =
              Math.hypot(awayX, awayY) > 0.01
                ? Math.atan2(awayY, awayX)
                : cr.wanderAngle || 0;
            this.steerCreatureAlongAngle(
              cr,
              fleeAngle,
              cr.moveSpeed * 1.42,
              dt,
              false,
              false
            );
            handledFleeFromAttacker = true;
          } else {
            // Reached minimum safe distance (>= 210px): count down memory timer while staying alert if attacker approaches again
            cr.fleeTimer = Math.max(0, (cr.fleeTimer || 0) - dt);
            if (cr.fleeTimer <= 0) {
              cr.fleeTargetId = undefined;
              cr.fleeFromX = undefined;
              cr.fleeFromY = undefined;
            }
            if (cr.aiState === 'flee') {
              cr.aiState = 'idle';
              cr.aiTimer = 1.8 + Math.random() * 1.5;
              cr.vx = 0;
              cr.vy = 0;
            }
          }
        }

        if (!handledFleeFromAttacker) {
          if (
            retaliateTarget &&
            (cr.kind === CreatureKind.BOAR || cr.kind === CreatureKind.CAMEL) &&
            cr.attackDamage > 0
          ) {
            const dx = retaliateTarget.x - cr.x;
            const dy = retaliateTarget.y - cr.y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            if (dist > 25) {
              this.steerCreatureToward(
                cr,
                retaliateTarget.x,
                retaliateTarget.y,
                cr.moveSpeed * 1.15,
                dt,
                false
              );
            } else {
              cr.vx = 0;
              cr.vy = 0;
              if (cr.attackCooldown <= 0) {
                cr.attackCooldown = 1.2;
                cr.attackTimer = 0.25;
                this.damageCreature(
                  retaliateTarget,
                  cr.attackDamage,
                  cr.x,
                  cr.y,
                  1.0,
                  cr
                );
              }
            }
          } else {
            this.updateWanderAi(cr, dt);
          }
        }
      }

      // =====================================================================
      // 5. SMOOTH KINEMATIC INTEGRATION & SLIDING OBSTACLE RESOLUTION
      // =====================================================================
      const crCurrent = cr.isSwimming
        ? this.world.getWaterCurrentAtWorld(cr.x, cr.y, this.globalTime)
        : { vx: 0, vy: 0, kind: 'none' as const };
      const effVx = cr.vx + crCurrent.vx;
      const effVy = cr.vy + crCurrent.vy;
      const speed = Math.hypot(effVx, effVy);
      const intentionalSpeed = Math.hypot(cr.vx, cr.vy);

      if (speed > 1.2) {
        if (intentionalSpeed > 1.2) {
          cr.direction = EntityManager.vectorToDirection(
            cr.vx,
            cr.vy,
            cr.direction
          );
        }
        cr.animTimer += dt;
        const animStep = cr.isSwimming ? 0.22 : 0.18;
        if (cr.animTimer >= animStep) {
          cr.animTimer = 0;
          cr.animFrame = (cr.animFrame + 1) % 4;
        }

        const stepX = effVx * dt;
        const stepY = effVy * dt;
        const nx = cr.x + stepX;
        const ny = cr.y + stepY;

        if (this.canEntityOccupy(nx, ny)) {
          cr.x = nx;
          cr.y = ny;
        } else {
          // Try smooth wall/obstacle sliding along individual axes
          let movedX = false;
          let movedY = false;
          if (this.canEntityOccupy(nx, cr.y)) {
            cr.x = nx;
            movedX = true;
          }
          if (this.canEntityOccupy(cr.x, ny)) {
            cr.y = ny;
            movedY = true;
          }

          // If blocked on both axes, probe tangential slide angles so the creature glides around corners instead of stalling
          if (!movedX && !movedY) {
            const baseAng = Math.atan2(effVy, effVx);
            const sign = cr.orbitSign || 1;
            const slideAngles = [
              baseAng + 0.65 * sign,
              baseAng - 0.65 * sign,
              baseAng + 1.25 * sign,
              baseAng - 1.25 * sign,
            ];
            const stepLen = Math.hypot(stepX, stepY) * 0.9;
            for (const sAng of slideAngles) {
              const sx = cr.x + Math.cos(sAng) * stepLen;
              const sy = cr.y + Math.sin(sAng) * stepLen;
              if (this.canEntityOccupy(sx, sy)) {
                cr.x = sx;
                cr.y = sy;
                if (cr.kind !== CreatureKind.WANDERER) {
                  cr.wanderAngle = sAng;
                }
                break;
              }
            }
            // Force path waypoint refresh on next frame if blocked
            cr.navRecalcTimer = 0;
          }
        }
      } else {
        cr.animFrame = 0;
      }

      // Slow progressive HP regeneration when an animal is in idle (and not actively taking hit damage)
      if (
        EntityManager.isWildAnimalKind(cr.kind) &&
        cr.hp > 0 &&
        cr.hp < cr.maxHp &&
        cr.hitFlashTimer <= 0 &&
        (cr.aiState === 'idle' ||
          ((cr.aiState === 'stay' || cr.aiState === 'graze') &&
            intentionalSpeed < 1.2))
      ) {
        cr.hp = Math.min(cr.maxHp, cr.hp + dt * 1.25);
      }
    }

    // Physical overlap resistance between mobs so creatures following/chasing the player push each other apart and never stack
    this.resolveCreatureOverlapResistance(dt);
  }

  /**
   * Resolves overlap between active creatures by applying a mutual push-apart resistance
   * (analogous to `pushPlayerOutOfHitbox`), preventing mobs that follow or chase the player
   * from stacking on the same spot while respecting world hitboxes (`canEntityOccupy`).
   */
  private resolveCreatureOverlapResistance(dt: number): void {
    const creatures = this.entities.creatures;
    const count = creatures.length;
    if (count < 2) return;

    const isEligible = (c: CreatureEntity): boolean => {
      if (!c || c.hp <= 0 || c.isInsideHouse || c.kind === CreatureKind.BOAT) {
        return false;
      }
      if (this.player.mountedEntityId === c.id) return false;
      if (
        Math.hypot(this.player.x - c.x, this.player.y - c.y) > 780 &&
        !(c.tamed && c.aiState === 'follow')
      ) {
        return false;
      }
      return true;
    };

    const getRadius = (c: CreatureEntity): number => {
      if (c.kind === CreatureKind.OGRE || c.kind === CreatureKind.STONE_GOLEM) {
        return 13.5;
      }
      if (c.kind === CreatureKind.CAMEL || c.kind === CreatureKind.HORSE) {
        return 11.5;
      }
      return 9.5;
    };

    const applySafePush = (c: CreatureEntity, pushX: number, pushY: number): void => {
      const nx = c.x + pushX;
      const ny = c.y + pushY;
      if (this.canEntityOccupy(nx, ny)) {
        c.x = nx;
        c.y = ny;
      } else {
        if (this.canEntityOccupy(nx, c.y)) {
          c.x = nx;
        }
        if (this.canEntityOccupy(c.x, ny)) {
          c.y = ny;
        }
      }
    };

    for (let i = 0; i < count; i++) {
      const a = creatures[i];
      if (!isEligible(a)) continue;
      const radA = getRadius(a);

      for (let j = i + 1; j < count; j++) {
        const b = creatures[j];
        if (!isEligible(b)) continue;

        const minDist = radA + getRadius(b);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (Math.abs(dx) >= minDist || Math.abs(dy) >= minDist) continue;

        const dist = Math.hypot(dx, dy);
        if (dist >= minDist) continue;

        let ux: number;
        let uy: number;
        if (dist > 0.05) {
          ux = dx / dist;
          uy = dy / dist;
        } else {
          // Deterministic separation angle if two mobs ever land on the exact same pixel
          const fallbackAng = ((i * 7 + j * 13) % 16) * (Math.PI / 8);
          ux = Math.cos(fallbackAng);
          uy = Math.sin(fallbackAng);
        }

        const overlap = minDist - dist;
        const pushStep = Math.min(
          overlap * 0.52,
          Math.max(1.8, (55 + overlap * 10) * dt)
        );

        applySafePush(a, ux * pushStep, uy * pushStep);
        applySafePush(b, -ux * pushStep, -uy * pushStep);
      }
    }
  }

  // =========================================================================
  // INTELLIGENT NAVIGATION ENGINE (BOUNDED A* + 16-RAY CONTEXT STEERING)
  // =========================================================================

  /**
   * Finds a valid passable world position near `(wx, wy)` within `maxRadius`.
   */
  private findClearSpotNear(
    wx: number,
    wy: number,
    maxRadius = 40
  ): { x: number; y: number } {
    if (this.canEntityOccupy(wx, wy)) return { x: wx, y: wy };
    for (let r = 14; r <= maxRadius; r += 12) {
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        const tx = wx + Math.cos(ang) * r;
        const ty = wy + Math.sin(ang) * r;
        if (this.canEntityOccupy(tx, ty)) {
          return { x: tx, y: ty };
        }
      }
    }
    return { x: wx, y: wy };
  }

  /**
   * Determines whether a creature has a genuine reason to enter water (swim).
   * Naturally, all mobs avoid entering water during idle/wandering routines,
   * and only enter water if they have a specific motive (combat pursuit, retaliating,
   * tamed pet following its owner, cornered while fleeing, or already in water).
   */
  private doesCreatureHaveReasonToSwim(
    cr: CreatureEntity,
    goalX?: number,
    goalY?: number
  ): boolean {
    if (this.world.isWorldPosInWater(cr.x, cr.y)) {
      return true;
    }
    if (cr.aiState === 'chase' || Boolean(cr.retaliateTargetId)) {
      return true;
    }
    if (cr.tamed && cr.aiState === 'follow') {
      const ownerTarget = this.getPetOwnerTarget(cr);
      if (
        ownerTarget &&
        (this.world.isWorldPosInWater(ownerTarget.x, ownerTarget.y) ||
          Math.hypot(ownerTarget.x - cr.x, ownerTarget.y - cr.y) > 90)
      ) {
        return true;
      }
    }
    if (goalX !== undefined && goalY !== undefined) {
      if (this.world.isWorldPosInWater(goalX, goalY)) {
        return true;
      }
      if (
        (cr.kind === CreatureKind.VILLAGER || cr.kind === CreatureKind.WANDERER) &&
        (cr.attractedStallId ||
          cr.homeHouseId ||
          this.metadata.timeOfDay >= 17.5 ||
          this.metadata.timeOfDay < 5.5)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks whether tile `(tx, ty)` is walkable for creature pathfinding.
   * - Respects `allowWater`: when false, swimmable water tiles are avoided by pathfinding.
   * - When `allowClosedDoors` is true (for Villagers, Wanderers, and Bandits), closed doors are treated as passable.
   */
  private isTileWalkableForCreature(
    tx: number,
    ty: number,
    allowClosedDoors = false,
    allowWater = false
  ): boolean {
    if (this.world.isTileWalkable(tx, ty, allowWater)) return true;
    if (!allowClosedDoors) return false;

    const { cx, cy, lx, ly } = this.world.tileToChunk(tx, ty);
    const chunk = this.world.getOrCreateChunk(cx, cy);
    const biome = chunk.tiles[ly * 16 + lx];

    let hasBridge = false;
    for (const st of chunk.structures) {
      if (st.tileX === tx && st.tileY === ty) {
        if (
          st.isBridge ||
          st.type === PlaceableType.WOOD_BRIDGE ||
          CONSTRUCTION_BLUEPRINTS[st.type]?.layer === 'GROUND'
        ) {
          hasBridge = true;
        }
        if (
          st.type === PlaceableType.WOOD_DOOR ||
          st.type === PlaceableType.IRON_GATE
        ) {
          continue; // Humanoids can open doors!
        }
        if (WorldManager.isStructureCurrentlySolid(st)) {
          return false;
        }
      }
    }
    if (!allowWater && biome === BiomeType.OCEAN && !hasBridge) return false;

    const hasSolidNode = chunk.nodes.some(
      (n) =>
        n.tileX === tx &&
        n.tileY === ty &&
        (NATURE_BLUEPRINTS[n.type]?.hasHitbox ?? true)
    );
    return !hasSolidNode;
  }

  /**
   * Raycasts along the world segment `(x0, y0) -> (x1, y1)` to verify whether a creature
   * has a clear, unobstructed line of movement without hitting trees, boulders, walls, or unintended water.
   */
  private hasClearLineOfSight(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    allowClosedDoors = false,
    allowWater = false
  ): boolean {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    if (dist <= 10) return true;
    const steps = Math.max(2, Math.ceil(dist / 12));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      if (!this.world.canEntityOccupyWorldCircle(px, py, 6.8, allowWater)) {
        if (allowClosedDoors) {
          const tile = this.world.worldToTile(px, py);
          const st = this.world.getStructureAtTile(tile.tx, tile.ty);
          if (
            st &&
            (st.type === PlaceableType.WOOD_DOOR ||
              st.type === PlaceableType.IRON_GATE)
          ) {
            continue;
          }
        }
        return false;
      }
    }
    return true;
  }

  /**
   * Lightweight bounded 8-directional A* pathfinder on the tile grid.
   * Finds the smartest obstacle-free intermediate world waypoint toward `(goalX, goalY)`.
   * Naturally penalizes water tiles (`2.8x` cost) so mobs prefer bridges and dry land,
   * only swimming through water when necessary to reach their objective!
   */
  private computeNextPathWaypoint(
    startX: number,
    startY: number,
    goalX: number,
    goalY: number,
    allowClosedDoors = false,
    allowWater = false
  ): { x: number; y: number } | null {
    const startTile = this.world.worldToTile(startX, startY);
    const goalTile = this.world.worldToTile(goalX, goalY);
    const startInWater = this.world.isTileSwimmableWater(
      startTile.tx,
      startTile.ty
    );
    const canTraverseWater = allowWater || startInWater;

    if (startTile.tx === goalTile.tx && startTile.ty === goalTile.ty) {
      return { x: goalX, y: goalY };
    }

    const maxTileDist = 14;
    let targetTx = goalTile.tx;
    let targetTy = goalTile.ty;
    const dtx = targetTx - startTile.tx;
    const dty = targetTy - startTile.ty;
    const tileDist = Math.hypot(dtx, dty);
    if (tileDist > maxTileDist) {
      const scale = maxTileDist / tileDist;
      targetTx = Math.round(startTile.tx + dtx * scale);
      targetTy = Math.round(startTile.ty + dty * scale);
    }

    interface AStarNode {
      tx: number;
      ty: number;
      g: number;
      f: number;
      parent: AStarNode | null;
    }

    const open: AStarNode[] = [
      {
        tx: startTile.tx,
        ty: startTile.ty,
        g: 0,
        f: Math.hypot(targetTx - startTile.tx, targetTy - startTile.ty),
        parent: null,
      },
    ];
    const closed = new Set<number>();
    const encodeKey = (tx: number, ty: number) =>
      ((tx - startTile.tx + 32) << 6) | ((ty - startTile.ty + 32) & 63);

    let bestNode: AStarNode = open[0];
    let bestH = open[0].f;
    let iterations = 0;
    const maxIterations = 115;

    const dirs: [number, number, number][] = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1.414],
      [1, -1, 1.414],
      [-1, 1, 1.414],
      [-1, -1, 1.414],
    ];

    while (open.length > 0 && iterations < maxIterations) {
      iterations++;
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open[bestIdx];
      open.splice(bestIdx, 1);

      const h = Math.hypot(targetTx - current.tx, targetTy - current.ty);
      if (h < bestH) {
        bestH = h;
        bestNode = current;
      }

      if (
        (current.tx === targetTx && current.ty === targetTy) ||
        (h <= 1.45 &&
          !this.isTileWalkableForCreature(
            targetTx,
            targetTy,
            allowClosedDoors,
            canTraverseWater
          ))
      ) {
        bestNode = current;
        break;
      }

      const cKey = encodeKey(current.tx, current.ty);
      if (closed.has(cKey)) continue;
      closed.add(cKey);

      for (const [dx, dy, cost] of dirs) {
        const ntx = current.tx + dx;
        const nty = current.ty + dy;
        if (
          Math.abs(ntx - startTile.tx) > maxTileDist ||
          Math.abs(nty - startTile.ty) > maxTileDist
        ) {
          continue;
        }
        const nKey = encodeKey(ntx, nty);
        if (closed.has(nKey)) continue;

        const isGoalTile = ntx === targetTx && nty === targetTy;
        if (
          !isGoalTile &&
          !this.isTileWalkableForCreature(
            ntx,
            nty,
            allowClosedDoors,
            canTraverseWater
          )
        ) {
          continue;
        }

        // Prevent diagonal corner-cutting across solid walls, boulders, or trees
        if (dx !== 0 && dy !== 0) {
          if (
            !this.isTileWalkableForCreature(
              current.tx + dx,
              current.ty,
              allowClosedDoors,
              canTraverseWater
            ) ||
            !this.isTileWalkableForCreature(
              current.tx,
              current.ty + dy,
              allowClosedDoors,
              canTraverseWater
            )
          ) {
            continue;
          }
        }

        // Apply higher traversal cost to swimmable water tiles so mobs naturally prefer bridges and dry shores
        const isStepWater = this.world.isTileSwimmableWater(ntx, nty);
        const stepCost = isStepWater ? cost * 2.8 : cost;

        const ng = current.g + stepCost;
        const nf = ng + Math.hypot(targetTx - ntx, targetTy - nty) * 1.05;
        const existing = open.find((o) => o.tx === ntx && o.ty === nty);
        if (!existing) {
          open.push({ tx: ntx, ty: nty, g: ng, f: nf, parent: current });
        } else if (ng < existing.g) {
          existing.g = ng;
          existing.f = nf;
          existing.parent = current;
        }
      }
    }

    const path: { tx: number; ty: number }[] = [];
    let curr: AStarNode | null = bestNode;
    while (curr && curr.parent) {
      path.unshift({ tx: curr.tx, ty: curr.ty });
      curr = curr.parent;
    }

    if (path.length === 0) return null;

    let chosenIdx = 0;
    const maxLookIdx = Math.min(path.length - 1, 3);
    for (let i = maxLookIdx; i >= 1; i--) {
      const wx = path[i].tx * TILE_SIZE + TILE_SIZE / 2;
      const wy = path[i].ty * TILE_SIZE + TILE_SIZE / 2;
      const destIsWater = this.world.isTileSwimmableWater(
        path[i].tx,
        path[i].ty
      );
      if (
        this.hasClearLineOfSight(
          startX,
          startY,
          wx,
          wy,
          allowClosedDoors,
          startInWater || destIsWater
        )
      ) {
        chosenIdx = i;
        break;
      }
    }

    return {
      x: path[chosenIdx].tx * TILE_SIZE + TILE_SIZE / 2,
      y: path[chosenIdx].ty * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  /**
   * Unified obstacle-aware steering controller for all NPCs & Mobs toward `(targetX, targetY)`:
   * 1. Evaluates whether the mob has a reason to enter water (`hasReasonToSwim`).
   * 2. Uses bounded A* + Line-of-Sight string-pulling when an obstacle or water body blocks the direct trajectory.
   * 3. Uses 16-direction Context Steering with water avoidance and species-specific `swimSpeed` when in water.
   */
  private steerCreatureToward(
    cr: CreatureEntity,
    targetX: number,
    targetY: number,
    desiredSpeed: number,
    dt: number,
    allowClosedDoors = false
  ): void {
    if (!cr.orbitSign) {
      let h = 0;
      for (let i = 0; i < cr.id.length; i++) h += cr.id.charCodeAt(i);
      cr.orbitSign = h % 2 === 0 ? 1 : -1;
    }

    const hasReasonToSwim = this.doesCreatureHaveReasonToSwim(
      cr,
      targetX,
      targetY
    );
    const crInWater = this.world.isWorldPosInWater(cr.x, cr.y);

    // 1. Determine immediate steering target (Direct Line-of-Sight vs A* Waypoint)
    let aimX = targetX;
    let aimY = targetY;
    const distToGoal = Math.hypot(targetX - cr.x, targetY - cr.y);

    if (cr.navRecalcTimer !== undefined && cr.navRecalcTimer > 0) {
      cr.navRecalcTimer = Math.max(0, cr.navRecalcTimer - dt);
    }

    // Only treat water as a direct line-of-sight if the creature is already in water
    if (
      distToGoal > 22 &&
      !this.hasClearLineOfSight(
        cr.x,
        cr.y,
        targetX,
        targetY,
        allowClosedDoors,
        crInWater
      )
    ) {
      const reachedWp =
        cr.navWaypointX !== undefined &&
        cr.navWaypointY !== undefined &&
        Math.hypot(cr.navWaypointX - cr.x, cr.navWaypointY - cr.y) < 13;

      if (
        cr.navWaypointX === undefined ||
        cr.navWaypointY === undefined ||
        reachedWp ||
        (cr.navRecalcTimer ?? 0) <= 0
      ) {
        const wp = this.computeNextPathWaypoint(
          cr.x,
          cr.y,
          targetX,
          targetY,
          allowClosedDoors,
          hasReasonToSwim
        );
        if (wp) {
          cr.navWaypointX = wp.x;
          cr.navWaypointY = wp.y;
        } else {
          cr.navWaypointX = targetX;
          cr.navWaypointY = targetY;
        }
        cr.navRecalcTimer = 0.35 + Math.random() * 0.15;
      }
      aimX = cr.navWaypointX ?? targetX;
      aimY = cr.navWaypointY ?? targetY;
    } else {
      cr.navWaypointX = undefined;
      cr.navWaypointY = undefined;
    }

    const desiredAngle = Math.atan2(aimY - cr.y, aimX - cr.x);
    this.steerCreatureAlongAngle(
      cr,
      desiredAngle,
      desiredSpeed,
      dt,
      allowClosedDoors,
      hasReasonToSwim
    );
  }

  /**
   * 16-Ray Context Steering along `desiredAngle` with multi-distance obstacle feelers,
   * natural water avoidance, species `swimSpeed` enforcement in water, and soft creature separation.
   */
  private steerCreatureAlongAngle(
    cr: CreatureEntity,
    desiredAngle: number,
    desiredSpeed: number,
    dt: number,
    allowClosedDoors = false,
    allowWater = false
  ): void {
    if (!cr.orbitSign) {
      cr.orbitSign = 1;
    }

    const crInWater = this.world.isWorldPosInWater(cr.x, cr.y);
    cr.isSwimming = crInWater;

    // Enforce the creature's specific swimming speed whenever it is in water!
    const swimSpeed = EntityManager.getCreatureSwimSpeed(cr);
    const activeSpeed = crInWater ? swimSpeed : desiredSpeed;

    // Automatically open a closed door immediately in front of an intelligent humanoid (Villager, Wanderer, Bandit)
    if (allowClosedDoors) {
      const doorLookX = cr.x + Math.cos(desiredAngle) * 18;
      const doorLookY = cr.y + Math.sin(desiredAngle) * 18;
      const doorTile = this.world.worldToTile(doorLookX, doorLookY);
      const { cx, cy } = this.world.tileToChunk(doorTile.tx, doorTile.ty);
      const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
      const doorSt = chunk?.structures.find(
        (s) =>
          s.tileX === doorTile.tx &&
          s.tileY === doorTile.ty &&
          (s.type === PlaceableType.WOOD_DOOR ||
            s.type === PlaceableType.IRON_GATE) &&
          !s.isOpen
      );
      if (doorSt) {
        doorSt.isOpen = true;
      }
    }

    const candidateOffsets = [
      0,
      0.28,
      -0.28,
      0.56,
      -0.56,
      0.86,
      -0.86,
      1.18,
      -1.18,
      1.52,
      -1.52,
      1.88,
      -1.88,
      2.28,
      -2.28,
      Math.PI,
    ];

    const currentHeading =
      Math.hypot(cr.vx, cr.vy) > 2
        ? Math.atan2(cr.vy, cr.vx)
        : desiredAngle;

    const evaluateCandidates = (permitWaterEntry: boolean) => {
      let chosenAngle = desiredAngle;
      let highestScore = -Infinity;

      for (const offset of candidateOffsets) {
        const cand = desiredAngle + offset;
        const cosC = Math.cos(cand);
        const sinC = Math.sin(cand);

        // Short feeler (13px) — must be collision-free
        const nearX = cr.x + cosC * 13;
        const nearY = cr.y + sinC * 13;
        if (!this.canEntityOccupy(nearX, nearY)) {
          continue;
        }

        const nearInWater = this.world.isWorldPosInWater(nearX, nearY);
        if (!crInWater && !permitWaterEntry && nearInWater) {
          continue; // Naturally avoid stepping into water when there is no reason!
        }

        // Goal alignment score (-1 .. +1)
        let score = Math.cos(offset) * 2.2;

        // Medium feeler (25px) — proactive curve before reaching trees/boulders/walls/water
        const midX = cr.x + cosC * 25;
        const midY = cr.y + sinC * 25;
        const midInWater = this.world.isWorldPosInWater(midX, midY);

        if (!this.canEntityOccupy(midX, midY)) {
          score -= 1.35;
        }

        if (!crInWater) {
          if (!permitWaterEntry && midInWater) {
            score -= 1.75; // Curve away from the shoreline smoothly when wandering
          } else if (permitWaterEntry && (nearInWater || midInWater)) {
            // Even when allowed to swim, prefer dry land if a dry path alongside is similarly aligned
            score -= nearInWater ? 0.95 : 0.45;
          }
        } else if (!allowWater && (!nearInWater || !midInWater)) {
          // If already in water without a reason to stay, strongly favor rays leading back onto dry land!
          score += !nearInWater ? 1.65 : 1.1;
        }

        // Shoulder clearance feelers (±0.38 rad at 15px)
        const leftClear = this.canEntityOccupy(
          cr.x + Math.cos(cand + 0.38) * 15,
          cr.y + Math.sin(cand + 0.38) * 15
        );
        const rightClear = this.canEntityOccupy(
          cr.x + Math.cos(cand - 0.38) * 15,
          cr.y + Math.sin(cand - 0.38) * 15
        );
        if (leftClear && rightClear) {
          score += 0.45;
        } else if (!leftClear && !rightClear) {
          score -= 0.65;
        }

        // Momentum continuity
        score += Math.cos(cand - currentHeading) * 0.55;
        if (offset !== 0 && offset * cr.orbitSign! > 0) {
          score += 0.12;
        }

        if (score > highestScore) {
          highestScore = score;
          chosenAngle = cand;
        }
      }
      return { chosenAngle, highestScore };
    };

    let evalRes = evaluateCandidates(allowWater);
    // Fallback: if cornered on a tiny sandbar where every dry ray is blocked, allow entering water so the mob doesn't freeze
    if (evalRes.highestScore === -Infinity && !allowWater) {
      evalRes = evaluateCandidates(true);
    }
    const bestAngle = evalRes.chosenAngle;

    if (cr.kind !== CreatureKind.WANDERER) {
      cr.wanderAngle = bestAngle;
    }

    // Soft separation from nearby creatures so mobs & villagers don't stack on top of one another
    let sepX = 0;
    let sepY = 0;
    for (const other of this.entities.creatures) {
      if (other.id === cr.id || other.hp <= 0 || other.isInsideHouse) continue;
      const dx = cr.x - other.x;
      const dy = cr.y - other.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.05 && d < 24) {
        const push = ((24 - d) / 24) * activeSpeed * 0.78;
        sepX += (dx / d) * push;
        sepY += (dy / d) * push;
      }
    }

    const targetVx = Math.cos(bestAngle) * activeSpeed + sepX;
    const targetVy = Math.sin(bestAngle) * activeSpeed + sepY;

    // Smooth velocity interpolation for natural curved trajectories
    const turnBlend = Math.min(1, dt * 11);
    cr.vx += (targetVx - cr.vx) * turnBlend;
    cr.vy += (targetVy - cr.vy) * turnBlend;
  }

  /**
   * Sunset & Night shelter routine for `CreatureKind.VILLAGER`:
   * During sunset and night (17:30 to 05:30), villagers head toward their assigned house,
   * actually enter the house (`isInsideHouse = true`, disappearing from the map until dawn),
   * and if called outside by a door knock (`outsideNightTimer > 0`), return inside after inactivity.
   */
  private updateVillagerSunsetHomeRoutine(cr: CreatureEntity, dt: number): void {
    if (cr.outsideNightTimer !== undefined && cr.outsideNightTimer > 0) {
      cr.outsideNightTimer = Math.max(0, cr.outsideNightTimer - dt);
      if (cr.outsideNightTimer > 0) {
        cr.vx = 0;
        cr.vy = 0;
        cr.aiState = 'idle';
        cr.direction = EntityManager.vectorToDirection(
          this.player.x - cr.x,
          this.player.y - cr.y,
          cr.direction
        );
        return;
      } else {
        this.addFloatingText(
          `🏠 ${cr.name} voltou a dormir`,
          cr.x,
          cr.y - 20,
          '#fb923c'
        );
      }
    }

    if (cr.homeHouseId) {
      let validAssignedHouse = false;
      for (const chunk of Object.values(this.world.chunks)) {
        if (!chunk) continue;
        const found = chunk.structures.find((s) => s.id === cr.homeHouseId);
        if (found && this.canNpcOccupyHouse(found)) {
          validAssignedHouse = true;
          break;
        }
      }
      if (!validAssignedHouse) {
        cr.homeHouseId = undefined;
        cr.homeX = undefined;
        cr.homeY = undefined;
      }
    }

    if (!cr.homeHouseId || cr.homeX === undefined || cr.homeY === undefined) {
      const nearbyHouse = this.findAvailableHouseNear(cr.x, cr.y, 280);
      if (nearbyHouse) {
        cr.homeHouseId = nearbyHouse.house.id;
        cr.homeX = nearbyHouse.wx;
        cr.homeY = nearbyHouse.wy;
      } else {
        this.updateWanderAi(cr, dt);
        return;
      }
    }

    const dx = cr.homeX - cr.x;
    const dy = cr.homeY - cr.y;
    const distHome = Math.hypot(dx, dy);

    if (distHome <= 34) {
      cr.isInsideHouse = true;
      cr.outsideNightTimer = 0;
      cr.vx = 0;
      cr.vy = 0;
      cr.aiState = 'stay';
      cr.x = cr.homeX;
      cr.y = cr.homeY;
      this.renderer.spawnBurst(cr.homeX, cr.homeY, 'WOOD', 5);
      this.renderer.spawnRipple(cr.homeX, cr.homeY, '#fde047', 18, 0.35);
      this.addFloatingText(
        `💤 ${cr.name} foi dormir`,
        cr.homeX,
        cr.homeY - 20,
        '#fde047'
      );
      this.emitUiSnapshot();
      return;
    }

    cr.aiState = 'wander';
    this.steerCreatureToward(
      cr,
      cr.homeX,
      cr.homeY,
      cr.moveSpeed * 1.08,
      dt,
      true
    );
  }

  /**
   * Directional walking AI for `CreatureKind.WANDERER`:
   * Follows a single straight-line trajectory (`wanderAngle`) and only changes direction
   * when blocked/impeded by an impassable barrier or water coastline, never walking in circles.
   * Only swims if already in water or completely surrounded by water with no dry land corridor.
   */
  private updateDirectionalWandererAi(cr: CreatureEntity, dt: number): void {
    if (cr.wanderAngle === undefined || !Number.isFinite(cr.wanderAngle)) {
      cr.wanderAngle = Math.random() * Math.PI * 2;
    }

    cr.aiState = 'wander';
    const crInWater = this.world.isWorldPosInWater(cr.x, cr.y);
    const walkSpeed = cr.moveSpeed * 0.82;
    const cosA = Math.cos(cr.wanderAngle);
    const sinA = Math.sin(cr.wanderAngle);

    if (!Number.isFinite(cr.targetX) || !Number.isFinite(cr.targetY)) {
      cr.targetX = cr.x;
      cr.targetY = cr.y;
      cr.aiTimer = 1.25;
    }

    cr.aiTimer -= dt;
    let isStuck = false;
    if (cr.aiTimer <= 0) {
      const movedDist = Math.hypot(cr.x - cr.targetX, cr.y - cr.targetY);
      if (movedDist < 8) {
        isStuck = true;
      }
      cr.targetX = cr.x;
      cr.targetY = cr.y;
      cr.aiTimer = 1.25;
    }

    const isDryAndClear = (px: number, py: number) =>
      this.canEntityOccupy(px, py) && !this.world.isWorldPosInWater(px, py);

    const clearNear = crInWater
      ? this.canEntityOccupy(cr.x + cosA * 15, cr.y + sinA * 15)
      : isDryAndClear(cr.x + cosA * 15, cr.y + sinA * 15);
    const clearMid = crInWater
      ? this.canEntityOccupy(cr.x + cosA * 30, cr.y + sinA * 30)
      : isDryAndClear(cr.x + cosA * 30, cr.y + sinA * 30);

    if (!isStuck && clearNear && clearMid) {
      this.steerCreatureAlongAngle(
        cr,
        cr.wanderAngle,
        walkSpeed,
        dt,
        true,
        crInWater
      );
      return;
    }

    // Immediate path has a small obstacle (tree/boulder): check if a dry point further along the SAME trajectory is clear
    if (!isStuck && !crInWater) {
      for (const lookAhead of [56, 84, 112]) {
        const ax = cr.x + cosA * lookAhead;
        const ay = cr.y + sinA * lookAhead;
        if (isDryAndClear(ax, ay)) {
          this.steerCreatureToward(cr, ax, ay, walkSpeed, dt, true);
          return;
        }
      }
    }

    // Impeded by coastline or barrier: pick a new single straight-line direction preferring dry land corridors!
    const turnSign = cr.orbitSign || 1;
    let bestNewAngle = cr.wanderAngle + Math.PI;
    let bestClearScore = -Infinity;

    for (let i = 1; i <= 16; i++) {
      const stepIdx = Math.ceil(i / 2);
      const dirSign = i % 2 === 1 ? turnSign : -turnSign;
      const offset = stepIdx * (Math.PI / 8) * dirSign;
      const candAngle = cr.wanderAngle + offset;
      const cCos = Math.cos(candAngle);
      const cSin = Math.sin(candAngle);

      let dryReach = 0;
      for (const dist of [16, 34, 56, 84, 116]) {
        if (isDryAndClear(cr.x + cCos * dist, cr.y + cSin * dist)) {
          dryReach = dist;
        } else {
          break;
        }
      }

      if (dryReach < 34) continue;

      const score = dryReach + Math.cos(offset) * 18;
      if (score > bestClearScore) {
        bestClearScore = score;
        bestNewAngle = candAngle;
      }
    }

    // If no dry corridor was found (e.g. stranded on a tiny islet), allow swimming toward any open water direction
    let mustSwim = false;
    if (bestClearScore === -Infinity) {
      mustSwim = true;
      for (let i = 1; i <= 16; i++) {
        const offset = i * (Math.PI / 8);
        const candAngle = cr.wanderAngle + offset;
        const cCos = Math.cos(candAngle);
        const cSin = Math.sin(candAngle);
        if (this.canEntityOccupy(cr.x + cCos * 34, cr.y + cSin * 34)) {
          bestNewAngle = candAngle;
          break;
        }
      }
    }

    cr.wanderAngle = Math.atan2(Math.sin(bestNewAngle), Math.cos(bestNewAngle));
    cr.navWaypointX = undefined;
    cr.navWaypointY = undefined;
    cr.targetX = cr.x;
    cr.targetY = cr.y;
    cr.aiTimer = 1.25;

    this.steerCreatureAlongAngle(
      cr,
      cr.wanderAngle,
      walkSpeed,
      dt,
      true,
      crInWater || mustSwim
    );
  }

  /**
   * Selects a realistic, dry-land wander destination `(targetX, targetY)` for a creature.
   * - Mobs naturally avoid water when picking wander destinations.
   * - If a mob is currently in water (e.g. after a chase ended), it actively searches for the nearest dry land tile to swim out!
   */
  private pickWalkableWanderTarget(cr: CreatureEntity): { x: number; y: number } | null {
    const crInWater = this.world.isWorldPosInWater(cr.x, cr.y);

    // If currently in water, prioritize finding the nearest dry land tile to swim back ashore!
    if (crInWater) {
      for (let r = 28; r <= 220; r += 24) {
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2;
          const candX = cr.x + Math.cos(ang) * r;
          const candY = cr.y + Math.sin(ang) * r;
          if (
            !this.world.isWorldPosInWater(candX, candY) &&
            this.canEntityOccupy(candX, candY)
          ) {
            return { x: candX, y: candY };
          }
        }
      }
    }

    const anchorX = cr.homeX ?? cr.x;
    const anchorY = cr.homeY ?? cr.y;
    const maxRadius = cr.kind === CreatureKind.VILLAGER ? 115 : 135;

    // Villagers have a 45% chance to stroll toward a nearby Village Point of Interest (Well, Market Stall, Campfire)
    if (cr.kind === CreatureKind.VILLAGER && Math.random() < 0.45) {
      const aTile = this.world.worldToTile(anchorX, anchorY);
      const aChunk = this.world.tileToChunk(aTile.tx, aTile.ty);
      const pois: { x: number; y: number }[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const chunk =
            this.world.chunks[
              WorldManager.chunkKey(aChunk.cx + dx, aChunk.cy + dy)
            ];
          if (!chunk) continue;
          for (const st of chunk.structures) {
            if (
              st.type === PlaceableType.VILLAGE_WELL ||
              st.type === PlaceableType.MARKET_STALL ||
              st.type === PlaceableType.CAMPFIRE ||
              st.type === PlaceableType.HEALING_FOUNTAIN
            ) {
              const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
              const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2 + 22;
              if (
                Math.hypot(sx - anchorX, sy - anchorY) <= maxRadius * 1.35 &&
                !this.world.isWorldPosInWater(sx, sy) &&
                this.canEntityOccupy(sx, sy)
              ) {
                pois.push({ x: sx, y: sy });
              }
            }
          }
        }
      }
      if (pois.length > 0) {
        return pois[Math.floor(Math.random() * pois.length)];
      }
    }

    // Try up to 12 candidate points on dry land around the creature's home/current area
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 36 + Math.random() * (maxRadius - 36);
      const candX = anchorX + Math.cos(angle) * dist;
      const candY = anchorY + Math.sin(angle) * dist;
      if (
        Math.hypot(candX - cr.x, candY - cr.y) >= 28 &&
        !this.world.isWorldPosInWater(candX, candY) &&
        this.canEntityOccupy(candX, candY)
      ) {
        return { x: candX, y: candY };
      }
    }

    return null;
  }

  private updateWanderAi(cr: CreatureEntity, dt: number): void {
    // 1. Wild Sheep smartly flee away from nearby hostile Monsters using obstacle-aware Context Steering
    //    (They avoid water unless cornered against the shoreline with no dry escape route)
    if (!cr.tamed && cr.kind === CreatureKind.SHEEP) {
      let threatX = 0;
      let threatY = 0;
      let threatCount = 0;
      for (const other of this.entities.creatures) {
        if (
          other.hp > 0 &&
          !other.isInsideHouse &&
          (EntityManager.isMonsterKind(other.kind) || other.isHostile)
        ) {
          const d = Math.hypot(cr.x - other.x, cr.y - other.y);
          if (d < 130) {
            const weight = (130 - d) / 130;
            threatX += ((cr.x - other.x) / Math.max(1, d)) * weight;
            threatY += ((cr.y - other.y) / Math.max(1, d)) * weight;
            threatCount++;
          }
        }
      }
      if (threatCount > 0) {
        cr.aiState = 'flee';
        const fleeAngle = Math.atan2(threatY, threatX);
        this.steerCreatureAlongAngle(
          cr,
          fleeAngle,
          cr.moveSpeed * 1.2,
          dt,
          false,
          false
        );
        return;
      }
    }

    // If the creature is currently in water during normal wander/idle, do not pause in water — swim back to dry land!
    const crInWater = this.world.isWorldPosInWater(cr.x, cr.y);

    // 2. Waypoint-based natural wandering & patrolling with pause intervals
    cr.aiTimer -= dt;
    if (
      cr.aiTimer <= 0 ||
      (crInWater &&
        (cr.aiState === 'idle' ||
          this.world.isWorldPosInWater(cr.targetX || cr.x, cr.targetY || cr.y)))
    ) {
      if (!crInWater && cr.aiState === 'wander' && Math.random() < 0.36) {
        cr.aiState = 'idle';
        cr.aiTimer = 1.6 + Math.random() * 2.2;
        cr.targetX = cr.x;
        cr.targetY = cr.y;
      } else {
        const dest = this.pickWalkableWanderTarget(cr);
        if (dest) {
          cr.aiState = 'wander';
          cr.targetX = dest.x;
          cr.targetY = dest.y;
          cr.aiTimer = 3.2 + Math.random() * 3.8;
        } else {
          cr.aiState = 'idle';
          cr.aiTimer = 1.5 + Math.random() * 1.5;
        }
      }
    }

    if (cr.aiState === 'idle') {
      cr.vx *= Math.max(0, 1 - dt * 8);
      cr.vy *= Math.max(0, 1 - dt * 8);
      if (Math.hypot(cr.vx, cr.vy) < 1.5) {
        cr.vx = 0;
        cr.vy = 0;
      }
      return;
    }

    const distToTarget = Math.hypot((cr.targetX || cr.x) - cr.x, (cr.targetY || cr.y) - cr.y);
    if (distToTarget <= 16 && !crInWater) {
      cr.aiState = 'idle';
      cr.aiTimer = Math.min(cr.aiTimer, 1.4 + Math.random() * 1.8);
      cr.vx *= 0.5;
      cr.vy *= 0.5;
      return;
    }

    const wanderSpeed =
      cr.kind === CreatureKind.VILLAGER
        ? cr.moveSpeed * 0.72
        : cr.moveSpeed * 0.68;
    this.steerCreatureToward(
      cr,
      cr.targetX || cr.x,
      cr.targetY || cr.y,
      wanderSpeed,
      dt,
      cr.kind === CreatureKind.VILLAGER
    );
  }

  /**
   * Free-roaming Graze AI ('graze' / "Pastar") for Tamed Pets:
   * Pet walks freely around its surroundings while preserving `cr.aiState = 'graze'` and `cr.tamed = true`.
   */
  private updatePetGrazeAi(cr: CreatureEntity, dt: number): void {
    cr.aiState = 'graze';
    const crInWater = this.world.isWorldPosInWater(cr.x, cr.y);

    cr.aiTimer -= dt;
    if (
      cr.aiTimer <= 0 ||
      (crInWater &&
        this.world.isWorldPosInWater(cr.targetX || cr.x, cr.targetY || cr.y))
    ) {
      if (!crInWater && Math.random() < 0.42) {
        // Pause in place to graze on the grass
        cr.aiTimer = 1.8 + Math.random() * 2.5;
        cr.targetX = cr.x;
        cr.targetY = cr.y;
      } else {
        const dest = this.pickWalkableWanderTarget(cr);
        if (dest) {
          cr.targetX = dest.x;
          cr.targetY = dest.y;
          cr.aiTimer = 3.0 + Math.random() * 3.5;
        } else {
          cr.targetX = cr.x;
          cr.targetY = cr.y;
          cr.aiTimer = 1.6 + Math.random() * 1.5;
        }
      }
    }

    const distToTarget = Math.hypot(
      (cr.targetX ?? cr.x) - cr.x,
      (cr.targetY ?? cr.y) - cr.y
    );
    if (distToTarget <= 15 && !crInWater) {
      cr.vx *= Math.max(0, 1 - dt * 8);
      cr.vy *= Math.max(0, 1 - dt * 8);
      if (Math.hypot(cr.vx, cr.vy) < 1.5) {
        cr.vx = 0;
        cr.vy = 0;
      }
      return;
    }

    this.steerCreatureToward(
      cr,
      cr.targetX ?? cr.x,
      cr.targetY ?? cr.y,
      cr.moveSpeed * 0.62,
      dt,
      false
    );
  }

  private updateDroppedItems(dt: number): void {
    // Expire pending drop claim timers on Guest if Host hasn't responded after 1.5s
    for (const [dropId, timer] of this.pendingDropClaimTimers.entries()) {
      const next = timer - dt;
      if (next <= 0) {
        this.pendingDropClaimTimers.delete(dropId);
      } else {
        this.pendingDropClaimTimers.set(dropId, next);
      }
    }

    // Expire world action anti-duplication keys after 3 seconds
    const nowMs = Date.now();
    for (const [actionKey, expiresAt] of this.claimedWorldActionKeys.entries()) {
      if (nowMs >= expiresAt) {
        this.claimedWorldActionKeys.delete(actionKey);
      }
    }

    for (let i = this.droppedItems.length - 1; i >= 0; i--) {
      const drop = this.droppedItems[i];
      if (!drop) continue;
      if (this.claimedDropIds.has(drop.id)) {
        this.droppedItems.splice(i, 1);
        continue;
      }
      drop.bobTimer += dt;
      if (drop.pickupDelay > 0) {
        drop.pickupDelay -= dt;
        continue;
      }

      const dist = Math.hypot(this.player.x - drop.x, this.player.y - drop.y);
      if (dist < 48) {
        drop.x += ((this.player.x - drop.x) / Math.max(1, dist)) * 150 * dt;
        drop.y += ((this.player.y - drop.y) / Math.max(1, dist)) * 150 * dt;
      }

      if (dist < 18) {
        // Check if inventory has room BEFORE claiming
        if (!this.canFitItemInInventory(drop.itemId, drop.count)) {
          continue;
        }

        // In online Guest mode, request authoritative atomic claim from Host to prevent 2 players picking up the same item
        if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
          if (!this.pendingDropClaimTimers.has(drop.id)) {
            this.pendingDropClaimTimers.set(drop.id, 1.2);
            this.multiplayer.sendWorldInteractRequest({
              action: 'pickup_drop_claim',
              dropId: drop.id,
              itemId: drop.itemId,
              count: drop.count,
            });
          }
          continue;
        }

        // Host or Offline: atomically claim and award
        if (this.claimedDropIds.has(drop.id)) {
          this.droppedItems.splice(i, 1);
          continue;
        }
        const added = this.addItemToInventory(drop.itemId, drop.count);
        if (added) {
          this.claimedDropIds.add(drop.id);
          soundManager.playPickup();
          this.renderer.spawnBurst(drop.x, drop.y, 'GOLD', 5);
          const itemDef = ITEMS[drop.itemId];
          this.addFloatingText(
            `+${drop.count} ${itemDef ? itemDef.name : drop.itemId}`,
            this.player.x,
            this.player.y - 18,
            '#4ade80'
          );
          const pickedId = drop.id;
          this.droppedItems.splice(i, 1);
          this.multiplayer.sendPickupDrop(pickedId);
          this.emitUiSnapshot();
        }
      }
    }

    // Update 10-minute (600s) expiration countdown on all active Death Bags
    for (let i = this.deathBags.length - 1; i >= 0; i--) {
      const bag = this.deathBags[i];
      bag.expiresTimer -= dt;
      if (bag.expiresTimer <= 0) {
        this.deathBags.splice(i, 1);
        this.addFloatingText(
          '⏳ Uma Bolsinha de Espólios desapareceu (10 min esgotados)!',
          this.player.x,
          this.player.y - 26,
          '#f43f5e'
        );
        if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
          this.multiplayer.sendDeathBagsSync(this.deathBags);
        }
        this.emitUiSnapshot();
      }
    }
  }

  private agricultureUpdateTimer = 0;

  private updateWorldObjects(dt: number): void {
    // Advance moisture evaporation and crop growth stages on a 0.5s tick instead of scanning all chunks every frame
    this.agricultureUpdateTimer += dt;
    if (this.agricultureUpdateTimer >= 0.5) {
      const stepDt = this.agricultureUpdateTimer;
      this.agricultureUpdateTimer = 0;
      this.world.updateAgriculture(stepDt, false);
    }
    // Advance active Campfire & Furnace smelting/cooking queues
    this.updateThermalStations(dt);

    const pTile = this.world.worldToTile(this.player.x, this.player.y);
    const pChunk = this.world.tileToChunk(pTile.tx, pTile.ty);

    this.totemZapTimer += dt;
    const canZap = this.totemZapTimer >= 1.8;
    if (canZap) this.totemZapTimer = 0;

    this.spikeTrapTimer += dt;
    const canSpike = this.spikeTrapTimer >= 0.85;
    if (canSpike) this.spikeTrapTimer = 0;

    let regeneratedAnyBreakable = false;

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const key = WorldManager.chunkKey(pChunk.cx + dx, pChunk.cy + dy);
        const chunk = this.world.chunks[key];
        if (!chunk) continue;

        for (const node of chunk.nodes) {
          if (node.hitFlashTimer > 0) {
            node.hitFlashTimer = Math.max(0, node.hitFlashTimer - dt);
          }
          // Minecraft-style continuous breaking: if breaking stops or becomes inactive, regenerate full HP
          if (node.hp < node.maxHp) {
            node.breakIdleTimer = (node.breakIdleTimer ?? 0) - dt;
            if (node.breakIdleTimer <= 0) {
              node.hp = node.maxHp;
              node.breakIdleTimer = 0;
              if (this.activeBreakingTargetId === node.id) {
                this.activeBreakingTargetId = null;
              }
              regeneratedAnyBreakable = true;
            }
          }
        }

        for (const st of chunk.structures) {
          if (st.hitFlashTimer > 0) {
            st.hitFlashTimer = Math.max(0, st.hitFlashTimer - dt);
          }
          // Minecraft-style continuous breaking: if breaking stops or becomes inactive, regenerate full HP
          if (st.hp < st.maxHp) {
            st.breakIdleTimer = (st.breakIdleTimer ?? 0) - dt;
            if (st.breakIdleTimer <= 0) {
              st.hp = st.maxHp;
              st.breakIdleTimer = 0;
              if (this.activeBreakingTargetId === st.id) {
                this.activeBreakingTargetId = null;
              }
              regeneratedAnyBreakable = true;
            }
          }

          if (canZap && st.type === PlaceableType.GUARDIAN_TOTEM) {
            const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
            const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
            for (const cr of this.entities.creatures) {
              if (cr.isHostile && Math.hypot(cr.x - sx, cr.y - sy) < 220) {
                this.renderer.spawnLightningBolt(sx, sy - 8, cr.x, cr.y, '#fde047');
                this.renderer.spawnBurst(cr.x, cr.y, 'SPARK', 10);
                this.damageCreature(cr, 25, sx, sy);
                this.addFloatingText('Raio Solar!', cr.x, cr.y - 22, '#fde047');
                break;
              }
            }
          }

          if (canSpike && st.type === PlaceableType.SPIKE_TRAP) {
            const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
            const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
            for (let ci = this.entities.creatures.length - 1; ci >= 0; ci--) {
              const cr = this.entities.creatures[ci];
              if (cr.isHostile && Math.hypot(cr.x - sx, cr.y - sy) < 24) {
                this.renderer.spawnBurst(cr.x, cr.y, 'BLOOD', 7);
                this.damageCreature(cr, 18, sx, sy, 0.4);
                this.addFloatingText('Espinhos! -18', cr.x, cr.y - 22, '#fb923c');
              }
            }
          }

          if (
            st.type === PlaceableType.MARKET_STALL &&
            st.pendingCustomerOffer
          ) {
            const offer = st.pendingCustomerOffer;
            offer.expiresTimer -= dt;
            const buyer = this.entities.creatures.find(
              (c) =>
                c.id === offer.buyerId &&
                c.hp > 0 &&
                !c.isInsideHouse &&
                !c.isHostile
            );
            const slot = st.stallSlots?.[offer.slotIndex];
            const slotValid =
              slot &&
              slot.enabled &&
              slot.itemId === offer.itemId &&
              slot.count >= offer.quantity;

            if (offer.expiresTimer <= 0 || !buyer || !slotValid) {
              const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
              const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
              st.pendingCustomerOffer = null;
              if (buyer) {
                buyer.stallInspectCooldown = 22;
              }
              this.addFloatingText(
                '⌛ Oferta de compra na tenda expirou',
                sx,
                sy - 20,
                '#94a3b8'
              );
              this.emitUiSnapshot();
            }
          }
        }
      }
    }

    if (regeneratedAnyBreakable) {
      this.emitUiSnapshot();
    }
  }

  /**
   * Restores full HP (`maxHp`) to any partially-broken NatureNode or PlacedStructure
   * whenever breaking is interrupted (e.g., player switches target, attacks a creature, or swings at air).
   */
  private resetInterruptedBreakingTargets(activeTargetId: string | null): void {
    const pTile = this.world.worldToTile(this.player.x, this.player.y);
    const pChunk = this.world.tileToChunk(pTile.tx, pTile.ty);
    let restoredAny = false;

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const chunk =
          this.world.chunks[
            WorldManager.chunkKey(pChunk.cx + dx, pChunk.cy + dy)
          ];
        if (!chunk) continue;
        for (const node of chunk.nodes) {
          if (node.id !== activeTargetId && node.hp < node.maxHp) {
            node.hp = node.maxHp;
            node.breakIdleTimer = 0;
            restoredAny = true;
          }
        }
        for (const st of chunk.structures) {
          if (st.id !== activeTargetId && st.hp < st.maxHp) {
            st.hp = st.maxHp;
            st.breakIdleTimer = 0;
            restoredAny = true;
          }
        }
      }
    }

    this.activeBreakingTargetId = activeTargetId;
    if (restoredAny) {
      this.emitUiSnapshot();
    }
  }

  // =========================================================================
  // THREE DEDICATED RIGHT-THUMB ACTIONS (Attack/Tool, Interact, Place/Consume)
  // =========================================================================

  /**
   * BUTTON 1: BOTÃO PRINCIPAL — Ataque ou Uso de Ferramenta na Mão
   */
  public performAttackOrHarvestAction(): void {
    if (this.isPaused || this.isGameOver) return;
    if (this.player.swingTimer > 0) return;

    const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];
    const heldItem = heldSlot ? ITEMS[heldSlot.itemId] : null;

    if (
      this.player.fishingState?.active ||
      heldItem?.toolType === ToolType.FISHING_ROD ||
      heldItem?.id === 'fishing_rod'
    ) {
      this.handleFishingRodAction();
      return;
    }

    this.player.swingDuration = this.getPlayerAttackCooldownSec();
    this.player.swingTimer = this.player.swingDuration;
    this.player.stamina = Math.max(0, this.player.stamina - 3);
    soundManager.playSwing();

    const reach = heldItem?.attackRange || 46;
    let dirVec = this.getDirectionOffset(this.player.direction);

    // Smart Combat Auto-Aim: If a hostile monster/enemy (or explicitly tapped target) is within melee combat range,
    // automatically face toward the priority enemy so the player can fight side-by-side with allies effortlessly!
    let priorityLockTarget: CreatureEntity | null = null;
    if (this.preferredTargetCreatureId) {
      const pref = this.entities.creatures.find(
        (c) =>
          c.id === this.preferredTargetCreatureId &&
          c.hp > 0 &&
          !c.tamed &&
          !c.isInsideHouse
      );
      this.preferredTargetCreatureId = null;
      if (pref && Math.hypot(pref.x - this.player.x, pref.y - this.player.y) <= reach * 1.35) {
        const isPeacefulNpc =
          (pref.kind === CreatureKind.VILLAGER || pref.kind === CreatureKind.WANDERER) &&
          !pref.isHostile;
        if (!isPeacefulNpc || this.innocentFireEnabled) {
          priorityLockTarget = pref;
        }
      }
    }

    if (!priorityLockTarget) {
      let bestHostileScore = Infinity;
      for (const cr of this.entities.creatures) {
        if (cr.hp <= 0 || cr.tamed || cr.isInsideHouse) continue;
        const isHostileEnemy = EntityManager.isMonsterKind(cr.kind) || cr.isHostile;
        if (!isHostileEnemy) continue;

        const dx = cr.x - this.player.x;
        const dy = cr.y - this.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= reach * 1.25) {
          // Favor enemies in front of the player, but still catch enemies right next to the player in a brawl
          const dot =
            dist > 0.001 ? (dx / dist) * dirVec.x + (dy / dist) * dirVec.y : 1;
          const anglePenalty = dot >= 0.15 ? 0 : dot >= -0.35 ? 14 : 32;
          const score = dist + anglePenalty;
          if (score < bestHostileScore) {
            bestHostileScore = score;
            priorityLockTarget = cr;
          }
        }
      }
    }

    if (priorityLockTarget) {
      const dx = priorityLockTarget.x - this.player.x;
      const dy = priorityLockTarget.y - this.player.y;
      this.player.direction = EntityManager.vectorToDirection(
        dx,
        dy,
        this.player.direction
      );
      dirVec = this.getDirectionOffset(this.player.direction);
    }

    const hitCenterX = priorityLockTarget
      ? this.player.x +
        ((priorityLockTarget.x - this.player.x) /
          Math.max(1, Math.hypot(priorityLockTarget.x - this.player.x, priorityLockTarget.y - this.player.y))) *
          Math.min(reach * 0.65, Math.hypot(priorityLockTarget.x - this.player.x, priorityLockTarget.y - this.player.y))
      : this.player.x + dirVec.x * (reach * 0.65);
    const hitCenterY = priorityLockTarget
      ? this.player.y +
        ((priorityLockTarget.y - this.player.y) /
          Math.max(1, Math.hypot(priorityLockTarget.x - this.player.x, priorityLockTarget.y - this.player.y))) *
          Math.min(reach * 0.65, Math.hypot(priorityLockTarget.x - this.player.x, priorityLockTarget.y - this.player.y))
      : this.player.y + dirVec.y * (reach * 0.65);

    const strengthBuff =
      this.player.strengthBuffTimer && this.player.strengthBuffTimer > 0
        ? 1.35
        : 1.0;
    const strengthMult =
      (1 + Math.max(0, this.player.attributes.strength || 0) * 0.12) *
      strengthBuff;
    const baseAttack = (heldItem?.attackDamage || 4) * strengthMult;
    const baseHarvest = (heldItem?.harvestPower || 10) * strengthMult;
    const equippedTool = heldItem?.toolType || ToolType.NONE;
    const equippedTier = heldItem?.toolTier || 0;
    const knockbackMult = heldItem?.knockbackMult || 1.0;

    // A. Categorize Creatures in hit arc by strict Combat Priority:
    //    Tier 1: Hostile Enemies & Monsters (ALWAYS hit first; never hit allies alongside them!)
    //    Tier 2: Wild Neutral Fauna (Sheep, Boar, Camel)
    //    Tier 3: Peaceful NPCs (Villager, Wanderer) — ONLY hit if no enemies/fauna in arc AND innocentFireEnabled is ON!
    const hostileTargetsInArc: CreatureEntity[] = [];
    const neutralFaunaInArc: CreatureEntity[] = [];
    const peacefulNpcsInArc: CreatureEntity[] = [];

    for (let i = this.entities.creatures.length - 1; i >= 0; i--) {
      const cr = this.entities.creatures[i];
      if (cr.hp <= 0 || cr.tamed || cr.isInsideHouse) continue;
      const dist = Math.hypot(cr.x - hitCenterX, cr.y - hitCenterY);
      const isLockTarget = priorityLockTarget && cr.id === priorityLockTarget.id;
      if (dist <= reach * 0.85 || isLockTarget) {
        const isHostileEnemy = EntityManager.isMonsterKind(cr.kind) || cr.isHostile;
        const isPeacefulNpc =
          (cr.kind === CreatureKind.VILLAGER || cr.kind === CreatureKind.WANDERER) &&
          !cr.isHostile;

        if (isHostileEnemy) {
          hostileTargetsInArc.push(cr);
        } else if (isPeacefulNpc) {
          peacefulNpcsInArc.push(cr);
        } else {
          neutralFaunaInArc.push(cr);
        }
      }
    }

    const sortByLockAndDistance = (a: CreatureEntity, b: CreatureEntity): number => {
      if (priorityLockTarget) {
        if (a.id === priorityLockTarget.id) return -1;
        if (b.id === priorityLockTarget.id) return 1;
      }
      const da = Math.hypot(a.x - hitCenterX, a.y - hitCenterY);
      const db = Math.hypot(b.x - hitCenterX, b.y - hitCenterY);
      return da - db;
    };

    hostileTargetsInArc.sort(sortByLockAndDistance);
    neutralFaunaInArc.sort(sortByLockAndDistance);
    peacefulNpcsInArc.sort(sortByLockAndDistance);

    const rawTargetsToHit =
      hostileTargetsInArc.length > 0
        ? hostileTargetsInArc
        : neutralFaunaInArc.length > 0
        ? neutralFaunaInArc
        : this.innocentFireEnabled
        ? peacefulNpcsInArc
        : [];

    // Respect weapon attackTargetScope:
    // - 'area' (em área): hits all mobs in the aimed area
    // - 'single' (individual, default): hits only 1 mob
    const isAreaAttack = heldItem?.attackTargetScope === 'area';
    const targetsToHit = isAreaAttack
      ? rawTargetsToHit
      : rawTargetsToHit.slice(0, 1);

    if (targetsToHit.length > 0) {
      this.resetInterruptedBreakingTargets(null);
      for (const cr of targetsToHit) {
        this.damageCreature(
          cr,
          Math.round(baseAttack),
          this.player.x,
          this.player.y,
          knockbackMult
        );
      }
      if (heldItem?.lifesteal && heldItem.lifesteal > 0) {
        this.player.hp = Math.min(
          this.player.maxHp,
          this.player.hp + heldItem.lifesteal
        );
        this.addFloatingText(
          `+${heldItem.lifesteal} HP Dreno`,
          this.player.x,
          this.player.y - 24,
          '#c084fc'
        );
      }
      return;
    }

    // If the player swung directly at a peaceful NPC while "Fogo Inocente" is OFF and no enemies were around,
    // show a protective safety hint if no resource/structure is harvested below.
    const blockedPeacefulNpc =
      !this.innocentFireEnabled && peacefulNpcsInArc.length > 0
        ? peacefulNpcsInArc[0]
        : null;

    // B1. Agricultural Tools: Hoe (Tilling) & Watering Can (Refilling / Hydration)
    if (equippedTool === ToolType.HOE) {
      const tile = this.world.worldToTile(hitCenterX, hitCenterY);
      const { cx, cy } = this.world.tileToChunk(tile.tx, tile.ty);
      const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
      const existingSoil = chunk?.structures.find(
        (s) =>
          s.tileX === tile.tx &&
          s.tileY === tile.ty &&
          s.type === PlaceableType.TILLED_SOIL
      );

      if (existingSoil && !existingSoil.cropType) {
        const sIdx = chunk!.structures.indexOf(existingSoil);
        if (sIdx !== -1) {
          chunk!.structures.splice(sIdx, 1);
          soundManager.playHitWood();
          this.renderer.spawnBurst(
            tile.tx * TILE_SIZE + 16,
            tile.ty * TILE_SIZE + 16,
            'STONE',
            6
          );
          this.addFloatingText(
            'Solo Aplanado',
            tile.tx * TILE_SIZE + 16,
            tile.ty * TILE_SIZE,
            '#a16207'
          );
          this.syncChunkAtTile(tile.tx, tile.ty);
          this.emitUiSnapshot();
          return;
        }
      } else if (this.world.canTillTileAt(tile.tx, tile.ty)) {
        const soil = this.world.tillSoilAt(tile.tx, tile.ty);
        if (soil) {
          soundManager.playHitWood();
          this.gainXp(5);
          this.renderer.spawnBurst(
            tile.tx * TILE_SIZE + 16,
            tile.ty * TILE_SIZE + 16,
            'STONE',
            8
          );
          this.renderer.spawnRipple(
            tile.tx * TILE_SIZE + 16,
            tile.ty * TILE_SIZE + 16,
            '#78350f',
            20,
            0.35
          );
          this.addFloatingText(
            'Solo Arado! (+5 XP)',
            tile.tx * TILE_SIZE + 16,
            tile.ty * TILE_SIZE,
            '#a16207'
          );
          this.syncChunkAtTile(tile.tx, tile.ty);
          this.emitUiSnapshot();
          return;
        }
      }
    }

    // Watering can refill & irrigation are triggered via the Interact button (performInteractAction)
    if (
      equippedTool === ToolType.WATERING_CAN ||
      heldItem?.id === 'watering_can' ||
      heldItem?.id === 'watering_can_full'
    ) {
      // Do not consume watering can charges or refill on the Attack/Break button
    }

    // B2. Check Nature Nodes & Dismantling Structures strictly at the visually selected target or forward look tile
    const aimedForBreak = this.getAimedTarget();
    const forwardLookTile = aimedForBreak
      ? this.world.worldToTile(aimedForBreak.worldX, aimedForBreak.worldY)
      : this.world.worldToTile(
          this.player.x + dirVec.x * 28,
          this.player.y + dirVec.y * 28
        );
    const pChunk = this.world.tileToChunk(
      forwardLookTile.tx,
      forwardLookTile.ty
    );

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.world.getOrCreateChunk(
          pChunk.cx + dx,
          pChunk.cy + dy
        );

        for (let ni = chunk.nodes.length - 1; ni >= 0; ni--) {
          const node = chunk.nodes[ni];
          if (
            node.tileX === forwardLookTile.tx &&
            node.tileY === forwardLookTile.ty
          ) {
            this.harvestNatureNode(
              chunk,
              ni,
              heldItem?.id || null,
              equippedTool,
              equippedTier,
              strengthMult
            );
            return;
          }
        }

        for (let si = chunk.structures.length - 1; si >= 0; si--) {
          const st = chunk.structures[si];
          const matchesAimedStruct = aimedForBreak?.structureId
            ? st.id === aimedForBreak.structureId
            : st.tileX === forwardLookTile.tx &&
              st.tileY === forwardLookTile.ty;
          if (matchesAimedStruct) {
            const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
            const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
            const isWorldFixedLandmark = Boolean(
              (st.villageId || st.id.startsWith('world_struct_')) &&
                st.type === PlaceableType.HEALING_FOUNTAIN
            );
            if (isWorldFixedLandmark) {
              this.resetInterruptedBreakingTargets(null);
              soundManager.playHitStone();
              this.addFloatingText(
                'Estrutura ancestral fixa do mundo',
                sx,
                sy - 16,
                '#f43f5e'
              );
              return;
            }

            const req = getStructureBreakRequirement(st.type);
            const evalBreak = evaluateMaterialBreak(
              heldItem?.id || null,
              equippedTool,
              equippedTier,
              strengthMult,
              req.materialKind,
              req.requiredTool,
              req.requiredTier
            );

            if (!evalBreak.canBreak) {
              this.resetInterruptedBreakingTargets(null);
              soundManager.playHitStone();
              this.addFloatingText(
                evalBreak.blockReason || req.requirementLabel,
                sx,
                sy - 16,
                '#f43f5e'
              );
              return;
            }

            this.resetInterruptedBreakingTargets(st.id);
            const structDmg = evalBreak.force;
            st.hp -= structDmg;
            st.hitFlashTimer = 0.15;
            st.breakIdleTimer = 1.15;
            if (req.requiredTool === ToolType.PICKAXE) {
              soundManager.playHitStone();
              this.renderer.spawnBurst(sx, sy, 'STONE', st.hp <= 0 ? 14 : 7);
              this.renderer.spawnBurst(sx, sy, 'SPARK', 4);
            } else {
              soundManager.playHitWood();
              this.renderer.spawnBurst(sx, sy, 'WOOD', st.hp <= 0 ? 14 : 7);
            }
            this.renderer.spawnRipple(sx, sy, '#fbbf24', 18, 0.3);
            this.addFloatingText(`-${structDmg}`, sx, sy - 12, '#fde047');

            if (st.hp <= 0) {
              this.activeBreakingTargetId = null;
              const structBreakKey = `break_struct:${st.id}:${st.tileX},${st.tileY}`;
              if (!this.tryClaimWorldAction(structBreakKey)) {
                chunk.structures.splice(si, 1);
                this.emitUiSnapshot();
                return;
              }

              // Check enclosed structure ownership BEFORE removing the broken structure
              const enclosedOwnerInfo = this.getEnclosedBuildingOwnerInfo(
                st.tileX,
                st.tileY
              );
              const isEnclosedVillagerOwned =
                enclosedOwnerInfo?.ownerType === 'VILLAGER';

              // Villagers become hostile when the player BREAKS an owned village structure
              // (an enclosed house owned by a villager, a bed owned by a villager, a well, a market stall, or a village chest)
              const isOwnedVillageStructure =
                isEnclosedVillagerOwned ||
                (st.ownerType !== 'PLAYER' &&
                  Boolean(
                    st.villageId ||
                      st.ownerType === 'VILLAGER' ||
                      st.id.startsWith('world_struct_')
                  ) &&
                  (st.type === PlaceableType.VILLAGE_HOUSE ||
                    st.type === PlaceableType.BED ||
                    st.type === PlaceableType.VILLAGE_WELL ||
                    st.type === PlaceableType.MARKET_STALL ||
                    st.type === PlaceableType.CHEST));

              // If the broken structure is the primary rest point of an enclosed building,
              // the enclosed structure becomes UNOWNED even if another rest point with an owner is inside!
              if (
                this.isRestPointStructure(st) &&
                (st.isPrimaryStructureOwner ||
                  enclosedOwnerInfo?.primaryRestPoint?.id === st.id)
              ) {
                this.clearEnclosedBuildingOwnershipOnLoss(
                  st.tileX,
                  st.tileY,
                  st.id
                );
              }

              if (this.isRestPointStructure(st)) {
                for (const resident of this.getHouseResidents(st.id)) {
                  if (resident.isInsideHouse) {
                    this.exitVillagerFromHouse(resident, false);
                  }
                  resident.homeHouseId = undefined;
                  resident.homeX = undefined;
                  resident.homeY = undefined;
                }
              }

              if (isOwnedVillageStructure) {
                this.provokeVillage(
                  st.villageId || enclosedOwnerInfo?.villageId,
                  null,
                  45,
                  '⚔ Estrutura com dono destruída! Os aldeões ficaram hostis!'
                );
              }

              if (st.type === PlaceableType.CHEST) {
                this.dropChestContents(st, sx, sy);
                this.addFloatingText(
                  '💥 Baú quebrado! Itens caíram no chão!',
                  sx,
                  sy - 20,
                  '#fde047'
                );
              } else if (st.type === PlaceableType.MARKET_STALL) {
                this.dropMarketStallContents(st, sx, sy);
                this.addFloatingText(
                  '💥 Tenda destruída! Recolha-a para ser o dono!',
                  sx,
                  sy - 20,
                  '#fde047'
                );
              } else if (
                st.type === PlaceableType.CAMPFIRE ||
                st.type === PlaceableType.FURNACE
              ) {
                this.dropThermalStationContents(st, sx, sy, false);
              }
              this.spawnDrop(st.itemId, 1, sx, sy);
              chunk.structures.splice(si, 1);

              // If a supporting wall was destroyed, also drop and remove any Torch attached to that wall!
              if (WorldManager.isWallMountableStructure(st.type)) {
                for (let ti = chunk.structures.length - 1; ti >= 0; ti--) {
                  const other = chunk.structures[ti];
                  if (
                    other.tileX === st.tileX &&
                    other.tileY === st.tileY &&
                    other.type === PlaceableType.TORCH
                  ) {
                    this.spawnDrop(other.itemId || 'torch', 1, sx, sy);
                    chunk.structures.splice(ti, 1);
                  }
                }
              }
            }
            this.syncChunkAtTile(st.tileX, st.tileY);
            this.emitUiSnapshot();
            return;
          }
        }
      }
    }

    // Swung without hitting a breakable node/structure: interrupt any active breaking progress
    this.resetInterruptedBreakingTargets(null);

    if (blockedPeacefulNpc) {
      this.addFloatingText(
        '🛡️ Aliado Protegido (Fogo Inocente OFF)',
        blockedPeacefulNpc.x,
        blockedPeacefulNpc.y - 24,
        '#38bdf8'
      );
    }
  }

  private tryUseWateringCanInteraction(target?: AimedTargetInfo | null): boolean {
    const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];
    const heldItem = heldSlot ? ITEMS[heldSlot.itemId] : null;
    if (
      !heldItem ||
      (heldItem.toolType !== ToolType.WATERING_CAN &&
        heldItem.id !== 'watering_can' &&
        heldItem.id !== 'watering_can_full')
    ) {
      return false;
    }

    const dirVec = this.getDirectionOffset(this.player.direction);
    const lookX = target ? target.worldX : this.player.x + dirVec.x * 28;
    const lookY = target ? target.worldY : this.player.y + dirVec.y * 28;
    const tile = this.world.worldToTile(lookX, lookY);

    const isWaterTile =
      target?.kind === 'water_source' ||
      this.world.isTileSwimmableWater(tile.tx, tile.ty) ||
      this.world.computeBiomeAtTile(tile.tx, tile.ty) === BiomeType.OCEAN;
    const structAtTile = this.world.getStructureAtTile(tile.tx, tile.ty);
    const isWaterSource =
      target?.stationType === PlaceableType.VILLAGE_WELL ||
      target?.stationType === PlaceableType.HEALING_FOUNTAIN ||
      structAtTile?.type === PlaceableType.VILLAGE_WELL ||
      structAtTile?.type === PlaceableType.HEALING_FOUNTAIN;

    if (isWaterTile || isWaterSource) {
      this.player.swingDuration = 0.22;
      this.player.swingTimer = 0.22;
      const newSlot: InventorySlot & { charges?: number } = {
        itemId: 'watering_can_full',
        count: 1,
        charges: 12,
      };
      this.player.inventory[this.player.selectedHotbarIndex] = newSlot;
      soundManager.playTameSuccess();
      this.renderer.spawnBurst(lookX, lookY, 'WATER', 14);
      this.renderer.spawnRipple(lookX, lookY, '#38bdf8', 26, 0.45);
      this.addFloatingText(
        'Regador Enchido! (12/12 Cargas de Água) 💧',
        this.player.x,
        this.player.y - 20,
        '#38bdf8'
      );
      this.emitUiSnapshot();
      return true;
    }

    const { cx, cy } = this.world.tileToChunk(tile.tx, tile.ty);
    const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
    const soilSt = chunk?.structures.find(
      (s) =>
        (target?.structureId ? s.id === target.structureId : true) &&
        s.tileX === tile.tx &&
        s.tileY === tile.ty &&
        s.type === PlaceableType.TILLED_SOIL
    );

    if (soilSt) {
      // Allow harvesting a fully mature stage 3 crop if already watered, or water it if dry/growing
      if (soilSt.cropType && soilSt.growthStage === 3) {
        return false;
      }

      if (heldItem.id === 'watering_can') {
        soundManager.playSwing();
        this.addFloatingText(
          'Regador vazio! Interaja com um rio, mar ou poço para encher 💧',
          this.player.x,
          this.player.y - 20,
          '#38bdf8'
        );
        return true;
      }

      this.player.swingDuration = 0.22;
      this.player.swingTimer = 0.22;
      soilSt.isWatered = true;
      soilSt.waterLevel = 100;
      soundManager.playTameSuccess();
      this.renderer.spawnBurst(
        tile.tx * TILE_SIZE + 16,
        tile.ty * TILE_SIZE + 16,
        'WATER',
        10
      );
      this.renderer.spawnRipple(
        tile.tx * TILE_SIZE + 16,
        tile.ty * TILE_SIZE + 16,
        '#60a5fa',
        20,
        0.35
      );

      const currentSlot =
        this.player.inventory[this.player.selectedHotbarIndex];
      if (currentSlot) {
        const currentCharges =
          (currentSlot as any).charges !== undefined
            ? (currentSlot as any).charges
            : 12;
        const newCharges = currentCharges - 1;
        if (newCharges <= 0) {
          this.player.inventory[this.player.selectedHotbarIndex] = {
            itemId: 'watering_can',
            count: 1,
          };
          this.addFloatingText(
            'Solo Irrigado! O regador esvaziou',
            tile.tx * TILE_SIZE + 16,
            tile.ty * TILE_SIZE,
            '#38bdf8'
          );
        } else {
          (currentSlot as any).charges = newCharges;
          this.addFloatingText(
            `Solo Irrigado! (${newCharges}/12) 💧`,
            tile.tx * TILE_SIZE + 16,
            tile.ty * TILE_SIZE,
            '#38bdf8'
          );
        }
      }
      this.syncChunkAtTile(tile.tx, tile.ty);
      this.emitUiSnapshot();
      return true;
    }

    return false;
  }

  /**
   * BUTTON 2: BOTÃO DE INTERAÇÃO — Interage com aquilo que está sendo mirado (Bancada, Fornalha, Altar, Fogueira, Animal, Regador ou Recurso)
   */
  public performInteractAction(): void {
    if (this.isPaused || this.isGameOver) return;

    const target = this.getAimedTarget();
    if (this.tryUseWateringCanInteraction(target)) {
      return;
    }

    if (!target) {
      this.addFloatingText(
        'Nada próximo para interagir',
        this.player.x,
        this.player.y - 20,
        '#94a3b8'
      );
      return;
    }

    // 0A. Interacting with a Player Death Bag ("Bolsinha de Espólios") -> Recover all items!
    if (target.kind === 'death_bag' && target.deathBagId) {
      this.lootDeathBag(target.deathBagId);
      return;
    }

    // 0. Interacting with a Village NPC -> Opens NPC Trade, Affinity & Diplomacy Modal!
    if (target.kind === 'villager' && target.creatureId) {
      const npc = this.entities.creatures.find(
        (c) => c.id === target.creatureId && !c.isInsideHouse
      );
      if (!npc) return;

      // If the village/NPC is hostile, the player MUST be holding the Peace Item (Tratado da Paz Real) in hand to talk to them!
      if (npc.isHostile && !this.isPlayerHoldingPeaceItem()) {
        soundManager.playHitWood();
        this.renderer.spawnRipple(npc.x, npc.y, '#ef4444', 24, 0.4);
        this.addFloatingText(
          '⚔ Vila Hostil! Segure o Tratado da Paz Real na mão para falar!',
          npc.x,
          npc.y - 26,
          '#f87171'
        );
        return;
      }

      // Refresh night door-knock timer so the villager stays outside while talking with the player
      if (npc.outsideNightTimer && npc.outsideNightTimer > 0) {
        npc.outsideNightTimer = 20;
      }
      soundManager.playPickup();
      if (this.onNpcInteract) {
        this.onNpcInteract(npc);
      }
      return;
    }

    // 0B. Interacting with a Crop or Farmland
    if (target.kind === 'crop') {
      const tile = this.world.worldToTile(target.worldX, target.worldY);
      const { cx, cy } = this.world.tileToChunk(tile.tx, tile.ty);
      const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
      const soilSt = chunk?.structures.find(
        (s) =>
          (target.structureId ? s.id === target.structureId : true) &&
          s.tileX === tile.tx &&
          s.tileY === tile.ty &&
          s.type === PlaceableType.TILLED_SOIL
      );

      if (soilSt) {
        if (soilSt.cropType && soilSt.growthStage === 3) {
          const cropHarvestKey = `harvest_crop:${tile.tx},${tile.ty}`;
          if (!this.tryClaimWorldAction(cropHarvestKey)) {
            return;
          }
          const crop = soilSt.cropType;
          let harvestItem = crop;
          let seedItem = 'wheat_seeds';
          let produceCount = 2 + Math.floor(Math.random() * 2);
          let seedCount = 1 + (Math.random() < 0.65 ? 1 : 0);
          let xpGain = 18;

          if (crop === 'wheat') {
            harvestItem = 'wheat';
            seedItem = 'wheat_seeds';
            xpGain = 16;
          } else if (crop === 'carrot') {
            harvestItem = 'carrot';
            seedItem = 'carrot_seeds';
            xpGain = 18;
          } else if (crop === 'medic_herb') {
            harvestItem = 'medic_herb';
            seedItem = 'herb_seeds';
            produceCount = 1 + Math.floor(Math.random() * 2);
            xpGain = 24;
          } else if (crop === 'solar_bloom') {
            harvestItem = 'solar_bloom';
            seedItem = 'solar_seeds';
            produceCount = 1 + (Math.random() < 0.4 ? 1 : 0);
            seedCount = 1;
            xpGain = 32;
          } else if (crop === 'berry') {
            harvestItem = 'berry';
            seedItem = 'berry_seeds';
            produceCount = 2 + Math.floor(Math.random() * 3);
            seedCount = 1;
            xpGain = 15;
          }

          if (crop === 'berry') {
            soilSt.growthStage = 2;
            soilSt.growthProgress = 0;
            soilSt.fertilized = false;
          } else {
            soilSt.cropType = undefined;
            soilSt.growthStage = 0;
            soilSt.growthProgress = 0;
            soilSt.fertilized = false;
          }

          this.spawnDrop(harvestItem, produceCount, target.worldX, target.worldY);
          if (seedCount > 0) {
            this.spawnDrop(
              seedItem,
              seedCount,
              target.worldX + (Math.random() - 0.5) * 12,
              target.worldY + (Math.random() - 0.5) * 12
            );
          }

          soundManager.playLevelUp();
          this.gainXp(xpGain);
          this.renderer.spawnBurst(target.worldX, target.worldY - 4, 'LEAF', 14);
          this.renderer.spawnBurst(target.worldX, target.worldY - 4, 'GOLD', 8);
          this.renderer.spawnRipple(target.worldX, target.worldY, '#22c55e', 24, 0.45);
          const cropName = ITEMS[harvestItem]?.name || harvestItem;
          this.addFloatingText(
            `Colheita: +${produceCount} ${cropName}! (+${xpGain} XP)`,
            target.worldX,
            target.worldY - 20,
            '#4ade80'
          );
          this.syncChunkAtTile(tile.tx, tile.ty);
          this.emitUiSnapshot();
          return;
        } else if (soilSt.cropType) {
          const cropName = ITEMS[soilSt.cropType]?.name || soilSt.cropType;
          const status = soilSt.isWatered
            ? 'em desenvolvimento saudável'
            : 'precisa de água para crescer';
          this.addFloatingText(`${cropName}: ${status}`, target.worldX, target.worldY - 18, '#fbbf24');
          return;
        } else {
          this.addFloatingText(
            'Solo pronto. Equipe sementes na barra para plantar!',
            target.worldX,
            target.worldY - 18,
            '#38bdf8'
          );
          return;
        }
      }
      return;
    }

    // 1. Interacting with a Placed Crafting Station or Interactive Door/Gate
    if (target.kind === 'station' && target.stationType) {
      if (
        target.stationType === PlaceableType.WOOD_DOOR ||
        target.stationType === PlaceableType.IRON_GATE
      ) {
        const { tx, ty } = this.world.worldToTile(target.worldX, target.worldY);
        const { cx, cy } = this.world.tileToChunk(tx, ty);
        const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
        const doorSt = chunk?.structures.find(
          (s) =>
            s.tileX === tx &&
            s.tileY === ty &&
            (s.type === PlaceableType.WOOD_DOOR ||
              s.type === PlaceableType.IRON_GATE)
        );
        if (doorSt) {
          // If this door belongs to a house with villagers currently sleeping/sheltered inside, knock on the door to call them out!
          if (this.isStructureValidHouse(doorSt)) {
            const insideResidents = this.getStructureSleepingResidents(doorSt);
            if (insideResidents.length > 0) {
              this.knockOnHouseDoor(doorSt, insideResidents);
              return;
            }
          }

          doorSt.isOpen = !doorSt.isOpen;
          soundManager.playHitWood();
          this.renderer.spawnRipple(
            target.worldX,
            target.worldY,
            doorSt.isOpen ? '#4ade80' : '#fde047',
            20,
            0.35
          );
          this.renderer.spawnBurst(target.worldX, target.worldY, 'WOOD', 5);
          this.addFloatingText(
            doorSt.isOpen ? '🔓 Aberto (Passagem Livre)' : '🔒 Fechado (Hitbox Sólida)',
            target.worldX,
            target.worldY - 20,
            doorSt.isOpen ? '#4ade80' : '#fde047'
          );
          this.syncChunkAtTile(tx, ty);
          this.emitUiSnapshot();
        }
        return;
      }

      if (target.stationType === PlaceableType.MARKET_STALL) {
        const { tx, ty } = this.world.worldToTile(target.worldX, target.worldY);
        const { cx, cy } = this.world.tileToChunk(tx, ty);
        const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
        const stallStruct = chunk?.structures.find(
          (s) =>
            s.tileX === tx &&
            s.tileY === ty &&
            s.type === PlaceableType.MARKET_STALL
        );
        if (stallStruct) {
          this.ensureMarketStallInitialized(stallStruct);
          soundManager.playPickup();
          this.renderer.spawnRipple(
            target.worldX,
            target.worldY,
            stallStruct.pendingCustomerOffer ? '#fde047' : '#4ade80',
            24,
            0.42
          );
          if (this.onMarketStallInteract) {
            this.onMarketStallInteract(stallStruct);
          } else if (this.onStationInteract) {
            this.onStationInteract(PlaceableType.WORKBENCH);
          }
        }
        return;
      }

      if (
        target.stationType === PlaceableType.WORKBENCH ||
        target.stationType === PlaceableType.FURNACE ||
        target.stationType === PlaceableType.SOLAR_ALTAR
      ) {
        const { tx, ty } = this.world.worldToTile(target.worldX, target.worldY);
        const stAtTile = this.world.getStructureAtTile(tx, ty);
        if (stAtTile) {
          this.activeStationStructureId = stAtTile.id;
        }
        soundManager.playPickup();
        this.renderer.spawnRipple(
          target.worldX,
          target.worldY,
          target.stationType === PlaceableType.SOLAR_ALTAR ? '#38bdf8' : '#fbbf24',
          22,
          0.4
        );
        if (this.onStationInteract) {
          this.onStationInteract(target.stationType);
        }
        return;
      }

      if (target.stationType === PlaceableType.VILLAGE_WELL) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
        this.player.hunger = Math.min(this.player.maxHunger, this.player.hunger + 20);
        this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + 55);
        soundManager.playTameSuccess();
        this.renderer.spawnBurst(target.worldX, target.worldY - 4, 'WATER', 12);
        this.renderer.spawnBurst(this.player.x, this.player.y, 'HEAL', 10);
        this.renderer.spawnRipple(target.worldX, target.worldY, '#38bdf8', 28, 0.55);
        this.addFloatingText(
          'Água Fresca do Poço (+20 HP / +20 Fome / +55 Energia)',
          this.player.x,
          this.player.y - 22,
          '#38bdf8'
        );
        this.emitUiSnapshot();
        return;
      }

      if (target.stationType === PlaceableType.CAMPFIRE) {
        const { tx, ty } = this.world.worldToTile(target.worldX, target.worldY);
        const stAtTile = this.world.getStructureAtTile(tx, ty);
        if (stAtTile) {
          this.activeStationStructureId = stAtTile.id;
        }
        this.setPlayerRespawnPoint(
          target.worldX,
          target.worldY,
          'Fogueira de Acampamento'
        );
        if (this.campfireRestCooldown <= 0) {
          this.campfireRestCooldown = 8;
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 18);
          this.player.stamina = this.player.maxStamina;
          this.renderer.spawnBurst(target.worldX, target.worldY - 4, 'SPARK', 10);
          this.renderer.spawnBurst(this.player.x, this.player.y, 'HEAL', 8);
        }
        soundManager.playPickup();
        this.renderer.spawnRipple(target.worldX, target.worldY, '#fb923c', 24, 0.45);
        if (this.onStationInteract) {
          this.onStationInteract(PlaceableType.CAMPFIRE);
        }
        this.emitUiSnapshot();
        return;
      }

      if (
        target.stationType === PlaceableType.BED ||
        target.stationType === PlaceableType.EXPLORER_TENT ||
        target.stationType === PlaceableType.VILLAGE_HOUSE
      ) {
        const { tx, ty } = this.world.worldToTile(target.worldX, target.worldY);
        const houseSt = this.world.getStructureAtTile(tx, ty);
        if (houseSt) {
          const allResidents = this.getHouseResidents(houseSt.id);
          const insideResidents = allResidents.filter((r) => r.isInsideHouse);
          // If residents are currently sleeping in this bed/house, wake/call them to interact!
          if (insideResidents.length > 0) {
            this.knockOnHouseDoor(houseSt, insideResidents);
            return;
          }

          // If this bed/house belongs to living Villagers, the player cannot sleep in their bed
          if (houseSt.ownerType !== 'PLAYER' && allResidents.length > 0) {
            soundManager.playHitWood();
            this.renderer.spawnRipple(
              target.worldX,
              target.worldY,
              '#fde047',
              22,
              0.4
            );
            const maxCap =
              houseSt.type === PlaceableType.BED ? 1 : MAX_VILLAGERS_PER_HOUSE;
            this.addFloatingText(
              `🛏️ Cama de ${houseSt.ownerName || 'Aldeão da Vila'} (${allResidents.length}/${maxCap})`,
              target.worldX,
              target.worldY - 22,
              '#fde047'
            );
            this.emitUiSnapshot();
            return;
          }

          // If the rest point (or its enclosing structure) has NO owner, automatically claim ownership ("Tomar Posse") for the player!
          if (this.canPlayerClaimRestPoint(houseSt)) {
            this.claimRestPointOwnership(houseSt.id);
          }
        }

        const restLabel =
          target.stationType === PlaceableType.BED
            ? 'Cama de Madeira'
            : target.stationType === PlaceableType.VILLAGE_HOUSE
            ? 'Cabana Medieval'
            : 'Tenda de Explorador';
        this.setPlayerRespawnPoint(target.worldX, target.worldY, restLabel);

        const isNightOrDusk =
          this.metadata.timeOfDay >= 18 || this.metadata.timeOfDay < 5.5;
        this.player.hp = this.player.maxHp;
        this.player.stamina = this.player.maxStamina;
        this.renderer.spawnBurst(this.player.x, this.player.y, 'HEAL', 14);
        this.renderer.spawnRipple(this.player.x, this.player.y, '#4ade80', 30, 0.6);
        if (isNightOrDusk) {
          if (this.metadata.timeOfDay >= 18) {
            this.metadata.dayCount += 1;
          }
          this.metadata.timeOfDay = 6.5;
          // Any villager who slept in their house resets their daily purchase & inspection limits at dawn!
          for (const cr of this.entities.creatures) {
            if (
              cr.kind === CreatureKind.VILLAGER &&
              (cr.isInsideHouse || cr.homeHouseId)
            ) {
              cr.hasBoughtToday = false;
              cr.attractedStallId = undefined;
              cr.stallInspectionsToday = {};
            } else if (cr.kind === CreatureKind.WANDERER) {
              cr.hasBoughtToday = false;
              cr.attractedStallId = undefined;
              cr.stallInspectionsToday = {};
            }
          }
          soundManager.playLevelUp();
          this.addFloatingText(
            `Dormiu até o Amanhecer (Dia ${this.metadata.dayCount}) · Ponto de Renascimento salvo!`,
            this.player.x,
            this.player.y - 24,
            '#fde047'
          );
          this.multiplayer.sendTimeSync(
            this.metadata.timeOfDay,
            this.metadata.dayCount
          );
          this.saveGame(true);
        } else {
          soundManager.playTameSuccess();
          this.addFloatingText(
            `Descansou em ${restLabel} (100% Vida & Ponto de Renascimento salvo!)`,
            this.player.x,
            this.player.y - 22,
            '#4ade80'
          );
        }
        this.emitUiSnapshot();
        return;
      }

      if (target.stationType === PlaceableType.HEALING_FOUNTAIN) {
        this.player.hp = this.player.maxHp;
        this.player.stamina = this.player.maxStamina;
        for (const pet of this.entities.creatures) {
          if (pet.tamed) pet.hp = pet.maxHp;
        }
        soundManager.playTameSuccess();
        this.renderer.spawnBurst(target.worldX, target.worldY - 6, 'WATER', 14);
        this.renderer.spawnBurst(this.player.x, this.player.y, 'HEAL', 16);
        this.renderer.spawnRipple(target.worldX, target.worldY, '#38bdf8', 34, 0.65);
        this.addFloatingText(
          'Bênção das Águas Abissais (Herói & Pets 100% Curados!)',
          this.player.x,
          this.player.y - 24,
          '#38bdf8'
        );
        this.emitUiSnapshot();
        return;
      }

      if (target.stationType === PlaceableType.CHEST) {
        const { tx, ty } = this.world.worldToTile(target.worldX, target.worldY);
        const { cx, cy } = this.world.tileToChunk(tx, ty);
        const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
        const chestStruct = chunk?.structures.find(
          (s) =>
            s.tileX === tx &&
            s.tileY === ty &&
            s.type === PlaceableType.CHEST
        );
        if (chestStruct) {
          this.ensureChestStorageInitialized(chestStruct);

          // Village Guild Chest Permission Lock: Cannot be opened without village permission!
          // Without permission, the only way to access the items is by breaking the chest so its items drop on the ground.
          if (chestStruct.villageId) {
            if (!this.hasVillageChestPermission(chestStruct.villageId)) {
              soundManager.playHitWood();
              this.renderer.spawnRipple(
                target.worldX,
                target.worldY,
                '#f43f5e',
                24,
                0.45
              );
              this.addFloatingText(
                '🔒 Cofre da Vila Trancado! Sem permissão (Requer ♥75+ ou quebre o baú)',
                target.worldX,
                target.worldY - 26,
                '#f43f5e'
              );
              this.emitUiSnapshot();
              return;
            } else {
              this.addFloatingText(
                '♥ Aliado da Vila: Acesso ao Cofre da Guilda autorizado!',
                target.worldX,
                target.worldY - 34,
                '#4ade80'
              );
            }
          }

          if (chestStruct.lootItems && chestStruct.lootItems.length > 0) {
            chestStruct.lootItems = [];
            soundManager.playLevelUp();
            this.gainXp(40);
            this.renderer.spawnBurst(target.worldX, target.worldY - 4, 'GOLD', 16);
            this.renderer.spawnRipple(target.worldX, target.worldY, '#fde047', 26, 0.5);
            this.addFloatingText(
              '✦ Tesouro Descoberto! (+40 XP)',
              target.worldX,
              target.worldY - 22,
              '#fde047'
            );
          } else {
            soundManager.playPickup();
            this.renderer.spawnBurst(target.worldX, target.worldY - 4, 'GOLD', 6);
            this.renderer.spawnRipple(target.worldX, target.worldY, '#fde047', 18, 0.35);
          }

          chestStruct.isOpen = true;
          this.syncChunkAtTile(tx, ty);
          if (this.onChestInteract) {
            this.onChestInteract(chestStruct);
          }
          this.emitUiSnapshot();
        }
        return;
      }
    }

    // 2. Interacting with a Wild Domesticable Animal -> Tame!
    if (target.kind === 'wild_animal' && target.creatureId) {
      const wild = this.entities.creatures.find((c) => c.id === target.creatureId);
      if (!wild) return;

      let foodSlotIdx = -1;
      const held = this.player.inventory[this.player.selectedHotbarIndex];
      if (held && wild.favoriteFoodIds.includes(held.itemId)) {
        foodSlotIdx = this.player.selectedHotbarIndex;
      } else {
        foodSlotIdx = this.player.inventory.findIndex(
          (s) => s !== null && wild.favoriteFoodIds.includes(s.itemId)
        );
      }

      if (foodSlotIdx === -1) {
        const favNames = wild.favoriteFoodIds
          .map((id) => ITEMS[id]?.name || id)
          .join(' ou ');
        this.addFloatingText(
          `Requer ${favNames} na mochila`,
          wild.x,
          wild.y - 20,
          '#fde047'
        );
        return;
      }

      const foodId = this.player.inventory[foodSlotIdx]!.itemId;
      this.consumeInventoryAt(foodSlotIdx, 1);

      const gain = foodId === 'taming_treat' ? 100 : 50;
      wild.tameProgress = Math.min(100, wild.tameProgress + gain);

      if (wild.tameProgress >= 100) {
        wild.tamed = true;
        wild.ownerId = this.getLocalOwnerId();
        wild.ownerName =
          this.multiplayer.localPlayerName ||
          this.settings.playerName ||
          'Aventureiro';
        wild.aiState = 'follow';
        wild.hp = wild.maxHp;
        soundManager.playTameSuccess();
        this.renderer.spawnBurst(wild.x, wild.y - 6, 'TAME', 16);
        this.renderer.spawnRipple(wild.x, wild.y, '#f43f5e', 28, 0.55);
        this.addFloatingText(
          `♥ ${wild.name} Domesticado! (Dono: ${wild.ownerName})`,
          wild.x,
          wild.y - 22,
          '#f43f5e'
        );
        this.gainXp(45);
      } else {
        soundManager.playPickup();
        this.renderer.spawnBurst(wild.x, wild.y - 6, 'TAME', 8);
        this.renderer.spawnRipple(wild.x, wild.y, '#f472b6', 20, 0.4);
        this.addFloatingText(
          `Domesticação ${wild.tameProgress}% ♥`,
          wild.x,
          wild.y - 20,
          '#f472b6'
        );
      }
      if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
        this.multiplayer.sendGuestMountEvent({
          action: 'tame',
          creatureId: wild.id,
          tamed: wild.tamed,
          tameProgress: wild.tameProgress,
          aiState: wild.aiState,
          hp: wild.hp,
          ownerId: wild.ownerId,
          ownerName: wild.ownerName,
        });
      } else if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
        this.multiplayer.sendCreaturesSync(this.entities.creatures);
      }
      this.emitUiSnapshot();
      return;
    }

    // 3. Interacting with a Tamed Animal or Boat
    if (target.kind === 'tamed_animal' && target.creatureId) {
      const tamed = this.entities.creatures.find((c) => c.id === target.creatureId);
      if (!tamed) return;

      // 3A. Boat: Mount or Dismount (shared 2-seat watercraft)
      if (tamed.kind === CreatureKind.BOAT) {
        if (this.player.mountedEntityId === tamed.id) {
          this.dismountCreature();
        } else {
          this.mountCreature(tamed.id);
        }
        return;
      }

      // Exclusive pet/mount ownership check: Only the owner of a Horse, Camel, Sheep, or Boar can interact with it!
      if (!this.isCreatureOwnedByLocalPlayer(tamed)) {
        soundManager.playHitWood();
        this.renderer.spawnRipple(tamed.x, tamed.y, '#ef4444', 22, 0.35);
        this.addFloatingText(
          `🔒 ${tamed.name} pertence exclusivamente a ${tamed.ownerName || 'outro jogador'}!`,
          tamed.x,
          tamed.y - 22,
          '#f43f5e'
        );
        return;
      }

      const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];

      // 3B. Holding Food + Pressing Interact: Heal tamed pet!
      if (heldSlot && this.isFoodItemForPet(heldSlot.itemId, tamed)) {
        if (tamed.hp < tamed.maxHp) {
          const foodDef = ITEMS[heldSlot.itemId];
          const baseHeal =
            (foodDef?.hpRestore || 0) +
            Math.round((foodDef?.hungerRestore || 0) * 0.65);
          const isFav = tamed.favoriteFoodIds.includes(heldSlot.itemId);
          const healAmount = Math.max(
            isFav ? 32 : 20,
            Math.round(baseHeal * (isFav ? 1.25 : 1.0))
          );
          const prevHp = tamed.hp;
          tamed.hp = Math.min(tamed.maxHp, tamed.hp + healAmount);
          const actualHealed = Math.max(1, Math.round(tamed.hp - prevHp));
          if (tamed.mountMaxStamina) {
            tamed.mountStamina = Math.min(
              tamed.mountMaxStamina,
              (tamed.mountStamina ?? tamed.mountMaxStamina) + 35
            );
          }

          this.consumeInventoryAt(this.player.selectedHotbarIndex, 1);
          soundManager.playTameSuccess();
          this.renderer.spawnBurst(tamed.x, tamed.y - 8, 'HEAL', 14);
          this.renderer.spawnRipple(tamed.x, tamed.y, '#4ade80', 24, 0.45);
          this.addFloatingText(
            `♥ +${actualHealed} HP (${tamed.name}: ${Math.round(tamed.hp)}/${tamed.maxHp})`,
            tamed.x,
            tamed.y - 22,
            '#4ade80'
          );

          if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
            this.multiplayer.sendGuestMountEvent({
              action: 'tame',
              creatureId: tamed.id,
              tamed: true,
              tameProgress: 100,
              aiState: tamed.aiState,
              hp: tamed.hp,
              ownerId: tamed.ownerId,
              ownerName: tamed.ownerName,
            });
          } else if (
            this.multiplayer.isOnline &&
            this.multiplayer.role === 'HOST'
          ) {
            this.multiplayer.sendCreaturesSync(this.entities.creatures);
          }
          this.emitUiSnapshot();
        } else {
          soundManager.playPickup();
          this.addFloatingText(
            `♥ ${tamed.name} já está com a vida cheia (${tamed.maxHp}/${tamed.maxHp})!`,
            tamed.x,
            tamed.y - 22,
            '#4ade80'
          );
        }
        return;
      }

      // 3C. Horse or Camel: If holding a Saddle and unsaddled, equip the Saddle!
      if (
        (tamed.kind === CreatureKind.HORSE || tamed.kind === CreatureKind.CAMEL) &&
        !tamed.hasSaddle &&
        heldSlot &&
        heldSlot.itemId === 'saddle'
      ) {
        this.equipSaddleOnCreature(tamed.id);
        return;
      }

      // 3D. Saddled Horse or Camel: Interacting removes and collects the Saddle/Alforje if inventory has room!
      if (
        (tamed.kind === CreatureKind.HORSE || tamed.kind === CreatureKind.CAMEL) &&
        tamed.hasSaddle
      ) {
        this.removeSaddleFromCreature(tamed.id);
        return;
      }

      // 3E. Unsaddled Horse/Camel or Sheep/Boar: Cycle through 3 Pet States ('follow' -> 'stay' -> 'graze')
      this.toggleTamedAnimalState(tamed.id);
      soundManager.playPickup();
      const stateLabel =
        tamed.aiState === 'stay'
          ? 'Estado: Base (Parado)'
          : tamed.aiState === 'graze'
          ? 'Estado: Pastar (Livre)'
          : 'Estado: Seguindo (Aliado)';
      this.addFloatingText(stateLabel, tamed.x, tamed.y - 20, '#fde047');
      return;
    }

    // 4. Inspecting a Nature Node
    if (target.kind === 'node') {
      soundManager.playPickup();
      this.addFloatingText(
        `${target.label}: ${target.actionHint}`,
        target.worldX,
        target.worldY - 20,
        '#38bdf8'
      );
    }
  }

  /**
   * BUTTON 3: BOTÃO COLOCAR / CONSUMIR — Faz referência ao item segurado na mão (Construir, Consumir ou Equipar)
   */
  public performUseOrPlaceHeldItemAction(): void {
    if (this.isPaused || this.isGameOver) return;

    const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];
    const heldItem = heldSlot ? ITEMS[heldSlot.itemId] : null;

    if (!heldItem) {
      this.addFloatingText(
        'Mão vazia: selecione um item na barra',
        this.player.x,
        this.player.y - 20,
        '#94a3b8'
      );
      return;
    }

    // 0A. Planting Seeds on Tilled Soil
    if (heldItem.seedCropType) {
      const target = this.getTargetTileForPlacement();
      if (!target) return;
      const { cx, cy } = this.world.tileToChunk(target.tx, target.ty);
      const chunk = this.world.getOrCreateChunk(cx, cy);
      const soilSt = chunk.structures.find(
        (s) =>
          s.tileX === target.tx &&
          s.tileY === target.ty &&
          s.type === PlaceableType.TILLED_SOIL
      );

      if (!soilSt) {
        this.addFloatingText(
          'Requer Solo Arado! Use a Enxada na terra',
          this.player.x,
          this.player.y - 20,
          '#fb923c'
        );
        return;
      }

      if (soilSt.cropType) {
        this.addFloatingText(
          'Já há uma planta neste solo!',
          this.player.x,
          this.player.y - 20,
          '#fde047'
        );
        return;
      }

      soilSt.cropType = heldItem.seedCropType;
      soilSt.growthStage = 0;
      soilSt.growthProgress = 0;
      this.consumeInventoryAt(this.player.selectedHotbarIndex, 1);
      soundManager.playCraft();
      this.renderer.spawnBurst(
        target.tx * TILE_SIZE + 16,
        target.ty * TILE_SIZE + 16,
        'LEAF',
        10
      );
      this.renderer.spawnRipple(
        target.tx * TILE_SIZE + 16,
        target.ty * TILE_SIZE + 16,
        '#22c55e',
        20,
        0.4
      );
      this.addFloatingText(
        `${heldItem.name} Plantado! 🌱`,
        target.tx * TILE_SIZE + 16,
        target.ty * TILE_SIZE,
        '#4ade80'
      );
      this.syncChunkAtTile(target.tx, target.ty);
      this.emitUiSnapshot();
      return;
    }

    // 0B. Organic Bone Fertilizer application (Crops & Tree Saplings)
    if (heldItem.id === 'bone_fertilizer') {
      const target = this.getTargetTileForPlacement();
      if (!target) return;
      const { cx, cy } = this.world.tileToChunk(target.tx, target.ty);
      const chunk = this.world.getOrCreateChunk(cx, cy);

      // Check if there is a Tree Sapling (OAK_SAPLING or PALM_SAPLING) on target tile (or aimed target)
      let saplingSt = chunk.structures.find(
        (s) =>
          s.tileX === target.tx &&
          s.tileY === target.ty &&
          WorldManager.isSaplingStructure(s.type)
      );
      let saplingChunk = chunk;
      if (!saplingSt) {
        const aimed = this.getAimedTarget();
        if (aimed?.structureId) {
          const aimedTile = this.world.worldToTile(aimed.worldX, aimed.worldY);
          const aimedChunkCoord = this.world.tileToChunk(aimedTile.tx, aimedTile.ty);
          const candidateChunk = this.world.getOrCreateChunk(
            aimedChunkCoord.cx,
            aimedChunkCoord.cy
          );
          const foundSapling = candidateChunk.structures.find(
            (s) =>
              s.id === aimed.structureId &&
              WorldManager.isSaplingStructure(s.type)
          );
          if (foundSapling) {
            saplingSt = foundSapling;
            saplingChunk = candidateChunk;
          }
        }
      }

      if (saplingSt) {
        const saplingTx = saplingSt.tileX;
        const saplingTy = saplingSt.tileY;
        saplingSt.fertilized = true;
        saplingSt.growthStage = (saplingSt.growthStage || 0) + 1;
        saplingSt.growthProgress = 0;

        const maturedNow = saplingSt.growthStage >= 2;
        if (maturedNow) {
          this.world.MatureSaplingIntoTree(saplingChunk, saplingSt);
        }

        this.consumeInventoryAt(this.player.selectedHotbarIndex, 1);
        soundManager.playLevelUp();
        this.renderer.spawnBurst(
          saplingTx * TILE_SIZE + 16,
          saplingTy * TILE_SIZE + 16,
          maturedNow ? 'LEAF' : 'GOLD',
          14
        );
        this.renderer.spawnRipple(
          saplingTx * TILE_SIZE + 16,
          saplingTy * TILE_SIZE + 16,
          '#4ade80',
          24,
          0.45
        );
        this.addFloatingText(
          maturedNow
            ? 'Árvore Adulta Cresceu! 🌳✦'
            : 'Muda Adubada! Evoluiu p/ Árvore Pequena ✦',
          saplingTx * TILE_SIZE + 16,
          saplingTy * TILE_SIZE,
          '#4ade80'
        );
        this.syncChunkAtTile(saplingTx, saplingTy);
        this.emitUiSnapshot();
        return;
      }

      const soilSt = chunk.structures.find(
        (s) =>
          s.tileX === target.tx &&
          s.tileY === target.ty &&
          s.type === PlaceableType.TILLED_SOIL
      );

      if (!soilSt || !soilSt.cropType) {
        this.addFloatingText(
          'Use o adubo em uma muda de árvore ou planta em crescimento',
          this.player.x,
          this.player.y - 20,
          '#fde047'
        );
        return;
      }

      if (soilSt.growthStage && soilSt.growthStage >= 3) {
        this.addFloatingText(
          'A planta já está totalmente madura!',
          this.player.x,
          this.player.y - 20,
          '#fde047'
        );
        return;
      }

      soilSt.fertilized = true;
      soilSt.growthStage = Math.min(3, (soilSt.growthStage || 0) + 1);
      soilSt.growthProgress = 0;
      this.consumeInventoryAt(this.player.selectedHotbarIndex, 1);
      soundManager.playLevelUp();
      this.renderer.spawnBurst(
        target.tx * TILE_SIZE + 16,
        target.ty * TILE_SIZE + 16,
        'GOLD',
        12
      );
      this.renderer.spawnRipple(
        target.tx * TILE_SIZE + 16,
        target.ty * TILE_SIZE + 16,
        '#fde047',
        22,
        0.45
      );
      this.addFloatingText(
        'Adubo Aplicado! Crescimento Acelerado ✦',
        target.tx * TILE_SIZE + 16,
        target.ty * TILE_SIZE,
        '#fde047'
      );
      this.syncChunkAtTile(target.tx, target.ty);
      this.emitUiSnapshot();
      return;
    }

    // 1. Placeable Structure (or Demolish/Pickup Mode)
    if (heldItem.category === ItemCategory.PLACEABLE && heldItem.placeableType) {
      const target = this.getTargetTileForPlacement();
      if (!target) return;

      if (this.buildDemolishMode) {
        this.dismantleStructureAtTile(target.tx, target.ty);
        return;
      }

      // Prevent placing a solid structure directly on top of the player's own body
      const bp = CONSTRUCTION_BLUEPRINTS[heldItem.placeableType];
      if (bp?.hasHitbox) {
        const pTile = this.world.worldToTile(this.player.x, this.player.y);
        if (pTile.tx === target.tx && pTile.ty === target.ty) {
          this.addFloatingText(
            'Afaste-se 1 bloco para construir peça com Hitbox',
            this.player.x,
            this.player.y - 20,
            '#fb923c'
          );
          return;
        }
      }

      const result = this.world.placeStructureWithUpgrade(
        target.tx,
        target.ty,
        heldItem.placeableType,
        heldItem.id,
        this.buildOrientation
      );
      if (result.placed) {
        const placedSt = this.world.getStructureAtTile(target.tx, target.ty);
        if (
          placedSt &&
          (placedSt.type === PlaceableType.BED ||
            placedSt.type === PlaceableType.EXPLORER_TENT ||
            placedSt.type === PlaceableType.VILLAGE_HOUSE ||
            placedSt.type === PlaceableType.MARKET_STALL)
        ) {
          placedSt.ownerType = 'PLAYER';
          placedSt.ownerId = this.getLocalOwnerId();
          placedSt.ownerName =
            this.multiplayer.localPlayerName ||
            this.settings.playerName ||
            'Aventureiro';
          placedSt.ownerAssignedAt = Date.now();
          placedSt.villageId = undefined;
          if (this.isRestPointStructure(placedSt)) {
            this.assignEnclosedBuildingPrimaryOwner(placedSt);
          }
        } else if (placedSt) {
          // If a wall/window/door was placed and just closed a roofed contour, evaluate structure ownership from any rest point inside!
          this.getEnclosedBuildingOwnerInfo(target.tx, target.ty);
        }
        this.consumeInventoryAt(this.player.selectedHotbarIndex, 1);
        if (result.replacedItemId) {
          const refunded = this.addItemToInventory(result.replacedItemId, 1);
          if (!refunded) {
            this.spawnDrop(
              result.replacedItemId,
              1,
              target.tx * TILE_SIZE + 16,
              target.ty * TILE_SIZE + 16
            );
          }
          const oldName = ITEMS[result.replacedItemId]?.name || result.replacedItemId;
          this.addFloatingText(
            ` Substituído (+1 ${oldName})`,
            target.tx * TILE_SIZE + 16,
            target.ty * TILE_SIZE - 14,
            '#38bdf8'
          );
        }
        soundManager.playCraft();
        this.renderer.spawnBurst(
          target.tx * TILE_SIZE + 16,
          target.ty * TILE_SIZE + 16,
          'BUILD',
          12
        );
        this.renderer.spawnRipple(
          target.tx * TILE_SIZE + 16,
          target.ty * TILE_SIZE + 16,
          '#4ade80',
          22,
          0.4
        );
        this.addFloatingText(
          result.attachedToWall
            ? '🔥 Tocha fixada na parede!'
            : `${heldItem.name} construído!`,
          target.tx * TILE_SIZE + 16,
          target.ty * TILE_SIZE,
          result.attachedToWall ? '#fde047' : '#4ade80'
        );
        this.syncChunkAtTile(target.tx, target.ty);
        this.emitUiSnapshot();
      } else {
        const wallAtTarget = this.world.hasWallStructureAtTile(
          target.tx,
          target.ty
        );
        if (
          wallAtTarget &&
          heldItem.placeableType !== PlaceableType.TORCH &&
          bp?.layer !== 'WALL'
        ) {
          soundManager.playHitWood();
          this.addFloatingText(
            'Apenas a Tocha pode ser fixada na parede!',
            target.tx * TILE_SIZE + 16,
            target.ty * TILE_SIZE - 12,
            '#fb923c'
          );
        } else {
          this.addFloatingText(
            'Local obstruído ou camada ocupada',
            this.player.x,
            this.player.y - 20,
            '#f43f5e'
          );
        }
      }
      return;
    }

    // 2. Consumable Food / Potion
    if (heldItem.category === ItemCategory.CONSUMABLE) {
      this.consumeSlotItem(this.player.selectedHotbarIndex);
      return;
    }

    // 3. Armor
    if (heldItem.category === ItemCategory.ARMOR) {
      this.equipArmorFromSlot(this.player.selectedHotbarIndex);
      return;
    }

    if (
      heldItem.toolType === ToolType.FISHING_ROD ||
      heldItem.id === 'fishing_rod'
    ) {
      this.handleFishingRodAction();
      return;
    }

    // 4. Saddle: Equip strictly on the visually selected tamed Horse or Camel
    if (heldItem.id === 'saddle') {
      const aimed = this.getAimedTarget();
      const selectedMount =
        aimed?.kind === 'tamed_animal' && aimed.creatureId
          ? this.entities.creatures.find(
              (c) =>
                c.id === aimed.creatureId &&
                c.tamed &&
                (c.kind === CreatureKind.HORSE || c.kind === CreatureKind.CAMEL) &&
                !c.hasSaddle
            ) || null
          : null;
      if (selectedMount) {
        this.equipSaddleOnCreature(selectedMount.id);
      } else {
        this.addFloatingText(
          'Aponte para um Cavalo ou Camelo domesticado sem sela!',
          this.player.x,
          this.player.y - 20,
          '#fde047'
        );
      }
      return;
    }

    // 5. Wood Boat: Place exclusively on swimmable water
    if (heldItem.id === 'wood_boat') {
      const target = this.getTargetTileForPlacement();
      if (!target) return;
      if (!this.world.isTileSwimmableWater(target.tx, target.ty)) {
        soundManager.playHitWood();
        this.addFloatingText(
          '⛵ O Bote só pode ser colocado na água!',
          this.player.x,
          this.player.y - 20,
          '#f43f5e'
        );
        return;
      }
      const wx = target.tx * TILE_SIZE + TILE_SIZE * 0.5;
      const wy = target.ty * TILE_SIZE + TILE_SIZE * 0.5;
      const boat = this.entities.trySpawnCreatureAt(
        this.world,
        CreatureKind.BOAT,
        wx,
        wy
      );
      if (boat) {
        this.consumeInventoryAt(this.player.selectedHotbarIndex, 1);
        soundManager.playTameSuccess();
        this.renderer.spawnBurst(wx, wy, 'WATER', 14);
        this.renderer.spawnRipple(wx, wy, '#38bdf8', 28, 0.5);
        this.addFloatingText(
          '⛵ Bote lançado na água! (Interaja para embarcar)',
          wx,
          wy - 18,
          '#38bdf8'
        );
        if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
          this.multiplayer.sendCreaturesSync(this.entities.creatures);
        } else if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
          this.multiplayer.sendGuestMountEvent({
            action: 'spawn_boat',
            creature: JSON.parse(JSON.stringify(boat)),
          });
        }
        this.emitUiSnapshot();
      }
      return;
    }

    if (
      heldItem.toolType === ToolType.WATERING_CAN ||
      heldItem.id === 'watering_can' ||
      heldItem.id === 'watering_can_full'
    ) {
      this.performInteractAction();
      return;
    }

    this.addFloatingText(
      `${heldItem.name}: use o Botão de Ataque/Coleta`,
      this.player.x,
      this.player.y - 20,
      '#fde047'
    );
  }

  private handleFishingRodAction(): void {
    const fs = this.player.fishingState;
    if (fs && fs.active) {
      if (fs.phase === 'biting') {
        const roll = Math.random();
        let fishId = 'fish_tilapia';
        let xpGain = 14;
        let textColor = '#38bdf8';

        if (roll < 0.12) {
          fishId = 'fish_golden';
          xpGain = 55;
          textColor = '#fde047';
        } else if (roll < 0.4) {
          fishId = 'fish_salmon';
          xpGain = 26;
          textColor = '#fb7185';
        }

        if (!this.addItemToInventory(fishId, 1)) {
          this.spawnDrop(fishId, 1, this.player.x, this.player.y, 0.3);
        }

        this.gainXp(xpGain);
        soundManager.playTameSuccess();
        this.renderer.spawnBurst(fs.bobberX, fs.bobberY, 'WATER', 14);
        this.renderer.spawnRipple(fs.bobberX, fs.bobberY, textColor, 26, 0.48);

        const fishDef = ITEMS[fishId];
        this.addFloatingText(
          `Pescou ${fishDef ? fishDef.name : 'Peixe'}! (+${xpGain} XP)`,
          this.player.x,
          this.player.y - 24,
          textColor
        );

        this.player.fishingState = null;
        this.player.swingDuration = 0.22;
        this.player.swingTimer = 0.22;
        this.emitUiSnapshot();
      } else {
        this.renderer.spawnRipple(
          fs.bobberX,
          fs.bobberY,
          'rgba(186, 230, 253, 0.6)',
          14,
          0.3
        );
        soundManager.playSwing();
        this.player.fishingState = null;
        this.addFloatingText(
          'Linha recolhida cedo demais',
          this.player.x,
          this.player.y - 22,
          '#94a3b8'
        );
        this.emitUiSnapshot();
      }
      return;
    }

    if (this.player.stamina < 4) {
      this.addFloatingText(
        'Sem energia para lançar a linha!',
        this.player.x,
        this.player.y - 20,
        '#fb7185'
      );
      return;
    }

    const dirVec = this.getDirectionOffset(this.player.direction);
    let targetBobberX: number | null = null;
    let targetBobberY: number | null = null;

    // 1. Check along the player's facing direction first
    const castDistances = [44, 58, 72, 34, 86];
    for (let i = 0; i < castDistances.length; i++) {
      const d = castDistances[i];
      const wx = this.player.x + dirVec.x * d;
      const wy = this.player.y + dirVec.y * d;
      const tx = Math.floor(wx / TILE_SIZE);
      const ty = Math.floor(wy / TILE_SIZE);
      if (this.world.isTileSwimmableWater(tx, ty)) {
        targetBobberX = tx * TILE_SIZE + TILE_SIZE * 0.5;
        targetBobberY = ty * TILE_SIZE + TILE_SIZE * 0.5;
        break;
      }
    }

    // 2. If not directly in front, scan nearby water tiles within 3 tiles so shoreline fishing is effortless
    if (targetBobberX === null || targetBobberY === null) {
      const ptx = Math.floor(this.player.x / TILE_SIZE);
      const pty = Math.floor(this.player.y / TILE_SIZE);
      let bestScore = Infinity;

      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx === 0 && dy === 0) continue;
          const tx = ptx + dx;
          const ty = pty + dy;
          if (!this.world.isTileSwimmableWater(tx, ty)) continue;
          const wx = tx * TILE_SIZE + TILE_SIZE * 0.5;
          const wy = ty * TILE_SIZE + TILE_SIZE * 0.5;
          const dist = Math.hypot(wx - this.player.x, wy - this.player.y);
          if (dist < 24 || dist > 96) continue;
          const dot =
            ((wx - this.player.x) * dirVec.x + (wy - this.player.y) * dirVec.y) /
            Math.max(1, dist);
          const score = dist - dot * 18;
          if (score < bestScore) {
            bestScore = score;
            targetBobberX = wx;
            targetBobberY = wy;
          }
        }
      }
    }

    if (targetBobberX === null || targetBobberY === null) {
      soundManager.playSwing();
      this.addFloatingText(
        'Aponte para a água para pescar!',
        this.player.x,
        this.player.y - 22,
        '#38bdf8'
      );
      return;
    }

    // Face the water tile where the bobber landed
    const dx = targetBobberX - this.player.x;
    const dy = targetBobberY - this.player.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.player.direction = dx >= 0 ? 'right' : 'left';
    } else {
      this.player.direction = dy >= 0 ? 'down' : 'up';
    }

    this.player.stamina = Math.max(0, this.player.stamina - 4);
    this.player.swingDuration = 0.22;
    this.player.swingTimer = 0.22;

    this.player.fishingState = {
      active: true,
      bobberX: targetBobberX,
      bobberY: targetBobberY,
      phase: 'waiting',
      timer: 2.2 + Math.random() * 2.8,
      biteWindowTimer: 1.85,
      rippleTimer: 0.25,
    };

    soundManager.playSwing();
    this.renderer.spawnBurst(targetBobberX, targetBobberY, 'WATER', 6);
    this.renderer.spawnRipple(targetBobberX, targetBobberY, '#38bdf8', 18, 0.45);
    this.addFloatingText(
      'Linha na água... aguarde fisgar!',
      this.player.x,
      this.player.y - 22,
      '#bae6fd'
    );
    this.emitUiSnapshot();
  }

  private updateFishing(dt: number): void {
    const fs = this.player.fishingState;
    if (!fs || !fs.active) return;

    const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];
    const heldItem = heldSlot ? ITEMS[heldSlot.itemId] : null;
    const holdingRod =
      heldItem?.toolType === ToolType.FISHING_ROD ||
      heldItem?.id === 'fishing_rod';

    const distToBobber = Math.hypot(
      this.player.x - fs.bobberX,
      this.player.y - fs.bobberY
    );

    // Cancel if player walks away or unequips the fishing rod
    if (!holdingRod || distToBobber > 125 || this.player.isSwimming) {
      this.player.fishingState = null;
      this.addFloatingText(
        'Linha de pesca recolhida',
        this.player.x,
        this.player.y - 20,
        '#94a3b8'
      );
      this.emitUiSnapshot();
      return;
    }

    fs.rippleTimer -= dt;
    if (fs.rippleTimer <= 0) {
      if (fs.phase === 'waiting') {
        fs.rippleTimer = 0.9 + Math.random() * 0.45;
        this.renderer.spawnRipple(
          fs.bobberX,
          fs.bobberY,
          'rgba(186, 230, 253, 0.55)',
          13,
          0.45
        );
      } else {
        fs.rippleTimer = 0.24;
        this.renderer.spawnRipple(fs.bobberX, fs.bobberY, '#38bdf8', 21, 0.35);
      }
    }

    if (fs.phase === 'waiting') {
      fs.timer -= dt;
      if (fs.timer <= 0) {
        fs.phase = 'biting';
        fs.biteWindowTimer = 1.9;
        fs.rippleTimer = 0.05;
        soundManager.playPickup();
        this.renderer.spawnBurst(fs.bobberX, fs.bobberY, 'WATER', 9);
        this.renderer.spawnRipple(fs.bobberX, fs.bobberY, '#fde047', 22, 0.4);
        this.addFloatingText(
          '! FISGOU ! Puxe agora!',
          fs.bobberX,
          fs.bobberY - 18,
          '#fde047'
        );
        this.emitUiSnapshot();
      }
    } else if (fs.phase === 'biting') {
      fs.biteWindowTimer -= dt;
      if (fs.biteWindowTimer <= 0) {
        this.player.fishingState = null;
        soundManager.playSwing();
        this.renderer.spawnRipple(
          fs.bobberX,
          fs.bobberY,
          'rgba(244, 63, 94, 0.55)',
          16,
          0.35
        );
        this.addFloatingText(
          'O peixe escapou!',
          fs.bobberX,
          fs.bobberY - 16,
          '#fb7185'
        );
        this.emitUiSnapshot();
      }
    }
  }

  // Legacy alias
  public performPrimaryAction(): void {
    this.performAttackOrHarvestAction();
  }

  /**
   * Computes what object or entity the player is currently pointing/aiming at for the Interact button.
   * Evaluates all interactive candidates within reach using directional alignment with the player's facing pointer
   * so that the visual selector and `performInteractAction()` always match what the player is pointing at.
   */
  public getAimedTarget(): AimedTargetInfo | null {
    const dirVec = this.getDirectionOffset(this.player.direction);
    const aimPointX = this.player.x + dirVec.x * 28;
    const aimPointY = this.player.y + dirVec.y * 28;

    const computeDirectionalScore = (
      wx: number,
      wy: number,
      categoryBias = 0
    ): number => {
      const dx = wx - this.player.x;
      const dy = wy - this.player.y;
      const distPlayer = Math.hypot(dx, dy);
      const distAim = Math.hypot(wx - aimPointX, wy - aimPointY);
      const dot =
        distPlayer > 0.001
          ? (dx * dirVec.x + dy * dirVec.y) / distPlayer
          : 1.0;
      // Strict forward-cone filter: ONLY allow targets that the player is actually facing
      // (dot >= 0.25 or standing directly on top of within 14px) and within interaction reach (distPlayer <= 56, distAim <= 34).
      if ((distPlayer > 14 && dot < 0.25) || distPlayer > 56 || distAim > 34) {
        return Infinity;
      }
      const coneBonus = -26 * dot;
      return distAim + distPlayer * 0.25 + coneBonus + categoryBias;
    };

    const candidates: Array<{ score: number; info: AimedTargetInfo }> = [];

    // 0A. Check nearby Interactive Death Bag ("Bolsinha de Espólios")
    for (const bag of this.deathBags) {
      const d = Math.hypot(bag.x - this.player.x, bag.y - this.player.y);
      if (d <= 76) {
        const remSec = Math.max(0, Math.ceil(bag.expiresTimer));
        const mm = String(Math.floor(remSec / 60)).padStart(2, '0');
        const ss = String(remSec % 60).padStart(2, '0');
        const totalStacks = bag.items.length + (bag.goldCoins > 0 ? 1 : 0);
        candidates.push({
          score: computeDirectionalScore(bag.x, bag.y, -18),
          info: {
            kind: 'death_bag',
            label: `Bolsinha de Espólios (${totalStacks} itens · ${mm}:${ss})`,
            actionHint: 'Recuperar Todos os Itens 🎒',
            worldX: bag.x,
            worldY: bag.y,
            deathBagId: bag.id,
            iconItemId: bag.items[0]?.itemId || 'leather_tunic',
          },
        });
      }
    }

    // 0B. Check nearby Village NPC or Wanderer
    for (const cr of this.entities.creatures) {
      if (
        (cr.kind === CreatureKind.VILLAGER ||
          cr.kind === CreatureKind.WANDERER) &&
        cr.hp > 0 &&
        !cr.isInsideHouse
      ) {
        const d = Math.hypot(cr.x - this.player.x, cr.y - this.player.y);
        if (d <= 84) {
          const aff = Math.round(cr.affinity ?? 55);
          const isWanderer = cr.kind === CreatureKind.WANDERER;
          const holdingPeace = this.isPlayerHoldingPeaceItem();
          const debtCoins = cr.isHostile ? this.getNpcPeaceDebtCoins(cr) : 0;
          candidates.push({
            score: computeDirectionalScore(cr.x, cr.y, -4),
            info: {
              kind: 'villager',
              label: isWanderer
                ? `${cr.name} · Andarilho`
                : `${cr.name} · ${cr.npcProfessionLabel || 'Aldeão'}`,
              actionHint: cr.isHostile
                ? holdingPeace
                  ? `🕊️ Pagar Dívida (${debtCoins} Moedas)`
                  : '⚔ Hostil! Segure o Tratado da Paz'
                : isWanderer
                ? 'Conversar / Trocar'
                : `Negociar (♥${aff})`,
              worldX: cr.x,
              worldY: cr.y,
              creatureId: cr.id,
              iconItemId:
                cr.isHostile && holdingPeace ? 'peace_treaty' : 'gold_coin',
            },
          });
        }
      }
    }

    // 1. Check nearby Interactive Structures (Workbench, Furnace, Solar Altar, Campfire, Village Well, Market Stall, Chest, House, Door)
    const pTile = this.world.worldToTile(this.player.x, this.player.y);
    const pChunk = this.world.tileToChunk(pTile.tx, pTile.ty);
    const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];
    const isHoldingWateringCan = Boolean(
      heldSlot &&
        (heldSlot.itemId === 'watering_can' ||
          heldSlot.itemId === 'watering_can_full')
    );

    // 1.0 If holding a watering can, check nearby water tiles for refilling via Interact button
    if (isHoldingWateringCan) {
      for (let wyOff = -2; wyOff <= 2; wyOff++) {
        for (let wxOff = -2; wxOff <= 2; wxOff++) {
          const wtx = pTile.tx + wxOff;
          const wty = pTile.ty + wyOff;
          if (
            this.world.isTileSwimmableWater(wtx, wty) ||
            this.world.computeBiomeAtTile(wtx, wty) === BiomeType.OCEAN
          ) {
            const wwx = wtx * TILE_SIZE + TILE_SIZE / 2;
            const wwy = wty * TILE_SIZE + TILE_SIZE / 2;
            const score = computeDirectionalScore(wwx, wwy, -14);
            if (Number.isFinite(score)) {
              candidates.push({
                score,
                info: {
                  kind: 'water_source',
                  label: 'Água Fresca',
                  actionHint: 'Encher Regador (12/12) 💧',
                  worldX: wwx,
                  worldY: wwy,
                  iconItemId: 'watering_can_full',
                },
              });
            }
          }
        }
      }
    }

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = WorldManager.chunkKey(pChunk.cx + dx, pChunk.cy + dy);
        const chunk = this.world.chunks[key];
        if (!chunk) continue;

        for (const st of chunk.structures) {
          const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
          const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
          const distPlayer = Math.hypot(sx - this.player.x, sy - this.player.y);

          // 1A. Tilled Soil / Crops within reach
          if (st.type === PlaceableType.TILLED_SOIL) {
            if (distPlayer <= TILE_SIZE * 2.2) {
              const crop = st.cropType;
              const wateringBias = isHoldingWateringCan ? -12 : 8;
              const wateringEmpty = heldSlot?.itemId === 'watering_can';
              if (crop) {
                const itemDef = ITEMS[crop];
                const cropName = itemDef?.name || crop;
                if (st.growthStage === 3) {
                  candidates.push({
                    score: computeDirectionalScore(sx, sy, -3),
                    info: {
                      kind: 'crop',
                      label: `${cropName} (Maduro!)`,
                      actionHint: 'Colher Planta 🌾',
                      worldX: sx,
                      worldY: sy,
                      iconItemId: crop,
                      structureId: st.id,
                      cropType: crop,
                      cropStage: 3,
                      isWatered: st.isWatered,
                    },
                  });
                } else {
                  const stageNum = (st.growthStage || 0) + 1;
                  const pct = Math.round((st.growthProgress || 0) * 100);
                  const hint = isHoldingWateringCan
                    ? wateringEmpty
                      ? 'Regador Vazio! Encha na água 💧'
                      : 'Regar Planta 💧'
                    : st.isWatered
                    ? st.fertilized
                      ? 'Adubado ✦'
                      : 'Solo Irrigado ♥'
                    : 'Use Regador 💧';
                  candidates.push({
                    score: computeDirectionalScore(sx, sy, wateringBias),
                    info: {
                      kind: 'crop',
                      label: `${cropName} (${stageNum}/4 · ${pct}%)`,
                      actionHint: hint,
                      worldX: sx,
                      worldY: sy,
                      iconItemId: isHoldingWateringCan
                        ? heldSlot!.itemId
                        : crop,
                      structureId: st.id,
                      cropType: crop,
                      cropStage: st.growthStage,
                      isWatered: st.isWatered,
                    },
                  });
                }
              } else {
                candidates.push({
                  score: computeDirectionalScore(
                    sx,
                    sy,
                    isHoldingWateringCan ? -12 : 12
                  ),
                  info: {
                    kind: 'crop',
                    label: st.isWatered
                      ? 'Terra Arada (Irrigada)'
                      : 'Terra Arada (Seca)',
                    actionHint: isHoldingWateringCan
                      ? wateringEmpty
                        ? 'Regador Vazio! Encha na água 💧'
                        : 'Regar Solo Arado 💧'
                      : 'Plantar Semente 🌱',
                    worldX: sx,
                    worldY: sy,
                    iconItemId: isHoldingWateringCan
                      ? heldSlot!.itemId
                      : 'wheat_seeds',
                    structureId: st.id,
                    cropStage: 0,
                    isWatered: st.isWatered,
                  },
                });
              }
            }
            continue;
          }

          // 1B. Tree Saplings (OAK_SAPLING / PALM_SAPLING) within reach
          if (WorldManager.isSaplingStructure(st.type)) {
            if (distPlayer <= TILE_SIZE * 2.2) {
              const isPalm = st.type === PlaceableType.PALM_SAPLING;
              const stageIdx = st.growthStage || 0;
              const pct = Math.round((st.growthProgress || 0) * 100);
              const stageLabel =
                stageIdx === 0
                  ? isPalm
                    ? 'Muda de Palmeira (1/3 · Muda)'
                    : 'Muda de Árvore (1/3 · Muda)'
                  : isPalm
                  ? 'Palmeira Pequena (2/3)'
                  : 'Árvore Pequena (2/3)';
              const hint = st.fertilized
                ? `Adubada ✦ (${pct}%)`
                : `Crescendo (${pct}%) · Aceita Adubo 🌱`;
              candidates.push({
                score: computeDirectionalScore(sx, sy, 8),
                info: {
                  kind: 'crop',
                  label: stageLabel,
                  actionHint: hint,
                  worldX: sx,
                  worldY: sy,
                  iconItemId: isPalm ? 'palm_sapling' : 'oak_sapling',
                  structureId: st.id,
                  cropStage: stageIdx,
                },
              });
            }
            continue;
          }

          if (
            st.type !== PlaceableType.WORKBENCH &&
            st.type !== PlaceableType.FURNACE &&
            st.type !== PlaceableType.SOLAR_ALTAR &&
            st.type !== PlaceableType.CAMPFIRE &&
            st.type !== PlaceableType.BED &&
            st.type !== PlaceableType.EXPLORER_TENT &&
            st.type !== PlaceableType.HEALING_FOUNTAIN &&
            st.type !== PlaceableType.CHEST &&
            st.type !== PlaceableType.VILLAGE_WELL &&
            st.type !== PlaceableType.MARKET_STALL &&
            st.type !== PlaceableType.VILLAGE_HOUSE &&
            st.type !== PlaceableType.WOOD_DOOR &&
            st.type !== PlaceableType.IRON_GATE
          ) {
            continue;
          }

          if (distPlayer <= TILE_SIZE * 2.8) {
            const itemDef = ITEMS[st.itemId];
            const hasLoot = Boolean(st.lootItems && st.lootItems.length > 0);
            const occupiedChestSlots =
              st.type === PlaceableType.CHEST && Array.isArray(st.storageSlots)
                ? st.storageSlots.filter((s) => s !== null && s.count > 0).length
                : hasLoot
                ? st.lootItems!.length
                : 0;
            const isHouseStruct = this.isStructureValidHouse(st);
            const enclosedInfo = isHouseStruct
              ? this.getEnclosedBuildingOwnerInfo(st.tileX, st.tileY)
              : null;
            const allHouseResidents = this.isRestPointStructure(st)
              ? this.getHouseResidents(st.id)
              : enclosedInfo
              ? enclosedInfo.interiorRestPoints.flatMap((rp) =>
                  this.getHouseResidents(rp.id)
                )
              : [];
            const houseResidents = allHouseResidents.length;
            const insideResidents = isHouseStruct
              ? this.getStructureSleepingResidents(st, enclosedInfo)
              : [];
            const insideNames = insideResidents.map((r) => r.name).join(' & ');
            const canClaimRestPoint =
              isHouseStruct && this.canPlayerClaimRestPoint(st, enclosedInfo);

            // Resolve displayed owner badge:
            // - For doors or enclosed structures: shows the Enclosed Structure Owner (defined by the primary rest point inside, or "Sem Dono" if none/lost).
            // - For standalone rest points: shows the rest point's owner.
            const effectiveOwnerType = enclosedInfo
              ? enclosedInfo.ownerType
              : st.ownerType || null;
            const effectiveOwnerName = enclosedInfo
              ? enclosedInfo.ownerName
              : st.ownerName;

            const houseOwnerBadge = isHouseStruct
              ? effectiveOwnerType === 'PLAYER'
                ? ` [🏠 Dono: ${effectiveOwnerName || 'Você'}]`
                : effectiveOwnerType === 'VILLAGER'
                ? ` [🏠 Dono: ${effectiveOwnerName || 'Aldeão'}]`
                : ' [🏠 Sem Dono]'
              : '';

            const actionHint =
              isHoldingWateringCan &&
              (st.type === PlaceableType.VILLAGE_WELL ||
                st.type === PlaceableType.HEALING_FOUNTAIN)
                ? 'Encher Regador (12/12) 💧'
                : insideResidents.length > 0 &&
                  (st.type === PlaceableType.BED ||
                    st.type === PlaceableType.VILLAGE_HOUSE ||
                    st.type === PlaceableType.EXPLORER_TENT ||
                    st.type === PlaceableType.WOOD_DOOR ||
                    st.type === PlaceableType.IRON_GATE)
                ? `🚪 Bater na Porta (${insideNames}) 🏠`
                : st.type === PlaceableType.WOOD_DOOR ||
                  st.type === PlaceableType.IRON_GATE
                ? `${
                    st.isOpen ? 'Fechar Passagem 🔒' : 'Abrir Passagem 🔓'
                  }${houseOwnerBadge}`
                : st.type === PlaceableType.CHEST
                ? st.villageId
                  ? this.hasVillageChestPermission(st.villageId)
                    ? '🔓 Abrir Cofre da Vila'
                    : '🔒 Cofre Trancado (♥75+)'
                  : hasLoot
                  ? `Abrir Baú de Tesouro (${occupiedChestSlots}) ✦`
                  : occupiedChestSlots > 0
                  ? `Abrir Baú (${occupiedChestSlots}/${CHEST_STORAGE_SIZE}) 📦`
                  : 'Abrir Baú 📦'
                : st.type === PlaceableType.VILLAGE_WELL
                ? 'Beber Água (+HP/Energia)'
                : st.type === PlaceableType.MARKET_STALL
                ? st.ownerType === 'PLAYER'
                  ? `Gerenciar Tenda${
                      (st.stallUnclaimedGold || 0) > 0
                        ? ` (+${st.stallUnclaimedGold}g na Caixinha!)`
                        : ''
                    } 🏪`
                  : this.isVillagerStallOwnerAlive(st)
                  ? this.isVillagerStallOwnerSleeping(st)
                    ? `Tenda de ${st.ownerName || 'Mercador'} (🌙 Dormindo)`
                    : `Tenda de ${st.ownerName || 'Mercador'} 🏪`
                  : 'Tenda sem Dono · Tomar Posse 🏪'
                : st.type === PlaceableType.BED ||
                  st.type === PlaceableType.VILLAGE_HOUSE ||
                  st.type === PlaceableType.EXPLORER_TENT
                ? st.ownerType === 'PLAYER' && effectiveOwnerType === 'PLAYER'
                  ? `Descansar (Dono: ${st.ownerName || 'Você'}) 🛏️`
                  : houseResidents > 0
                  ? `Cama de ${st.ownerName || 'Aldeão'} 🛏️`
                  : 'Sem Dono · Tomar Posse & Descansar 🛏️'
                : st.type === PlaceableType.CAMPFIRE
                ? st.outputCount && st.outputCount > 0
                  ? `Pronto: ${st.outputCount}x ${
                      ITEMS[st.outputItemId || '']?.name || 'Item'
                    } 🔥`
                  : st.cookingInputCount && st.cookingInputCount > 0
                  ? 'Cozinhando na Fogueira... 🔥'
                  : 'Abrir Fogueira 🔥'
                : st.type === PlaceableType.HEALING_FOUNTAIN
                ? 'Bênção de Cura'
                : st.type === PlaceableType.WORKBENCH
                ? 'Abrir Bancada 🔨'
                : st.type === PlaceableType.FURNACE
                ? st.outputCount && st.outputCount > 0
                  ? `Pronto: ${st.outputCount}x ${
                      ITEMS[st.outputItemId || '']?.name || 'Item'
                    } 🔥`
                  : st.cookingInputCount && st.cookingInputCount > 0
                  ? 'Fundindo na Fornalha... 🔥'
                  : 'Abrir Fornalha 🔥'
                : 'Abrir Altar Solar ✦';

            candidates.push({
              score: computeDirectionalScore(sx, sy, -5),
              info: {
                kind: 'station',
                label: `${
                  st.customName ||
                  st.landmarkName ||
                  itemDef?.name ||
                  'Estação'
                }${
                  st.type === PlaceableType.BED ||
                  st.type === PlaceableType.VILLAGE_HOUSE ||
                  st.type === PlaceableType.EXPLORER_TENT
                    ? houseOwnerBadge
                    : ''
                }`,
                actionHint,
                worldX: sx,
                worldY: sy,
                stationType: st.type,
                iconItemId: st.itemId,
                structureId: st.id,
                canClaimOwnership: canClaimRestPoint,
              },
            });
          }
        }
      }
    }

    // 2. Check nearby Wild Domesticable Animals & Tamed Pets / Mounts / Boats
    const isHoldingSaddle = Boolean(heldSlot && heldSlot.itemId === 'saddle');

    for (const cr of this.entities.creatures) {
      if (cr.hp <= 0 || cr.isInsideHouse) continue;
      // Skip the mount the player is currently riding so the selector can target objects around the player while mounted
      if (this.player.mountedEntityId === cr.id) continue;

      const distPlayer = Math.hypot(cr.x - this.player.x, cr.y - this.player.y);
      if (distPlayer > 84) continue;

      if (
        !cr.isHostile &&
        !cr.tamed &&
        cr.kind !== CreatureKind.VILLAGER &&
        cr.kind !== CreatureKind.WANDERER &&
        cr.kind !== CreatureKind.BOAT
      ) {
        const favId = cr.favoriteFoodIds[0] || 'berry';
        candidates.push({
          score: computeDirectionalScore(cr.x, cr.y, -2),
          info: {
            kind: 'wild_animal',
            label: cr.name,
            actionHint: `Domesticar ♥ (${ITEMS[favId]?.name || 'Comida'})`,
            worldX: cr.x,
            worldY: cr.y,
            creatureId: cr.id,
            iconItemId: favId,
          },
        });
      } else if (cr.tamed || cr.kind === CreatureKind.BOAT) {
        const isMountSpecies =
          cr.kind === CreatureKind.HORSE || cr.kind === CreatureKind.CAMEL;

        if (cr.kind === CreatureKind.BOAT) {
          candidates.push({
            score: computeDirectionalScore(cr.x, cr.y, -3),
            info: {
              kind: 'tamed_animal',
              label: `${cr.name} (2 Assentos)`,
              actionHint: 'Embarcar no Bote ⛵',
              worldX: cr.x,
              worldY: cr.y,
              creatureId: cr.id,
              iconItemId: 'wood_boat',
            },
          });
          continue;
        }

        const isOwnedByLocal = this.isCreatureOwnedByLocalPlayer(cr);
        const isOccupiedByOther = this.isMountOccupiedByOtherPlayer(cr);
        const ownerBadge = cr.ownerName ? ` · Dono: ${cr.ownerName}` : '';

        if (!isOwnedByLocal) {
          candidates.push({
            score: computeDirectionalScore(cr.x, cr.y, 4),
            info: {
              kind: 'tamed_animal',
              label: `${cr.name} (Dono: ${cr.ownerName || 'Outro'})`,
              actionHint: isOccupiedByOther
                ? '🔒 Assento ocupado'
                : `🔒 Pet de ${cr.ownerName || 'outro jogador'}`,
              worldX: cr.x,
              worldY: cr.y,
              creatureId: cr.id,
              iconItemId: isMountSpecies ? 'saddle' : 'taming_treat',
            },
          });
          continue;
        }

        if (heldSlot && this.isFoodItemForPet(heldSlot.itemId, cr)) {
          candidates.push({
            score: computeDirectionalScore(cr.x, cr.y, -5),
            info: {
              kind: 'tamed_animal',
              label: `${cr.name} (${Math.round(cr.hp)}/${cr.maxHp} HP)`,
              actionHint:
                cr.hp < cr.maxHp
                  ? `Curar Pet ♥ (${ITEMS[heldSlot.itemId]?.name || 'Comida'})`
                  : 'Vida Cheia ♥',
              worldX: cr.x,
              worldY: cr.y,
              creatureId: cr.id,
              iconItemId: heldSlot.itemId,
            },
          });
          continue;
        }

        if (isMountSpecies && !cr.hasSaddle && isHoldingSaddle) {
          candidates.push({
            score: computeDirectionalScore(cr.x, cr.y, -5),
            info: {
              kind: 'tamed_animal',
              label: `${cr.name} (Sem Alforje)`,
              actionHint: 'Equipar Alforje/Sela 鞍',
              worldX: cr.x,
              worldY: cr.y,
              creatureId: cr.id,
              iconItemId: 'saddle',
            },
          });
          continue;
        }

        if (isMountSpecies && cr.hasSaddle) {
          candidates.push({
            score: computeDirectionalScore(cr.x, cr.y, -4),
            info: {
              kind: 'tamed_animal',
              label: `${cr.name} [Alforje${ownerBadge}]`,
              actionHint: isOccupiedByOther
                ? '🔒 Assento ocupado!'
                : 'Retirar Alforje 鞍 (Use Cavalgar p/ montar)',
              worldX: cr.x,
              worldY: cr.y,
              creatureId: cr.id,
              iconItemId: 'saddle',
            },
          });
          continue;
        }

        const stateBadge =
          cr.aiState === 'stay'
            ? 'Base'
            : cr.aiState === 'graze'
            ? 'Pastar'
            : 'Seguindo';
        candidates.push({
          score: computeDirectionalScore(cr.x, cr.y, -2),
          info: {
            kind: 'tamed_animal',
            label: `${cr.name} [${stateBadge}]`,
            actionHint: 'Alternar (Seguindo / Base / Pastar)',
            worldX: cr.x,
            worldY: cr.y,
            creatureId: cr.id,
            iconItemId: 'taming_treat',
          },
        });
      }
    }

    // 3. Check Nature Node in front of player
    const lookTile = this.world.worldToTile(aimPointX, aimPointY);
    const lookChunk = this.world.getOrCreateChunk(
      Math.floor(lookTile.tx / 16),
      Math.floor(lookTile.ty / 16)
    );
    const node = lookChunk.nodes.find(
      (n) => n.tileX === lookTile.tx && n.tileY === lookTile.ty
    );
    if (node) {
      const bp = NATURE_BLUEPRINTS[node.type];
      const req = getNatureBreakRequirement(node.type);
      const heldItem = heldSlot ? ITEMS[heldSlot.itemId] : null;
      const strengthBuff =
        this.player.strengthBuffTimer && this.player.strengthBuffTimer > 0
          ? 1.35
          : 1.0;
      const strengthMult =
        (1 + Math.max(0, this.player.attributes.strength || 0) * 0.12) *
        strengthBuff;
      const evalBreak = evaluateMaterialBreak(
        heldItem?.id || null,
        heldItem?.toolType || ToolType.NONE,
        heldItem?.toolTier || 0,
        strengthMult,
        req.materialKind,
        bp.requiredTool,
        bp.requiredTier
      );
      const forceHint = evalBreak.canBreak
        ? `Força: ${evalBreak.force} (${evalBreak.actorLabel})`
        : `🔒 ${evalBreak.blockReason}`;
      const nx = node.tileX * TILE_SIZE + TILE_SIZE / 2;
      const ny = node.tileY * TILE_SIZE + TILE_SIZE / 2;
      candidates.push({
        score: computeDirectionalScore(nx, ny, 6),
        info: {
          kind: 'node',
          label: `${bp.name} (${Math.ceil(node.hp)}/${bp.maxHp} HP)`,
          actionHint: forceHint,
          worldX: nx,
          worldY: ny,
          iconItemId: bp.drops[0]?.itemId || 'wood',
        },
      });
    }

    const validCandidates = candidates.filter((c) => Number.isFinite(c.score));
    if (validCandidates.length === 0) {
      return null;
    }

    validCandidates.sort((a, b) => a.score - b.score);
    return validCandidates[0].info;
  }

  private harvestNatureNode(
    chunk: { nodes: any[] },
    nodeIndex: number,
    heldItemId: string | null,
    toolType: ToolType,
    toolTier: number,
    playerStrengthMult: number
  ): void {
    const node = chunk.nodes[nodeIndex];
    const bp = NATURE_BLUEPRINTS[node.type as keyof typeof NATURE_BLUEPRINTS];
    const nx = node.tileX * TILE_SIZE + TILE_SIZE / 2;
    const ny = node.tileY * TILE_SIZE + TILE_SIZE / 2;

    const evalBreak = evaluateMaterialBreak(
      heldItemId,
      toolType,
      toolTier,
      playerStrengthMult,
      bp.materialKind,
      bp.requiredTool,
      bp.requiredTier
    );

    if (!evalBreak.canBreak) {
      this.resetInterruptedBreakingTargets(null);
      this.addFloatingText(
        evalBreak.blockReason || 'Ferramenta inadequada para este material',
        nx,
        ny - 16,
        '#f43f5e'
      );
      soundManager.playHitStone();
      return;
    }

    this.resetInterruptedBreakingTargets(node.id);
    const power = evalBreak.force;
    node.hp -= power;
    node.hitFlashTimer = 0.16;
    node.breakIdleTimer = 1.15;

    if (bp.requiredTool === ToolType.PICKAXE) {
      soundManager.playHitStone();
      this.renderer.spawnBurst(nx, ny, 'STONE', node.hp <= 0 ? 15 : 8);
      this.renderer.spawnBurst(nx, ny, 'SPARK', 4);
    } else {
      soundManager.playHitWood();
      this.renderer.spawnBurst(nx, ny, 'LEAF', node.hp <= 0 ? 14 : 7);
      this.renderer.spawnBurst(nx, ny, 'WOOD', node.hp <= 0 ? 10 : 5);
    }
    this.renderer.spawnRipple(nx, ny, '#fbbf24', 18, 0.3);

    this.addFloatingText(`-${Math.round(power)}`, nx, ny - 12, '#fde047');

    if (node.hp <= 0) {
      this.activeBreakingTargetId = null;
      const nodeBreakKey = `break_node:${node.id}:${node.tileX},${node.tileY}`;
      if (!this.tryClaimWorldAction(nodeBreakKey)) {
        chunk.nodes.splice(nodeIndex, 1);
        this.emitUiSnapshot();
        return;
      }
      const survivalBonusChance =
        Math.max(0, this.player.attributes.survival || 0) * 0.1;
      for (const drop of bp.drops) {
        if (Math.random() <= drop.chance) {
          let count =
            drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
          if (Math.random() < survivalBonusChance) count += 1;
          this.spawnDrop(
            drop.itemId,
            count,
            nx + (Math.random() - 0.5) * 14,
            ny + (Math.random() - 0.5) * 14
          );
        }
      }
      // Arbusto de Frutas: 50% de chance de 1 a 2 sementes aleatórias (trigo, cenoura, erva, solar, amora)
      if (node.type === NatureNodeType.BERRY_BUSH && Math.random() <= 0.5) {
        const seedPool = [
          'wheat_seeds',
          'carrot_seeds',
          'herb_seeds',
          'solar_seeds',
          'berry_seeds',
        ];
        const randomSeedId =
          seedPool[Math.floor(Math.random() * seedPool.length)];
        let seedCount = 1 + Math.floor(Math.random() * 2);
        if (Math.random() < survivalBonusChance) seedCount += 1;
        this.spawnDrop(
          randomSeedId,
          seedCount,
          nx + (Math.random() - 0.5) * 14,
          ny + (Math.random() - 0.5) * 14
        );
      }
      this.gainXp(bp.xpReward);
      chunk.nodes.splice(nodeIndex, 1);
    }
    this.syncChunkAtTile(node.tileX, node.tileY);
    this.emitUiSnapshot();
  }

  private damageCreature(
    cr: CreatureEntity,
    amount: number,
    sourceX: number,
    sourceY: number,
    knockbackMult = 1.0,
    attackerCreature?: CreatureEntity,
    fromNetwork = false
  ): void {
    // Villagers inside their houses cannot be damaged
    if (cr.isInsideHouse) return;

    // Mounts currently ridden by a player are integrated with the player's body and cannot be killed/damaged separately
    if (
      cr.id === this.player.mountedEntityId ||
      Boolean(cr.riderPlayerId) ||
      this.remotePlayersList.some((rp) => rp.mountedEntityId === cr.id)
    ) {
      return;
    }

    // Safety protection: Player attacks can never harm tamed allies, nor peaceful NPCs when "Fogo Inocente" is OFF
    if (!attackerCreature) {
      if (cr.tamed) return;
      if (
        (cr.kind === CreatureKind.VILLAGER || cr.kind === CreatureKind.WANDERER) &&
        !cr.isHostile &&
        !this.innocentFireEnabled
      ) {
        return;
      }
    }

    // Peaceful animals (Horse, Sheep, Boat) are never attacked or harmed by hostile monsters
    if (
      attackerCreature &&
      EntityManager.isPeacefulAnimalKind(cr.kind)
    ) {
      return;
    }

    // Record attacker for creature-vs-creature retaliation (only for non-peaceful creatures)
    if (
      attackerCreature &&
      attackerCreature.id !== cr.id &&
      !EntityManager.isPeacefulAnimalKind(cr.kind)
    ) {
      cr.retaliateTargetId = attackerCreature.id;
    }

    // Villagers sheltered at their home during sunset/night take 50% less damage from monsters
    if (
      attackerCreature &&
      cr.kind === CreatureKind.VILLAGER &&
      cr.homeX !== undefined &&
      cr.homeY !== undefined &&
      (this.metadata.timeOfDay >= 17.5 || this.metadata.timeOfDay < 5.5) &&
      Math.hypot(cr.x - cr.homeX, cr.y - cr.homeY) <= 30
    ) {
      amount = Math.max(1, Math.round(amount * 0.5));
    }

    // If the player attacks a peaceful Village NPC or Wanderer, trigger self-defense / village hostility!
    if (
      !attackerCreature &&
      (cr.kind === CreatureKind.VILLAGER ||
        cr.kind === CreatureKind.WANDERER) &&
      Math.hypot(sourceX - this.player.x, sourceY - this.player.y) < 16
    ) {
      if (cr.kind === CreatureKind.WANDERER) {
        cr.affinity = Math.max(0, (cr.affinity ?? 55) - 45);
        cr.isHostile = true;
        cr.provokedTimer = 45;
        cr.peaceDebtCoins = Math.min(85, (cr.peaceDebtCoins || 10) + 14);
        cr.aiState = 'chase';
        this.addFloatingText(
          `⚔ ${cr.name} foi atacado e está se defendendo!`,
          cr.x,
          cr.y - 28,
          '#ef4444'
        );
      } else {
        this.provokeVillage(
          cr.villageId,
          cr,
          45,
          `⚔ ${cr.name} foi atacado! Os Aldeões estão se defendendo!`
        );
      }
    }

    // If the player attacks a peaceful Boar or Camel, it defends itself against the player or retaliates
    if (
      !attackerCreature &&
      !cr.tamed &&
      (cr.kind === CreatureKind.BOAR || cr.kind === CreatureKind.CAMEL) &&
      Math.hypot(sourceX - this.player.x, sourceY - this.player.y) < 16
    ) {
      cr.isHostile = true;
      cr.provokedTimer = 25;
    }

    // Peaceful animals (Sheep, Horse) flee when attacked to maintain a minimum safe distance from the author of the attack
    if (cr.kind === CreatureKind.SHEEP || cr.kind === CreatureKind.HORSE) {
      cr.fleeTargetId = attackerCreature ? attackerCreature.id : 'PLAYER';
      cr.fleeFromX = sourceX;
      cr.fleeFromY = sourceY;
      cr.fleeTimer = 8.0;
      if (!cr.tamed) {
        cr.aiState = 'flee';
        cr.aiTimer = 2.5;
      }
    }

    // Rule: When the player attacks a target, ONLY combat-capable tamed allies (Camel & Boar) in 'follow' state are enabled to attack too
    // (staying focused on its single target until defeating it or dying).
    if (!attackerCreature && !cr.tamed) {
      for (const pet of this.entities.creatures) {
        if (
          pet.tamed &&
          pet.hp > 0 &&
          EntityManager.isCombatAllyKind(pet.kind) &&
          this.isCreatureOwnedByLocalPlayer(pet) &&
          pet.aiState === 'follow' &&
          this.player.mountedEntityId !== pet.id &&
          Math.hypot(pet.x - this.player.x, pet.y - this.player.y) <= 230
        ) {
          const currentTarget = pet.combatTargetId
            ? this.entities.creatures.find(
                (o) =>
                  o.id === pet.combatTargetId &&
                  o.hp > 0 &&
                  !o.isInsideHouse &&
                  !o.tamed
              )
            : null;
          if (!currentTarget) {
            pet.combatTargetId = cr.id;
          }
        }
      }
    }

    cr.hp -= amount;
    cr.hitFlashTimer = 0.18;
    soundManager.playHitEnemy();
    if (
      !fromNetwork &&
      !this.isApplyingNetworkEvent &&
      this.multiplayer.isOnline &&
      !attackerCreature
    ) {
      this.multiplayer.sendCreatureHit(
        cr.id,
        amount,
        sourceX,
        sourceY,
        knockbackMult
      );
    }
    this.renderer.spawnBurst(
      cr.x,
      cr.y,
      cr.kind === CreatureKind.STONE_GOLEM ? 'STONE' : 'BLOOD',
      cr.hp <= 0 ? 16 : 8
    );
    this.renderer.spawnRipple(cr.x, cr.y, '#f87171', 18, 0.3);

    const dx = cr.x - sourceX;
    const dy = cr.y - sourceY;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const knockX = cr.x + (dx / dist) * 14 * knockbackMult;
    const knockY = cr.y + (dy / dist) * 14 * knockbackMult;
    if (this.canEntityOccupy(knockX, knockY)) {
      cr.x = knockX;
      cr.y = knockY;
    }

    this.addFloatingText(`-${amount}`, cr.x, cr.y - 16, '#f87171');

    if (cr.hp <= 0) {
      const eliteMult = cr.isElite ? 1.6 : 1.0;
      const grantPlayerXp = (xp: number) => {
        if (
          !attackerCreature ||
          attackerCreature.tamed ||
          Math.hypot(cr.x - this.player.x, cr.y - this.player.y) < 380
        ) {
          this.gainXp(attackerCreature && !attackerCreature.tamed ? Math.max(5, Math.round(xp * 0.5)) : xp);
        }
      };

      if (cr.kind === CreatureKind.ZOMBIE) {
        if (cr.isElite) {
          // Zumbi Ancião — elite (2 a 3 essências sombrias; 1 minérios de ferro)
          this.spawnDrop(
            'dark_essence',
            2 + Math.floor(Math.random() * 2),
            cr.x,
            cr.y
          );
          this.spawnDrop('iron_ore', 1, cr.x - 6, cr.y);
        } else {
          // Zumbi Errante (1 a 2 essências sombrias)
          this.spawnDrop(
            'dark_essence',
            1 + Math.floor(Math.random() * 2),
            cr.x,
            cr.y
          );
        }
        grantPlayerXp(Math.round(35 * eliteMult));
      } else if (cr.kind === CreatureKind.OGRE) {
        if (cr.isElite) {
          // Ogro Brutal Alfa — elite (2 a 3 peles de ogro; 2 a 4 minérios de ferro)
          this.spawnDrop(
            'ogre_hide',
            2 + Math.floor(Math.random() * 2),
            cr.x,
            cr.y
          );
          this.spawnDrop(
            'iron_ore',
            2 + Math.floor(Math.random() * 3),
            cr.x + 8,
            cr.y
          );
        } else {
          // Ogro Brutamontes (1 a 2 peles de ogro; 2 minérios de ferro)
          this.spawnDrop(
            'ogre_hide',
            1 + Math.floor(Math.random() * 2),
            cr.x,
            cr.y
          );
          this.spawnDrop('iron_ore', 2, cr.x + 8, cr.y);
        }
        grantPlayerXp(Math.round(95 * eliteMult));
      } else if (cr.kind === CreatureKind.FOREST_STALKER) {
        if (cr.isElite) {
          // Aranha Rainha Sombria — elite (2 a 3 sedas de aranha)
          this.spawnDrop(
            'spider_silk',
            2 + Math.floor(Math.random() * 2),
            cr.x,
            cr.y
          );
        } else {
          // Aranha Tecelã da Mata (1 a 2 sedas de aranha)
          this.spawnDrop(
            'spider_silk',
            1 + Math.floor(Math.random() * 2),
            cr.x,
            cr.y
          );
        }
        grantPlayerXp(Math.round(48 * eliteMult));
      } else if (cr.kind === CreatureKind.DESERT_SCORPION) {
        if (cr.isElite) {
          // Escorpião Imperador Dourado — elite (2 ferrões de escorpião; 1 cristal solar)
          this.spawnDrop('scorpion_stinger', 2, cr.x, cr.y);
          this.spawnDrop('solar_crystal', 1, cr.x + 6, cr.y);
        } else {
          // Escorpião Rei da Areia (1 ferrão de escorpião; 20% de chance de 1 cristal solar)
          this.spawnDrop('scorpion_stinger', 1, cr.x, cr.y);
          if (Math.random() < 0.2) {
            this.spawnDrop('solar_crystal', 1, cr.x + 6, cr.y);
          }
        }
        grantPlayerXp(Math.round(62 * eliteMult));
      } else if (cr.kind === CreatureKind.STONE_GOLEM) {
        if (cr.isElite) {
          // Colosso Rúnico Ancestral — elite (1 núcleo de golem; 4 minérios de ferro)
          this.spawnDrop('golem_core', 1, cr.x, cr.y);
          this.spawnDrop('iron_ore', 4, cr.x + 8, cr.y);
        } else {
          // Colosso Rúnico de Pedra (1 núcleo de golem; 3 pedras brutas)
          this.spawnDrop('golem_core', 1, cr.x, cr.y);
          this.spawnDrop('stone', 3, cr.x - 8, cr.y);
        }
        grantPlayerXp(Math.round(115 * eliteMult));
      } else if (cr.kind === CreatureKind.BANDIT) {
        if (cr.isElite) {
          // Líder Saqueador Corvo — elite (20 a 40 moedas de ouro)
          this.spawnDrop(
            'gold_coin',
            20 + Math.floor(Math.random() * 21),
            cr.x,
            cr.y
          );
        } else {
          // Saqueador Renegado (5 a 20 moedas de ouro; 30% de chance de 1 bandagem de lã)
          this.spawnDrop(
            'gold_coin',
            5 + Math.floor(Math.random() * 16),
            cr.x,
            cr.y
          );
          if (Math.random() < 0.3) {
            this.spawnDrop('wool_bandage', 1, cr.x + 6, cr.y);
          }
        }
        grantPlayerXp(Math.round(58 * eliteMult));
      } else if (
        cr.kind === CreatureKind.VILLAGER ||
        cr.kind === CreatureKind.WANDERER
      ) {
        const npcName = (cr.name || '').trim();
        // Andarilhos
        if (
          cr.kind === CreatureKind.WANDERER ||
          cr.npcRole === 'andarilho' ||
          npcName === 'Andarilho Kael' ||
          npcName === 'Peregrina Mira' ||
          npcName === 'Viajante Doran' ||
          npcName === 'Nômade Lyris' ||
          npcName === 'Caminhante Tomas' ||
          npcName === 'Exploradora Vesper'
        ) {
          const coins = Math.floor(Math.random() * 11); // 0 a 10 moedas
          if (coins > 0) {
            this.spawnDrop('gold_coin', coins, cr.x, cr.y);
          }
          if (Math.random() < 0.3) {
            this.spawnDrop('cooked_fish', 1, cr.x + 6, cr.y);
          }
        }
        // Ferreiros
        else if (
          npcName === 'Mestre Borin' ||
          npcName === 'Ferreiro Kaelen'
        ) {
          this.spawnDrop(
            'charcoal',
            1 + Math.floor(Math.random() * 3),
            cr.x,
            cr.y
          );
        } else if (
          npcName === 'Durgan da Forja' ||
          npcName === 'Thrain Martelo-Forte' ||
          cr.npcRole === 'ferreiro'
        ) {
          const ironCount = Math.floor(Math.random() * 4); // 0 a 3 ferros
          if (ironCount > 0) {
            this.spawnDrop('iron_bar', ironCount, cr.x, cr.y);
          }
        }
        // Mercadores e boticários
        else if (
          npcName === 'Mercadora Lyra' ||
          npcName === 'Mercador Vaen'
        ) {
          this.spawnDrop(
            'gold_coin',
            1 + Math.floor(Math.random() * 5),
            cr.x,
            cr.y
          );
        } else if (
          npcName === 'Mercadora Selene' ||
          npcName === 'Boticária Elara' ||
          cr.npcRole === 'mercador'
        ) {
          this.spawnDrop('herbal_poultice', 1, cr.x, cr.y);
        }
        // Guardiões
        else if (
          npcName === 'Capitão Thorne' ||
          npcName === 'Sentinela Garrick' ||
          npcName === 'Valéria Escudo-Solar' ||
          npcName === 'Comandante Roland' ||
          cr.npcRole === 'guardiao'
        ) {
          if (Math.random() < 0.3) {
            this.spawnDrop('wood_sword', 1, cr.x, cr.y);
          }
        }
        // Anciãos
        else if (npcName === 'Ancião Aldric') {
          this.spawnDrop('cooked_fish', 1, cr.x, cr.y);
        } else if (
          npcName === 'Sábio Vaelen' ||
          npcName === 'Matriarca Aurelia'
        ) {
          if (Math.random() < 0.5) {
            this.spawnDrop('herbal_poultice', 1, cr.x, cr.y);
          }
        } else if (npcName === 'Oráculo Orion' || cr.npcRole === 'anciao') {
          if (Math.random() < 0.3) {
            this.spawnDrop('shadow_elixir', 1, cr.x, cr.y);
          }
        }
        grantPlayerXp(40);

        // If this villager owned a bed/rest point, release their bed ownership;
        // and if their bed was the primary owner of an enclosed structure, the enclosed structure becomes UNOWNED
        // even if another bed with a living villager exists inside!
        for (const chunk of Object.values(this.world.chunks)) {
          if (!chunk) continue;
          for (const st of chunk.structures) {
            if (
              this.isRestPointStructure(st) &&
              (st.id === cr.homeHouseId || st.ownerId === cr.id)
            ) {
              const enclosedInfo = this.getEnclosedBuildingOwnerInfo(
                st.tileX,
                st.tileY
              );
              if (
                st.isPrimaryStructureOwner ||
                enclosedInfo?.primaryRestPoint?.id === st.id
              ) {
                this.clearEnclosedBuildingOwnershipOnLoss(
                  st.tileX,
                  st.tileY,
                  st.id
                );
              }
              st.ownerType = undefined;
              st.ownerId = undefined;
              st.ownerName = undefined;
              st.isPrimaryStructureOwner = false;
            }
          }
        }
      } else if (cr.kind === CreatureKind.SHEEP) {
        // Ovelha (1 a 2 lãs; 1 carne de cordeiro)
        this.spawnDrop('wool', 1 + Math.floor(Math.random() * 2), cr.x, cr.y);
        this.spawnDrop('raw_lamb', 1, cr.x + 6, cr.y);
        grantPlayerXp(15);
      } else if (cr.kind === CreatureKind.BOAR) {
        // Javali (1 a 2 carnes suínas)
        this.spawnDrop(
          'raw_pork',
          1 + Math.floor(Math.random() * 2),
          cr.x,
          cr.y
        );
        grantPlayerXp(20);
      } else if (cr.kind === CreatureKind.CAMEL) {
        // Camelo (nada)
        grantPlayerXp(25);
      } else if (cr.kind === CreatureKind.HORSE) {
        // Cavalo (nada)
        grantPlayerXp(22);
      }

      const idx = this.entities.creatures.indexOf(cr);
      if (idx !== -1) {
        this.entities.creatures.splice(idx, 1);
      }
      if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
        this.multiplayer.sendCreaturesSync(this.entities.creatures);
      }
      this.emitUiSnapshot();
    }
  }

  /**
   * Provokes a Village NPC and nearby fellow villagers/guards into becoming hostile enemies!
   */
  public provokeVillage(
    villageId: string | undefined,
    directNpc: CreatureEntity | null,
    affinityPenalty: number,
    alertMessage: string
  ): void {
    let alertedAny = false;
    const addedDebt = Math.max(8, Math.round(affinityPenalty * 0.35));
    for (const cr of this.entities.creatures) {
      if (
        (cr.kind !== CreatureKind.VILLAGER &&
          cr.kind !== CreatureKind.WANDERER) ||
        cr.hp <= 0
      ) {
        continue;
      }
      const sameVillage =
        (villageId && cr.villageId === villageId) ||
        cr === directNpc ||
        Math.hypot(cr.x - this.player.x, cr.y - this.player.y) < 340;
      if (sameVillage) {
        cr.affinity = Math.max(0, (cr.affinity ?? 55) - affinityPenalty);
        cr.isHostile = true;
        cr.provokedTimer = 45;
        cr.peaceDebtCoins = Math.min(
          85,
          Math.max(12, (cr.peaceDebtCoins || 8) + addedDebt)
        );
        cr.aiState = 'chase';
        alertedAny = true;
      }
    }
    if (alertedAny) {
      this.addFloatingText(
        alertMessage,
        this.player.x,
        this.player.y - 30,
        '#ef4444'
      );
    }
  }

  /**
   * Returns true if the player is currently holding the Peace Item (`peace_treaty`) in their active hand slot.
   */
  public isPlayerHoldingPeaceItem(): boolean {
    const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];
    return Boolean(heldSlot && heldSlot.itemId === 'peace_treaty' && heldSlot.count > 0);
  }

  /**
   * Returns the exact coin charge (in Moedas de Ouro Antigas) demanded by a hostile Villager/Village
   * to forgive the hostility caused by the player.
   */
  public getNpcPeaceDebtCoins(npc: CreatureEntity): number {
    let maxVillageDebt = npc.peaceDebtCoins || 0;
    if (npc.villageId) {
      for (const cr of this.entities.creatures) {
        if (
          cr.villageId === npc.villageId &&
          cr.hp > 0 &&
          (cr.peaceDebtCoins || 0) > maxVillageDebt
        ) {
          maxVillageDebt = cr.peaceDebtCoins || 0;
        }
      }
    }
    if (maxVillageDebt > 0) {
      return Math.max(10, Math.round(maxVillageDebt));
    }
    const aff = npc.affinity ?? 15;
    return Math.max(12, Math.round((85 - aff) * 0.3));
  }

  /**
   * Executes a trade with a friendly Village NPC or Wanderer, increasing their Affinity and granting XP.
   */
  public executeNpcTrade(
    npcId: string,
    tradeId: string
  ): { ok: boolean; message: string } {
    const npc = this.entities.creatures.find(
      (c) =>
        c.id === npcId &&
        (c.kind === CreatureKind.VILLAGER || c.kind === CreatureKind.WANDERER)
    );
    if (!npc) return { ok: false, message: 'Habitante não encontrado.' };
    if (npc.isHostile) {
      return {
        ok: false,
        message: `${npc.name} está hostil! Ofereça um Tributo de Paz primeiro.`,
      };
    }

    const offer = npc.trades?.find((t) => t.id === tradeId);
    if (!offer) return { ok: false, message: 'Oferta inválida.' };

    const currentAff = npc.affinity ?? 55;
    if (currentAff < offer.minAffinity) {
      return {
        ok: false,
        message: `Requer ♥${offer.minAffinity} de Afinidade com ${npc.name}.`,
      };
    }

    if (this.getItemCount(offer.giveItemId) < offer.giveCount) {
      const giveName = ITEMS[offer.giveItemId]?.name || offer.giveItemId;
      return {
        ok: false,
        message: `Você precisa de ${offer.giveCount}x ${giveName}.`,
      };
    }

    this.removeItemFromInventory(offer.giveItemId, offer.giveCount);
    const added = this.addItemToInventory(offer.receiveItemId, offer.receiveCount);
    if (!added) {
      this.spawnDrop(offer.receiveItemId, offer.receiveCount, this.player.x, this.player.y);
    }

    npc.affinity = Math.min(100, currentAff + offer.affinityGain);
    // Also slightly boost fellow villagers in the same village
    if (npc.villageId) {
      for (const other of this.entities.creatures) {
        if (
          other.id !== npc.id &&
          other.kind === CreatureKind.VILLAGER &&
          other.villageId === npc.villageId
        ) {
          other.affinity = Math.min(
            100,
            (other.affinity ?? 55) + Math.ceil(offer.affinityGain * 0.35)
          );
        }
      }
    }

    if (npc.outsideNightTimer && npc.outsideNightTimer > 0) {
      npc.outsideNightTimer = 20;
    }

    soundManager.playCraft();
    this.gainXp(25);
    const recName = ITEMS[offer.receiveItemId]?.name || offer.receiveItemId;
    this.addFloatingText(
      `Troca concluída: +${offer.receiveCount} ${recName} (♥+${offer.affinityGain})`,
      npc.x,
      npc.y - 24,
      '#4ade80'
    );
    this.emitUiSnapshot();
    return {
      ok: true,
      message: `Negócio fechado! Recebeu ${offer.receiveCount}x ${recName} (+${offer.affinityGain}♥ Afinidade).`,
    };
  }

  /**
   * Gives a gift to a Village NPC or Wanderer to boost Affinity (or appease low affinity).
   */
  public giveNpcGift(
    npcId: string,
    giftItemId: string
  ): { ok: boolean; message: string } {
    const npc = this.entities.creatures.find(
      (c) =>
        c.id === npcId &&
        (c.kind === CreatureKind.VILLAGER || c.kind === CreatureKind.WANDERER)
    );
    if (!npc) return { ok: false, message: 'Habitante não encontrado.' };
    if (npc.isHostile) {
      return {
        ok: false,
        message:
          'A vila está hostil! Segure o Tratado da Paz Real na mão e pague a cobrança em moedas para perdoar a dívida.',
      };
    }
    if (npc.outsideNightTimer && npc.outsideNightTimer > 0) {
      npc.outsideNightTimer = 20;
    }

    if (this.getItemCount(giftItemId) < 1) {
      return { ok: false, message: 'Você não possui este presente na mochila.' };
    }

    const gainMap: Record<string, number> = {
      gold_coin: 18,
      warrior_feast: 20,
      solar_crystal: 14,
      apple: 10,
      coconut: 8,
    };
    const gain = gainMap[giftItemId] || 8;

    this.removeItemFromInventory(giftItemId, 1);
    npc.affinity = Math.min(100, (npc.affinity ?? 55) + gain);

    if (npc.villageId) {
      for (const other of this.entities.creatures) {
        if (
          other.id !== npc.id &&
          other.kind === CreatureKind.VILLAGER &&
          other.villageId === npc.villageId
        ) {
          other.affinity = Math.min(
            100,
            (other.affinity ?? 55) + Math.ceil(gain * 0.4)
          );
        }
      }
    }

    soundManager.playTameSuccess();
    this.addFloatingText(
      `Presente aceito! ♥+${gain} Afinidade`,
      npc.x,
      npc.y - 24,
      '#fde047'
    );
    this.emitUiSnapshot();
    return {
      ok: true,
      message: `${npc.name} agradeceu pelo presente! Afinidade subiu em +${gain}♥.`,
    };
  }

  /**
   * Pays the hostile village's coin debt (`peaceDebtCoins` in `gold_coin`) AND consumes 1x `peace_treaty`
   * (held in hand) to forgive the hostility caused by the player.
   */
  public payPeaceTribute(npcId: string): { ok: boolean; message: string } {
    const npc = this.entities.creatures.find(
      (c) =>
        c.id === npcId &&
        (c.kind === CreatureKind.VILLAGER || c.kind === CreatureKind.WANDERER)
    );
    if (!npc) return { ok: false, message: 'Habitante não encontrado.' };
    if (!npc.isHostile) {
      return { ok: false, message: `${npc.name} já está em paz com você.` };
    }

    if (!this.isPlayerHoldingPeaceItem()) {
      return {
        ok: false,
        message:
          'Você precisa estar segurando o Tratado da Paz Real na mão (barra rápida selecionada) para selar o perdão!',
      };
    }

    const debtCoins = this.getNpcPeaceDebtCoins(npc);
    const ownedCoins = this.getItemCount('gold_coin');
    if (ownedCoins < debtCoins) {
      return {
        ok: false,
        message: `Cobrança da vila: ${debtCoins}x Moedas de Ouro Antigas (você possui ${ownedCoins}x).`,
      };
    }

    // 1. Deduct the demanded Gold Coins
    this.removeItemFromInventory('gold_coin', debtCoins);

    // 2. Consume the Peace Item (Tratado da Paz Real) held in the player's hand
    const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];
    if (heldSlot && heldSlot.itemId === 'peace_treaty') {
      this.consumeInventoryAt(this.player.selectedHotbarIndex, 1);
    } else {
      this.removeItemFromInventory('peace_treaty', 1);
    }

    // 3. Forgive hostility & clear debt across the entire village
    for (const cr of this.entities.creatures) {
      if (
        (cr.kind === CreatureKind.VILLAGER ||
          cr.kind === CreatureKind.WANDERER) &&
        (cr.id === npc.id ||
          (npc.villageId && cr.villageId === npc.villageId) ||
          Math.hypot(cr.x - npc.x, cr.y - npc.y) < 380)
      ) {
        cr.isHostile = false;
        cr.provokedTimer = 0;
        cr.peaceDebtCoins = 0;
        cr.retaliateTargetId = undefined;
        cr.affinity = Math.max(55, (cr.affinity ?? 30) + 30);
        cr.aiState = 'wander';
      }
    }

    soundManager.playLevelUp();
    this.gainXp(45);
    this.renderer.spawnBurst(npc.x, npc.y - 6, 'GOLD', 18);
    this.renderer.spawnBurst(this.player.x, this.player.y - 6, 'HEAL', 14);
    this.renderer.spawnRipple(npc.x, npc.y, '#4ade80', 34, 0.65);
    this.addFloatingText(
      `🕊️ Dívida Perdoada! (-${debtCoins} Moedas & -1 Tratado da Paz)`,
      npc.x,
      npc.y - 26,
      '#4ade80'
    );
    this.emitUiSnapshot();
    return {
      ok: true,
      message: `Dívida perdoada! Você pagou ${debtCoins}x Moedas de Ouro e o Tratado da Paz Real foi consumido. ${npc.name} e toda a vila voltaram à paz!`,
    };
  }

  private damagePlayer(
    rawAmount: number,
    sourceX: number,
    sourceY: number,
    attackerCreature?: CreatureEntity
  ): void {
    const reduction = this.getTotalDefenseBonus();
    const finalDmg = Math.max(1, Math.round(rawAmount * (1 - reduction)));

    this.player.hp = Math.max(0, this.player.hp - finalDmg);
    this.player.hitFlashTimer = 0.25;
    soundManager.playPlayerHurt();
    this.renderer.spawnBurst(
      this.player.x,
      this.player.y,
      'BLOOD',
      this.player.hp <= 0 ? 16 : 9
    );
    this.renderer.spawnRipple(this.player.x, this.player.y, '#f87171', 18, 0.32);

    // Rule: If the player is attacked, ONLY combat-capable tamed allies (Camel & Boar) in 'follow' state attack whoever attacked the player to defend them
    // (focusing on a single enemy until defeating it or dying).
    if (attackerCreature && attackerCreature.hp > 0 && !attackerCreature.tamed) {
      for (const pet of this.entities.creatures) {
        if (
          pet.tamed &&
          pet.hp > 0 &&
          EntityManager.isCombatAllyKind(pet.kind) &&
          this.isCreatureOwnedByLocalPlayer(pet) &&
          pet.aiState === 'follow' &&
          this.player.mountedEntityId !== pet.id &&
          Math.hypot(pet.x - this.player.x, pet.y - this.player.y) <= 230
        ) {
          const currentTarget = pet.combatTargetId
            ? this.entities.creatures.find(
                (o) =>
                  o.id === pet.combatTargetId &&
                  o.hp > 0 &&
                  !o.isInsideHouse &&
                  !o.tamed
              )
            : null;
          if (!currentTarget) {
            pet.combatTargetId = attackerCreature.id;
          }
        }
      }
    }

    const dx = this.player.x - sourceX;
    const dy = this.player.y - sourceY;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const kx = this.player.x + (dx / dist) * 12;
    const ky = this.player.y + (dy / dist) * 12;
    if (this.canEntityOccupy(kx, ky)) {
      this.player.x = kx;
      this.player.y = ky;
    }

    this.addFloatingText(`-${finalDmg}`, this.player.x, this.player.y - 18, '#f87171');
    this.emitUiSnapshot();

    if (this.player.hp <= 0) {
      this.handlePlayerDeath();
    }
  }

  public setPlayerRespawnPoint(
    worldX: number,
    worldY: number,
    label: string
  ): void {
    const safePos = this.world.findNearestSafePosition(
      worldX,
      worldY + 14,
      6.2
    );
    this.player.respawnX = safePos.x;
    this.player.respawnY = safePos.y;
    this.player.respawnLabel = label;
  }

  public lootDeathBag(bagId: string): boolean {
    if (this.claimedDeathBagIds.has(bagId)) return false;
    const idx = this.deathBags.findIndex((b) => b.id === bagId);
    if (idx === -1) return false;

    // In Guest multiplayer mode, send an authoritative claim request to Host so two players can never duplicate items from a DeathBag
    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
      if (this.pendingDeathBagClaims.has(bagId)) return false;
      this.pendingDeathBagClaims.add(bagId);
      this.multiplayer.sendWorldInteractRequest({
        action: 'loot_death_bag_claim',
        bagId,
      });
      return true;
    }

    return this.executeLocalLootDeathBag(bagId);
  }

  private executeLocalLootDeathBag(bagId: string): boolean {
    if (this.claimedDeathBagIds.has(bagId)) return false;
    const idx = this.deathBags.findIndex((b) => b.id === bagId);
    if (idx === -1) return false;
    const bag = this.deathBags[idx];
    if (bag.claimedBy && bag.claimedBy !== this.getLocalOwnerId()) {
      return false;
    }
    bag.claimedBy = this.getLocalOwnerId();

    let recoveredStacks = 0;

    // 1. Recover Gold Coins
    if (bag.goldCoins > 0) {
      this.player.goldCoins = (this.player.goldCoins || 0) + bag.goldCoins;
      bag.goldCoins = 0;
      recoveredStacks++;
    }

    // 2. Recover items into player's inventory (or auto-equip armor if slot is empty)
    const remainingItems: InventorySlot[] = [];
    for (const slot of bag.items) {
      if (!slot || slot.count <= 0) continue;
      const itemDef = ITEMS[slot.itemId];
      // If it's a piece of armor and the player's corresponding armor slot is empty, equip it directly if count === 1
      if (
        itemDef &&
        itemDef.category === ItemCategory.ARMOR &&
        slot.count === 1
      ) {
        if (!this.player.equippedBySlot) {
          this.player.equippedBySlot = {
            head: null,
            body: null,
            legs: null,
            feet: null,
          };
        }
        const eqSlot: EquipmentSlot = itemDef.equipSlot || 'body';
        if (!this.player.equippedBySlot[eqSlot]) {
          this.player.equippedBySlot[eqSlot] = itemDef.id;
          this.player.equippedArmorId = this.player.equippedBySlot.body;
          this.recalculatePlayerMaxHp();
          recoveredStacks++;
          continue;
        }
      }

      if (this.addItemToInventory(slot.itemId, slot.count)) {
        recoveredStacks++;
      } else {
        remainingItems.push(slot);
      }
    }

    bag.items = remainingItems;
    bag.claimedBy = null;
    if (bag.items.length === 0 && bag.goldCoins <= 0) {
      this.claimedDeathBagIds.add(bagId);
      this.deathBags.splice(idx, 1);
      soundManager.playLevelUp();
      this.renderer.spawnBurst(bag.x, bag.y, 'GOLD', 18);
      this.renderer.spawnRipple(bag.x, bag.y, '#4ade80', 30, 0.55);
      this.addFloatingText(
        '🎒 Bolsinha recuperada! Todos os itens voltaram!',
        this.player.x,
        this.player.y - 24,
        '#4ade80'
      );
    } else {
      soundManager.playPickup();
      this.renderer.spawnBurst(bag.x, bag.y, 'GOLD', 10);
      this.addFloatingText(
        recoveredStacks > 0
          ? `🎒 Recuperou parte dos itens (Mochila cheia: restam ${bag.items.length} na bolsinha)`
          : 'Mochila cheia! Libere espaço para recolher o restante da bolsinha',
        this.player.x,
        this.player.y - 24,
        '#fde047'
      );
    }

    if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
      this.multiplayer.sendDeathBagsSync(this.deathBags);
    }
    void this.saveGame(true);
    this.emitUiSnapshot();
    return true;
  }

  private handlePlayerDeath(): void {
    if (this.metadata.difficulty === 'hardcore') {
      this.isGameOver = true;
      this.emitUiSnapshot();
      return;
    }

    const deathX = this.player.x;
    const deathY = this.player.y;

    // Collect all items the player possessed (inventory + equipped armor + goldCoins) into a DeathBag
    const bagItems: InventorySlot[] = [];
    if (Array.isArray(this.player.inventory)) {
      for (let i = 0; i < this.player.inventory.length; i++) {
        const slot = this.player.inventory[i];
        if (slot && slot.count > 0) {
          bagItems.push({ itemId: slot.itemId, count: slot.count });
          this.player.inventory[i] = null;
        }
      }
    } else {
      this.player.inventory = new Array(TOTAL_INVENTORY_SIZE).fill(null);
    }

    if (this.player.equippedBySlot) {
      for (const eqSlot of ['head', 'body', 'legs', 'feet'] as EquipmentSlot[]) {
        const eqId = this.player.equippedBySlot[eqSlot];
        if (eqId) {
          bagItems.push({ itemId: eqId, count: 1 });
          this.player.equippedBySlot[eqSlot] = null;
        }
      }
    }
    this.player.equippedArmorId = null;
    this.recalculatePlayerMaxHp();

    const droppedGold = Math.max(0, Math.floor(this.player.goldCoins || 0));
    this.player.goldCoins = 0;

    let droppedBag = false;
    if (bagItems.length > 0 || droppedGold > 0) {
      droppedBag = true;
      const newBag: DeathBag = {
        id: `deathbag_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
        ownerId: this.getLocalOwnerId(),
        ownerName:
          this.multiplayer.localPlayerName ||
          this.settings.playerName ||
          'Aventureiro',
        x: deathX,
        y: deathY,
        items: bagItems,
        goldCoins: droppedGold,
        createdAt: Date.now(),
        expiresTimer: 600, // 10 minutes (600 seconds)
        maxTimer: 600,
      };
      this.deathBags.push(newBag);
      if (this.multiplayer.isOnline) {
        if (this.multiplayer.role === 'HOST') {
          this.multiplayer.sendDeathBagsSync(this.deathBags);
        } else {
          this.multiplayer.sendWorldInteractRequest({
            action: 'spawn_death_bag',
            bag: newBag,
          });
        }
      }
      this.revealWorldAndPopulateIslands(deathX, deathY, 6);
      this.renderer.spawnBurst(deathX, deathY, 'GOLD', 14);
      this.renderer.spawnRipple(deathX, deathY, '#f43f5e', 30, 0.6);
    }

    // Respawn at the last rest point the player interacted with or used
    const targetRespawnX =
      typeof this.player.respawnX === 'number' &&
      Number.isFinite(this.player.respawnX)
        ? this.player.respawnX
        : 16;
    const targetRespawnY =
      typeof this.player.respawnY === 'number' &&
      Number.isFinite(this.player.respawnY)
        ? this.player.respawnY
        : 16;
    const safeRespawn = this.world.findNearestSafePosition(
      targetRespawnX,
      targetRespawnY,
      6.2
    );
    const respawnLabel = this.player.respawnLabel || 'Acampamento Inicial';

    this.player.x = safeRespawn.x;
    this.player.y = safeRespawn.y;
    this.player.hp = Math.round(this.player.maxHp * 0.7);
    this.player.hunger = Math.round(this.player.maxHunger * 0.7);
    this.player.stamina = this.player.maxStamina;
    const mount = this.getActiveMount();
    if (mount) {
      if (mount.kind === CreatureKind.BOAT) {
        this.dismountCreature();
      } else {
        mount.x = this.player.x;
        mount.y = this.player.y;
        mount.vx = 0;
        mount.vy = 0;
        this.syncPlayerMountedCreatureData();
      }
    }
    this.revealWorldAndPopulateIslands(this.player.x, this.player.y, 10);
    this.addFloatingText(
      droppedBag
        ? `Renascido em ${respawnLabel} · 🎒 Bolsinha marcada no Mapa (10 min)!`
        : `Renascido em ${respawnLabel}`,
      this.player.x,
      this.player.y - 24,
      '#38bdf8'
    );
    void this.saveGame(true);
    this.emitUiSnapshot();
  }

  public setTamedAnimalState(
    creatureId: string,
    state: 'stay' | 'follow' | 'graze'
  ): void {
    const cr = this.entities.creatures.find(
      (c) =>
        c.id === creatureId &&
        c.tamed &&
        this.isCreatureOwnedByLocalPlayer(c)
    );
    if (!cr) return;
    cr.aiState = state;
    if (state !== 'follow') {
      cr.combatTargetId = null;
      cr.retaliateTargetId = undefined;
    }
    if (state === 'stay') {
      cr.vx = 0;
      cr.vy = 0;
    }
    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
      this.multiplayer.sendGuestMountEvent({
        action: 'tame',
        creatureId: cr.id,
        tamed: true,
        tameProgress: 100,
        aiState: cr.aiState,
        hp: cr.hp,
        ownerId: cr.ownerId,
        ownerName: cr.ownerName,
      });
    } else if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
      this.multiplayer.sendCreaturesSync(this.entities.creatures);
    }
    this.emitUiSnapshot();
  }

  public toggleTamedAnimalState(creatureId: string): void {
    const cr = this.entities.creatures.find(
      (c) =>
        c.id === creatureId &&
        c.tamed &&
        this.isCreatureOwnedByLocalPlayer(c)
    );
    if (!cr) return;
    const nextState: 'stay' | 'follow' | 'graze' =
      cr.aiState === 'follow'
        ? 'stay'
        : cr.aiState === 'stay'
        ? 'graze'
        : 'follow';
    this.setTamedAnimalState(creatureId, nextState);
  }

  public setAllTamedAnimalsState(state: 'follow' | 'stay' | 'graze'): void {
    for (const cr of this.entities.creatures) {
      if (cr.tamed && this.isCreatureOwnedByLocalPlayer(cr)) {
        cr.aiState = state;
        if (state !== 'follow') {
          cr.combatTargetId = null;
          cr.retaliateTargetId = undefined;
        }
        if (state === 'stay') {
          cr.vx = 0;
          cr.vy = 0;
        }
        if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
          this.multiplayer.sendGuestMountEvent({
            action: 'tame',
            creatureId: cr.id,
            tamed: true,
            tameProgress: 100,
            aiState: cr.aiState,
            hp: cr.hp,
            ownerId: cr.ownerId,
            ownerName: cr.ownerName,
          });
        }
      }
    }
    if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
      this.multiplayer.sendCreaturesSync(this.entities.creatures);
    }
    soundManager.playPickup();
    this.emitUiSnapshot();
  }

  public consumeSlotItem(slotIndex: number): void {
    const slot = this.player.inventory[slotIndex];
    if (!slot) return;
    const item = ITEMS[slot.itemId];
    if (!item || item.category !== ItemCategory.CONSUMABLE) return;

    // 1. Special Explosive Use: Fire Bomb
    if (item.specialUse === 'bomb') {
      this.consumeInventoryAt(slotIndex, 1);
      soundManager.playHitStone();
      const dirVec = this.getDirectionOffset(this.player.direction);
      const bx = this.player.x + dirVec.x * 28;
      const by = this.player.y + dirVec.y * 28;

      this.addFloatingText(
        '💥 EXPLOSÃO SOLAR! (65 Dano)',
        bx,
        by - 20,
        '#f97316'
      );

      for (let i = this.entities.creatures.length - 1; i >= 0; i--) {
        const cr = this.entities.creatures[i];
        if (!cr.tamed && Math.hypot(cr.x - bx, cr.y - by) <= 115) {
          this.damageCreature(cr, 65, bx, by, 2.0);
        }
      }

      const bChunk = this.world.tileToChunk(
        Math.floor(bx / TILE_SIZE),
        Math.floor(by / TILE_SIZE)
      );
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const chunk = this.world.getOrCreateChunk(
            bChunk.cx + dx,
            bChunk.cy + dy
          );
          for (let ni = chunk.nodes.length - 1; ni >= 0; ni--) {
            const node = chunk.nodes[ni];
            const nx = node.tileX * TILE_SIZE + TILE_SIZE / 2;
            const ny = node.tileY * TILE_SIZE + TILE_SIZE / 2;
            if (Math.hypot(nx - bx, ny - by) <= 92) {
              this.harvestNatureNode(
                chunk,
                ni,
                'iron_pickaxe',
                ToolType.PICKAXE,
                2,
                2.0
              );
            }
          }
        }
      }
      this.emitUiSnapshot();
      return;
    }

    // 2. Special Recall Crystal Use: Teleport to Base/Waypoint
    if (item.specialUse === 'recall') {
      this.consumeInventoryAt(slotIndex, 1);
      const destTile =
        this.waypoints.length > 0
          ? { tx: this.waypoints[0].tileX, ty: this.waypoints[0].tileY }
          : { tx: 0, ty: 0 };
      const destX = destTile.tx * TILE_SIZE + 16;
      const destY = destTile.ty * TILE_SIZE + 16;

      this.player.x = destX;
      this.player.y = destY;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 50);
      this.player.stamina = this.player.maxStamina;

      const activeMount = this.getActiveMount();
      if (activeMount) {
        if (
          activeMount.kind === CreatureKind.BOAT &&
          !this.world.isWorldPosInWater(destX, destY)
        ) {
          this.dismountCreature();
        } else {
          activeMount.x = destX;
          activeMount.y = destY;
          activeMount.vx = 0;
          activeMount.vy = 0;
          this.syncPlayerMountedCreatureData();
        }
      }

      for (const pet of this.entities.creatures) {
        if (
          pet.tamed &&
          pet.aiState === 'follow' &&
          pet.id !== this.player.mountedEntityId
        ) {
          pet.x = destX + (Math.random() - 0.5) * 36;
          pet.y = destY + (Math.random() - 0.5) * 36;
        }
      }

      soundManager.playLevelUp();
      this.addFloatingText(
        '✦ Teleporte Astral para a Base! (+50 HP)',
        destX,
        destY - 24,
        '#38bdf8'
      );
      this.emitUiSnapshot();
      return;
    }

    // 2B. Special Peace Treaty Use: Hold in hand & talk to a hostile villager to inspect & pay coin debt
    if (item.specialUse === 'peace_treaty') {
      if (slotIndex < HOTBAR_SIZE) {
        this.player.selectedHotbarIndex = slotIndex;
      }
      const hostileNpc = this.entities.creatures.find(
        (c) =>
          (c.kind === CreatureKind.VILLAGER ||
            c.kind === CreatureKind.WANDERER) &&
          c.hp > 0 &&
          !c.isInsideHouse &&
          c.isHostile &&
          Math.hypot(c.x - this.player.x, c.y - this.player.y) <= 115
      );
      if (hostileNpc) {
        soundManager.playPickup();
        if (this.onNpcInteract) {
          this.onNpcInteract(hostileNpc);
        }
      } else {
        soundManager.playPickup();
        this.addFloatingText(
          '🕊️ Segure o Tratado da Paz na mão e fale com um aldeão de uma vila hostil!',
          this.player.x,
          this.player.y - 24,
          '#fde047'
        );
      }
      this.emitUiSnapshot();
      return;
    }

    // 3. Permanent Max HP Upgrade (Primordial Ambrosia)
    if (item.permanentMaxHpBonus) {
      this.player.bonusMaxHpFromItems =
        Math.max(0, Math.floor(this.player.bonusMaxHpFromItems || 0)) +
        item.permanentMaxHpBonus;
      this.recalculatePlayerMaxHp();
      this.player.maxStamina += 15;
    }

    if (item.hungerRestore) {
      this.player.hunger = Math.min(
        this.player.maxHunger,
        this.player.hunger + item.hungerRestore
      );
    }
    if (item.hpRestore) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + item.hpRestore);
    }
    if (item.staminaRestore) {
      this.player.stamina = Math.min(
        this.player.maxStamina,
        this.player.stamina + item.staminaRestore
      );
    }

    // 4. Timed Combat / Speed Buffs
    if (item.buffType === 'strength' && item.buffDuration) {
      this.player.strengthBuffTimer = item.buffDuration;
    } else if (item.buffType === 'speed' && item.buffDuration) {
      this.player.speedBuffTimer = item.buffDuration;
    }

    this.consumeInventoryAt(slotIndex, 1);
    if (item.permanentMaxHpBonus) {
      soundManager.playLevelUp();
      this.addFloatingText(
        `✦ +${item.permanentMaxHpBonus} VIDA MÁXIMA PERMANENTE!`,
        this.player.x,
        this.player.y - 26,
        '#fde047'
      );
    } else if (item.buffType) {
      soundManager.playTameSuccess();
      this.addFloatingText(
        item.buffType === 'strength'
          ? `Fúria de Combate (+35% Dano por ${item.buffDuration}s!)`
          : `Passos de Vento (+30% Velocidade por ${item.buffDuration}s!)`,
        this.player.x,
        this.player.y - 24,
        '#fde047'
      );
    } else {
      soundManager.playPickup();
      this.addFloatingText(
        `+${item.hpRestore || 0} HP / +${item.hungerRestore || 0} Fome`,
        this.player.x,
        this.player.y - 20,
        '#4ade80'
      );
    }
    this.emitUiSnapshot();
  }

  /**
   * Returns the character's pure real status Max HP (base 100 + level + vitality),
   * strictly excluding any item or armor effects.
   */
  public getPlayerStatusMaxHp(): number {
    const lvl = Math.max(1, Math.floor(this.player.level || 1));
    const vit = Math.max(0, Math.floor(this.player.attributes?.vitality ?? 0));
    return 100 + (lvl - 1) * 10 + vit * 18;
  }

  /**
   * Returns the character's base Attack status (Nv. 0 = 4, scaling +12% per Strength level).
   */
  public getPlayerBaseAttackStatus(): number {
    const str = Math.max(0, Math.floor(this.player.attributes?.strength ?? 0));
    return Math.round(4 * (1 + str * 0.12) * 10) / 10;
  }

  /**
   * Returns the Attack/Break Speed multiplier from the `attackSpeed` (Vel ATK) attribute (+8% per level).
   */
  public getAttackSpeedMultiplier(): number {
    const atkSpd = Math.max(
      0,
      Math.floor(this.player.attributes?.attackSpeed ?? 0)
    );
    return 1 + atkSpd * 0.08;
  }

  /**
   * Returns the realistic attack/harvest swing cooldown in seconds (0.42s at Nv. 0, fast enough to chain break hits smoothly),
   * adjusted by any held weapon's `attackSpeedMod` (e.g. -1.0 = -100% attack speed -> doubles swing cooldown).
   */
  public getPlayerAttackCooldownSec(): number {
    const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];
    const heldItem = heldSlot ? ITEMS[heldSlot.itemId] : null;
    const itemSpeedMod = heldItem?.attackSpeedMod ?? 0;

    let baseCooldown = 0.42 / this.getAttackSpeedMultiplier();
    if (itemSpeedMod < 0) {
      baseCooldown *= 1 + Math.abs(itemSpeedMod);
    } else if (itemSpeedMod > 0) {
      baseCooldown /= 1 + itemSpeedMod;
    }
    return Math.max(0.18, baseCooldown);
  }

  /**
   * Returns the appendix Max HP bonus granted by equipped armor pieces.
   */
  public getTotalEquipmentMaxHpBonus(): number {
    const eq = this.player.equippedBySlot || {
      head: null,
      body: this.player.equippedArmorId || null,
      legs: null,
      feet: null,
    };
    let total = 0;
    for (const slot of ['head', 'body', 'legs', 'feet'] as EquipmentSlot[]) {
      const id = eq[slot];
      if (id && ITEMS[id]?.maxHpBonus) {
        total += ITEMS[id].maxHpBonus || 0;
      }
    }
    return total;
  }

  /**
   * Recalculates total Max HP as (Status Max HP + Permanent Item Bonus + Armor Appendix Bonus).
   * Never heals or adds current HP — only clamps current HP if it exceeds the new total Max HP.
   */
  public recalculatePlayerMaxHp(): void {
    const statusMax = this.getPlayerStatusMaxHp();
    const permItemBonus = Math.max(
      0,
      Math.floor(this.player.bonusMaxHpFromItems || 0)
    );
    const armorBonus = this.getTotalEquipmentMaxHpBonus();
    this.player.maxHp = statusMax + permItemBonus + armorBonus;
    this.player.hp = Math.min(this.player.hp, this.player.maxHp);
  }

  /**
   * Returns the damage reduction bonus from the character's `defense` attribute (+3% per level).
   */
  public getStatusDefenseBonus(): number {
    const def = Math.max(0, Math.floor(this.player.attributes?.defense ?? 0));
    return def * 0.03;
  }

  /**
   * Returns the damage reduction bonus granted purely by equipped armor pieces.
   */
  public getEquipmentDefenseBonus(): number {
    const eq = this.player.equippedBySlot || {
      head: null,
      body: this.player.equippedArmorId || null,
      legs: null,
      feet: null,
    };
    let total = 0;
    for (const slot of ['head', 'body', 'legs', 'feet'] as EquipmentSlot[]) {
      const id = eq[slot];
      if (id && ITEMS[id]?.defenseBonus) {
        total += ITEMS[id].defenseBonus || 0;
      }
    }
    return total;
  }

  public getTotalDefenseBonus(): number {
    return Math.min(
      0.8,
      this.getStatusDefenseBonus() + this.getEquipmentDefenseBonus()
    );
  }

  public getTotalEquipmentSpeedBonus(): number {
    const eq = this.player.equippedBySlot || {
      head: null,
      body: this.player.equippedArmorId || null,
      legs: null,
      feet: null,
    };
    let total = 0;
    for (const slot of ['head', 'body', 'legs', 'feet'] as EquipmentSlot[]) {
      const id = eq[slot];
      if (id && ITEMS[id]?.speedBonus) {
        total += ITEMS[id].speedBonus || 0;
      }
    }
    return total;
  }

  public equipArmorFromSlot(slotIndex: number): void {
    const slot = this.player.inventory[slotIndex];
    if (!slot) return;
    const item = ITEMS[slot.itemId];
    if (!item || item.category !== ItemCategory.ARMOR) return;

    if (!this.player.equippedBySlot) {
      this.player.equippedBySlot = {
        head: null,
        body: this.player.equippedArmorId || null,
        legs: null,
        feet: null,
      };
    }

    const targetSlot: EquipmentSlot = item.equipSlot || 'body';
    const previousItemId = this.player.equippedBySlot[targetSlot];

    this.player.equippedBySlot[targetSlot] = item.id;
    this.player.equippedArmorId = this.player.equippedBySlot.body;
    this.consumeInventoryAt(slotIndex, 1);

    if (previousItemId) {
      const added = this.addItemToInventory(previousItemId, 1);
      if (!added) {
        this.spawnDrop(previousItemId, 1, this.player.x, this.player.y);
      }
    }

    // Recalculate Max HP appendix from armor without healing current HP
    this.recalculatePlayerMaxHp();

    const slotLabelMap: Record<EquipmentSlot, string> = {
      head: 'Cabeça',
      body: 'Parte Superior',
      legs: 'Parte Inferior',
      feet: 'Pés',
    };

    soundManager.playCraft();
    this.renderer.spawnBurst(this.player.x, this.player.y, 'SPARK', 8);
    this.addFloatingText(
      `[${slotLabelMap[targetSlot]}] ${item.name} equipado!`,
      this.player.x,
      this.player.y - 20,
      '#38bdf8'
    );
    this.emitUiSnapshot();
  }

  public unequipArmorSlot(equipSlot: EquipmentSlot): void {
    if (!this.player.equippedBySlot) return;
    const itemId = this.player.equippedBySlot[equipSlot];
    if (!itemId) return;

    const added = this.addItemToInventory(itemId, 1);
    if (added) {
      this.player.equippedBySlot[equipSlot] = null;
      this.player.equippedArmorId = this.player.equippedBySlot.body;
      this.recalculatePlayerMaxHp();
      soundManager.playPickup();
      this.emitUiSnapshot();
    } else {
      this.addFloatingText(
        'Mochila cheia para desequipar!',
        this.player.x,
        this.player.y - 20,
        '#f43f5e'
      );
    }
  }

  public unequipArmor(): void {
    if (!this.player.equippedBySlot) return;
    for (const s of ['body', 'head', 'legs', 'feet'] as EquipmentSlot[]) {
      if (this.player.equippedBySlot[s]) {
        this.unequipArmorSlot(s);
        return;
      }
    }
  }

  public updatePlayerAppearance(partial: Partial<PlayerAppearance>): void {
    this.player.appearance = {
      ...(this.player.appearance || {
        gender: 'masculino',
        skinColor: '#fdba74',
        hairColor: '#451a03',
        hairStyle: 'adventurer',
        eyeColor: '#0f172a',
        shirtColor: '#2563eb',
        pantsColor: '#334155',
      }),
      ...partial,
    };
    soundManager.playPickup();
    this.emitUiSnapshot();
  }

  public selectHotbarSlot(index: number): void {
    if (index < 0 || index >= HOTBAR_SIZE) return;
    this.player.selectedHotbarIndex = index;
    this.customTargetTile = null;
    this.emitUiSnapshot();
  }

  public swapInventorySlots(indexA: number, indexB: number): void {
    if (
      indexA < 0 ||
      indexA >= this.player.inventory.length ||
      indexB < 0 ||
      indexB >= this.player.inventory.length ||
      indexA === indexB
    ) {
      return;
    }
    const slotA = this.player.inventory[indexA];
    const slotB = this.player.inventory[indexB];

    // If moving an item (slotA) onto an identical item (slotB), stack them up to maxStack first!
    if (slotA && slotB && slotA.itemId === slotB.itemId) {
      const maxStack = ITEMS[slotB.itemId]?.maxStack || 99;
      if (maxStack > 1 && slotB.count < maxStack) {
        const transfer = Math.min(slotA.count, maxStack - slotB.count);
        const newDstCount = slotB.count + transfer;
        const newSrcCount = slotA.count - transfer;
        this.player.inventory[indexB] = {
          ...slotB,
          count: newDstCount,
        };
        this.player.inventory[indexA] =
          newSrcCount > 0 ? { ...slotA, count: newSrcCount } : null;
        soundManager.playPickup();
        this.emitUiSnapshot();
        return;
      }
    }

    this.player.inventory[indexA] = slotB ? { ...slotB } : null;
    this.player.inventory[indexB] = slotA ? { ...slotA } : null;
    soundManager.playPickup();
    this.emitUiSnapshot();
  }

  public splitInventorySlot(index: number): void {
    const slot = this.player.inventory[index];
    if (!slot || slot.count <= 1) return;
    const emptyIdx = this.player.inventory.findIndex((s) => s === null);
    if (emptyIdx === -1) return;

    const half = Math.floor(slot.count / 2);
    slot.count -= half;
    this.player.inventory[emptyIdx] = {
      itemId: slot.itemId,
      count: half,
    };
    soundManager.playPickup();
    this.emitUiSnapshot();
  }

  public dropInventorySlot(index: number, dropAll = true): void {
    const slot = this.player.inventory[index];
    if (!slot) return;
    const amount = dropAll ? slot.count : 1;
    const dirVec = this.getDirectionOffset(this.player.direction);
    this.spawnDrop(
      slot.itemId,
      amount,
      this.player.x + dirVec.x * 26,
      this.player.y + dirVec.y * 26,
      1.4
    );
    this.consumeInventoryAt(index, amount);
    soundManager.playSwing();
    this.emitUiSnapshot();
  }

  public handleCanvasTap(_screenX: number, _screenY: number): void {
    // Player actions (Attack/Break, Interact, Mount, Place/Consume) must ONLY be triggered
    // by clicking their dedicated HUD buttons (or pressing action keys), never by clicking the empty canvas.
  }

  // === BUILD & SAFETY MODE CONTROLS ===

  public toggleInnocentFire(): void {
    this.innocentFireEnabled = !this.innocentFireEnabled;
    soundManager.playPickup();
    this.addFloatingText(
      this.innocentFireEnabled
        ? '⚔️ Fogo Inocente ATIVO (NPCs desprotegidos!)'
        : '🛡️ Fogo Inocente OFF (Aliados protegidos)',
      this.player.x,
      this.player.y - 24,
      this.innocentFireEnabled ? '#f43f5e' : '#4ade80'
    );
    this.emitUiSnapshot();
  }

  public toggleBuildDemolishMode(): void {
    this.buildDemolishMode = !this.buildDemolishMode;
    soundManager.playPickup();
    this.emitUiSnapshot();
  }

  public cycleBuildOrientation(): void {
    const order: Array<'auto' | 'horizontal' | 'vertical'> = [
      'auto',
      'horizontal',
      'vertical',
    ];
    const idx = order.indexOf(this.buildOrientation);
    this.buildOrientation = order[(idx + 1) % order.length];
    soundManager.playPickup();
    this.emitUiSnapshot();
  }

  public toggleHitboxPreview(): void {
    this.showHitboxPreview = !this.showHitboxPreview;
    soundManager.playPickup();
    this.emitUiSnapshot();
  }

  public dismantleStructureAtTile(tx: number, ty: number): boolean {
    const { cx, cy } = this.world.tileToChunk(tx, ty);
    const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk || chunk.structures.length === 0) {
      this.addFloatingText(
        'Nenhuma estrutura neste bloco',
        tx * TILE_SIZE + 16,
        ty * TILE_SIZE,
        '#94a3b8'
      );
      return false;
    }

    // Prioritize dismantling wall-attached Torch first, then upper layer (WALL / FURNITURE) before SPIKE_TRAP and GROUND floor
    let targetIdx = -1;
    for (let i = chunk.structures.length - 1; i >= 0; i--) {
      const st = chunk.structures[i];
      if (st.tileX === tx && st.tileY === ty && st.type === PlaceableType.TORCH && st.attachedToWall) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx === -1) {
      for (let i = chunk.structures.length - 1; i >= 0; i--) {
        const st = chunk.structures[i];
        if (st.tileX === tx && st.tileY === ty) {
          const bp = CONSTRUCTION_BLUEPRINTS[st.type];
          if (bp?.layer !== 'GROUND' && st.type !== PlaceableType.SPIKE_TRAP) {
            targetIdx = i;
            break;
          }
          if (targetIdx === -1) targetIdx = i;
        }
      }
    }

    if (targetIdx === -1) {
      this.addFloatingText(
        'Nenhuma peça para recolher aqui',
        tx * TILE_SIZE + 16,
        ty * TILE_SIZE,
        '#94a3b8'
      );
      return false;
    }

    const st = chunk.structures[targetIdx];

    if (
      st.type === PlaceableType.CHEST &&
      st.villageId &&
      !this.hasVillageChestPermission(st.villageId)
    ) {
      soundManager.playHitWood();
      this.addFloatingText(
        '🔒 Cofre da Vila Trancado! Quebre-o atacando para os itens caírem no chão.',
        tx * TILE_SIZE + 16,
        ty * TILE_SIZE,
        '#f43f5e'
      );
      return false;
    }

    if (
      st.type === PlaceableType.MARKET_STALL &&
      st.ownerType === 'VILLAGER' &&
      this.isVillagerStallOwnerAlive(st)
    ) {
      soundManager.playHitWood();
      this.addFloatingText(
        '🔒 Tenda de Aldeão! Destrua-a atacando ou caso o aldeão morra.',
        tx * TILE_SIZE + 16,
        ty * TILE_SIZE,
        '#f43f5e'
      );
      return false;
    }

    const isWorldFixedLandmark = Boolean(
      (st.villageId || st.id.startsWith('world_struct_')) &&
        st.type === PlaceableType.HEALING_FOUNTAIN
    );
    if (isWorldFixedLandmark) {
      this.addFloatingText(
        'Estrutura ancestral fixa do mundo',
        tx * TILE_SIZE + 16,
        ty * TILE_SIZE,
        '#f43f5e'
      );
      return false;
    }

    const enclosedOwnerInfo = this.getEnclosedBuildingOwnerInfo(tx, ty);
    const isEnclosedVillagerOwned =
      enclosedOwnerInfo?.ownerType === 'VILLAGER';

    const isOwnedVillageBuilding =
      isEnclosedVillagerOwned ||
      (st.ownerType !== 'PLAYER' &&
        Boolean(st.villageId || st.ownerType === 'VILLAGER') &&
        (st.type === PlaceableType.VILLAGE_HOUSE ||
          st.type === PlaceableType.BED ||
          st.type === PlaceableType.VILLAGE_WELL ||
          st.type === PlaceableType.MARKET_STALL ||
          st.type === PlaceableType.CHEST));

    if (isOwnedVillageBuilding) {
      soundManager.playHitWood();
      this.addFloatingText(
        '🔒 Estrutura com dono na vila! Só pode ser quebrada atacando.',
        tx * TILE_SIZE + 16,
        ty * TILE_SIZE,
        '#f43f5e'
      );
      return false;
    }

    const dismantleKey = `dismantle_struct:${st.id}:${tx},${ty}`;
    if (!this.tryClaimWorldAction(dismantleKey)) {
      return false;
    }

    if (st.type === PlaceableType.CHEST) {
      this.dropChestContents(st, tx * TILE_SIZE + 16, ty * TILE_SIZE + 16, true);
    } else if (st.type === PlaceableType.MARKET_STALL) {
      this.dropMarketStallContents(
        st,
        tx * TILE_SIZE + 16,
        ty * TILE_SIZE + 16,
        true
      );
    } else if (
      st.type === PlaceableType.CAMPFIRE ||
      st.type === PlaceableType.FURNACE
    ) {
      this.dropThermalStationContents(
        st,
        tx * TILE_SIZE + 16,
        ty * TILE_SIZE + 16,
        true
      );
    }

    // If dismantling the primary rest point of an enclosed building, clear the enclosed structure's ownership!
    if (
      this.isRestPointStructure(st) &&
      (st.isPrimaryStructureOwner ||
        enclosedOwnerInfo?.primaryRestPoint?.id === st.id)
    ) {
      this.clearEnclosedBuildingOwnershipOnLoss(tx, ty, st.id);
    }

    chunk.structures.splice(targetIdx, 1);

    // If a wall was dismantled and still had an attached torch on the same tile, refund/drop that torch too
    if (WorldManager.isWallMountableStructure(st.type)) {
      for (let ti = chunk.structures.length - 1; ti >= 0; ti--) {
        const other = chunk.structures[ti];
        if (
          other.tileX === tx &&
          other.tileY === ty &&
          other.type === PlaceableType.TORCH
        ) {
          const torchAdded = this.addItemToInventory(other.itemId || 'torch', 1);
          if (!torchAdded) {
            this.spawnDrop(other.itemId || 'torch', 1, tx * TILE_SIZE + 16, ty * TILE_SIZE + 16);
          }
          chunk.structures.splice(ti, 1);
        }
      }
    }

    const added = this.addItemToInventory(st.itemId, 1);
    if (!added) {
      this.spawnDrop(st.itemId, 1, tx * TILE_SIZE + 16, ty * TILE_SIZE + 16);
    }
    soundManager.playHitWood();
    this.renderer.spawnBurst(tx * TILE_SIZE + 16, ty * TILE_SIZE + 16, 'BUILD', 10);
    this.renderer.spawnRipple(tx * TILE_SIZE + 16, ty * TILE_SIZE + 16, '#fde047', 20, 0.35);
    const itemName = ITEMS[st.itemId]?.name || st.itemId;
    this.addFloatingText(
      `Recolhido: +1 ${itemName}`,
      tx * TILE_SIZE + 16,
      ty * TILE_SIZE - 8,
      '#fde047'
    );
    this.syncChunkAtTile(tx, ty);
    this.emitUiSnapshot();
    return true;
  }

  // === INTERACTIVE CHEST STORAGE API ===

  public ensureChestStorageInitialized(chest: PlacedStructure): (InventorySlot | null)[] {
    if (!Array.isArray(chest.storageSlots) || chest.storageSlots.length < CHEST_STORAGE_SIZE) {
      const slots: (InventorySlot | null)[] = new Array(CHEST_STORAGE_SIZE).fill(null);
      if (Array.isArray(chest.storageSlots)) {
        for (let i = 0; i < Math.min(chest.storageSlots.length, CHEST_STORAGE_SIZE); i++) {
          slots[i] = chest.storageSlots[i] || null;
        }
      } else if (Array.isArray(chest.lootItems) && chest.lootItems.length > 0) {
        for (let i = 0; i < Math.min(chest.lootItems.length, CHEST_STORAGE_SIZE); i++) {
          slots[i] = {
            itemId: chest.lootItems[i].itemId,
            count: chest.lootItems[i].count,
          };
        }
      }
      chest.storageSlots = slots;
    }
    return chest.storageSlots;
  }

  private dropChestContents(
    chest: PlacedStructure,
    wx: number,
    wy: number,
    tryAddToPlayerFirst = false
  ): void {
    const slots = this.ensureChestStorageInitialized(chest);
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i];
      if (!sl || sl.count <= 0) continue;
      if (tryAddToPlayerFirst && this.addItemToInventory(sl.itemId, sl.count)) {
        slots[i] = null;
        continue;
      }
      this.spawnDrop(
        sl.itemId,
        sl.count,
        wx + (Math.random() - 0.5) * 20,
        wy + (Math.random() - 0.5) * 20
      );
      slots[i] = null;
    }
    chest.lootItems = [];
  }

  public getChestById(chestId: string): PlacedStructure | null {
    for (const chunk of Object.values(this.world.chunks)) {
      if (!chunk || !Array.isArray(chunk.structures)) continue;
      for (const st of chunk.structures) {
        if (st.id === chestId && st.type === PlaceableType.CHEST) {
          this.ensureChestStorageInitialized(st);
          return st;
        }
      }
    }
    return null;
  }

  public getNearbyChests(): PlacedStructure[] {
    const result: PlacedStructure[] = [];
    const pTile = this.world.worldToTile(this.player.x, this.player.y);
    const pChunk = this.world.tileToChunk(pTile.tx, pTile.ty);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = WorldManager.chunkKey(pChunk.cx + dx, pChunk.cy + dy);
        const chunk = this.world.chunks[key];
        if (!chunk) continue;
        for (const st of chunk.structures) {
          if (st.type === PlaceableType.CHEST) {
            const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
            const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
            if (Math.hypot(sx - this.player.x, sy - this.player.y) <= TILE_SIZE * 3.8) {
              this.ensureChestStorageInitialized(st);
              result.push(st);
            }
          }
        }
      }
    }
    result.sort((a, b) => {
      const da = Math.hypot(
        a.tileX * TILE_SIZE + 16 - this.player.x,
        a.tileY * TILE_SIZE + 16 - this.player.y
      );
      const db = Math.hypot(
        b.tileX * TILE_SIZE + 16 - this.player.x,
        b.tileY * TILE_SIZE + 16 - this.player.y
      );
      return da - db;
    });
    return result;
  }

  public closeChest(chestId: string): void {
    const chest = this.getChestById(chestId);
    if (chest) {
      chest.isOpen = false;
      this.syncChunkAtTile(chest.tileX, chest.tileY);
      this.emitUiSnapshot();
    }
  }

  public renameChest(chestId: string, newName: string): void {
    const chest = this.getChestById(chestId);
    if (!chest) return;
    const clean = newName.trim().slice(0, 28);
    chest.customName = clean || undefined;
    soundManager.playPickup();
    this.syncChunkAtTile(chest.tileX, chest.tileY);
    this.emitUiSnapshot();
  }

  private addItemToChestStorage(
    slots: (InventorySlot | null)[],
    itemId: string,
    count: number,
    preferredSlotIdx?: number
  ): number {
    const def = ITEMS[itemId];
    if (!def || count <= 0) return 0;
    let remaining = count;

    // 1. If a specific target slot was chosen, try placing/stacking there first
    if (
      typeof preferredSlotIdx === 'number' &&
      preferredSlotIdx >= 0 &&
      preferredSlotIdx < slots.length
    ) {
      const target = slots[preferredSlotIdx];
      if (!target) {
        const take = Math.min(def.maxStack, remaining);
        slots[preferredSlotIdx] = { itemId, count: take };
        remaining -= take;
      } else if (target.itemId === itemId && target.count < def.maxStack) {
        const take = Math.min(def.maxStack - target.count, remaining);
        target.count += take;
        remaining -= take;
      }
      if (remaining <= 0) return count;
    }

    // 2. Stack onto matching existing slots in the chest
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i];
      if (sl && sl.itemId === itemId && sl.count < def.maxStack) {
        const take = Math.min(def.maxStack - sl.count, remaining);
        sl.count += take;
        remaining -= take;
        if (remaining <= 0) return count;
      }
    }

    // 3. Fill empty slots in the chest
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] === null) {
        const take = Math.min(def.maxStack, remaining);
        slots[i] = { itemId, count: take };
        remaining -= take;
        if (remaining <= 0) return count;
      }
    }

    return count - remaining;
  }

  public transferPlayerToChest(
    chestId: string,
    playerSlotIdx: number,
    count?: number,
    targetChestSlotIdx?: number
  ): boolean {
    const chest = this.getChestById(chestId);
    if (!chest) return false;
    const pSlot = this.player.inventory[playerSlotIdx];
    if (!pSlot || pSlot.count <= 0) return false;

    const slots = this.ensureChestStorageInitialized(chest);
    const amountToMove = Math.max(
      1,
      Math.min(pSlot.count, typeof count === 'number' ? count : pSlot.count)
    );

    const moved = this.addItemToChestStorage(
      slots,
      pSlot.itemId,
      amountToMove,
      targetChestSlotIdx
    );
    if (moved <= 0) {
      this.addFloatingText('Baú cheio!', this.player.x, this.player.y - 20, '#f43f5e');
      return false;
    }

    this.consumeInventoryAt(playerSlotIdx, moved);
    soundManager.playPickup();
    this.syncChunkAtTile(chest.tileX, chest.tileY);
    this.emitUiSnapshot();
    return true;
  }

  public transferChestToPlayer(
    chestId: string,
    chestSlotIdx: number,
    count?: number,
    targetPlayerSlotIdx?: number
  ): boolean {
    const chest = this.getChestById(chestId);
    if (!chest) return false;
    const slots = this.ensureChestStorageInitialized(chest);
    const cSlot = slots[chestSlotIdx];
    if (!cSlot || cSlot.count <= 0) return false;

    const def = ITEMS[cSlot.itemId];
    if (!def) return false;

    const amountToMove = Math.max(
      1,
      Math.min(cSlot.count, typeof count === 'number' ? count : cSlot.count)
    );

    if (!this.canFitItemInInventory(cSlot.itemId, 1)) {
      this.addFloatingText(
        'Mochila cheia!',
        this.player.x,
        this.player.y - 20,
        '#f43f5e'
      );
      return false;
    }

    // In Guest multiplayer mode, route chest withdrawal through Host atomic lock to prevent 2 players taking the same item
    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
      const withdrawKey = `chest:${chestId}:${chestSlotIdx}`;
      if (this.pendingContainerWithdraws.has(withdrawKey)) return false;
      this.pendingContainerWithdraws.add(withdrawKey);
      this.multiplayer.sendWorldInteractRequest({
        action: 'container_withdraw',
        containerKind: 'chest',
        structureId: chestId,
        slotIndex: chestSlotIdx,
        count: amountToMove,
        targetPlayerSlotIdx,
      });
      return true;
    }

    if (cSlot.itemId === 'gold_coin') {
      this.addItemToInventory('gold_coin', amountToMove);
      cSlot.count -= amountToMove;
      if (cSlot.count <= 0) {
        slots[chestSlotIdx] = null;
      }
      soundManager.playPickup();
      this.syncChunkAtTile(chest.tileX, chest.tileY);
      this.emitUiSnapshot();
      return true;
    }

    let remaining = amountToMove;

    // 1. If a specific player slot was targeted, try there first
    if (
      typeof targetPlayerSlotIdx === 'number' &&
      targetPlayerSlotIdx >= 0 &&
      targetPlayerSlotIdx < this.player.inventory.length
    ) {
      const pTarget = this.player.inventory[targetPlayerSlotIdx];
      if (!pTarget) {
        const take = Math.min(def.maxStack, remaining);
        this.player.inventory[targetPlayerSlotIdx] = {
          itemId: cSlot.itemId,
          count: take,
        };
        remaining -= take;
      } else if (pTarget.itemId === cSlot.itemId && pTarget.count < def.maxStack) {
        const take = Math.min(def.maxStack - pTarget.count, remaining);
        pTarget.count += take;
        remaining -= take;
      }
    }

    // 2. Stack onto existing player slots
    for (let i = 0; i < this.player.inventory.length && remaining > 0; i++) {
      const pSlot = this.player.inventory[i];
      if (pSlot && pSlot.itemId === cSlot.itemId && pSlot.count < def.maxStack) {
        const take = Math.min(def.maxStack - pSlot.count, remaining);
        pSlot.count += take;
        remaining -= take;
      }
    }

    // 3. Fill empty player slots
    for (let i = 0; i < this.player.inventory.length && remaining > 0; i++) {
      if (this.player.inventory[i] === null) {
        const take = Math.min(def.maxStack, remaining);
        this.player.inventory[i] = { itemId: cSlot.itemId, count: take };
        remaining -= take;
      }
    }

    const moved = amountToMove - remaining;
    if (moved <= 0) {
      this.addFloatingText(
        'Mochila cheia!',
        this.player.x,
        this.player.y - 20,
        '#f43f5e'
      );
      return false;
    }

    cSlot.count -= moved;
    if (cSlot.count <= 0) {
      slots[chestSlotIdx] = null;
    }
    soundManager.playPickup();
    this.syncChunkAtTile(chest.tileX, chest.tileY);
    this.emitUiSnapshot();
    return true;
  }

  public swapChestSlots(chestId: string, indexA: number, indexB: number): void {
    const chest = this.getChestById(chestId);
    if (!chest) return;
    const slots = this.ensureChestStorageInitialized(chest);
    if (
      indexA < 0 ||
      indexA >= slots.length ||
      indexB < 0 ||
      indexB >= slots.length ||
      indexA === indexB
    ) {
      return;
    }

    const slotA = slots[indexA];
    const slotB = slots[indexB];

    if (slotA && slotB && slotA.itemId === slotB.itemId) {
      const maxStack = ITEMS[slotB.itemId]?.maxStack || 99;
      if (maxStack > 1 && slotB.count < maxStack) {
        const transfer = Math.min(slotA.count, maxStack - slotB.count);
        const newDstCount = slotB.count + transfer;
        const newSrcCount = slotA.count - transfer;
        slots[indexB] = { ...slotB, count: newDstCount };
        slots[indexA] =
          newSrcCount > 0 ? { ...slotA, count: newSrcCount } : null;
        soundManager.playPickup();
        this.syncChunkAtTile(chest.tileX, chest.tileY);
        this.emitUiSnapshot();
        return;
      }
    }

    slots[indexA] = slotB ? { ...slotB } : null;
    slots[indexB] = slotA ? { ...slotA } : null;
    soundManager.playPickup();
    this.syncChunkAtTile(chest.tileX, chest.tileY);
    this.emitUiSnapshot();
  }

  /**
   * Minecraft-style 2-click item move/stack/swap across Chest slots and Player Inventory slots:
   * - Click 1 selects the item slot (`source`).
   * - Click 2 clicks the destination slot (`dest`).
   * - If `dest` is empty, moves the item there.
   * - If `dest` has the same item and is not full, stacks them up to `maxStack`.
   * - Otherwise swaps their positions directly.
   */
  public moveOrSwapChestAndPlayerSlot(
    chestId: string,
    source: { container: 'chest' | 'player'; index: number },
    dest: { container: 'chest' | 'player'; index: number }
  ): boolean {
    if (
      source.container === dest.container &&
      source.index === dest.index
    ) {
      return false;
    }

    const chest = this.getChestById(chestId);
    if (!chest) return false;
    const chestSlots = this.ensureChestStorageInitialized(chest);

    const getSlot = (
      loc: { container: 'chest' | 'player'; index: number }
    ): InventorySlot | null => {
      if (loc.container === 'chest') {
        if (loc.index < 0 || loc.index >= chestSlots.length) return null;
        return chestSlots[loc.index];
      }
      if (loc.index < 0 || loc.index >= this.player.inventory.length) {
        return null;
      }
      return this.player.inventory[loc.index];
    };

    const setSlot = (
      loc: { container: 'chest' | 'player'; index: number },
      val: InventorySlot | null
    ): void => {
      if (loc.container === 'chest') {
        if (loc.index >= 0 && loc.index < chestSlots.length) {
          chestSlots[loc.index] = val ? { ...val } : null;
        }
      } else {
        if (loc.index >= 0 && loc.index < this.player.inventory.length) {
          this.player.inventory[loc.index] = val ? { ...val } : null;
        }
      }
    };

    const srcSlot = getSlot(source);
    if (!srcSlot || srcSlot.count <= 0) return false;
    const dstSlot = getSlot(dest);

    // Special case: moving gold_coin from a treasure chest into a player slot adds to gold purse
    if (
      source.container === 'chest' &&
      dest.container === 'player' &&
      srcSlot.itemId === 'gold_coin'
    ) {
      this.addItemToInventory('gold_coin', srcSlot.count);
      setSlot(source, dstSlot);
      setSlot(dest, null);
      soundManager.playPickup();
      this.syncChunkAtTile(chest.tileX, chest.tileY);
      this.emitUiSnapshot();
      return true;
    }

    // Stack identical items if destination stack has room
    if (dstSlot && dstSlot.itemId === srcSlot.itemId) {
      const maxStack = ITEMS[dstSlot.itemId]?.maxStack || 99;
      if (maxStack > 1 && dstSlot.count < maxStack) {
        const transfer = Math.min(srcSlot.count, maxStack - dstSlot.count);
        const newDstCount = dstSlot.count + transfer;
        const newSrcCount = srcSlot.count - transfer;
        setSlot(dest, { ...dstSlot, count: newDstCount });
        setSlot(
          source,
          newSrcCount > 0 ? { ...srcSlot, count: newSrcCount } : null
        );
        soundManager.playPickup();
        if (source.container === 'chest' || dest.container === 'chest') {
          this.syncChunkAtTile(chest.tileX, chest.tileY);
        }
        this.emitUiSnapshot();
        return true;
      }
    }

    setSlot(source, dstSlot);
    setSlot(dest, srcSlot);

    soundManager.playPickup();
    if (source.container === 'chest' || dest.container === 'chest') {
      this.syncChunkAtTile(chest.tileX, chest.tileY);
    }
    this.emitUiSnapshot();
    return true;
  }

  /**
   * "Empilhar Iguais": Automatically transfers items from player inventory that match item types already inside the chest.
   */
  public quickStackToChest(chestId: string): number {
    const chest = this.getChestById(chestId);
    if (!chest) return 0;
    const slots = this.ensureChestStorageInitialized(chest);

    const existingTypes = new Set<string>();
    for (const sl of slots) {
      if (sl && sl.count > 0) {
        existingTypes.add(sl.itemId);
      }
    }
    if (existingTypes.size === 0) return 0;

    let totalMoved = 0;
    for (let i = 0; i < this.player.inventory.length; i++) {
      const pSlot = this.player.inventory[i];
      if (!pSlot || !existingTypes.has(pSlot.itemId)) continue;
      // Don't strip single tools/weapons from hotbar unless stackable resource/placeable
      const def = ITEMS[pSlot.itemId];
      if (i < HOTBAR_SIZE && def && def.maxStack === 1) continue;

      const moved = this.addItemToChestStorage(slots, pSlot.itemId, pSlot.count);
      if (moved > 0) {
        this.consumeInventoryAt(i, moved);
        totalMoved += moved;
      }
    }

    if (totalMoved > 0) {
      soundManager.playCraft();
      this.addFloatingText(
        `Empilhado no Baú (${totalMoved} itens)`,
        this.player.x,
        this.player.y - 22,
        '#4ade80'
      );
      this.syncChunkAtTile(chest.tileX, chest.tileY);
      this.emitUiSnapshot();
    }
    return totalMoved;
  }

  /**
   * "Guardar Tudo": Deposits all items from the player's backpack (indices 8..31) and non-tool/weapon items from hotbar into the chest.
   */
  public depositBackpackToChest(chestId: string): number {
    const chest = this.getChestById(chestId);
    if (!chest) return 0;
    const slots = this.ensureChestStorageInitialized(chest);

    let totalMoved = 0;
    // 1. Deposit all backpack slots (8..31)
    for (let i = HOTBAR_SIZE; i < this.player.inventory.length; i++) {
      const pSlot = this.player.inventory[i];
      if (!pSlot || pSlot.count <= 0) continue;
      const moved = this.addItemToChestStorage(slots, pSlot.itemId, pSlot.count);
      if (moved > 0) {
        this.consumeInventoryAt(i, moved);
        totalMoved += moved;
      }
    }

    // 2. Also deposit non-tool/non-weapon items from the hotbar (0..7) so "Guardar Tudo" works even if items are in the hotbar
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const pSlot = this.player.inventory[i];
      if (!pSlot || pSlot.count <= 0) continue;
      const def = ITEMS[pSlot.itemId];
      if (
        def &&
        (def.category === ItemCategory.TOOL ||
          def.category === ItemCategory.WEAPON)
      ) {
        continue;
      }
      const moved = this.addItemToChestStorage(slots, pSlot.itemId, pSlot.count);
      if (moved > 0) {
        this.consumeInventoryAt(i, moved);
        totalMoved += moved;
      }
    }

    if (totalMoved > 0) {
      soundManager.playCraft();
      this.addFloatingText(
        `Guardado no Baú (${totalMoved} itens)`,
        this.player.x,
        this.player.y - 22,
        '#38bdf8'
      );
      this.syncChunkAtTile(chest.tileX, chest.tileY);
      this.emitUiSnapshot();
    }
    return totalMoved;
  }

  /**
   * "Retirar Tudo": Withdraws all items from the chest into the player's inventory.
   */
  public takeAllFromChest(chestId: string): number {
    const chest = this.getChestById(chestId);
    if (!chest) return 0;
    const slots = this.ensureChestStorageInitialized(chest);

    let totalTaken = 0;
    for (let i = 0; i < slots.length; i++) {
      const cSlot = slots[i];
      if (!cSlot || cSlot.count <= 0) continue;
      const before = cSlot.count;
      this.transferChestToPlayer(chestId, i, before);
      const after = slots[i]?.count ?? 0;
      totalTaken += before - after;
    }

    if (totalTaken > 0) {
      soundManager.playCraft();
      this.addFloatingText(
        `Retirado do Baú (${totalTaken} itens)`,
        this.player.x,
        this.player.y - 22,
        '#fde047'
      );
      this.syncChunkAtTile(chest.tileX, chest.tileY);
      this.emitUiSnapshot();
    }
    return totalTaken;
  }

  /**
   * "Organizar Baú": Merges partial stacks and sorts items by Category, Tier, and Name.
   */
  public sortChestStorage(chestId: string): void {
    const chest = this.getChestById(chestId);
    if (!chest) return;
    const slots = this.ensureChestStorageInitialized(chest);

    const totals = new Map<string, number>();
    for (const sl of slots) {
      if (sl && sl.count > 0) {
        totals.set(sl.itemId, (totals.get(sl.itemId) || 0) + sl.count);
      }
    }

    const catOrder: Record<ItemCategory, number> = {
      [ItemCategory.WEAPON]: 1,
      [ItemCategory.TOOL]: 2,
      [ItemCategory.ARMOR]: 3,
      [ItemCategory.CONSUMABLE]: 4,
      [ItemCategory.PLACEABLE]: 5,
      [ItemCategory.RESOURCE]: 6,
    };

    const sortedIds = Array.from(totals.keys()).sort((a, b) => {
      const da = ITEMS[a];
      const db = ITEMS[b];
      if (!da || !db) return a.localeCompare(b);
      const ca = catOrder[da.category] ?? 99;
      const cb = catOrder[db.category] ?? 99;
      if (ca !== cb) return ca - cb;
      return da.name.localeCompare(db.name, 'pt-BR');
    });

    const newSlots: (InventorySlot | null)[] = new Array(CHEST_STORAGE_SIZE).fill(null);
    let writeIdx = 0;
    for (const itemId of sortedIds) {
      const def = ITEMS[itemId];
      const maxStack = def?.maxStack || 99;
      let rem = totals.get(itemId) || 0;
      while (rem > 0 && writeIdx < CHEST_STORAGE_SIZE) {
        const take = Math.min(maxStack, rem);
        newSlots[writeIdx++] = { itemId, count: take };
        rem -= take;
      }
    }

    chest.storageSlots = newSlots;
    soundManager.playPickup();
    this.syncChunkAtTile(chest.tileX, chest.tileY);
    this.emitUiSnapshot();
  }

  /**
   * "Recolher Baú": Transfers contents to player (or drops overflow) and picks up the Chest item into the inventory.
   */
  public pickupChestStructure(chestId: string): boolean {
    for (const chunk of Object.values(this.world.chunks)) {
      if (!chunk || !Array.isArray(chunk.structures)) continue;
      const idx = chunk.structures.findIndex(
        (s) => s.id === chestId && s.type === PlaceableType.CHEST
      );
      if (idx !== -1) {
        const st = chunk.structures[idx];
        return this.dismantleStructureAtTile(st.tileX, st.tileY);
      }
    }
    return false;
  }

  // === MARKET STALL OWNERSHIP, MERCHANDISE & NPC SHOPPING API ===

  public ensureMarketStallInitialized(
    stall: PlacedStructure
  ): (MarketStallSlot | null)[] {
    if (!stall.ownerType) {
      if (stall.villageId || stall.id.startsWith('world_struct_')) {
        stall.ownerType = 'VILLAGER';
        if (!stall.ownerName) stall.ownerName = 'Mercador da Vila';
      } else {
        stall.ownerType = 'PLAYER';
        stall.ownerId = 'player';
        if (!stall.ownerName) stall.ownerName = 'Você (Mercador)';
      }
    }
    if (stall.stallOpen === undefined) {
      stall.stallOpen = true;
    }
    if (stall.stallSalesCount === undefined) {
      stall.stallSalesCount = 0;
    }
    if (stall.stallTotalGoldEarned === undefined) {
      stall.stallTotalGoldEarned = 0;
    }
    if (stall.stallUnclaimedGold === undefined) {
      stall.stallUnclaimedGold = 0;
    }
    if (
      !Array.isArray(stall.stallSlots) ||
      stall.stallSlots.length < MARKET_STALL_SIZE
    ) {
      const next: (MarketStallSlot | null)[] = new Array(
        MARKET_STALL_SIZE
      ).fill(null);
      if (Array.isArray(stall.stallSlots)) {
        for (
          let i = 0;
          i < Math.min(stall.stallSlots.length, MARKET_STALL_SIZE);
          i++
        ) {
          const sl = stall.stallSlots[i];
          if (sl && sl.count > 0 && ITEMS[sl.itemId]) {
            next[i] = {
              itemId: sl.itemId,
              count: sl.count,
              unitPrice: Math.max(
                1,
                Math.round(sl.unitPrice || getItemBasePrice(sl.itemId))
              ),
              enabled: sl.enabled !== false,
            };
          }
        }
      }
      stall.stallSlots = next;
    }

    // When a villager owns the stall, always ensure their merchandise is stocked on display (and update sleeping state)
    if (stall.ownerType === 'VILLAGER') {
      const hasGoods = stall.stallSlots.some((s) => s !== null && s.count > 0);
      if (!hasGoods && this.isVillagerStallOwnerAlive(stall)) {
        this.populateVillagerStallMerchandise(stall);
      } else {
        stall.ownerSleeping = this.isVillagerStallOwnerSleeping(stall);
        stall.stallOpen = !stall.ownerSleeping;
      }
    } else {
      stall.ownerSleeping = false;
    }

    return stall.stallSlots;
  }

  private dropMarketStallContents(
    stall: PlacedStructure,
    wx: number,
    wy: number,
    tryAddToPlayerFirst = false
  ): void {
    const slots = this.ensureMarketStallInitialized(stall);
    // Only drop physical items if the stall belonged to a Player
    if (stall.ownerType === 'PLAYER') {
      for (let i = 0; i < slots.length; i++) {
        const sl = slots[i];
        if (!sl || sl.count <= 0) continue;
        if (tryAddToPlayerFirst && this.addItemToInventory(sl.itemId, sl.count)) {
          slots[i] = null;
          continue;
        }
        this.spawnDrop(
          sl.itemId,
          sl.count,
          wx + (Math.random() - 0.5) * 20,
          wy + (Math.random() - 0.5) * 20
        );
        slots[i] = null;
      }
      const unclaimedGold = Math.max(0, Math.floor(stall.stallUnclaimedGold || 0));
      if (unclaimedGold > 0) {
        if (!tryAddToPlayerFirst || !this.addItemToInventory('gold_coin', unclaimedGold)) {
          this.spawnDrop('gold_coin', unclaimedGold, wx, wy);
        }
        stall.stallUnclaimedGold = 0;
      }
    } else {
      for (let i = 0; i < slots.length; i++) {
        slots[i] = null;
      }
    }
    stall.pendingCustomerOffer = null;
  }

  public getMarketStallById(stallId: string): PlacedStructure | null {
    for (const chunk of Object.values(this.world.chunks)) {
      if (!chunk || !Array.isArray(chunk.structures)) continue;
      for (const st of chunk.structures) {
        if (st.id === stallId && st.type === PlaceableType.MARKET_STALL) {
          this.ensureMarketStallInitialized(st);
          return st;
        }
      }
    }
    return null;
  }

  public getNearbyMarketStalls(): PlacedStructure[] {
    const result: PlacedStructure[] = [];
    const pTile = this.world.worldToTile(this.player.x, this.player.y);
    const pChunk = this.world.tileToChunk(pTile.tx, pTile.ty);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = WorldManager.chunkKey(pChunk.cx + dx, pChunk.cy + dy);
        const chunk = this.world.chunks[key];
        if (!chunk) continue;
        for (const st of chunk.structures) {
          if (st.type === PlaceableType.MARKET_STALL) {
            const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
            const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
            if (
              Math.hypot(sx - this.player.x, sy - this.player.y) <=
              TILE_SIZE * 4.2
            ) {
              this.ensureMarketStallInitialized(st);
              result.push(st);
            }
          }
        }
      }
    }
    result.sort((a, b) => {
      const da = Math.hypot(
        a.tileX * TILE_SIZE + 16 - this.player.x,
        a.tileY * TILE_SIZE + 16 - this.player.y
      );
      const db = Math.hypot(
        b.tileX * TILE_SIZE + 16 - this.player.x,
        b.tileY * TILE_SIZE + 16 - this.player.y
      );
      return da - db;
    });
    return result;
  }

  public renameMarketStall(stallId: string, newName: string): void {
    const stall = this.getMarketStallById(stallId);
    if (!stall) return;
    const clean = newName.trim().slice(0, 28);
    stall.customName = clean || undefined;
    soundManager.playPickup();
    this.syncChunkAtTile(stall.tileX, stall.tileY);
    this.emitUiSnapshot();
  }

  public toggleMarketStallOpen(stallId: string): void {
    const stall = this.getMarketStallById(stallId);
    if (!stall) return;
    stall.stallOpen = stall.stallOpen === false ? true : false;
    if (!stall.stallOpen) {
      stall.pendingCustomerOffer = null;
    }
    soundManager.playPickup();
    this.syncChunkAtTile(stall.tileX, stall.tileY);
    this.emitUiSnapshot();
  }

  public rotateMarketStall(stallId: string): void {
    const stall = this.getMarketStallById(stallId);
    if (!stall) return;
    stall.orientation =
      stall.orientation === 'vertical' ? 'horizontal' : 'vertical';
    soundManager.playPickup();
    this.syncChunkAtTile(stall.tileX, stall.tileY);
    this.emitUiSnapshot();
  }

  public setMarketStallOwner(
    stallId: string,
    ownerType: 'PLAYER' | 'VILLAGER',
    villagerId?: string
  ): { ok: boolean; message: string } {
    const stall = this.getMarketStallById(stallId);
    if (!stall) return { ok: false, message: 'Tenda não encontrada.' };

    if (ownerType === 'PLAYER') {
      if (
        stall.ownerType === 'VILLAGER' &&
        this.isVillagerStallOwnerAlive(stall)
      ) {
        soundManager.playHitWood();
        return {
          ok: false,
          message:
            'Você só é dono da tenda que colocar! Para tomar a tenda de um aldeão, o aldeão deve morrer ou você deve destruir a tenda.',
        };
      }

      stall.ownerType = 'PLAYER';
      stall.ownerId = 'player';
      stall.ownerName = 'Você (Mercador)';
      stall.villageId = undefined;
      stall.ownerSleeping = false;
      stall.stallSlots = new Array(MARKET_STALL_SIZE).fill(null);
      stall.pendingCustomerOffer = null;
      soundManager.playCraft();
      this.syncChunkAtTile(stall.tileX, stall.tileY);
      this.emitUiSnapshot();
      return {
        ok: true,
        message: 'Você assumiu a posse desta Tenda de Vendas como Mercador!',
      };
    }

    // Rule: To transfer ownership of a Player's Market Stall to a Villager, the stall MUST be completely empty!
    if (stall.ownerType === 'PLAYER') {
      const slots = this.ensureMarketStallInitialized(stall);
      const hasItemsOnCounter = slots.some((s) => s !== null && s.count > 0);
      const hasUnclaimedGold = (stall.stallUnclaimedGold || 0) > 0;
      if (hasItemsOnCounter || hasUnclaimedGold) {
        soundManager.playHitWood();
        return {
          ok: false,
          message:
            'A tenda precisa estar completamente vazia (sem itens no balcão e sem moedas na caixinha) para passar a posse a um aldeão!',
        };
      }
    }

    const npc = villagerId
      ? this.entities.creatures.find(
          (c) =>
            c.id === villagerId &&
            (c.kind === CreatureKind.VILLAGER ||
              c.kind === CreatureKind.WANDERER) &&
            c.hp > 0
        )
      : null;

    stall.ownerType = 'VILLAGER';
    stall.ownerId = npc ? npc.id : undefined;
    stall.ownerName = npc
      ? `${npc.name} (${npc.npcProfessionLabel || 'Mercador'})`
      : 'Mercador da Vila';
    if (npc?.villageId) {
      stall.villageId = npc.villageId;
    }
    stall.pendingCustomerOffer = null;
    this.populateVillagerStallMerchandise(stall);
    soundManager.playPickup();
    this.syncChunkAtTile(stall.tileX, stall.tileY);
    this.emitUiSnapshot();
    return {
      ok: true,
      message: `Posse transferida para ${stall.ownerName}! Mercadorias do aldeão em exposição.`,
    };
  }

  /**
   * Allows the player to purchase 1 unit of an item displayed on a Villager-owned Market Stall (`stall.ownerType === 'VILLAGER'`).
   * Since villager stalls always keep merchandise on display (except when sleeping), the stock replenishes automatically.
   */
  public buyFromVillagerStall(
    stallId: string,
    stallSlotIdx: number
  ): { ok: boolean; message: string } {
    const stall = this.getMarketStallById(stallId);
    if (!stall || stall.ownerType !== 'VILLAGER') {
      return { ok: false, message: 'Tenda de aldeão não encontrada.' };
    }
    if (this.isVillagerStallOwnerSleeping(stall)) {
      soundManager.playHitWood();
      return {
        ok: false,
        message: 'O aldeão proprietário está dormindo no momento!',
      };
    }

    const slots = this.ensureMarketStallInitialized(stall);
    const slot = slots[stallSlotIdx];
    if (!slot || slot.count <= 0) {
      return { ok: false, message: 'Item indisponível neste slot.' };
    }

    const price = Math.max(1, slot.unitPrice || getItemBasePrice(slot.itemId));
    const ownedCoins = this.getItemCount('gold_coin');
    if (ownedCoins < price) {
      soundManager.playHitWood();
      return {
        ok: false,
        message: `Você precisa de ${price} Moedas de Ouro (possui ${ownedCoins}).`,
      };
    }

    if (!this.canFitItemInInventory(slot.itemId, 1)) {
      soundManager.playHitWood();
      return { ok: false, message: 'Mochila cheia!' };
    }

    this.removeItemFromInventory('gold_coin', price);
    this.addItemToInventory(slot.itemId, 1);

    const ownerNpc = this.getVillagerStallOwnerEntity(stall);
    if (ownerNpc) {
      ownerNpc.affinity = Math.min(100, (ownerNpc.affinity ?? 55) + 4);
    }

    const itemName = ITEMS[slot.itemId]?.name || slot.itemId;
    soundManager.playCraft();
    this.gainXp(15);
    this.addFloatingText(
      `🛒 Comprou 1x ${itemName} (-${price}g)`,
      this.player.x,
      this.player.y - 22,
      '#4ade80'
    );
    this.syncChunkAtTile(stall.tileX, stall.tileY);
    this.emitUiSnapshot();
    return {
      ok: true,
      message: `Comprou 1x ${itemName} por ${price} Moedas!`,
    };
  }

  public transferPlayerToStall(
    stallId: string,
    playerSlotIdx: number,
    count?: number,
    customUnitPrice?: number,
    targetStallSlotIdx?: number
  ): boolean {
    const stall = this.getMarketStallById(stallId);
    if (!stall || stall.ownerType !== 'PLAYER') return false;
    const pSlot = this.player.inventory[playerSlotIdx];
    if (!pSlot || pSlot.count <= 0) return false;
    if (pSlot.itemId === 'gold_coin') {
      this.addFloatingText(
        'Moedas de Ouro são a moeda de troca!',
        this.player.x,
        this.player.y - 20,
        '#fbbf24'
      );
      return false;
    }

    const def = ITEMS[pSlot.itemId];
    if (!def) return false;

    const slots = this.ensureMarketStallInitialized(stall);
    const amountToMove = Math.max(
      1,
      Math.min(pSlot.count, typeof count === 'number' ? count : pSlot.count)
    );
    const defaultPrice =
      typeof customUnitPrice === 'number' && customUnitPrice >= 1
        ? Math.round(customUnitPrice)
        : getItemBasePrice(pSlot.itemId);

    let remaining = amountToMove;

    // 1. Try target stall slot first if specified
    if (
      typeof targetStallSlotIdx === 'number' &&
      targetStallSlotIdx >= 0 &&
      targetStallSlotIdx < slots.length
    ) {
      const target = slots[targetStallSlotIdx];
      if (!target) {
        const take = Math.min(def.maxStack, remaining);
        slots[targetStallSlotIdx] = {
          itemId: pSlot.itemId,
          count: take,
          unitPrice: defaultPrice,
          enabled: true,
        };
        remaining -= take;
      } else if (
        target.itemId === pSlot.itemId &&
        target.count < def.maxStack
      ) {
        const take = Math.min(def.maxStack - target.count, remaining);
        target.count += take;
        if (typeof customUnitPrice === 'number' && customUnitPrice >= 1) {
          target.unitPrice = Math.round(customUnitPrice);
        }
        remaining -= take;
      }
    }

    // 2. Stack onto matching existing slots in the stall
    for (let i = 0; i < slots.length && remaining > 0; i++) {
      const sl = slots[i];
      if (sl && sl.itemId === pSlot.itemId && sl.count < def.maxStack) {
        const take = Math.min(def.maxStack - sl.count, remaining);
        sl.count += take;
        remaining -= take;
      }
    }

    // 3. Fill empty slots in the stall
    for (let i = 0; i < slots.length && remaining > 0; i++) {
      if (slots[i] === null) {
        const take = Math.min(def.maxStack, remaining);
        slots[i] = {
          itemId: pSlot.itemId,
          count: take,
          unitPrice: defaultPrice,
          enabled: true,
        };
        remaining -= take;
      }
    }

    const moved = amountToMove - remaining;
    if (moved <= 0) {
      this.addFloatingText(
        'Balcão da Tenda cheio (8/8)!',
        this.player.x,
        this.player.y - 20,
        '#f43f5e'
      );
      return false;
    }

    this.consumeInventoryAt(playerSlotIdx, moved);
    soundManager.playPickup();
    this.syncChunkAtTile(stall.tileX, stall.tileY);
    this.emitUiSnapshot();
    return true;
  }

  public transferStallToPlayer(
    stallId: string,
    stallSlotIdx: number,
    count?: number
  ): boolean {
    const stall = this.getMarketStallById(stallId);
    if (!stall) return false;
    const slots = this.ensureMarketStallInitialized(stall);
    const sSlot = slots[stallSlotIdx];
    if (!sSlot || sSlot.count <= 0) return false;

    const amountToMove = Math.max(
      1,
      Math.min(sSlot.count, typeof count === 'number' ? count : sSlot.count)
    );

    if (!this.canFitItemInInventory(sSlot.itemId, amountToMove)) {
      this.addFloatingText(
        'Mochila cheia!',
        this.player.x,
        this.player.y - 20,
        '#f43f5e'
      );
      return false;
    }

    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
      const withdrawKey = `stall:${stallId}:${stallSlotIdx}`;
      if (this.pendingContainerWithdraws.has(withdrawKey)) return false;
      this.pendingContainerWithdraws.add(withdrawKey);
      this.multiplayer.sendWorldInteractRequest({
        action: 'container_withdraw',
        containerKind: 'stall',
        structureId: stallId,
        slotIndex: stallSlotIdx,
        count: amountToMove,
      });
      return true;
    }

    const added = this.addItemToInventory(sSlot.itemId, amountToMove);
    if (!added) {
      this.addFloatingText(
        'Mochila cheia!',
        this.player.x,
        this.player.y - 20,
        '#f43f5e'
      );
      return false;
    }

    sSlot.count -= amountToMove;
    if (sSlot.count <= 0) {
      slots[stallSlotIdx] = null;
      if (
        stall.pendingCustomerOffer &&
        stall.pendingCustomerOffer.slotIndex === stallSlotIdx
      ) {
        stall.pendingCustomerOffer = null;
      }
    } else if (
      stall.pendingCustomerOffer &&
      stall.pendingCustomerOffer.slotIndex === stallSlotIdx &&
      stall.pendingCustomerOffer.quantity > sSlot.count
    ) {
      stall.pendingCustomerOffer.quantity = sSlot.count;
      stall.pendingCustomerOffer.totalPrice =
        sSlot.count * stall.pendingCustomerOffer.unitPrice;
    }

    soundManager.playPickup();
    this.syncChunkAtTile(stall.tileX, stall.tileY);
    this.emitUiSnapshot();
    return true;
  }

  public updateStallSlotPrice(
    stallId: string,
    stallSlotIdx: number,
    newUnitPrice: number
  ): void {
    const stall = this.getMarketStallById(stallId);
    if (!stall) return;
    const slots = this.ensureMarketStallInitialized(stall);
    const sl = slots[stallSlotIdx];
    if (!sl) return;

    const clamped = Math.max(1, Math.round(newUnitPrice));
    sl.unitPrice = clamped;

    if (
      stall.pendingCustomerOffer &&
      stall.pendingCustomerOffer.slotIndex === stallSlotIdx
    ) {
      stall.pendingCustomerOffer.unitPrice = clamped;
      stall.pendingCustomerOffer.totalPrice =
        stall.pendingCustomerOffer.quantity * clamped;
    }
    soundManager.playPickup();
    this.syncChunkAtTile(stall.tileX, stall.tileY);
    this.emitUiSnapshot();
  }

  public setAllStallPricesToPreset(stallId: string, multiplier: number): void {
    const stall = this.getMarketStallById(stallId);
    if (!stall) return;
    const slots = this.ensureMarketStallInitialized(stall);
    for (const sl of slots) {
      if (!sl) continue;
      const base = getItemBasePrice(sl.itemId);
      sl.unitPrice = Math.max(1, Math.round(base * multiplier));
    }
    soundManager.playPickup();
    this.syncChunkAtTile(stall.tileX, stall.tileY);
    this.emitUiSnapshot();
  }

  public toggleStallSlotEnabled(stallId: string, stallSlotIdx: number): void {
    const stall = this.getMarketStallById(stallId);
    if (!stall) return;
    const slots = this.ensureMarketStallInitialized(stall);
    const sl = slots[stallSlotIdx];
    if (!sl) return;
    sl.enabled = !sl.enabled;
    if (
      !sl.enabled &&
      stall.pendingCustomerOffer &&
      stall.pendingCustomerOffer.slotIndex === stallSlotIdx
    ) {
      stall.pendingCustomerOffer = null;
    }
    soundManager.playPickup();
    this.syncChunkAtTile(stall.tileX, stall.tileY);
    this.emitUiSnapshot();
  }

  public acceptStallCustomerOffer(stallId: string): {
    ok: boolean;
    message: string;
  } {
    const stall = this.getMarketStallById(stallId);
    if (!stall || !stall.pendingCustomerOffer) {
      return { ok: false, message: 'Nenhuma proposta ativa no momento.' };
    }

    const offer = stall.pendingCustomerOffer;
    const slots = this.ensureMarketStallInitialized(stall);
    const slot = slots[offer.slotIndex];
    if (
      !slot ||
      slot.itemId !== offer.itemId ||
      slot.count < offer.quantity
    ) {
      stall.pendingCustomerOffer = null;
      this.emitUiSnapshot();
      return {
        ok: false,
        message: 'Estoque insuficiente no slot para concluir a venda.',
      };
    }

    const sx = stall.tileX * TILE_SIZE + TILE_SIZE / 2;
    const sy = stall.tileY * TILE_SIZE + TILE_SIZE / 2;

    // 1. Deduct sold items from stall slot
    slot.count -= offer.quantity;
    if (slot.count <= 0) {
      slots[offer.slotIndex] = null;
    }

    // 2. Deposit Gold Coins into the Player's Stall Coin Box (stallUnclaimedGold)
    const goldEarned = Math.max(1, offer.totalPrice);
    stall.stallSalesCount = (stall.stallSalesCount || 0) + 1;
    stall.stallTotalGoldEarned =
      (stall.stallTotalGoldEarned || 0) + goldEarned;
    stall.stallUnclaimedGold =
      (stall.stallUnclaimedGold || 0) + goldEarned;
    stall.pendingCustomerOffer = null;

    // 3. Mark Buyer NPC as having completed their 1 purchase for today (disabled until they sleep in their house!)
    const buyer = this.entities.creatures.find((c) => c.id === offer.buyerId);
    if (buyer) {
      buyer.hasBoughtToday = true;
      buyer.attractedStallId = undefined;
      buyer.stallInspectCooldown = 60;
      buyer.affinity = Math.min(100, (buyer.affinity ?? 55) + 6);
      this.renderer.spawnBurst(buyer.x, buyer.y - 6, 'GOLD', 14);
    }

    soundManager.playCraft();
    this.gainXp(30);
    this.renderer.spawnBurst(sx, sy - 6, 'GOLD', 18);
    this.renderer.spawnRipple(sx, sy, '#fde047', 30, 0.55);

    const itemName = ITEMS[offer.itemId]?.name || offer.itemId;
    this.addFloatingText(
      `💰 Vendido! +${goldEarned} Moedas na Caixinha (${offer.quantity}x ${itemName})`,
      sx,
      sy - 24,
      '#fde047'
    );
    this.syncChunkAtTile(stall.tileX, stall.tileY);
    this.emitUiSnapshot();
    return {
      ok: true,
      message: `Venda concluída! +${goldEarned} Moedas guardadas na caixinha da tenda.`,
    };
  }

  public claimMarketStallGold(stallId: string): {
    ok: boolean;
    amount: number;
    message: string;
  } {
    const stall = this.getMarketStallById(stallId);
    if (!stall || stall.ownerType !== 'PLAYER') {
      return { ok: false, amount: 0, message: 'Apenas o dono pode resgatar.' };
    }
    const unclaimed = Math.max(0, Math.floor(stall.stallUnclaimedGold || 0));
    if (unclaimed <= 0) {
      return { ok: false, amount: 0, message: 'Nenhuma moeda para resgatar.' };
    }

    stall.stallUnclaimedGold = 0;
    const added = this.addItemToInventory('gold_coin', unclaimed);
    if (!added) {
      this.spawnDrop('gold_coin', unclaimed, this.player.x, this.player.y);
    }

    const sx = stall.tileX * TILE_SIZE + TILE_SIZE / 2;
    const sy = stall.tileY * TILE_SIZE + TILE_SIZE / 2;
    soundManager.playCraft();
    this.renderer.spawnBurst(sx, sy - 6, 'GOLD', 16);
    this.addFloatingText(
      `💰 +${unclaimed} Moedas Resgatadas!`,
      this.player.x,
      this.player.y - 24,
      '#fde047'
    );
    this.syncChunkAtTile(stall.tileX, stall.tileY);
    this.emitUiSnapshot();
    return {
      ok: true,
      amount: unclaimed,
      message: `+${unclaimed} Moedas resgatadas!`,
    };
  }

  public declineStallCustomerOffer(stallId: string): {
    ok: boolean;
    message: string;
  } {
    const stall = this.getMarketStallById(stallId);
    if (!stall || !stall.pendingCustomerOffer) {
      return { ok: false, message: 'Nenhuma proposta ativa.' };
    }
    const offer = stall.pendingCustomerOffer;
    const buyer = this.entities.creatures.find((c) => c.id === offer.buyerId);
    if (buyer) {
      buyer.attractedStallId = undefined;
      buyer.stallInspectCooldown = 25;
      this.addFloatingText(
        `❌ Venda recusada para ${buyer.name}`,
        buyer.x,
        buyer.y - 20,
        '#f87171'
      );
    }
    stall.pendingCustomerOffer = null;
    soundManager.playHitWood();
    this.emitUiSnapshot();
    return {
      ok: true,
      message: `Você recusou a oferta de ${offer.buyerName}.`,
    };
  }

  public pickupMarketStallStructure(stallId: string): boolean {
    for (const chunk of Object.values(this.world.chunks)) {
      if (!chunk || !Array.isArray(chunk.structures)) continue;
      const idx = chunk.structures.findIndex(
        (s) => s.id === stallId && s.type === PlaceableType.MARKET_STALL
      );
      if (idx !== -1) {
        const st = chunk.structures[idx];
        return this.dismantleStructureAtTile(st.tileX, st.tileY);
      }
    }
    return false;
  }

  public openWorkbenchCrafting(): void {
    if (this.onStationInteract) {
      this.onStationInteract(PlaceableType.WORKBENCH);
    }
  }

  /**
   * Handles NPC (Villager / Wanderer) attraction and automatic purchase evaluation for Player-owned Market Stalls:
   * - An NPC who has already made a purchase today (`hasBoughtToday === true`) cannot buy again until they sleep in their house.
   * - Each NPC inspects a given Market Stall at most 3 times per day (`stallInspectionsToday[stall.id] <= 3`).
   * - When an NPC decides to buy an item, the purchase completes automatically without requiring player confirmation!
   */
  /**
   * Ensures open Player-owned Market Stalls with active merchandise receive steady customer visits
   * (either by attracting nearby Villagers/Wanderers within 650px or spawning a traveling customer if no eligible NPC is nearby).
   */
  private updatePlayerStallCustomerTraffic(dt: number): void {
    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') return;
    const isSunsetOrNight =
      this.metadata.timeOfDay >= 17.5 || this.metadata.timeOfDay < 5.5;
    if (isSunsetOrNight) return;

    this.stallCustomerSpawnTimer -= dt;
    if (this.stallCustomerSpawnTimer > 0) return;
    this.stallCustomerSpawnTimer = 4.0;

    const pTile = this.world.worldToTile(this.player.x, this.player.y);
    const pChunk = this.world.tileToChunk(pTile.tx, pTile.ty);

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const chunk =
          this.world.chunks[
            WorldManager.chunkKey(pChunk.cx + dx, pChunk.cy + dy)
          ];
        if (!chunk) continue;

        for (const st of chunk.structures) {
          if (st.type !== PlaceableType.MARKET_STALL) continue;
          this.ensureMarketStallInitialized(st);
          if (st.ownerType !== 'PLAYER' || st.stallOpen === false) continue;

          const enabledSlots = st.stallSlots!.filter(
            (s) => s !== null && s.enabled && s.count > 0 && ITEMS[s.itemId]
          );
          if (enabledSlots.length === 0) continue;

          const stallCenterX = st.tileX * TILE_SIZE + TILE_SIZE / 2;
          const stallCenterY = st.tileY * TILE_SIZE + TILE_SIZE / 2;

          // Check if there is already an NPC attracted to this stall
          const alreadyAttracted = this.entities.creatures.some(
            (c) =>
              (c.kind === CreatureKind.VILLAGER ||
                c.kind === CreatureKind.WANDERER) &&
              c.hp > 0 &&
              !c.isHostile &&
              !c.isInsideHouse &&
              !c.hasBoughtToday &&
              c.attractedStallId === st.id
          );
          if (alreadyAttracted) continue;

          // Find the closest eligible NPC within 650px who can visit this stall
          let bestCandidate: CreatureEntity | null = null;
          let bestDist = 650;
          for (const cr of this.entities.creatures) {
            if (
              (cr.kind === CreatureKind.VILLAGER ||
                cr.kind === CreatureKind.WANDERER) &&
              cr.hp > 0 &&
              !cr.isHostile &&
              !cr.isInsideHouse &&
              !cr.hasBoughtToday &&
              !cr.attractedStallId &&
              (cr.stallInspectCooldown ?? 0) <= 0
            ) {
              const inspections = cr.stallInspectionsToday?.[st.id] || 0;
              if (inspections >= 3) continue;
              const d = Math.hypot(cr.x - stallCenterX, cr.y - stallCenterY);
              if (d < bestDist) {
                bestDist = d;
                bestCandidate = cr;
              }
            }
          }

          if (bestCandidate) {
            bestCandidate.attractedStallId = st.id;
            bestCandidate.aiTimer = 1.1 + Math.random() * 0.7;
            const inspections =
              bestCandidate.stallInspectionsToday?.[st.id] || 0;
            this.addFloatingText(
              `👀 ${bestCandidate.name} foi olhar a Tenda (${inspections + 1}/3 hoje)`,
              bestCandidate.x,
              bestCandidate.y - 20,
              '#38bdf8'
            );
            continue;
          }

          // If the player built their stall away from any village (or all nearby NPCs already bought today),
          // spawn a traveling customer (WANDERER) near the stall so the player's shop always gets visitors!
          const activeWanderersNearStall = this.entities.creatures.filter(
            (c) =>
              c.kind === CreatureKind.WANDERER &&
              c.hp > 0 &&
              Math.hypot(c.x - stallCenterX, c.y - stallCenterY) < 480
          ).length;

          if (activeWanderersNearStall < 2) {
            const angle = Math.random() * Math.PI * 2;
            const spawnDist = 140 + Math.random() * 45;
            const rawX = stallCenterX + Math.cos(angle) * spawnDist;
            const rawY = stallCenterY + Math.sin(angle) * spawnDist;
            const clearPos = this.findClearSpotNear(rawX, rawY, 48);
            const spawnedCustomer = this.entities.trySpawnCreatureAt(
              this.world,
              CreatureKind.WANDERER,
              clearPos.x,
              clearPos.y
            );
            if (spawnedCustomer) {
              spawnedCustomer.attractedStallId = st.id;
              spawnedCustomer.aiTimer = 1.2 + Math.random() * 0.6;
              spawnedCustomer.stallInspectCooldown = 0;
              this.addFloatingText(
                `🧳 ${spawnedCustomer.name} avistou sua Tenda de Vendas!`,
                spawnedCustomer.x,
                spawnedCustomer.y - 20,
                '#38bdf8'
              );
              if (
                this.multiplayer.isOnline &&
                this.multiplayer.role === 'HOST'
              ) {
                this.multiplayer.sendCreaturesSync(this.entities.creatures);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Keeps NPC customers walking to and buying from Player Market Stalls in real time
   * even while the game is paused because the player has the Market Stall modal open.
   */
  private updatePausedMarketStallVisitors(dt: number): void {
    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') return;
    this.updatePlayerStallCustomerTraffic(dt);

    for (const cr of this.entities.creatures) {
      if (
        (cr.kind !== CreatureKind.VILLAGER &&
          cr.kind !== CreatureKind.WANDERER) ||
        cr.hp <= 0 ||
        cr.isHostile ||
        cr.isInsideHouse
      ) {
        continue;
      }

      if (cr.stallInspectCooldown && cr.stallInspectCooldown > 0) {
        cr.stallInspectCooldown = Math.max(0, cr.stallInspectCooldown - dt);
      }

      const shopping = this.updateNpcMarketStallShopping(cr, dt);
      if (shopping) {
        const speed = Math.hypot(cr.vx, cr.vy);
        if (speed > 1.2) {
          cr.direction = EntityManager.vectorToDirection(
            cr.vx,
            cr.vy,
            cr.direction
          );
          cr.animTimer += dt;
          if (cr.animTimer >= 0.18) {
            cr.animTimer = 0;
            cr.animFrame = (cr.animFrame + 1) % 4;
          }
          const nx = cr.x + cr.vx * dt;
          const ny = cr.y + cr.vy * dt;
          if (this.canEntityOccupy(nx, ny)) {
            cr.x = nx;
            cr.y = ny;
          } else {
            if (this.canEntityOccupy(nx, cr.y)) cr.x = nx;
            if (this.canEntityOccupy(cr.x, ny)) cr.y = ny;
          }
        } else {
          cr.animFrame = 0;
        }
      }
    }
  }

  /**
   * Handles NPC (Villager / Wanderer) attraction and automatic purchase evaluation for Player-owned Market Stalls:
   * - An NPC who has already made a purchase today (`hasBoughtToday === true`) cannot buy again until they sleep in their house.
   * - Each NPC inspects a given Market Stall at most 3 times per day (`stallInspectionsToday[stall.id] <= 3`).
   * - When an NPC decides to buy an item, the purchase completes automatically without requiring player confirmation!
   */
  private updateNpcMarketStallShopping(
    cr: CreatureEntity,
    dt: number
  ): boolean {
    if (cr.isHostile || cr.isInsideHouse || cr.hasBoughtToday) {
      cr.attractedStallId = undefined;
      return false;
    }

    const cTile = this.world.worldToTile(cr.x, cr.y);
    const cChunk = this.world.tileToChunk(cTile.tx, cTile.ty);

    // 1. If already attracted to a specific Player Market Stall, walk to it and evaluate the deals
    if (cr.attractedStallId) {
      const stall = this.getMarketStallById(cr.attractedStallId);
      const inspectionsForStall =
        stall && cr.stallInspectionsToday
          ? cr.stallInspectionsToday[stall.id] || 0
          : 0;
      const activeSlots =
        stall && Array.isArray(stall.stallSlots)
          ? stall.stallSlots
              .map((sl, idx) => ({ sl, idx }))
              .filter(
                (entry) =>
                  entry.sl !== null &&
                  entry.sl.enabled &&
                  entry.sl.count > 0 &&
                  ITEMS[entry.sl.itemId]
              )
          : [];

      if (
        !stall ||
        stall.ownerType !== 'PLAYER' ||
        stall.stallOpen === false ||
        inspectionsForStall >= 3 ||
        activeSlots.length === 0
      ) {
        cr.attractedStallId = undefined;
        cr.stallInspectCooldown = 6;
        return false;
      }

      const stallCenterX = stall.tileX * TILE_SIZE + TILE_SIZE / 2;
      const stallCenterY = stall.tileY * TILE_SIZE + TILE_SIZE / 2;
      const browseSpot = this.findClearSpotNear(
        stallCenterX,
        stallCenterY + 20,
        34
      );
      const distToCenter = Math.hypot(stallCenterX - cr.x, stallCenterY - cr.y);
      const distToSpot = Math.hypot(browseSpot.x - cr.x, browseSpot.y - cr.y);

      if (distToCenter > 46 && distToSpot > 26) {
        cr.aiState = 'wander';
        this.steerCreatureToward(
          cr,
          browseSpot.x,
          browseSpot.y,
          cr.moveSpeed * 1.05,
          dt,
          true
        );
        return true;
      }

      // Arrived at the stall counter! Pause briefly to inspect prices
      cr.vx = 0;
      cr.vy = 0;
      cr.aiState = 'idle';
      cr.direction = EntityManager.vectorToDirection(
        stallCenterX - cr.x,
        stallCenterY - cr.y,
        'up'
      );
      cr.aiTimer -= dt;
      if (cr.aiTimer > 0) {
        return true;
      }

      // Record this inspection (maximum 3 inspections per day per stall)
      if (!cr.stallInspectionsToday) {
        cr.stallInspectionsToday = {};
      }
      const newInspectionCount = (cr.stallInspectionsToday[stall.id] || 0) + 1;
      cr.stallInspectionsToday[stall.id] = newInspectionCount;

      // Evaluate all enabled merchandise slots on the stall
      const scoredCandidates = activeSlots.map(({ sl, idx }) => {
        const evalRes = evaluateStallPriceDeal(sl!.itemId, sl!.unitPrice);
        // Weight selection strongly toward better deals & bargains
        const selectionWeight = Math.max(0.05, evalRes.buyChance * 1.5 + 0.08);
        return { sl: sl!, idx, evalRes, selectionWeight };
      });

      const totalWeight = scoredCandidates.reduce(
        (sum, c) => sum + c.selectionWeight,
        0
      );
      let pickRoll = Math.random() * totalWeight;
      let chosen = scoredCandidates[0];
      for (const cand of scoredCandidates) {
        pickRoll -= cand.selectionWeight;
        if (pickRoll <= 0) {
          chosen = cand;
          break;
        }
      }

      const { sl, idx, evalRes } = chosen;
      const affinityBonus = ((cr.affinity ?? 55) - 50) * 0.003;
      const finalBuyChance =
        evalRes.buyChance <= 0
          ? 0
          : Math.min(0.98, Math.max(0.05, evalRes.buyChance + affinityBonus));

      if (Math.random() < finalBuyChance) {
        // NPC decides to buy! Execute the purchase automatically without player confirmation
        const maxPossibleQty = Math.min(sl.count, evalRes.maxBuyQty);
        const qty =
          maxPossibleQty > 1
            ? 1 + Math.floor(Math.random() * maxPossibleQty)
            : 1;
        const totalGold = Math.max(1, qty * sl.unitPrice);
        const itemName = ITEMS[sl.itemId]?.name || sl.itemId;

        const slots = this.ensureMarketStallInitialized(stall);
        sl.count -= qty;
        if (sl.count <= 0) {
          slots[idx] = null;
        }

        stall.stallSalesCount = (stall.stallSalesCount || 0) + 1;
        stall.stallTotalGoldEarned =
          (stall.stallTotalGoldEarned || 0) + totalGold;
        stall.stallUnclaimedGold =
          (stall.stallUnclaimedGold || 0) + totalGold;
        stall.pendingCustomerOffer = null;

        cr.hasBoughtToday = true;
        cr.attractedStallId = undefined;
        cr.stallInspectCooldown = 45;
        cr.affinity = Math.min(100, (cr.affinity ?? 55) + 6);

        soundManager.playCraft();
        this.gainXp(30);
        this.renderer.spawnBurst(cr.x, cr.y - 6, 'GOLD', 14);
        this.renderer.spawnBurst(stallCenterX, stallCenterY - 6, 'GOLD', 18);
        this.renderer.spawnRipple(
          stallCenterX,
          stallCenterY,
          '#fde047',
          30,
          0.55
        );

        this.addFloatingText(
          `💰 ${cr.name} comprou ${qty}x ${itemName} (+${totalGold} na Caixinha)!`,
          stallCenterX,
          stallCenterY - 28,
          '#fde047'
        );
        this.syncChunkAtTile(stall.tileX, stall.tileY);
        if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
          this.multiplayer.sendCreaturesSync(this.entities.creatures);
        }
        this.emitUiSnapshot();
        return false;
      } else {
        // NPC decided not to buy on this inspection
        cr.attractedStallId = undefined;
        cr.stallInspectCooldown = 10 + Math.random() * 6;
        const itemName = ITEMS[sl.itemId]?.name || sl.itemId;
        const msg =
          evalRes.priceRatio > 1.25
            ? `💸 ${cr.name}: "${itemName} (${sl.unitPrice}g) está caro..." (${newInspectionCount}/3 hoje)`
            : `🤔 ${cr.name} olhou ${itemName} (${newInspectionCount}/3 hoje)`;
        this.addFloatingText(msg, cr.x, cr.y - 22, '#cbd5e1');
        this.emitUiSnapshot();
        return false;
      }
    }

    // 2. Otherwise, when passing near an open Player Market Stall, attract the NPC (up to 3 inspections/day/stall)!
    if ((cr.stallInspectCooldown ?? 0) > 0) {
      return false;
    }

    if (Math.hypot(this.player.x - cr.x, this.player.y - cr.y) > 750) {
      cr.stallInspectCooldown = 3.5 + Math.random() * 2.0;
      return false;
    }

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const chunk =
          this.world.chunks[
            WorldManager.chunkKey(cChunk.cx + dx, cChunk.cy + dy)
          ];
        if (!chunk) continue;
        for (const st of chunk.structures) {
          if (st.type !== PlaceableType.MARKET_STALL) continue;
          this.ensureMarketStallInitialized(st);
          if (st.ownerType !== 'PLAYER' || st.stallOpen === false) {
            continue;
          }

          const inspectionsToday = cr.stallInspectionsToday?.[st.id] || 0;
          if (inspectionsToday >= 3) {
            continue;
          }

          const enabledSlots = st.stallSlots!.filter(
            (s) => s !== null && s.enabled && s.count > 0 && ITEMS[s.itemId]
          );
          if (enabledSlots.length === 0) continue;

          const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
          const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
          const dist = Math.hypot(sx - cr.x, sy - cr.y);

          if (dist <= 420) {
            let bestDealChance = 0.35;
            for (const sl of enabledSlots) {
              const ev = evaluateStallPriceDeal(sl!.itemId, sl!.unitPrice);
              if (ev.buyChance > bestDealChance) {
                bestDealChance = ev.buyChance;
              }
            }
            // Direct per-check probability (since this block is gated by stallInspectCooldown)
            const attractChance = Math.min(0.96, 0.55 + bestDealChance * 0.42);
            if (Math.random() < attractChance) {
              cr.attractedStallId = st.id;
              cr.aiTimer = 1.2 + Math.random() * 0.8;
              this.addFloatingText(
                `👀 ${cr.name} foi olhar a Tenda (${inspectionsToday + 1}/3 hoje)`,
                cr.x,
                cr.y - 20,
                '#38bdf8'
              );
              return true;
            } else {
              cr.stallInspectCooldown = 2.5 + Math.random() * 2.0;
              return false;
            }
          }
        }
      }
    }

    // Throttle next scan when no open player stall is found nearby so NPCs never scan 25 chunks every frame!
    cr.stallInspectCooldown = 3.0 + Math.random() * 2.0;
    return false;
  }

  // === CRAFTING & INVENTORY ===

  public getItemCount(itemId: string): number {
    if (itemId === 'gold_coin') {
      return Math.max(0, Math.floor(this.player.goldCoins || 0));
    }
    let total = 0;
    for (const slot of this.player.inventory) {
      if (slot && slot.itemId === itemId) {
        total += slot.count;
      }
    }
    return total;
  }

  public getMaxCraftableCount(recipe: CraftingRecipe): number {
    let maxTimes = 99;
    for (const ing of recipe.ingredients) {
      const have = this.getItemCount(ing.itemId);
      const possible = Math.floor(have / ing.count);
      if (possible < maxTimes) maxTimes = possible;
    }
    return Math.max(0, maxTimes);
  }

  public canCraftRecipe(
    recipe: CraftingRecipe,
    activeStation: PlaceableType | null
  ): boolean {
    if (recipe.requiredStation !== activeStation) {
      return false;
    }
    return this.getMaxCraftableCount(recipe) >= 1;
  }

  public craftRecipe(
    recipeId: string,
    activeStation: PlaceableType | null,
    times = 1
  ): boolean {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return false;
    if (!this.canCraftRecipe(recipe, activeStation)) return false;

    // If this recipe belongs to a Thermal Station (CAMPFIRE or FURNACE) with preparation time, queue it in the station!
    if (
      (activeStation === PlaceableType.CAMPFIRE ||
        activeStation === PlaceableType.FURNACE) &&
      (recipe.craftTimeSec || 0) > 0
    ) {
      return this.queueThermalStationRecipe(activeStation, recipeId, times);
    }

    const maxPossible = this.getMaxCraftableCount(recipe);
    const actualTimes = Math.min(times, maxPossible);
    if (actualTimes <= 0) return false;

    for (const ing of recipe.ingredients) {
      this.removeItemFromInventory(ing.itemId, ing.count * actualTimes);
    }

    const totalOut = recipe.resultCount * actualTimes;
    const added = this.addItemToInventory(recipe.resultItemId, totalOut);
    if (!added) {
      this.spawnDrop(
        recipe.resultItemId,
        totalOut,
        this.player.x,
        this.player.y + 12
      );
    }

    soundManager.playCraft();
    this.gainXp(20 * actualTimes);
    const outDef = ITEMS[recipe.resultItemId];
    this.addFloatingText(
      `+${totalOut}x ${outDef?.name || recipe.resultItemId}`,
      this.player.x,
      this.player.y - 20,
      '#4ade80'
    );
    this.emitUiSnapshot();
    return true;
  }

  // === THERMAL STATIONS (CAMPFIRE & FURNACE — FUEL + TIMED PREPARATION) ===

  private ensureThermalStationInitialized(st: PlacedStructure): PlacedStructure {
    if (st.fuelItemId === undefined) st.fuelItemId = null;
    if (st.fuelCount === undefined) st.fuelCount = 0;
    if (st.fuelBurnRemaining === undefined) st.fuelBurnRemaining = 0;
    if (st.fuelBurnMax === undefined) st.fuelBurnMax = 12;
    if (st.cookingRecipeId === undefined) st.cookingRecipeId = null;
    if (st.cookingInputCount === undefined) st.cookingInputCount = 0;
    if (st.cookingProgress === undefined) st.cookingProgress = 0;
    if (st.cookingDuration === undefined) st.cookingDuration = 6;
    if (st.outputItemId === undefined) st.outputItemId = null;
    if (st.outputCount === undefined) st.outputCount = 0;
    return st;
  }

  public getActiveThermalStation(
    stationType: PlaceableType.CAMPFIRE | PlaceableType.FURNACE
  ): PlacedStructure {
    // 1. Check explicitly interacted structure ID first
    if (this.activeStationStructureId) {
      for (const chunk of Object.values(this.world.chunks)) {
        if (!chunk || !Array.isArray(chunk.structures)) continue;
        const found = chunk.structures.find(
          (s) => s.id === this.activeStationStructureId && s.type === stationType
        );
        if (found) {
          return this.ensureThermalStationInitialized(found);
        }
      }
    }

    // 2. Otherwise find the nearest placed structure of this stationType within reach
    const pTile = this.world.worldToTile(this.player.x, this.player.y);
    const pChunk = this.world.tileToChunk(pTile.tx, pTile.ty);
    let best: PlacedStructure | null = null;
    let bestDist = Infinity;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk =
          this.world.chunks[
            WorldManager.chunkKey(pChunk.cx + dx, pChunk.cy + dy)
          ];
        if (!chunk) continue;
        for (const st of chunk.structures) {
          if (st.type === stationType) {
            const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
            const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
            const d = Math.hypot(sx - this.player.x, sy - this.player.y);
            if (d < bestDist) {
              bestDist = d;
              best = st;
            }
          }
        }
      }
    }

    if (best) {
      this.activeStationStructureId = best.id;
      return this.ensureThermalStationInitialized(best);
    }

    // 3. Fallback in-memory station state if none found in loaded chunks
    if (!this.fallbackThermalStations[stationType]) {
      this.fallbackThermalStations[stationType] = {
        id: `fallback_${stationType}`,
        type: stationType,
        itemId: stationType === PlaceableType.CAMPFIRE ? 'campfire' : 'furnace',
        tileX: pTile.tx,
        tileY: pTile.ty,
        hp: 100,
        maxHp: 100,
        solid: false,
        hitFlashTimer: 0,
      };
    }
    return this.ensureThermalStationInitialized(
      this.fallbackThermalStations[stationType]
    );
  }

  public addFuelToThermalStation(
    stationType: PlaceableType.CAMPFIRE | PlaceableType.FURNACE,
    fuelItemId: string,
    amount = 1
  ): boolean {
    if (!isFuelItem(fuelItemId)) return false;
    const have = this.getItemCount(fuelItemId);
    if (have <= 0) return false;

    const st = this.getActiveThermalStation(stationType);
    // If another fuel type is currently sitting in the fuel slot, return it to the player first
    if (st.fuelItemId && st.fuelItemId !== fuelItemId && (st.fuelCount || 0) > 0) {
      if (!this.addItemToInventory(st.fuelItemId, st.fuelCount!)) {
        this.spawnDrop(st.fuelItemId, st.fuelCount!, this.player.x, this.player.y);
      }
      st.fuelItemId = null;
      st.fuelCount = 0;
    }

    const currentCount = st.fuelCount || 0;
    const maxStack = ITEMS[fuelItemId]?.maxStack || 99;
    const space = Math.max(0, maxStack - currentCount);
    const toAdd = Math.min(amount, have, space);
    if (toAdd <= 0) return false;

    this.removeItemFromInventory(fuelItemId, toAdd);
    st.fuelItemId = fuelItemId;
    st.fuelCount = currentCount + toAdd;
    soundManager.playPickup();
    this.syncChunkAtTile(st.tileX, st.tileY);
    this.emitUiSnapshot();
    return true;
  }

  public removeFuelFromThermalStation(
    stationType: PlaceableType.CAMPFIRE | PlaceableType.FURNACE
  ): boolean {
    const st = this.getActiveThermalStation(stationType);
    if (!st.fuelItemId || !st.fuelCount || st.fuelCount <= 0) return false;

    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
      const withdrawKey = `thermal_fuel:${st.id}`;
      if (this.pendingContainerWithdraws.has(withdrawKey)) return false;
      this.pendingContainerWithdraws.add(withdrawKey);
      this.multiplayer.sendWorldInteractRequest({
        action: 'container_withdraw',
        containerKind: 'thermal_fuel',
        structureId: st.id,
        stationType,
      });
      return true;
    }

    const itemId = st.fuelItemId;
    const count = st.fuelCount;
    st.fuelItemId = null;
    st.fuelCount = 0;

    if (!this.addItemToInventory(itemId, count)) {
      this.spawnDrop(itemId, count, this.player.x, this.player.y);
    }
    soundManager.playPickup();
    this.syncChunkAtTile(st.tileX, st.tileY);
    this.emitUiSnapshot();
    return true;
  }

  public queueThermalStationRecipe(
    stationType: PlaceableType.CAMPFIRE | PlaceableType.FURNACE,
    recipeId: string,
    batches = 1
  ): boolean {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe || recipe.requiredStation !== stationType) return false;

    const maxPossible = this.getMaxCraftableCount(recipe);
    const toQueue = Math.min(batches, maxPossible);
    if (toQueue <= 0) return false;

    const st = this.getActiveThermalStation(stationType);

    // If the output slot holds a DIFFERENT finished item, auto-collect it to the player first
    if (
      st.outputItemId &&
      st.outputItemId !== recipe.resultItemId &&
      (st.outputCount || 0) > 0
    ) {
      this.collectThermalStationOutput(stationType);
    }

    // If a different recipe was previously queued in the input slot, refund its remaining batches first
    if (
      st.cookingRecipeId &&
      st.cookingRecipeId !== recipe.id &&
      (st.cookingInputCount || 0) > 0
    ) {
      this.cancelThermalStationQueue(stationType);
    }

    for (const ing of recipe.ingredients) {
      this.removeItemFromInventory(ing.itemId, ing.count * toQueue);
    }

    st.cookingRecipeId = recipe.id;
    st.cookingInputCount = (st.cookingInputCount || 0) + toQueue;
    st.cookingDuration = Math.max(1, recipe.craftTimeSec || 6);
    if ((st.cookingInputCount || 0) === toQueue) {
      st.cookingProgress = 0;
    }

    // Auto-insert 1 fuel unit from inventory if the station has no fuel and isn't currently burning
    if (
      (st.fuelBurnRemaining || 0) <= 0 &&
      (!st.fuelItemId || (st.fuelCount || 0) <= 0)
    ) {
      for (const fuelId of FUEL_ITEM_ORDER) {
        if (this.getItemCount(fuelId) > 0) {
          this.addFuelToThermalStation(stationType, fuelId, 1);
          break;
        }
      }
    }

    soundManager.playPickup();
    this.syncChunkAtTile(st.tileX, st.tileY);
    this.emitUiSnapshot();
    return true;
  }

  public cancelThermalStationQueue(
    stationType: PlaceableType.CAMPFIRE | PlaceableType.FURNACE
  ): boolean {
    const st = this.getActiveThermalStation(stationType);
    if (
      !st.cookingRecipeId ||
      !st.cookingInputCount ||
      st.cookingInputCount <= 0
    ) {
      return false;
    }

    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
      const withdrawKey = `thermal_queue:${st.id}`;
      if (this.pendingContainerWithdraws.has(withdrawKey)) return false;
      this.pendingContainerWithdraws.add(withdrawKey);
      this.multiplayer.sendWorldInteractRequest({
        action: 'container_withdraw',
        containerKind: 'thermal_queue',
        structureId: st.id,
        stationType,
      });
      return true;
    }

    const recipe = RECIPES.find((r) => r.id === st.cookingRecipeId);
    const batches = st.cookingInputCount;
    st.cookingRecipeId = null;
    st.cookingInputCount = 0;
    st.cookingProgress = 0;

    if (recipe) {
      for (const ing of recipe.ingredients) {
        const refundCount = ing.count * batches;
        if (!this.addItemToInventory(ing.itemId, refundCount)) {
          this.spawnDrop(ing.itemId, refundCount, this.player.x, this.player.y);
        }
      }
    }

    soundManager.playPickup();
    this.syncChunkAtTile(st.tileX, st.tileY);
    this.emitUiSnapshot();
    return true;
  }

  public collectThermalStationOutput(
    stationType: PlaceableType.CAMPFIRE | PlaceableType.FURNACE
  ): boolean {
    const st = this.getActiveThermalStation(stationType);
    if (!st.outputItemId || !st.outputCount || st.outputCount <= 0) {
      return false;
    }

    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
      const withdrawKey = `thermal_output:${st.id}`;
      if (this.pendingContainerWithdraws.has(withdrawKey)) return false;
      this.pendingContainerWithdraws.add(withdrawKey);
      this.multiplayer.sendWorldInteractRequest({
        action: 'container_withdraw',
        containerKind: 'thermal_output',
        structureId: st.id,
        stationType,
      });
      return true;
    }

    const itemId = st.outputItemId;
    const count = st.outputCount;
    st.outputItemId = null;
    st.outputCount = 0;

    if (!this.addItemToInventory(itemId, count)) {
      this.spawnDrop(itemId, count, this.player.x, this.player.y + 10);
    }

    soundManager.playCraft();
    const outDef = ITEMS[itemId];
    this.addFloatingText(
      `+${count}x ${outDef?.name || itemId}`,
      this.player.x,
      this.player.y - 20,
      '#4ade80'
    );
    this.syncChunkAtTile(st.tileX, st.tileY);
    this.emitUiSnapshot();
    return true;
  }

  public restAtCampfireStation(): { ok: boolean; message: string } {
    const st = this.getActiveThermalStation(PlaceableType.CAMPFIRE);
    const wx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
    const wy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
    this.setPlayerRespawnPoint(wx, wy, 'Fogueira de Acampamento');

    if (this.campfireRestCooldown > 0) {
      this.emitUiSnapshot();
      return {
        ok: true,
        message: `⛺ Ponto de Renascimento salvo! Aguarde ${Math.ceil(this.campfireRestCooldown)}s para aquecer novamente.`,
      };
    }

    this.campfireRestCooldown = 8;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 18);
    this.player.stamina = this.player.maxStamina;
    soundManager.playTameSuccess();
    this.renderer.spawnBurst(wx, wy - 4, 'SPARK', 12);
    this.renderer.spawnBurst(this.player.x, this.player.y, 'HEAL', 10);
    this.addFloatingText(
      'Aquecido na Fogueira (+18 HP / Energia Cheia) · Renascimento salvo!',
      this.player.x,
      this.player.y - 22,
      '#fde047'
    );
    this.emitUiSnapshot();
    return {
      ok: true,
      message:
        '🔥 Você se aqueceu na Fogueira (+18 HP, 100% Energia e Ponto de Renascimento salvo)!',
    };
  }

  private dropThermalStationContents(
    st: PlacedStructure,
    wx: number,
    wy: number,
    tryAddToPlayerFirst = false
  ): void {
    const emitOrGive = (itemId: string, count: number) => {
      if (count <= 0 || !ITEMS[itemId]) return;
      if (tryAddToPlayerFirst && this.addItemToInventory(itemId, count)) {
        return;
      }
      this.spawnDrop(
        itemId,
        count,
        wx + (Math.random() - 0.5) * 16,
        wy + (Math.random() - 0.5) * 16
      );
    };

    if (st.fuelItemId && (st.fuelCount || 0) > 0) {
      emitOrGive(st.fuelItemId, st.fuelCount!);
      st.fuelItemId = null;
      st.fuelCount = 0;
    }
    if (st.cookingRecipeId && (st.cookingInputCount || 0) > 0) {
      const recipe = RECIPES.find((r) => r.id === st.cookingRecipeId);
      if (recipe) {
        for (const ing of recipe.ingredients) {
          emitOrGive(ing.itemId, ing.count * st.cookingInputCount!);
        }
      }
      st.cookingRecipeId = null;
      st.cookingInputCount = 0;
      st.cookingProgress = 0;
    }
    if (st.outputItemId && (st.outputCount || 0) > 0) {
      emitOrGive(st.outputItemId, st.outputCount!);
      st.outputItemId = null;
      st.outputCount = 0;
    }
  }

  private tickSingleThermalStation(st: PlacedStructure, dt: number): boolean {
    let changed = false;
    const hasQueue =
      Boolean(st.cookingRecipeId) && (st.cookingInputCount || 0) > 0;

    // 1. Decay active fuel burn timer
    if ((st.fuelBurnRemaining || 0) > 0) {
      st.fuelBurnRemaining = Math.max(0, (st.fuelBurnRemaining || 0) - dt);
      changed = true;
    }

    // 2. If fuel flame ran out and we still have batches queued, consume 1 fuel item from the fuel slot
    if (
      (st.fuelBurnRemaining || 0) <= 0 &&
      hasQueue &&
      st.fuelItemId &&
      (st.fuelCount || 0) > 0
    ) {
      const burnSec = getFuelBurnTimeSec(st.fuelItemId);
      if (burnSec > 0) {
        st.fuelCount = (st.fuelCount || 0) - 1;
        if (st.fuelCount <= 0) {
          st.fuelItemId = null;
          st.fuelCount = 0;
        }
        st.fuelBurnRemaining = burnSec;
        st.fuelBurnMax = burnSec;
        changed = true;
      }
    }

    // 3. Advance cooking / smelting progress if burning and queued
    if (hasQueue && (st.fuelBurnRemaining || 0) > 0) {
      const recipe = RECIPES.find((r) => r.id === st.cookingRecipeId);
      if (!recipe) {
        st.cookingRecipeId = null;
        st.cookingInputCount = 0;
        st.cookingProgress = 0;
        return true;
      }
      const duration = Math.max(1, st.cookingDuration || recipe.craftTimeSec || 6);
      st.cookingDuration = duration;
      st.cookingProgress = (st.cookingProgress || 0) + dt;
      changed = true;

      if (st.cookingProgress >= duration) {
        st.cookingProgress -= duration;
        st.cookingInputCount = Math.max(0, (st.cookingInputCount || 0) - 1);

        if (
          st.outputItemId &&
          st.outputItemId !== recipe.resultItemId &&
          (st.outputCount || 0) > 0
        ) {
          this.spawnDrop(
            st.outputItemId,
            st.outputCount!,
            st.tileX * TILE_SIZE + 16,
            st.tileY * TILE_SIZE + 16
          );
          st.outputCount = 0;
        }

        st.outputItemId = recipe.resultItemId;
        st.outputCount = (st.outputCount || 0) + recipe.resultCount;

        if (st.cookingInputCount <= 0) {
          st.cookingRecipeId = null;
          st.cookingInputCount = 0;
          st.cookingProgress = 0;
        }

        const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
        const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
        if (Math.hypot(sx - this.player.x, sy - this.player.y) <= 260) {
          soundManager.playCraft();
          this.renderer.spawnBurst(sx, sy - 6, 'SPARK', 8);
          const outName = ITEMS[recipe.resultItemId]?.name || recipe.resultItemId;
          this.addFloatingText(
            `🔥 Pronto: +${recipe.resultCount}x ${outName}`,
            sx,
            sy - 20,
            '#fde047'
          );
        }
        this.gainXp(18);
      }
    } else if (hasQueue && (st.fuelBurnRemaining || 0) <= 0) {
      // Without fire, progress cools down gently
      if ((st.cookingProgress || 0) > 0) {
        st.cookingProgress = Math.max(0, (st.cookingProgress || 0) - dt * 0.5);
        changed = true;
      }
    }

    return changed;
  }

  private updateThermalStations(dt: number): void {
    let anyChanged = false;
    for (const chunk of Object.values(this.world.chunks)) {
      if (!chunk || !Array.isArray(chunk.structures)) continue;
      for (const st of chunk.structures) {
        if (
          st.type === PlaceableType.CAMPFIRE ||
          st.type === PlaceableType.FURNACE
        ) {
          if (
            (st.fuelBurnRemaining || 0) > 0 ||
            (st.cookingInputCount || 0) > 0
          ) {
            if (this.tickSingleThermalStation(st, dt)) {
              anyChanged = true;
            }
          }
        }
      }
    }
    for (const st of Object.values(this.fallbackThermalStations)) {
      if (
        (st.fuelBurnRemaining || 0) > 0 ||
        (st.cookingInputCount || 0) > 0
      ) {
        if (this.tickSingleThermalStation(st, dt)) {
          anyChanged = true;
        }
      }
    }
    if (anyChanged && this.isPaused) {
      this.emitUiSnapshot();
    }
  }

  public addItemToInventory(itemId: string, count: number): boolean {
    const def = ITEMS[itemId];
    if (!def) return false;
    if (itemId === 'gold_coin') {
      if (count > 0) {
        this.player.goldCoins = Math.max(
          0,
          Math.floor((this.player.goldCoins || 0) + count)
        );
      }
      return true;
    }
    let remaining = count;

    for (let i = 0; i < this.player.inventory.length; i++) {
      const slot = this.player.inventory[i];
      if (slot && slot.itemId === itemId && slot.count < def.maxStack) {
        const space = def.maxStack - slot.count;
        const take = Math.min(space, remaining);
        slot.count += take;
        remaining -= take;
        if (remaining <= 0) return true;
      }
    }

    for (let i = 0; i < this.player.inventory.length; i++) {
      if (this.player.inventory[i] === null) {
        const take = Math.min(def.maxStack, remaining);
        this.player.inventory[i] = { itemId, count: take };
        remaining -= take;
        if (remaining <= 0) return true;
      }
    }

    return remaining === 0;
  }

  public removeItemFromInventory(itemId: string, count: number): void {
    if (itemId === 'gold_coin') {
      this.player.goldCoins = Math.max(
        0,
        Math.floor((this.player.goldCoins || 0) - count)
      );
      return;
    }
    let remaining = count;
    for (let i = 0; i < this.player.inventory.length; i++) {
      const slot = this.player.inventory[i];
      if (slot && slot.itemId === itemId) {
        const take = Math.min(slot.count, remaining);
        slot.count -= take;
        remaining -= take;
        if (slot.count <= 0) {
          this.player.inventory[i] = null;
        }
        if (remaining <= 0) return;
      }
    }
  }

  private consumeInventoryAt(slotIndex: number, count: number): void {
    const slot = this.player.inventory[slotIndex];
    if (!slot) return;
    slot.count -= count;
    if (slot.count <= 0) {
      this.player.inventory[slotIndex] = null;
    }
  }

  // === RPG LEVEL & ATTRIBUTES ===

  public gainXp(amount: number): void {
    this.player.xp += amount;
    while (this.player.xp >= this.player.xpToNext) {
      this.player.xp -= this.player.xpToNext;
      this.player.level += 1;
      this.player.xpToNext = Math.round(this.player.xpToNext * 1.35);
      this.player.attributePoints += 1;
      this.recalculatePlayerMaxHp();
      this.player.hp = this.player.maxHp;
      this.player.hunger = this.player.maxHunger;
      soundManager.playLevelUp();
      this.renderer.spawnBurst(this.player.x, this.player.y, 'GOLD', 18);
      this.renderer.spawnRipple(this.player.x, this.player.y, '#fde047', 34, 0.65);
      this.addFloatingText(
        `Nível ${this.player.level}! (+1 Ponto de Atributo)`,
        this.player.x,
        this.player.y - 28,
        '#fde047'
      );
    }
    this.metadata.playerLevel = this.player.level;
    this.emitUiSnapshot();
  }

  public upgradeAttribute(attr: keyof PlayerAttributes): void {
    if (this.player.attributePoints <= 0) return;
    this.player.attributePoints -= 1;
    this.player.attributes[attr] = (this.player.attributes[attr] || 0) + 1;
    if (attr === 'vitality') {
      this.recalculatePlayerMaxHp();
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 18);
    } else if (attr === 'attackSpeed') {
      this.player.swingDuration = this.getPlayerAttackCooldownSec();
    }
    soundManager.playCraft();
    this.emitUiSnapshot();
  }

  // === MAP WAYPOINTS ===

  public addWaypoint(label: string, tileX: number, tileY: number, color = '#f59e0b'): void {
    this.waypoints.push({
      id: `wp_${Date.now()}_${Math.floor(Math.random() * 999)}`,
      label: label.trim() || 'Marcador',
      tileX,
      tileY,
      color,
    });
    soundManager.playPickup();
    this.emitUiSnapshot();
  }

  public removeWaypoint(id: string): void {
    this.waypoints = this.waypoints.filter((w) => w.id !== id);
    this.emitUiSnapshot();
  }

  // === HELPERS & PERSISTENCE ===

  private spawnDrop(
    itemId: string,
    count: number,
    x: number,
    y: number,
    pickupDelay = 0.25
  ): void {
    const drop: DroppedItem = {
      id: `drop_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      itemId,
      count,
      x,
      y,
      bobTimer: Math.random() * 5,
      pickupDelay,
    };
    this.droppedItems.push(drop);
    if (!this.isApplyingNetworkEvent) {
      this.multiplayer.sendSpawnDrop(drop);
    }
  }

  private addFloatingText(text: string, x: number, y: number, color: string): void {
    this.floatingTexts.push({
      id: `ft_${Date.now()}_${Math.random()}`,
      text,
      x,
      y,
      color,
      timer: 1.1,
      maxTimer: 1.1,
    });
  }

  private getDirectionOffset(dir: PlayerState['direction']): { x: number; y: number } {
    switch (dir) {
      case 'up':
        return { x: 0, y: -1 };
      case 'down':
        return { x: 0, y: 1 };
      case 'left':
        return { x: -1, y: 0 };
      case 'right':
        return { x: 1, y: 0 };
    }
  }

  private getTargetTileForPlacement(): { tx: number; ty: number } | null {
    const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];
    const heldItem = heldSlot ? ITEMS[heldSlot.itemId] : null;
    if (
      !heldItem ||
      (heldItem.category !== ItemCategory.PLACEABLE &&
        heldItem.id !== 'wood_boat' &&
        !heldItem.seedCropType &&
        heldItem.id !== 'bone_fertilizer')
    ) {
      return null;
    }

    if (this.customTargetTile) return this.customTargetTile;

    const pTile = this.world.worldToTile(this.player.x, this.player.y);
    const offset = this.getDirectionOffset(this.player.direction);
    return {
      tx: pTile.tx + offset.x,
      ty: pTile.ty + offset.y,
    };
  }

  public getNearbyStations(): PlaceableType[] {
    const found = new Set<PlaceableType>();
    const pTile = this.world.worldToTile(this.player.x, this.player.y);
    const pChunk = this.world.tileToChunk(pTile.tx, pTile.ty);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = WorldManager.chunkKey(pChunk.cx + dx, pChunk.cy + dy);
        const chunk = this.world.chunks[key];
        if (!chunk) continue;
        for (const st of chunk.structures) {
          const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
          const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
          if (Math.hypot(sx - this.player.x, sy - this.player.y) <= TILE_SIZE * 3.2) {
            found.add(st.type);
          }
        }
      }
    }
    return Array.from(found);
  }

  private isPlayerNearStructure(types: PlaceableType[]): boolean {
    const nearby = this.getNearbyStations();
    return types.some((t) => nearby.includes(t));
  }

  public getNearbyWildAnimal(): CreatureEntity | null {
    const aimed = this.getAimedTarget();
    if (aimed?.kind !== 'wild_animal' || !aimed.creatureId) return null;
    return (
      this.entities.creatures.find(
        (cr) =>
          cr.id === aimed.creatureId &&
          !cr.isHostile &&
          !cr.tamed &&
          cr.kind !== CreatureKind.VILLAGER &&
          cr.kind !== CreatureKind.WANDERER &&
          cr.kind !== CreatureKind.BOAT
      ) || null
    );
  }

  public getNearbyTamedAnimal(): CreatureEntity | null {
    const aimed = this.getAimedTarget();
    if (aimed?.kind !== 'tamed_animal' || !aimed.creatureId) return null;
    return (
      this.entities.creatures.find(
        (cr) =>
          cr.id === aimed.creatureId &&
          (cr.tamed || cr.kind === CreatureKind.BOAT)
      ) || null
    );
  }

  // =========================================================================
  // MOUNTS, SADDLES (8-SLOT INVENTORY), GALLOP, PET OWNERSHIP & 2-SEAT BOAT
  // =========================================================================

  private getLocalRiderId(): string {
    return this.multiplayer.isOnline ? this.multiplayer.peerId : 'LOCAL';
  }

  public getLocalOwnerId(): string {
    if (!this.player.persistentPlayerId) {
      this.player.persistentPlayerId = getOrCreatePersistentPlayerUid();
    }
    return this.player.persistentPlayerId;
  }

  /**
   * Returns true if the tamed creature belongs to the local player.
   * Boats have no owner restriction. For legacy creatures without `ownerId`,
   * the Host/Single-player owns them by default.
   */
  public isCreatureOwnedByLocalPlayer(cr: CreatureEntity): boolean {
    if (cr.kind === CreatureKind.BOAT) return true;
    const localOwnerId = this.getLocalOwnerId();
    const localPeerId = this.getLocalRiderId();
    if (!cr.ownerId) {
      // Legacy pet from before ownership was stamped -> belongs to the Host / Single-player world owner
      if (!this.multiplayer.isOnline || this.multiplayer.role === 'HOST') {
        cr.ownerId = localOwnerId;
        cr.ownerName =
          this.multiplayer.localPlayerName ||
          this.settings.playerName ||
          'Aventureiro';
        return true;
      }
      return false;
    }
    return cr.ownerId === localOwnerId || cr.ownerId === localPeerId;
  }

  /**
   * Horses and Camels have strictly 1 seat (`riderPlayerId`).
   * Returns true if another active player is already mounted on this Horse or Camel.
   */
  public isMountOccupiedByOtherPlayer(cr: CreatureEntity): boolean {
    if (cr.kind !== CreatureKind.HORSE && cr.kind !== CreatureKind.CAMEL) {
      return false;
    }
    if (this.player.mountedEntityId === cr.id) {
      return false;
    }
    const localRiderId = this.getLocalRiderId();
    const localOwnerId = this.getLocalOwnerId();
    if (
      cr.riderPlayerId &&
      cr.riderPlayerId !== 'LOCAL' &&
      cr.riderPlayerId !== localRiderId &&
      cr.riderPlayerId !== localOwnerId
    ) {
      // Verify the rider is still in the session (or if we are Guest and Host itself is riding)
      const remoteRiding = this.remotePlayersList.some(
        (rp) =>
          rp.mountedEntityId === cr.id ||
          rp.peerId === cr.riderPlayerId ||
          rp.persistentPlayerId === cr.riderPlayerId
      );
      if (remoteRiding) return true;
    }
    return this.remotePlayersList.some((rp) => rp.mountedEntityId === cr.id);
  }

  /**
   * Resolves the world coordinates of a tamed pet's actual owner so that
   * a Guest's pet follows the Guest instead of always following the Host.
   */
  private getPetOwnerTarget(
    cr: CreatureEntity
  ): { x: number; y: number } | null {
    if (this.isCreatureOwnedByLocalPlayer(cr)) {
      return { x: this.player.x, y: this.player.y };
    }
    if (cr.ownerId) {
      for (const rp of this.multiplayer.remotePlayers.values()) {
        if (rp.persistentPlayerId === cr.ownerId || rp.peerId === cr.ownerId) {
          return { x: rp.x, y: rp.y };
        }
      }
    }
    return null;
  }

  /**
   * Checks if at least `count` of `itemId` can fit in the player's inventory without mutating it.
   */
  public canFitItemInInventory(itemId: string, count = 1): boolean {
    if (itemId === 'gold_coin') return true;
    const def = ITEMS[itemId];
    if (!def) return false;
    let remaining = count;
    for (let i = 0; i < this.player.inventory.length && remaining > 0; i++) {
      const slot = this.player.inventory[i];
      if (!slot) {
        remaining -= def.maxStack;
      } else if (slot.itemId === itemId && slot.count < def.maxStack) {
        remaining -= def.maxStack - slot.count;
      }
    }
    return remaining <= 0;
  }

  /**
   * Prevents duplicate world action drops when two players break/harvest the exact same object at the same time.
   */
  private tryClaimWorldAction(actionKey: string): boolean {
    const now = Date.now();
    const existing = this.claimedWorldActionKeys.get(actionKey);
    if (existing && now < existing) {
      return false;
    }
    this.claimedWorldActionKeys.set(actionKey, now + 3500);
    if (this.multiplayer.isOnline) {
      if (this.multiplayer.role === 'HOST') {
        this.multiplayer.sendWorldInteractResolved({
          action: 'world_action_lock',
          actionKey,
        });
      } else {
        this.multiplayer.sendWorldInteractRequest({
          action: 'world_action_lock',
          actionKey,
        });
      }
    }
    return true;
  }

  public getActiveMount(): CreatureEntity | null {
    if (!this.player.mountedEntityId) return null;
    return (
      this.entities.creatures.find(
        (c) => c.id === this.player.mountedEntityId && c.hp > 0
      ) || null
    );
  }

  /**
   * Restores or synchronizes the player's integrated mount entity in `this.entities.creatures`
   * using `this.player.mountedCreatureData`. Ensures that if a player (Host or Guest)
   * returns to the world while mounted, their mount returns with them immediately.
   */
  public restoreIntegratedPlayerMount(): CreatureEntity | null {
    if (!this.player.mountedEntityId) {
      this.player.mountedCreatureData = null;
      return null;
    }

    const riderId = this.getLocalRiderId();
    const ownerId = this.getLocalOwnerId();
    const ownerName =
      this.multiplayer.localPlayerName ||
      this.settings.playerName ||
      'Aventureiro';
    let mount =
      this.entities.creatures.find(
        (c) => c.id === this.player.mountedEntityId && c.hp > 0
      ) || null;

    // If mount is a Horse or Camel and is owned by another player or already ridden by another player, dismount local player
    if (
      mount &&
      (mount.kind === CreatureKind.HORSE || mount.kind === CreatureKind.CAMEL) &&
      (!this.isCreatureOwnedByLocalPlayer(mount) ||
        this.isMountOccupiedByOtherPlayer(mount))
    ) {
      this.player.mountedEntityId = null;
      this.player.mountedCreatureData = null;
      this.player.isGalloping = false;
      return null;
    }

    if (!mount && this.player.mountedCreatureData) {
      const savedMount: CreatureEntity = JSON.parse(
        JSON.stringify(this.player.mountedCreatureData)
      );
      savedMount.id = this.player.mountedEntityId;
      savedMount.x = this.player.x;
      savedMount.y = this.player.y;
      savedMount.vx = 0;
      savedMount.vy = 0;
      savedMount.direction = this.player.direction;
      savedMount.hp = Math.max(1, savedMount.hp || savedMount.maxHp || 100);
      savedMount.tamed = true;
      savedMount.riderPlayerId = riderId;
      if (savedMount.kind !== CreatureKind.BOAT) {
        savedMount.ownerId = savedMount.ownerId || ownerId;
        savedMount.ownerName = savedMount.ownerName || ownerName;
      }
      if (
        savedMount.kind === CreatureKind.HORSE ||
        savedMount.kind === CreatureKind.CAMEL
      ) {
        savedMount.hasSaddle = true;
        this.ensureMountInventoryInitialized(savedMount);
      }
      this.entities.creatures.push(savedMount);
      mount = savedMount;
    } else if (mount) {
      mount.x = this.player.x;
      mount.y = this.player.y;
      mount.direction = this.player.direction;
      if (mount.kind !== CreatureKind.BOAT && !mount.ownerId) {
        mount.ownerId = ownerId;
        mount.ownerName = ownerName;
      }
      if (
        !mount.riderPlayerId ||
        mount.riderPlayerId === 'LOCAL' ||
        mount.riderPlayerId === riderId
      ) {
        mount.riderPlayerId = riderId;
      }
      if (this.player.mountedCreatureData) {
        if (this.player.mountedCreatureData.hasSaddle) {
          mount.hasSaddle = true;
        }
        if (this.player.mountedCreatureData.mountSpeed) {
          mount.mountSpeed = this.player.mountedCreatureData.mountSpeed;
        }
        if (this.player.mountedCreatureData.mountMaxStamina) {
          mount.mountMaxStamina =
            this.player.mountedCreatureData.mountMaxStamina;
        }
        if (this.player.mountedCreatureData.mountStamina !== undefined) {
          mount.mountStamina = this.player.mountedCreatureData.mountStamina;
        }
        if (Array.isArray(this.player.mountedCreatureData.mountInventory)) {
          mount.mountInventory = JSON.parse(
            JSON.stringify(this.player.mountedCreatureData.mountInventory)
          );
        }
      }
      if (
        (mount.kind === CreatureKind.HORSE ||
          mount.kind === CreatureKind.CAMEL) &&
        mount.hasSaddle
      ) {
        this.ensureMountInventoryInitialized(mount);
      }
    }

    this.syncPlayerMountedCreatureData();
    return mount;
  }

  /**
   * Snapshots the active mount's state onto `this.player.mountedCreatureData`
   * so the mount is always saved and transmitted as an integrated part of the player's body.
   */
  private syncPlayerMountedCreatureData(): void {
    if (!this.player.mountedEntityId) {
      this.player.mountedCreatureData = null;
      return;
    }
    const mount = this.getActiveMount();
    if (!mount) return;
    this.player.mountedCreatureData = {
      ...mount,
      x: this.player.x,
      y: this.player.y,
      direction: this.player.direction,
      ownerId:
        mount.kind === CreatureKind.BOAT
          ? null
          : mount.ownerId || this.getLocalOwnerId(),
      ownerName:
        mount.kind === CreatureKind.BOAT
          ? null
          : mount.ownerName ||
            this.multiplayer.localPlayerName ||
            this.settings.playerName ||
            'Aventureiro',
      riderPlayerId:
        mount.riderPlayerId === 'LOCAL'
          ? this.getLocalRiderId()
          : mount.riderPlayerId || this.getLocalRiderId(),
      mountInventory: Array.isArray(mount.mountInventory)
        ? mount.mountInventory.map((s) => (s ? { ...s } : null))
        : undefined,
    };
  }

  /**
   * Ensures that any remote player who is mounted has their mount entity present and synchronized
   * in `this.entities.creatures` (so when a Guest reconnects mounted, the mount returns with them).
   */
  private reconcileRemotePlayerMounts(): void {
    for (const rp of this.multiplayer.remotePlayers.values()) {
      if (rp.mountedEntityId && rp.mountedCreatureData) {
        let mount = this.entities.creatures.find(
          (c) => c.id === rp.mountedEntityId
        );
        if (!mount) {
          const spawned: CreatureEntity = {
            ...JSON.parse(JSON.stringify(rp.mountedCreatureData)),
            id: rp.mountedEntityId,
            x: rp.x,
            y: rp.y,
            vx: rp.vx,
            vy: rp.vy,
            direction: rp.direction,
            hp: Math.max(
              1,
              rp.mountedCreatureData.hp || rp.mountedCreatureData.maxHp || 100
            ),
            tamed: true,
            ownerId:
              rp.mountedCreatureData.kind === CreatureKind.BOAT
                ? null
                : rp.mountedCreatureData.ownerId ||
                  rp.persistentPlayerId ||
                  rp.peerId,
            ownerName:
              rp.mountedCreatureData.kind === CreatureKind.BOAT
                ? null
                : rp.mountedCreatureData.ownerName || rp.name,
            riderPlayerId: rp.peerId,
          };
          if (
            spawned.kind === CreatureKind.HORSE ||
            spawned.kind === CreatureKind.CAMEL
          ) {
            spawned.hasSaddle = true;
            this.ensureMountInventoryInitialized(spawned);
          }
          this.entities.creatures.push(spawned);
        } else {
          // Enforce single-seat on Horse/Camel: if local player is already riding their own mount, don't let remote override it
          if (
            (mount.kind === CreatureKind.HORSE ||
              mount.kind === CreatureKind.CAMEL) &&
            this.player.mountedEntityId === mount.id &&
            this.isCreatureOwnedByLocalPlayer(mount)
          ) {
            continue;
          }
          mount.x = rp.x;
          mount.y = rp.y;
          mount.vx = rp.vx;
          mount.vy = rp.vy;
          mount.direction = rp.direction;
          mount.animFrame = rp.animFrame;
          mount.tamed = true;
          if (mount.kind !== CreatureKind.BOAT && !mount.ownerId) {
            mount.ownerId =
              rp.mountedCreatureData.ownerId ||
              rp.persistentPlayerId ||
              rp.peerId;
            mount.ownerName = rp.mountedCreatureData.ownerName || rp.name;
          }
          if (!mount.riderPlayerId || mount.riderPlayerId === rp.peerId) {
            mount.riderPlayerId = rp.peerId;
          }
          if (rp.mountedCreatureData.hasSaddle) {
            mount.hasSaddle = true;
          }
          if (rp.mountedCreatureData.mountSpeed) {
            mount.mountSpeed = rp.mountedCreatureData.mountSpeed;
          }
          if (rp.mountedCreatureData.mountMaxStamina) {
            mount.mountMaxStamina = rp.mountedCreatureData.mountMaxStamina;
          }
          if (rp.mountedCreatureData.mountStamina !== undefined) {
            mount.mountStamina = rp.mountedCreatureData.mountStamina;
          }
          if (Array.isArray(rp.mountedCreatureData.mountInventory)) {
            mount.mountInventory = rp.mountedCreatureData.mountInventory;
          }
        }
      } else {
        for (const cr of this.entities.creatures) {
          if (cr.riderPlayerId === rp.peerId && rp.mountedEntityId !== cr.id) {
            cr.riderPlayerId = null;
          }
          if (
            cr.passengerPlayerId === rp.peerId &&
            rp.mountedEntityId !== cr.id
          ) {
            cr.passengerPlayerId = null;
          }
        }
      }
    }
  }

  /**
   * When a Guest leaves the game while mounted, their mount is part of their body
   * and disappears from the world with them (and returns when they reconnect).
   */
  private handleRemotePeerLeft(peerId: string): void {
    if (!peerId) return;
    let removedAny = false;
    for (let i = this.entities.creatures.length - 1; i >= 0; i--) {
      const cr = this.entities.creatures[i];
      if (cr.riderPlayerId === peerId) {
        if (this.player.mountedEntityId === cr.id) {
          this.player.mountedEntityId = null;
          this.player.mountedCreatureData = null;
          this.player.isGalloping = false;
        }
        this.entities.creatures.splice(i, 1);
        removedAny = true;
        continue;
      }
      if (cr.passengerPlayerId === peerId) {
        cr.passengerPlayerId = null;
        removedAny = true;
      }
    }
    if (
      removedAny &&
      this.multiplayer.isOnline &&
      this.multiplayer.role === 'HOST'
    ) {
      this.multiplayer.sendCreaturesSync(this.entities.creatures);
    }
    this.syncPauseState();
    this.emitUiSnapshot();
  }

  /**
   * Processes mount/taming/boat actions sent from a Guest to the Host so the Host's
   * authoritative creature list stays 100% synchronized and validates ownership & single-seat rules.
   */
  private handleGuestMountEvent(peerId: string, event: any): void {
    if (!event || typeof event.action !== 'string') return;
    const guestPlayer = this.multiplayer.remotePlayers.get(peerId);
    const guestOwnerId =
      event.ownerId || guestPlayer?.persistentPlayerId || peerId;
    const guestOwnerName =
      event.ownerName || guestPlayer?.name || 'Convidado';

    switch (event.action) {
      case 'tame': {
        const cr = this.entities.creatures.find(
          (c) => c.id === event.creatureId
        );
        if (cr) {
          // If already tamed by a different player, ignore conflicting tame/command
          if (
            cr.tamed &&
            cr.ownerId &&
            cr.ownerId !== guestOwnerId &&
            cr.ownerId !== peerId
          ) {
            break;
          }
          cr.tamed = Boolean(event.tamed);
          cr.tameProgress =
            typeof event.tameProgress === 'number'
              ? event.tameProgress
              : cr.tameProgress;
          if (cr.tamed && !cr.ownerId) {
            cr.ownerId = guestOwnerId;
            cr.ownerName = guestOwnerName;
          }
          if (event.aiState) cr.aiState = event.aiState;
          if (typeof event.hp === 'number') cr.hp = event.hp;
        }
        break;
      }
      case 'saddle': {
        const cr = this.entities.creatures.find(
          (c) => c.id === event.creatureId
        );
        if (cr) {
          if (
            cr.ownerId &&
            cr.ownerId !== guestOwnerId &&
            cr.ownerId !== peerId
          ) {
            break;
          }
          cr.tamed = true;
          cr.ownerId = cr.ownerId || guestOwnerId;
          cr.ownerName = cr.ownerName || guestOwnerName;
          cr.hasSaddle = true;
          this.ensureMountInventoryInitialized(cr);
        }
        break;
      }
      case 'unsaddle': {
        const cr = this.entities.creatures.find(
          (c) => c.id === event.creatureId
        );
        if (cr) {
          if (
            cr.ownerId &&
            cr.ownerId !== guestOwnerId &&
            cr.ownerId !== peerId
          ) {
            break;
          }
          cr.hasSaddle = false;
          cr.mountInventory = new Array(MOUNT_STORAGE_SIZE).fill(null);
        }
        break;
      }
      case 'spawn_boat': {
        if (
          event.creature &&
          event.creature.id &&
          !this.entities.creatures.some((c) => c.id === event.creature.id)
        ) {
          this.entities.creatures.push(event.creature);
        }
        break;
      }
      case 'pickup_boat': {
        const boatPickupKey = `pickup_boat:${event.creatureId}`;
        if (!this.tryClaimWorldAction(boatPickupKey)) break;
        const idx = this.entities.creatures.findIndex(
          (c) => c.id === event.creatureId && c.kind === CreatureKind.BOAT
        );
        if (idx !== -1) {
          this.entities.creatures.splice(idx, 1);
        }
        break;
      }
      case 'mount': {
        let cr = this.entities.creatures.find(
          (c) => c.id === event.creatureId
        );
        if (!cr && event.creature) {
          cr = {
            ...event.creature,
            id: event.creatureId,
            ownerId:
              event.creature.kind === CreatureKind.BOAT
                ? null
                : event.creature.ownerId || guestOwnerId,
            ownerName:
              event.creature.kind === CreatureKind.BOAT
                ? null
                : event.creature.ownerName || guestOwnerName,
            riderPlayerId: peerId,
          };
          this.entities.creatures.push(cr!);
        }
        if (cr) {
          // Enforce single-owner and single-seat for Horse and Camel on Host
          if (
            cr.kind === CreatureKind.HORSE ||
            cr.kind === CreatureKind.CAMEL
          ) {
            const belongsToGuest =
              !cr.ownerId ||
              cr.ownerId === guestOwnerId ||
              cr.ownerId === peerId;
            const alreadyRiddenBySomeoneElse =
              this.player.mountedEntityId === cr.id ||
              Boolean(
                cr.riderPlayerId &&
                  cr.riderPlayerId !== peerId &&
                  cr.riderPlayerId !== guestOwnerId
              );
            if (!belongsToGuest || alreadyRiddenBySomeoneElse) {
              this.multiplayer.sendWorldInteractResolved({
                action: 'force_dismount',
                targetPeerId: peerId,
                creatureId: cr.id,
                reason: !belongsToGuest
                  ? `🔒 ${cr.name} pertence exclusivamente a ${cr.ownerName || 'outro jogador'}!`
                  : `🔒 ${cr.name} já possui um jogador montado (1 Assento)!`,
              });
              break;
            }
            cr.riderPlayerId = peerId;
          } else {
            if (event.isPassenger) {
              cr.passengerPlayerId = peerId;
            } else {
              cr.riderPlayerId = peerId;
            }
            if (event.passengerPetId !== undefined) {
              cr.passengerPetId = event.passengerPetId;
            }
          }
        }
        break;
      }
      case 'dismount': {
        const cr = this.entities.creatures.find(
          (c) => c.id === event.creatureId
        );
        if (cr) {
          if (cr.riderPlayerId === peerId) cr.riderPlayerId = null;
          if (cr.passengerPlayerId === peerId) cr.passengerPlayerId = null;
          if (typeof event.x === 'number') cr.x = event.x;
          if (typeof event.y === 'number') cr.y = event.y;
          cr.vx = 0;
          cr.vy = 0;
        }
        break;
      }
      case 'mount_inventory': {
        const cr = this.entities.creatures.find(
          (c) => c.id === event.creatureId
        );
        if (
          cr &&
          Array.isArray(event.mountInventory) &&
          (!cr.ownerId ||
            cr.ownerId === guestOwnerId ||
            cr.ownerId === peerId)
        ) {
          cr.mountInventory = event.mountInventory;
        }
        break;
      }
    }

    if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
      this.multiplayer.sendCreaturesSync(this.entities.creatures);
    }
    this.emitUiSnapshot();
  }

  /**
   * Returns true if `itemId` is a valid food item that can heal a tamed pet when pressing the Interact button.
   */
  private isFoodItemForPet(
    itemId: string | undefined | null,
    cr: CreatureEntity
  ): boolean {
    if (!itemId) return false;
    const item = ITEMS[itemId];
    if (!item) return false;
    if (
      item.specialUse === 'bomb' ||
      item.specialUse === 'recall' ||
      item.specialUse === 'peace_treaty'
    ) {
      return false;
    }
    return Boolean(
      item.category === ItemCategory.CONSUMABLE ||
        cr.favoriteFoodIds.includes(item.id) ||
        (item.hpRestore && item.hpRestore > 0) ||
        (item.hungerRestore && item.hungerRestore > 0)
    );
  }

  public ensureMountInventoryInitialized(cr: CreatureEntity): void {
    if (!Array.isArray(cr.mountInventory) || cr.mountInventory.length !== MOUNT_STORAGE_SIZE) {
      const prev = Array.isArray(cr.mountInventory) ? cr.mountInventory : [];
      cr.mountInventory = Array.from({ length: MOUNT_STORAGE_SIZE }, (_, idx) => prev[idx] || null);
    }
    if (!cr.mountSpeed) {
      cr.mountSpeed = cr.kind === CreatureKind.CAMEL ? 142 : 150;
    }
    if (!cr.mountMaxStamina) {
      cr.mountMaxStamina = cr.kind === CreatureKind.CAMEL ? 165 : 100;
    }
    if (cr.mountStamina === undefined) {
      cr.mountStamina = cr.mountMaxStamina;
    }
  }

  public equipSaddleOnCreature(creatureId: string): boolean {
    const cr = this.entities.creatures.find(
      (c) =>
        c.id === creatureId &&
        c.tamed &&
        (c.kind === CreatureKind.HORSE || c.kind === CreatureKind.CAMEL)
    );
    if (!cr || cr.hasSaddle) return false;

    if (!this.isCreatureOwnedByLocalPlayer(cr)) {
      soundManager.playHitWood();
      this.addFloatingText(
        `🔒 Somente ${cr.ownerName || 'o dono'} pode equipar sela em ${cr.name}!`,
        cr.x,
        cr.y - 20,
        '#f43f5e'
      );
      return false;
    }

    const saddleSlotIdx =
      this.player.inventory[this.player.selectedHotbarIndex]?.itemId === 'saddle'
        ? this.player.selectedHotbarIndex
        : this.player.inventory.findIndex((s) => s !== null && s.itemId === 'saddle');

    if (saddleSlotIdx === -1) {
      this.addFloatingText(
        'Você precisa de uma Sela de Montaria na mochila!',
        cr.x,
        cr.y - 20,
        '#f43f5e'
      );
      return false;
    }

    this.consumeInventoryAt(saddleSlotIdx, 1);
    cr.hasSaddle = true;
    this.ensureMountInventoryInitialized(cr);

    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
      this.multiplayer.sendGuestMountEvent({
        action: 'saddle',
        creatureId: cr.id,
        ownerId: this.getLocalOwnerId(),
        ownerName:
          this.multiplayer.localPlayerName ||
          this.settings.playerName ||
          'Aventureiro',
      });
    } else if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
      this.multiplayer.sendCreaturesSync(this.entities.creatures);
    }

    soundManager.playLevelUp();
    this.renderer.spawnBurst(cr.x, cr.y - 6, 'GOLD', 14);
    this.renderer.spawnRipple(cr.x, cr.y, '#fde047', 26, 0.5);
    this.addFloatingText(
      `鞍 Sela Equipada em ${cr.name}! (Montável + 8 Slots de Alforje)`,
      cr.x,
      cr.y - 24,
      '#fde047'
    );
    this.emitUiSnapshot();
    return true;
  }

  /**
   * Removes and collects the Saddle/Alforje (`'saddle'`) from a tamed Horse or Camel when the player interacts with it,
   * provided the player's inventory has enough space for the saddle and any items stored in its saddlebag.
   */
  public removeSaddleFromCreature(creatureId: string): boolean {
    const cr = this.entities.creatures.find(
      (c) =>
        c.id === creatureId &&
        c.tamed &&
        c.hasSaddle &&
        (c.kind === CreatureKind.HORSE || c.kind === CreatureKind.CAMEL)
    );
    if (!cr) return false;

    if (!this.isCreatureOwnedByLocalPlayer(cr)) {
      soundManager.playHitWood();
      this.addFloatingText(
        `🔒 Somente ${cr.ownerName || 'o dono'} pode retirar o alforje de ${cr.name}!`,
        cr.x,
        cr.y - 20,
        '#f43f5e'
      );
      return false;
    }

    if (
      this.player.mountedEntityId === cr.id ||
      this.isMountOccupiedByOtherPlayer(cr)
    ) {
      soundManager.playHitWood();
      this.addFloatingText(
        'Desmonte antes de retirar o alforje!',
        cr.x,
        cr.y - 20,
        '#f43f5e'
      );
      return false;
    }

    this.ensureMountInventoryInitialized(cr);
    const itemsToCollect: Array<{ itemId: string; count: number }> = [
      { itemId: 'saddle', count: 1 },
    ];
    for (const sl of cr.mountInventory!) {
      if (sl && sl.count > 0) {
        itemsToCollect.push({ itemId: sl.itemId, count: sl.count });
      }
    }

    // Simulate inventory capacity to ensure the saddle + any saddlebag items all fit in the player's inventory
    const simInv: (InventorySlot | null)[] = this.player.inventory.map((s) =>
      s ? { ...s } : null
    );
    const tryFitInSim = (itemId: string, count: number): boolean => {
      if (itemId === 'gold_coin') return true;
      const def = ITEMS[itemId];
      if (!def) return false;
      let rem = count;
      for (let i = 0; i < simInv.length && rem > 0; i++) {
        const s = simInv[i];
        if (s && s.itemId === itemId && s.count < def.maxStack) {
          const add = Math.min(rem, def.maxStack - s.count);
          s.count += add;
          rem -= add;
        }
      }
      for (let i = 0; i < simInv.length && rem > 0; i++) {
        if (simInv[i] === null) {
          const add = Math.min(rem, def.maxStack);
          simInv[i] = { itemId, count: add };
          rem -= add;
        }
      }
      return rem <= 0;
    };

    for (const entry of itemsToCollect) {
      if (!tryFitInSim(entry.itemId, entry.count)) {
        soundManager.playHitWood();
        this.addFloatingText(
          'Mochila sem espaço para recolher o alforje!',
          cr.x,
          cr.y - 20,
          '#f43f5e'
        );
        return false;
      }
    }

    for (const entry of itemsToCollect) {
      this.addItemToInventory(entry.itemId, entry.count);
    }
    cr.hasSaddle = false;
    cr.mountInventory = new Array(MOUNT_STORAGE_SIZE).fill(null);

    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
      this.multiplayer.sendGuestMountEvent({
        action: 'unsaddle',
        creatureId: cr.id,
        ownerId: this.getLocalOwnerId(),
      });
    } else if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
      this.multiplayer.sendCreaturesSync(this.entities.creatures);
    }

    void this.saveGame(true);
    soundManager.playPickup();
    this.renderer.spawnBurst(cr.x, cr.y - 6, 'GOLD', 10);
    this.addFloatingText(
      `鞍 Alforje retirado e guardado na mochila!`,
      cr.x,
      cr.y - 22,
      '#fde047'
    );
    this.emitUiSnapshot();
    return true;
  }

  public mountCreature(creatureId: string): boolean {
    const cr = this.entities.creatures.find((c) => c.id === creatureId && c.hp > 0);
    if (!cr) return false;

    const localRiderId = this.getLocalRiderId();

    if (cr.kind === CreatureKind.BOAT) {
      if (this.player.mountedEntityId) {
        this.dismountCreature();
      }
      // Check Boat 2-seat capacity
      const hasPrimaryRider =
        Boolean(
          cr.riderPlayerId &&
            cr.riderPlayerId !== 'LOCAL' &&
            cr.riderPlayerId !== localRiderId
        ) &&
        this.remotePlayersList.some((rp) => rp.mountedEntityId === cr.id);
      const hasSecondPlayer =
        Boolean(
          cr.passengerPlayerId &&
            cr.passengerPlayerId !== 'LOCAL' &&
            cr.passengerPlayerId !== localRiderId
        ) &&
        this.remotePlayersList.some((rp) => rp.mountedEntityId === cr.id);

      if (hasPrimaryRider && hasSecondPlayer) {
        this.addFloatingText(
          '⛵ O Bote já está com os 2 assentos ocupados!',
          cr.x,
          cr.y - 20,
          '#f43f5e'
        );
        return false;
      }

      const isPassenger = hasPrimaryRider;
      if (!hasPrimaryRider) {
        cr.riderPlayerId = localRiderId;
      } else {
        // Board 2nd seat as passenger! (Displace pet if one was in 2nd seat)
        cr.passengerPetId = null;
        cr.passengerPlayerId = localRiderId;
      }

      // If the 2nd seat is free and the player has a tamed pet currently following ('follow') that belongs to them, seat it in Seat 2!
      if (!cr.passengerPlayerId && !cr.passengerPetId) {
        const followingPet = this.entities.creatures.find(
          (p) =>
            p.id !== cr.id &&
            p.tamed &&
            p.kind !== CreatureKind.BOAT &&
            this.isCreatureOwnedByLocalPlayer(p) &&
            p.aiState === 'follow' &&
            Math.hypot(p.x - this.player.x, p.y - this.player.y) <= 170
        );
        if (followingPet) {
          cr.passengerPetId = followingPet.id;
          followingPet.x = cr.x;
          followingPet.y = cr.y;
          followingPet.vx = 0;
          followingPet.vy = 0;
        }
      }

      this.player.mountedEntityId = cr.id;
      this.player.isGalloping = false;
      this.player.x = cr.x;
      this.player.y = cr.y;
      this.syncPlayerMountedCreatureData();

      if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
        this.multiplayer.sendGuestMountEvent({
          action: 'mount',
          creatureId: cr.id,
          isPassenger,
          passengerPetId: cr.passengerPetId || null,
          creature: this.player.mountedCreatureData,
        });
        this.multiplayer.sendPlayerState(this.player);
      } else if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
        this.multiplayer.sendCreaturesSync(this.entities.creatures);
        this.multiplayer.sendPlayerState(this.player);
      }

      void this.saveGame(true);
      soundManager.playPickup();
      this.renderer.spawnRipple(cr.x, cr.y, '#38bdf8', 24, 0.4);
      this.addFloatingText(
        cr.passengerPetId
          ? '⛵ Embarcou no Bote com seu Pet! (2/2 Assentos)'
          : '⛵ Embarcou no Bote!',
        cr.x,
        cr.y - 20,
        '#38bdf8'
      );
      this.emitUiSnapshot();
      return true;
    }

    if (cr.kind === CreatureKind.HORSE || cr.kind === CreatureKind.CAMEL) {
      if (!cr.tamed) return false;

      // 1. Exclusive Owner Check: Only the owner of a Horse or Camel can mount it
      if (!this.isCreatureOwnedByLocalPlayer(cr)) {
        soundManager.playHitWood();
        this.renderer.spawnRipple(cr.x, cr.y, '#ef4444', 22, 0.35);
        this.addFloatingText(
          `🔒 ${cr.name} pertence exclusivamente a ${cr.ownerName || 'outro jogador'}!`,
          cr.x,
          cr.y - 22,
          '#f43f5e'
        );
        return false;
      }

      // 2. Strict Single-Seat Check: Horse and Camel only have 1 seat!
      if (this.isMountOccupiedByOtherPlayer(cr)) {
        soundManager.playHitWood();
        this.renderer.spawnRipple(cr.x, cr.y, '#ef4444', 22, 0.35);
        this.addFloatingText(
          `🔒 ${cr.name} já possui alguém montado (Apenas 1 Assento)!`,
          cr.x,
          cr.y - 22,
          '#f43f5e'
        );
        return false;
      }

      if (!cr.hasSaddle) {
        this.addFloatingText(
          `Equipe uma Sela em ${cr.name} para poder montar!`,
          cr.x,
          cr.y - 20,
          '#fde047'
        );
        return false;
      }

      if (this.player.mountedEntityId) {
        this.dismountCreature();
      }

      this.ensureMountInventoryInitialized(cr);
      cr.riderPlayerId = localRiderId;
      cr.passengerPlayerId = null;
      cr.passengerPetId = null;
      this.player.mountedEntityId = cr.id;
      this.player.isGalloping = false;
      this.player.x = cr.x;
      this.player.y = cr.y;
      this.syncPlayerMountedCreatureData();

      if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
        this.multiplayer.sendGuestMountEvent({
          action: 'mount',
          creatureId: cr.id,
          isPassenger: false,
          ownerId: this.getLocalOwnerId(),
          ownerName:
            this.multiplayer.localPlayerName ||
            this.settings.playerName ||
            'Aventureiro',
          creature: this.player.mountedCreatureData,
        });
        this.multiplayer.sendPlayerState(this.player);
      } else if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
        this.multiplayer.sendCreaturesSync(this.entities.creatures);
        this.multiplayer.sendPlayerState(this.player);
      }

      void this.saveGame(true);
      soundManager.playPickup();
      this.renderer.spawnRipple(cr.x, cr.y, '#fde047', 22, 0.4);
      this.addFloatingText(
        `Montou em ${cr.name} (1 Assento · Velocidade ${cr.mountSpeed})`,
        cr.x,
        cr.y - 22,
        '#fde047'
      );
      this.emitUiSnapshot();
      return true;
    }

    return false;
  }

  public dismountCreature(): void {
    const mount = this.getActiveMount();
    const localRiderId = this.getLocalRiderId();
    this.player.mountedEntityId = null;
    this.player.mountedCreatureData = null;
    this.player.isGalloping = false;
    if (!mount) {
      this.emitUiSnapshot();
      return;
    }

    if (
      mount.riderPlayerId === 'LOCAL' ||
      mount.riderPlayerId === localRiderId
    ) {
      mount.riderPlayerId = null;
    }
    if (
      mount.passengerPlayerId === 'LOCAL' ||
      mount.passengerPlayerId === localRiderId
    ) {
      mount.passengerPlayerId = null;
    }

    if (mount.kind === CreatureKind.BOAT) {
      // Try to step onto an adjacent dry land / beach tile if one is right next to the boat
      let exitPos = { x: mount.x, y: mount.y };
      const mTile = this.world.worldToTile(mount.x, mount.y);
      for (let r = 1; r <= 2; r++) {
        let foundLand = false;
        for (let dy = -r; dy <= r && !foundLand; dy++) {
          for (let dx = -r; dx <= r && !foundLand; dx++) {
            const tx = mTile.tx + dx;
            const ty = mTile.ty + dy;
            if (
              !this.world.isTileSwimmableWater(tx, ty) &&
              this.world.isTileWalkable(tx, ty, false)
            ) {
              exitPos = {
                x: tx * TILE_SIZE + TILE_SIZE * 0.5,
                y: ty * TILE_SIZE + TILE_SIZE * 0.5,
              };
              foundLand = true;
            }
          }
        }
        if (foundLand) break;
      }

      this.player.x = exitPos.x;
      this.player.y = exitPos.y;

      if (mount.passengerPetId) {
        const pet = this.entities.creatures.find(
          (p) => p.id === mount.passengerPetId
        );
        if (pet) {
          pet.x = exitPos.x + 12;
          pet.y = exitPos.y + 8;
        }
        mount.passengerPetId = null;
      }
      this.addFloatingText('Desembarcou do Bote', this.player.x, this.player.y - 20, '#38bdf8');
    } else {
      mount.vx = 0;
      mount.vy = 0;
      this.addFloatingText(
        `Desmontou de ${mount.name}`,
        this.player.x,
        this.player.y - 20,
        '#fde047'
      );
    }

    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
      this.multiplayer.sendGuestMountEvent({
        action: 'dismount',
        creatureId: mount.id,
        x: mount.x,
        y: mount.y,
      });
      this.multiplayer.sendPlayerState(this.player);
    } else if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
      this.multiplayer.sendCreaturesSync(this.entities.creatures);
      this.multiplayer.sendPlayerState(this.player);
    }

    void this.saveGame(true);
    soundManager.playPickup();
    this.emitUiSnapshot();
  }

  public pickupBoat(boatId: string): boolean {
    const idx = this.entities.creatures.findIndex(
      (c) => c.id === boatId && c.kind === CreatureKind.BOAT
    );
    if (idx === -1) return false;
    const boat = this.entities.creatures[idx];

    // Prevent picking up a boat while another player is still riding in it
    const otherPlayerOnBoat = this.remotePlayersList.some(
      (rp) => rp.mountedEntityId === boat.id
    );
    if (otherPlayerOnBoat) {
      soundManager.playHitWood();
      this.addFloatingText(
        '⛵ Há outro jogador no Bote! Aguarde ele desembarcar.',
        boat.x,
        boat.y - 20,
        '#f43f5e'
      );
      return false;
    }

    const boatPickupKey = `pickup_boat:${boat.id}`;
    if (!this.tryClaimWorldAction(boatPickupKey)) {
      return false;
    }

    if (this.player.mountedEntityId === boat.id) {
      this.dismountCreature();
    }
    boat.passengerPetId = null;
    this.entities.creatures.splice(idx, 1);
    if (!this.addItemToInventory('wood_boat', 1)) {
      this.spawnDrop('wood_boat', 1, this.player.x, this.player.y);
    }
    soundManager.playPickup();
    this.addFloatingText('+1 Bote de Madeira recolhido', this.player.x, this.player.y - 20, '#38bdf8');
    if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
      this.multiplayer.sendCreaturesSync(this.entities.creatures);
    } else if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
      this.multiplayer.sendGuestMountEvent({
        action: 'pickup_boat',
        creatureId: boat.id,
      });
    }
    this.emitUiSnapshot();
    return true;
  }

  public setGalloping(galloping: boolean): void {
    const mount = this.getActiveMount();
    if (
      !mount ||
      (mount.kind !== CreatureKind.HORSE && mount.kind !== CreatureKind.CAMEL)
    ) {
      this.player.isGalloping = false;
      return;
    }
    if (galloping && (mount.mountStamina ?? 100) <= 4) {
      this.player.isGalloping = false;
      this.addFloatingText('Sem fôlego para cavalgar!', this.player.x, this.player.y - 20, '#fb923c');
      return;
    }
    this.player.isGalloping = galloping;
    this.emitUiSnapshot();
  }

  public toggleGalloping(): void {
    this.setGalloping(!this.player.isGalloping);
  }

  public transferMountSlotToInventory(
    creatureId: string,
    mountSlotIndex: number,
    moveAll = true
  ): void {
    const cr = this.entities.creatures.find(
      (c) => c.id === creatureId && c.tamed && c.hasSaddle
    );
    if (!cr || !this.isCreatureOwnedByLocalPlayer(cr)) return;
    this.ensureMountInventoryInitialized(cr);
    const slot = cr.mountInventory![mountSlotIndex];
    if (!slot || slot.count <= 0) return;

    const amountToMove = moveAll ? slot.count : 1;
    let movedCount = 0;
    for (let i = 0; i < amountToMove; i++) {
      if (this.addItemToInventory(slot.itemId, 1)) {
        movedCount++;
      } else {
        break;
      }
    }

    if (movedCount > 0) {
      slot.count -= movedCount;
      if (slot.count <= 0) {
        cr.mountInventory![mountSlotIndex] = null;
      }
      this.syncPlayerMountedCreatureData();
      if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
        this.multiplayer.sendGuestMountEvent({
          action: 'mount_inventory',
          creatureId: cr.id,
          ownerId: this.getLocalOwnerId(),
          mountInventory: cr.mountInventory,
        });
      }
      void this.saveGame(true);
      soundManager.playPickup();
      this.emitUiSnapshot();
    } else {
      this.addFloatingText('Mochila cheia!', this.player.x, this.player.y - 20, '#f43f5e');
    }
  }

  public transferInventorySlotToMount(
    creatureId: string,
    playerSlotIndex: number,
    moveAll = true
  ): void {
    const cr = this.entities.creatures.find(
      (c) => c.id === creatureId && c.tamed && c.hasSaddle
    );
    if (!cr || !this.isCreatureOwnedByLocalPlayer(cr)) return;
    this.ensureMountInventoryInitialized(cr);
    const pSlot = this.player.inventory[playerSlotIndex];
    if (!pSlot || pSlot.count <= 0) return;

    const itemDef = ITEMS[pSlot.itemId];
    const maxStack = itemDef?.maxStack || 99;
    let remaining = moveAll ? pSlot.count : 1;
    let movedAny = false;

    for (let i = 0; i < MOUNT_STORAGE_SIZE && remaining > 0; i++) {
      const mSlot = cr.mountInventory![i];
      if (mSlot && mSlot.itemId === pSlot.itemId && mSlot.count < maxStack) {
        const add = Math.min(remaining, maxStack - mSlot.count);
        mSlot.count += add;
        pSlot.count -= add;
        remaining -= add;
        movedAny = true;
      }
    }

    for (let i = 0; i < MOUNT_STORAGE_SIZE && remaining > 0; i++) {
      if (!cr.mountInventory![i]) {
        const add = Math.min(remaining, maxStack);
        cr.mountInventory![i] = { itemId: pSlot.itemId, count: add };
        pSlot.count -= add;
        remaining -= add;
        movedAny = true;
      }
    }

    if (pSlot.count <= 0) {
      this.player.inventory[playerSlotIndex] = null;
    }

    if (movedAny) {
      this.syncPlayerMountedCreatureData();
      if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
        this.multiplayer.sendGuestMountEvent({
          action: 'mount_inventory',
          creatureId: cr.id,
          ownerId: this.getLocalOwnerId(),
          mountInventory: cr.mountInventory,
        });
      }
      void this.saveGame(true);
      soundManager.playPickup();
      this.emitUiSnapshot();
    } else {
      this.addFloatingText('Alforje cheio (8/8 Slots)!', this.player.x, this.player.y - 20, '#f43f5e');
    }
  }

  /**
   * Minecraft-style 2-click item move/swap across Mount Saddlebag (`mount`) and Player Inventory (`player`).
   */
  public moveOrSwapMountAndPlayerSlot(
    creatureId: string,
    source: { container: 'mount' | 'player'; index: number },
    dest: { container: 'mount' | 'player'; index: number }
  ): boolean {
    if (
      source.container === dest.container &&
      source.index === dest.index
    ) {
      return false;
    }

    const cr = this.entities.creatures.find(
      (c) => c.id === creatureId && c.tamed && c.hasSaddle
    );
    if (!cr || !this.isCreatureOwnedByLocalPlayer(cr)) return false;
    this.ensureMountInventoryInitialized(cr);
    const mountSlots = cr.mountInventory!;

    const getSlot = (
      loc: { container: 'mount' | 'player'; index: number }
    ): InventorySlot | null => {
      if (loc.container === 'mount') {
        if (loc.index < 0 || loc.index >= mountSlots.length) return null;
        return mountSlots[loc.index];
      }
      if (loc.index < 0 || loc.index >= this.player.inventory.length) {
        return null;
      }
      return this.player.inventory[loc.index];
    };

    const setSlot = (
      loc: { container: 'mount' | 'player'; index: number },
      val: InventorySlot | null
    ): void => {
      if (loc.container === 'mount') {
        if (loc.index >= 0 && loc.index < mountSlots.length) {
          mountSlots[loc.index] = val ? { ...val } : null;
        }
      } else {
        if (loc.index >= 0 && loc.index < this.player.inventory.length) {
          this.player.inventory[loc.index] = val ? { ...val } : null;
        }
      }
    };

    const srcSlot = getSlot(source);
    if (!srcSlot || srcSlot.count <= 0) return false;
    const dstSlot = getSlot(dest);

    if (dstSlot && dstSlot.itemId === srcSlot.itemId) {
      const maxStack = ITEMS[dstSlot.itemId]?.maxStack || 99;
      if (maxStack > 1 && dstSlot.count < maxStack) {
        const transfer = Math.min(srcSlot.count, maxStack - dstSlot.count);
        const newDstCount = dstSlot.count + transfer;
        const newSrcCount = srcSlot.count - transfer;
        setSlot(dest, { ...dstSlot, count: newDstCount });
        setSlot(
          source,
          newSrcCount > 0 ? { ...srcSlot, count: newSrcCount } : null
        );
        this.syncPlayerMountedCreatureData();
        if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
          this.multiplayer.sendGuestMountEvent({
            action: 'mount_inventory',
            creatureId: cr.id,
            ownerId: this.getLocalOwnerId(),
            mountInventory: cr.mountInventory,
          });
        } else if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
          this.multiplayer.sendCreaturesSync(this.entities.creatures);
        }
        void this.saveGame(true);
        soundManager.playPickup();
        this.emitUiSnapshot();
        return true;
      }
    }

    setSlot(source, dstSlot);
    setSlot(dest, srcSlot);

    this.syncPlayerMountedCreatureData();
    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
      this.multiplayer.sendGuestMountEvent({
        action: 'mount_inventory',
        creatureId: cr.id,
        ownerId: this.getLocalOwnerId(),
        mountInventory: cr.mountInventory,
      });
    } else if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
      this.multiplayer.sendCreaturesSync(this.entities.creatures);
    }
    void this.saveGame(true);
    soundManager.playPickup();
    this.emitUiSnapshot();
    return true;
  }

  /**
   * "Retirar Tudo" (Alforje): Withdraws all items from the mount's 8-slot saddlebag into the player's inventory.
   */
  public takeAllFromMount(creatureId: string): number {
    const cr = this.entities.creatures.find(
      (c) => c.id === creatureId && c.tamed && c.hasSaddle
    );
    if (!cr || !this.isCreatureOwnedByLocalPlayer(cr)) return 0;
    this.ensureMountInventoryInitialized(cr);
    const slots = cr.mountInventory!;

    let totalTaken = 0;
    for (let i = 0; i < slots.length; i++) {
      const mSlot = slots[i];
      if (!mSlot || mSlot.count <= 0) continue;
      let moved = 0;
      const count = mSlot.count;
      for (let k = 0; k < count; k++) {
        if (this.addItemToInventory(mSlot.itemId, 1)) {
          moved++;
        } else {
          break;
        }
      }
      if (moved > 0) {
        mSlot.count -= moved;
        totalTaken += moved;
        if (mSlot.count <= 0) {
          slots[i] = null;
        }
      }
    }

    if (totalTaken > 0) {
      this.syncPlayerMountedCreatureData();
      if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
        this.multiplayer.sendGuestMountEvent({
          action: 'mount_inventory',
          creatureId: cr.id,
          ownerId: this.getLocalOwnerId(),
          mountInventory: cr.mountInventory,
        });
      } else if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
        this.multiplayer.sendCreaturesSync(this.entities.creatures);
      }
      void this.saveGame(true);
      soundManager.playCraft();
      this.addFloatingText(
        `Retirado do Alforje (${totalTaken} itens)`,
        this.player.x,
        this.player.y - 22,
        '#fde047'
      );
      this.emitUiSnapshot();
    }
    return totalTaken;
  }

  /**
   * "Guardar Tudo" (Alforje): Deposits items from the player's backpack (and non-tool hotbar items) into the mount's 8-slot saddlebag.
   */
  public depositAllToMount(creatureId: string): number {
    const cr = this.entities.creatures.find(
      (c) => c.id === creatureId && c.tamed && c.hasSaddle
    );
    if (!cr || !this.isCreatureOwnedByLocalPlayer(cr)) return 0;
    this.ensureMountInventoryInitialized(cr);
    const slots = cr.mountInventory!;

    let totalMoved = 0;
    const depositFromIndex = (idx: number) => {
      const pSlot = this.player.inventory[idx];
      if (!pSlot || pSlot.count <= 0) return;
      const moved = this.addItemToChestStorage(slots, pSlot.itemId, pSlot.count);
      if (moved > 0) {
        this.consumeInventoryAt(idx, moved);
        totalMoved += moved;
      }
    };

    // 1. Backpack slots (8..31)
    for (let i = HOTBAR_SIZE; i < this.player.inventory.length; i++) {
      depositFromIndex(i);
    }
    // 2. Non-tool/non-weapon hotbar slots (0..7)
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const pSlot = this.player.inventory[i];
      if (!pSlot || pSlot.count <= 0) continue;
      const def = ITEMS[pSlot.itemId];
      if (
        def &&
        (def.category === ItemCategory.TOOL ||
          def.category === ItemCategory.WEAPON)
      ) {
        continue;
      }
      depositFromIndex(i);
    }

    if (totalMoved > 0) {
      this.syncPlayerMountedCreatureData();
      if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
        this.multiplayer.sendGuestMountEvent({
          action: 'mount_inventory',
          creatureId: cr.id,
          ownerId: this.getLocalOwnerId(),
          mountInventory: cr.mountInventory,
        });
      } else if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
        this.multiplayer.sendCreaturesSync(this.entities.creatures);
      }
      void this.saveGame(true);
      soundManager.playCraft();
      this.addFloatingText(
        `Guardado no Alforje (${totalMoved} itens)`,
        this.player.x,
        this.player.y - 22,
        '#38bdf8'
      );
      this.emitUiSnapshot();
    }
    return totalMoved;
  }

  /**
   * "Organizar" (Alforje): Merges partial stacks and sorts items in the mount's 8-slot saddlebag.
   */
  public sortMountStorage(creatureId: string): void {
    const cr = this.entities.creatures.find(
      (c) => c.id === creatureId && c.tamed && c.hasSaddle
    );
    if (!cr || !this.isCreatureOwnedByLocalPlayer(cr)) return;
    this.ensureMountInventoryInitialized(cr);
    const slots = cr.mountInventory!;

    const totals = new Map<string, number>();
    for (const sl of slots) {
      if (sl && sl.count > 0) {
        totals.set(sl.itemId, (totals.get(sl.itemId) || 0) + sl.count);
      }
    }

    const catOrder: Record<ItemCategory, number> = {
      [ItemCategory.WEAPON]: 1,
      [ItemCategory.TOOL]: 2,
      [ItemCategory.ARMOR]: 3,
      [ItemCategory.CONSUMABLE]: 4,
      [ItemCategory.PLACEABLE]: 5,
      [ItemCategory.RESOURCE]: 6,
    };

    const sortedIds = Array.from(totals.keys()).sort((a, b) => {
      const da = ITEMS[a];
      const db = ITEMS[b];
      if (!da || !db) return a.localeCompare(b);
      const ca = catOrder[da.category] ?? 99;
      const cb = catOrder[db.category] ?? 99;
      if (ca !== cb) return ca - cb;
      return da.name.localeCompare(db.name, 'pt-BR');
    });

    const newSlots: (InventorySlot | null)[] = new Array(MOUNT_STORAGE_SIZE).fill(
      null
    );
    let writeIdx = 0;
    for (const itemId of sortedIds) {
      const def = ITEMS[itemId];
      const maxStack = def?.maxStack || 99;
      let rem = totals.get(itemId) || 0;
      while (rem > 0 && writeIdx < MOUNT_STORAGE_SIZE) {
        const take = Math.min(maxStack, rem);
        newSlots[writeIdx++] = { itemId, count: take };
        rem -= take;
      }
    }

    cr.mountInventory = newSlots;
    this.syncPlayerMountedCreatureData();
    if (this.multiplayer.isOnline && this.multiplayer.role === 'GUEST') {
      this.multiplayer.sendGuestMountEvent({
        action: 'mount_inventory',
        creatureId: cr.id,
        ownerId: this.getLocalOwnerId(),
        mountInventory: cr.mountInventory,
      });
    } else if (this.multiplayer.isOnline && this.multiplayer.role === 'HOST') {
      this.multiplayer.sendCreaturesSync(this.entities.creatures);
    }
    void this.saveGame(true);
    soundManager.playPickup();
    this.emitUiSnapshot();
  }

  // =========================================================================
  // ONLINE MULTIPLAYER & ATOMIC WORLD INTERACTION RESOLUTION
  // =========================================================================

  /**
   * Executed on the HOST when a Guest requests an atomic world interaction
   * (picking up a ground drop, looting a DeathBag, locking a harvested object, or withdrawing from a shared container).
   */
  private handleWorldInteractRequestOnHost(peerId: string, request: any): void {
    if (!request || typeof request.action !== 'string') return;

    switch (request.action) {
      case 'pickup_drop_claim': {
        const dropId = String(request.dropId || '');
        if (!dropId) return;
        const idx = this.droppedItems.findIndex((d) => d.id === dropId);
        if (idx === -1 || this.claimedDropIds.has(dropId)) {
          this.multiplayer.sendWorldInteractResolved({
            action: 'pickup_drop_resolved',
            dropId,
            winnerPeerId: null,
            targetPeerId: peerId,
          });
          return;
        }
        const drop = this.droppedItems[idx];
        this.claimedDropIds.add(dropId);
        this.droppedItems.splice(idx, 1);
        this.renderer.spawnBurst(drop.x, drop.y, 'GOLD', 4);
        this.multiplayer.sendPickupDrop(dropId);
        this.multiplayer.sendWorldInteractResolved({
          action: 'pickup_drop_resolved',
          dropId,
          winnerPeerId: peerId,
          itemId: drop.itemId,
          count: drop.count,
          x: drop.x,
          y: drop.y,
        });
        this.emitUiSnapshot();
        break;
      }

      case 'spawn_death_bag': {
        if (request.bag && request.bag.id) {
          if (!this.deathBags.some((b) => b.id === request.bag.id)) {
            this.deathBags.push(request.bag);
            this.multiplayer.sendDeathBagsSync(this.deathBags);
            this.emitUiSnapshot();
          }
        }
        break;
      }

      case 'loot_death_bag_claim': {
        const bagId = String(request.bagId || '');
        if (!bagId || this.claimedDeathBagIds.has(bagId)) {
          this.multiplayer.sendWorldInteractResolved({
            action: 'loot_death_bag_resolved',
            bagId,
            winnerPeerId: null,
            targetPeerId: peerId,
          });
          return;
        }
        const idx = this.deathBags.findIndex((b) => b.id === bagId);
        if (idx === -1) {
          this.multiplayer.sendWorldInteractResolved({
            action: 'loot_death_bag_resolved',
            bagId,
            winnerPeerId: null,
            targetPeerId: peerId,
          });
          return;
        }
        const bag = this.deathBags[idx];
        if (bag.claimedBy && bag.claimedBy !== peerId) {
          this.multiplayer.sendWorldInteractResolved({
            action: 'loot_death_bag_resolved',
            bagId,
            winnerPeerId: null,
            targetPeerId: peerId,
          });
          return;
        }
        this.claimedDeathBagIds.add(bagId);
        this.deathBags.splice(idx, 1);
        this.multiplayer.sendDeathBagsSync(this.deathBags);
        this.multiplayer.sendWorldInteractResolved({
          action: 'loot_death_bag_resolved',
          bagId,
          winnerPeerId: peerId,
          bag,
        });
        this.emitUiSnapshot();
        break;
      }

      case 'loot_death_bag_partial_return': {
        if (request.bag && request.bag.id) {
          this.claimedDeathBagIds.delete(request.bag.id);
          const existingIdx = this.deathBags.findIndex(
            (b) => b.id === request.bag.id
          );
          if (existingIdx !== -1) {
            this.deathBags[existingIdx] = request.bag;
          } else {
            this.deathBags.push(request.bag);
          }
          this.multiplayer.sendDeathBagsSync(this.deathBags);
          this.emitUiSnapshot();
        }
        break;
      }

      case 'world_action_lock': {
        const actionKey = String(request.actionKey || '');
        if (!actionKey) return;
        this.claimedWorldActionKeys.set(actionKey, Date.now() + 3500);
        this.multiplayer.sendWorldInteractResolved({
          action: 'world_action_lock',
          actionKey,
        });
        break;
      }

      case 'container_withdraw': {
        const containerKind = String(request.containerKind || '');
        const structureId = String(request.structureId || '');
        const slotIndex = Number(request.slotIndex ?? -1);
        const requestedCount = Number(request.count ?? 1);

        if (containerKind === 'chest') {
          const chest = this.getChestById(structureId);
          const slots = chest ? this.ensureChestStorageInitialized(chest) : null;
          const slot = slots && slotIndex >= 0 ? slots[slotIndex] : null;
          if (!chest || !slots || !slot || slot.count <= 0) {
            this.multiplayer.sendWorldInteractResolved({
              action: 'container_withdraw_resolved',
              containerKind,
              structureId,
              slotIndex,
              winnerPeerId: null,
              targetPeerId: peerId,
            });
            return;
          }
          const takeCount = Math.max(1, Math.min(slot.count, requestedCount));
          const itemId = slot.itemId;
          slot.count -= takeCount;
          if (slot.count <= 0) {
            slots[slotIndex] = null;
          }
          this.syncChunkAtTile(chest.tileX, chest.tileY);
          this.multiplayer.sendWorldInteractResolved({
            action: 'container_withdraw_resolved',
            containerKind,
            structureId,
            slotIndex,
            winnerPeerId: peerId,
            itemId,
            count: takeCount,
            targetPlayerSlotIdx: request.targetPlayerSlotIdx,
          });
          this.emitUiSnapshot();
        } else if (containerKind === 'stall') {
          const stall = this.getMarketStallById(structureId);
          const slots = stall
            ? this.ensureMarketStallInitialized(stall)
            : null;
          const slot = slots && slotIndex >= 0 ? slots[slotIndex] : null;
          if (!stall || !slots || !slot || slot.count <= 0) {
            this.multiplayer.sendWorldInteractResolved({
              action: 'container_withdraw_resolved',
              containerKind,
              structureId,
              slotIndex,
              winnerPeerId: null,
              targetPeerId: peerId,
            });
            return;
          }
          const takeCount = Math.max(1, Math.min(slot.count, requestedCount));
          const itemId = slot.itemId;
          slot.count -= takeCount;
          if (slot.count <= 0) {
            slots[slotIndex] = null;
            if (
              stall.pendingCustomerOffer &&
              stall.pendingCustomerOffer.slotIndex === slotIndex
            ) {
              stall.pendingCustomerOffer = null;
            }
          } else if (
            stall.pendingCustomerOffer &&
            stall.pendingCustomerOffer.slotIndex === slotIndex &&
            stall.pendingCustomerOffer.quantity > slot.count
          ) {
            stall.pendingCustomerOffer.quantity = slot.count;
            stall.pendingCustomerOffer.totalPrice =
              slot.count * stall.pendingCustomerOffer.unitPrice;
          }
          this.syncChunkAtTile(stall.tileX, stall.tileY);
          this.multiplayer.sendWorldInteractResolved({
            action: 'container_withdraw_resolved',
            containerKind,
            structureId,
            slotIndex,
            winnerPeerId: peerId,
            itemId,
            count: takeCount,
          });
          this.emitUiSnapshot();
        } else if (
          containerKind === 'thermal_fuel' ||
          containerKind === 'thermal_queue' ||
          containerKind === 'thermal_output'
        ) {
          let foundSt: PlacedStructure | null = null;
          for (const ch of Object.values(this.world.chunks)) {
            const s = ch.structures.find((item) => item.id === structureId);
            if (s) {
              foundSt = s;
              break;
            }
          }
          if (!foundSt) {
            this.multiplayer.sendWorldInteractResolved({
              action: 'container_withdraw_resolved',
              containerKind,
              structureId,
              winnerPeerId: null,
              targetPeerId: peerId,
            });
            return;
          }

          if (containerKind === 'thermal_fuel') {
            if (!foundSt.fuelItemId || (foundSt.fuelCount || 0) <= 0) {
              this.multiplayer.sendWorldInteractResolved({
                action: 'container_withdraw_resolved',
                containerKind,
                structureId,
                winnerPeerId: null,
                targetPeerId: peerId,
              });
              return;
            }
            const itemId = foundSt.fuelItemId;
            const count = foundSt.fuelCount || 0;
            foundSt.fuelItemId = null;
            foundSt.fuelCount = 0;
            this.syncChunkAtTile(foundSt.tileX, foundSt.tileY);
            this.multiplayer.sendWorldInteractResolved({
              action: 'container_withdraw_resolved',
              containerKind,
              structureId,
              winnerPeerId: peerId,
              items: [{ itemId, count }],
            });
            this.emitUiSnapshot();
          } else if (containerKind === 'thermal_output') {
            if (!foundSt.outputItemId || (foundSt.outputCount || 0) <= 0) {
              this.multiplayer.sendWorldInteractResolved({
                action: 'container_withdraw_resolved',
                containerKind,
                structureId,
                winnerPeerId: null,
                targetPeerId: peerId,
              });
              return;
            }
            const itemId = foundSt.outputItemId;
            const count = foundSt.outputCount || 0;
            foundSt.outputItemId = null;
            foundSt.outputCount = 0;
            this.syncChunkAtTile(foundSt.tileX, foundSt.tileY);
            this.multiplayer.sendWorldInteractResolved({
              action: 'container_withdraw_resolved',
              containerKind,
              structureId,
              winnerPeerId: peerId,
              items: [{ itemId, count }],
            });
            this.emitUiSnapshot();
          } else if (containerKind === 'thermal_queue') {
            if (
              !foundSt.cookingRecipeId ||
              (foundSt.cookingInputCount || 0) <= 0
            ) {
              this.multiplayer.sendWorldInteractResolved({
                action: 'container_withdraw_resolved',
                containerKind,
                structureId,
                winnerPeerId: null,
                targetPeerId: peerId,
              });
              return;
            }
            const recipe = RECIPES.find(
              (r) => r.id === foundSt!.cookingRecipeId
            );
            const batches = foundSt.cookingInputCount || 0;
            foundSt.cookingRecipeId = null;
            foundSt.cookingInputCount = 0;
            foundSt.cookingProgress = 0;
            const refundedItems: { itemId: string; count: number }[] = [];
            if (recipe) {
              for (const ing of recipe.ingredients) {
                refundedItems.push({
                  itemId: ing.itemId,
                  count: ing.count * batches,
                });
              }
            }
            this.syncChunkAtTile(foundSt.tileX, foundSt.tileY);
            this.multiplayer.sendWorldInteractResolved({
              action: 'container_withdraw_resolved',
              containerKind,
              structureId,
              winnerPeerId: peerId,
              items: refundedItems,
            });
            this.emitUiSnapshot();
          }
        }
        break;
      }
    }
  }

  /**
   * Executed on Guests (and Host) when an atomic world interaction is resolved by the Host.
   */
  private handleWorldInteractResolved(result: any): void {
    if (!result || typeof result.action !== 'string') return;
    const myPeerId = this.multiplayer.peerId;

    switch (result.action) {
      case 'pickup_drop_resolved': {
        const dropId = String(result.dropId || '');
        this.pendingDropClaimTimers.delete(dropId);
        if (result.winnerPeerId) {
          this.claimedDropIds.add(dropId);
          const idx = this.droppedItems.findIndex((d) => d.id === dropId);
          if (idx !== -1) {
            this.droppedItems.splice(idx, 1);
          }
        }
        if (result.winnerPeerId === myPeerId && result.itemId && result.count) {
          const added = this.addItemToInventory(result.itemId, result.count);
          if (added) {
            soundManager.playPickup();
            this.renderer.spawnBurst(
              result.x ?? this.player.x,
              result.y ?? this.player.y,
              'GOLD',
              5
            );
            const itemDef = ITEMS[result.itemId];
            this.addFloatingText(
              `+${result.count} ${itemDef ? itemDef.name : result.itemId}`,
              this.player.x,
              this.player.y - 18,
              '#4ade80'
            );
            this.emitUiSnapshot();
          } else {
            this.spawnDrop(
              result.itemId,
              result.count,
              this.player.x,
              this.player.y
            );
          }
        }
        break;
      }

      case 'loot_death_bag_resolved': {
        const bagId = String(result.bagId || '');
        this.pendingDeathBagClaims.delete(bagId);
        if (result.winnerPeerId === myPeerId && result.bag) {
          // Ensure bag is present locally and execute recovery
          const existingIdx = this.deathBags.findIndex((b) => b.id === bagId);
          if (existingIdx === -1) {
            this.deathBags.push(result.bag);
          } else {
            this.deathBags[existingIdx] = result.bag;
          }
          this.claimedDeathBagIds.delete(bagId);
          this.executeLocalLootDeathBag(bagId);
          // If some items didn't fit in the Guest's inventory, sync the leftover bag back to Host
          const leftover = this.deathBags.find((b) => b.id === bagId);
          if (leftover && (leftover.items.length > 0 || leftover.goldCoins > 0)) {
            this.multiplayer.sendWorldInteractRequest({
              action: 'loot_death_bag_partial_return',
              bag: leftover,
            });
          }
        } else if (result.winnerPeerId && result.winnerPeerId !== myPeerId) {
          this.claimedDeathBagIds.add(bagId);
          const idx = this.deathBags.findIndex((b) => b.id === bagId);
          if (idx !== -1) {
            this.deathBags.splice(idx, 1);
            this.emitUiSnapshot();
          }
        }
        break;
      }

      case 'world_action_lock': {
        if (result.actionKey) {
          this.claimedWorldActionKeys.set(
            String(result.actionKey),
            Date.now() + 3500
          );
        }
        break;
      }

      case 'force_dismount': {
        if (
          result.targetPeerId === myPeerId &&
          this.player.mountedEntityId === result.creatureId
        ) {
          this.player.mountedEntityId = null;
          this.player.mountedCreatureData = null;
          this.player.isGalloping = false;
          if (result.reason) {
            this.addFloatingText(
              String(result.reason),
              this.player.x,
              this.player.y - 24,
              '#f43f5e'
            );
          }
          this.multiplayer.sendPlayerState(this.player);
          this.emitUiSnapshot();
        }
        break;
      }

      case 'container_withdraw_resolved': {
        const containerKind = String(result.containerKind || '');
        const structureId = String(result.structureId || '');
        const slotIndex = Number(result.slotIndex ?? -1);
        if (containerKind === 'chest' || containerKind === 'stall') {
          this.pendingContainerWithdraws.delete(
            `${containerKind}:${structureId}:${slotIndex}`
          );
        } else {
          this.pendingContainerWithdraws.delete(
            `${containerKind}:${structureId}`
          );
        }

        if (result.winnerPeerId === myPeerId) {
          if (Array.isArray(result.items)) {
            for (const entry of result.items) {
              if (!entry || !entry.itemId || entry.count <= 0) continue;
              if (!this.addItemToInventory(entry.itemId, entry.count)) {
                this.spawnDrop(
                  entry.itemId,
                  entry.count,
                  this.player.x,
                  this.player.y
                );
              }
            }
            soundManager.playPickup();
            this.emitUiSnapshot();
          } else if (result.itemId && result.count > 0) {
            if (!this.addItemToInventory(result.itemId, result.count)) {
              this.spawnDrop(
                result.itemId,
                result.count,
                this.player.x,
                this.player.y
              );
            }
            soundManager.playPickup();
            this.emitUiSnapshot();
          }
        }
        break;
      }
    }
  }

  private bindMultiplayerCallbacks(): void {
    this.multiplayer.setCallbacks({
      onSessionChanged: () => {
        this.remotePlayersList = Array.from(
          this.multiplayer.remotePlayers.values()
        );
        this.reconcileRemotePlayerMounts();
        this.syncPauseState();
        this.emitUiSnapshot();
      },
      onRemotePlayersChanged: () => {
        this.remotePlayersList = Array.from(
          this.multiplayer.remotePlayers.values()
        );
        this.reconcileRemotePlayerMounts();
        this.syncPauseState();
        this.emitUiSnapshot();
      },
      onPeerLeft: (peerId) => {
        this.handleRemotePeerLeft(peerId);
      },
      onGuestMountEventReceived: (peerId, event) => {
        this.handleGuestMountEvent(peerId, event);
      },
      onWorldInteractRequestReceived: (peerId, request) => {
        this.handleWorldInteractRequestOnHost(peerId, request);
      },
      onWorldInteractResolvedReceived: (result) => {
        this.handleWorldInteractResolved(result);
      },
      onDeathBagsSyncReceived: (bags) => {
        if (Array.isArray(bags)) {
          this.deathBags = bags;
          this.emitUiSnapshot();
        }
      },
      onRequestHostSnapshot: () => {
        return this.buildSaveData();
      },
      onWorldSnapshotReceived: (snapshot) => {
        if (!snapshot) return;
        if (snapshot.metadata) {
          this.metadata.timeOfDay = snapshot.metadata.timeOfDay;
          this.metadata.dayCount = snapshot.metadata.dayCount;
        }
        if (snapshot.chunks) {
          for (const [key, ch] of Object.entries(snapshot.chunks)) {
            if (ch) {
              this.world.chunks[key] = this.world.hydrateChunk(ch);
            }
          }
        }
        if (Array.isArray(snapshot.creatures)) {
          this.entities.creatures = snapshot.creatures;
        }
        if (Array.isArray(snapshot.droppedItems)) {
          this.droppedItems = snapshot.droppedItems;
        }
        if (Array.isArray(snapshot.deathBags)) {
          this.deathBags = snapshot.deathBags;
        }
        // Keep the player's integrated mount restored after a snapshot sync
        this.restoreIntegratedPlayerMount();
        this.reconcileRemotePlayerMounts();
        this.pushPlayerOutOfHitbox(0, true);
        this.emitUiSnapshot();
      },
      onChunkSyncReceived: (chunkKey, chunkData) => {
        if (!chunkKey || !chunkData) return;
        this.world.chunks[chunkKey] = this.world.hydrateChunk(chunkData);
        if (!this.canEntityOccupy(this.player.x, this.player.y)) {
          this.pushPlayerOutOfHitbox(0.05, false);
        }
        this.emitUiSnapshot();
      },
      onSpawnDropReceived: (drop) => {
        if (!drop || !drop.id || this.claimedDropIds.has(drop.id)) return;
        if (!this.droppedItems.some((d) => d.id === drop.id)) {
          this.droppedItems.push(drop);
        }
      },
      onPickupDropReceived: (dropId) => {
        this.claimedDropIds.add(dropId);
        this.pendingDropClaimTimers.delete(dropId);
        const idx = this.droppedItems.findIndex((d) => d.id === dropId);
        if (idx !== -1) {
          const drop = this.droppedItems[idx];
          this.renderer.spawnBurst(drop.x, drop.y, 'GOLD', 4);
          this.droppedItems.splice(idx, 1);
        }
      },
      onDropsSyncReceived: (drops) => {
        this.droppedItems = drops.filter((d) => !this.claimedDropIds.has(d.id));
      },
      onCreaturesSyncReceived: (incomingCreatures) => {
        if (!Array.isArray(incomingCreatures)) return;
        const existingMap = new Map<string, CreatureEntity>();
        for (const c of this.entities.creatures) {
          existingMap.set(c.id, c);
        }
        const getDefaultFavFoods = (kind: CreatureKind): string[] => {
          if (kind === CreatureKind.SHEEP) return ['berry', 'coconut', 'taming_treat'];
          if (kind === CreatureKind.BOAR) return ['apple', 'coconut', 'taming_treat'];
          if (kind === CreatureKind.CAMEL) return ['cactus_fruit', 'coconut', 'taming_treat'];
          if (kind === CreatureKind.HORSE) return ['apple', 'taming_treat'];
          if (kind === CreatureKind.VILLAGER || kind === CreatureKind.WANDERER) {
            return ['gold_coin', 'apple', 'solar_crystal', 'warrior_feast'];
          }
          return [];
        };

        const merged: CreatureEntity[] = [];
        for (const inc of incomingCreatures) {
          const prev = existingMap.get(inc.id);
          const restoredTrades =
            Array.isArray(inc.trades) && inc.trades.length > 0
              ? inc.trades
              : prev?.trades && prev.trades.length > 0
              ? prev.trades
              : inc.kind === CreatureKind.VILLAGER || inc.kind === CreatureKind.WANDERER
              ? EntityManager.getDefaultTradesForRole(
                  inc.npcRole || (inc.kind === CreatureKind.WANDERER ? 'andarilho' : 'mercador')
                )
              : undefined;
          const restoredFavFoods =
            Array.isArray(inc.favoriteFoodIds) && inc.favoriteFoodIds.length > 0
              ? inc.favoriteFoodIds
              : prev?.favoriteFoodIds && prev.favoriteFoodIds.length > 0
              ? prev.favoriteFoodIds
              : getDefaultFavFoods(inc.kind);

          // If this creature is the local player's active mount, keep local player's position & stamina authoritative
          if (this.player.mountedEntityId === inc.id) {
            merged.push({
              ...(prev || inc),
              ...inc,
              x: this.player.x,
              y: this.player.y,
              direction: this.player.direction,
              ownerId: inc.ownerId || prev?.ownerId || null,
              ownerName: inc.ownerName || prev?.ownerName || null,
              mountStamina:
                prev?.mountStamina !== undefined
                  ? prev.mountStamina
                  : inc.mountStamina,
              mountInventory:
                prev?.mountInventory && prev.mountInventory.length > 0
                  ? prev.mountInventory
                  : inc.mountInventory,
              trades: restoredTrades,
              favoriteFoodIds: restoredFavFoods,
            });
            continue;
          }

          if (prev) {
            const dist = Math.hypot(inc.x - prev.x, inc.y - prev.y);
            const smoothX =
              dist > 64 || dist < 1 ? inc.x : prev.x + (inc.x - prev.x) * 0.45;
            const smoothY =
              dist > 64 || dist < 1 ? inc.y : prev.y + (inc.y - prev.y) * 0.45;
            merged.push({
              ...prev,
              ...inc,
              x: smoothX,
              y: smoothY,
              ownerId: inc.ownerId || prev.ownerId || null,
              ownerName: inc.ownerName || prev.ownerName || null,
              trades: restoredTrades,
              favoriteFoodIds: restoredFavFoods,
              animFrame: prev.animFrame,
              animTimer: prev.animTimer,
              hitFlashTimer: Math.max(prev.hitFlashTimer || 0, inc.hitFlashTimer || 0),
            });
          } else {
            merged.push({
              ...inc,
              trades: restoredTrades,
              favoriteFoodIds: restoredFavFoods,
            });
          }
        }
        this.entities.creatures = merged;
        // Ensure local player's integrated mount and remote players' mounts are never lost during sync
        this.restoreIntegratedPlayerMount();
        this.reconcileRemotePlayerMounts();
      },
      onCreatureHitReceived: (
        creatureId,
        damage,
        sourceX,
        sourceY,
        knockbackMult
      ) => {
        const target = this.entities.creatures.find(
          (c) => c.id === creatureId && c.hp > 0
        );
        if (!target) return;
        this.damageCreature(
          target,
          damage,
          sourceX,
          sourceY,
          knockbackMult,
          undefined,
          true
        );
      },
      onTimeSyncReceived: (timeOfDay, dayCount) => {
        if (typeof timeOfDay === 'number') {
          this.metadata.timeOfDay = timeOfDay;
        }
        if (typeof dayCount === 'number') {
          this.metadata.dayCount = dayCount;
        }
      },
      onPlayerEventNotification: (text, color = '#38bdf8') => {
        this.addFloatingText(
          text,
          this.player.x,
          this.player.y - 28,
          color
        );
      },
      onRoomClosedByHost: (reason) => {
        if (this.onHostClosedRoom) {
          this.onHostClosedRoom(reason);
        }
      },
    });
  }

  /**
   * Opens this world for online multiplayer and generates a unique 6-char Invite Code
   * valid for as long as the player keeps this world open.
   */
  public async openOnlineInviteSession(
    preferredCode?: string,
    notifyInWorld = false
  ): Promise<void> {
    if (this.multiplayer.role === 'GUEST') return;
    if (this.multiplayer.activationState === 'ACTIVATING') return;
    this.emitUiSnapshot();
    const ok = await this.multiplayer.hostWorld(
      this.buildSaveData(),
      this.player,
      preferredCode
    );
    if (ok && notifyInWorld && this.multiplayer.inviteCode) {
      this.addFloatingText(
        `🌐 Mundo Online! Código: ${this.multiplayer.inviteCode}`,
        this.player.x,
        this.player.y - 24,
        '#4ade80'
      );
    }
    this.emitUiSnapshot();
  }

  /**
   * Closes the active online invite code while staying in the world in single-player mode.
   */
  public closeOnlineInviteSession(): void {
    if (this.multiplayer.role === 'GUEST') return;
    this.multiplayer.disconnect(true);
    this.remotePlayersList = [];
    this.addFloatingText(
      '🔒 Sessão online encerrada (Modo Offline)',
      this.player.x,
      this.player.y - 24,
      '#fbbf24'
    );
    this.emitUiSnapshot();
  }

  public toggleOnlineSession(): void {
    if (this.multiplayer.role === 'GUEST') return;
    if (this.multiplayer.activationState === 'ACTIVATING') return;
    if (this.multiplayer.isOnline) {
      this.closeOnlineInviteSession();
    } else {
      void this.openOnlineInviteSession(undefined, true);
    }
  }

  public regenerateInviteCode(): void {
    if (this.multiplayer.role === 'GUEST') return;
    if (this.multiplayer.activationState === 'ACTIVATING') return;
    this.multiplayer.inviteCode = null;
    void this.openOnlineInviteSession('', true);
  }

  public updateMultiplayerPlayerName(newName: string): void {
    const clean = newName.trim().slice(0, 22) || 'Aventureiro';
    this.settings.playerName = clean;
    SaveManager.saveSettings(this.settings);
    this.multiplayer.updateLocalPlayerName(clean, this.player);
    this.emitUiSnapshot();
  }

  public sendMultiplayerChat(text: string): void {
    const clean = text.trim().slice(0, 80);
    if (!clean) return;
    this.multiplayer.sendChatMessage(clean);
    this.addFloatingText(
      `💬 ${this.multiplayer.localPlayerName}: ${clean}`,
      this.player.x,
      this.player.y - 26,
      '#fde047'
    );
  }

  public syncChunkAtTile(tx: number, ty: number): void {
    if (!this.multiplayer.isOnline || this.isApplyingNetworkEvent) return;
    const { cx, cy } = this.world.tileToChunk(tx, ty);
    const key = WorldManager.chunkKey(cx, cy);
    const chunk = this.world.chunks[key];
    if (chunk) {
      this.multiplayer.sendChunkSync(key, chunk);
    }
  }

  public forceMultiplayerResync(): void {
    if (!this.multiplayer.isOnline) return;
    this.multiplayer.forceResyncNow();
    this.addFloatingText(
      '🔄 Ressincronizando estado do mundo...',
      this.player.x,
      this.player.y - 26,
      '#38bdf8'
    );
    this.emitUiSnapshot();
  }

  private updateMultiplayerSync(dt: number): void {
    if (!this.multiplayer.isOnline) return;

    // 1. Smoothly interpolate remote players & advance their walk/swing animations
    for (const rp of this.multiplayer.remotePlayers.values()) {
      const dx = rp.targetX - rp.x;
      const dy = rp.targetY - rp.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.25) {
        const lerpFactor = Math.min(1, dt * 14);
        rp.x += dx * lerpFactor;
        rp.y += dy * lerpFactor;
      } else {
        rp.x = rp.targetX;
        rp.y = rp.targetY;
      }

      if (rp.isMoving) {
        rp.animTimer += dt;
        if (rp.animTimer >= 0.14) {
          rp.animTimer = 0;
          rp.animFrame = (rp.animFrame + 1) % 4;
        }
      } else {
        rp.animFrame = 0;
      }

      if (rp.swingTimer > 0) {
        rp.swingTimer = Math.max(0, rp.swingTimer - dt);
      }
      if (rp.hitFlashTimer > 0) {
        rp.hitFlashTimer = Math.max(0, rp.hitFlashTimer - dt);
      }
      if (rp.chatTimer && rp.chatTimer > 0) {
        rp.chatTimer = Math.max(0, rp.chatTimer - dt);
        if (rp.chatTimer <= 0) {
          rp.chatMessage = undefined;
        }
      }

      // Reveal fog of war around allied remote players too
      if (rp.isMoving) {
        this.revealWorldAndPopulateIslands(rp.x, rp.y, 10);
      }
    }

    // Keep remote player mounts locked to their riders' interpolated positions
    this.reconcileRemotePlayerMounts();

    // 2. Periodically broadcast local player state
    this.netStateTimer += dt;
    const sendInterval =
      this.player.isMoving || this.player.swingTimer > 0 ? 0.065 : 0.4;
    if (this.netStateTimer >= sendInterval) {
      this.netStateTimer = 0;
      this.syncPlayerMountedCreatureData();
      this.multiplayer.sendPlayerState(this.player);
    }

    // 3. If HOST and guests are connected, broadcast creature positions & timeOfDay
    if (
      this.multiplayer.role === 'HOST' &&
      this.multiplayer.remotePlayers.size > 0
    ) {
      this.netCreaturesTimer += dt;
      if (this.netCreaturesTimer >= 0.14) {
        this.netCreaturesTimer = 0;
        this.multiplayer.sendCreaturesSync(this.entities.creatures);
      }

      this.netTimeSyncTimer += dt;
      if (this.netTimeSyncTimer >= 2.0) {
        this.netTimeSyncTimer = 0;
        this.multiplayer.sendTimeSync(
          this.metadata.timeOfDay,
          this.metadata.dayCount
        );
        this.multiplayer.sendDropsSync(this.droppedItems);
      }
    }
  }

  private updateGuestCreatures(dt: number): void {
    for (const cr of this.entities.creatures) {
      if (!cr || cr.hp <= 0 || cr.isInsideHouse) continue;
      if (
        cr.id === this.player.mountedEntityId ||
        this.remotePlayersList.some((rp) => rp.mountedEntityId === cr.id)
      ) {
        continue;
      }
      if (cr.hitFlashTimer > 0) {
        cr.hitFlashTimer = Math.max(0, cr.hitFlashTimer - dt);
      }
      if (cr.attackTimer > 0) {
        cr.attackTimer = Math.max(0, cr.attackTimer - dt);
      }
      if (cr.attackCooldown > 0) {
        cr.attackCooldown = Math.max(0, cr.attackCooldown - dt);
      }

      const speed = Math.hypot(cr.vx, cr.vy);
      if (speed > 2) {
        const nx = cr.x + cr.vx * dt;
        const ny = cr.y + cr.vy * dt;
        if (this.canEntityOccupy(nx, ny)) {
          cr.x = nx;
          cr.y = ny;
        }
        cr.animTimer += dt;
        if (cr.animTimer >= 0.16) {
          cr.animTimer = 0;
          cr.animFrame = (cr.animFrame + 1) % 4;
        }
      } else {
        cr.animFrame = 0;
      }
      cr.isSwimming = this.world.isWorldPosInWater(cr.x, cr.y);

      // Hostile monsters near the Guest can still deal melee contact damage to the Guest
      if (
        (EntityManager.isMonsterKind(cr.kind) || cr.isHostile) &&
        !cr.tamed &&
        Math.hypot(this.player.x - cr.x, this.player.y - cr.y) <= 26 &&
        cr.attackCooldown <= 0
      ) {
        cr.attackCooldown = 1.15;
        cr.attackTimer = 0.28;
        this.damagePlayer(cr.attackDamage, cr.x, cr.y, cr);
      }
    }
  }

  public buildSaveData(): WorldSaveData {
    this.syncPlayerMountedCreatureData();
    this.metadata.updatedAt = Date.now();
    this.metadata.playerLevel = this.player.level;
    this.metadata.exploredChunksCount = this.world.getExploredChunksCount();
    this.metadata.gameVersion = GAME_VERSION;
    return {
      version: CURRENT_SAVE_VERSION,
      metadata: { ...this.metadata },
      player: JSON.parse(JSON.stringify(this.player)),
      chunks: this.world.chunks,
      creatures: this.entities.creatures,
      droppedItems: this.droppedItems,
      waypoints: this.waypoints,
      deathBags: this.deathBags,
    };
  }

  public async saveGame(isAuto = false): Promise<void> {
    this.syncPlayerMountedCreatureData();
    if (this.multiplayer.role === 'GUEST') {
      try {
        localStorage.setItem(
          `wildborn_guest_player_${this.metadata.id}`,
          JSON.stringify(this.player)
        );
        this.lastSaveStatus = 'Herói Salvo (Convidado)';
      } catch {
        this.lastSaveStatus = 'Online (Convidado)';
      }
      this.emitUiSnapshot();
      return;
    }

    const data = this.buildSaveData();
    const okLocal = SaveManager.saveWorldLocal(data);
    if (this.settings.serverSyncEnabled) {
      const serverRes = await SaveManager.syncWorldToServer(data, this.settings);
      this.lastSaveStatus = serverRes.ok
        ? isAuto
          ? 'Auto-salvo (v2)'
          : 'Salvo no Servidor'
        : okLocal
        ? 'Salvo Localmente'
        : 'Erro ao salvar';
    } else {
      this.lastSaveStatus = okLocal ? 'Salvo Localmente' : 'Erro ao salvar';
    }
    this.emitUiSnapshot();
  }

  public updateSettings(newSettings: GameSettings): void {
    this.settings = { ...newSettings };
    soundManager.enabled = newSettings.soundEnabled;
    soundManager.volume = newSettings.soundVolume;
    soundManager.setMusicVolume(newSettings.musicVolume ?? 0.2);
    this.camera.zoom = newSettings.cameraZoom;
    if (
      newSettings.playerName &&
      newSettings.playerName !== this.multiplayer.localPlayerName
    ) {
      this.multiplayer.updateLocalPlayerName(newSettings.playerName, this.player);
    }
    const revealRad = Math.max(10, Math.min(20, Math.round(13 / Math.max(0.55, this.camera.zoom))));
    this.world.revealAround(this.player.x, this.player.y, revealRad);
    SaveManager.saveSettings(this.settings);
    this.emitUiSnapshot();
  }

  public getHudSnapshot(): HudSnapshot {
    const pTile = this.world.worldToTile(this.player.x, this.player.y);
    const pChunk = this.world.tileToChunk(pTile.tx, pTile.ty);
    const chunk = this.world.chunks[WorldManager.chunkKey(pChunk.cx, pChunk.cy)];
    const zone = this.world.getEcologicalZoneAtTile(pTile.tx, pTile.ty);

    // Build dynamic map markers for any active Death Bags (they exist on the map while the bag exists)
    const deathBagWaypoints: MapWaypoint[] = this.deathBags.map((bag) => {
      const remSec = Math.max(0, Math.ceil(bag.expiresTimer));
      const mm = String(Math.floor(remSec / 60)).padStart(2, '0');
      const ss = String(remSec % 60).padStart(2, '0');
      return {
        id: `death_bag_wp_${bag.id}`,
        label: `🎒 Bolsinha (${mm}:${ss})`,
        tileX: Math.floor(bag.x / TILE_SIZE),
        tileY: Math.floor(bag.y / TILE_SIZE),
        color: '#f43f5e',
        isDeathBag: true,
        expiresTimer: bag.expiresTimer,
      };
    });

    return {
      metadata: { ...this.metadata },
      player: this.player,
      currentBiome: this.world.getBiomeAtWorld(this.player.x, this.player.y),
      currentZoneName: ECOLOGICAL_ZONE_LABELS[zone] || 'Fronteira',
      currentLandmarkName: chunk?.landmarkName || null,
      nearbyStations: this.getNearbyStations(),
      aimedTarget: this.getAimedTarget(),
      nearbyWildAnimal: this.getNearbyWildAnimal(),
      nearbyTamedAnimal: this.getNearbyTamedAnimal(),
      activeMount: this.getActiveMount(),
      tamedAnimals: this.entities.creatures.filter(
        (c) =>
          c.tamed &&
          c.kind !== CreatureKind.BOAT &&
          this.isCreatureOwnedByLocalPlayer(c)
      ),
      waypoints: [...deathBagWaypoints, ...this.waypoints],
      deathBags: this.deathBags,
      isPaused: this.isPaused,
      canPause: !this.hasConnectedNetworkPlayers(),
      isGameOver: this.isGameOver,
      lastSaveStatus: this.lastSaveStatus,
      buildDemolishMode: this.buildDemolishMode,
      buildOrientation: this.buildOrientation,
      showHitboxPreview: this.showHitboxPreview,
      innocentFireEnabled: this.innocentFireEnabled,
      onlineSession: this.multiplayer.getSessionInfo(),
      remotePlayers: this.remotePlayersList,
    };
  }

  public emitUiSnapshot(): void {
    if (this.onUiChange) {
      this.onUiChange(this.getHudSnapshot());
    }
  }
}
