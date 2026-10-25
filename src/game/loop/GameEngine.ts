import {
  CONSTRUCTION_BLUEPRINTS,
  evaluateMaterialBreak,
  evaluateStallPriceDeal,
  getItemBasePrice,
  getNatureBreakRequirement,
  getStructureBreakRequirement,
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
  public isGameOver = false;
  public lastSaveStatus = 'Salvo';
  public buildDemolishMode = false;
  public buildOrientation: 'auto' | 'horizontal' | 'vertical' = 'auto';
  public showHitboxPreview = false;
  public innocentFireEnabled = false;
  private preferredTargetCreatureId: string | null = null;

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
  private customTargetTile: { tx: number; ty: number } | null = null;
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
      this.metadata.worldGenVersion ?? 1
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

    soundManager.enabled = settings.soundEnabled;
    soundManager.volume = settings.soundVolume;

    const initialReveal = Math.max(
      10,
      Math.min(20, Math.round(13 / Math.max(0.55, this.camera.zoom)))
    );
    this.world.revealAround(this.player.x, this.player.y, initialReveal);
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
      this.emitUiSnapshot();
    }
  }

  private loop = (timestamp: number): void => {
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const dt = Math.min(0.1, Math.max(0.001, rawDt));

    this.syncPauseState();

    if (!this.isPaused && !this.isGameOver) {
      this.update(dt);
    } else if (this.isPaused && this.multiplayer.isOnline) {
      // Keep network heartbeats alive if needed
      this.updateMultiplayerSync(dt);
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

    const agilityMult = 1 + (this.player.attributes.agility - 1) * 0.06;
    const equipSpeedMult = 1 + this.getTotalEquipmentSpeedBonus();
    const camelMult = hasCamelBuff ? 1.18 : 1.0;
    const playerSwimSpeed =
      (this.player.swimSpeed || 58) *
      agilityMult *
      equipSpeedMult *
      speedBuffMult;
    const normalLandSpeed =
      96 * agilityMult * equipSpeedMult * camelMult * floorMult * speedBuffMult;

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
        this.world.revealAround(this.player.x, this.player.y, revealRad);
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
          this.world.revealAround(this.player.x, this.player.y, revealRad);
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
      1 - (this.player.attributes.survival - 1) * 0.08
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
      const regenRate =
        (nearWarmth ? 2.5 : 0.6) +
        (nearFountain ? 5.0 : 0) +
        (nearSheep ? 1.0 : 0);
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + dt * regenRate);
    } else if (this.player.hunger <= 0) {
      this.player.hp = Math.max(0, this.player.hp - dt * 1.5);
      if (this.player.hp <= 0) {
        this.handlePlayerDeath();
      }
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
    this.world.revealAround(this.player.x, this.player.y, revealRad);
  }

  /**
   * Checks whether a placed structure counts as a valid House/Dwelling that can house up to 2 Villagers.
   * Supports:
   * - Village Houses (both generated in villages and crafted/placed by the player)
   * - Explorer Tents (placed by the player or in camps)
   * - Player-built walled houses (a Wood Door or Iron Gate connected to adjacent walls/windows)
   */
  public isStructureValidHouse(st: PlacedStructure): boolean {
    if (
      st.type === PlaceableType.VILLAGE_HOUSE ||
      st.type === PlaceableType.EXPLORER_TENT
    ) {
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
   * Returns all living Villagers currently registered as residents of a specific House structure (`max 2`).
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
   * Ensures legacy Village Houses without explicit `homeHouseId` bindings link up to 2 nearby unbound villagers,
   * and releases house slots automatically if a resident villager dies or its house is dismantled.
   */
  private syncVillageHouseAssignments(): void {
    const validHouseIds = new Set<string>();
    const allHouses: PlacedStructure[] = [];

    for (const chunk of Object.values(this.world.chunks)) {
      if (!chunk) continue;
      for (const st of chunk.structures) {
        if (this.isStructureValidHouse(st)) {
          validHouseIds.add(st.id);
          allHouses.push(st);
        }
      }
    }

    // Clear homeHouseId if a player dismantled that house
    for (const cr of this.entities.creatures) {
      if (cr.homeHouseId && !validHouseIds.has(cr.homeHouseId)) {
        cr.homeHouseId = undefined;
        cr.isInsideHouse = false;
        cr.outsideNightTimer = 0;
      }
    }

    // Bind unbound village NPCs to their nearest village house (up to 2 per house)
    for (const cr of this.entities.creatures) {
      if (
        cr.kind === CreatureKind.VILLAGER &&
        cr.hp > 0 &&
        !cr.homeHouseId
      ) {
        let bestHouse: PlacedStructure | null = null;
        let bestDist = 190;
        for (const h of allHouses) {
          if (this.getHouseResidents(h.id).length >= MAX_VILLAGERS_PER_HOUSE) {
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
        }
      }
    }

    // Ensure all existing Villagers and Wanderers have their trade offers synchronized with the rebalanced suggested item prices
    for (const cr of this.entities.creatures) {
      if (
        (cr.kind === CreatureKind.VILLAGER ||
          cr.kind === CreatureKind.WANDERER) &&
        cr.hp > 0
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

        if (st.ownerType === 'VILLAGER' && !st.ownerId) {
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
      }
    }
  }

  /**
   * Checks whether a villager-owned Market Stall still has a living Villager owner.
   * If the villager owner died, returns false so the player can claim the stall.
   */
  public isVillagerStallOwnerAlive(stall: PlacedStructure): boolean {
    if (stall.ownerType !== 'VILLAGER') return false;
    if (stall.ownerId) {
      return this.entities.creatures.some(
        (c) =>
          c.id === stall.ownerId &&
          c.kind === CreatureKind.VILLAGER &&
          c.hp > 0
      );
    }
    if (stall.villageId) {
      return this.entities.creatures.some(
        (c) =>
          c.kind === CreatureKind.VILLAGER &&
          c.villageId === stall.villageId &&
          c.hp > 0
      );
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
          if (!this.isStructureValidHouse(st)) continue;
          const residents = this.getHouseResidents(st.id).length;
          if (residents >= MAX_VILLAGERS_PER_HOUSE) continue;

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
   * Settles a Wanderer NPC into a specific House (max 2 villagers per house), converting them into a Villager.
   */
  public settleWandererIntoHouse(
    wanderer: CreatureEntity,
    house: PlacedStructure
  ): boolean {
    if (wanderer.kind !== CreatureKind.WANDERER) return false;
    const currentResidents = this.getHouseResidents(house.id).length;
    if (currentResidents >= MAX_VILLAGERS_PER_HOUSE) return false;

    const hx = house.tileX * TILE_SIZE + TILE_SIZE / 2;
    const hy = house.tileY * TILE_SIZE + TILE_SIZE / 2;
    this.entities.convertWandererToVillager(
      wanderer,
      house.id,
      hx,
      hy,
      house.villageId
    );
    const newCount = this.getHouseResidents(house.id).length;

    soundManager.playTameSuccess();
    this.renderer.spawnBurst(wanderer.x, wanderer.y - 6, 'GOLD', 16);
    this.renderer.spawnBurst(hx, hy - 6, 'TAME', 12);
    this.renderer.spawnRipple(hx, hy, '#4ade80', 30, 0.55);
    this.addFloatingText(
      `🏠 ${wanderer.name} virou Aldeão! (${newCount}/${MAX_VILLAGERS_PER_HOUSE} na Casa)`,
      wanderer.x,
      wanderer.y - 24,
      '#4ade80'
    );
    this.emitUiSnapshot();
    return true;
  }

  /**
   * Brings a Villager out of their house onto a valid passable tile in front of the entrance.
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

    const baseX = cr.homeX ?? cr.x;
    const baseY = cr.homeY ?? cr.y;
    const spreadX = slotIndex === 0 ? -8 : 8;
    const candidateOffsets: [number, number][] = [
      [spreadX, 24],
      [0, 26],
      [22, 16],
      [-22, 16],
      [spreadX, -24],
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

  private updateCreatures(dt: number): void {
    this.syncVillageHouseAssignments();
    const isSunsetOrNight =
      this.metadata.timeOfDay >= 17.5 || this.metadata.timeOfDay < 5.5;

    for (let i = this.entities.creatures.length - 1; i >= 0; i--) {
      const cr = this.entities.creatures[i];
      if (!cr || cr.hp <= 0) continue;

      // If Villager is currently inside their house:
      // - Stay invisible/safe inside until dawn (05:30), or until the player knocks on the door.
      // - At dawn, automatically step outside to resume daily village life!
      if (cr.isInsideHouse) {
        if (!isSunsetOrNight) {
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

      const distToPlayer = Math.hypot(this.player.x - cr.x, this.player.y - cr.y);

      // =====================================================================
      // 1. FACTION: PLAYER_ALLY (Tamed Pets)
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

        let enemyTarget: CreatureEntity | null = null;
        if (
          (cr.kind === CreatureKind.BOAR || cr.kind === CreatureKind.CAMEL) &&
          cr.aiState !== 'stay'
        ) {
          let bestDist = 185;
          for (const other of this.entities.creatures) {
            if (
              other.id !== cr.id &&
              other.hp > 0 &&
              !other.isInsideHouse &&
              (EntityManager.isMonsterKind(other.kind) || other.isHostile)
            ) {
              const d = Math.hypot(other.x - cr.x, other.y - cr.y);
              if (d < bestDist) {
                bestDist = d;
                enemyTarget = other;
              }
            }
          }
        }
        if (!enemyTarget && retaliateTarget && cr.attackDamage > 0) {
          enemyTarget = retaliateTarget;
        }

        if (enemyTarget) {
          const dx = enemyTarget.x - cr.x;
          const dy = enemyTarget.y - cr.y;
          const dist = Math.max(1, Math.hypot(dx, dy));
          if (dist > 25) {
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
              cr.attackCooldown = 1.1;
              cr.attackTimer = 0.25;
              this.damageCreature(
                enemyTarget,
                cr.attackDamage,
                cr.x,
                cr.y,
                1.0,
                cr
              );
            }
          }
        } else if (cr.aiState === 'follow') {
          // If pet got stranded very far away (e.g. across water/cliffs), bring it to a clear spot near player
          if (distToPlayer > 440) {
            const telePos = this.findClearSpotNear(this.player.x, this.player.y, 36);
            cr.x = telePos.x;
            cr.y = telePos.y;
            cr.vx = 0;
            cr.vy = 0;
          } else if (distToPlayer > 54) {
            // Smooth arrival speed as the pet gets close to the player
            const arrivalFactor = Math.min(1.3, Math.max(0.55, (distToPlayer - 44) / 55));
            this.steerCreatureToward(
              cr,
              this.player.x,
              this.player.y,
              cr.moveSpeed * arrivalFactor,
              dt,
              false
            );
          } else {
            // Smoothly decelerate to rest beside player
            cr.vx *= Math.max(0, 1 - dt * 10);
            cr.vy *= Math.max(0, 1 - dt * 10);
            if (Math.hypot(cr.vx, cr.vy) < 2) {
              cr.vx = 0;
              cr.vy = 0;
            }
          }
        } else {
          cr.vx = 0;
          cr.vy = 0;
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
                this.damagePlayer(cr.attackDamage, cr.x, cr.y);
              }
            }
          }
        } else if (cr.kind === CreatureKind.WANDERER) {
          // PRIORITY 3 (Wanderer): Look for an available House (village or player-built, < 2 villagers)
          const availableHouse = this.findAvailableHouseNear(cr.x, cr.y, 235);
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
            if (!isSunsetOrNight && this.updateNpcMarketStallShopping(cr, dt)) {
              // Wanderer is currently inspecting or waiting at a Player Market Stall
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
          const isRivalCreature =
            other.kind === CreatureKind.VILLAGER ||
            other.kind === CreatureKind.WANDERER ||
            other.tamed ||
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
                this.damagePlayer(dmg, cr.x, cr.y);
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
      // 4. FACTION: WILDLIFE (Peaceful Animals: Sheep, Boar, Camel)
      //    - Retaliates if attacked (Boar/Camel) or flees from Monsters (Sheep)
      // =====================================================================
      else {
        if (retaliateTarget && cr.attackDamage > 0) {
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
      if (
        this.world.isWorldPosInWater(this.player.x, this.player.y) ||
        Math.hypot(this.player.x - cr.x, this.player.y - cr.y) > 90
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
      if (d > 0.1 && d < 20) {
        const push = ((20 - d) / 20) * activeSpeed * 0.55;
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

    if (cr.homeX === undefined || cr.homeY === undefined) {
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

    if (distHome <= 26) {
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
        `🏠 ${cr.name} entrou em casa`,
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

  private updateDroppedItems(dt: number): void {
    for (let i = this.droppedItems.length - 1; i >= 0; i--) {
      const drop = this.droppedItems[i];
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
        const added = this.addItemToInventory(drop.itemId, drop.count);
        if (added) {
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
        this.emitUiSnapshot();
      }
    }
  }

  private updateWorldObjects(dt: number): void {
    // Advance moisture evaporation and crop growth stages in loaded chunks
    this.world.updateAgriculture(dt, false);

    const pTile = this.world.worldToTile(this.player.x, this.player.y);
    const pChunk = this.world.tileToChunk(pTile.tx, pTile.ty);

    this.totemZapTimer += dt;
    const canZap = this.totemZapTimer >= 1.8;
    if (canZap) this.totemZapTimer = 0;

    this.spikeTrapTimer += dt;
    const canSpike = this.spikeTrapTimer >= 0.85;
    if (canSpike) this.spikeTrapTimer = 0;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = WorldManager.chunkKey(pChunk.cx + dx, pChunk.cy + dy);
        const chunk = this.world.chunks[key];
        if (!chunk) continue;

        for (const node of chunk.nodes) {
          if (node.hitFlashTimer > 0) {
            node.hitFlashTimer = Math.max(0, node.hitFlashTimer - dt);
          }
        }

        for (const st of chunk.structures) {
          if (st.hitFlashTimer > 0) {
            st.hitFlashTimer = Math.max(0, st.hitFlashTimer - dt);
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

    const agilitySpeed = 1 + (this.player.attributes.agility - 1) * 0.06;
    this.player.swingDuration = Math.max(0.16, 0.28 / agilitySpeed);
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
      (1 + (this.player.attributes.strength - 1) * 0.12) * strengthBuff;
    const baseAttack = (heldItem?.attackDamage || 8) * strengthMult;
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

    const targetsToHit =
      hostileTargetsInArc.length > 0
        ? hostileTargetsInArc
        : neutralFaunaInArc.length > 0
        ? neutralFaunaInArc
        : this.innocentFireEnabled
        ? peacefulNpcsInArc
        : [];

    if (targetsToHit.length > 0) {
      for (const cr of targetsToHit) {
        this.damageCreature(
          cr,
          Math.round(baseAttack),
          this.player.x,
          this.player.y,
          knockbackMult
        );
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

    if (
      equippedTool === ToolType.WATERING_CAN ||
      heldItem?.id === 'watering_can' ||
      heldItem?.id === 'watering_can_full'
    ) {
      const tile = this.world.worldToTile(hitCenterX, hitCenterY);
      const isWaterTile =
        this.world.computeBiomeAtTile(tile.tx, tile.ty) === BiomeType.OCEAN;
      const structAtTile = this.world.getStructureAtTile(tile.tx, tile.ty);
      const isWaterSource =
        structAtTile?.type === PlaceableType.VILLAGE_WELL ||
        structAtTile?.type === PlaceableType.HEALING_FOUNTAIN;

      // Refill watering can if hitting water or well/fountain
      if (isWaterTile || isWaterSource) {
        this.player.inventory[this.player.selectedHotbarIndex] = {
          itemId: 'watering_can_full',
          count: 1,
        };
        soundManager.playTameSuccess();
        this.renderer.spawnBurst(hitCenterX, hitCenterY, 'WATER', 14);
        this.renderer.spawnRipple(hitCenterX, hitCenterY, '#38bdf8', 26, 0.45);
        this.addFloatingText(
          'Regador Enchido! (12 Cargas de Água)',
          this.player.x,
          this.player.y - 20,
          '#38bdf8'
        );
        this.emitUiSnapshot();
        return;
      }

      // Irrigate Tilled Soil
      const { cx, cy } = this.world.tileToChunk(tile.tx, tile.ty);
      const chunk = this.world.chunks[WorldManager.chunkKey(cx, cy)];
      const soilSt = chunk?.structures.find(
        (s) =>
          s.tileX === tile.tx &&
          s.tileY === tile.ty &&
          s.type === PlaceableType.TILLED_SOIL
      );

      if (soilSt) {
        if (heldItem?.id === 'watering_can') {
          this.addFloatingText(
            'Regador vazio! Encha em um lago, mar ou poço',
            this.player.x,
            this.player.y - 20,
            '#38bdf8'
          );
          return;
        }

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
        return;
      }
    }

    // B2. Check Nature Nodes & Dismantling Structures in hit arc
    const pChunk = this.world.tileToChunk(
      Math.floor(hitCenterX / TILE_SIZE),
      Math.floor(hitCenterY / TILE_SIZE)
    );

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.world.getOrCreateChunk(pChunk.cx + dx, pChunk.cy + dy);

        for (let ni = chunk.nodes.length - 1; ni >= 0; ni--) {
          const node = chunk.nodes[ni];
          const nx = node.tileX * TILE_SIZE + TILE_SIZE / 2;
          const ny = node.tileY * TILE_SIZE + TILE_SIZE / 2;
          if (Math.hypot(nx - hitCenterX, ny - hitCenterY) <= reach * 0.82) {
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
          const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
          const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
          if (Math.hypot(sx - hitCenterX, sy - hitCenterY) <= reach * 0.72) {
            const isWorldFixedLandmark = Boolean(
              (st.villageId || st.id.startsWith('world_struct_')) &&
                (st.type === PlaceableType.VILLAGE_HOUSE ||
                  st.type === PlaceableType.VILLAGE_WELL ||
                  st.type === PlaceableType.HEALING_FOUNTAIN)
            );
            if (isWorldFixedLandmark) {
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
              soundManager.playHitStone();
              this.addFloatingText(
                evalBreak.blockReason || req.requirementLabel,
                sx,
                sy - 16,
                '#f43f5e'
              );
              return;
            }

            const structDmg = evalBreak.force;
            st.hp -= structDmg;
            st.hitFlashTimer = 0.15;
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

            if (st.villageId) {
              this.provokeVillage(
                st.villageId,
                null,
                35,
                '⚔ Vandalismo! A vila se voltou contra você!'
              );
            }
            if (st.hp <= 0) {
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
              }
              this.spawnDrop(st.itemId, 1, sx, sy);
              chunk.structures.splice(si, 1);
              this.emitUiSnapshot();
            }
            this.syncChunkAtTile(st.tileX, st.tileY);
            return;
          }
        }
      }
    }

    if (blockedPeacefulNpc) {
      this.addFloatingText(
        '🛡️ Aliado Protegido (Fogo Inocente OFF)',
        blockedPeacefulNpc.x,
        blockedPeacefulNpc.y - 24,
        '#38bdf8'
      );
    }
  }

  /**
   * BUTTON 2: BOTÃO DE INTERAÇÃO — Interage com aquilo que está sendo mirado (Bancada, Fornalha, Altar, Fogueira, Animal ou Recurso)
   */
  public performInteractAction(): void {
    if (this.isPaused || this.isGameOver) return;

    const target = this.getAimedTarget();
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
            const insideResidents = this.getHouseResidents(doorSt.id).filter(
              (r) => r.isInsideHouse
            );
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
        this.setPlayerRespawnPoint(
          target.worldX,
          target.worldY,
          'Fogueira de Acampamento'
        );
        const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];
        if (
          heldSlot &&
          (heldSlot.itemId === 'fish_tilapia' || heldSlot.itemId === 'fish_salmon')
        ) {
          const rawName = ITEMS[heldSlot.itemId]?.name || 'Peixe';
          const cookedYield = heldSlot.itemId === 'fish_salmon' ? 2 : 1;
          heldSlot.count -= 1;
          if (heldSlot.count <= 0) {
            this.player.inventory[this.player.selectedHotbarIndex] = null;
          }
          if (!this.addItemToInventory('cooked_fish', cookedYield)) {
            this.spawnDrop(
              'cooked_fish',
              cookedYield,
              this.player.x,
              this.player.y,
              0.3
            );
          }
          soundManager.playCraft();
          this.renderer.spawnBurst(target.worldX, target.worldY - 4, 'SPARK', 10);
          this.addFloatingText(
            `Assou ${rawName} (+${cookedYield}x Peixe Assado) · Ponto de Renascimento salvo!`,
            target.worldX,
            target.worldY - 20,
            '#fde047'
          );
          this.emitUiSnapshot();
          return;
        }

        if (this.campfireRestCooldown <= 0) {
          this.campfireRestCooldown = 8;
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 18);
          this.player.stamina = this.player.maxStamina;
          soundManager.playTameSuccess();
          this.renderer.spawnBurst(target.worldX, target.worldY - 4, 'SPARK', 12);
          this.renderer.spawnBurst(this.player.x, this.player.y, 'HEAL', 10);
          this.renderer.spawnRipple(this.player.x, this.player.y, '#fde047', 26, 0.5);
          this.addFloatingText(
            'Aquecido na Fogueira (+18 HP / Energia Cheia) · Ponto de Renascimento salvo!',
            this.player.x,
            this.player.y - 22,
            '#fde047'
          );
          this.emitUiSnapshot();
        } else {
          this.addFloatingText(
            `⛺ Ponto de Renascimento definido na Fogueira (aguarde ${Math.ceil(this.campfireRestCooldown)}s para curar)`,
            target.worldX,
            target.worldY - 18,
            '#fb923c'
          );
          this.emitUiSnapshot();
        }
        return;
      }

      if (
        target.stationType === PlaceableType.EXPLORER_TENT ||
        target.stationType === PlaceableType.VILLAGE_HOUSE
      ) {
        const { tx, ty } = this.world.worldToTile(target.worldX, target.worldY);
        const houseSt = this.world.getStructureAtTile(tx, ty);
        if (houseSt) {
          const insideResidents = this.getHouseResidents(houseSt.id).filter(
            (r) => r.isInsideHouse
          );
          // If residents are currently inside this house, knocking on the door calls them outside to interact!
          if (insideResidents.length > 0) {
            this.knockOnHouseDoor(houseSt, insideResidents);
            return;
          }
        }

        const restLabel =
          target.stationType === PlaceableType.VILLAGE_HOUSE
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
        wild.aiState = 'follow';
        wild.hp = wild.maxHp;
        soundManager.playTameSuccess();
        this.renderer.spawnBurst(wild.x, wild.y - 6, 'TAME', 16);
        this.renderer.spawnRipple(wild.x, wild.y, '#f43f5e', 28, 0.55);
        this.addFloatingText(
          `♥ ${wild.name} Domesticado!`,
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
        });
      }
      this.emitUiSnapshot();
      return;
    }

    // 3. Interacting with a Tamed Animal or Boat
    if (target.kind === 'tamed_animal' && target.creatureId) {
      const tamed = this.entities.creatures.find((c) => c.id === target.creatureId);
      if (!tamed) return;

      // 3A. Boat: Mount or Dismount
      if (tamed.kind === CreatureKind.BOAT) {
        if (this.player.mountedEntityId === tamed.id) {
          this.dismountCreature();
        } else {
          this.mountCreature(tamed.id);
        }
        return;
      }

      // 3B. Horse or Camel: If holding a Saddle and unsaddled, equip the Saddle!
      const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];
      if (
        (tamed.kind === CreatureKind.HORSE || tamed.kind === CreatureKind.CAMEL) &&
        !tamed.hasSaddle &&
        heldSlot &&
        heldSlot.itemId === 'saddle'
      ) {
        this.equipSaddleOnCreature(tamed.id);
        return;
      }

      // 3C. Saddled Horse or Camel: Mount or Dismount!
      if (
        (tamed.kind === CreatureKind.HORSE || tamed.kind === CreatureKind.CAMEL) &&
        tamed.hasSaddle
      ) {
        if (this.player.mountedEntityId === tamed.id) {
          this.dismountCreature();
        } else {
          this.mountCreature(tamed.id);
        }
        return;
      }

      // 3D. Unsaddled Horse/Camel or Sheep/Boar: Standard Tamed Animal Follow/Stay interaction
      tamed.aiState = tamed.aiState === 'stay' ? 'follow' : 'stay';
      soundManager.playPickup();
      this.addFloatingText(
        tamed.aiState === 'stay' ? 'Guardando Base' : 'Seguindo Você',
        tamed.x,
        tamed.y - 20,
        '#fde047'
      );
      this.emitUiSnapshot();
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

    // 0B. Organic Bone Fertilizer application
    if (heldItem.id === 'bone_fertilizer') {
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

      if (!soilSt || !soilSt.cropType) {
        this.addFloatingText(
          'Use o adubo em um solo com planta em crescimento',
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
          `${heldItem.name} construído!`,
          target.tx * TILE_SIZE + 16,
          target.ty * TILE_SIZE,
          '#4ade80'
        );
        this.syncChunkAtTile(target.tx, target.ty);
        this.emitUiSnapshot();
      } else {
        this.addFloatingText(
          'Local obstruído ou camada ocupada',
          this.player.x,
          this.player.y - 20,
          '#f43f5e'
        );
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

    // 4. Saddle: Equip on nearby tamed Horse or Camel
    if (heldItem.id === 'saddle') {
      const nearbyMount = this.entities.creatures.find(
        (c) =>
          c.tamed &&
          (c.kind === CreatureKind.HORSE || c.kind === CreatureKind.CAMEL) &&
          !c.hasSaddle &&
          Math.hypot(c.x - this.player.x, c.y - this.player.y) <= 78
      );
      if (nearbyMount) {
        this.equipSaddleOnCreature(nearbyMount.id);
      } else {
        this.addFloatingText(
          'Aproxime-se de um Cavalo ou Camelo domesticado sem sela!',
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
   * Computes what object or entity the player is currently aiming at / closest to for the Interact button.
   */
  public getAimedTarget(): AimedTargetInfo | null {
    const dirVec = this.getDirectionOffset(this.player.direction);
    const aimPointX = this.player.x + dirVec.x * 28;
    const aimPointY = this.player.y + dirVec.y * 28;

    // 0A. Check nearby Interactive Death Bag ("Bolsinha de Espólios") — Top Priority so the player can recover their items immediately
    let bestBag: { bag: DeathBag; dist: number } | null = null;
    for (const bag of this.deathBags) {
      const d = Math.hypot(bag.x - this.player.x, bag.y - this.player.y);
      if (d <= 72 && (!bestBag || d < bestBag.dist)) {
        bestBag = { bag, dist: d };
      }
    }
    if (bestBag) {
      const bag = bestBag.bag;
      const remSec = Math.max(0, Math.ceil(bag.expiresTimer));
      const mm = String(Math.floor(remSec / 60)).padStart(2, '0');
      const ss = String(remSec % 60).padStart(2, '0');
      const totalStacks = bag.items.length + (bag.goldCoins > 0 ? 1 : 0);
      return {
        kind: 'death_bag',
        label: `Bolsinha de Espólios (${totalStacks} itens · ${mm}:${ss})`,
        actionHint: 'Recuperar Todos os Itens 🎒 (E / Interagir)',
        worldX: bag.x,
        worldY: bag.y,
        deathBagId: bag.id,
        iconItemId: bag.items[0]?.itemId || 'leather_tunic',
      };
    }

    // 0. Check nearby Village NPC or Wanderer (Priority so player can easily talk/trade, settle a wanderer, or pay peace tribute)
    let bestNpc: { npc: CreatureEntity; dist: number } | null = null;
    for (const cr of this.entities.creatures) {
      if (
        (cr.kind === CreatureKind.VILLAGER ||
          cr.kind === CreatureKind.WANDERER) &&
        cr.hp > 0 &&
        !cr.isInsideHouse
      ) {
        const d = Math.hypot(cr.x - this.player.x, cr.y - this.player.y);
        if (d <= 84 && (!bestNpc || d < bestNpc.dist)) {
          bestNpc = { npc: cr, dist: d };
        }
      }
    }
    if (bestNpc) {
      const npc = bestNpc.npc;
      const aff = Math.round(npc.affinity ?? 55);
      const isWanderer = npc.kind === CreatureKind.WANDERER;
      const holdingPeace = this.isPlayerHoldingPeaceItem();
      const debtCoins = npc.isHostile ? this.getNpcPeaceDebtCoins(npc) : 0;
      return {
        kind: 'villager',
        label: isWanderer
          ? `${npc.name} · Andarilho (Sem Casa)`
          : `${npc.name} · ${npc.npcProfessionLabel || 'Aldeão'}`,
        actionHint: npc.isHostile
          ? holdingPeace
            ? `🕊️ Falar & Ver Cobrança (${debtCoins} Moedas de Ouro)`
            : '⚔ Hostil! Segure o Tratado da Paz na mão para falar'
          : isWanderer
          ? `Conversar / Trocar · Precisa de Casa 🏠`
          : `Negociar & Afinidade (♥${aff})`,
        worldX: npc.x,
        worldY: npc.y,
        creatureId: npc.id,
        iconItemId: npc.isHostile && holdingPeace ? 'peace_treaty' : 'gold_coin',
      };
    }

    // 1. Check nearby Interactive Structures (Workbench, Furnace, Solar Altar, Campfire, Village Well, Market Stall)
    const pTile = this.world.worldToTile(this.player.x, this.player.y);
    const pChunk = this.world.tileToChunk(pTile.tx, pTile.ty);
    let bestStation: { st: any; score: number } | null = null;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = WorldManager.chunkKey(pChunk.cx + dx, pChunk.cy + dy);
        const chunk = this.world.chunks[key];
        if (!chunk) continue;

        for (const st of chunk.structures) {
          if (
            st.type !== PlaceableType.WORKBENCH &&
            st.type !== PlaceableType.FURNACE &&
            st.type !== PlaceableType.SOLAR_ALTAR &&
            st.type !== PlaceableType.CAMPFIRE &&
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
          const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
          const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
          const distPlayer = Math.hypot(sx - this.player.x, sy - this.player.y);
          if (distPlayer <= TILE_SIZE * 2.8) {
            const distAim = Math.hypot(sx - aimPointX, sy - aimPointY);
            const score = distAim + distPlayer * 0.4;
            if (!bestStation || score < bestStation.score) {
              bestStation = { st, score };
            }
          }
        }
      }
    }

    if (bestStation) {
      const st = bestStation.st as PlacedStructure;
      const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
      const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
      const itemDef = ITEMS[st.itemId];
      const hasLoot = Boolean(st.lootItems && st.lootItems.length > 0);
      const occupiedChestSlots =
        st.type === PlaceableType.CHEST && Array.isArray(st.storageSlots)
          ? st.storageSlots.filter((s) => s !== null && s.count > 0).length
          : hasLoot
          ? st.lootItems!.length
          : 0;
      const isHouseStruct = this.isStructureValidHouse(st);
      const allHouseResidents = isHouseStruct
        ? this.getHouseResidents(st.id)
        : [];
      const houseResidents = allHouseResidents.length;
      const insideResidents = allHouseResidents.filter((r) => r.isInsideHouse);
      const insideNames = insideResidents.map((r) => r.name).join(' & ');
      const houseBadge = isHouseStruct
        ? ` [🏠 ${houseResidents}/${MAX_VILLAGERS_PER_HOUSE} Aldeões]`
        : '';

      const actionHint =
        insideResidents.length > 0 &&
        (st.type === PlaceableType.VILLAGE_HOUSE ||
          st.type === PlaceableType.EXPLORER_TENT ||
          st.type === PlaceableType.WOOD_DOOR ||
          st.type === PlaceableType.IRON_GATE)
          ? `🚪 Bater na Porta (Chamar ${insideNames}) 🏠`
          : st.type === PlaceableType.WOOD_DOOR || st.type === PlaceableType.IRON_GATE
          ? `${
              st.isOpen ? 'Fechar Passagem 🔒' : 'Abrir Passagem 🔓'
            }${houseBadge}`
          : st.type === PlaceableType.CHEST
          ? st.villageId
            ? this.hasVillageChestPermission(st.villageId)
              ? '🔓 Abrir Cofre da Vila (Permissão Concedida ♥)'
              : '🔒 Cofre da Vila Trancado (Requer ♥75+ ou Quebrar Baú)'
            : hasLoot
            ? `Abrir Baú de Tesouro (${occupiedChestSlots} itens) ✦`
            : occupiedChestSlots > 0
            ? `Abrir Baú (${occupiedChestSlots}/${CHEST_STORAGE_SIZE} Slots) 📦`
            : 'Abrir Baú & Guardar Itens 📦'
          : st.type === PlaceableType.VILLAGE_WELL
          ? 'Beber Água Fresca (+HP/Energia)'
          : st.type === PlaceableType.MARKET_STALL
          ? st.ownerType === 'PLAYER'
            ? 'Gerenciar Sua Tenda de Vendas 🏪'
            : this.isVillagerStallOwnerAlive(st)
            ? `Tenda de ${st.ownerName || 'Mercador'} · Ver Tenda & Preços 🏪`
            : 'Tenda sem Dono (Aldeão Morreu) · Tomar Posse 🏪'
          : st.type === PlaceableType.VILLAGE_HOUSE
          ? `Descansar na Casa · Moradores: ${houseResidents}/${MAX_VILLAGERS_PER_HOUSE} 🏠`
          : st.type === PlaceableType.CAMPFIRE
          ? 'Aquecer & Descansar'
          : st.type === PlaceableType.EXPLORER_TENT
          ? `Dormir / Descansar · Moradores: ${houseResidents}/${MAX_VILLAGERS_PER_HOUSE} 🏠`
          : st.type === PlaceableType.HEALING_FOUNTAIN
          ? 'Bênção de Cura'
          : st.type === PlaceableType.WORKBENCH
          ? 'Abrir Bancada'
          : st.type === PlaceableType.FURNACE
          ? 'Abrir Fornalha'
          : 'Abrir Altar Solar';
      return {
        kind: 'station',
        label: st.customName || st.landmarkName || itemDef?.name || 'Estação',
        actionHint,
        worldX: sx,
        worldY: sy,
        stationType: st.type,
        iconItemId: st.itemId,
      };
    }

    // 2. Check nearby Wild Domesticable Animal
    const wild = this.getNearbyWildAnimal();
    if (wild) {
      const favId = wild.favoriteFoodIds[0] || 'berry';
      return {
        kind: 'wild_animal',
        label: wild.name,
        actionHint: `Domesticar ♥ (${ITEMS[favId]?.name || 'Comida'})`,
        worldX: wild.x,
        worldY: wild.y,
        creatureId: wild.id,
        iconItemId: favId,
      };
    }

    // 3. Check nearby Tamed Animal or Boat
    const tamed = this.getNearbyTamedAnimal();
    if (tamed) {
      const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];
      const isHoldingSaddle = Boolean(heldSlot && heldSlot.itemId === 'saddle');
      const isMountSpecies =
        tamed.kind === CreatureKind.HORSE || tamed.kind === CreatureKind.CAMEL;

      if (tamed.kind === CreatureKind.BOAT) {
        const isMountedHere = this.player.mountedEntityId === tamed.id;
        return {
          kind: 'tamed_animal',
          label: `${tamed.name} (2 Assentos · Sem Correnteza)`,
          actionHint: isMountedHere
            ? 'Desmontar do Bote ⛵'
            : 'Embarcar no Bote (Rápido na Água) ⛵',
          worldX: tamed.x,
          worldY: tamed.y,
          creatureId: tamed.id,
          iconItemId: 'wood_boat',
        };
      }

      if (isMountSpecies && !tamed.hasSaddle && isHoldingSaddle) {
        return {
          kind: 'tamed_animal',
          label: `${tamed.name} (Sem Sela)`,
          actionHint: 'Equipar Sela de Montaria (Libera 8 Slots + Montar) 鞍',
          worldX: tamed.x,
          worldY: tamed.y,
          creatureId: tamed.id,
          iconItemId: 'saddle',
        };
      }

      if (isMountSpecies && tamed.hasSaddle) {
        const isMountedHere = this.player.mountedEntityId === tamed.id;
        return {
          kind: 'tamed_animal',
          label: `${tamed.name} [Selado · Vel ${tamed.mountSpeed || 145}]`,
          actionHint: isMountedHere
            ? 'Desmontar / Abrir Alforje (8 Slots)'
            : 'Montar / Cavalgar (8 Slots de Alforje)',
          worldX: tamed.x,
          worldY: tamed.y,
          creatureId: tamed.id,
          iconItemId: 'saddle',
        };
      }

      return {
        kind: 'tamed_animal',
        label: tamed.name,
        actionHint:
          tamed.aiState === 'stay'
            ? 'Chamar para Seguir'
            : 'Mandar Guardar Base',
        worldX: tamed.x,
        worldY: tamed.y,
        creatureId: tamed.id,
        iconItemId: 'taming_treat',
      };
    }

    // 4. Check Nature Node directly in front of player
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
      const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];
      const heldItem = heldSlot ? ITEMS[heldSlot.itemId] : null;
      const strengthBuff =
        this.player.strengthBuffTimer && this.player.strengthBuffTimer > 0
          ? 1.35
          : 1.0;
      const strengthMult =
        (1 + (this.player.attributes.strength - 1) * 0.12) * strengthBuff;
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
        ? `Força: ${evalBreak.force} (${evalBreak.actorLabel}) · ${req.requirementLabel}`
        : `🔒 ${evalBreak.blockReason}`;
      return {
        kind: 'node',
        label: `${bp.name} (${Math.ceil(node.hp)}/${bp.maxHp} HP · ${req.materialLabel})`,
        actionHint: forceHint,
        worldX: node.tileX * TILE_SIZE + TILE_SIZE / 2,
        worldY: node.tileY * TILE_SIZE + TILE_SIZE / 2,
        iconItemId: bp.drops[0]?.itemId || 'wood',
      };
    }

    // 5. Check Tilled Soil & Growing/Mature Crops within reach
    const tilledTile = this.world.worldToTile(aimPointX, aimPointY);
    const tChunk = this.world.chunks[
      WorldManager.chunkKey(
        Math.floor(tilledTile.tx / 16),
        Math.floor(tilledTile.ty / 16)
      )
    ];
    let tilledSt = tChunk?.structures.find(
      (s) =>
        s.tileX === tilledTile.tx &&
        s.tileY === tilledTile.ty &&
        s.type === PlaceableType.TILLED_SOIL
    );

    if (!tilledSt) {
      const pTile = this.world.worldToTile(this.player.x, this.player.y);
      const pChunkObj = this.world.chunks[
        WorldManager.chunkKey(
          Math.floor(pTile.tx / 16),
          Math.floor(pTile.ty / 16)
        )
      ];
      tilledSt = pChunkObj?.structures.find(
        (s) =>
          s.tileX === pTile.tx &&
          s.tileY === pTile.ty &&
          s.type === PlaceableType.TILLED_SOIL
      );
    }

    if (tilledSt) {
      const sx = tilledSt.tileX * TILE_SIZE + TILE_SIZE / 2;
      const sy = tilledSt.tileY * TILE_SIZE + TILE_SIZE / 2;
      const crop = tilledSt.cropType;

      if (crop) {
        const itemDef = ITEMS[crop];
        const cropName = itemDef?.name || crop;
        if (tilledSt.growthStage === 3) {
          return {
            kind: 'crop',
            label: `${cropName} (Maduro!)`,
            actionHint: 'Colher Planta 🌾 (E / Interagir)',
            worldX: sx,
            worldY: sy,
            iconItemId: crop,
            structureId: tilledSt.id,
            cropType: crop,
            cropStage: 3,
            isWatered: tilledSt.isWatered,
          };
        } else {
          const stageNum = (tilledSt.growthStage || 0) + 1;
          const pct = Math.round((tilledSt.growthProgress || 0) * 100);
          const hint = tilledSt.isWatered
            ? tilledSt.fertilized
              ? 'Crescimento Acelerado (Adubado) ✦'
              : 'Solo Irrigado ♥'
            : 'Necessita de Água (Use Regador) 💧';
          return {
            kind: 'crop',
            label: `${cropName} (Estágio ${stageNum}/4 - ${pct}%)`,
            actionHint: hint,
            worldX: sx,
            worldY: sy,
            iconItemId: crop,
            structureId: tilledSt.id,
            cropType: crop,
            cropStage: tilledSt.growthStage,
            isWatered: tilledSt.isWatered,
          };
        }
      } else {
        return {
          kind: 'crop',
          label: tilledSt.isWatered ? 'Terra Arada (Irrigada)' : 'Terra Arada (Seca)',
          actionHint: 'Plantar Semente na Mão 🌱',
          worldX: sx,
          worldY: sy,
          iconItemId: 'wheat_seeds',
          structureId: tilledSt.id,
          cropStage: 0,
          isWatered: tilledSt.isWatered,
        };
      }
    }

    return null;
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
      this.addFloatingText(
        evalBreak.blockReason || 'Ferramenta inadequada para este material',
        nx,
        ny - 16,
        '#f43f5e'
      );
      soundManager.playHitStone();
      return;
    }

    const power = evalBreak.force;
    node.hp -= power;
    node.hitFlashTimer = 0.16;

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
      const survivalBonusChance = (this.player.attributes.survival - 1) * 0.1;
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
      this.gainXp(bp.xpReward);
      chunk.nodes.splice(nodeIndex, 1);
    }
    this.syncChunkAtTile(node.tileX, node.tileY);
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

    // Record attacker for creature-vs-creature retaliation
    if (attackerCreature && attackerCreature.id !== cr.id) {
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
        this.spawnDrop(
          'dark_essence',
          (cr.isElite ? 2 : 1) + Math.floor(Math.random() * 2),
          cr.x,
          cr.y
        );
        if (Math.random() < 0.65) this.spawnDrop('fiber', 2, cr.x + 6, cr.y);
        if (cr.isElite) {
          this.spawnDrop('iron_ore', 2, cr.x - 6, cr.y);
        }
        grantPlayerXp(Math.round(35 * eliteMult));
      } else if (cr.kind === CreatureKind.OGRE) {
        this.spawnDrop(
          'ogre_hide',
          (cr.isElite ? 2 : 1) + Math.floor(Math.random() * 2),
          cr.x,
          cr.y
        );
        this.spawnDrop('iron_ore', cr.isElite ? 4 : 2, cr.x + 8, cr.y);
        if (cr.isElite) {
          this.spawnDrop('healing_salve', 1, cr.x - 8, cr.y);
        }
        grantPlayerXp(Math.round(95 * eliteMult));
      } else if (cr.kind === CreatureKind.FOREST_STALKER) {
        this.spawnDrop(
          'spider_silk',
          (cr.isElite ? 2 : 1) + Math.floor(Math.random() * 2),
          cr.x,
          cr.y
        );
        if (Math.random() < 0.65) this.spawnDrop('berry', 2, cr.x + 6, cr.y);
        grantPlayerXp(Math.round(48 * eliteMult));
      } else if (cr.kind === CreatureKind.DESERT_SCORPION) {
        this.spawnDrop(
          'scorpion_stinger',
          cr.isElite ? 2 : 1,
          cr.x,
          cr.y
        );
        if (Math.random() < 0.55 || cr.isElite) {
          this.spawnDrop('solar_crystal', 1, cr.x + 6, cr.y);
        }
        grantPlayerXp(Math.round(62 * eliteMult));
      } else if (cr.kind === CreatureKind.STONE_GOLEM) {
        this.spawnDrop('golem_core', cr.isElite ? 2 : 1, cr.x, cr.y);
        this.spawnDrop('iron_ore', cr.isElite ? 4 : 2, cr.x + 8, cr.y);
        this.spawnDrop('stone', 3, cr.x - 8, cr.y);
        grantPlayerXp(Math.round(115 * eliteMult));
      } else if (cr.kind === CreatureKind.BANDIT) {
        this.spawnDrop(
          'gold_coin',
          (cr.isElite ? 3 : 1) + Math.floor(Math.random() * 2),
          cr.x,
          cr.y
        );
        if (Math.random() < 0.6) {
          this.spawnDrop('wool_bandage', 1, cr.x + 6, cr.y);
        }
        if (cr.isElite) {
          this.spawnDrop('iron_bar', 2, cr.x - 6, cr.y);
        }
        grantPlayerXp(Math.round(58 * eliteMult));
      } else if (
        cr.kind === CreatureKind.VILLAGER ||
        cr.kind === CreatureKind.WANDERER
      ) {
        this.spawnDrop('gold_coin', 2, cr.x, cr.y);
        this.spawnDrop('iron_bar', 1, cr.x + 6, cr.y);
        grantPlayerXp(40);
      } else if (cr.kind === CreatureKind.SHEEP) {
        this.spawnDrop('wool', 2, cr.x, cr.y);
        grantPlayerXp(15);
      } else if (cr.kind === CreatureKind.BOAR) {
        this.spawnDrop('apple', 2, cr.x, cr.y);
        grantPlayerXp(20);
      } else if (cr.kind === CreatureKind.CAMEL) {
        this.spawnDrop('cactus_fruit', 2, cr.x, cr.y);
        grantPlayerXp(25);
      } else if (cr.kind === CreatureKind.HORSE) {
        this.spawnDrop('apple', 2, cr.x, cr.y);
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

  private damagePlayer(rawAmount: number, sourceX: number, sourceY: number): void {
    const reduction = this.getTotalDefenseBonus();
    const finalDmg = Math.max(1, Math.round(rawAmount * (1 - reduction)));

    this.player.hp = Math.max(0, this.player.hp - finalDmg);
    this.player.hitFlashTimer = 0.25;
    soundManager.playPlayerHurt();

    const dx = this.player.x - sourceX;
    const dy = this.player.y - sourceY;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const kx = this.player.x + (dx / dist) * 12;
    const ky = this.player.y + (dy / dist) * 12;
    if (this.canEntityOccupy(kx, ky)) {
      this.player.x = kx;
      this.player.y = ky;
    }

    this.addFloatingText(`-${finalDmg} HP`, this.player.x, this.player.y - 20, '#ef4444');
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
    const idx = this.deathBags.findIndex((b) => b.id === bagId);
    if (idx === -1) return false;
    const bag = this.deathBags[idx];

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
          if (itemDef.maxHpBonus) {
            this.player.maxHp += itemDef.maxHpBonus;
            this.player.hp = Math.min(
              this.player.maxHp,
              this.player.hp + itemDef.maxHpBonus
            );
          }
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
    if (bag.items.length === 0 && bag.goldCoins <= 0) {
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
          const def = ITEMS[eqId];
          if (def?.maxHpBonus) {
            this.player.maxHp = Math.max(50, this.player.maxHp - def.maxHpBonus);
          }
          bagItems.push({ itemId: eqId, count: 1 });
          this.player.equippedBySlot[eqSlot] = null;
        }
      }
    }
    this.player.equippedArmorId = null;

    const droppedGold = Math.max(0, Math.floor(this.player.goldCoins || 0));
    this.player.goldCoins = 0;

    let droppedBag = false;
    if (bagItems.length > 0 || droppedGold > 0) {
      droppedBag = true;
      const newBag: DeathBag = {
        id: `deathbag_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
        ownerName: this.settings.playerName || 'Aventureiro',
        x: deathX,
        y: deathY,
        items: bagItems,
        goldCoins: droppedGold,
        createdAt: Date.now(),
        expiresTimer: 600, // 10 minutes (600 seconds)
        maxTimer: 600,
      };
      this.deathBags.push(newBag);
      this.world.revealAround(deathX, deathY, 6);
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
    this.world.revealAround(this.player.x, this.player.y, 10);
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

  public toggleTamedAnimalState(creatureId: string): void {
    const cr = this.entities.creatures.find((c) => c.id === creatureId && c.tamed);
    if (!cr) return;
    cr.aiState = cr.aiState === 'stay' ? 'follow' : 'stay';
    this.emitUiSnapshot();
  }

  public setAllTamedAnimalsState(state: 'follow' | 'stay'): void {
    for (const cr of this.entities.creatures) {
      if (cr.tamed) {
        cr.aiState = state;
      }
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
      this.player.maxHp += item.permanentMaxHpBonus;
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

  public getTotalDefenseBonus(): number {
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
    return Math.min(0.78, total);
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

    // Remove previous piece's Max HP bonus if any
    if (previousItemId && ITEMS[previousItemId]?.maxHpBonus) {
      const oldHpBonus = ITEMS[previousItemId].maxHpBonus || 0;
      this.player.maxHp = Math.max(50, this.player.maxHp - oldHpBonus);
      this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    }

    this.player.equippedBySlot[targetSlot] = item.id;
    this.player.equippedArmorId = this.player.equippedBySlot.body;
    this.consumeInventoryAt(slotIndex, 1);

    if (previousItemId) {
      const added = this.addItemToInventory(previousItemId, 1);
      if (!added) {
        this.spawnDrop(previousItemId, 1, this.player.x, this.player.y);
      }
    }

    // Apply new piece's Max HP bonus if any
    if (item.maxHpBonus) {
      this.player.maxHp += item.maxHpBonus;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + item.maxHpBonus);
    }

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
      const def = ITEMS[itemId];
      if (def?.maxHpBonus) {
        this.player.maxHp = Math.max(50, this.player.maxHp - def.maxHpBonus);
        this.player.hp = Math.min(this.player.hp, this.player.maxHp);
      }
      this.player.equippedBySlot[equipSlot] = null;
      this.player.equippedArmorId = this.player.equippedBySlot.body;
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
      indexB >= this.player.inventory.length
    ) {
      return;
    }
    const slotA = this.player.inventory[indexA];
    const slotB = this.player.inventory[indexB];

    // If same item type, stack them up to maxStack!
    if (slotA && slotB && slotA.itemId === slotB.itemId && indexA !== indexB) {
      const def = ITEMS[slotA.itemId];
      if (def && slotB.count < def.maxStack) {
        const space = def.maxStack - slotB.count;
        const move = Math.min(space, slotA.count);
        slotB.count += move;
        slotA.count -= move;
        if (slotA.count <= 0) {
          this.player.inventory[indexA] = null;
        }
        soundManager.playPickup();
        this.emitUiSnapshot();
        return;
      }
    }

    this.player.inventory[indexA] = slotB;
    this.player.inventory[indexB] = slotA;
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

  public handleCanvasTap(screenX: number, screenY: number): void {
    if (this.isPaused || this.isGameOver) return;
    const { wx, wy } = this.camera.screenToWorld(screenX, screenY);
    const { tx, ty } = this.world.worldToTile(wx, wy);

    const dx = wx - this.player.x;
    const dy = wy - this.player.y;
    this.player.direction = EntityManager.vectorToDirection(
      dx,
      dy,
      this.player.direction
    );

    // Check if the player tapped directly on a Death Bag within reach
    const tappedBag = this.deathBags.find(
      (b) =>
        Math.hypot(b.x - wx, b.y - wy) <= 28 &&
        Math.hypot(b.x - this.player.x, b.y - this.player.y) <= TILE_SIZE * 2.8
    );
    if (tappedBag) {
      this.lootDeathBag(tappedBag.id);
      return;
    }

    // Check if the player tapped directly on a placed Crafting Station or Interactive Structure within reach
    const chunk = this.world.getOrCreateChunk(
      Math.floor(tx / 16),
      Math.floor(ty / 16)
    );
    const tappedStation = chunk.structures.find(
      (s) =>
        s.tileX === tx &&
        s.tileY === ty &&
        (s.type === PlaceableType.WORKBENCH ||
          s.type === PlaceableType.FURNACE ||
          s.type === PlaceableType.SOLAR_ALTAR ||
          s.type === PlaceableType.CAMPFIRE ||
          s.type === PlaceableType.EXPLORER_TENT ||
          s.type === PlaceableType.HEALING_FOUNTAIN ||
          s.type === PlaceableType.VILLAGE_WELL ||
          s.type === PlaceableType.MARKET_STALL ||
          s.type === PlaceableType.VILLAGE_HOUSE ||
          s.type === PlaceableType.CHEST ||
          s.type === PlaceableType.WOOD_DOOR ||
          s.type === PlaceableType.IRON_GATE)
    );
    if (
      !this.buildDemolishMode &&
      tappedStation &&
      Math.hypot(wx - this.player.x, wy - this.player.y) <= TILE_SIZE * 3.2
    ) {
      this.performInteractAction();
      return;
    }

    // Check if the player tapped directly on a creature to select who to attack (or interact with if peaceful NPC)
    let tappedCreature: CreatureEntity | null = null;
    let bestTapDist = 30;
    for (const cr of this.entities.creatures) {
      if (cr.hp <= 0 || cr.tamed || cr.isInsideHouse) continue;
      const dTap = Math.hypot(cr.x - wx, cr.y - wy);
      if (dTap <= bestTapDist) {
        bestTapDist = dTap;
        tappedCreature = cr;
      }
    }

    if (tappedCreature) {
      const isVillagerOrWanderer =
        tappedCreature.kind === CreatureKind.VILLAGER ||
        tappedCreature.kind === CreatureKind.WANDERER;
      const isPeacefulNpc = isVillagerOrWanderer && !tappedCreature.isHostile;
      const isNegotiatingHostileNpc =
        isVillagerOrWanderer &&
        tappedCreature.isHostile &&
        this.isPlayerHoldingPeaceItem();
      const distPlayer = Math.hypot(
        tappedCreature.x - this.player.x,
        tappedCreature.y - this.player.y
      );
      if (
        (isPeacefulNpc && !this.innocentFireEnabled) ||
        isNegotiatingHostileNpc
      ) {
        if (distPlayer <= 84) {
          this.performInteractAction();
          return;
        }
      } else {
        this.preferredTargetCreatureId = tappedCreature.id;
        this.player.direction = EntityManager.vectorToDirection(
          tappedCreature.x - this.player.x,
          tappedCreature.y - this.player.y,
          this.player.direction
        );
        this.performAttackOrHarvestAction();
        return;
      }
    }

    const heldSlot = this.player.inventory[this.player.selectedHotbarIndex];
    const heldItem = heldSlot ? ITEMS[heldSlot.itemId] : null;

    if (heldItem && heldItem.category === ItemCategory.PLACEABLE) {
      const dist = Math.hypot(wx - this.player.x, wy - this.player.y);
      if (dist <= TILE_SIZE * 3.8) {
        this.customTargetTile = { tx, ty };
        this.performUseOrPlaceHeldItemAction();
        return;
      }
    }

    this.performAttackOrHarvestAction();
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

    // Prioritize dismantling upper layer (WALL / FURNITURE) before SPIKE_TRAP and GROUND floor
    let targetIdx = -1;
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
        (st.type === PlaceableType.VILLAGE_HOUSE ||
          st.type === PlaceableType.VILLAGE_WELL ||
          st.type === PlaceableType.HEALING_FOUNTAIN)
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

    if (st.villageId) {
      this.provokeVillage(
        st.villageId,
        null,
        35,
        '⚔ Desmontar estruturas da vila irritou os guardas!'
      );
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
    }

    chunk.structures.splice(targetIdx, 1);
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
      const def = ITEMS[slotA.itemId];
      if (def && slotB.count < def.maxStack) {
        const move = Math.min(def.maxStack - slotB.count, slotA.count);
        slotB.count += move;
        slotA.count -= move;
        if (slotA.count <= 0) {
          slots[indexA] = null;
        }
        soundManager.playPickup();
        this.syncChunkAtTile(chest.tileX, chest.tileY);
        this.emitUiSnapshot();
        return;
      }
    }

    slots[indexA] = slotB;
    slots[indexB] = slotA;
    soundManager.playPickup();
    this.syncChunkAtTile(chest.tileX, chest.tileY);
    this.emitUiSnapshot();
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
   * "Guardar Mochila": Deposits all items from the player's 24 backpack slots (indices 8..31) into the chest, keeping hotbar intact.
   */
  public depositBackpackToChest(chestId: string): number {
    const chest = this.getChestById(chestId);
    if (!chest) return 0;
    const slots = this.ensureChestStorageInitialized(chest);

    let totalMoved = 0;
    for (let i = HOTBAR_SIZE; i < this.player.inventory.length; i++) {
      const pSlot = this.player.inventory[i];
      if (!pSlot || pSlot.count <= 0) continue;
      const moved = this.addItemToChestStorage(slots, pSlot.itemId, pSlot.count);
      if (moved > 0) {
        this.consumeInventoryAt(i, moved);
        totalMoved += moved;
      }
    }

    if (totalMoved > 0) {
      soundManager.playCraft();
      this.addFloatingText(
        `Mochila Guardada (${totalMoved} itens)`,
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
    return stall.stallSlots;
  }

  private dropMarketStallContents(
    stall: PlacedStructure,
    wx: number,
    wy: number,
    tryAddToPlayerFirst = false
  ): void {
    const slots = this.ensureMarketStallInitialized(stall);
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
      stall.pendingCustomerOffer = null;
      soundManager.playCraft();
      this.syncChunkAtTile(stall.tileX, stall.tileY);
      this.emitUiSnapshot();
      return {
        ok: true,
        message: 'Você assumiu a posse desta Tenda de Vendas como Mercador!',
      };
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
    stall.pendingCustomerOffer = null;
    soundManager.playPickup();
    this.syncChunkAtTile(stall.tileX, stall.tileY);
    this.emitUiSnapshot();
    return {
      ok: true,
      message: `Dono da tenda definido para ${stall.ownerName}.`,
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

    // 2. Grant Gold Coins to Player (or drop at player's feet if inventory is full)
    const goldEarned = Math.max(1, offer.totalPrice);
    const addedGold = this.addItemToInventory('gold_coin', goldEarned);
    if (!addedGold) {
      this.spawnDrop('gold_coin', goldEarned, this.player.x, this.player.y);
    }

    stall.stallSalesCount = (stall.stallSalesCount || 0) + 1;
    stall.stallTotalGoldEarned =
      (stall.stallTotalGoldEarned || 0) + goldEarned;
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
      `💰 Vendido! +${goldEarned} Moedas de Ouro (${offer.quantity}x ${itemName})`,
      sx,
      sy - 24,
      '#fde047'
    );
    this.syncChunkAtTile(stall.tileX, stall.tileY);
    this.emitUiSnapshot();
    return {
      ok: true,
      message: `Venda realizada para ${offer.buyerName}! Você recebeu +${goldEarned}x Moedas de Ouro Antigas (+30 XP). ${offer.buyerName} só fará novas compras após dormir em casa.`,
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
        cr.stallInspectCooldown = 14;
        return false;
      }

      const sx = stall.tileX * TILE_SIZE + TILE_SIZE / 2;
      const sy = stall.tileY * TILE_SIZE + TILE_SIZE / 2 + 20;
      const dist = Math.hypot(sx - cr.x, sy - cr.y);

      if (dist > 26) {
        cr.aiState = 'wander';
        this.steerCreatureToward(cr, sx, sy, cr.moveSpeed * 0.9, dt, true);
        return true;
      }

      // Arrived at the stall counter! Pause briefly to inspect prices
      cr.vx = 0;
      cr.vy = 0;
      cr.aiState = 'idle';
      cr.direction = 'up';
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
        // Weight selection toward better deals & cheaper items
        const selectionWeight = Math.max(0.05, evalRes.buyChance + 0.08);
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
      const affinityBonus = ((cr.affinity ?? 55) - 50) * 0.0025;
      const finalBuyChance =
        evalRes.buyChance <= 0
          ? 0
          : Math.min(0.96, Math.max(0.02, evalRes.buyChance + affinityBonus));

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

        this.addItemToInventory('gold_coin', totalGold);
        stall.stallSalesCount = (stall.stallSalesCount || 0) + 1;
        stall.stallTotalGoldEarned =
          (stall.stallTotalGoldEarned || 0) + totalGold;
        stall.pendingCustomerOffer = null;

        cr.hasBoughtToday = true;
        cr.attractedStallId = undefined;
        cr.stallInspectCooldown = 60;
        cr.affinity = Math.min(100, (cr.affinity ?? 55) + 6);

        soundManager.playCraft();
        this.gainXp(30);
        this.renderer.spawnBurst(cr.x, cr.y - 6, 'GOLD', 14);
        this.renderer.spawnBurst(sx, sy - 6, 'GOLD', 18);
        this.renderer.spawnRipple(sx, sy, '#fde047', 30, 0.55);

        this.addFloatingText(
          `💰 ${cr.name} comprou ${qty}x ${itemName} (+${totalGold} Moedas)!`,
          sx,
          sy - 28,
          '#fde047'
        );
        this.syncChunkAtTile(stall.tileX, stall.tileY);
        this.emitUiSnapshot();
        return false;
      } else {
        // NPC decided not to buy on this inspection
        cr.attractedStallId = undefined;
        cr.stallInspectCooldown = 22 + Math.random() * 14;
        const itemName = ITEMS[sl.itemId]?.name || sl.itemId;
        const msg =
          evalRes.priceRatio > 1.25
            ? `💸 ${cr.name}: "${itemName} (${sl.unitPrice}g) está caro..." (${newInspectionCount}/3 hoje)`
            : `🤔 ${cr.name} inspecionou a tenda (${newInspectionCount}/3 hoje)`;
        this.addFloatingText(msg, cr.x, cr.y - 22, '#cbd5e1');
        this.emitUiSnapshot();
        return false;
      }
    }

    // 2. Otherwise, when passing near an open Player Market Stall, small chance to be attracted (up to 3 inspections/day/stall)!
    if ((cr.stallInspectCooldown ?? 0) > 0) {
      return false;
    }

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
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
            (s) => s !== null && s.enabled && s.count > 0
          );
          if (enabledSlots.length === 0) continue;

          const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
          const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
          const dist = Math.hypot(sx - cr.x, sy - cr.y);

          if (dist <= 175) {
            // Check best deal on the stall to slightly boost attraction when cheap bargains are displayed
            let bestDealChance = 0.25;
            for (const sl of enabledSlots) {
              const ev = evaluateStallPriceDeal(sl!.itemId, sl!.unitPrice);
              if (ev.buyChance > bestDealChance) {
                bestDealChance = ev.buyChance;
              }
            }
            const attractRatePerSec = 0.14 + bestDealChance * 0.22;
            if (Math.random() < dt * attractRatePerSec) {
              cr.attractedStallId = st.id;
              cr.aiTimer = 1.6 + Math.random() * 1.2;
              this.addFloatingText(
                `👀 ${cr.name} foi olhar a Tenda (${inspectionsToday + 1}/3 hoje)`,
                cr.x,
                cr.y - 20,
                '#38bdf8'
              );
              return true;
            } else {
              // Brief cooldown before rolling again so we don't roll every frame unnecessarily
              cr.stallInspectCooldown = 3.5 + Math.random() * 3.0;
              return false;
            }
          }
        }
      }
    }

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
    if (recipe.requiredStation !== null && recipe.requiredStation !== activeStation) {
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
      this.player.maxHp += 10;
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
    this.player.attributes[attr] += 1;
    if (attr === 'vitality') {
      this.player.maxHp += 18;
      this.player.hp += 18;
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
    let best: CreatureEntity | null = null;
    let bestDist = 72;
    for (const cr of this.entities.creatures) {
      if (
        !cr.isHostile &&
        !cr.tamed &&
        cr.kind !== CreatureKind.VILLAGER &&
        cr.kind !== CreatureKind.WANDERER &&
        cr.kind !== CreatureKind.BOAT
      ) {
        const d = Math.hypot(cr.x - this.player.x, cr.y - this.player.y);
        if (d < bestDist) {
          bestDist = d;
          best = cr;
        }
      }
    }
    return best;
  }

  public getNearbyTamedAnimal(): CreatureEntity | null {
    let best: CreatureEntity | null = null;
    let bestDist = 68;
    for (const cr of this.entities.creatures) {
      if (cr.tamed || cr.kind === CreatureKind.BOAT) {
        const d = Math.hypot(cr.x - this.player.x, cr.y - this.player.y);
        if (d < bestDist) {
          bestDist = d;
          best = cr;
        }
      }
    }
    return best;
  }

  // =========================================================================
  // MOUNTS, SADDLES (8-SLOT INVENTORY), GALLOP & 2-SEAT BOAT SYSTEM
  // =========================================================================

  private getLocalRiderId(): string {
    return this.multiplayer.isOnline ? this.multiplayer.peerId : 'LOCAL';
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
    let mount =
      this.entities.creatures.find(
        (c) => c.id === this.player.mountedEntityId && c.hp > 0
      ) || null;

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
          mount.x = rp.x;
          mount.y = rp.y;
          mount.vx = rp.vx;
          mount.vy = rp.vy;
          mount.direction = rp.direction;
          mount.animFrame = rp.animFrame;
          mount.tamed = true;
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
   * authoritative creature list stays 100% synchronized.
   */
  private handleGuestMountEvent(peerId: string, event: any): void {
    if (!event || typeof event.action !== 'string') return;
    switch (event.action) {
      case 'tame': {
        const cr = this.entities.creatures.find(
          (c) => c.id === event.creatureId
        );
        if (cr) {
          cr.tamed = Boolean(event.tamed);
          cr.tameProgress =
            typeof event.tameProgress === 'number'
              ? event.tameProgress
              : cr.tameProgress;
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
          cr.tamed = true;
          cr.hasSaddle = true;
          this.ensureMountInventoryInitialized(cr);
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
            riderPlayerId: peerId,
          };
          this.entities.creatures.push(cr!);
        }
        if (cr) {
          if (event.isPassenger) {
            cr.passengerPlayerId = peerId;
          } else {
            cr.riderPlayerId = peerId;
          }
          if (event.passengerPetId !== undefined) {
            cr.passengerPetId = event.passengerPetId;
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
        if (cr && Array.isArray(event.mountInventory)) {
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

  public mountCreature(creatureId: string): boolean {
    const cr = this.entities.creatures.find((c) => c.id === creatureId && c.hp > 0);
    if (!cr) return false;

    if (this.player.mountedEntityId) {
      this.dismountCreature();
    }

    const localRiderId = this.getLocalRiderId();

    if (cr.kind === CreatureKind.BOAT) {
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

      // If the 2nd seat is free and the player has a tamed pet currently following ('follow'), seat it in Seat 2!
      if (!cr.passengerPlayerId && !cr.passengerPetId) {
        const followingPet = this.entities.creatures.find(
          (p) =>
            p.id !== cr.id &&
            p.tamed &&
            p.kind !== CreatureKind.BOAT &&
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
      if (!cr.hasSaddle) {
        this.addFloatingText(
          `Equipe uma Sela em ${cr.name} para poder montar!`,
          cr.x,
          cr.y - 20,
          '#fde047'
        );
        return false;
      }
      this.ensureMountInventoryInitialized(cr);
      cr.riderPlayerId = localRiderId;
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
        `Montou em ${cr.name} (Velocidade ${cr.mountSpeed})`,
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
    if (!cr) return;
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
    if (!cr) return;
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

  // =========================================================================
  // ONLINE MULTIPLAYER & INVITE CODE SESSION MANAGEMENT
  // =========================================================================

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
            this.world.chunks[key] = ch;
          }
        }
        if (Array.isArray(snapshot.creatures)) {
          this.entities.creatures = snapshot.creatures;
        }
        if (Array.isArray(snapshot.droppedItems)) {
          this.droppedItems = snapshot.droppedItems;
        }
        // Keep the player's integrated mount restored after a snapshot sync
        this.restoreIntegratedPlayerMount();
        this.reconcileRemotePlayerMounts();
        this.pushPlayerOutOfHitbox(0, true);
        this.emitUiSnapshot();
      },
      onChunkSyncReceived: (chunkKey, chunkData) => {
        if (!chunkKey || !chunkData) return;
        this.world.chunks[chunkKey] = chunkData;
        if (!this.canEntityOccupy(this.player.x, this.player.y)) {
          this.pushPlayerOutOfHitbox(0.05, false);
        }
        this.emitUiSnapshot();
      },
      onSpawnDropReceived: (drop) => {
        if (!drop || !drop.id) return;
        if (!this.droppedItems.some((d) => d.id === drop.id)) {
          this.droppedItems.push(drop);
        }
      },
      onPickupDropReceived: (dropId) => {
        const idx = this.droppedItems.findIndex((d) => d.id === dropId);
        if (idx !== -1) {
          const drop = this.droppedItems[idx];
          this.renderer.spawnBurst(drop.x, drop.y, 'GOLD', 4);
          this.droppedItems.splice(idx, 1);
        }
      },
      onDropsSyncReceived: (drops) => {
        this.droppedItems = drops;
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
        this.world.revealAround(rp.x, rp.y, 10);
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
        this.damagePlayer(cr.attackDamage, cr.x, cr.y);
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
        (c) => c.tamed && c.kind !== CreatureKind.BOAT
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
