import { CONSTRUCTION_BLUEPRINTS, ITEMS, NATURE_BLUEPRINTS } from '../core/ItemRegistry';
import {
  BiomeType,
  ClothingColorId,
  CreatureEntity,
  CreatureKind,
  DeathBag,
  DroppedItem,
  EcologicalZone,
  FloatingText,
  ItemCategory,
  NatureNode,
  NatureNodeType,
  PlaceableType,
  PlacedStructure,
  PlayerState,
  RemotePlayerState,
  getTransportSeatOffset,
} from '../core/types';
import {
  CHUNK_SIZE,
  CHUNK_WORLD_SIZE,
  TILE_SIZE,
  WorldManager,
} from '../world/WorldManager';
import { BuildingRoof, RoofSystem } from '../world/RoofSystem';
import { Camera } from './Camera';
import { EntityManager } from '../entities/EntityManager';
import { spriteAtlas } from './SpriteAtlas';

interface RenderableItem {
  ySort: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export interface AimedTargetInfo {
  kind:
    | 'station'
    | 'wild_animal'
    | 'tamed_animal'
    | 'villager'
    | 'node'
    | 'crop'
    | 'death_bag'
    | 'water_source';
  label: string;
  actionHint: string;
  worldX: number;
  worldY: number;
  stationType?: PlaceableType;
  creatureId?: string;
  deathBagId?: string;
  iconItemId?: string;
  structureId?: string;
  canClaimOwnership?: boolean;
  cropType?: string;
  cropStage?: number;
  isWatered?: boolean;
  isPetFeedTarget?: boolean;
}

export interface BuildRenderOptions {
  demolishMode?: boolean;
  orientation?: 'auto' | 'horizontal' | 'vertical';
  rotation?: 0 | 1 | 2 | 3;
  showHitboxPreview?: boolean;
}

export type BurstPreset =
  | 'WOOD'
  | 'STONE'
  | 'LEAF'
  | 'BLOOD'
  | 'SPARK'
  | 'GOLD'
  | 'HEAL'
  | 'TAME'
  | 'BUILD'
  | 'WATER'
  | 'ARCANE';

interface VisualParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  color: string;
  secondaryColor?: string;
  timer: number;
  maxTimer: number;
  kind: 'square' | 'leaf' | 'spark' | 'smoke' | 'heart' | 'plus';
  phase: number;
}

interface FootprintDecal {
  x: number;
  y: number;
  color: string;
  timer: number;
  maxTimer: number;
  isRipple?: boolean;
}

interface GroundRipple {
  x: number;
  y: number;
  color: string;
  maxRadius: number;
  timer: number;
  maxTimer: number;
}

interface LightningBolt {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  timer: number;
  maxTimer: number;
}

export class GameRenderer {
  private lightCanvas: HTMLCanvasElement | null = null;
  private particles: VisualParticle[] = [];
  private footprints: FootprintDecal[] = [];
  private ripples: GroundRipple[] = [];
  private lightningBolts: LightningBolt[] = [];
  private lastRenderTime = 0;
  private playerStepAccum = 0;
  private lastPlayerX = 0;
  private lastPlayerY = 0;
  private entityStepMap = new Map<string, number>();
  private roofSystem = new RoofSystem();

  public getBuildingAtTile(
    world: WorldManager,
    tx: number,
    ty: number
  ): BuildingRoof | null {
    return this.roofSystem.getBuildingAtTile(world, tx, ty);
  }

  public invalidateRoofs(): void {
    this.roofSystem.invalidate();
  }

  public spawnRipple(
    x: number,
    y: number,
    color = '#fde047',
    maxRadius = 22,
    duration = 0.45
  ): void {
    if (this.ripples.length > 48) {
      this.ripples.shift();
    }
    this.ripples.push({
      x,
      y,
      color,
      maxRadius,
      timer: duration,
      maxTimer: duration,
    });
  }

  public spawnLightningBolt(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color = '#fde047'
  ): void {
    this.lightningBolts.push({
      x1,
      y1,
      x2,
      y2,
      color,
      timer: 0.24,
      maxTimer: 0.24,
    });
    this.spawnRipple(x2, y2, color, 20, 0.35);
    this.spawnBurst(x2, y2, 'SPARK', 10);
  }

  public spawnBurst(
    x: number,
    y: number,
    preset: BurstPreset,
    count = 10
  ): void {
    if (this.particles.length > 260) {
      this.particles.splice(0, count);
    }

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 18 + Math.random() * 52;
      let vx = Math.cos(angle) * speed;
      let vy = Math.sin(angle) * speed - 18;
      let gravity = 95;
      let size = 2 + Math.floor(Math.random() * 2);
      let color = '#fde047';
      let secondaryColor: string | undefined;
      let maxTimer = 0.38 + Math.random() * 0.28;
      let kind: VisualParticle['kind'] = 'square';

      switch (preset) {
        case 'WOOD':
          color = i % 2 === 0 ? '#b45309' : '#78350f';
          secondaryColor = '#fde68a';
          size = 2 + (i % 2);
          break;
        case 'LEAF':
          color = i % 3 === 0 ? '#4ade80' : i % 3 === 1 ? '#22c55e' : '#a3e635';
          gravity = 24;
          vy = -12 - Math.random() * 22;
          maxTimer = 0.65 + Math.random() * 0.35;
          kind = 'leaf';
          break;
        case 'STONE':
          color = i % 2 === 0 ? '#94a3b8' : '#475569';
          secondaryColor = '#e2e8f0';
          break;
        case 'SPARK':
          color = i % 2 === 0 ? '#fef08a' : '#f97316';
          gravity = 40;
          kind = 'spark';
          break;
        case 'GOLD':
          color = i % 2 === 0 ? '#fde047' : '#f59e0b';
          secondaryColor = '#ffffff';
          gravity = 30;
          vy = -25 - Math.random() * 30;
          kind = 'spark';
          break;
        case 'BLOOD':
          color = i % 2 === 0 ? '#ef4444' : '#991b1b';
          size = 2 + (i % 2);
          break;
        case 'HEAL':
          color = i % 2 === 0 ? '#4ade80' : '#38bdf8';
          gravity = -22;
          vx *= 0.45;
          vy = -16 - Math.random() * 24;
          maxTimer = 0.65 + Math.random() * 0.25;
          kind = 'plus';
          break;
        case 'TAME':
          color = i % 2 === 0 ? '#f43f5e' : '#fb7185';
          gravity = -26;
          vx *= 0.5;
          vy = -18 - Math.random() * 26;
          maxTimer = 0.75 + Math.random() * 0.25;
          kind = 'heart';
          break;
        case 'BUILD':
          color = i % 2 === 0 ? '#e2d4b7' : '#fbbf24';
          gravity = 15;
          vy = -14 - Math.random() * 20;
          maxTimer = 0.45 + Math.random() * 0.2;
          kind = 'smoke';
          size = 3 + (i % 2);
          break;
        case 'WATER':
          color = i % 2 === 0 ? '#38bdf8' : '#bae6fd';
          gravity = 85;
          break;
        case 'ARCANE':
          color = i % 2 === 0 ? '#c084fc' : '#38bdf8';
          gravity = -18;
          vy = -18 - Math.random() * 24;
          kind = 'spark';
          break;
      }

      this.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx,
        vy,
        gravity,
        size,
        color,
        secondaryColor,
        timer: maxTimer,
        maxTimer,
        kind,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private updateVisualEffects(
    dt: number,
    world: WorldManager,
    player: PlayerState,
    creatures: CreatureEntity[]
  ): void {
    // 1. Update active particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.timer -= dt;
      if (p.timer <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      if (p.kind === 'leaf') {
        p.x += (p.vx + Math.sin(p.phase + p.timer * 8) * 18) * dt;
      } else {
        p.x += p.vx * dt;
      }
      p.y += p.vy * dt;
    }

    // 2. Update ground footprints & water ripples
    for (let i = this.footprints.length - 1; i >= 0; i--) {
      this.footprints[i].timer -= dt;
      if (this.footprints[i].timer <= 0) {
        this.footprints.splice(i, 1);
      }
    }

    // 3. Update interaction/shockwave ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].timer -= dt;
      if (this.ripples[i].timer <= 0) {
        this.ripples.splice(i, 1);
      }
    }

    // 4. Update lightning bolts
    for (let i = this.lightningBolts.length - 1; i >= 0; i--) {
      this.lightningBolts[i].timer -= dt;
      if (this.lightningBolts[i].timer <= 0) {
        this.lightningBolts.splice(i, 1);
      }
    }

    // 5. Record Player Footprints & Biome Step Particles
    const movedDist = Math.hypot(
      player.x - this.lastPlayerX,
      player.y - this.lastPlayerY
    );
    this.lastPlayerX = player.x;
    this.lastPlayerY = player.y;

    if (player.isMoving && movedDist > 0.05 && movedDist < 40) {
      this.playerStepAccum += movedDist;
      if (this.playerStepAccum >= 13) {
        this.playerStepAccum = 0;
        const pTile = world.worldToTile(player.x, player.y + 6);
        const groundSt = world.getGroundStructureAtTile(pTile.tx, pTile.ty);
        const biome = world.getBiomeAtWorld(player.x, player.y + 6);
        const sideOffset = (this.footprints.length % 2 === 0 ? -1 : 1) * 3;
        const fx = player.x + sideOffset;
        const fy = player.y + 8;

        if (biome === BiomeType.OCEAN && !groundSt) {
          this.footprints.push({
            x: fx,
            y: fy,
            color: 'rgba(186, 230, 253, 0.55)',
            timer: 0.75,
            maxTimer: 0.75,
            isRipple: true,
          });
          this.spawnBurst(fx, fy, 'WATER', 2);
        } else if (groundSt) {
          this.footprints.push({
            x: fx,
            y: fy,
            color: 'rgba(15, 23, 42, 0.25)',
            timer: 0.9,
            maxTimer: 0.9,
          });
        } else if (biome === BiomeType.DESERT) {
          this.footprints.push({
            x: fx,
            y: fy,
            color: 'rgba(146, 64, 14, 0.38)',
            timer: 1.6,
            maxTimer: 1.6,
          });
        } else {
          this.footprints.push({
            x: fx,
            y: fy,
            color: 'rgba(20, 83, 45, 0.38)',
            timer: 1.3,
            maxTimer: 1.3,
          });
        }

        if (this.footprints.length > 90) {
          this.footprints.shift();
        }
      }
    }

    // 6. Subtle Creature Footprints for nearby moving fauna
    for (const cr of creatures) {
      const isCrMoving = Math.hypot(cr.vx, cr.vy) > 4;
      if (!isCrMoving) continue;
      if (Math.hypot(cr.x - player.x, cr.y - player.y) > 260) continue;
      const prevTimer = this.entityStepMap.get(cr.id) || 0;
      const nextTimer = prevTimer + dt;
      if (nextTimer >= 0.28) {
        this.entityStepMap.set(cr.id, 0);
        const inWater = Boolean(cr.isSwimming || world.isWorldPosInWater(cr.x, cr.y));
        const biome = world.getBiomeAtWorld(cr.x, cr.y + 6);
        this.footprints.push({
          x: cr.x + (Math.random() - 0.5) * 5,
          y: inWater ? cr.y + 6 : cr.y + 8,
          color: inWater
            ? 'rgba(186, 230, 253, 0.5)'
            : biome === BiomeType.DESERT
            ? 'rgba(146, 64, 14, 0.28)'
            : 'rgba(20, 83, 45, 0.28)',
          timer: inWater ? 0.75 : 1.0,
          maxTimer: inWater ? 0.75 : 1.0,
          isRipple: inWater,
        });
      } else {
        this.entityStepMap.set(cr.id, nextTimer);
      }
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    world: WorldManager,
    player: PlayerState,
    creatures: CreatureEntity[],
    droppedItems: DroppedItem[],
    floatingTexts: FloatingText[],
    timeOfDay: number,
    globalTime: number,
    targetBuildTile: { tx: number; ty: number } | null,
    aimedTarget: AimedTargetInfo | null,
    buildOptions?: BuildRenderOptions,
    remotePlayers: RemotePlayerState[] = [],
    deathBags: DeathBag[] = []
  ): void {
    const dt =
      this.lastRenderTime > 0
        ? Math.min(0.08, Math.max(0.001, globalTime - this.lastRenderTime))
        : 0.016;
    this.lastRenderTime = globalTime;
    this.updateVisualEffects(dt, world, player, creatures);

    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    camera.viewportWidth = width;
    camera.viewportHeight = height;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(Math.round(width / 2), Math.round(height / 2));
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

    const halfW = width / (2 * camera.zoom) + TILE_SIZE * 4;
    const halfH = height / (2 * camera.zoom) + TILE_SIZE * 4;

    const minCx = Math.floor((camera.x - halfW) / CHUNK_WORLD_SIZE);
    const maxCx = Math.floor((camera.x + halfW) / CHUNK_WORLD_SIZE);
    const minCy = Math.floor((camera.y - halfH) / CHUNK_WORLD_SIZE);
    const maxCy = Math.floor((camera.y + halfH) / CHUNK_WORLD_SIZE);

    const tileAnimFrame = Math.floor(globalTime * 2.6) % 4;
    const renderQueue: RenderableItem[] = [];
    const lightSources: {
      x: number;
      y: number;
      radius: number;
      color: string;
      strength?: number;
      yellowTint?: boolean;
    }[] = [];

    // Compute dynamic directional sun/moon shadow offset from timeOfDay
    const sunProgress = Math.max(0, Math.min(1, (timeOfDay - 6) / 12));
    const shadowDx = Math.round((sunProgress - 0.5) * 8);

    // 1. Render Progressive Terrain Tiles, Seamless Biome Auto-Borders & Micro-Flora
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const chunk = world.getOrCreateChunk(cx, cy);
        const baseTx = cx * CHUNK_SIZE;
        const baseTy = cy * CHUNK_SIZE;

        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          const ty = baseTy + ly;
          const wy = ty * TILE_SIZE;
          if (wy + TILE_SIZE < camera.y - halfH || wy > camera.y + halfH) continue;

          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const tx = baseTx + lx;
            const wx = tx * TILE_SIZE;
            if (wx + TILE_SIZE < camera.x - halfW || wx > camera.x + halfW) continue;

            const idx = ly * CHUNK_SIZE + lx;
            const biome = chunk.tiles[idx];
            const variant = chunk.tileVariants[idx];
            const subZone = world.getTileSubZone(tx, ty, biome);
            const sprite = spriteAtlas.getTileSprite(
              biome,
              variant,
              tileAnimFrame,
              subZone
            );
            ctx.drawImage(sprite, wx, wy, TILE_SIZE + 0.35, TILE_SIZE + 0.35);

            // Seamless Auto-Tiling Coastlines & Biome Ecotone Transitions
            this.drawSeamlessBiomeBorders(ctx, world, tx, ty, wx, wy, biome, globalTime);

            // Procedural Ground Micro-Decorations (Minimalist)
            this.drawTileMicroDetails(ctx, world, tx, ty, wx, wy, biome, subZone, globalTime);
          }
        }

        // Pass 1A: Ground-Layer Structures (Floors, Carpets, Bridges first, then Spike Traps on top)
        for (const st of chunk.structures) {
          const bp = CONSTRUCTION_BLUEPRINTS[st.type];
          const isFloorOrBridge =
            (bp?.layer === 'GROUND' ||
              st.type === PlaceableType.WOOD_FLOOR ||
              st.type === PlaceableType.STONE_FLOOR ||
              st.type === PlaceableType.BRICK_FLOOR ||
              st.type === PlaceableType.ROYAL_CARPET ||
              st.type === PlaceableType.WOOD_BRIDGE) &&
            st.type !== PlaceableType.SPIKE_TRAP;

          if (isFloorOrBridge) {
            this.drawGroundStructure(ctx, world, st, tileAnimFrame);
          }
        }

        for (const st of chunk.structures) {
          const bp = CONSTRUCTION_BLUEPRINTS[st.type];
          const isFloorOrBridge =
            (bp?.layer === 'GROUND' ||
              st.type === PlaceableType.WOOD_FLOOR ||
              st.type === PlaceableType.STONE_FLOOR ||
              st.type === PlaceableType.BRICK_FLOOR ||
              st.type === PlaceableType.ROYAL_CARPET ||
              st.type === PlaceableType.WOOD_BRIDGE) &&
            st.type !== PlaceableType.SPIKE_TRAP;

          if (st.type === PlaceableType.SPIKE_TRAP) {
            this.drawGroundStructure(ctx, world, st, tileAnimFrame);
          } else if (!isFloorOrBridge) {
            const isWallTorch =
              st.type === PlaceableType.TORCH &&
              (st.attachedToWall || world.hasWallStructureAtTile(st.tileX, st.tileY));
            const isAimedStructure =
              Boolean(aimedTarget) &&
              (aimedTarget!.structureId === st.id ||
                (Math.floor(aimedTarget!.worldX / TILE_SIZE) === st.tileX &&
                  Math.floor(aimedTarget!.worldY / TILE_SIZE) === st.tileY));
            renderQueue.push({
              ySort: isWallTorch
                ? st.tileY * TILE_SIZE + TILE_SIZE * 0.89
                : st.tileY * TILE_SIZE + TILE_SIZE * 0.85,
              draw: (c) =>
                this.drawStructure(
                  c,
                  world,
                  st,
                  globalTime,
                  shadowDx,
                  player,
                  creatures,
                  isAimedStructure
                ),
            });
          }

          const stLight = GameRenderer.getStructureLightSpec(st);
          if (stLight) {
            lightSources.push({
              x: st.tileX * TILE_SIZE + TILE_SIZE / 2,
              y: st.tileY * TILE_SIZE + TILE_SIZE / 2,
              radius: stLight.radius,
              color: stLight.color,
              strength: stLight.strength,
            });
          }
        }

        // Nature Nodes
        for (const node of chunk.nodes) {
          const wx = node.tileX * TILE_SIZE;
          const wy = node.tileY * TILE_SIZE;
          if (
            wx + TILE_SIZE * 4 < camera.x - halfW ||
            wx - TILE_SIZE * 3 > camera.x + halfW ||
            wy + TILE_SIZE * 4 < camera.y - halfH ||
            wy - TILE_SIZE * 4 > camera.y + halfH
          ) {
            continue;
          }

          // Natural Elements Light Sources (only Árvore-Coração Primordial and Drusa de Cristal Solar)
          const nodeLight = GameRenderer.getNatureNodeLightSpec(node.type);
          if (nodeLight) {
            lightSources.push({
              x: wx + TILE_SIZE / 2,
              y: wy + TILE_SIZE / 2,
              radius: nodeLight.radius,
              color: nodeLight.color,
              strength: nodeLight.strength,
            });
          }

          const isAimedNode =
            Boolean(aimedTarget) &&
            Math.floor(aimedTarget!.worldX / TILE_SIZE) === node.tileX &&
            Math.floor(aimedTarget!.worldY / TILE_SIZE) === node.tileY;
          const isStaticGrassNode =
            node.type === NatureNodeType.SHORT_GRASS ||
            node.type === NatureNodeType.TALL_GRASS;
          renderQueue.push({
            ySort:
              wy +
              TILE_SIZE * (isStaticGrassNode ? 0.55 : 0.9) +
              (node.offsetY || 0),
            draw: (c) =>
              this.drawNatureNode(
                c,
                node,
                globalTime,
                shadowDx,
                player,
                isAimedNode
              ),
          });
        }
      }
    }

    // 1A-Post: Ground Footprints, Water Step Ripples & Expanding Interaction Shockwaves
    this.drawGroundFootprintsAndRipples(ctx);

    // 1B. Optional Hitbox Visualization Overlay around player
    const heldSlot = player.inventory[player.selectedHotbarIndex];
    const heldItem = heldSlot ? ITEMS[heldSlot.itemId] : null;
    if (buildOptions?.showHitboxPreview) {
      this.drawHitboxOverlayAroundPlayer(ctx, world, player);
    }

    // 2. Placement Grid & Connected Continuity Preview if player holds a PLACEABLE item or WOOD_BOAT
    if (
      heldItem &&
      heldItem.category === ItemCategory.PLACEABLE &&
      heldItem.placeableType &&
      targetBuildTile
    ) {
      this.drawBuildPlacementPreview(
        ctx,
        world,
        player,
        heldItem.placeableType,
        targetBuildTile,
        tileAnimFrame,
        globalTime,
        buildOptions
      );
    } else if (heldItem && heldItem.id === 'wood_boat' && targetBuildTile) {
      const canPlaceBoat = world.isTileSwimmableWater(
        targetBuildTile.tx,
        targetBuildTile.ty
      );
      const bx = targetBuildTile.tx * TILE_SIZE;
      const by = targetBuildTile.ty * TILE_SIZE;
      ctx.save();
      ctx.fillStyle = canPlaceBoat
        ? 'rgba(56, 189, 248, 0.24)'
        : 'rgba(239, 68, 68, 0.26)';
      ctx.fillRect(bx + 1, by + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.strokeStyle = canPlaceBoat
        ? 'rgba(56, 189, 248, 0.92)'
        : 'rgba(239, 68, 68, 0.92)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx + 1.5, by + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
      const boatSprite = spriteAtlas.getCreatureSprite(CreatureKind.BOAT, 0, false);
      ctx.globalAlpha = canPlaceBoat ? 0.82 : 0.45;
      ctx.drawImage(boatSprite, bx - 4, by + 4, 40, 24);
      ctx.restore();
    } else if (
      heldItem &&
      heldItem.id === 'bone_fertilizer' &&
      !(
        aimedTarget &&
        aimedTarget.kind === 'crop' &&
        Boolean(aimedTarget.cropType || aimedTarget.structureId)
      )
    ) {
      // Ground Fertilizer 60px Area-of-Effect Circle centered on Player position
      const fertRadiusPx = 60;
      const minFertTx = Math.floor((player.x - fertRadiusPx) / TILE_SIZE);
      const maxFertTx = Math.floor((player.x + fertRadiusPx) / TILE_SIZE);
      const minFertTy = Math.floor((player.y - fertRadiusPx) / TILE_SIZE);
      const maxFertTy = Math.floor((player.y + fertRadiusPx) / TILE_SIZE);
      let hasFertileTileInRadius = false;
      for (let ty = minFertTy; ty <= maxFertTy && !hasFertileTileInRadius; ty++) {
        for (let tx = minFertTx; tx <= maxFertTx; tx++) {
          const cx = tx * TILE_SIZE + TILE_SIZE * 0.5;
          const cy = ty * TILE_SIZE + TILE_SIZE * 0.5;
          if (Math.hypot(cx - player.x, cy - player.y) <= fertRadiusPx + 6) {
            if (world.isTileFertileSoilForGroundFertilizer(tx, ty)) {
              hasFertileTileInRadius = true;
              break;
            }
          }
        }
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(player.x, player.y, fertRadiusPx, 0, Math.PI * 2);
      ctx.fillStyle = hasFertileTileInRadius
        ? 'rgba(74, 222, 128, 0.14)'
        : 'rgba(244, 63, 94, 0.14)';
      ctx.fill();

      ctx.lineWidth = 1.75;
      ctx.strokeStyle = hasFertileTileInRadius
        ? 'rgba(74, 222, 128, 0.88)'
        : 'rgba(244, 63, 94, 0.82)';
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Subtle inner ring accent
      ctx.beginPath();
      ctx.arc(player.x, player.y, fertRadiusPx - 3, 0, Math.PI * 2);
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = hasFertileTileInRadius
        ? 'rgba(187, 247, 208, 0.45)'
        : 'rgba(254, 205, 211, 0.40)';
      ctx.stroke();
      ctx.restore();
    }

    // 2B. Aimed Target Ground Selector (Visual aid for selection and aiming without vector arrow)
    if (aimedTarget) {
      const reticleColor =
        aimedTarget.kind === 'crop'
          ? aimedTarget.cropStage === 3
            ? '#fde047'
            : '#22c55e'
          : aimedTarget.kind === 'station'
          ? '#f59e0b'
          : aimedTarget.kind === 'villager'
          ? '#10b981'
          : aimedTarget.kind === 'wild_animal'
          ? '#f43f5e'
          : aimedTarget.kind === 'death_bag'
          ? '#facc15'
          : '#38bdf8';

      const pulse = Math.sin(globalTime * 8) * 1.6;
      const rx = aimedTarget.worldX - 16 - pulse;
      const ry = aimedTarget.worldY - 16 - pulse;
      const rw = 32 + pulse * 2;
      const rh = 32 + pulse * 2;

      ctx.save();
      // Ground lock-on halo
      ctx.fillStyle = reticleColor;
      ctx.globalAlpha = 0.14;
      ctx.beginPath();
      ctx.ellipse(
        aimedTarget.worldX,
        aimedTarget.worldY + 9,
        15 + pulse,
        7 + pulse * 0.4,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.strokeStyle = reticleColor;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(
        aimedTarget.worldX,
        aimedTarget.worldY + 9,
        15 + pulse,
        7 + pulse * 0.4,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();

      // High-contrast corner brackets with dark outline
      ctx.globalAlpha = 0.98;
      const cLen = 7;
      const drawBrackets = (stroke: string, width: number) => {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(rx, ry + cLen);
        ctx.lineTo(rx, ry);
        ctx.lineTo(rx + cLen, ry);
        ctx.moveTo(rx + rw - cLen, ry);
        ctx.lineTo(rx + rw, ry);
        ctx.lineTo(rx + rw, ry + cLen);
        ctx.moveTo(rx, ry + rh - cLen);
        ctx.lineTo(rx, ry + rh);
        ctx.lineTo(rx + cLen, ry + rh);
        ctx.moveTo(rx + rw - cLen, ry + rh);
        ctx.lineTo(rx + rw, ry + rh);
        ctx.lineTo(rx + rw, ry + rh - cLen);
        ctx.stroke();
      };
      drawBrackets('#120b07', 3.2);
      drawBrackets(reticleColor, 1.8);
      ctx.restore();
    }

    // 3. Dropped Items with Rarity Ground Aura & Floating Glint
    for (const drop of droppedItems) {
      renderQueue.push({
        ySort: drop.y,
        draw: (c) => {
          const bob = Math.sin(drop.bobTimer * 5) * 3;
          const def = ITEMS[drop.itemId];
          const auraColor =
            def?.rarity === 'VERY_RARE'
              ? 'rgba(250, 204, 21, 0.42)'
              : def?.rarity === 'RARE'
              ? 'rgba(56, 189, 248, 0.36)'
              : 'rgba(74, 222, 128, 0.24)';

          // Rarity ground halo ring
          c.save();
          c.strokeStyle = auraColor;
          c.lineWidth = 1.2;
          c.beginPath();
          c.ellipse(
            drop.x,
            drop.y + 5,
            8 + Math.sin(drop.bobTimer * 4) * 1.2,
            3.5,
            0,
            0,
            Math.PI * 2
          );
          c.stroke();
          c.restore();

          c.fillStyle = 'rgba(0,0,0,0.35)';
          c.fillRect(drop.x - 7, drop.y + 5, 14, 3);
          const icon = spriteAtlas.getItemCanvas(drop.itemId, drop.flowerColor);
          c.drawImage(icon, drop.x - 9, drop.y - 11 + bob, 18, 18);

          // Specular item sparkle
          if (Math.sin(drop.bobTimer * 6 + drop.x) > 0.65) {
            c.fillStyle = '#fef08a';
            c.fillRect(drop.x + 4, drop.y - 10 + bob, 2, 2);
          }
        },
      });
    }

    // 3B. Interactive Death Bags ("Bolsinha de Espólios" — 10-minute timer)
    for (const bag of deathBags) {
      if (
        bag.x < camera.x - halfW ||
        bag.x > camera.x + halfW ||
        bag.y < camera.y - halfH ||
        bag.y > camera.y + halfH
      ) {
        continue;
      }

      lightSources.push({
        x: bag.x,
        y: bag.y,
        radius: 100,
        color: '250, 204, 21',
        strength: 1.0,
      });

      renderQueue.push({
        ySort: bag.y + 8,
        draw: (c) => {
          const pulse = Math.sin(globalTime * 4.5) * 2;
          const bob = Math.sin(globalTime * 3.2) * 1.5;
          const bx = Math.round(bag.x);
          const by = Math.round(bag.y + bob);

          // Ground beacon aura ring
          c.save();
          c.strokeStyle =
            bag.expiresTimer < 120
              ? 'rgba(244, 63, 94, 0.78)'
              : 'rgba(250, 204, 21, 0.65)';
          c.lineWidth = 1.5;
          c.beginPath();
          c.ellipse(
            bx,
            Math.round(bag.y) + 7,
            13 + pulse,
            5.5 + pulse * 0.35,
            0,
            0,
            Math.PI * 2
          );
          c.stroke();
          c.restore();

          // Ground shadow
          c.fillStyle = 'rgba(0, 0, 0, 0.45)';
          c.fillRect(bx - 9, Math.round(bag.y) + 5, 18, 4);

          // Tied Leather Death Bag Sprite (Pixel-Art)
          // Outer outline
          c.fillStyle = '#1c1008';
          c.fillRect(bx - 9, by - 8, 18, 15);
          c.fillRect(bx - 5, by - 13, 10, 5);
          // Main leather body
          c.fillStyle = '#78350f';
          c.fillRect(bx - 8, by - 7, 16, 13);
          // Warm leather highlight
          c.fillStyle = '#b45309';
          c.fillRect(bx - 7, by - 6, 11, 10);
          c.fillStyle = '#d97706';
          c.fillRect(bx - 5, by - 4, 6, 6);
          // Top ruffled neck
          c.fillStyle = '#92400e';
          c.fillRect(bx - 4, by - 12, 8, 4);
          // Golden rope tie & clasp
          c.fillStyle = '#facc15';
          c.fillRect(bx - 5, by - 8, 10, 2);
          c.fillStyle = '#fef08a';
          c.fillRect(bx - 2, by - 8, 4, 3);
          // Emblem on pouch
          c.fillStyle = '#fde047';
          c.fillRect(bx - 2, by - 2, 4, 4);
          c.fillStyle = '#f43f5e';
          c.fillRect(bx - 1, by - 1, 2, 2);

          // Countdown timer & item count badge above the bag
          const remSec = Math.max(0, Math.ceil(bag.expiresTimer));
          const mm = String(Math.floor(remSec / 60)).padStart(2, '0');
          const ss = String(remSec % 60).padStart(2, '0');
          const totalStacks =
            bag.items.length + (bag.goldCoins > 0 ? 1 : 0);
          const badgeText = `🎒 Bolsinha (${totalStacks}) · ${mm}:${ss}`;

          c.save();
          c.font = 'bold 8px "Plus Jakarta Sans", sans-serif';
          const tw = c.measureText(badgeText).width;
          const px = bx - tw / 2 - 4;
          const py = by - 26;
          c.fillStyle = 'rgba(18, 11, 7, 0.88)';
          c.fillRect(px, py, tw + 8, 12);
          c.strokeStyle = bag.expiresTimer < 120 ? '#f43f5e' : '#f59e0b';
          c.lineWidth = 1;
          c.strokeRect(px, py, tw + 8, 12);
          c.fillStyle = bag.expiresTimer < 120 ? '#fda4af' : '#fef08a';
          c.fillText(badgeText, bx - tw / 2, py + 9);
          c.restore();
        },
      });
    }

    // 4. Creatures (Animals, Enemies & Villagers)
    for (const cr of creatures) {
      if (cr.isInsideHouse) continue;
      if (
        cr.x < camera.x - halfW ||
        cr.x > camera.x + halfW ||
        cr.y < camera.y - halfH ||
        cr.y > camera.y + halfH
      ) {
        continue;
      }
      // Skip standalone rendering of a pet that is currently riding in the 2nd seat of a Boat
      const isRidingInBoat = creatures.some(
        (b) => b.kind === CreatureKind.BOAT && b.passengerPetId === cr.id
      );
      if (isRidingInBoat) {
        continue;
      }
      const crSwimming =
        cr.kind === CreatureKind.BOAT
          ? false
          : Boolean(cr.isSwimming || world.isWorldPosInWater(cr.x, cr.y));
      renderQueue.push({
        ySort: cr.y + 10,
        draw: (c) =>
          this.drawCreature(
            c,
            cr,
            globalTime,
            shadowDx,
            timeOfDay,
            crSwimming,
            creatures
          ),
      });
    }

    // 4B. Remote Online Players
    for (const rp of remotePlayers) {
      const existingRpMount = rp.mountedEntityId
        ? creatures.find((c) => c.id === rp.mountedEntityId) || null
        : creatures.find(
            (c) =>
              c.kind === 'BOAT' &&
              (c.riderPlayerId === rp.peerId ||
                c.passengerPlayerId === rp.peerId ||
                (Boolean(rp.persistentPlayerId) &&
                  (c.riderPlayerId === rp.persistentPlayerId ||
                    c.passengerPlayerId === rp.persistentPlayerId)))
          ) || null;
      const rpMount = existingRpMount || rp.mountedCreatureData || null;
      const cullX = existingRpMount ? existingRpMount.x : rp.x;
      const cullY = existingRpMount ? existingRpMount.y : rp.y;
      if (
        cullX < camera.x - halfW ||
        cullX > camera.x + halfW ||
        cullY < camera.y - halfH ||
        cullY > camera.y + halfH
      ) {
        continue;
      }
      if (rpMount && !existingRpMount) {
        const syncedRpMount: CreatureEntity = {
          ...rpMount,
          x: rp.x,
          y: rp.y,
          direction: rp.direction,
          animFrame: rp.animFrame,
        };
        const mountSwimming =
          syncedRpMount.kind === 'BOAT'
            ? false
            : Boolean(
                syncedRpMount.isSwimming ||
                  world.isWorldPosInWater(syncedRpMount.x, syncedRpMount.y)
              );
        renderQueue.push({
          ySort: syncedRpMount.y + 10,
          draw: (c) =>
            this.drawCreature(
              c,
              syncedRpMount,
              globalTime,
              shadowDx,
              timeOfDay,
              mountSwimming,
              creatures
            ),
        });
      }
      const rpSwimming = rpMount
        ? false
        : Boolean(rp.isSwimming || world.isWorldPosInWater(rp.x, rp.y));
      renderQueue.push({
        ySort: (rpMount ? rpMount.y : rp.y) + 10.2,
        draw: (c) =>
          this.drawRemotePlayer(c, rp, globalTime, shadowDx, rpSwimming, rpMount),
      });
    }

    // 5. Local Player
    const existingPlayerMount = player.mountedEntityId
      ? creatures.find((c) => c.id === player.mountedEntityId) || null
      : null;
    const playerMount =
      existingPlayerMount || player.mountedCreatureData || null;
    if (playerMount && !existingPlayerMount) {
      const syncedPlayerMount: CreatureEntity = {
        ...playerMount,
        x: player.x,
        y: player.y,
        direction: player.direction,
        animFrame: player.animFrame,
      };
      const mountSwimming =
        syncedPlayerMount.kind === 'BOAT'
          ? false
          : Boolean(
              syncedPlayerMount.isSwimming ||
                world.isWorldPosInWater(syncedPlayerMount.x, syncedPlayerMount.y)
            );
      renderQueue.push({
        ySort: syncedPlayerMount.y + 10,
        draw: (c) =>
          this.drawCreature(
            c,
            syncedPlayerMount,
            globalTime,
            shadowDx,
            timeOfDay,
            mountSwimming,
            creatures
          ),
      });
    }
    const playerSwimming = playerMount
      ? false
      : Boolean(player.isSwimming || world.isWorldPosInWater(player.x, player.y));
    renderQueue.push({
      ySort: (playerMount ? playerMount.y : player.y) + 10.25,
      draw: (c) =>
        this.drawPlayer(c, player, globalTime, shadowDx, playerSwimming, playerMount),
    });

    // Sort by Y and draw all entities/objects
    renderQueue.sort((a, b) => a.ySort - b.ySort);
    for (const item of renderQueue) {
      item.draw(ctx);
    }

    // 5A. Architectural Roof System for Closed Wall Contours:
    // Solid (100% opacity) when player is outside; 20% opacity when player enters the building.
    this.renderBuildingRoofs(
      ctx,
      world,
      player,
      minCx,
      maxCx,
      minCy,
      maxCy,
      dt
    );

    // Re-draw build preview on top if player is actively aiming a placeable item at a roofed structure
    if (
      heldItem &&
      heldItem.category === ItemCategory.PLACEABLE &&
      heldItem.placeableType &&
      targetBuildTile
    ) {
      this.drawBuildPlacementPreview(
        ctx,
        world,
        player,
        heldItem.placeableType,
        targetBuildTile,
        tileAnimFrame,
        globalTime,
        buildOptions
      );
    }

    // 5B. Active Burst Particles & Guardian Totem Lightning Arcs
    this.drawActiveParticlesAndBolts(ctx);

    // 6. AAA Ambient Biome & Atmospheric Particles (Fireflies, Butterflies, Golden Pollen, Sand Motes)
    this.drawAmbientWorldParticles(
      ctx,
      camera,
      world,
      timeOfDay,
      globalTime,
      halfW,
      halfH,
      lightSources
    );

    // 6B. Top-Layer Aimed Target Selector Pointer Arrow & Action Tag (Shows exactly what Interação will act on)
    if (aimedTarget) {
      const bounce = Math.sin(globalTime * 7) * 2.2;
      const tx = Math.round(aimedTarget.worldX);
      const ty = Math.round(aimedTarget.worldY - 22 + bounce);
      const selectorColor =
        aimedTarget.kind === 'crop'
          ? aimedTarget.cropStage === 3
            ? '#fde047'
            : '#22c55e'
          : aimedTarget.kind === 'station'
          ? '#f59e0b'
          : aimedTarget.kind === 'villager'
          ? '#10b981'
          : aimedTarget.kind === 'wild_animal'
          ? '#f43f5e'
          : aimedTarget.kind === 'death_bag'
          ? '#facc15'
          : '#38bdf8';

      ctx.save();
      // Bouncing downward pointer triangle ▼ above target
      ctx.fillStyle = selectorColor;
      ctx.strokeStyle = '#120b07';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tx, ty + 4);
      ctx.lineTo(tx - 5, ty - 3);
      ctx.lineTo(tx + 5, ty - 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Floating pill showing the element name and owner ("Dono: {nome}") without truncation
      const shortLabel =
        aimedTarget.label.length > 64
          ? aimedTarget.label.slice(0, 63) + '…'
          : aimedTarget.label;

      ctx.font = 'bold 7.5px "Plus Jakarta Sans", sans-serif';
      const w1 = ctx.measureText(shortLabel).width;
      const boxW = Math.ceil(w1 + 12);
      const boxH = 13;
      const bx = Math.round(tx - boxW / 2);
      const by = Math.round(ty - 4 - boxH);

      ctx.fillStyle = 'rgba(18, 11, 7, 0.9)';
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.strokeStyle = selectorColor;
      ctx.lineWidth = 1.1;
      ctx.strokeRect(bx, by, boxW, boxH);

      ctx.textAlign = 'center';
      ctx.font = 'bold 7.5px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#fef08a';
      ctx.fillText(shortLabel, tx, by + 9.5);
      ctx.restore();

      // If this aimed element (nature node or structure) is being broken (hp < maxHp),
      // render its break progression bar ABOVE the element's name box so they never overlap!
      const targetTileX = Math.floor(aimedTarget.worldX / TILE_SIZE);
      const targetTileY = Math.floor(aimedTarget.worldY / TILE_SIZE);
      let breakRatio: number | null = null;
      let breakBarColor = '#22c55e';

      const targetChunkCoords = world.tileToChunk(targetTileX, targetTileY);
      const targetChunk =
        world.chunks[
          WorldManager.chunkKey(targetChunkCoords.cx, targetChunkCoords.cy)
        ];
      const aimedNode = targetChunk?.nodes.find(
        (n) => n.tileX === targetTileX && n.tileY === targetTileY
      );
      if (aimedNode && aimedNode.hp < aimedNode.maxHp) {
        breakRatio = aimedNode.hp / aimedNode.maxHp;
        breakBarColor = '#22c55e';
      } else {
        const aimedSt =
          world.getStructureAtTile(targetTileX, targetTileY) ||
          world.getGroundStructureAtTile(targetTileX, targetTileY);
        if (aimedSt && aimedSt.hp < aimedSt.maxHp) {
          breakRatio = aimedSt.hp / aimedSt.maxHp;
          breakBarColor = WorldManager.isSaplingStructure(aimedSt.type)
            ? '#4ade80'
            : '#38bdf8';
        }
      }

      if (breakRatio !== null) {
        this.drawMiniBar(ctx, tx, by - 7, breakRatio, breakBarColor);
      }
    }

    // 7. Floating Damage / Loot Numbers with Pop-In Scale & Fade
    for (const ft of floatingTexts) {
      const progress = 1 - ft.timer / ft.maxTimer;
      const alpha = progress > 0.75 ? Math.max(0, (1 - progress) * 4) : 1;
      const popScale =
        progress < 0.14
          ? 0.75 + (progress / 0.14) * 0.45
          : progress < 0.28
          ? 1.2 - ((progress - 0.14) / 0.14) * 0.2
          : 1.0;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(ft.x, ft.y - progress * 20);
      ctx.scale(popScale, popScale);
      ctx.font = 'bold 9px "Silkscreen", "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0d0805';
      ctx.fillText(ft.text, 1, 1);
      ctx.fillText(ft.text, -1, 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, 0, 0);
      ctx.restore();
    }

    ctx.restore();

    // 8. Day & Night Dynamic Luminous Filter
    const playerLight = GameRenderer.getPlayerLightSpec(
      heldItem?.id || null,
      player.equippedBySlot,
      player.equippedArmorId
    );
    lightSources.push({
      x: player.x,
      y: player.y,
      radius: playerLight.radius,
      color: playerLight.color,
      strength: playerLight.strength,
    });

    for (const rp of remotePlayers) {
      const rpLight = GameRenderer.getPlayerLightSpec(
        rp.heldItemId || null,
        rp.equippedBySlot,
        rp.equippedArmorId
      );
      lightSources.push({
        x: rp.x,
        y: rp.y,
        radius: rpLight.radius,
        color: rpLight.color,
        strength: rpLight.strength,
      });
    }

    this.renderDayNightOverlay(
      ctx,
      camera,
      timeOfDay,
      globalTime,
      lightSources,
      player.hp / Math.max(1, player.maxHp)
    );
  }

  public static isFurnaceInUse(st: PlacedStructure): boolean {
    return Boolean(
      (st.fuelBurnRemaining && st.fuelBurnRemaining > 0) ||
        (st.cookingInputCount && st.cookingInputCount > 0)
    );
  }

  public static getStructureLightSpec(
    st: PlacedStructure
  ): { radius: number; strength: number; color: string } | null {
    switch (st.type) {
      case PlaceableType.TORCH:
        return { radius: 140, strength: 1.0, color: '255, 165, 65' };
      case PlaceableType.IRON_LANTERN:
        return { radius: 200, strength: 1.0, color: '255, 220, 85' };
      case PlaceableType.CAMPFIRE:
        return { radius: 200, strength: 1.0, color: '255, 165, 65' };
      case PlaceableType.FURNACE:
        if (!GameRenderer.isFurnaceInUse(st)) return null;
        return { radius: 80, strength: 0.5, color: '255, 145, 55' };
      case PlaceableType.SOLAR_ALTAR:
        return { radius: 180, strength: 1.0, color: '255, 220, 85' };
      case PlaceableType.HEALING_FOUNTAIN:
        return { radius: 140, strength: 0.5, color: '70, 205, 255' };
      case PlaceableType.GUARDIAN_TOTEM:
        return { radius: 300, strength: 0.8, color: '255, 220, 85' };
      case PlaceableType.VILLAGE_HOUSE:
        return { radius: 175, strength: 1.0, color: '255, 195, 95' };
      case PlaceableType.FLOWER_SOLAR_DROP:
        return { radius: 60, strength: 0.66, color: '255, 220, 85' };
      case PlaceableType.ROYAL_BANNER:
      case PlaceableType.EXPLORER_TENT:
      case PlaceableType.WOOD_WINDOW:
      case PlaceableType.STONE_WINDOW:
      default:
        return null;
    }
  }

  public static getNatureNodeLightSpec(
    type: NatureNodeType
  ): { radius: number; strength: number; color: string } | null {
    switch (type) {
      case NatureNodeType.ANCIENT_WORLD_TREE:
        return { radius: 80, strength: 0.33, color: '60, 225, 160' };
      case NatureNodeType.DESERT_CRYSTAL:
        return { radius: 60, strength: 0.11, color: '255, 200, 65' };
      case NatureNodeType.FLOWER_SOLAR_DROP:
        return { radius: 60, strength: 0.66, color: '255, 220, 85' };
      case NatureNodeType.SUNSTONE_OBELISK:
      case NatureNodeType.PEARL_CLAM:
      default:
        return null;
    }
  }

  public static getPlayerLightSpec(
    heldItemId: string | null | undefined,
    equippedBySlot?: PlayerState['equippedBySlot'],
    equippedArmorId?: string | null
  ): { radius: number; strength: number; color: string } {
    if (heldItemId === 'torch' || heldItemId === 'iron_lantern') {
      return { radius: 200, strength: 1.0, color: '255, 175, 70' };
    }
    const eq = equippedBySlot || {
      head: null,
      body: equippedArmorId || null,
      legs: null,
      feet: null,
    };
    const hasAstralPiece =
      eq.head === 'astral_crown' ||
      eq.body === 'astral_armor' ||
      eq.legs === 'astral_leggings' ||
      eq.feet === 'astral_boots';
    const hasAstralHeldItem =
      heldItemId === 'astral_sword' ||
      heldItemId === 'abyssal_trident' ||
      heldItemId === 'recall_crystal';
    if (hasAstralHeldItem || hasAstralPiece) {
      return { radius: 200, strength: 0.5, color: '95, 210, 255' };
    }
    return { radius: 100, strength: 0.33, color: '255, 230, 140' };
  }

  /**
   * Renders responsive pitched roofs for all closed wall contours in the active view.
   * Outside the building: 100% solid roof sprite.
   * Inside the building (or stepping through its doorway): 20% opacity so everything below is visible.
   */
  private renderBuildingRoofs(
    ctx: CanvasRenderingContext2D,
    world: WorldManager,
    player: PlayerState,
    minCx: number,
    maxCx: number,
    minCy: number,
    maxCy: number,
    dt: number
  ): void {
    const roofs = this.roofSystem.getRoofsForRegion(
      world,
      minCx,
      maxCx,
      minCy,
      maxCy
    );
    if (roofs.length === 0) return;

    for (const roof of roofs) {
      const isInside = this.roofSystem.isWorldPosInsideBuilding(
        player.x,
        player.y,
        roof
      );
      const alpha = this.roofSystem.getUpdatedRoofAlpha(roof, isInside, dt);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        roof.canvas,
        roof.canvasWorldX,
        roof.canvasWorldY,
        roof.canvasWidth,
        roof.canvasHeight
      );
      ctx.restore();
    }
  }

  /**
   * Returns the representative ground color and soft transition color for a tile `(tx, ty)`
   * so neighboring cells can blend organically across both biome borders and sub-zone shifts.
   */
  private getTileOrganicBlendColors(
    world: WorldManager,
    tx: number,
    ty: number,
    biome: BiomeType,
    subZone?: number
  ): { solid: string; mid: string; soft: string } {
    const z = subZone !== undefined ? subZone : world.getTileSubZone(tx, ty, biome);
    if (biome === BiomeType.DESERT || (biome === BiomeType.ISLAND && z === 1)) {
      if (z === 0) {
        return {
          solid: '#cfa95e',
          mid: 'rgba(207, 169, 94, 0.72)',
          soft: 'rgba(207, 169, 94, 0.35)',
        };
      }
      if (z === 2) {
        return {
          solid: '#d4a459',
          mid: 'rgba(212, 164, 89, 0.72)',
          soft: 'rgba(212, 164, 89, 0.35)',
        };
      }
      return {
        solid: '#dfc072',
        mid: 'rgba(223, 192, 114, 0.72)',
        soft: 'rgba(223, 192, 114, 0.35)',
      };
    }
    if (biome === BiomeType.TEMPERATE_FOREST) {
      return {
        solid: '#275332',
        mid: 'rgba(39, 83, 50, 0.72)',
        soft: 'rgba(39, 83, 50, 0.36)',
      };
    }
    if (biome === BiomeType.TAIGA_FOREST) {
      return {
        solid: '#2d574c',
        mid: 'rgba(45, 87, 76, 0.72)',
        soft: 'rgba(45, 87, 76, 0.36)',
      };
    }
    if (biome === BiomeType.FOREST) {
      return {
        solid: '#3d7a37',
        mid: 'rgba(61, 122, 55, 0.72)',
        soft: 'rgba(61, 122, 55, 0.36)',
      };
    }
    // PLAINS / ISLAND interior
    if (z === 0) {
      return {
        solid: '#34783d',
        mid: 'rgba(52, 120, 61, 0.68)',
        soft: 'rgba(52, 120, 61, 0.32)',
      };
    }
    if (z === 2) {
      return {
        solid: '#618a39',
        mid: 'rgba(97, 138, 57, 0.68)',
        soft: 'rgba(97, 138, 57, 0.32)',
      };
    }
    return {
      solid: '#41853c',
      mid: 'rgba(65, 133, 60, 0.68)',
      soft: 'rgba(65, 133, 60, 0.32)',
    };
  }

  /**
   * Draws an organic, scalloped, multi-layered transition along one edge of a 32x32 tile
   * so cell X and cell Y blend with natural curved tufts/lobes rather than a hard straight line.
   */
  private drawOrganicEdgeLobes(
    ctx: CanvasRenderingContext2D,
    wx: number,
    wy: number,
    tx: number,
    ty: number,
    side: 'N' | 'S' | 'W' | 'E',
    colors: { solid: string; mid: string; soft: string },
    depthScale = 1.0
  ): void {
    const phase = (tx * 7 + ty * 13) & 7;
    // 8 segments of 4px along the 32px edge with deterministic organic wave depth
    for (let s = 0; s < 8; s++) {
      const wave =
        Math.sin((s + phase) * 1.15) * 0.5 +
        Math.cos((s * 2 - phase) * 0.9) * 0.5;
      const dSolid = Math.max(1, Math.round((2.6 + wave * 1.6) * depthScale));
      const dMid = Math.max(2, Math.round((5.2 + wave * 2.4) * depthScale));
      const dSoft = Math.max(4, Math.round((8.4 + wave * 3.0) * depthScale));
      const offset = s * 4;

      if (side === 'N') {
        ctx.fillStyle = colors.soft;
        ctx.fillRect(wx + offset, wy, 4, dSoft);
        ctx.fillStyle = colors.mid;
        ctx.fillRect(wx + offset, wy, 4, dMid);
        ctx.fillStyle = colors.solid;
        ctx.fillRect(wx + offset, wy, 4, dSolid);
      } else if (side === 'S') {
        ctx.fillStyle = colors.soft;
        ctx.fillRect(wx + offset, wy + TILE_SIZE - dSoft, 4, dSoft);
        ctx.fillStyle = colors.mid;
        ctx.fillRect(wx + offset, wy + TILE_SIZE - dMid, 4, dMid);
        ctx.fillStyle = colors.solid;
        ctx.fillRect(wx + offset, wy + TILE_SIZE - dSolid, 4, dSolid);
      } else if (side === 'W') {
        ctx.fillStyle = colors.soft;
        ctx.fillRect(wx, wy + offset, dSoft, 4);
        ctx.fillStyle = colors.mid;
        ctx.fillRect(wx, wy + offset, dMid, 4);
        ctx.fillStyle = colors.solid;
        ctx.fillRect(wx, wy + offset, dSolid, 4);
      } else {
        ctx.fillStyle = colors.soft;
        ctx.fillRect(wx + TILE_SIZE - dSoft, wy + offset, dSoft, 4);
        ctx.fillStyle = colors.mid;
        ctx.fillRect(wx + TILE_SIZE - dMid, wy + offset, dMid, 4);
        ctx.fillStyle = colors.solid;
        ctx.fillRect(wx + TILE_SIZE - dSolid, wy + offset, dSolid, 4);
      }
    }
  }

  /**
   * Draws a rounded organic corner patch when two adjacent edges or a diagonal neighbor differ,
   * eliminating 90-degree blocky tile corners.
   */
  private drawOrganicCornerPatch(
    ctx: CanvasRenderingContext2D,
    wx: number,
    wy: number,
    corner: 'NW' | 'NE' | 'SW' | 'SE',
    colors: { solid: string; mid: string; soft: string },
    size = 8
  ): void {
    const sSoft = size;
    const sMid = Math.max(3, Math.round(size * 0.65));
    const sSolid = Math.max(2, Math.round(size * 0.38));

    const drawStepCorner = (cSize: number, color: string) => {
      ctx.fillStyle = color;
      const half = Math.max(1, Math.floor(cSize * 0.6));
      if (corner === 'NW') {
        ctx.fillRect(wx, wy, cSize, half);
        ctx.fillRect(wx, wy, half, cSize);
      } else if (corner === 'NE') {
        ctx.fillRect(wx + TILE_SIZE - cSize, wy, cSize, half);
        ctx.fillRect(wx + TILE_SIZE - half, wy, half, cSize);
      } else if (corner === 'SW') {
        ctx.fillRect(wx, wy + TILE_SIZE - half, cSize, half);
        ctx.fillRect(wx, wy + TILE_SIZE - cSize, half, cSize);
      } else {
        ctx.fillRect(wx + TILE_SIZE - cSize, wy + TILE_SIZE - half, cSize, half);
        ctx.fillRect(wx + TILE_SIZE - half, wy + TILE_SIZE - cSize, half, cSize);
      }
    };

    drawStepCorner(sSoft, colors.soft);
    drawStepCorner(sMid, colors.mid);
    drawStepCorner(sSolid, colors.solid);
  }

  /**
   * Seamless Organic Auto-Tiling for Coastlines (Ocean <-> Land) & Terrestrial Ecotones.
   * Eliminates hard square tile seams and creates curved, organic transitions between cells.
   */
  private drawSeamlessBiomeBorders(
    ctx: CanvasRenderingContext2D,
    world: WorldManager,
    tx: number,
    ty: number,
    wx: number,
    wy: number,
    biome: BiomeType,
    globalTime: number
  ): void {
    const n = world.getTileBiomeFast(tx, ty - 1);
    const s = world.getTileBiomeFast(tx, ty + 1);
    const e = world.getTileBiomeFast(tx + 1, ty);
    const w = world.getTileBiomeFast(tx - 1, ty);

    // =========================================================================
    // A. OCEAN COASTLINE AUTO-TILING (Organic Curved Sand Shelf, Lip & Seafoam)
    // =========================================================================
    if (biome === BiomeType.OCEAN) {
      const nLand = n !== BiomeType.OCEAN;
      const sLand = s !== BiomeType.OCEAN;
      const eLand = e !== BiomeType.OCEAN;
      const wLand = w !== BiomeType.OCEAN;

      const nw = world.getTileBiomeFast(tx - 1, ty - 1);
      const ne = world.getTileBiomeFast(tx + 1, ty - 1);
      const sw = world.getTileBiomeFast(tx - 1, ty + 1);
      const se = world.getTileBiomeFast(tx + 1, ty + 1);
      const nwLand = nw !== BiomeType.OCEAN;
      const neLand = ne !== BiomeType.OCEAN;
      const swLand = sw !== BiomeType.OCEAN;
      const seLand = se !== BiomeType.OCEAN;

      const shelfColors = {
        solid: '#d6b065',
        mid: 'rgba(217, 169, 92, 0.58)',
        soft: 'rgba(217, 169, 92, 0.28)',
      };

      if (nLand || sLand || eLand || wLand) {
        const waveOffset = Math.round(
          Math.sin(globalTime * 3.2 + tx * 0.8 + ty * 0.6) * 2
        );
        const foamDist = 5 + waveOffset;

        // 1. Organic scalloped submerged sandbank & shoreline lip along land edges
        if (nLand) {
          this.drawOrganicEdgeLobes(ctx, wx, wy, tx, ty, 'N', shelfColors, 1.15);
          const lipColors = this.getTileOrganicBlendColors(world, tx, ty - 1, n);
          this.drawOrganicEdgeLobes(ctx, wx, wy, tx, ty, 'N', lipColors, 0.55);
        }
        if (sLand) {
          this.drawOrganicEdgeLobes(ctx, wx, wy, tx, ty, 'S', shelfColors, 1.15);
          const lipColors = this.getTileOrganicBlendColors(world, tx, ty + 1, s);
          this.drawOrganicEdgeLobes(ctx, wx, wy, tx, ty, 'S', lipColors, 0.55);
        }
        if (wLand) {
          this.drawOrganicEdgeLobes(ctx, wx, wy, tx, ty, 'W', shelfColors, 1.15);
          const lipColors = this.getTileOrganicBlendColors(world, tx - 1, ty, w);
          this.drawOrganicEdgeLobes(ctx, wx, wy, tx, ty, 'W', lipColors, 0.55);
        }
        if (eLand) {
          this.drawOrganicEdgeLobes(ctx, wx, wy, tx, ty, 'E', shelfColors, 1.15);
          const lipColors = this.getTileOrganicBlendColors(world, tx + 1, ty, e);
          this.drawOrganicEdgeLobes(ctx, wx, wy, tx, ty, 'E', lipColors, 0.55);
        }

        // Round inner coves where two land edges meet
        if (nLand && wLand) {
          this.drawOrganicCornerPatch(ctx, wx, wy, 'NW', shelfColors, 13);
        }
        if (nLand && eLand) {
          this.drawOrganicCornerPatch(ctx, wx, wy, 'NE', shelfColors, 13);
        }
        if (sLand && wLand) {
          this.drawOrganicCornerPatch(ctx, wx, wy, 'SW', shelfColors, 13);
        }
        if (sLand && eLand) {
          this.drawOrganicCornerPatch(ctx, wx, wy, 'SE', shelfColors, 13);
        }

        // 2. Animated White-Turquoise Seafoam Wave Line following the organic contour
        ctx.fillStyle = '#e0f2fe';
        if (nLand) {
          for (let px = 2; px < TILE_SIZE - 2; px += 6) {
            const curve = Math.round(Math.sin((px + tx * 5) * 0.35) * 1.5);
            ctx.fillRect(wx + px, wy + foamDist + curve, 4, 2);
          }
        }
        if (sLand) {
          for (let px = 2; px < TILE_SIZE - 2; px += 6) {
            const curve = Math.round(Math.sin((px + tx * 5) * 0.35) * 1.5);
            ctx.fillRect(wx + px, wy + TILE_SIZE - foamDist - 2 - curve, 4, 2);
          }
        }
        if (wLand) {
          for (let py = 2; py < TILE_SIZE - 2; py += 6) {
            const curve = Math.round(Math.cos((py + ty * 5) * 0.35) * 1.5);
            ctx.fillRect(wx + foamDist + curve, wy + py, 2, 4);
          }
        }
        if (eLand) {
          for (let py = 2; py < TILE_SIZE - 2; py += 6) {
            const curve = Math.round(Math.cos((py + ty * 5) * 0.35) * 1.5);
            ctx.fillRect(wx + TILE_SIZE - foamDist - 2 - curve, wy + py, 2, 4);
          }
        }
      }

      // Check outer diagonal corners for rounded island/peninsula tips
      if (!nLand && !wLand && nwLand) {
        this.drawOrganicCornerPatch(ctx, wx, wy, 'NW', shelfColors, 9);
      }
      if (!nLand && !eLand && neLand) {
        this.drawOrganicCornerPatch(ctx, wx, wy, 'NE', shelfColors, 9);
      }
      if (!sLand && !wLand && swLand) {
        this.drawOrganicCornerPatch(ctx, wx, wy, 'SW', shelfColors, 9);
      }
      if (!sLand && !eLand && seLand) {
        this.drawOrganicCornerPatch(ctx, wx, wy, 'SE', shelfColors, 9);
      }
    }

    // =========================================================================
    // A2. RIVER CURRENT STREAKS & COASTAL SURF WAVES PUSHING TOWARD BEACH
    // =========================================================================
    if (biome === BiomeType.OCEAN) {
      const current = world.getWaterCurrentAtTile(tx, ty, globalTime);
      if (current.kind === 'river') {
        const cMag = Math.hypot(current.vx, current.vy);
        if (cMag > 0.1) {
          const dirX = current.vx / cMag;
          const dirY = current.vy / cMag;
          const phase = (globalTime * 18 + (tx * 7 + ty * 11)) % 16;
          const cx = wx + 16 + dirX * (phase - 8);
          const cy = wy + 16 + dirY * (phase - 8);

          ctx.strokeStyle = 'rgba(186, 230, 253, 0.58)';
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(cx - dirX * 4, cy - dirY * 4);
          ctx.lineTo(cx + dirX * 4, cy + dirY * 4);
          ctx.stroke();

          const phase2 = (globalTime * 18 + (tx * 13 + ty * 5) + 8) % 16;
          const cx2 = wx + 16 - dirY * 6 + dirX * (phase2 - 8);
          const cy2 = wy + 16 + dirX * 6 + dirY * (phase2 - 8);
          ctx.strokeStyle = 'rgba(224, 242, 254, 0.42)';
          ctx.beginPath();
          ctx.moveTo(cx2 - dirX * 3, cy2 - dirY * 3);
          ctx.lineTo(cx2 + dirX * 3, cy2 + dirY * 3);
          ctx.stroke();
        }
      } else if (
        current.kind === 'ocean_shore' &&
        (tx + ty) % 2 === 0
      ) {
        const cMag = Math.hypot(current.vx, current.vy);
        if (cMag > 0.1) {
          const dirX = current.vx / cMag;
          const dirY = current.vy / cMag;
          const perpX = -dirY;
          const perpY = dirX;
          const progress = (globalTime * 1.4 + (tx * 0.37 + ty * 0.53)) % 1;
          const waveCx = wx + 16 + dirX * (progress * 14 - 7);
          const waveCy = wy + 16 + dirY * (progress * 14 - 7);

          ctx.strokeStyle = `rgba(224, 242, 254, ${(
            (1 - Math.abs(progress - 0.5) * 1.8) *
            0.55
          ).toFixed(2)})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(waveCx - perpX * 5, waveCy - perpY * 5);
          ctx.lineTo(waveCx + perpX * 5, waveCy + perpY * 5);
          ctx.stroke();
        }
      }
      return;
    }

    // =========================================================================
    // B. TERRESTRIAL CELL-TO-CELL ORGANIC BLENDING (Biomes & Sub-Zones)
    // =========================================================================
    const mySub = world.getTileSubZone(tx, ty, biome);

    // Priority order so lush vegetation/forests/grass naturally overlap onto drier/flatter ground
    const getVisualBlendRank = (b: BiomeType, sub: number): number => {
      if (b === BiomeType.OCEAN) return 0;
      if (b === BiomeType.DESERT || (b === BiomeType.ISLAND && sub === 1)) {
        return 10 + sub;
      }
      if (b === BiomeType.PLAINS || b === BiomeType.ISLAND) {
        return 20 + (2 - sub);
      }
      if (b === BiomeType.FOREST) return 30 + (2 - sub);
      if (b === BiomeType.TEMPERATE_FOREST) return 40 + (2 - sub);
      if (b === BiomeType.TAIGA_FOREST) return 50 + (2 - sub);
      return 20;
    };

    const myRank = getVisualBlendRank(biome, mySub);

    const checkNeighborBlend = (
      nx: number,
      ny: number,
      nb: BiomeType
    ): { solid: string; mid: string; soft: string; isBiomeChange: boolean } | null => {
      if (nb === BiomeType.OCEAN) return null;
      const nSub = world.getTileSubZone(nx, ny, nb);
      if (nb === biome && nSub === mySub) return null;
      const nRank = getVisualBlendRank(nb, nSub);
      if (nRank <= myRank) return null;
      const cols = this.getTileOrganicBlendColors(world, nx, ny, nb, nSub);
      return { ...cols, isBiomeChange: nb !== biome };
    };

    const nBlend = checkNeighborBlend(tx, ty - 1, n);
    const sBlend = checkNeighborBlend(tx, ty + 1, s);
    const wBlend = checkNeighborBlend(tx - 1, ty, w);
    const eBlend = checkNeighborBlend(tx + 1, ty, e);

    if (nBlend) {
      this.drawOrganicEdgeLobes(
        ctx,
        wx,
        wy,
        tx,
        ty,
        'N',
        nBlend,
        nBlend.isBiomeChange ? 1.05 : 0.72
      );
    }
    if (sBlend) {
      this.drawOrganicEdgeLobes(
        ctx,
        wx,
        wy,
        tx,
        ty,
        'S',
        sBlend,
        sBlend.isBiomeChange ? 1.05 : 0.72
      );
    }
    if (wBlend) {
      this.drawOrganicEdgeLobes(
        ctx,
        wx,
        wy,
        tx,
        ty,
        'W',
        wBlend,
        wBlend.isBiomeChange ? 1.05 : 0.72
      );
    }
    if (eBlend) {
      this.drawOrganicEdgeLobes(
        ctx,
        wx,
        wy,
        tx,
        ty,
        'E',
        eBlend,
        eBlend.isBiomeChange ? 1.05 : 0.72
      );
    }

    // Inner & outer diagonal corner rounding so biome and sub-zone transitions curve organically
    if (nBlend && wBlend) {
      this.drawOrganicCornerPatch(ctx, wx, wy, 'NW', nBlend, 11);
    } else if (!nBlend && !wBlend) {
      const nw = world.getTileBiomeFast(tx - 1, ty - 1);
      const nwBlend = checkNeighborBlend(tx - 1, ty - 1, nw);
      if (nwBlend) {
        this.drawOrganicCornerPatch(ctx, wx, wy, 'NW', nwBlend, 7);
      }
    }

    if (nBlend && eBlend) {
      this.drawOrganicCornerPatch(ctx, wx, wy, 'NE', nBlend, 11);
    } else if (!nBlend && !eBlend) {
      const ne = world.getTileBiomeFast(tx + 1, ty - 1);
      const neBlend = checkNeighborBlend(tx + 1, ty - 1, ne);
      if (neBlend) {
        this.drawOrganicCornerPatch(ctx, wx, wy, 'NE', neBlend, 7);
      }
    }

    if (sBlend && wBlend) {
      this.drawOrganicCornerPatch(ctx, wx, wy, 'SW', sBlend, 11);
    } else if (!sBlend && !wBlend) {
      const sw = world.getTileBiomeFast(tx - 1, ty + 1);
      const swBlend = checkNeighborBlend(tx - 1, ty + 1, sw);
      if (swBlend) {
        this.drawOrganicCornerPatch(ctx, wx, wy, 'SW', swBlend, 7);
      }
    }

    if (sBlend && eBlend) {
      this.drawOrganicCornerPatch(ctx, wx, wy, 'SE', sBlend, 11);
    } else if (!sBlend && !eBlend) {
      const se = world.getTileBiomeFast(tx + 1, ty + 1);
      const seBlend = checkNeighborBlend(tx + 1, ty + 1, se);
      if (seBlend) {
        this.drawOrganicCornerPatch(ctx, wx, wy, 'SE', seBlend, 7);
      }
    }
  }

  /**
   * Minimalist Ground Micro-Decorations (sparse pebbles, shells, and subtle forest moss)
   * Keeps the ground aesthetic clean and uncluttered while maintaining natural variety.
   */
  private drawTileMicroDetails(
    ctx: CanvasRenderingContext2D,
    world: WorldManager,
    tx: number,
    ty: number,
    wx: number,
    wy: number,
    biome: BiomeType,
    subZone: number,
    globalTime: number
  ): void {
    const h = world.getTileDetailHash(tx, ty, 313);
    // Minimalist density: >92% of tiles have zero extra micro-clutter
    if (h > 0.08) return;

    const ox = Math.floor(world.getTileDetailHash(tx, ty, 509) * 18) + 7;
    const oy = Math.floor(world.getTileDetailHash(tx, ty, 701) * 18) + 7;
    const sway = Math.round(Math.sin(globalTime * 2.4 + tx + ty) * 1);

    if (biome === BiomeType.PLAINS || biome === BiomeType.ISLAND) {
      const zone = world.getEcologicalZoneAtTile(tx, ty);
      if (zone === EcologicalZone.COASTAL_TROPICS) {
        // Subtle beach seashell
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(wx + ox, wy + oy, 3, 2);
      } else if (zone === EcologicalZone.ROCKY_HIGHLANDS) {
        // Small smooth pebble
        ctx.fillStyle = '#64748b';
        ctx.fillRect(wx + ox, wy + oy, 4, 2);
      } else {
        // Minimalist soft clover / blade accent
        ctx.fillStyle = '#2e6b34';
        ctx.fillRect(wx + ox, wy + oy + 1, 3, 2);
        ctx.fillStyle = '#529e5a';
        ctx.fillRect(wx + ox + sway, wy + oy, 2, 2);
      }
    } else if (biome === BiomeType.DESERT) {
      ctx.fillStyle = '#b89047';
      ctx.fillRect(wx + ox, wy + oy, 3, 2);
    } else if (biome === BiomeType.OCEAN && subZone === 0 && h < 0.04) {
      ctx.fillStyle = '#15803d';
      ctx.fillRect(wx + ox + sway, wy + oy, 5, 4);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(wx + ox + 1 + sway, wy + oy + 1, 3, 2);
    }
  }

  private drawNatureNode(
    ctx: CanvasRenderingContext2D,
    node: NatureNode,
    globalTime: number,
    shadowDx: number,
    player?: PlayerState,
    isAimed = false
  ): void {
    // Deterministic spatial hashes for natural morphological variety, width variation, height variation & mirror flip
    const hVar =
      (((node.tileX * 374761393 + node.tileY * 668265263) ^ 0x5bf03635) >>> 0) % 1000;
    const wHash =
      (((node.tileX * 1103515245 + node.tileY * 12345) ^ 0x27d4eb2d) >>> 0) % 1000;
    const hHash =
      (((node.tileX * 214013 + node.tileY * 2531011) ^ 0x85ebca6b) >>> 0) % 1000;

    const variant =
      node.type === NatureNodeType.PINE_TREE && node.variant !== undefined
        ? node.variant & 1
        : hVar % 3; // 0, 1, or 2 morphological silhouette
    const wNorm = wHash / 999; // 0.0 .. 1.0 independent width factor
    const hNorm = hHash / 999; // 0.0 .. 1.0 independent height factor
    const mirrorX = (hVar & 1) === 1;

    const wx = node.tileX * TILE_SIZE;
    const wy = node.tileY * TILE_SIZE;

    if (
      node.type === NatureNodeType.FLOWER_TULIP ||
      node.type === NatureNodeType.FLOWER_LILY ||
      node.type === NatureNodeType.FLOWER_SUNFLOWER ||
      node.type === NatureNodeType.FLOWER_SOLAR_DROP
    ) {
      const itemId =
        node.type === NatureNodeType.FLOWER_TULIP
          ? 'flower_tulip'
          : node.type === NatureNodeType.FLOWER_LILY
          ? 'flower_lily'
          : node.type === NatureNodeType.FLOWER_SUNFLOWER
          ? 'flower_sunflower'
          : 'flower_solar_drop';
      this.drawFlowerInWorld(
        ctx,
        itemId,
        node.flowerColor || 'amarelo',
        wx,
        wy,
        node.tileX,
        node.tileY,
        globalTime,
        node.hitFlashTimer > 0,
        node.hp,
        node.maxHp,
        isAimed
      );
      return;
    }

    const isStaticGrass =
      node.type === NatureNodeType.SHORT_GRASS ||
      node.type === NatureNodeType.TALL_GRASS;
    const animFrame = isStaticGrass
      ? 0
      : Math.floor(globalTime * 2.2 + node.animOffset) % 4;
    const sprite = spriteAtlas.getNatureSprite(node.type, animFrame, variant);

    const isLargeTree =
      node.type === NatureNodeType.OAK_TREE ||
      node.type === NatureNodeType.HARDWOOD_TREE ||
      node.type === NatureNodeType.TEMPERATE_TREE ||
      node.type === NatureNodeType.PINE_TREE ||
      node.type === NatureNodeType.ANCIENT_WORLD_TREE ||
      node.type === NatureNodeType.PALM_TREE;
    const isFoliage =
      isLargeTree ||
      node.type === NatureNodeType.BERRY_BUSH ||
      node.type === NatureNodeType.CACTUS;

    // Compute realistic dimensions (width & height) relative to the player (30x30 canvas, ~26px body height)
    let drawW = 36;
    let drawH = 36;
    let groundPadY = 3; // how far below tile bottom the base root/rock sits

    switch (node.type) {
      case NatureNodeType.OAK_TREE:
        if (variant === 0) {
          // Mature Classic Broad Oak (2.0–2.4 tiles wide, 2.3–2.75 tiles tall)
          drawW = Math.round(64 + wNorm * 14);
          drawH = Math.round(74 + hNorm * 14);
        } else if (variant === 1) {
          // Young / Tall Slender Woodland Oak (1.65–2.0 tiles wide, 2.1–2.85 tiles tall)
          drawW = Math.round(52 + wNorm * 12);
          drawH = Math.round(68 + hNorm * 22);
        } else {
          // Ancient Spreading Patriarch Oak (2.45–2.95 tiles wide, 2.6–3.05 tiles tall)
          drawW = Math.round(78 + wNorm * 16);
          drawH = Math.round(84 + hNorm * 14);
        }
        groundPadY = 4;
        break;

      case NatureNodeType.TEMPERATE_TREE:
        // Grandes e altas árvores de Floresta Temperada (cor mais escura)
        drawW = Math.round(76 + wNorm * 18);
        drawH = Math.round(94 + hNorm * 20);
        groundPadY = 5;
        break;

      case NatureNodeType.PINE_TREE:
        if (variant === 1) {
          // Pinheiro Pequeno de Taiga
          drawW = Math.round(38 + wNorm * 8);
          drawH = Math.round(52 + hNorm * 10);
          groundPadY = 3;
        } else {
          // Pinheiro Alto de Taiga
          drawW = Math.round(56 + wNorm * 12);
          drawH = Math.round(88 + hNorm * 18);
          groundPadY = 4;
        }
        break;

      case NatureNodeType.HARDWOOD_TREE:
        if (variant === 0) {
          // Broad Golden-Amber Hardwood
          drawW = Math.round(70 + wNorm * 16);
          drawH = Math.round(82 + hNorm * 14);
        } else if (variant === 1) {
          // Towering Crimson-Gold Spire Hardwood
          drawW = Math.round(64 + wNorm * 12);
          drawH = Math.round(92 + hNorm * 18);
        } else {
          // Wide Twin-Crown Patriarch Hardwood
          drawW = Math.round(82 + wNorm * 16);
          drawH = Math.round(86 + hNorm * 16);
        }
        groundPadY = 4;
        break;

      case NatureNodeType.ANCIENT_WORLD_TREE:
        // Colossal Sacred Yggdrasil Landmark (3.3–3.9 tiles wide, 3.75–4.3 tiles tall)
        drawW = Math.round(106 + wNorm * 18);
        drawH = Math.round(120 + hNorm * 18);
        groundPadY = 6;
        break;

      case NatureNodeType.PALM_TREE:
        if (variant === 0) {
          // Sweeping Coastal Coconut Palm
          drawW = Math.round(58 + wNorm * 14);
          drawH = Math.round(72 + hNorm * 16);
        } else if (variant === 1) {
          // Tall Royal Oasis Palm
          drawW = Math.round(54 + wNorm * 12);
          drawH = Math.round(82 + hNorm * 16);
        } else {
          // Wide Leaning Lagoon Palm
          drawW = Math.round(64 + wNorm * 14);
          drawH = Math.round(68 + hNorm * 14);
        }
        groundPadY = 4;
        break;

      case NatureNodeType.CACTUS:
        if (variant === 0) {
          // Towering Desert Saguaro (1.4–2.1x player height)
          drawW = Math.round(34 + wNorm * 8);
          drawH = Math.round(48 + hNorm * 18);
        } else if (variant === 1) {
          // Wide Multi-Arm Candelabra Cactus
          drawW = Math.round(42 + wNorm * 10);
          drawH = Math.round(44 + hNorm * 14);
        } else {
          // Compact Twin Barrel/Column Cactus Cluster
          drawW = Math.round(30 + wNorm * 10);
          drawH = Math.round(34 + hNorm * 12);
        }
        groundPadY = 3;
        break;

      case NatureNodeType.BERRY_BUSH:
        if (variant === 0) {
          // Classic Woodland Berry Shrub (waist-high to player)
          drawW = Math.round(26 + wNorm * 5);
          drawH = Math.round(20 + hNorm * 4);
        } else if (variant === 1) {
          // Wide Sprawling Bramble Thicket
          drawW = Math.round(31 + wNorm * 6);
          drawH = Math.round(21 + hNorm * 5);
        } else {
          // Compact Young Berry Bush
          drawW = Math.round(21 + wNorm * 4);
          drawH = Math.round(17 + hNorm * 4);
        }
        groundPadY = 1;
        break;

      case NatureNodeType.SAND_DUNE:
        drawW = Math.round(28 + wNorm * 6);
        drawH = Math.round(18 + hNorm * 4);
        groundPadY = 0;
        break;

      case NatureNodeType.BOULDER:
      case NatureNodeType.IRON_OUTCROP:
        if (variant === 0) {
          // Heavy Craggy Outcrop
          drawW = Math.round(33 + wNorm * 7);
          drawH = Math.round(28 + hNorm * 7);
        } else if (variant === 1) {
          // Tall Jagged Monolith Spire
          drawW = Math.round(30 + wNorm * 6);
          drawH = Math.round(37 + hNorm * 10);
        } else {
          // Wide Multi-Boulder Cluster
          drawW = Math.round(40 + wNorm * 9);
          drawH = Math.round(27 + hNorm * 8);
        }
        groundPadY = 2;
        break;

      case NatureNodeType.DESERT_CRYSTAL:
        // Towering Translucent Solar Quartz Spires
        drawW = Math.round(34 + wNorm * 12);
        drawH = Math.round(42 + hNorm * 16);
        groundPadY = 3;
        break;

      case NatureNodeType.SUNSTONE_OBELISK:
        // Monumental Levitating Astral Monolith (~2.5x player height)
        drawW = Math.round(46 + wNorm * 10);
        drawH = Math.round(74 + hNorm * 14);
        groundPadY = 4;
        break;

      case NatureNodeType.PEARL_CLAM:
        // Giant Reef Tridacna Clam (wider than tall)
        drawW = Math.round(40 + wNorm * 10);
        drawH = Math.round(30 + hNorm * 8);
        groundPadY = 2;
        break;

      case NatureNodeType.SHORT_GRASS:
        drawW = 24;
        drawH = 24;
        groundPadY = 0;
        break;

      case NatureNodeType.TALL_GRASS:
        drawW = 28;
        drawH = 28;
        groundPadY = 1;
        break;
    }

    const centerX = wx + TILE_SIZE / 2 + (node.offsetX || 0);
    const baseY = wy + TILE_SIZE + groundPadY + (node.offsetY || 0);
    const drawX = Math.round(centerX - drawW / 2);
    const drawY = Math.round(baseY - drawH);

    // Directional Sun/Moon Dappled Ground Shadow scaled to the element's actual width (omitted for subtle SAND_DUNE and static grass)
    if (node.type !== NatureNodeType.SAND_DUNE && !isStaticGrass) {
      const shadowW = Math.round(drawW * (isLargeTree ? 0.68 : 0.76));
      const shadowH = isLargeTree
        ? 9
        : node.type === NatureNodeType.BERRY_BUSH
        ? 4
        : 6;
      ctx.fillStyle = isLargeTree
        ? 'rgba(8, 12, 18, 0.32)'
        : 'rgba(8, 12, 18, 0.24)';
      ctx.fillRect(
        Math.round(centerX - shadowW / 2 + shadowDx),
        wy + TILE_SIZE - Math.round(shadowH * 0.65),
        shadowW,
        shadowH
      );
    }

    // Sacred Ground Aura under Ancient World Tree, Sunstone Obelisk & Pearl Clam
    if (
      node.type === NatureNodeType.ANCIENT_WORLD_TREE ||
      node.type === NatureNodeType.SUNSTONE_OBELISK ||
      node.type === NatureNodeType.PEARL_CLAM
    ) {
      const auraPulse = Math.sin(globalTime * 3.2 + node.animOffset) * 2.5;
      const auraRx =
        node.type === NatureNodeType.ANCIENT_WORLD_TREE
          ? 28 + auraPulse
          : node.type === NatureNodeType.SUNSTONE_OBELISK
          ? 20 + auraPulse
          : 17 + auraPulse;
      ctx.save();
      ctx.strokeStyle =
        node.type === NatureNodeType.ANCIENT_WORLD_TREE
          ? 'rgba(52, 211, 153, 0.45)'
          : node.type === NatureNodeType.SUNSTONE_OBELISK
          ? 'rgba(251, 191, 36, 0.48)'
          : 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(
        centerX,
        wy + TILE_SIZE - 3,
        auraRx,
        Math.max(5, auraRx * 0.36),
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }

    // Automatic Canopy Occlusion Transparency when Player walks behind a tall tree/monument
    let isOccludingPlayer = false;
    if (player && drawH >= 48) {
      const nodeSortY = wy + TILE_SIZE * 0.9;
      const playerSortY = player.y + 10;
      if (
        playerSortY < nodeSortY &&
        player.y > drawY + 8 &&
        Math.abs(player.x - centerX) < drawW * 0.42
      ) {
        isOccludingPlayer = true;
      }
    }

    ctx.save();
    if (isOccludingPlayer) {
      ctx.globalAlpha = 0.46;
    }
    if (node.hitFlashTimer > 0) {
      const shake = (Math.random() - 0.5) * 3.5;
      ctx.translate(shake, 0);
      ctx.filter = 'brightness(1.75)';
    } else if (isFoliage && node.type !== NatureNodeType.CACTUS) {
      // Gentle traveling wind-wave canopy sway
      const windSway =
        Math.sin(
          globalTime * 2.1 + node.tileX * 0.45 + node.tileY * 0.3 + node.animOffset
        ) * (isLargeTree ? 1.5 : 0.6);
      ctx.translate(windSway, 0);
    }

    if (mirrorX) {
      ctx.translate(centerX, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, -Math.round(drawW / 2), drawY, drawW, drawH);
    } else {
      ctx.drawImage(sprite, drawX, drawY, drawW, drawH);
    }
    ctx.restore();

    // Ambient Falling Leaf / Spore / Crystal Glint on Nature Nodes
    if (isLargeTree) {
      const leafPhase = (globalTime * 0.65 + node.animOffset * 0.37) % 1;
      const lx =
        centerX -
        drawW * 0.3 +
        ((node.tileX * 7 + node.animOffset * 3) % Math.max(12, Math.round(drawW * 0.6))) +
        Math.sin(globalTime * 3 + node.animOffset) * 5;
      const ly = drawY + drawH * 0.25 + leafPhase * (drawH * 0.65);
      ctx.fillStyle =
        node.type === NatureNodeType.ANCIENT_WORLD_TREE
          ? 'rgba(110, 231, 183, 0.82)'
          : node.type === NatureNodeType.HARDWOOD_TREE
          ? 'rgba(245, 158, 11, 0.80)'
          : 'rgba(74, 222, 128, 0.78)';
      ctx.fillRect(lx, ly, 2, 2);
    } else if (
      node.type === NatureNodeType.IRON_OUTCROP ||
      node.type === NatureNodeType.DESERT_CRYSTAL ||
      node.type === NatureNodeType.SUNSTONE_OBELISK
    ) {
      if (Math.sin(globalTime * 4.5 + node.animOffset) > 0.55) {
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(centerX - 6 + (node.animOffset % 12), drawY + Math.round(drawH * 0.3), 2, 2);
      }
    }

    if (node.hp < node.maxHp && !isAimed) {
      this.drawMiniBar(
        ctx,
        centerX,
        Math.max(wy - 18, drawY - 6),
        node.hp / node.maxHp,
        '#22c55e'
      );
    }
  }

  /**
   * Renders ground-layer structures (Floors, Carpets, Bridges, Traps) with 4-directional border continuity.
   */
  private drawGroundStructure(
    ctx: CanvasRenderingContext2D,
    world: WorldManager,
    st: PlacedStructure,
    tileAnimFrame: number
  ): void {
    const sx = st.tileX * TILE_SIZE;
    const sy = st.tileY * TILE_SIZE;
    const mask = world.getStructureConnectionMask(st.tileX, st.tileY, st.type);
    const hasN = (mask & 1) !== 0;
    const hasE = (mask & 2) !== 0;
    const hasS = (mask & 4) !== 0;
    const hasW = (mask & 8) !== 0;

    if (st.type === PlaceableType.WOOD_BRIDGE) {
      // Submerged support shadow & pilings
      ctx.fillStyle = 'rgba(5, 20, 38, 0.48)';
      ctx.fillRect(sx + 1, sy + TILE_SIZE - 4, TILE_SIZE - 2, 5);
      const sprite = spriteAtlas.getStructureSprite(st.type, tileAnimFrame);
      ctx.drawImage(sprite, sx, sy, TILE_SIZE, TILE_SIZE);

      // Adaptive Bridge Handrails along unlinked water edges
      ctx.fillStyle = '#5c3416';
      if (!hasN) {
        ctx.fillRect(sx, sy, TILE_SIZE, 4);
        ctx.fillStyle = '#eab308';
        ctx.fillRect(sx + 2, sy + 1, 3, 2);
        ctx.fillRect(sx + TILE_SIZE - 5, sy + 1, 3, 2);
      }
      if (!hasS) {
        ctx.fillStyle = '#3e200b';
        ctx.fillRect(sx, sy + TILE_SIZE - 4, TILE_SIZE, 4);
        ctx.fillStyle = '#eab308';
        ctx.fillRect(sx + 2, sy + TILE_SIZE - 3, 3, 2);
        ctx.fillRect(sx + TILE_SIZE - 5, sy + TILE_SIZE - 3, 3, 2);
      }
      if (!hasW && (hasN || hasS)) {
        ctx.fillStyle = '#5c3416';
        ctx.fillRect(sx, sy, 4, TILE_SIZE);
      }
      if (!hasE && (hasN || hasS)) {
        ctx.fillStyle = '#5c3416';
        ctx.fillRect(sx + TILE_SIZE - 4, sy, 4, TILE_SIZE);
      }
      return;
    }

    if (st.type === PlaceableType.ROYAL_CARPET) {
      // Seamless crimson plush interior + golden ornate border only on outer edges
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      // Subtle diamond weave in center
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(sx + 12, sy + 12, 8, 8);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(sx + 15, sy + 15, 2, 2);

      // Golden borders on unconnected sides
      ctx.fillStyle = '#eab308';
      if (!hasN) ctx.fillRect(sx, sy + 1, TILE_SIZE, 3);
      if (!hasS) ctx.fillRect(sx, sy + TILE_SIZE - 4, TILE_SIZE, 3);
      if (!hasW) ctx.fillRect(sx + 1, sy, 3, TILE_SIZE);
      if (!hasE) ctx.fillRect(sx + TILE_SIZE - 4, sy, 3, TILE_SIZE);

      // Tassel fringes on exposed ends
      ctx.fillStyle = '#fef08a';
      if (!hasW) {
        for (let py = 4; py < TILE_SIZE - 4; py += 6) {
          ctx.fillRect(sx, sy + py, 2, 3);
        }
      }
      if (!hasE) {
        for (let py = 4; py < TILE_SIZE - 4; py += 6) {
          ctx.fillRect(sx + TILE_SIZE - 2, sy + py, 2, 3);
        }
      }
      return;
    }

    if (st.type === PlaceableType.TILLED_SOIL) {
      this.drawTilledSoilAndCrop(ctx, world, st, sx, sy, tileAnimFrame, mask);
      return;
    }

    if (st.type === PlaceableType.DIRT_PATH) {
      this.drawDirtPath(ctx, world, st, sx, sy, mask);
      return;
    }

    const sprite = spriteAtlas.getStructureSprite(st.type, tileAnimFrame);
    const isRotatedFloor =
      (st.type === PlaceableType.WOOD_FLOOR ||
        st.type === PlaceableType.DARK_OAK_FLOOR ||
        st.type === PlaceableType.PINE_FLOOR ||
        st.type === PlaceableType.BRICK_FLOOR) &&
      (st.orientation === 'vertical' || (st.rotation ?? 0) % 2 === 1);

    if (isRotatedFloor) {
      ctx.save();
      ctx.translate(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(
        sprite,
        -TILE_SIZE / 2,
        -TILE_SIZE / 2,
        TILE_SIZE,
        TILE_SIZE
      );
      ctx.restore();
    } else {
      ctx.drawImage(sprite, sx, sy, TILE_SIZE, TILE_SIZE);
    }

    if (
      st.type === PlaceableType.WOOD_FLOOR ||
      st.type === PlaceableType.DARK_OAK_FLOOR ||
      st.type === PlaceableType.PINE_FLOOR ||
      st.type === PlaceableType.STONE_FLOOR ||
      st.type === PlaceableType.BRICK_FLOOR
    ) {
      const trimDark =
        st.type === PlaceableType.DARK_OAK_FLOOR
          ? '#140904'
          : st.type === PlaceableType.PINE_FLOOR
          ? '#4a2e16'
          : st.type === PlaceableType.WOOD_FLOOR
          ? '#43230d'
          : st.type === PlaceableType.BRICK_FLOOR
          ? '#451a03'
          : '#1e293b';
      const trimLight =
        st.type === PlaceableType.DARK_OAK_FLOOR
          ? '#6b4226'
          : st.type === PlaceableType.PINE_FLOOR
          ? '#e2be8a'
          : st.type === PlaceableType.WOOD_FLOOR
          ? '#b87a3d'
          : st.type === PlaceableType.BRICK_FLOOR
          ? '#d97706'
          : '#94a3b8';

      // Draw outer curb/border only where this floor meets non-floor terrain
      if (!hasN) {
        ctx.fillStyle = trimLight;
        ctx.fillRect(sx, sy, TILE_SIZE, 2);
      }
      if (!hasS) {
        ctx.fillStyle = trimDark;
        ctx.fillRect(sx, sy + TILE_SIZE - 3, TILE_SIZE, 3);
      }
      if (!hasW) {
        ctx.fillStyle = trimLight;
        ctx.fillRect(sx, sy, 2, TILE_SIZE);
      }
      if (!hasE) {
        ctx.fillStyle = trimDark;
        ctx.fillRect(sx + TILE_SIZE - 2, sy, 2, TILE_SIZE);
      }
    }
  }

  private drawDirtPath(
    ctx: CanvasRenderingContext2D,
    world: WorldManager,
    st: PlacedStructure,
    sx: number,
    sy: number,
    mask: number
  ): void {
    // 1. Adaptive 8-neighbor connectivity with surrounding DIRT_PATH, floors, and bridges across any biome
    const hasN = (mask & 1) !== 0;
    const hasE = (mask & 2) !== 0;
    const hasS = (mask & 4) !== 0;
    const hasW = (mask & 8) !== 0;

    const isPathConnectedAt = (tx: number, ty: number): boolean => {
      const g = world.getGroundStructureAtTile(tx, ty);
      if (!g) return false;
      return (
        g.type === PlaceableType.DIRT_PATH ||
        g.type === PlaceableType.WOOD_FLOOR ||
        g.type === PlaceableType.DARK_OAK_FLOOR ||
        g.type === PlaceableType.PINE_FLOOR ||
        g.type === PlaceableType.STONE_FLOOR ||
        g.type === PlaceableType.BRICK_FLOOR ||
        g.type === PlaceableType.WOOD_BRIDGE
      );
    };

    const hasNW = hasN && hasW && isPathConnectedAt(st.tileX - 1, st.tileY - 1);
    const hasNE = hasN && hasE && isPathConnectedAt(st.tileX + 1, st.tileY - 1);
    const hasSW = hasS && hasW && isPathConnectedAt(st.tileX - 1, st.tileY + 1);
    const hasSE = hasS && hasE && isPathConnectedAt(st.tileX + 1, st.tileY + 1);

    const outerFadeRgb = '138, 102, 66';
    const baseColor = '#8a6642';
    const centerColor = '#9b744d';
    const pebbleDark = '#6e4f30';
    const pebbleLight = '#b38b62';

    const padOuterN = hasN ? 0 : 1;
    const padOuterS = hasS ? 0 : 1;
    const padOuterW = hasW ? 0 : 1;
    const padOuterE = hasE ? 0 : 1;

    const padMidN = hasN ? 0 : 3;
    const padMidS = hasS ? 0 : 3;
    const padMidW = hasW ? 0 : 3;
    const padMidE = hasE ? 0 : 3;

    const padCoreN = hasN ? 0 : 5;
    const padCoreS = hasS ? 0 : 5;
    const padCoreW = hasW ? 0 : 5;
    const padCoreE = hasE ? 0 : 5;

    const drawAdaptiveRoundedLayer = (
      pN: number,
      pS: number,
      pW: number,
      pE: number,
      cornerStep: number,
      fillStyle: string
    ) => {
      const x = sx + pW;
      const y = sy + pN;
      const w = TILE_SIZE - pW - pE;
      const h = TILE_SIZE - pN - pS;
      if (w <= 0 || h <= 0) return;

      ctx.fillStyle = fillStyle;
      const cNW = !hasN && !hasW ? cornerStep : 0;
      const cNE = !hasN && !hasE ? cornerStep : 0;
      const cSW = !hasS && !hasW ? cornerStep : 0;
      const cSE = !hasS && !hasE ? cornerStep : 0;

      for (let py = 0; py < h; py++) {
        let leftCut = 0;
        let rightCut = 0;
        if (py < cNW) leftCut = cNW - py;
        else if (py >= h - cSW) leftCut = py - (h - cSW) + 1;

        if (py < cNE) rightCut = cNE - py;
        else if (py >= h - cSE) rightCut = py - (h - cSE) + 1;

        const rowW = w - leftCut - rightCut;
        if (rowW > 0) {
          ctx.fillRect(x + leftCut, y + py, rowW, 1);
        }
      }
    };

    // Progressive 3-step transition blending smoothly into surrounding biome ground
    drawAdaptiveRoundedLayer(
      padOuterN,
      padOuterS,
      padOuterW,
      padOuterE,
      4,
      `rgba(${outerFadeRgb}, 0.28)`
    );
    drawAdaptiveRoundedLayer(
      padMidN,
      padMidS,
      padMidW,
      padMidE,
      3,
      `rgba(${outerFadeRgb}, 0.58)`
    );
    drawAdaptiveRoundedLayer(
      padCoreN - (hasN ? 0 : 1),
      padCoreS - (hasS ? 0 : 1),
      padCoreW - (hasW ? 0 : 1),
      padCoreE - (hasE ? 0 : 1),
      2,
      `rgba(${outerFadeRgb}, 0.88)`
    );
    drawAdaptiveRoundedLayer(
      padCoreN,
      padCoreS,
      padCoreW,
      padCoreE,
      2,
      baseColor
    );

    // Inner compacted beaten earth surface
    drawAdaptiveRoundedLayer(
      hasN ? 0 : 7,
      hasS ? 0 : 7,
      hasW ? 0 : 7,
      hasE ? 0 : 7,
      2,
      centerColor
    );

    // Organic earth crumbs & pebbles along unconnected borders
    const seed = (st.tileX * 41 + st.tileY * 83) & 7;
    ctx.fillStyle = `rgba(${outerFadeRgb}, 0.48)`;
    if (!hasN) {
      ctx.fillRect(sx + 6 + seed, sy + 1, 3, 1);
      ctx.fillRect(sx + 18 - seed, sy + 2, 4, 1);
    }
    if (!hasS) {
      ctx.fillRect(sx + 7 + seed, sy + TILE_SIZE - 2, 3, 1);
      ctx.fillRect(sx + 17 - seed, sy + TILE_SIZE - 3, 4, 1);
    }
    if (!hasW) {
      ctx.fillRect(sx + 1, sy + 7 + seed, 1, 3);
      ctx.fillRect(sx + 2, sy + 18 - seed, 1, 4);
    }
    if (!hasE) {
      ctx.fillRect(sx + TILE_SIZE - 2, sy + 8 + seed, 1, 3);
      ctx.fillRect(sx + TILE_SIZE - 3, sy + 17 - seed, 1, 4);
    }

    // Inner concave corner transitions for L-junctions / crossroads
    ctx.fillStyle = pebbleDark;
    if (hasN && hasW && !hasNW) {
      ctx.fillRect(sx, sy, 3, 2);
      ctx.fillRect(sx, sy, 2, 3);
    }
    if (hasN && hasE && !hasNE) {
      ctx.fillRect(sx + TILE_SIZE - 3, sy, 3, 2);
      ctx.fillRect(sx + TILE_SIZE - 2, sy, 2, 3);
    }
    if (hasS && hasW && !hasSW) {
      ctx.fillRect(sx, sy + TILE_SIZE - 2, 3, 2);
      ctx.fillRect(sx, sy + TILE_SIZE - 3, 2, 3);
    }
    if (hasS && hasE && !hasSE) {
      ctx.fillRect(sx + TILE_SIZE - 3, sy + TILE_SIZE - 2, 3, 2);
      ctx.fillRect(sx + TILE_SIZE - 2, sy + TILE_SIZE - 3, 2, 3);
    }

    // Subtle compacted pebbles & path texture inside the core
    ctx.fillStyle = pebbleDark;
    ctx.fillRect(sx + 9 + (seed & 3), sy + 10 + ((seed >> 1) & 3), 2, 2);
    ctx.fillRect(sx + 19 - (seed & 3), sy + 18 - ((seed >> 1) & 3), 3, 1);
    ctx.fillStyle = pebbleLight;
    ctx.fillRect(sx + 13 + (seed & 3), sy + 14 - (seed & 2), 2, 1);
    ctx.fillRect(sx + 10, sy + 20 - (seed & 3), 2, 1);
  }

  private drawTilledSoilAndCrop(
    ctx: CanvasRenderingContext2D,
    world: WorldManager,
    st: PlacedStructure,
    sx: number,
    sy: number,
    tileAnimFrame: number,
    mask: number
  ): void {
    const isWatered = Boolean(st.isWatered || (st.waterLevel && st.waterLevel > 0));
    const isFertilized = Boolean(st.fertilized);
    const stage = st.growthStage ?? 0;
    const crop = st.cropType;

    // 1. Adaptive 8-neighbor connectivity with surrounding TILLED_SOIL tiles
    const hasN = (mask & 1) !== 0;
    const hasE = (mask & 2) !== 0;
    const hasS = (mask & 4) !== 0;
    const hasW = (mask & 8) !== 0;

    const isTilledAt = (tx: number, ty: number): boolean =>
      world.getGroundStructureAtTile(tx, ty)?.type === PlaceableType.TILLED_SOIL;

    const hasNW = hasN && hasW && isTilledAt(st.tileX - 1, st.tileY - 1);
    const hasNE = hasN && hasE && isTilledAt(st.tileX + 1, st.tileY - 1);
    const hasSW = hasS && hasW && isTilledAt(st.tileX - 1, st.tileY + 1);
    const hasSE = hasS && hasE && isTilledAt(st.tileX + 1, st.tileY + 1);

    const outerFadeRgb = isWatered ? '59, 35, 20' : '104, 68, 40';
    const baseColor = isWatered ? '#3b2314' : '#684428';
    const ridgeColor = isWatered ? '#28170c' : '#54341c';
    const highlightColor = isWatered ? '#4d2d18' : '#785030';

    // Progressive multi-step border insets on unconnected sides (0px on connected sides)
    const padOuterN = hasN ? 0 : 1;
    const padOuterS = hasS ? 0 : 1;
    const padOuterW = hasW ? 0 : 1;
    const padOuterE = hasE ? 0 : 1;

    const padMidN = hasN ? 0 : 3;
    const padMidS = hasS ? 0 : 3;
    const padMidW = hasW ? 0 : 3;
    const padMidE = hasE ? 0 : 3;

    const padCoreN = hasN ? 0 : 5;
    const padCoreS = hasS ? 0 : 5;
    const padCoreW = hasW ? 0 : 5;
    const padCoreE = hasE ? 0 : 5;

    const drawAdaptiveRoundedLayer = (
      pN: number,
      pS: number,
      pW: number,
      pE: number,
      cornerStep: number,
      fillStyle: string
    ) => {
      const x = sx + pW;
      const y = sy + pN;
      const w = TILE_SIZE - pW - pE;
      const h = TILE_SIZE - pN - pS;
      if (w <= 0 || h <= 0) return;

      ctx.fillStyle = fillStyle;
      // Main center cross to leave outer unconnected corners stepped/rounded
      const cNW = !hasN && !hasW ? cornerStep : 0;
      const cNE = !hasN && !hasE ? cornerStep : 0;
      const cSW = !hasS && !hasW ? cornerStep : 0;
      const cSE = !hasS && !hasE ? cornerStep : 0;

      // Row-by-row progressive scan for clean pixel-art rounded corners without allocations
      for (let py = 0; py < h; py++) {
        let leftCut = 0;
        let rightCut = 0;
        if (py < cNW) leftCut = cNW - py;
        else if (py >= h - cSW) leftCut = py - (h - cSW) + 1;

        if (py < cNE) rightCut = cNE - py;
        else if (py >= h - cSE) rightCut = py - (h - cSE) + 1;

        const rowW = w - leftCut - rightCut;
        if (rowW > 0) {
          ctx.fillRect(x + leftCut, y + py, rowW, 1);
        }
      }
    };

    // Step 1: Soft outer soil transition halo (28% opacity) blending into surrounding ground
    drawAdaptiveRoundedLayer(
      padOuterN,
      padOuterS,
      padOuterW,
      padOuterE,
      4,
      `rgba(${outerFadeRgb}, 0.28)`
    );

    // Step 2: Mid-tone progressive soil shoulder (58% opacity)
    drawAdaptiveRoundedLayer(
      padMidN,
      padMidS,
      padMidW,
      padMidE,
      3,
      `rgba(${outerFadeRgb}, 0.58)`
    );

    // Step 3: Rich inner tilled soil bed (92% opacity) & full core
    drawAdaptiveRoundedLayer(
      padCoreN - (hasN ? 0 : 1),
      padCoreS - (hasS ? 0 : 1),
      padCoreW - (hasW ? 0 : 1),
      padCoreE - (hasE ? 0 : 1),
      2,
      `rgba(${outerFadeRgb}, 0.86)`
    );
    drawAdaptiveRoundedLayer(
      padCoreN,
      padCoreS,
      padCoreW,
      padCoreE,
      2,
      baseColor
    );

    // Organic soil granules / crumbs along unconnected edges for natural progressive blending
    const seed = (st.tileX * 37 + st.tileY * 73) & 7;
    ctx.fillStyle = `rgba(${outerFadeRgb}, 0.45)`;
    if (!hasN) {
      ctx.fillRect(sx + 6 + seed, sy + 1, 3, 1);
      ctx.fillRect(sx + 19 - seed, sy + 2, 4, 1);
    }
    if (!hasS) {
      ctx.fillRect(sx + 7 + seed, sy + TILE_SIZE - 2, 3, 1);
      ctx.fillRect(sx + 18 - seed, sy + TILE_SIZE - 3, 4, 1);
    }
    if (!hasW) {
      ctx.fillRect(sx + 1, sy + 7 + seed, 1, 3);
      ctx.fillRect(sx + 2, sy + 19 - seed, 1, 4);
    }
    if (!hasE) {
      ctx.fillRect(sx + TILE_SIZE - 2, sy + 8 + seed, 1, 3);
      ctx.fillRect(sx + TILE_SIZE - 3, sy + 18 - seed, 1, 4);
    }

    // Inner concave corner transitions when 2 cardinal sides connect (e.g. L-junction) but diagonal is grass/sand
    ctx.fillStyle = highlightColor;
    if (hasN && hasW && !hasNW) {
      ctx.fillRect(sx, sy, 3, 2);
      ctx.fillRect(sx, sy, 2, 3);
    }
    if (hasN && hasE && !hasNE) {
      ctx.fillRect(sx + TILE_SIZE - 3, sy, 3, 2);
      ctx.fillRect(sx + TILE_SIZE - 2, sy, 2, 3);
    }
    if (hasS && hasW && !hasSW) {
      ctx.fillRect(sx, sy + TILE_SIZE - 2, 3, 2);
      ctx.fillRect(sx, sy + TILE_SIZE - 3, 2, 3);
    }
    if (hasS && hasE && !hasSE) {
      ctx.fillRect(sx + TILE_SIZE - 3, sy + TILE_SIZE - 2, 3, 2);
      ctx.fillRect(sx + TILE_SIZE - 2, sy + TILE_SIZE - 3, 2, 3);
    }

    // Continuous horizontal plowed furrows & ridges (connect seamlessly left/right across adjacent tilled tiles)
    const furrowRows = [3, 10, 17, 24];
    for (let i = 0; i < furrowRows.length; i++) {
      const r = furrowRows[i];
      // Skip the outermost top/bottom furrow if that edge is unconnected so the progressive border breathes
      if (i === 0 && !hasN) continue;
      if (i === furrowRows.length - 1 && !hasS) continue;

      const isOuterRow = (i === 1 && !hasN) || (i === furrowRows.length - 2 && !hasS);
      const fLeft = hasW ? 0 : isOuterRow ? 6 : 5;
      const fRight = hasE ? 0 : isOuterRow ? 6 : 5;
      const fWidth = TILE_SIZE - fLeft - fRight;
      if (fWidth <= 0) continue;

      ctx.fillStyle = ridgeColor;
      ctx.fillRect(sx + fLeft, sy + r, fWidth, 4);
      // Tapered ends on unconnected West/East sides
      if (!hasW && fWidth > 2) {
        ctx.fillRect(sx + fLeft - 1, sy + r + 1, 1, 2);
      }
      if (!hasE && fWidth > 2) {
        ctx.fillRect(sx + TILE_SIZE - fRight, sy + r + 1, 1, 2);
      }

      ctx.fillStyle = highlightColor;
      ctx.fillRect(sx + fLeft, sy + r, fWidth, 1);
    }

    // Wet moisture glistening effect
    if (isWatered) {
      ctx.fillStyle = 'rgba(96, 165, 250, 0.28)';
      ctx.fillRect(sx + 7, sy + 11, 2, 1);
      ctx.fillRect(sx + 19, sy + 13, 2, 1);
      ctx.fillRect(sx + 11, sy + 19, 2, 1);
      ctx.fillRect(sx + 22, sy + 21, 2, 1);
    }

    // Organic Bone Fertilizer Flecks
    if (isFertilized) {
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(sx + 7, sy + 10, 2, 1);
      ctx.fillRect(sx + 21, sy + 11, 1, 2);
      ctx.fillRect(sx + 14, sy + 18, 2, 1);
      ctx.fillRect(sx + 23, sy + 17, 1, 1);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(sx + 9, sy + 14, 1, 1);
      ctx.fillRect(sx + 18, sy + 21, 2, 1);
    }

    // 2. Crop Plant Stages (0..3) with natural height & width variation per tile
    if (!crop) return;

    ctx.save();
    if (st.hitFlashTimer > 0) {
      ctx.filter = 'brightness(1.6)';
    }

    const cx = sx + 16;
    const cy = sy + 18;
    const hVar = ((st.tileX * 19 + st.tileY * 37) & 3) - 1; // -1 .. +2 px height variation
    const wVar = ((st.tileX * 31 + st.tileY * 13) & 3) - 1; // -1 .. +2 px width variation

    if (stage === 0) {
      // Stage 0: 3 Seed mounds in the soil furrows
      const seedColor =
        crop === 'wheat'
          ? '#eab308'
          : crop === 'carrot'
          ? '#f97316'
          : crop === 'medic_herb'
          ? '#38bdf8'
          : crop === 'solar_bloom'
          ? '#fbbf24'
          : '#ef4444';

      for (const off of [-7, 0, 7]) {
        ctx.fillStyle = ridgeColor;
        ctx.fillRect(cx + off - 2, cy - 3, 5, 4);
        ctx.fillStyle = seedColor;
        ctx.fillRect(cx + off - 1, cy - 2, 2, 2);
      }
    } else if (stage === 1) {
      // Stage 1: Small two-leaf green sprouts emerging
      for (const off of [-6, 0, 6]) {
        const px = cx + off;
        const py = cy;
        ctx.fillStyle = '#15803d';
        ctx.fillRect(px, py - 5 - Math.max(0, hVar), 2, 6 + Math.max(0, hVar));
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(px - 2, py - 6 - Math.max(0, hVar), 2, 2);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(px + 2, py - 6 - Math.max(0, hVar), 2, 2);
      }
    } else if (stage === 2) {
      // Stage 2: Vegetative Growth (Distinct heights & widths per species)
      if (crop === 'wheat') {
        for (const off of [-8, -4, 0, 4, 8]) {
          const px = cx + off;
          const stalkH = 14 + ((off + st.tileX) & 3) + hVar;
          ctx.fillStyle = '#15803d';
          ctx.fillRect(px, cy - stalkH + 4, 2, stalkH);
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(px - 1, cy - stalkH + 1, 3, 4);
          ctx.fillStyle = '#86efac';
          ctx.fillRect(px, cy - stalkH - 1, 1, 3);
        }
      } else if (crop === 'carrot') {
        // Low, wide feathery root greens
        ctx.fillStyle = '#14532d';
        ctx.fillRect(cx - 2, cy - 2, 4, 5);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(cx - 6 - wVar, cy - 6, 13 + wVar * 2, 4);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(cx - 8 - wVar, cy - 9 - hVar, 6, 4);
        ctx.fillRect(cx + 3 + wVar, cy - 9 - hVar, 6, 4);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(cx - 2, cy - 11 - hVar, 5, 4);
      } else if (crop === 'medic_herb') {
        ctx.fillStyle = '#065f46';
        ctx.fillRect(cx - 7 - wVar, cy - 6, 15 + wVar * 2, 9);
        ctx.fillStyle = '#059669';
        ctx.fillRect(cx - 6 - wVar, cy - 9 - hVar, 13 + wVar * 2, 9);
        ctx.fillStyle = '#34d399';
        ctx.fillRect(cx - 4, cy - 12 - hVar, 9, 7);
        ctx.fillStyle = '#67e8f9';
        ctx.fillRect(cx, cy - 11 - hVar, 2, 10);
      } else if (crop === 'solar_bloom') {
        // Tall sturdy sunflower stalk
        const stalkH = 16 + hVar;
        ctx.fillStyle = '#854d0e';
        ctx.fillRect(cx - 1, cy - stalkH + 6, 3, stalkH - 2);
        ctx.fillStyle = '#15803d';
        ctx.fillRect(cx - 6, cy - 6, 5, 3);
        ctx.fillRect(cx + 2, cy - 8, 5, 3);
        ctx.fillStyle = '#ca8a04';
        ctx.fillRect(cx - 5, cy - stalkH + 1, 11, 7);
        ctx.fillStyle = '#eab308';
        ctx.fillRect(cx - 4, cy - stalkH - 1, 9, 6);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(cx - 1, cy - stalkH + 1, 3, 3);
      } else if (crop === 'berry') {
        // Wide bushy berry shrub
        ctx.fillStyle = '#14532d';
        ctx.fillRect(cx - 9 - wVar, cy - 7, 19 + wVar * 2, 11);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(cx - 8 - wVar, cy - 10 - hVar, 17 + wVar * 2, 10);
        ctx.fillStyle = '#86efac';
        ctx.fillRect(cx - 4, cy - 6, 2, 2);
        ctx.fillRect(cx + 4, cy - 5, 2, 2);
      }
    } else if (stage === 3) {
      // Stage 3: Fully Mature & Harvest-Ready (Realistic height/width contrast across crops)
      const sparkleFrame = Math.floor(tileAnimFrame * 3 + st.tileX * 2) % 6;

      if (crop === 'wheat') {
        // Tall golden grain sheaf reaching chest height (~22px tall)
        for (const off of [-9, -5, -1, 3, 7]) {
          const px = cx + off;
          const stalkH = 18 + ((off + st.tileY) & 3) + hVar;
          ctx.fillStyle = '#a16207';
          ctx.fillRect(px, cy - stalkH + 7, 2, stalkH - 3);
          ctx.fillStyle = '#eab308';
          ctx.fillRect(px - 1, cy - stalkH, 4, 9);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(px, cy - stalkH - 3, 2, 5);
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(px, cy - stalkH + 1, 2, 2);
        }
      } else if (crop === 'carrot') {
        // Lush low-slung leafy greens with thick orange roots peeking above soil
        ctx.fillStyle = '#15803d';
        ctx.fillRect(cx - 8 - wVar, cy - 9, 17 + wVar * 2, 6);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(cx - 6 - wVar, cy - 12 - hVar, 13 + wVar * 2, 5);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(cx - 3, cy - 14 - hVar, 7, 3);

        ctx.fillStyle = '#c2410c';
        ctx.fillRect(cx - 6, cy - 2, 5, 6);
        ctx.fillRect(cx + 2, cy - 3, 5, 7);
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(cx - 5, cy - 2, 4, 5);
        ctx.fillRect(cx + 3, cy - 3, 4, 6);
        ctx.fillStyle = '#fdba74';
        ctx.fillRect(cx - 5, cy - 2, 1, 3);
        ctx.fillRect(cx + 3, cy - 3, 1, 4);
      } else if (crop === 'medic_herb') {
        // Bushy bioluminescent herb shrub
        ctx.fillStyle = '#065f46';
        ctx.fillRect(cx - 9 - wVar, cy - 6, 19 + wVar * 2, 10);
        ctx.fillStyle = '#059669';
        ctx.fillRect(cx - 8 - wVar, cy - 9 - hVar, 17 + wVar * 2, 9);
        ctx.fillStyle = '#34d399';
        ctx.fillRect(cx - 5, cy - 12 - hVar, 11, 7);

        ctx.fillStyle = '#0891b2';
        ctx.fillRect(cx - 6, cy - 14 - hVar, 4, 4);
        ctx.fillRect(cx + 3, cy - 13 - hVar, 4, 4);
        ctx.fillStyle = '#22d3ee';
        ctx.fillRect(cx - 5, cy - 13 - hVar, 2, 2);
        ctx.fillRect(cx + 4, cy - 12 - hVar, 2, 2);
        ctx.fillStyle = '#cffafe';
        ctx.fillRect(cx - 1, cy - 16 - hVar, 3, 4);
      } else if (crop === 'solar_bloom') {
        // Tall radiant Giant Sunflower (~24px tall with broad golden crown)
        const stalkH = 21 + hVar;
        ctx.fillStyle = '#14532d';
        ctx.fillRect(cx - 2, cy - stalkH + 8, 4, stalkH - 4);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(cx - 8, cy - 7, 6, 3);
        ctx.fillRect(cx + 2, cy - 9, 6, 3);

        ctx.fillStyle = '#eab308';
        ctx.fillRect(cx - 8 - wVar, cy - stalkH - 1, 17 + wVar * 2, 11);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(cx - 6 - wVar, cy - stalkH - 3, 13 + wVar * 2, 14);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(cx - 4, cy - stalkH - 4, 9, 16);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(cx - 3, cy - stalkH + 1, 7, 7);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(cx - 1, cy - stalkH + 3, 3, 3);
      } else if (crop === 'berry') {
        // Wide, heavy-laden cultivated berry bush (22–26px wide x 16–19px tall)
        ctx.fillStyle = '#14532d';
        ctx.fillRect(cx - 11 - wVar, cy - 8, 23 + wVar * 2, 13);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(cx - 10 - wVar, cy - 11 - hVar, 21 + wVar * 2, 12);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(cx - 7, cy - 14 - hVar, 15, 8);

        ctx.fillStyle = '#991b1b';
        ctx.fillRect(cx - 7, cy - 7, 4, 4);
        ctx.fillRect(cx + 4, cy - 6, 4, 4);
        ctx.fillRect(cx - 2, cy - 11 - hVar, 4, 4);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(cx - 6, cy - 6, 3, 3);
        ctx.fillRect(cx + 5, cy - 5, 3, 3);
        ctx.fillRect(cx - 1, cy - 10 - hVar, 3, 3);
        ctx.fillStyle = '#fca5a5';
        ctx.fillRect(cx - 6, cy - 6, 1, 1);
        ctx.fillRect(cx + 5, cy - 5, 1, 1);
        ctx.fillRect(cx - 1, cy - 10 - hVar, 1, 1);
      }

      // Animated Harvest Sparkle Star
      if (sparkleFrame < 3) {
        ctx.fillStyle = '#fef08a';
        const sparkleX = cx + (sparkleFrame === 0 ? -6 : sparkleFrame === 1 ? 5 : 0);
        const sparkleY = cy - 17 + sparkleFrame * 2;
        ctx.fillRect(sparkleX, sparkleY, 2, 2);
        ctx.fillRect(sparkleX - 1, sparkleY, 4, 1);
        ctx.fillRect(sparkleX, sparkleY - 1, 1, 4);
      }
    }

    ctx.restore();
  }

  /**
   * Renders Stage 1 (`growthStage === 0`: Muda) and Stage 2 (`growthStage === 1`: Árvore/Palmeira Pequena)
   * for planted `OAK_SAPLING` and `PALM_SAPLING` structures.
   */
  private drawTreeSaplingStage(
    ctx: CanvasRenderingContext2D,
    st: PlacedStructure,
    wx: number,
    wy: number,
    globalTime: number
  ): void {
    const cx = wx + TILE_SIZE / 2;
    const baseY = wy + TILE_SIZE - 4;
    const sway = Math.round(
      Math.sin(globalTime * 2.8 + st.tileX * 0.7 + st.tileY * 0.5)
    );
    const stage = st.growthStage || 0;
    const isPalm = st.type === PlaceableType.PALM_SAPLING;
    const isDarkOak = st.type === PlaceableType.DARK_OAK_SAPLING;
    const isPine = st.type === PlaceableType.PINE_SAPLING;

    if (stage === 0) {
      // === ESTÁGIO 1: MUDA (Brote pequeno recém-plantado) ===
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(cx - 6, baseY - 1, 12, 3);
      // Montinho de terra fofa / semente de coco na base
      ctx.fillStyle = isPalm
        ? '#78350f'
        : isDarkOak
        ? '#3b1d0a'
        : isPine
        ? '#431407'
        : '#5c3a1e';
      ctx.fillRect(cx - 5, baseY - 3, 10, 3);
      ctx.fillStyle = isPalm
        ? '#92400e'
        : isDarkOak
        ? '#4a2c16'
        : isPine
        ? '#5c3a21'
        : '#78350f';
      ctx.fillRect(cx - 3, baseY - 4, 6, 2);

      if (isDarkOak) {
        // Muda de Carvalho Escuro (caule escuro encorpado e copa densa verde-floresta profundo)
        ctx.fillStyle = '#2b170b';
        ctx.fillRect(cx - 2, baseY - 11, 4, 8);
        ctx.fillStyle = '#022c22';
        ctx.fillRect(cx - 7 + sway, baseY - 19, 14, 9);
        ctx.fillStyle = '#065f46';
        ctx.fillRect(cx - 6 + sway, baseY - 18, 12, 7);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(cx - 4 + sway, baseY - 17, 7, 3);
      } else if (isPine) {
        // Muda de Pinheiro (caule avermelhado boreal e agulhas cônicas em camadas)
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(cx - 1, baseY - 10, 2, 7);
        ctx.fillStyle = '#042f2e';
        ctx.fillRect(cx - 6 + sway, baseY - 13, 12, 4);
        ctx.fillRect(cx - 4 + sway, baseY - 17, 8, 5);
        ctx.fillRect(cx - 2 + sway, baseY - 20, 4, 4);
        ctx.fillStyle = '#0d9488';
        ctx.fillRect(cx - 5 + sway, baseY - 12, 10, 2);
        ctx.fillRect(cx - 3 + sway, baseY - 16, 6, 3);
        ctx.fillStyle = '#2dd4bf';
        ctx.fillRect(cx - 1 + sway, baseY - 19, 2, 2);
      } else if (!isPalm) {
        // Muda de Carvalho (pequeno caule e 3 folhinhas tenras)
        ctx.fillStyle = '#78350f';
        ctx.fillRect(cx - 1, baseY - 11, 2, 8);
        ctx.fillStyle = '#052e16';
        ctx.fillRect(cx - 6 + sway, baseY - 18, 12, 8);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(cx - 5 + sway, baseY - 17, 10, 6);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(cx - 4 + sway, baseY - 16, 6, 3);
      } else {
        // Muda de Palmeira (caule tropical curto e 2 folhas arqueadas)
        ctx.fillStyle = '#b45309';
        ctx.fillRect(cx - 1, baseY - 11, 2, 7);
        ctx.fillStyle = '#052e16';
        ctx.fillRect(cx - 8 + sway, baseY - 15, 16, 5);
        ctx.fillRect(cx - 4 + sway, baseY - 18, 8, 5);
        ctx.fillStyle = '#15803d';
        ctx.fillRect(cx - 7 + sway, baseY - 14, 14, 3);
        ctx.fillStyle = '#84cc16';
        ctx.fillRect(cx - 5 + sway, baseY - 16, 10, 2);
      }
    } else {
      // === ESTÁGIO 2: ÁRVORE PEQUENA / PALMEIRA PEQUENA (Porte intermediário jovem) ===
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(cx - 10, baseY - 2, 20, 4);

      if (isDarkOak) {
        // Carvalho Escuro Jovem (tronco robusto chocolate-escuro e copa densa verde-esmeralda profundo)
        ctx.fillStyle = '#140904';
        ctx.fillRect(cx - 4, baseY - 20, 8, 19);
        ctx.fillStyle = '#3b1d0a';
        ctx.fillRect(cx - 3, baseY - 19, 6, 17);
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(cx - 1, baseY - 18, 2, 15);

        ctx.fillStyle = '#022c22';
        ctx.fillRect(cx - 13 + sway, baseY - 34, 26, 17);
        ctx.fillRect(cx - 10 + sway, baseY - 39, 20, 7);
        ctx.fillStyle = '#064e3b';
        ctx.fillRect(cx - 12 + sway, baseY - 33, 24, 14);
        ctx.fillRect(cx - 9 + sway, baseY - 38, 18, 6);
        ctx.fillStyle = '#047857';
        ctx.fillRect(cx - 10 + sway, baseY - 32, 20, 10);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(cx - 7 + sway, baseY - 36, 12, 5);
      } else if (isPine) {
        // Pinheiro Jovem (tronco boreal avermelhado e 3 camadas cônicas de agulhas de taiga)
        ctx.fillStyle = '#270e04';
        ctx.fillRect(cx - 3, baseY - 18, 6, 17);
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(cx - 2, baseY - 17, 4, 15);
        ctx.fillStyle = '#7c4d2b';
        ctx.fillRect(cx - 1, baseY - 16, 2, 13);

        // Camada inferior, média e topo cônico
        ctx.fillStyle = '#042f2e';
        ctx.fillRect(cx - 12 + sway, baseY - 24, 24, 9);
        ctx.fillRect(cx - 9 + sway, baseY - 32, 18, 9);
        ctx.fillRect(cx - 6 + sway, baseY - 39, 12, 8);
        ctx.fillRect(cx - 3 + sway, baseY - 43, 6, 5);

        ctx.fillStyle = '#115e59';
        ctx.fillRect(cx - 11 + sway, baseY - 23, 22, 6);
        ctx.fillRect(cx - 8 + sway, baseY - 31, 16, 6);
        ctx.fillRect(cx - 5 + sway, baseY - 38, 10, 6);

        ctx.fillStyle = '#0d9488';
        ctx.fillRect(cx - 9 + sway, baseY - 23, 18, 3);
        ctx.fillRect(cx - 6 + sway, baseY - 31, 12, 3);
        ctx.fillRect(cx - 4 + sway, baseY - 38, 8, 3);

        ctx.fillStyle = '#2dd4bf';
        ctx.fillRect(cx - 2 + sway, baseY - 42, 4, 3);
      } else if (!isPalm) {
        // Árvore Pequena de Carvalho (tronco jovem com galhos e copa frondosa compacta)
        ctx.fillStyle = '#2a1205';
        ctx.fillRect(cx - 3, baseY - 18, 6, 17);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(cx - 2, baseY - 17, 4, 15);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(cx - 1, baseY - 16, 2, 13);

        // Copa jovem em camadas
        ctx.fillStyle = '#052e16';
        ctx.fillRect(cx - 12 + sway, baseY - 32, 24, 16);
        ctx.fillRect(cx - 9 + sway, baseY - 36, 18, 6);
        ctx.fillStyle = '#15803d';
        ctx.fillRect(cx - 11 + sway, baseY - 31, 22, 13);
        ctx.fillRect(cx - 8 + sway, baseY - 35, 16, 5);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(cx - 9 + sway, baseY - 30, 18, 9);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(cx - 6 + sway, baseY - 33, 11, 5);
      } else {
        // Palmeira Pequena (tronco anelado jovem inclinado e coroa de palmas)
        ctx.fillStyle = '#451a03';
        ctx.fillRect(cx - 3, baseY - 22, 6, 21);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(cx - 2, baseY - 21, 4, 19);
        ctx.fillStyle = '#b45309';
        for (let ty = baseY - 19; ty < baseY - 3; ty += 4) {
          ctx.fillRect(cx - 2, ty, 4, 2);
        }

        // Coroa de folhas de palmeira jovem
        ctx.fillStyle = '#052e16';
        ctx.fillRect(cx - 14 + sway, baseY - 28, 28, 7);
        ctx.fillRect(cx - 8 + sway, baseY - 34, 16, 8);
        ctx.fillStyle = '#15803d';
        ctx.fillRect(cx - 13 + sway, baseY - 27, 26, 5);
        ctx.fillRect(cx - 7 + sway, baseY - 33, 14, 6);
        ctx.fillStyle = '#84cc16';
        ctx.fillRect(cx - 10 + sway, baseY - 27, 20, 2);
        ctx.fillRect(cx - 5 + sway, baseY - 32, 10, 3);
      }
    }

    // Brilho dourado de adubo orgânico ativo
    if (st.fertilized) {
      const sparkleFrame = Math.floor(globalTime * 5 + st.tileX + st.tileY) % 3;
      const sx = cx + (sparkleFrame - 1) * 6;
      const sy = baseY - (stage === 0 ? 15 : 28) + (sparkleFrame % 2) * 3;
      ctx.fillStyle = '#fde047';
      ctx.fillRect(sx - 1, sy, 3, 1);
      ctx.fillRect(sx, sy - 1, 1, 3);
    }
  }

  private drawStructure(
    ctx: CanvasRenderingContext2D,
    world: WorldManager,
    st: PlacedStructure,
    globalTime: number,
    shadowDx: number,
    player?: PlayerState,
    creatures?: CreatureEntity[],
    isAimed = false
  ): void {
    const bp = CONSTRUCTION_BLUEPRINTS[st.type];
    const wx = st.tileX * TILE_SIZE;
    const wy = st.tileY * TILE_SIZE;

    // Adaptive 16-State Wall, Window, Fence & Door Rendering
    if (
      st.type !== PlaceableType.CHEST &&
      bp &&
      (bp.continuityMode === 'WALL_16' ||
        bp.continuityMode === 'FENCE_16' ||
        bp.continuityMode === 'DOOR_AUTO')
    ) {
      ctx.save();
      if (st.hitFlashTimer > 0) {
        ctx.filter = 'brightness(1.7)';
      }
      this.drawConnectedWallOrDoor(ctx, world, st, wx, wy, shadowDx);
      ctx.restore();

      if (st.hp < st.maxHp && !isAimed) {
        this.drawMiniBar(ctx, wx + TILE_SIZE / 2, wy - 16, st.hp / st.maxHp, '#38bdf8');
      }
      return;
    }

    // Placed Flowers (Tulipa, Lírio-do-Vale, Girassol, Gota Solar)
    if (
      st.type === PlaceableType.FLOWER_TULIP ||
      st.type === PlaceableType.FLOWER_LILY ||
      st.type === PlaceableType.FLOWER_SUNFLOWER ||
      st.type === PlaceableType.FLOWER_SOLAR_DROP
    ) {
      const resolvedFlowerItemId =
        st.itemId ||
        (st.type === PlaceableType.FLOWER_TULIP
          ? 'flower_tulip'
          : st.type === PlaceableType.FLOWER_LILY
          ? 'flower_lily'
          : st.type === PlaceableType.FLOWER_SUNFLOWER
          ? 'flower_sunflower'
          : 'flower_solar_drop');
      this.drawFlowerInWorld(
        ctx,
        resolvedFlowerItemId,
        st.flowerColor || 'amarelo',
        wx,
        wy,
        st.tileX,
        st.tileY,
        globalTime,
        st.hitFlashTimer > 0,
        st.hp,
        st.maxHp,
        isAimed
      );
      return;
    }

    // Wall-mounted torch (sconce attached to a wall on the same tile)
    if (
      st.type === PlaceableType.TORCH &&
      (st.attachedToWall || world.hasWallStructureAtTile(st.tileX, st.tileY))
    ) {
      ctx.save();
      if (st.hitFlashTimer > 0) {
        ctx.filter = 'brightness(1.7)';
      }
      this.drawWallMountedTorch(ctx, world, st, wx, wy, globalTime);
      ctx.restore();
      if (st.hp < st.maxHp && !isAimed) {
        this.drawMiniBar(ctx, wx + TILE_SIZE / 2, wy - 14, st.hp / st.maxHp, '#38bdf8');
      }
      return;
    }

    // Special 3-stage rendering for Tree Saplings:
    // Stage 0 = Muda (Sprout), Stage 1 = Árvore Pequena / Palmeira Pequena (Young Tree)
    // (Stage 2 transforms into an adult NatureNode in WorldManager)
    if (WorldManager.isSaplingStructure(st.type)) {
      ctx.save();
      if (st.hitFlashTimer > 0) {
        ctx.filter = 'brightness(1.7)';
      }
      this.drawTreeSaplingStage(ctx, st, wx, wy, globalTime);
      ctx.restore();
      if (st.hp < st.maxHp && !isAimed) {
        this.drawMiniBar(
          ctx,
          wx + TILE_SIZE / 2,
          wy - 6,
          st.hp / st.maxHp,
          '#4ade80'
        );
      }
      return;
    }

    const animFrame = Math.floor(globalTime * 5) % 4;
    const sprite = spriteAtlas.getStructureSprite(st.type, animFrame);
    const hasFloorUnder = Boolean(world.getGroundStructureAtTile(st.tileX, st.tileY));
    const connMask = world.getStructureConnectionMask(st.tileX, st.tileY, st.type);

    // Realistic human-scale dimensions (drawW x drawH) for each structure compared to the 26px player
    let drawW = 32;
    let drawH = 36;
    let groundPadY = 2;

    switch (st.type) {
      case PlaceableType.VILLAGE_HOUSE:
        // Multi-tile medieval cottage (2.45x2.55 tiles: door is human-sized, pitched roof towers overhead)
        drawW = 78;
        drawH = 82;
        groundPadY = 4;
        break;
      case PlaceableType.MARKET_STALL:
        // Wide merchant bazaar booth
        drawW = 56;
        drawH = 52;
        groundPadY = 3;
        break;
      case PlaceableType.VILLAGE_WELL:
        // Tall roofed stone well with winch & bucket
        drawW = 48;
        drawH = 58;
        groundPadY = 3;
        break;
      case PlaceableType.HEALING_FOUNTAIN:
        // Grand two-tier marble sanctuary fountain
        drawW = 50;
        drawH = 58;
        groundPadY = 3;
        break;
      case PlaceableType.GUARDIAN_TOTEM:
        // Towering winged sacred totem pole (~2.6x player height)
        drawW = 40;
        drawH = 68;
        groundPadY = 3;
        break;
      case PlaceableType.SOLAR_ALTAR:
        // Stepped golden sanctuary dais with levitating prism
        drawW = 48;
        drawH = 54;
        groundPadY = 3;
        break;
      case PlaceableType.EXPLORER_TENT:
        // Wide ridge-pole expedition pavilion large enough to sleep inside
        drawW = 52;
        drawH = 46;
        groundPadY = 3;
        break;
      case PlaceableType.BED:
        // Cozy oak bed with pillow & quilted blanket
        drawW = 30;
        drawH = 26;
        groundPadY = 1;
        break;
      case PlaceableType.FURNACE:
        // Tall stone blast-smelter with tapered chimney stack
        drawW = 38;
        drawH = 48;
        groundPadY = 2;
        break;
      case PlaceableType.WORKBENCH:
        // Wide carpenter's table at waist/chest height
        drawW = 40;
        drawH = 30;
        groundPadY = 1;
        break;
      case PlaceableType.WEAVING_TABLE:
        // Tailor & loom table with cloth roll, spools & dye pots
        drawW = 38;
        drawH = 32;
        groundPadY = 1;
        break;
      case PlaceableType.CAMPFIRE:
        // Compact low stone hearth ring
        drawW = 26;
        drawH = 26;
        groundPadY = 0;
        break;
      case PlaceableType.ROYAL_BANNER:
        // Tall slender heraldic standard pole
        drawW = 24;
        drawH = 52;
        groundPadY = 2;
        break;
      case PlaceableType.IRON_LANTERN:
        // Slender wrought-iron lamp post
        drawW = 20;
        drawH = 38;
        groundPadY = 1;
        break;
      case PlaceableType.TORCH:
        // Slender standing/mounted wooden torch
        drawW = 16;
        drawH = 28;
        groundPadY = 0;
        break;
      default:
        drawW = 32;
        drawH = 36;
        groundPadY = 1;
        break;
    }

    const centerX = wx + TILE_SIZE / 2;
    const baseY = wy + TILE_SIZE + groundPadY;
    const drawX = Math.round(centerX - drawW / 2);
    const drawY = Math.round(baseY - drawH);

    // Directional structure ground shadow scaled to structure width
    const shadowW = Math.round(drawW * 0.78);
    ctx.fillStyle = 'rgba(8, 12, 18, 0.28)';
    ctx.fillRect(
      Math.round(centerX - shadowW / 2 + shadowDx * 0.6),
      wy + TILE_SIZE - 5,
      shadowW,
      6
    );

    // A. Architectural Integration Plinths & Wall-Mounting Brackets
    if (
      st.type === PlaceableType.TORCH ||
      st.type === PlaceableType.IRON_LANTERN ||
      st.type === PlaceableType.ROYAL_BANNER
    ) {
      const bracketColor =
        st.type === PlaceableType.TORCH ? '#5c3416' : '#334155';
      const rivetColor = '#facc15';
      if (connMask & 1) {
        ctx.fillStyle = bracketColor;
        ctx.fillRect(wx + 14, wy, 4, 12);
        ctx.fillStyle = rivetColor;
        ctx.fillRect(wx + 15, wy + 1, 2, 2);
      } else if (connMask & 8) {
        ctx.fillStyle = bracketColor;
        ctx.fillRect(wx, wy + 14, 15, 4);
        ctx.fillStyle = rivetColor;
        ctx.fillRect(wx + 1, wy + 15, 2, 2);
      } else if (connMask & 2) {
        ctx.fillStyle = bracketColor;
        ctx.fillRect(wx + 17, wy + 14, 15, 4);
        ctx.fillStyle = rivetColor;
        ctx.fillRect(wx + TILE_SIZE - 3, wy + 15, 2, 2);
      } else if (connMask & 4) {
        ctx.fillStyle = bracketColor;
        ctx.fillRect(wx + 14, wy + 20, 4, 12);
      } else if (!hasFloorUnder) {
        ctx.fillStyle = '#334155';
        ctx.fillRect(wx + 10, wy + 24, 12, 5);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(wx + 11, wy + 23, 10, 3);
      }
    } else if (st.type === PlaceableType.CAMPFIRE && hasFloorUnder) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(wx + 3, wy + 5, TILE_SIZE - 6, TILE_SIZE - 8);
      ctx.fillStyle = '#475569';
      ctx.fillRect(wx + 5, wy + 7, TILE_SIZE - 10, TILE_SIZE - 12);
    } else if (
      !hasFloorUnder &&
      (st.type === PlaceableType.WORKBENCH ||
        st.type === PlaceableType.WEAVING_TABLE ||
        st.type === PlaceableType.FURNACE ||
        st.type === PlaceableType.SOLAR_ALTAR ||
        st.type === PlaceableType.CHEST)
    ) {
      ctx.fillStyle = 'rgba(30, 41, 59, 0.45)';
      ctx.fillRect(Math.round(centerX - drawW * 0.42), wy + 23, Math.round(drawW * 0.84), 6);
    }

    // B. Special Interactive Chest Rendering (Compact waist-high single chest or wide seamless double-chest)
    if (st.type === PlaceableType.CHEST) {
      ctx.save();
      if (st.hitFlashTimer > 0) {
        ctx.filter = 'brightness(1.7)';
      }
      this.drawInteractiveChest(ctx, st, wx, wy, connMask, animFrame);
      ctx.restore();

      const hasLoot = Boolean(st.lootItems && st.lootItems.length > 0);
      const storedCount = Array.isArray(st.storageSlots)
        ? st.storageSlots.filter((s) => s !== null && s.count > 0).length
        : 0;

      if (hasLoot) {
        const floatY = Math.sin(globalTime * 4.5 + st.tileX) * 2;
        ctx.fillStyle = st.villageId ? '#38bdf8' : '#fde047';
        ctx.fillRect(wx + TILE_SIZE / 2 - 2, wy - 3 + floatY, 4, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(wx + TILE_SIZE / 2 - 1, wy - 2 + floatY, 2, 2);
      } else if (storedCount > 0) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(wx + TILE_SIZE - 11, wy + 3, 10, 8);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 6px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(storedCount), wx + TILE_SIZE - 6, wy + 9);
      }

      if (st.hp < st.maxHp && !isAimed) {
        this.drawMiniBar(ctx, wx + TILE_SIZE / 2, wy - 4, st.hp / st.maxHp, '#38bdf8');
      }
      return;
    }

    // Automatic Roof/Monument Occlusion Fade when Player walks behind a tall building
    let isOccludingPlayer = false;
    if (player && drawH >= 48) {
      const stSortY = wy + TILE_SIZE * 0.85;
      const playerSortY = player.y + 10;
      if (
        playerSortY < stSortY &&
        player.y > drawY + 6 &&
        Math.abs(player.x - centerX) < drawW * 0.45
      ) {
        isOccludingPlayer = true;
      }
    }

    ctx.save();
    if (isOccludingPlayer) {
      ctx.globalAlpha = 0.48;
    }
    if (st.hitFlashTimer > 0) {
      ctx.filter = 'brightness(1.7)';
    }
    const rot: 0 | 1 | 2 | 3 =
      st.rotation !== undefined
        ? st.rotation
        : st.orientation === 'vertical'
        ? 1
        : 0;

    if (
      rot !== 0 &&
      this.drawRotatedFurnitureOrStation(
        ctx,
        st,
        wx,
        wy,
        centerX,
        drawX,
        drawY,
        drawW,
        drawH,
        rot
      )
    ) {
      // Custom directional view rendered
    } else {
      if (rot === 1 || rot === 3) {
        ctx.translate(centerX, wy + TILE_SIZE / 2);
        ctx.scale(-1, 1);
        ctx.translate(-centerX, -(wy + TILE_SIZE / 2));
      }
      ctx.drawImage(sprite, drawX, drawY, drawW, drawH);
    }
    ctx.restore();

    // C. Continuous Structure Ambient FX (Smoke, Embers, Sacred Rings, Fountain Ripples)
    this.drawStructureAmbientFx(ctx, st, wx, wy, drawY, globalTime);

    // D. Market Stall: Render displayed merchandise on counter, Owner Nameplate, and Customer Offer Exclamation (`!`)
    if (st.type === PlaceableType.MARKET_STALL) {
      const isVillagerStall =
        st.ownerType === 'VILLAGER' ||
        (!st.ownerType &&
          Boolean(st.villageId || st.id.startsWith('world_struct_')));
      const isVillagerSleeping = isVillagerStall && Boolean(st.ownerSleeping);

      const activeSlots = Array.isArray(st.stallSlots)
        ? st.stallSlots.filter((s) => s !== null && s.count > 0 && s.enabled)
        : [];
      let displayItemIds: string[] = [];
      if (!isVillagerSleeping) {
        if (activeSlots.length > 0) {
          displayItemIds = activeSlots.slice(0, 4).map((s) => s!.itemId);
        } else if (isVillagerStall) {
          displayItemIds = ['healing_salve', 'rope', 'apple', 'saddle'];
        }
      }

      // Draw up to 4 mini item icons displayed on the wooden market counter
      if (displayItemIds.length > 0) {
        const displayCount = Math.min(4, displayItemIds.length);
        const startX = centerX - (displayCount * 9) / 2;
        for (let i = 0; i < displayCount; i++) {
          const itemSprite = spriteAtlas.getItemCanvas(displayItemIds[i]);
          ctx.drawImage(
            itemSprite,
            Math.round(startX + i * 9),
            Math.round(wy + 6),
            8,
            8
          );
        }
      }

      const offer = st.pendingCustomerOffer;
      const distToPlayer = player
        ? Math.hypot(player.x - centerX, player.y - (wy + 16))
        : 999;

      if (offer) {
        // Animated Exclamation Mark (`!`) above the stall + Customer Offer banner!
        const bounce = Math.sin(globalTime * 7.5) * 2.5;
        const alertY = drawY - 22 + bounce;

        ctx.save();
        // Glowing golden-crimson exclamation box (`!`)
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(centerX - 8, alertY - 12, 16, 16);
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(centerX - 8, alertY - 12, 16, 16);

        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 11px "Silkscreen", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('!', centerX, alertY);

        // Offer summary pill when player is within view
        if (distToPlayer <= 220) {
          const itemName = ITEMS[offer.itemId]?.name || offer.itemId;
          const offerText = `${offer.buyerName}: ${offer.quantity}x ${itemName} por ${offer.totalPrice} Ouro!`;
          ctx.font = 'bold 6.5px "Plus Jakarta Sans", sans-serif';
          const pillW = Math.max(96, offerText.length * 3.85);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          ctx.fillRect(centerX - pillW / 2, alertY - 26, pillW, 12);
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 1;
          ctx.strokeRect(centerX - pillW / 2, alertY - 26, pillW, 12);
          ctx.fillStyle = '#fde047';
          ctx.fillText(offerText, centerX, alertY - 18);
        }
        ctx.restore();
      } else if (distToPlayer <= 135) {
        const isPlayerOwner = st.ownerType === 'PLAYER';
        const isOpen = st.stallOpen !== false;
        const ownerTag = isPlayerOwner
          ? isOpen
            ? `👑 ${st.customName || 'Sua Tenda'} (${activeSlots.length} à venda)`
            : `🔒 ${st.customName || 'Sua Tenda'} (Fechada)`
          : isVillagerSleeping
          ? `🌙 ${st.customName || 'Tenda da Vila'} · Dono dormindo`
          : `🏪 ${st.customName || 'Tenda da Vila'} · Dono: ${st.ownerName || 'Mercador'}`;
        ctx.save();
        ctx.font = 'bold 6px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        const bW = Math.max(76, ownerTag.length * 3.6);
        ctx.fillStyle = 'rgba(10, 14, 23, 0.84)';
        ctx.fillRect(centerX - bW / 2, drawY - 13, bW, 11);
        ctx.fillStyle = isPlayerOwner
          ? isOpen
            ? '#4ade80'
            : '#f87171'
          : '#fbbf24';
        ctx.fillText(ownerTag, centerX, drawY - 5.5);
        ctx.restore();
      }
    }

    // If Villagers are currently sleeping/inside this house or bed and player is nearby, show a cozy occupied indicator
    if (creatures && player) {
      const sleepingInside = creatures.filter(
        (c) => c.isInsideHouse && c.homeHouseId === st.id && c.hp > 0
      );
      if (
        sleepingInside.length > 0 &&
        Math.hypot(player.x - centerX, player.y - (wy + 16)) <= 145
      ) {
        const names = sleepingInside.map((r) => r.name).join(' & ');
        const badgeText =
          st.type === PlaceableType.BED
            ? `💤 ${names} (Dormindo)`
            : `🏠 ${names} (Em Casa · Bata na Porta)`;
        ctx.save();
        if (st.type === PlaceableType.BED) {
          // Draw sleeping villager head on pillow under blanket
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(centerX - 5, wy + 5, 10, 7);
          ctx.fillStyle = '#fdba74';
          ctx.fillRect(centerX - 4, wy + 6, 8, 5);
          ctx.fillStyle = '#451a03';
          ctx.fillRect(centerX - 4, wy + 5, 8, 2);
        }
        ctx.font = 'bold 6.5px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        const bW = Math.max(82, badgeText.length * 3.8);
        ctx.fillStyle = 'rgba(10, 14, 23, 0.88)';
        ctx.fillRect(centerX - bW / 2, drawY - 14, bW, 12);
        ctx.fillStyle = '#fde047';
        ctx.fillText(badgeText, centerX, drawY - 6);
        ctx.restore();
      }
    }

    if (st.hp < st.maxHp && !isAimed) {
      this.drawMiniBar(
        ctx,
        centerX,
        drawY - 20,
        st.hp / st.maxHp,
        '#38bdf8'
      );
    }
  }

  /**
   * Renders bespoke pixel-art views for 4-directional rotatable furniture, stations, and shelters
   * when rotated to East (`rot === 1`), North/Rear (`rot === 2`), or West (`rot === 3`).
   */
  private drawRotatedFurnitureOrStation(
    ctx: CanvasRenderingContext2D,
    st: PlacedStructure,
    wx: number,
    wy: number,
    _centerX: number,
    drawX: number,
    drawY: number,
    drawW: number,
    drawH: number,
    rot: 0 | 1 | 2 | 3
  ): boolean {
    if (rot === 0) return false;

    // 1. BED (Cama de Madeira) — 4 distinct views
    if (st.type === PlaceableType.BED) {
      if (rot === 2) {
        // Norte (Costas): Headboard at South (front-most), blanket at North, pillow at South
        ctx.fillStyle = '#3b1d0a';
        ctx.fillRect(wx + 5, wy + 2, 22, 27);
        // Crimson blanket at North
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(wx + 6, wy + 3, 20, 14);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(wx + 7, wy + 4, 18, 11);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(wx + 6, wy + 15, 20, 2);
        // White pillow near South headboard
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(wx + 8, wy + 17, 16, 5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(wx + 9, wy + 18, 14, 3);
        // Tall carved oak headboard facing the camera at South
        ctx.fillStyle = '#451a03';
        ctx.fillRect(wx + 4, wy + 21, 24, 9);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(wx + 5, wy + 22, 22, 7);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(wx + 7, wy + 23, 8, 5);
        ctx.fillRect(wx + 17, wy + 23, 8, 5);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(wx + 4, wy + 20, 3, 2);
        ctx.fillRect(wx + 25, wy + 20, 3, 2);
        return true;
      }
      // Leste (rot === 1: Headboard West, Foot East) or Oeste (rot === 3: Headboard East, Foot West)
      const headWest = rot === 1;
      ctx.fillStyle = '#3b1d0a';
      ctx.fillRect(wx + 1, wy + 6, 30, 22);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(wx + 2, wy + 7, 28, 20);
      // Mattress
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(wx + 3, wy + 8, 26, 16);
      // Quilted crimson blanket on foot side
      const blankX = headWest ? wx + 11 : wx + 3;
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(blankX, wy + 8, 18, 16);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(blankX + 1, wy + 9, 16, 13);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(headWest ? blankX : blankX + 16, wy + 8, 2, 16);
      // Pillow on headboard side
      const pilX = headWest ? wx + 5 : wx + 22;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(pilX, wy + 9, 5, 13);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(pilX + 1, wy + 10, 3, 11);
      // Tall Side Headboard
      const hbX = headWest ? wx + 1 : wx + 27;
      ctx.fillStyle = '#451a03';
      ctx.fillRect(hbX, wy + 3, 4, 25);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(hbX + 1, wy + 4, 2, 22);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(hbX + 1, wy + 2, 2, 2);
      return true;
    }

    // 2. WORKBENCH (Bancada de Trabalho) — 4 distinct views
    if (st.type === PlaceableType.WORKBENCH) {
      if (rot === 2) {
        // Norte (Costas): Tool rack bar in front, vice on right, blueprint facing North
        ctx.fillStyle = '#291507';
        ctx.fillRect(wx + 2, wy + 19, 5, 10);
        ctx.fillRect(wx + 25, wy + 19, 5, 10);
        ctx.fillStyle = '#451a03';
        ctx.fillRect(wx, wy + 6, 32, 15);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(wx + 1, wy + 7, 30, 12);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(wx + 2, wy + 8, 28, 4);
        // Blueprint & tools seen from behind
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(wx + 6, wy + 8, 10, 6);
        // Raised back tool rail at South edge (closest to camera)
        ctx.fillStyle = '#3b1d0a';
        ctx.fillRect(wx + 1, wy + 15, 30, 6);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(wx + 2, wy + 16, 28, 4);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(wx + 7, wy + 16, 4, 3);
        ctx.fillRect(wx + 19, wy + 16, 6, 3);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(wx + 13, wy + 16, 3, 3);
        return true;
      }
      // Leste (rot === 1) or Oeste (rot === 3): North-South oriented carpenter table (24x30)
      const faceEast = rot === 1;
      ctx.fillStyle = '#291507';
      ctx.fillRect(wx + 5, wy + 22, 5, 8);
      ctx.fillRect(wx + 22, wy + 22, 5, 8);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(wx + 4, wy + 2, 24, 23);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(wx + 5, wy + 3, 22, 20);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(wx + 6, wy + 4, 9, 18);
      ctx.fillRect(wx + 16, wy + 4, 10, 18);
      // Blueprint scroll & saw oriented vertically
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(wx + 9, wy + 6, 10, 11);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(wx + 11, wy + 8, 6, 7);
      // Side iron vice on facing edge
      const viceX = faceEast ? wx + 26 : wx + 2;
      ctx.fillStyle = '#334155';
      ctx.fillRect(viceX, wy + 10, 4, 8);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(viceX + 1, wy + 11, 2, 6);
      return true;
    }

    // 3. FURNACE (Fornalha de Pedra) — 4 distinct views
    if (st.type === PlaceableType.FURNACE) {
      const isLit = GameRenderer.isFurnaceInUse(st);
      if (rot === 2) {
        // Norte (Costas): Solid cobbled stone back wall & rear chimney flue (no front grate)
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(wx + 2, wy - 10, 28, 39);
        ctx.fillStyle = '#334155';
        ctx.fillRect(wx + 3, wy - 8, 26, 36);
        ctx.fillStyle = '#475569';
        ctx.fillRect(wx + 5, wy - 6, 10, 10);
        ctx.fillRect(wx + 17, wy - 6, 10, 10);
        ctx.fillRect(wx + 4, wy + 6, 12, 10);
        ctx.fillRect(wx + 18, wy + 6, 9, 10);
        ctx.fillRect(wx + 6, wy + 18, 19, 8);
        // Rear iron tension straps & rivets
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(wx + 2, wy + 3, 28, 3);
        ctx.fillRect(wx + 2, wy + 16, 28, 3);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(wx + 5, wy + 4, 2, 1);
        ctx.fillRect(wx + 25, wy + 4, 2, 1);
        // Chimney top crown
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(wx + 8, wy - 14, 16, 6);
        ctx.fillStyle = isLit ? '#fb923c' : '#0f172a';
        ctx.fillRect(wx + 11, wy - 14, 10, 3);
        return true;
      }
      // Leste (rot === 1) or Oeste (rot === 3): Side profile with firebox mouth on East or West
      const faceEast = rot === 1;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(wx + 4, wy - 10, 24, 39);
      ctx.fillStyle = '#334155';
      ctx.fillRect(wx + 5, wy - 8, 22, 36);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(wx + 7, wy - 6, 16, 12);
      ctx.fillRect(wx + 7, wy + 8, 16, 16);
      // Chimney top
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(wx + 9, wy - 14, 14, 6);
      // Protruding firebox mouth on facing side
      const mouthX = faceEast ? wx + 22 : wx + 2;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(mouthX, wy + 7, 8, 18);
      ctx.fillStyle = isLit ? '#ea580c' : '#090d16';
      ctx.fillRect(mouthX + (faceEast ? 2 : 1), wy + 10, 5, 12);
      if (isLit) {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(mouthX + (faceEast ? 3 : 2), wy + 13, 3, 7);
      }
      // Side leather bellows on opposite side
      const bellowX = faceEast ? wx + 1 : wx + 26;
      ctx.fillStyle = '#78350f';
      ctx.fillRect(bellowX, wy + 12, 5, 11);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(bellowX + 1, wy + 14, 3, 2);
      return true;
    }

    // 4. WEAVING_TABLE (Mesa de Tecelagem) — 4 distinct views
    if (st.type === PlaceableType.WEAVING_TABLE) {
      if (rot === 2) {
        // Norte (Costas): Loom frame in front, hanging crimson fabric roll & dye vats
        ctx.fillStyle = '#3b1d0a';
        ctx.fillRect(wx + 1, wy + 5, 30, 23);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(wx + 2, wy + 6, 28, 18);
        // Hanging woven crimson fabric roll on rear
        ctx.fillStyle = '#be123c';
        ctx.fillRect(wx + 6, wy + 8, 12, 14);
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(wx + 7, wy + 9, 10, 10);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(wx + 6, wy + 19, 12, 2);
        // Dye pots on right
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(wx + 21, wy + 9, 4, 4);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(wx + 25, wy + 12, 4, 4);
        // Elevated wooden loom beam at front-most edge
        ctx.fillStyle = '#451a03';
        ctx.fillRect(wx + 3, wy + 1, 26, 6);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(wx + 4, wy + 2, 24, 4);
        return true;
      }
      // Leste (rot === 1) or Oeste (rot === 3): North-South side profile of loom table
      const faceEast = rot === 1;
      ctx.fillStyle = '#3b1d0a';
      ctx.fillRect(wx + 4, wy + 2, 24, 28);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(wx + 5, wy + 3, 22, 25);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(wx + 6, wy + 4, 20, 21);
      // Vertical cloth loom roller & warp threads
      const clothX = faceEast ? wx + 15 : wx + 7;
      ctx.fillStyle = '#be123c';
      ctx.fillRect(clothX, wy + 5, 9, 16);
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(clothX + 1, wy + 6, 7, 13);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(clothX + 2, wy + 7, 5, 2);
      // 3 colorful dye vats lined vertically on the other side
      const dyeX = faceEast ? wx + 7 : wx + 19;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(dyeX, wy + 6, 5, 4);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(dyeX, wy + 12, 5, 4);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(dyeX, wy + 18, 5, 4);
      return true;
    }

    // 5. MARKET_STALL (Tenda de Vendas) — 4 distinct views
    if (st.type === PlaceableType.MARKET_STALL) {
      if (rot === 2) {
        // Norte (Costas): Rear view with back posts, storage crates under striped awning
        ctx.fillStyle = '#3b1d0a';
        ctx.fillRect(drawX + 4, drawY + 12, 5, drawH - 14);
        ctx.fillRect(drawX + drawW - 9, drawY + 12, 5, drawH - 14);
        // Merchant counter at North
        ctx.fillStyle = '#451a03';
        ctx.fillRect(drawX + 3, wy + 4, drawW - 6, 16);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(drawX + 4, wy + 5, drawW - 8, 14);
        // Rear wooden supply crates & coin chest visible in front
        ctx.fillStyle = '#92400e';
        ctx.fillRect(wx + 4, wy + 16, 11, 10);
        ctx.fillRect(wx + 17, wy + 17, 11, 9);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(wx + 5, wy + 17, 9, 7);
        ctx.fillRect(wx + 18, wy + 18, 9, 6);
        // Striped Awning Roof seen from rear
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(drawX + 1, drawY + 1, drawW - 2, 17);
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = i % 2 === 0 ? '#b91c1c' : '#fef3c7';
          const sw = Math.floor((drawW - 4) / 6);
          ctx.fillRect(drawX + 2 + i * sw, drawY + 2, sw, 14);
        }
        ctx.fillStyle = '#eab308';
        ctx.fillRect(drawX + 1, drawY + 16, drawW - 2, 2);
        return true;
      }
      // Leste (rot === 1) or Oeste (rot === 3): Side-oriented market stall
      const faceEast = rot === 1;
      ctx.fillStyle = '#3b1d0a';
      ctx.fillRect(wx + 2, drawY + 10, 4, drawH - 12);
      ctx.fillRect(wx + 26, drawY + 10, 4, drawH - 12);
      // Side merchant counter along East or West edge
      const counterX = faceEast ? wx + 14 : wx + 2;
      ctx.fillStyle = '#451a03';
      ctx.fillRect(counterX, wy + 2, 16, 26);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(counterX + 1, wy + 3, 14, 24);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(counterX + 2, wy + 4, 12, 22);
      // Side-sloped striped awning canopy
      ctx.fillStyle = '#1f1209';
      ctx.fillRect(wx - 2, drawY + 2, 36, 18);
      for (let row = 0; row < 4; row++) {
        ctx.fillStyle = row % 2 === 0 ? '#dc2626' : '#fef3c7';
        ctx.fillRect(wx - 1, drawY + 3 + row * 4, 34, 4);
      }
      ctx.fillStyle = '#facc15';
      ctx.fillRect(faceEast ? wx + 30 : wx - 2, drawY + 3, 3, 16);
      return true;
    }

    // 6. EXPLORER_TENT (Tenda do Explorador) — 4 distinct views
    if (st.type === PlaceableType.EXPLORER_TENT) {
      if (rot === 2) {
        // Norte (Costas): Solid rear canvas wall & wooden ridge pole (no front door flap)
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(drawX + 3, drawY + 6, drawW - 6, drawH - 8);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(drawX + 5, drawY + 8, drawW - 10, drawH - 12);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(drawX + 8, drawY + 10, drawW - 16, drawH - 18);
        // Rear center wooden pole & guy ropes
        ctx.fillStyle = '#451a03';
        ctx.fillRect(wx + 14, drawY + 4, 4, drawH - 6);
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(drawX + 7, drawY + 14, drawW - 14, 3);
        return true;
      }
      // Leste (rot === 1) or Oeste (rot === 3): Side profile of ridge tent with entrance on East or West
      const faceEast = rot === 1;
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(drawX + 4, drawY + 8, drawW - 8, drawH - 10);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(drawX + 6, drawY + 10, drawW - 12, drawH - 14);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(drawX + 8, drawY + 11, drawW - 16, 10);
      // Tent ridge beam along top
      ctx.fillStyle = '#451a03';
      ctx.fillRect(drawX + 3, drawY + 7, drawW - 6, 4);
      // Side entrance opening
      const openX = faceEast ? drawX + drawW - 14 : drawX + 6;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(openX, drawY + 18, 8, drawH - 22);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(openX + (faceEast ? -2 : 8), drawY + 16, 2, drawH - 20);
      return true;
    }

    // 7. VILLAGE_HOUSE (Cabana Rústica) — 4 distinct views
    if (st.type === PlaceableType.VILLAGE_HOUSE) {
      if (rot === 2) {
        // Norte (Costas): Rear timber/stone wall, back shuttered window & chimney, no front door
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(drawX + 6, drawY + 20, drawW - 12, drawH - 22);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(drawX + 8, drawY + 22, drawW - 16, drawH - 26);
        // Pitched terracotta roof from behind
        ctx.fillStyle = '#7c2d12';
        ctx.fillRect(drawX + 2, drawY + 4, drawW - 4, 22);
        ctx.fillStyle = '#c2410c';
        ctx.fillRect(drawX + 4, drawY + 6, drawW - 8, 18);
        // Rear window
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(wx + 11, drawY + 28, 10, 10);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(wx + 12, drawY + 29, 8, 8);
        return true;
      }
      // Leste (rot === 1) or Oeste (rot === 3): Side cottage profile
      const faceEast = rot === 1;
      ctx.fillStyle = '#1f1209';
      ctx.fillRect(drawX + 6, drawY + 20, drawW - 12, drawH - 22);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(drawX + 8, drawY + 22, drawW - 16, drawH - 26);
      // Side roof slope
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(drawX + 3, drawY + 5, drawW - 6, 20);
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(drawX + 5, drawY + 7, drawW - 10, 16);
      // Side doorway on facing edge
      const doorX = faceEast ? drawX + drawW - 18 : drawX + 8;
      ctx.fillStyle = '#451a03';
      ctx.fillRect(doorX, drawY + 30, 10, drawH - 34);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(doorX + (faceEast ? 2 : 6), drawY + 40, 2, 3);
      return true;
    }

    return false;
  }

  /**
   * Renders live atmospheric effects on placed structures:
   * - Campfire & Furnace: rising smoke puffs & glowing embers
   * - Village House: cozy chimney smoke
   * - Torch & Iron Lantern: warm flickering flame halo & spark
   * - Solar Altar & Guardian Totem: rotating runic ground rings & arcane motes
   * - Healing Fountain & Village Well: shimmering water droplets
   */
  private drawStructureAmbientFx(
    ctx: CanvasRenderingContext2D,
    st: PlacedStructure,
    wx: number,
    wy: number,
    drawY: number,
    globalTime: number
  ): void {
    const seed = st.tileX * 19 + st.tileY * 31;

    if (st.type === PlaceableType.VILLAGE_HOUSE) {
      // Cozy hearth ember/smoke puff rising from the stone chimney top
      const puffPhase = (globalTime * 0.9 + (seed % 7) * 0.15) % 1;
      const cx = wx + 32 + Math.sin(globalTime * 2.5 + seed) * 3;
      const cy = drawY + 4 - puffPhase * 14;
      ctx.fillStyle = `rgba(226, 232, 240, ${(0.55 * (1 - puffPhase)).toFixed(2)})`;
      ctx.fillRect(cx, cy, 3, 3);
      return;
    }

    if (
      st.type === PlaceableType.CAMPFIRE ||
      (st.type === PlaceableType.FURNACE && GameRenderer.isFurnaceInUse(st)) ||
      st.type === PlaceableType.TORCH ||
      st.type === PlaceableType.IRON_LANTERN
    ) {
      // Crisp rising pixel embers
      const emberPhase = (globalTime * 1.35 + (seed % 5) * 0.2) % 1;
      const ex = wx + 15 + Math.sin(globalTime * 4.5 + seed) * 4;
      const ey = drawY + 6 - emberPhase * 14;
      ctx.fillStyle = emberPhase < 0.5 ? '#fef08a' : '#fb923c';
      ctx.fillRect(ex, ey, 2, 2);
      return;
    }

    if (
      st.type === PlaceableType.SOLAR_ALTAR ||
      st.type === PlaceableType.GUARDIAN_TOTEM
    ) {
      const pulse = Math.sin(globalTime * 3.8 + seed) * 1.8;
      ctx.save();
      ctx.strokeStyle =
        st.type === PlaceableType.GUARDIAN_TOTEM
          ? 'rgba(56, 189, 248, 0.48)'
          : 'rgba(250, 204, 21, 0.48)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(
        wx + 16,
        wy + 26,
        18 + pulse,
        6 + pulse * 0.3,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (
      st.type === PlaceableType.HEALING_FOUNTAIN ||
      st.type === PlaceableType.VILLAGE_WELL
    ) {
      const dropPhase = (globalTime * 1.5 + (seed % 5) * 0.2) % 1;
      const dx = wx + 12 + Math.sin(globalTime * 4 + seed) * 7;
      const dy = wy + 8 - Math.sin(dropPhase * Math.PI) * 9;
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(dx, dy, 2, 2);
    }
  }

  /**
   * Renders an Interactive Storage Chest with H/V orientation, Double-Chest seamless coupling, and Open/Closed lid state.
   * Proportioned to realistic waist height (26x22 single, 58x22 double) relative to the player.
   */
  private drawInteractiveChest(
    ctx: CanvasRenderingContext2D,
    st: PlacedStructure,
    wx: number,
    wy: number,
    connMask: number,
    animFrame: number
  ): void {
    const hasE = (connMask & 2) !== 0;
    const hasW = (connMask & 8) !== 0;
    const rot: 0 | 1 | 2 | 3 =
      st.rotation !== undefined
        ? st.rotation
        : st.orientation === 'vertical'
        ? 1
        : 0;
    const isVertical = (rot === 1 || rot === 3) && !hasE && !hasW;
    const isRearView = rot === 2 && !hasE && !hasW;
    const storedCount = Array.isArray(st.storageSlots)
      ? st.storageSlots.filter((s) => s !== null && s.count > 0).length
      : 0;

    if (isVertical) {
      // North-South Side Profile Chest (16x24 waist-high profile)
      // rot === 1: clasp on East (right); rot === 3: clasp on West (left)
      const facingWest = rot === 3;
      ctx.fillStyle = '#3b1d0a';
      ctx.fillRect(wx + 8, wy + 5, 16, 23);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(wx + 9, wy + 6, 14, 21);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(facingWest ? wx + 13 : wx + 10, wy + 7, 9, 19);
      // Forged iron bands
      ctx.fillStyle = '#334155';
      ctx.fillRect(wx + 8, wy + 9, 16, 3);
      ctx.fillRect(wx + 8, wy + 21, 16, 3);
      // Golden side clasp on the facing side
      ctx.fillStyle = '#facc15';
      ctx.fillRect(facingWest ? wx + 7 : wx + 21, wy + 14, 4, 5);
      if (st.isOpen) {
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(wx + 11, wy + 8, 8, 15);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(wx + 13, wy + 11, 4, 7);
      }
      return;
    }

    if (isRearView) {
      // Rear View Chest (facing North / away from camera): iron hinges on back, no front lock plate
      ctx.fillStyle = '#3b1d0a';
      ctx.fillRect(wx + 3, wy + 6, 26, 22);
      ctx.fillStyle = '#5c2d10';
      ctx.fillRect(wx + 4, wy + 7, 24, 20);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(wx + 5, wy + 8, 22, 7);
      // Iron straps & rear double hinges
      ctx.fillStyle = '#334155';
      ctx.fillRect(wx + 6, wy + 7, 3, 20);
      ctx.fillRect(wx + 23, wy + 7, 3, 20);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(wx + 6, wy + 14, 3, 3);
      ctx.fillRect(wx + 23, wy + 14, 3, 3);
      ctx.fillStyle = '#291507';
      ctx.fillRect(wx + 4, wy + 15, 24, 1);
      return;
    }

    // Standard Horizontal Chest (26x22 waist-high single, or seamless East/West Double-Chest!)
    const xStart = hasW ? wx : wx + 3;
    const xEnd = hasE ? wx + TILE_SIZE : wx + TILE_SIZE - 3;
    const width = xEnd - xStart;

    if (!st.isOpen) {
      // Closed Chest Base & Domed Timber Lid (26x22 centered at bottom of tile)
      const sprite = spriteAtlas.getStructureSprite(PlaceableType.CHEST, animFrame);
      ctx.drawImage(sprite, wx + 3, wy + 6, 26, 22);

      // If connected to an adjacent East or West chest, bridge the gap into a seamless Double Chest!
      if (hasE) {
        ctx.fillStyle = '#451a03';
        ctx.fillRect(wx + TILE_SIZE - 6, wy + 10, 6, 17);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(wx + TILE_SIZE - 6, wy + 11, 6, 15);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(wx + TILE_SIZE - 6, wy + 11, 6, 5);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(wx + TILE_SIZE - 3, wy + 15, 3, 4);
      }
      if (hasW) {
        ctx.fillStyle = '#451a03';
        ctx.fillRect(wx, wy + 10, 6, 17);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(wx, wy + 11, 6, 15);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(wx, wy + 11, 6, 5);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(wx, wy + 15, 3, 4);
      }
    } else {
      // Open Chest State: Raised back lid + dark velvet interior + gleaming treasure/items inside!
      ctx.fillStyle = '#3b1d0a';
      ctx.fillRect(xStart, wy + 3, width, 8);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(xStart + 1, wy + 4, width - 2, 6);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(xStart, wy + 9, width, 2);

      // Open Chest Cavity
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(xStart + 2, wy + 11, width - 4, 6);
      if (storedCount > 0 || (st.lootItems && st.lootItems.length > 0)) {
        ctx.fillStyle = '#facc15';
        ctx.fillRect(xStart + 4, wy + 12, 5, 3);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(xStart + 11, wy + 13, 4, 2);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(xStart + 17, wy + 12, 4, 3);
      }

      // Chest Front Body Box
      ctx.fillStyle = '#451a03';
      ctx.fillRect(xStart, wy + 16, width, 11);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(xStart + 1, wy + 17, width - 2, 9);
      ctx.fillStyle = '#334155';
      ctx.fillRect(xStart + 3, wy + 17, 3, 9);
      ctx.fillRect(xEnd - 6, wy + 17, 3, 9);
      // Golden Lock Plate
      ctx.fillStyle = '#facc15';
      ctx.fillRect(wx + 13, wy + 16, 6, 5);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(wx + 15, wy + 18, 2, 2);
    }
  }

  /**
   * Renders a Torch mounted directly onto a wall (either on the thin side profile of a vertical wall or on the front face of a horizontal wall).
   */
  private drawWallMountedTorch(
    ctx: CanvasRenderingContext2D,
    world: WorldManager,
    st: PlacedStructure,
    wx: number,
    wy: number,
    globalTime: number
  ): void {
    const wallSt = world.getStructureAtTile(st.tileX, st.tileY) || st;
    const isSideWall = world.isWallOrDoorSideProfileAt(st.tileX, st.tileY, wallSt);
    const flicker = Math.sin(globalTime * 14 + st.tileX * 5 + st.tileY * 3);
    const flickerY = Math.round(flicker);

    if (isSideWall) {
      // Mounted on the slender vertical wall (wx + 12..20)
      const bx = wx + 15;
      const by = wy + 1;

      // Wrought-iron wall sconce bracket gripping the thin wall
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(bx - 1, by + 6, 7, 3);
      ctx.fillRect(bx, by + 4, 2, 6);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(bx, by + 6, 5, 1);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(bx, by + 5, 1, 1);

      // Angled hardwood torch handle
      ctx.fillStyle = '#5c3416';
      ctx.fillRect(bx + 3, by + 1, 3, 8);
      ctx.fillStyle = '#8c5327';
      ctx.fillRect(bx + 3, by + 2, 2, 6);

      // Pitch/coal collar
      ctx.fillStyle = '#18181b';
      ctx.fillRect(bx + 2, by - 1, 5, 2);

      // Warm torchlight aura
      ctx.fillStyle = 'rgba(255, 165, 35, 0.34)';
      ctx.beginPath();
      ctx.arc(bx + 4.5, by - 3, 12 + flicker * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Animated flame
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(bx + 2, by - 5 + flickerY, 5, 4);
      ctx.fillRect(bx + 3, by - 7 + flickerY, 3, 2);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(bx + 3, by - 4 + flickerY, 3, 3);
      ctx.fillStyle = '#fef9c3';
      ctx.fillRect(bx + 4, by - 3 + flickerY, 1, 2);
    } else {
      // Mounted on the front face of a horizontal wall
      const cx = wx + 16;
      const cy = wy + 4;

      // Drop shadow on wall masonry behind sconce
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.fillRect(cx - 4, cy + 2, 8, 9);

      // Iron wall plate & ring holder
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(cx - 3, cy + 2, 6, 7);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(cx - 2, cy + 3, 4, 1);
      ctx.fillRect(cx - 2, cy + 7, 4, 1);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(cx - 2, cy + 3, 1, 1);
      ctx.fillRect(cx + 1, cy + 3, 1, 1);

      // Torch wooden shaft angled forward from the wall
      ctx.fillStyle = '#5c3416';
      ctx.fillRect(cx - 2, cy - 2, 4, 8);
      ctx.fillStyle = '#9a602d';
      ctx.fillRect(cx - 1, cy - 1, 2, 6);

      // Pitch head
      ctx.fillStyle = '#18181b';
      ctx.fillRect(cx - 3, cy - 4, 6, 2);

      // Warm glow halo
      ctx.fillStyle = 'rgba(255, 165, 35, 0.36)';
      ctx.beginPath();
      ctx.arc(cx, cy - 6, 13 + flicker * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Flame
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(cx - 3, cy - 8 + flickerY, 6, 4);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(cx - 2, cy - 10 + flickerY, 4, 5);
      ctx.fillStyle = '#fef9c3';
      ctx.fillRect(cx - 1, cy - 7 + flickerY, 2, 3);
    }
  }

  /**
   * Renders 16-state connected Walls, Windows, Fences, and Auto-Aligning Doors/Gates.
   * Side-viewed (vertical North-South) walls and doors are rendered much thinner (8px wide) for authentic perspective,
   * while horizontal (East-West) walls show their full elevated 2.5D front face.
   */
  private drawConnectedWallOrDoor(
    ctx: CanvasRenderingContext2D,
    world: WorldManager,
    st: PlacedStructure,
    wx: number,
    wy: number,
    shadowDx: number
  ): void {
    const mask = world.getStructureConnectionMask(st.tileX, st.tileY, st.type);
    const hasN = (mask & 1) !== 0;
    const hasE = (mask & 2) !== 0;
    const hasS = (mask & 4) !== 0;
    const hasW = (mask & 8) !== 0;

    // 1. AUTO-ALIGNING DOORS & GATES (WOOD_DOOR, DARK_OAK_DOOR, PINE_DOOR, IRON_GATE — Elevated 40px tall architectural portals + Double Doors!)
    if (
      st.type === PlaceableType.WOOD_DOOR ||
      st.type === PlaceableType.DARK_OAK_DOOR ||
      st.type === PlaceableType.PINE_DOOR ||
      st.type === PlaceableType.IRON_GATE
    ) {
      const orient = world.getDoorOrientationAt(
        st.tileX,
        st.tileY,
        st.type,
        st.orientation,
        st.rotation
      );
      const doubleDoor = world.getPartnerDoubleDoor(st.tileX, st.tileY, st);
      const isDouble = Boolean(doubleDoor);
      const isSecondLeaf = Boolean(doubleDoor?.isSecondLeaf);
      const isIron = st.type === PlaceableType.IRON_GATE;
      const isDarkOakDoor = st.type === PlaceableType.DARK_OAK_DOOR;
      const isPineDoor = st.type === PlaceableType.PINE_DOOR;
      const isOpen = Boolean(st.isOpen);

      const postColor = isIron
        ? '#334155'
        : isDarkOakDoor
        ? '#1c0d06'
        : isPineDoor
        ? '#5c3a21'
        : '#4a250d';
      const postTop = isIron
        ? '#94a3b8'
        : isDarkOakDoor
        ? '#5c3a21'
        : isPineDoor
        ? '#d6b07a'
        : '#8c5327';
      const leafColor = isIron
        ? '#475569'
        : isDarkOakDoor
        ? '#2b170b'
        : isPineDoor
        ? '#b88c56'
        : '#78350f';
      const leafHi = isIron
        ? '#cbd5e1'
        : isDarkOakDoor
        ? '#4a2c16'
        : isPineDoor
        ? '#e2be8a'
        : '#b45309';

      // Threshold floor plate
      ctx.fillStyle = isIron
        ? 'rgba(30, 41, 59, 0.55)'
        : isDarkOakDoor
        ? 'rgba(28, 13, 6, 0.65)'
        : isPineDoor
        ? 'rgba(92, 58, 33, 0.55)'
        : 'rgba(67, 35, 13, 0.55)';
      if (orient === 'horizontal') {
        ctx.fillRect(wx, wy + 14, TILE_SIZE, 10);
      } else {
        ctx.fillRect(wx + 12, wy, 8, TILE_SIZE);
      }

      if (orient === 'horizontal') {
        // Outer Door Jamb Pillars:
        // Single door: both West and East jamb pillars.
        // Double door: West leaf has only West jamb pillar; East leaf has only East jamb pillar so the two leaves meet seamlessly in the middle!
        const hasLeftJamb = !isDouble || !isSecondLeaf;
        const hasRightJamb = !isDouble || isSecondLeaf;

        ctx.fillStyle = postColor;
        if (hasLeftJamb) ctx.fillRect(wx, wy - 12, 7, 40);
        if (hasRightJamb) ctx.fillRect(wx + TILE_SIZE - 7, wy - 12, 7, 40);
        ctx.fillStyle = postTop;
        if (hasLeftJamb) ctx.fillRect(wx, wy - 14, 7, 6);
        if (hasRightJamb) ctx.fillRect(wx + TILE_SIZE - 7, wy - 14, 7, 6);

        // Top Lintel Beam bridging seamlessly across single or double doorway
        const lintelX = hasLeftJamb ? wx + 5 : wx;
        const lintelRight = hasRightJamb ? wx + TILE_SIZE - 5 : wx + TILE_SIZE;
        const lintelW = lintelRight - lintelX;
        ctx.fillStyle = postColor;
        ctx.fillRect(lintelX, wy - 13, lintelW, 5);
        ctx.fillStyle = postTop;
        ctx.fillRect(lintelX, wy - 14, lintelW, 2);

        const leafX = hasLeftJamb ? wx + 6 : wx;
        const leafRight = hasRightJamb ? wx + TILE_SIZE - 6 : wx + TILE_SIZE;
        const leafW = leafRight - leafX;
        const handleX = isDouble
          ? isSecondLeaf
            ? wx + 2
            : wx + TILE_SIZE - 5
          : wx + 19;

        if (!isOpen) {
          if (isIron) {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(leafX, wy - 6, leafW, 4);
            ctx.fillRect(leafX, wy + 12, leafW, 4);
            for (let bx = leafX + 2; bx <= leafRight - 4; bx += 4) {
              ctx.fillStyle = leafColor;
              ctx.fillRect(bx, wy - 9, 2, 34);
              ctx.fillStyle = '#facc15';
              ctx.fillRect(bx, wy - 11, 2, 2);
            }
          } else if (isDarkOakDoor) {
            ctx.fillStyle = leafColor;
            ctx.fillRect(leafX, wy - 9, leafW, 35);
            // Recessed vertical dark oak panels
            const p1X = leafX + 2;
            const pW = Math.max(5, Math.floor((leafW - 7) / 2));
            const p2X = p1X + pW + 2;
            ctx.fillStyle = '#140904';
            ctx.fillRect(p1X, wy - 6, pW, 28);
            ctx.fillRect(p2X, wy - 6, pW, 28);
            ctx.fillStyle = leafHi;
            ctx.fillRect(p1X + 1, wy - 5, Math.max(3, pW - 2), 11);
            ctx.fillRect(p2X + 1, wy - 5, Math.max(3, pW - 2), 11);
            ctx.fillRect(p1X + 1, wy + 9, Math.max(3, pW - 2), 12);
            ctx.fillRect(p2X + 1, wy + 9, Math.max(3, pW - 2), 12);
            // Antique bronze trim & ring knocker handle
            ctx.fillStyle = '#b45309';
            ctx.fillRect(leafX, wy - 8, leafW, 2);
            ctx.fillRect(leafX, wy + 22, leafW, 2);
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(handleX, wy + 6, 4, 4);
            ctx.fillStyle = '#2b170b';
            ctx.fillRect(handleX + 1, wy + 7, 2, 2);
          } else if (isPineDoor) {
            ctx.fillStyle = leafColor;
            ctx.fillRect(leafX, wy - 9, leafW, 35);
            ctx.fillStyle = leafHi;
            for (let px = leafX + 1; px < leafRight - 3; px += 6) {
              ctx.fillRect(px, wy - 8, Math.min(5, leafRight - px - 1), 33);
            }
            ctx.fillStyle = '#5c3a21';
            ctx.fillRect(leafX, wy - 5, leafW, 3);
            ctx.fillRect(leafX, wy + 18, leafW, 3);
            for (let s = 0; s < 7; s++) {
              const diagX = isSecondLeaf
                ? leafRight - 5 - s * 2
                : leafX + 2 + s * 2;
              ctx.fillRect(diagX, wy + 15 - s * 3, 3, 3);
            }
            ctx.fillStyle = '#ea580c';
            ctx.fillRect(handleX, wy + 7, 4, 3);
            ctx.fillStyle = '#fdba74';
            ctx.fillRect(handleX + 1, wy + 7, 2, 1);
          } else {
            ctx.fillStyle = leafColor;
            ctx.fillRect(leafX, wy - 9, leafW, 35);
            ctx.fillStyle = leafHi;
            ctx.fillRect(leafX + 1, wy - 9, leafW - 2, 6);
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(leafX, wy - 1, leafW, 2);
            ctx.fillRect(leafX, wy + 16, leafW, 2);
            ctx.fillStyle = '#facc15';
            ctx.fillRect(handleX, wy + 7, 3, 4);
          }
          // Center meeting seam line on Double Doors
          if (isDouble) {
            ctx.fillStyle = '#0d0704';
            ctx.fillRect(isSecondLeaf ? wx : wx + TILE_SIZE - 1, wy - 9, 1, 35);
          }
        } else {
          // Open Door Leaf: left/single leaf swings on West jamb; right double-door leaf swings on East jamb!
          const swingX = isDouble && isSecondLeaf ? wx + TILE_SIZE - 10 : wx + 5;
          ctx.fillStyle = leafColor;
          ctx.fillRect(swingX, wy - 18, 5, 28);
          ctx.fillStyle = leafHi;
          ctx.fillRect(swingX + 1, wy - 18, 3, 5);
          ctx.fillStyle = 'rgba(74, 222, 128, 0.55)';
          ctx.fillRect(wx + 14, wy + 16, 4, 4);
        }
      } else {
        // Side-viewed Vertical Door Orientation (North-South walls): slender 8px wide profile + Double Door support
        const vx = wx + 12;
        const vw = 8;
        const hasNorthJamb = !isDouble || !isSecondLeaf;
        const hasSouthJamb = !isDouble || isSecondLeaf;

        ctx.fillStyle = postColor;
        if (hasNorthJamb) ctx.fillRect(vx, wy - 12, vw, 13);
        if (hasSouthJamb) ctx.fillRect(vx, wy + TILE_SIZE - 10, vw, 12);
        ctx.fillStyle = postTop;
        if (hasNorthJamb) ctx.fillRect(vx + 1, wy - 14, vw - 2, 5);
        if (hasSouthJamb) ctx.fillRect(vx + 1, wy + TILE_SIZE - 12, vw - 2, 5);

        const leafTop = hasNorthJamb ? wy - 4 : wy;
        const leafBot = hasSouthJamb ? wy + TILE_SIZE - 6 : wy + TILE_SIZE;
        const leafH = leafBot - leafTop;
        const handleY = isDouble
          ? isSecondLeaf
            ? wy + 2
            : wy + TILE_SIZE - 5
          : wy + 10;

        if (!isOpen) {
          ctx.fillStyle = leafColor;
          ctx.fillRect(vx + 1, leafTop, vw - 2, leafH);
          ctx.fillStyle = leafHi;
          ctx.fillRect(vx + 2, leafTop, 2, leafH);
          ctx.fillStyle = isPineDoor
            ? '#ea580c'
            : isDarkOakDoor
            ? '#fbbf24'
            : '#facc15';
          ctx.fillRect(vx + 3, handleY, 2, 4);
        } else {
          // Swung open to the East at outer hinge jamb
          const swingY =
            isDouble && isSecondLeaf ? wy + TILE_SIZE - 12 : wy - 4;
          ctx.fillStyle = leafColor;
          ctx.fillRect(vx + vw - 1, swingY, 12, 6);
          ctx.fillStyle = leafHi;
          ctx.fillRect(vx + vw - 1, swingY, 12, 2);
          ctx.fillStyle = 'rgba(74, 222, 128, 0.55)';
          ctx.fillRect(vx + 2, wy + 14, 4, 4);
        }
      }
      return;
    }

    // 1B. WOODEN FENCE GATE (PORTEIRA DE MADEIRA — Waist-high gate complementary to WOOD_FENCE; blocks animals/mobs even when open!)
    if (st.type === PlaceableType.FENCE_GATE) {
      const orient = world.getDoorOrientationAt(
        st.tileX,
        st.tileY,
        st.type,
        st.orientation,
        st.rotation
      );
      const doubleDoor = world.getPartnerDoubleDoor(st.tileX, st.tileY, st);
      const isDouble = Boolean(doubleDoor);
      const isSecondLeaf = Boolean(doubleDoor?.isSecondLeaf);
      const isOpen = Boolean(st.isOpen);

      const postDark = '#4a250d';
      const postCore = '#7c471e';
      const postCap = '#b87a3d';
      const railDark = '#5c3416';
      const railLight = '#9a602d';
      const latchGold = '#facc15';
      const hingeIron = '#334155';

      // Subtle ground shadow
      ctx.fillStyle = 'rgba(8, 12, 18, 0.24)';
      if (orient === 'horizontal') {
        ctx.fillRect(wx + 2 + Math.round(shadowDx * 0.35), wy + 24, TILE_SIZE - 4, 5);
      } else {
        ctx.fillRect(wx + 10 + Math.round(shadowDx * 0.35), wy + 2, 12, TILE_SIZE - 4);
      }

      if (orient === 'horizontal') {
        const hasLeftPost = !isDouble || !isSecondLeaf;
        const hasRightPost = !isDouble || isSecondLeaf;

        // Left & Right Fence Gate Posts (waist-high, matching WOOD_FENCE height wy+3..wy+27)
        if (hasLeftPost) {
          ctx.fillStyle = postDark;
          ctx.fillRect(wx, wy + 3, 7, 24);
          ctx.fillStyle = postCore;
          ctx.fillRect(wx + 1, wy + 4, 5, 21);
          ctx.fillStyle = postCap;
          ctx.fillRect(wx, wy + 1, 7, 4);
        }
        if (hasRightPost) {
          ctx.fillStyle = postDark;
          ctx.fillRect(wx + TILE_SIZE - 7, wy + 3, 7, 24);
          ctx.fillStyle = postCore;
          ctx.fillRect(wx + TILE_SIZE - 6, wy + 4, 5, 21);
          ctx.fillStyle = postCap;
          ctx.fillRect(wx + TILE_SIZE - 7, wy + 1, 7, 4);
        }

        const leafX = hasLeftPost ? wx + 7 : wx;
        const leafRight = hasRightPost ? wx + TILE_SIZE - 7 : wx + TILE_SIZE;
        const leafW = leafRight - leafX;

        if (!isOpen) {
          // Closed horizontal gate leaf: top & bottom horizontal rails + vertical pickets + diagonal brace
          ctx.fillStyle = railDark;
          ctx.fillRect(leafX, wy + 8, leafW, 4);
          ctx.fillRect(leafX, wy + 17, leafW, 4);
          ctx.fillStyle = railLight;
          ctx.fillRect(leafX, wy + 8, leafW, 2);
          ctx.fillRect(leafX, wy + 17, leafW, 2);

          // Center vertical slats & diagonal wood brace
          const midX = Math.floor(leafX + leafW * 0.5) - 2;
          ctx.fillStyle = postDark;
          ctx.fillRect(leafX + 1, wy + 6, 3, 17);
          ctx.fillRect(leafRight - 4, wy + 6, 3, 17);
          ctx.fillRect(midX, wy + 6, 4, 17);
          ctx.fillStyle = railLight;
          ctx.fillRect(midX + 1, wy + 7, 2, 15);

          // Iron hinges & golden latch
          ctx.fillStyle = hingeIron;
          if (hasLeftPost) {
            ctx.fillRect(wx + 5, wy + 9, 3, 2);
            ctx.fillRect(wx + 5, wy + 18, 3, 2);
          }
          if (hasRightPost) {
            ctx.fillRect(wx + TILE_SIZE - 8, wy + 9, 3, 2);
            ctx.fillRect(wx + TILE_SIZE - 8, wy + 18, 3, 2);
          }
          ctx.fillStyle = latchGold;
          const latchX = isDouble
            ? isSecondLeaf
              ? leafX + 1
              : leafRight - 3
            : midX + 1;
          ctx.fillRect(latchX, wy + 12, 2, 4);
        } else {
          // Open horizontal gate leaf: swung open inward/upward from its outer hinge post
          // Subtle cattle-grid/threshold bar on ground reminding that animals cannot cross
          ctx.fillStyle = 'rgba(124, 71, 30, 0.45)';
          ctx.fillRect(leafX + 1, wy + 22, leafW - 2, 2);
          ctx.fillRect(leafX + 1, wy + 25, leafW - 2, 2);

          const swingX =
            isDouble && isSecondLeaf ? wx + TILE_SIZE - 11 : wx + 2;
          // Swung gate leaf projecting North-South on hinge side
          ctx.fillStyle = postDark;
          ctx.fillRect(swingX, wy - 7, 7, 20);
          ctx.fillStyle = railLight;
          ctx.fillRect(swingX + 1, wy - 6, 5, 17);
          ctx.fillStyle = postCap;
          ctx.fillRect(swingX, wy - 8, 7, 3);
          ctx.fillStyle = latchGold;
          ctx.fillRect(swingX + 2, wy - 3, 2, 3);
        }
      } else {
        // Vertical Fence Gate (North-South corridor)
        const vx = wx + 11;
        const vw = 10;
        const hasTopPost = !isDouble || !isSecondLeaf;
        const hasBottomPost = !isDouble || isSecondLeaf;

        if (hasTopPost) {
          ctx.fillStyle = postDark;
          ctx.fillRect(vx, wy - 2, vw, 10);
          ctx.fillStyle = postCore;
          ctx.fillRect(vx + 1, wy - 1, vw - 2, 8);
          ctx.fillStyle = postCap;
          ctx.fillRect(vx, wy - 4, vw, 4);
        }

        const spanTop = hasTopPost ? wy + 8 : wy;
        const spanBot = hasBottomPost ? wy + 22 : wy + TILE_SIZE;
        const spanH = Math.max(6, spanBot - spanTop);

        if (!isOpen) {
          ctx.fillStyle = railDark;
          ctx.fillRect(vx + 2, spanTop, 6, spanH);
          ctx.fillStyle = railLight;
          ctx.fillRect(vx + 3, spanTop, 4, spanH);
          ctx.fillStyle = latchGold;
          const latchY = isDouble
            ? isSecondLeaf
              ? spanTop + 1
              : spanBot - 4
            : Math.floor((spanTop + spanBot) * 0.5) - 1;
          ctx.fillRect(vx + 3, latchY, 3, 3);
        } else {
          // Cattle-grid threshold bars reminding animals cannot pass
          ctx.fillStyle = 'rgba(124, 71, 30, 0.45)';
          ctx.fillRect(vx + 2, spanTop + 2, 2, spanH - 4);
          ctx.fillRect(vx + 6, spanTop + 2, 2, spanH - 4);

          // Swung open to the East from hinge post
          const swingY =
            isDouble && isSecondLeaf ? wy + TILE_SIZE - 12 : wy + 2;
          ctx.fillStyle = postDark;
          ctx.fillRect(vx + vw - 1, swingY, 13, 8);
          ctx.fillStyle = railLight;
          ctx.fillRect(vx + vw, swingY + 1, 11, 5);
          ctx.fillStyle = latchGold;
          ctx.fillRect(vx + vw + 8, swingY + 2, 2, 3);
        }

        if (hasBottomPost) {
          ctx.fillStyle = postDark;
          ctx.fillRect(vx, wy + 20, vw, 11);
          ctx.fillStyle = postCore;
          ctx.fillRect(vx + 1, wy + 21, vw - 2, 9);
          ctx.fillStyle = postCap;
          ctx.fillRect(vx, wy + 18, vw, 4);
        }
      }
      return;
    }

    // 2. 16-STATE MODULAR FENCES (WOOD_FENCE — Waist-high enclosure so player can see over it)
    if (st.type === PlaceableType.WOOD_FENCE) {
      ctx.fillStyle = 'rgba(8, 12, 18, 0.25)';
      ctx.fillRect(wx + 8 + Math.round(shadowDx * 0.4), wy + 24, 16, 5);

      const railDark = '#5c3416';
      const railLight = '#9a602d';
      const standaloneVertical =
        mask === 0 &&
        (st.orientation === 'vertical' || (st.rotation ?? 0) % 2 === 1);
      const standaloneHorizontal = mask === 0 && !standaloneVertical;

      if (hasW || standaloneHorizontal) {
        const wStart = hasW ? wx : wx + 4;
        const wLen = hasW ? 14 : 9;
        ctx.fillStyle = railDark;
        ctx.fillRect(wStart, wy + 8, wLen, 4);
        ctx.fillRect(wStart, wy + 17, wLen, 4);
        ctx.fillStyle = railLight;
        ctx.fillRect(wStart, wy + 8, wLen, 2);
        ctx.fillRect(wStart, wy + 17, wLen, 2);
      }
      if (hasE || standaloneHorizontal) {
        const eLen = hasE ? 14 : 9;
        ctx.fillStyle = railDark;
        ctx.fillRect(wx + 18, wy + 8, eLen, 4);
        ctx.fillRect(wx + 18, wy + 17, eLen, 4);
        ctx.fillStyle = railLight;
        ctx.fillRect(wx + 18, wy + 8, eLen, 2);
        ctx.fillRect(wx + 18, wy + 17, eLen, 2);
      }
      if (hasN || standaloneVertical) {
        const nTop = hasN ? wy - 2 : wy + 1;
        const nLen = hasN ? 12 : 9;
        ctx.fillStyle = railDark;
        ctx.fillRect(wx + 13, nTop, 6, nLen);
        ctx.fillStyle = railLight;
        ctx.fillRect(wx + 14, nTop, 4, nLen);
      }
      // Center Post (24px tall waist-high post)
      ctx.fillStyle = '#4a250d';
      ctx.fillRect(wx + 11, wy + 3, 10, 24);
      ctx.fillStyle = '#7c471e';
      ctx.fillRect(wx + 12, wy + 4, 8, 21);
      ctx.fillStyle = '#b87a3d';
      ctx.fillRect(wx + 11, wy + 1, 10, 4);
      if (hasS || standaloneVertical) {
        const sLen = hasS ? 14 : 11;
        ctx.fillStyle = railDark;
        ctx.fillRect(wx + 13, wy + 18, 6, sLen);
        ctx.fillStyle = railLight;
        ctx.fillRect(wx + 14, wy + 18, 4, sLen);
      }
      return;
    }

    // 3. 16-STATE ARCHITECTURAL WALLS & WINDOWS (Oak, Dark Oak, Pine, Stone, Brick)
    const isStone =
      st.type === PlaceableType.STONE_WALL ||
      st.type === PlaceableType.STONE_WINDOW;
    const isBrick = st.type === PlaceableType.BRICK_WALL;
    const isDarkOak =
      st.type === PlaceableType.DARK_OAK_WALL ||
      st.type === PlaceableType.DARK_OAK_WINDOW;
    const isPine =
      st.type === PlaceableType.PINE_WALL ||
      st.type === PlaceableType.PINE_WINDOW;
    const isWindow =
      st.type === PlaceableType.WOOD_WINDOW ||
      st.type === PlaceableType.DARK_OAK_WINDOW ||
      st.type === PlaceableType.PINE_WINDOW ||
      st.type === PlaceableType.STONE_WINDOW;

    const topCap = isBrick
      ? '#d97706'
      : isStone
      ? '#cbd5e1'
      : isDarkOak
      ? '#6b4226'
      : isPine
      ? '#e2be8a'
      : '#c28442';
    const topInner = isBrick
      ? '#b45309'
      : isStone
      ? '#94a3b8'
      : isDarkOak
      ? '#4a2c16'
      : isPine
      ? '#c49a62'
      : '#9a602d';
    const faceMain = isBrick
      ? '#9a3412'
      : isStone
      ? '#475569'
      : isDarkOak
      ? '#2b170b'
      : isPine
      ? '#8c6239'
      : '#653716';
    const faceDark = isBrick
      ? '#451a03'
      : isStone
      ? '#1e293b'
      : isDarkOak
      ? '#140904'
      : isPine
      ? '#4a2e16'
      : '#3d1f0a';

    // Check if this wall is viewed purely from the side (vertical North-South alignment)
    const isSideProfile = world.isWallOrDoorSideProfileAt(st.tileX, st.tileY, st);

    if (isSideProfile) {
      // SLENDER SIDE-VIEWED WALL (8px wide centered at wx + 12 instead of full tile width)
      const vx = wx + 12;
      const vw = 8;
      const topY = hasN ? wy - 16 : wy - 12;
      const botY = wy + TILE_SIZE;
      const totalH = botY - topY;

      // Slender side cast shadow
      ctx.fillStyle = 'rgba(8, 12, 18, 0.28)';
      ctx.fillRect(vx + vw, topY + 8, 3, totalH - 8);

      // If window wall, keep the glass aperture clear of the solid wall fill so the window pane has 33% transparency
      const sideGlassX = vx + 2;
      const sideGlassY = wy - 1;
      const sideGlassW = vw - 4;
      const sideGlassH = 14;

      if (isWindow) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(vx - 2, topY - 2, vw + 6, totalH + 4);
        ctx.rect(sideGlassX, sideGlassY, sideGlassW, sideGlassH);
        ctx.clip('evenodd');
      }

      // Dark structural outline
      ctx.fillStyle = faceDark;
      ctx.fillRect(vx, topY, vw, totalH);

      // Narrow top cap running North-South (6px inner width)
      ctx.fillStyle = topInner;
      ctx.fillRect(vx + 1, topY + 1, vw - 2, totalH - 8);
      ctx.fillStyle = topCap;
      ctx.fillRect(vx + 2, topY + 1, 2, totalH - 9);

      // Masonry / timber joint lines along the side-viewed top cap
      ctx.fillStyle = isDarkOak ? '#b45309' : faceDark;
      for (let jy = topY + 8; jy < botY - 8; jy += 8) {
        ctx.fillRect(vx + 1, jy, vw - 2, 1);
      }

      if (isWindow) {
        ctx.restore();
        // Side-viewed window frame (solid) + glass slit with 33% transparency (alpha 0.67)
        ctx.fillStyle = isDarkOak ? '#b45309' : isPine ? '#5c3a21' : '#0f172a';
        ctx.fillRect(vx + 1, wy - 2, vw - 2, 1);
        ctx.fillRect(vx + 1, wy + 13, vw - 2, 1);
        ctx.fillRect(vx + 1, wy - 1, 1, 14);
        ctx.fillRect(vx + vw - 2, wy - 1, 1, 14);
        ctx.save();
        ctx.globalAlpha = 0.67; // 33% transparency on the window glass only
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(sideGlassX, sideGlassY, sideGlassW, sideGlassH);
        ctx.fillStyle = '#bae6fd';
        ctx.fillRect(vx + 3, wy, 1, 12);
        ctx.restore();
      }

      // South end front face cap if wall terminates here
      if (!hasS) {
        ctx.fillStyle = faceMain;
        ctx.fillRect(vx + 1, botY - 8, vw - 2, 7);
        ctx.fillStyle = faceDark;
        ctx.fillRect(vx + 1, botY - 9, vw - 2, 1);
      }
      return;
    }

    // HORIZONTAL OR CORNER/T-JUNCTION WALL (adaptive to 8px vertical wall at wx + 12..20)
    const hasVert = hasN || hasS;
    const spanX = hasW ? wx : hasVert && hasE ? wx + 12 : wx + 2;
    const spanRight = hasE
      ? wx + TILE_SIZE
      : hasVert && hasW
      ? wx + 20
      : wx + TILE_SIZE - 2;
    const spanW = Math.max(8, spanRight - spanX);

    // Ground shadow matched to adaptive corner span
    ctx.fillStyle = 'rgba(8, 12, 18, 0.32)';
    ctx.fillRect(
      spanX + Math.round(shadowDx * 0.5),
      wy + TILE_SIZE - 4,
      spanW,
      6
    );

    // North Arm (slender 8px side profile at wx + 12..20)
    if (hasN) {
      const nvx = wx + 12;
      const nvw = 8;
      ctx.fillStyle = faceDark;
      ctx.fillRect(nvx, wy - 16, nvw, 14);
      ctx.fillStyle = topInner;
      ctx.fillRect(nvx + 1, wy - 16, nvw - 2, 13);
      ctx.fillStyle = topCap;
      ctx.fillRect(nvx + 2, wy - 16, 2, 13);
    }

    // Adaptive Horizontal / Corner Body (wy - 14 to wy + 28 = 42px tall)
    const faceLeft = hasW ? spanX : spanX + 1;
    const faceRight = hasE ? spanRight : spanRight - 1;
    const faceW = Math.max(2, faceRight - faceLeft);

    const winLeft = Math.max(spanX + 2, wx + 7);
    const winRight = Math.min(spanRight - 2, wx + 25);
    const winW = Math.max(6, winRight - winLeft);
    const glassX = winLeft + 2;
    const glassY = wy + 1;
    const glassW = Math.max(2, winW - 4);
    const glassH = 15;

    // Exclude the window glass pane from the solid wall body so only the window glass has 33% transparency
    if (isWindow) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(spanX - 2, wy - 16, spanW + 4, 48);
      ctx.rect(glassX, glassY, glassW, glassH);
      ctx.clip('evenodd');
    }

    ctx.fillStyle = faceDark;
    ctx.fillRect(spanX, wy - 14, spanW, 42);
    ctx.fillStyle = faceMain;
    ctx.fillRect(faceLeft, wy - 4, faceW, 30);

    // Brick / Stone / Timber 3-course texture details clipped to adaptive corner span
    const texLeft = hasW ? spanX + 1 : spanX + 2;
    const texRight = hasE ? spanRight - 1 : spanRight - 2;
    const texW = Math.max(2, texRight - texLeft);

    if (isBrick) {
      ctx.fillStyle = '#c2410c';
      ctx.fillRect(texLeft, wy - 2, texW, 6);
      ctx.fillRect(texLeft, wy + 7, texW, 6);
      ctx.fillRect(texLeft, wy + 16, texW, 6);
      ctx.fillStyle = '#fdba74';
      ctx.fillRect(texLeft, wy + 5, texW, 1);
      ctx.fillRect(texLeft, wy + 14, texW, 1);
      ctx.fillRect(texLeft, wy + 23, texW, 1);
      // Vertical mortar joints within adaptive span
      if (wx + 12 >= texLeft + 2 && wx + 12 <= texRight - 2) {
        ctx.fillRect(wx + 12, wy - 2, 1, 7);
        ctx.fillRect(wx + 12, wy + 16, 1, 7);
      }
      if (wx + 21 >= texLeft + 2 && wx + 21 <= texRight - 2) {
        ctx.fillRect(wx + 21, wy - 2, 1, 7);
        ctx.fillRect(wx + 21, wy + 16, 1, 7);
      }
      if (wx + 16 >= texLeft + 2 && wx + 16 <= texRight - 2) {
        ctx.fillRect(wx + 16, wy + 7, 1, 7);
      }
    } else if (isStone) {
      const midW = Math.max(4, Math.floor((texW - 2) * 0.5));
      ctx.fillStyle = '#64748b';
      ctx.fillRect(texLeft, wy - 2, midW, 8);
      if (texW > midW + 2) {
        ctx.fillRect(texLeft + midW + 2, wy - 2, texW - midW - 2, 8);
      }
      ctx.fillRect(texLeft + 1, wy + 8, Math.max(2, texW - 2), 8);
      ctx.fillRect(texLeft, wy + 18, midW, 7);
      if (texW > midW + 2) {
        ctx.fillRect(texLeft + midW + 2, wy + 18, texW - midW - 2, 7);
      }
      // Stone bevel highlights
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(texLeft + 1, wy - 1, Math.max(2, midW - 2), 2);
      ctx.fillRect(texLeft + 2, wy + 9, Math.max(2, texW - 4), 2);
    } else if (isDarkOak) {
      // Parede de Carvalho Escuro: Painéis verticais entalhados em madeira chocolate-expresso com frisos de bronze
      for (let px = texLeft + 1; px < texRight - 3; px += 7) {
        const pw = Math.min(5, texRight - px - 1);
        if (pw <= 1) continue;
        ctx.fillStyle = '#3d2312';
        ctx.fillRect(px, wy - 1, pw, 22);
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(px + 1, wy, Math.max(1, pw - 2), 19);
      }
      // Warm antique bronze horizontal trim bands & studs
      ctx.fillStyle = '#92400e';
      ctx.fillRect(spanX, wy - 3, spanW, 2);
      ctx.fillRect(spanX, wy + 22, spanW, 2);
      ctx.fillStyle = '#f59e0b';
      for (let sx = spanX + 3; sx < spanRight - 2; sx += 7) {
        ctx.fillRect(sx, wy - 3, 2, 1);
        ctx.fillRect(sx, wy + 22, 2, 1);
      }
    } else if (isPine) {
      // Parede de Pinheiro: Toras horizontais arredondadas de abeto claro com encaixes rústicos de cabana nas pontas
      const logRows = [wy - 3, wy + 4, wy + 11, wy + 18];
      for (const ly of logRows) {
        ctx.fillStyle = '#b88c56';
        ctx.fillRect(texLeft, ly, texW, 6);
        ctx.fillStyle = '#e2be8a';
        ctx.fillRect(texLeft, ly, texW, 2);
        ctx.fillStyle = '#f3d9a4';
        ctx.fillRect(texLeft + 1, ly, Math.max(2, texW - 2), 1);
        // Dark spruce bark seam between logs
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(texLeft, ly + 5, texW, 1);
        // Notched log-cabin corner joints on exposed or connected ends
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(texLeft, ly + 1, 3, 4);
        if (texW > 7) {
          ctx.fillRect(texRight - 3, ly + 1, 3, 4);
        }
      }
    } else {
      // Parede de Carvalho: Tábuas horizontais douradas com cintas de ferro forjado
      ctx.fillStyle = '#7c471e';
      ctx.fillRect(texLeft, wy - 2, texW, 6);
      ctx.fillRect(texLeft, wy + 7, texW, 6);
      ctx.fillRect(texLeft, wy + 16, texW, 6);
      // Warm timber highlights
      ctx.fillStyle = '#9a602d';
      ctx.fillRect(texLeft + 1, wy - 2, Math.max(2, texW - 2), 2);
      ctx.fillRect(texLeft + 1, wy + 7, Math.max(2, texW - 2), 2);
      ctx.fillRect(texLeft + 1, wy + 16, Math.max(2, texW - 2), 2);
      // Horizontal iron binding straps matched to adaptive span
      ctx.fillStyle = '#334155';
      ctx.fillRect(spanX, wy + 4, spanW, 2);
      ctx.fillRect(spanX, wy + 21, spanW, 2);
    }

    // Window Glass (33% transparency) & Solid Mullion Frame if Window Wall
    if (isWindow) {
      ctx.restore();
      const frameColor = isDarkOak
        ? '#b45309'
        : isPine
        ? '#5c3a21'
        : '#1e293b';
      // Solid outer frame border around glass opening
      ctx.fillStyle = frameColor;
      ctx.fillRect(winLeft, wy - 1, winW, 2);
      ctx.fillRect(winLeft, wy + 16, winW, 2);
      ctx.fillRect(winLeft, wy + 1, 2, 15);
      ctx.fillRect(winLeft + winW - 2, wy + 1, 2, 15);
      // Pine Alpine side shutters
      if (isPine && winLeft >= spanX + 3 && winRight <= spanRight - 3) {
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(winLeft - 3, wy, 3, 16);
        ctx.fillRect(winRight, wy, 3, 16);
        ctx.fillStyle = '#8c6239';
        ctx.fillRect(winLeft - 2, wy + 2, 1, 12);
        ctx.fillRect(winRight + 1, wy + 2, 1, 12);
      }
      // Window glass pane with 33% transparency (alpha = 0.67)
      ctx.save();
      ctx.globalAlpha = 0.67;
      ctx.fillStyle = isDarkOak ? '#0284c7' : '#38bdf8';
      ctx.fillRect(glassX, glassY, glassW, glassH);
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(winLeft + 3, wy + 2, 2, 7);
      ctx.restore();
      // Solid mullion cross-bar & sill
      ctx.fillStyle = frameColor;
      ctx.fillRect(winLeft + 1, wy + 8, Math.max(2, winW - 2), 2);
      if (isDarkOak || isPine) {
        // Vertical center mullion for 4-pane manor/cabin window
        ctx.fillRect(
          winLeft + Math.floor(winW / 2) - 1,
          wy + 1,
          2,
          15
        );
      }
      ctx.fillStyle = isDarkOak ? '#f59e0b' : topCap;
      ctx.fillRect(winLeft - 1, wy + 17, winW + 2, 3);
    }

    // Roof Coping / Top Cap matched to adaptive span
    const capInnerLeft = hasW ? spanX : spanX + 1;
    const capInnerRight = hasE ? spanRight : spanRight - 1;
    ctx.fillStyle = topCap;
    ctx.fillRect(capInnerLeft, wy - 14, Math.max(2, capInnerRight - capInnerLeft), 9);
    ctx.fillStyle = topInner;
    ctx.fillRect(
      hasW ? spanX : spanX + 2,
      wy - 12,
      Math.max(2, (hasE ? spanRight : spanRight - 2) - (hasW ? spanX : spanX + 2)),
      6
    );

    // Seamless North Miter into the horizontal Top Cap
    if (hasN) {
      const nvx = wx + 12;
      const nvw = 8;
      ctx.fillStyle = topInner;
      ctx.fillRect(nvx + 1, wy - 16, nvw - 2, 10);
      ctx.fillStyle = topCap;
      ctx.fillRect(nvx + 2, wy - 16, 2, 9);
    }

    // South Arm (slender 8px side profile seamlessly mitering from the top cap down to southern tile)
    if (hasS) {
      const svx = wx + 12;
      const svw = 8;
      ctx.fillStyle = faceDark;
      ctx.fillRect(svx, wy - 6, svw, 38);
      ctx.fillStyle = topInner;
      ctx.fillRect(svx + 1, wy - 12, svw - 2, 44);
      ctx.fillStyle = topCap;
      ctx.fillRect(svx + 2, wy - 12, 2, 43);
      ctx.fillStyle = faceDark;
      ctx.fillRect(svx + 1, wy + 6, svw - 2, 1);
      ctx.fillRect(svx + 1, wy + 16, svw - 2, 1);
    }
  }

  /**
   * Renders the live connected ghost preview, neighbor link dots, and hitbox badge for the targeted tile.
   */
  private drawBuildPlacementPreview(
    ctx: CanvasRenderingContext2D,
    world: WorldManager,
    player: PlayerState,
    placeableType: PlaceableType,
    targetBuildTile: { tx: number; ty: number },
    tileAnimFrame: number,
    globalTime: number,
    buildOptions?: BuildRenderOptions
  ): void {
    const px = targetBuildTile.tx * TILE_SIZE;
    const py = targetBuildTile.ty * TILE_SIZE;
    const bp = CONSTRUCTION_BLUEPRINTS[placeableType];
    const isDemolish = Boolean(buildOptions?.demolishMode);

    ctx.save();

    if (isDemolish) {
      const existing =
        world.getStructureAtTile(targetBuildTile.tx, targetBuildTile.ty) ||
        world.getGroundStructureAtTile(targetBuildTile.tx, targetBuildTile.ty);
      ctx.fillStyle = existing
        ? 'rgba(244, 63, 94, 0.28)'
        : 'rgba(148, 163, 184, 0.16)';
      ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.strokeStyle = existing ? '#f43f5e' : '#94a3b8';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);

      // Badge above tile
      ctx.font = 'bold 6.5px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(px - 18, py - 18, TILE_SIZE + 36, 12);
      ctx.fillStyle = existing ? '#fda4af' : '#cbd5e1';
      ctx.fillText(
        existing ? '🔨 RECOLHER PEÇA' : 'Vazio',
        px + TILE_SIZE / 2,
        py - 9
      );
      ctx.restore();
      return;
    }

    const pTile = world.worldToTile(player.x, player.y);
    const blockedBySelf =
      Boolean(bp?.hasHitbox) &&
      pTile.tx === targetBuildTile.tx &&
      pTile.ty === targetBuildTile.ty;
    const canPlace =
      !blockedBySelf &&
      world.canPlaceStructureAt(
        targetBuildTile.tx,
        targetBuildTile.ty,
        placeableType
      );
    const hasWallAtTarget = world.hasWallStructureAtTile(
      targetBuildTile.tx,
      targetBuildTile.ty
    );
    const isWallMountTorch =
      placeableType === PlaceableType.TORCH && hasWallAtTarget && canPlace;
    const isBlockedByWallForNonTorch =
      hasWallAtTarget &&
      placeableType !== PlaceableType.TORCH &&
      !WorldManager.isWallMountableStructure(placeableType) &&
      !canPlace;

    // Draw ghost of the structure with live continuity connections!
    ctx.globalAlpha = 0.68;
    const heldSlot = player.inventory[player.selectedHotbarIndex];
    const ghostItemId =
      heldSlot?.itemId ||
      (placeableType === PlaceableType.FLOWER_TULIP
        ? 'flower_tulip'
        : placeableType === PlaceableType.FLOWER_LILY
        ? 'flower_lily'
        : placeableType === PlaceableType.FLOWER_SUNFLOWER
        ? 'flower_sunflower'
        : placeableType === PlaceableType.FLOWER_SOLAR_DROP
        ? 'flower_solar_drop'
        : '');
    const ghostSt: PlacedStructure = {
      id: 'ghost_preview',
      type: placeableType,
      itemId: ghostItemId,
      tileX: targetBuildTile.tx,
      tileY: targetBuildTile.ty,
      hp: bp?.maxHp || 100,
      maxHp: bp?.maxHp || 100,
      solid: Boolean(bp?.hasHitbox),
      hitFlashTimer: 0,
      orientation: buildOptions?.orientation || 'auto',
      rotation: buildOptions?.rotation ?? 0,
      isOpen: false,
      attachedToWall: isWallMountTorch,
      flowerColor: heldSlot?.selectedColor || 'amarelo',
    };

    if (bp?.layer === 'GROUND' || placeableType === PlaceableType.SPIKE_TRAP) {
      this.drawGroundStructure(ctx, world, ghostSt, tileAnimFrame);
    } else {
      this.drawStructure(ctx, world, ghostSt, globalTime, 0);
    }

    // Tile border frame
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = isWallMountTorch
      ? '#fbbf24'
      : canPlace
        ? '#4ade80'
        : '#f43f5e';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    // Neighbor Continuity Link Indicators (N, E, S, W glowing cyan/gold nodes)
    const mask = world.getStructureConnectionMask(
      targetBuildTile.tx,
      targetBuildTile.ty,
      placeableType
    );
    if (mask > 0) {
      const pulse = 2.5 + Math.sin(globalTime * 8) * 0.6;
      ctx.fillStyle = '#38bdf8';
      if (mask & 1) {
        ctx.beginPath();
        ctx.arc(px + TILE_SIZE / 2, py + 2, pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      if (mask & 2) {
        ctx.beginPath();
        ctx.arc(px + TILE_SIZE - 2, py + TILE_SIZE / 2, pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      if (mask & 4) {
        ctx.beginPath();
        ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE - 2, pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      if (mask & 8) {
        ctx.beginPath();
        ctx.arc(px + 2, py + TILE_SIZE / 2, pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Floating Hitbox & Layer Tag above preview tile
    if (bp) {
      const tagText = isWallMountTorch
        ? 'FIXAR TOCHA NA PAREDE 🔥'
        : isBlockedByWallForNonTorch
          ? 'APENAS TOCHA NA PAREDE!'
          : !canPlace
            ? 'OBSTRUÍDO'
            : bp.hitboxBehavior === 'DYNAMIC_DOOR'
              ? 'PORTA · ABRE/FECHA'
              : bp.hasHitbox
                ? `${bp.layer === 'WALL' ? 'PAREDE' : 'ESTAÇÃO'} · HITBOX SÓLIDA`
                : `${bp.layer === 'GROUND' ? 'CHÃO' : 'DECOR'} · SEM HITBOX`;

      ctx.font = 'bold 6px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10, 14, 23, 0.88)';
      ctx.fillRect(px - 22, py - 17, TILE_SIZE + 44, 11);
      ctx.fillStyle = isWallMountTorch
        ? '#fde047'
        : !canPlace
          ? '#f87171'
          : bp.hasHitbox
            ? '#fde047'
            : '#4ade80';
      ctx.fillText(tagText, px + TILE_SIZE / 2, py - 9);
    }

    ctx.restore();
  }

  /**
   * Renders a visual Hitbox Inspector around the player showing which structures/nodes have solid hitboxes vs free passage.
   */
  private drawHitboxOverlayAroundPlayer(
    ctx: CanvasRenderingContext2D,
    world: WorldManager,
    player: PlayerState
  ): void {
    const pTile = world.worldToTile(player.x, player.y);
    ctx.save();
    ctx.lineWidth = 1.5;

    for (let ty = pTile.ty - 5; ty <= pTile.ty + 5; ty++) {
      for (let tx = pTile.tx - 5; tx <= pTile.tx + 5; tx++) {
        const { cx, cy } = world.tileToChunk(tx, ty);
        const chunk = world.chunks[WorldManager.chunkKey(cx, cy)];
        if (!chunk) continue;

        const cxWorld = tx * TILE_SIZE + TILE_SIZE / 2;
        const cyWorld = ty * TILE_SIZE + TILE_SIZE / 2;

        // Nature Nodes
        const node = chunk.nodes.find((n) => n.tileX === tx && n.tileY === ty);
        if (node) {
          const nbp = NATURE_BLUEPRINTS[node.type];
          if (nbp.hasHitbox && nbp.hitboxRadius > 0) {
            ctx.strokeStyle = 'rgba(248, 113, 113, 0.85)';
            ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
            ctx.beginPath();
            ctx.arc(cxWorld, cyWorld + 3, nbp.hitboxRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.strokeStyle = 'rgba(74, 222, 128, 0.75)';
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.arc(cxWorld, cyWorld + 2, 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        // Placed Structures
        for (const st of chunk.structures) {
          if (st.tileX !== tx || st.tileY !== ty) continue;
          const bp = CONSTRUCTION_BLUEPRINTS[st.type];
          const isSolid = WorldManager.isStructureCurrentlySolid(st);
          if (isSolid) {
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
            ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
            if (bp?.hitboxBehavior === 'SOLID_COMPACT') {
              ctx.beginPath();
              ctx.arc(cxWorld, cyWorld + 2, bp.hitboxRadius || 9, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            } else {
              const pad = st.type === PlaceableType.WOOD_FENCE ? 6 : 2;
              ctx.fillRect(
                tx * TILE_SIZE + pad,
                ty * TILE_SIZE + pad,
                TILE_SIZE - pad * 2,
                TILE_SIZE - pad * 2
              );
              ctx.strokeRect(
                tx * TILE_SIZE + pad,
                ty * TILE_SIZE + pad,
                TILE_SIZE - pad * 2,
                TILE_SIZE - pad * 2
              );
            }
          } else {
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.65)';
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(
              tx * TILE_SIZE + 4,
              ty * TILE_SIZE + 4,
              TILE_SIZE - 8,
              TILE_SIZE - 8
            );
            ctx.setLineDash([]);
          }
        }
      }
    }

    // Player's own compact circular hitbox
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(player.x, player.y, 6.2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private drawCreature(
    ctx: CanvasRenderingContext2D,
    cr: CreatureEntity,
    globalTime: number,
    shadowDx: number,
    timeOfDay = 12,
    isSwimming = false,
    allCreatures?: CreatureEntity[]
  ): void {
    const isHumanNpc = cr.kind === 'VILLAGER' || cr.kind === 'WANDERER';
    if (isHumanNpc) {
      EntityManager.ensureNpcHumanAppearance(cr);
    }
    const isCrMoving = Math.hypot(cr.vx, cr.vy) > 4;
    const sprite = isHumanNpc
      ? spriteAtlas.getPlayerSprite(
          cr.direction,
          isCrMoving ? cr.animFrame : 0,
          {
            appearance: cr.appearance!,
            equippedBySlot: cr.equippedBySlot!,
          } as PlayerState,
          'none'
        )
      : spriteAtlas.getCreatureSprite(
          cr.kind,
          cr.animFrame,
          cr.attackTimer > 0,
          cr.direction
        );

    // Deterministic individual width & height variation from creature ID
    let idHash = 2166136261;
    for (let i = 0; i < cr.id.length; i++) {
      idHash = Math.imul(idHash ^ cr.id.charCodeAt(i), 16777619);
    }
    const uHash = idHash >>> 0;
    const isHumanoid =
      cr.kind === 'VILLAGER' ||
      cr.kind === 'WANDERER' ||
      cr.kind === 'BANDIT' ||
      cr.kind === 'ZOMBIE';
    const isBoat = cr.kind === 'BOAT';

    // Independent individual build (width) and stature (height) variation
    const wVar = isBoat
      ? 1.0
      : isHumanNpc
      ? 0.97 + ((uHash % 9) / 8) * 0.06 // 0.97x .. 1.03x for human NPCs
      : isHumanoid
      ? 0.94 + ((uHash % 13) / 12) * 0.12 // 0.94x .. 1.06x for humanoids
      : 0.88 + ((uHash % 19) / 18) * 0.24; // 0.88x .. 1.12x for fauna/monsters
    const hVar = isBoat
      ? 1.0
      : isHumanNpc
      ? 0.97 + (((uHash >> 5) % 9) / 8) * 0.06
      : isHumanoid
      ? 0.94 + (((uHash >> 5) % 13) / 12) * 0.12
      : 0.88 + (((uHash >> 5) % 19) / 18) * 0.24;

    // Anatomically proportional base width & height relative to the player
    let baseW = 26;
    let baseH = 30;
    switch (cr.kind) {
      case 'SHEEP':
        // Quadruped: longer horizontally than tall, waist-high to player
        baseW = 31;
        baseH = 24;
        break;
      case 'BOAR':
        // Stocky, low-slung muscular forest boar
        baseW = 33;
        baseH = 23;
        break;
      case 'COW':
        // Pasture dairy cow
        baseW = 36;
        baseH = 26;
        break;
      case 'HORSE':
        // Sleek plains mount
        baseW = 40;
        baseH = 35;
        break;
      case 'CAMEL':
        // Tall, long-legged desert dromedary towering above player
        baseW = 44;
        baseH = 44;
        break;
      case 'BOAT':
        // Twin-seat wooden rowboat floating on water
        baseW = 44;
        baseH = 26;
        break;
      case 'FOREST_STALKER':
        // Wide, low-slung giant woodland spider
        baseW = 38;
        baseH = 25;
        break;
      case 'DESERT_SCORPION':
        // Wide armored emperor scorpion with arched stinger tail
        baseW = 38;
        baseH = 31;
        break;
      case 'OGRE':
        // Towering colossal brute (~2x player bulk & height)
        baseW = 52;
        baseH = 56;
        break;
      case 'STONE_GOLEM':
        // Colossal ancient runic monolith guardian
        baseW = 54;
        baseH = 58;
        break;
      case 'VILLAGER':
      case 'WANDERER':
        // Composite 48x42 human body structure matching the player character (45 x 39.375)
        baseW = 45;
        baseH = 39.375;
        break;
      case 'ZOMBIE':
      case 'BANDIT':
      default:
        // Humanoid stature
        baseW = 26;
        baseH = 30;
        break;
    }

    const eliteScale = cr.isElite ? 1.18 : 1.0;
    const drawW = Math.round(baseW * wVar * eliteScale);
    const drawH = Math.round(baseH * hVar * eliteScale);
    const bodyRefW = isHumanNpc ? Math.round(25 * wVar * eliteScale) : drawW;
    const footY = cr.y + 10; // Ground contact anchor matching renderQueue ySort

    if (isBoat) {
      // Water wake & ripple ring under the floating boat
      const wakePulse = Math.sin(globalTime * (isCrMoving ? 8.5 : 3.5) + cr.x * 0.08) * 1.6;
      ctx.save();
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.72)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(
        cr.x,
        footY - 3,
        drawW * 0.46 + wakePulse,
        5.5 + wakePulse * 0.25,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    } else if (isSwimming) {
      // Submerged dark water silhouette & concentric ripple ring at waterline
      const ripplePulse = Math.sin(globalTime * (isCrMoving ? 7.5 : 3.5) + cr.x * 0.1) * 1.4;
      const waterLineY = footY - 2;
      ctx.save();
      ctx.fillStyle = 'rgba(8, 47, 73, 0.36)';
      ctx.beginPath();
      ctx.ellipse(cr.x, waterLineY + 1, bodyRefW * 0.34, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(186, 230, 253, 0.62)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.ellipse(
        cr.x,
        waterLineY,
        Math.max(6, bodyRefW * 0.38 + ripplePulse),
        Math.max(2.5, 4.2 + ripplePulse * 0.35),
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    } else {
      // Directional Ground Shadow scaled to actual creature width
      const shadowW = Math.round(bodyRefW * 0.68);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
      ctx.fillRect(
        Math.round(cr.x - shadowW / 2 + shadowDx * 0.4),
        footY - 3,
        shadowW,
        4
      );
    }

    if (
      (cr.isElite && cr.isHostile) ||
      ((cr.kind === 'VILLAGER' || cr.kind === 'WANDERER') && !cr.isHostile)
    ) {
      ctx.save();
      ctx.strokeStyle =
        cr.kind === 'WANDERER'
          ? 'rgba(56, 189, 248, 0.52)'
          : cr.kind === 'VILLAGER'
          ? (cr.affinity ?? 55) >= 75
            ? 'rgba(250, 204, 21, 0.55)'
            : 'rgba(16, 185, 129, 0.45)'
          : 'rgba(245, 158, 11, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cr.x, footY - 2, bodyRefW * 0.4, 4.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const walkBounce = isBoat
      ? Math.sin(globalTime * (isCrMoving ? 6.5 : 2.8) + cr.x * 0.08) * 1.2
      : isSwimming
      ? Math.sin(globalTime * (isCrMoving ? 7 : 3.2) + cr.x * 0.1) * 1.1
      : isCrMoving
      ? Math.abs(Math.sin(globalTime * 10 + cr.x * 0.1)) * 2.0
      : 0;
    const breathScaleY = isBoat
      ? 1.0
      : isCrMoving
      ? 1 + Math.sin(globalTime * 10 + cr.x * 0.1) * 0.035
      : 1 + Math.sin(globalTime * 3.2 + cr.x) * 0.022;
    const breathScaleX = isBoat ? 1.0 : 2 - breathScaleY;

    const visibleRatio = isSwimming ? 0.5 : 1.0;
    const srcH = Math.max(1, Math.round(sprite.height * visibleRatio));
    const visibleDrawH = Math.max(1, Math.round(drawH * visibleRatio));

    // Directional body lunge & windup during creature attack
    let atkLungeX = 0;
    let atkLungeY = 0;
    let atkTiltRad = 0;
    if (cr.attackTimer > 0) {
      const maxAtkDur =
        cr.kind === 'OGRE' || cr.kind === 'STONE_GOLEM' ? 0.38 : 0.34;
      const atkProgress = Math.max(
        0,
        Math.min(1, 1 - cr.attackTimer / maxAtkDur)
      );
      const thrustCurve = Math.sin(atkProgress * Math.PI);
      const lungeDist =
        cr.kind === 'BOAR' || cr.kind === 'FOREST_STALKER'
          ? 6.5
          : cr.kind === 'OGRE' || cr.kind === 'STONE_GOLEM'
          ? 5.5
          : 4.5;
      const dirX =
        cr.direction === 'left' ? -1 : cr.direction === 'right' ? 1 : 0;
      const dirY = cr.direction === 'up' ? -1 : cr.direction === 'down' ? 1 : 0;
      atkLungeX = dirX * thrustCurve * lungeDist;
      atkLungeY =
        dirY * thrustCurve * lungeDist -
        (cr.kind === 'OGRE' || cr.kind === 'STONE_GOLEM'
          ? Math.sin(atkProgress * Math.PI) * 3.2
          : 0);
      if (dirX !== 0) {
        atkTiltRad = dirX * thrustCurve * 0.14;
      }
    }

    ctx.save();
    ctx.translate(cr.x + atkLungeX, footY - walkBounce + atkLungeY);
    if (atkTiltRad !== 0) {
      ctx.rotate(atkTiltRad);
    }
    if (cr.hitFlashTimer > 0) {
      ctx.filter = 'brightness(2.0) contrast(1.2)';
    }
    if (!isHumanNpc && cr.direction === 'left') {
      ctx.scale(-breathScaleX, breathScaleY);
    } else {
      ctx.scale(breathScaleX, breathScaleY);
    }
    if (isSwimming) {
      ctx.drawImage(
        sprite,
        0,
        0,
        sprite.width,
        srcH,
        -drawW / 2,
        -visibleDrawH,
        drawW,
        visibleDrawH
      );
    } else {
      ctx.drawImage(sprite, -drawW / 2, -drawH + 2, drawW, drawH);
    }

    // Draw Saddle & 8-Slot Saddlebags on Horse or Camel when cr.hasSaddle is true
    if ((cr.kind === 'HORSE' || cr.kind === 'CAMEL') && cr.hasSaddle) {
      const saddleY = cr.kind === 'CAMEL' ? -drawH * 0.64 : -drawH * 0.61;
      // Crimson saddle blanket
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(-7, saddleY, 13, 7);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-7, saddleY + 6, 13, 1.2);
      //Tooled leather saddle seat & side saddlebag pouch
      ctx.fillStyle = '#451a03';
      ctx.fillRect(-6, saddleY - 1.5, 11, 5);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(-5, saddleY - 1, 9, 4);
      // Saddlebag buckle & golden stirrup
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-1, saddleY + 1, 2, 2);
      ctx.fillRect(0, saddleY + 7, 2, 2);
    }

    // Draw Passenger Pet seated in the 2nd seat of a Boat
    if (isBoat && cr.passengerPetId && allCreatures) {
      const pet = allCreatures.find((p) => p.id === cr.passengerPetId);
      if (pet) {
        const petSprite = spriteAtlas.getCreatureSprite(
          pet.kind,
          pet.animFrame,
          false,
          pet.direction
        );
        ctx.drawImage(petSprite, -16, -24, 22, 18);
      }
    }
    ctx.restore();

    // Render held weapon/tool on Human NPCs (e.g. Iron Sword on Village Guardian, Iron Pickaxe on Blacksmith, Spear/Sword on Wanderer)
    if (isHumanNpc && cr.heldItemId && ITEMS[cr.heldItemId]) {
      const itemCanvas = spriteAtlas.getItemCanvas(cr.heldItemId);
      const isSwinging = cr.attackTimer > 0;
      const swingProgress = isSwinging ? Math.max(0, Math.min(1, 1 - cr.attackTimer / 0.34)) : 0;
      const humanFrame = isCrMoving ? cr.animFrame : 0;
      const stepL = humanFrame === 1 ? -2 : humanFrame === 3 ? 2 : 0;
      const stepR = -stepL;
      const npcTorsoY = footY - 10 - walkBounce + atkLungeY + (isSwimming ? 5 : 0);

      let baseAngle = 0;
      let handOffsetX = 0;
      let handOffsetY = 0;
      if (cr.direction === 'up') {
        baseAngle = -Math.PI / 2;
        handOffsetX = 6.5;
        handOffsetY = -1.5 + stepR * 1.1;
      } else if (cr.direction === 'down') {
        baseAngle = Math.PI / 2;
        handOffsetX = -6.5;
        handOffsetY = -1.0 + stepL * 1.1;
      } else if (cr.direction === 'left') {
        baseAngle = Math.PI;
        handOffsetX = -2.2 - stepL * 0.6;
        handOffsetY = -1.0 + stepL * 1.1;
      } else {
        baseAngle = 0;
        handOffsetX = 2.2 + stepR * 0.6;
        handOffsetY = -1.0 + stepR * 1.1;
      }

      ctx.save();
      ctx.translate(cr.x + atkLungeX + handOffsetX, npcTorsoY + handOffsetY);
      if (isSwinging) {
        const swingArc = (swingProgress - 0.5) * 2.2;
        ctx.rotate(baseAngle + swingArc);
        ctx.strokeStyle =
          cr.heldItemId === 'iron_sword'
            ? 'rgba(250, 204, 21, 0.55)'
            : 'rgba(226, 232, 240, 0.45)';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(0, 0, 21, -0.75, 0.65);
        ctx.stroke();
        ctx.drawImage(itemCanvas, -3, -17, 20, 20);
      } else {
        if (cr.direction === 'left') {
          ctx.scale(-1, 1);
          ctx.rotate(-0.12);
          ctx.drawImage(itemCanvas, -3, -11, 14, 14);
        } else if (cr.direction === 'right') {
          ctx.rotate(-0.12);
          ctx.drawImage(itemCanvas, -3, -11, 14, 14);
        } else if (cr.direction === 'down') {
          ctx.scale(-1, 1);
          ctx.rotate(0.35);
          ctx.drawImage(itemCanvas, -3, -11, 14, 14);
        } else {
          ctx.rotate(-0.25);
          ctx.drawImage(itemCanvas, -3, -11, 14, 14);
        }
        ctx.fillStyle = cr.appearance?.skinColor || '#f1c27d';
        ctx.fillRect(-1.5, -1.5, 3, 3);
      }
      ctx.restore();
    }

    // Stone Golem 3-second Seismic Charge visual aura
    if (
      cr.kind === 'STONE_GOLEM' &&
      cr.seismicChargeTimer !== undefined &&
      cr.seismicChargeTimer > 0
    ) {
      const chargeProg = 1 - Math.min(1, cr.seismicChargeTimer / 3.0);
      ctx.save();
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.45 + chargeProg * 0.45})`;
      ctx.lineWidth = 2 + chargeProg * 2;
      ctx.beginPath();
      ctx.arc(
        cr.x,
        footY - 6,
        18 + Math.sin(globalTime * 14) * 4 + chargeProg * 24,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }

    // Render specific attack animation for every attacking mob, NPC, and animal
    if (cr.attackTimer > 0) {
      this.drawCreatureAttackAnimation(
        ctx,
        cr,
        footY - walkBounce,
        bodyRefW,
        isHumanNpc ? Math.round(30 * hVar * eliteScale) : drawH
      );
    }

    if (isSwimming) {
      // Front waterline foam highlight across submerged waist
      ctx.save();
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cr.x - bodyRefW * 0.28, footY - 1);
      ctx.lineTo(cr.x + bodyRefW * 0.28, footY - 1);
      ctx.stroke();
      ctx.restore();
    }

    const headTopY = isSwimming
      ? footY - visibleDrawH - 2
      : isHumanNpc
      ? footY - Math.round(31 * hVar * eliteScale)
      : footY - drawH;

    // VILLAGE NPC & WANDERER Nameplate, Profession, Housing & Affinity / Hostility Status
    if (cr.kind === 'VILLAGER' || cr.kind === 'WANDERER') {
      const aff = cr.affinity ?? 55;
      const isWanderer = cr.kind === 'WANDERER';
      const isFightingMonster = cr.aiState === 'chase' && !cr.isHostile;
      const isSunsetOrNight = timeOfDay >= 17.5 || timeOfDay < 5.5;
      const isAnsweringDoor =
        !isWanderer &&
        !cr.isHostile &&
        !isFightingMonster &&
        Boolean(cr.outsideNightTimer && cr.outsideNightTimer > 0);
      const isHeadingHome =
        !isWanderer &&
        !cr.isHostile &&
        !isFightingMonster &&
        isSunsetOrNight &&
        cr.homeX !== undefined &&
        cr.homeY !== undefined &&
        !isAnsweringDoor;

      ctx.save();
      ctx.textAlign = 'center';

      // Profession & Name Tag
      ctx.font = 'bold 7px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = 'rgba(10, 14, 23, 0.85)';
      ctx.fillRect(cr.x - 46, headTopY - 16, 92, 13);

      ctx.fillStyle = cr.isHostile
        ? '#f87171'
        : isFightingMonster
        ? '#fbbf24'
        : isAnsweringDoor
        ? '#fde047'
        : isHeadingHome
        ? '#fdba74'
        : isWanderer
        ? '#38bdf8'
        : aff >= 75
        ? '#fde047'
        : aff >= 40
        ? '#4ade80'
        : '#fb923c';
      const statusBadge = cr.isHostile
        ? `⚔ ${cr.name} [HOSTIL]`
        : isFightingMonster
        ? `⚔ ${cr.name} [Vs Monstro]`
        : isAnsweringDoor
        ? `🚪 ${cr.name} [${Math.ceil(cr.outsideNightTimer || 0)}s]`
        : isHeadingHome
        ? `🌅 ${cr.name} [Indo p/ Casa]`
        : isWanderer
        ? `🧭 ${cr.name} ♥${Math.round(aff)}`
        : `${cr.homeHouseId ? '🏠 ' : ''}${cr.name} ♥${Math.round(aff)}`;
      ctx.fillText(statusBadge, cr.x, headTopY - 7);

      if (cr.npcProfessionLabel && !cr.isHostile) {
        ctx.font = '6px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = isWanderer ? '#7dd3fc' : '#cbd5e1';
        ctx.fillText(cr.npcProfessionLabel, cr.x, headTopY - 19);
      }
      ctx.restore();

      if (cr.hp < cr.maxHp || cr.isHostile || isFightingMonster) {
        this.drawMiniBar(
          ctx,
          cr.x,
          headTopY - 2,
          cr.hp / cr.maxHp,
          cr.isHostile ? '#ef4444' : isWanderer ? '#38bdf8' : '#10b981'
        );
      }
      return;
    }

    if (isBoat) {
      const hasHelm = Boolean(cr.riderPlayerId);
      const hasPassenger = Boolean(cr.passengerPlayerId || cr.passengerPetId);
      const seatsOccupied = (hasHelm ? 1 : 0) + (hasPassenger ? 1 : 0);
      ctx.save();
      ctx.font = 'bold 7px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#38bdf8';
      const seatLabel =
        seatsOccupied === 0
          ? '⛵ Bote [0/2 · Livre]'
          : seatsOccupied === 1
          ? '⛵ Bote [1/2 · 1 Assento Livre]'
          : '⛵ Bote [2/2 · Lotado]';
      ctx.fillText(seatLabel, cr.x, headTopY - 2);
      ctx.restore();
    } else if (cr.tamed) {
      const heartPulse = Math.sin(globalTime * 5) * 1;
      ctx.save();
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.42)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(cr.x, footY - 2, drawW * 0.36, 4.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = 'bold 8px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f43f5e';
      ctx.fillText('♥', cr.x - 14, headTopY - 3 + heartPulse);
      ctx.fillStyle = '#fde047';
      const saddleBadge = cr.hasSaddle ? ' 鞍' : '';
      const ownerTag = cr.ownerName ? ` · ${cr.ownerName}` : '';
      ctx.fillText(
        `${cr.aiState === 'stay' ? '[Base]' : '[Aliado]'}${saddleBadge}${ownerTag}`,
        cr.x + 4,
        headTopY - 3
      );
      ctx.restore();
    } else if (cr.tameProgress > 0 && !cr.isHostile) {
      this.drawMiniBar(
        ctx,
        cr.x,
        headTopY - 8,
        cr.tameProgress / 100,
        '#f43f5e'
      );
    }

    if (cr.hp < cr.maxHp || cr.isHostile) {
      if (cr.isElite && cr.isHostile) {
        ctx.save();
        ctx.font = 'bold 7px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fde047';
        ctx.fillText(`★ ${cr.name}`, cr.x, headTopY - 6);
        ctx.restore();
      }
      this.drawMiniBar(
        ctx,
        cr.x,
        headTopY - 2,
        cr.hp / cr.maxHp,
        cr.isElite ? '#f59e0b' : cr.isHostile ? '#ef4444' : '#22c55e'
      );
    }
  }

  /**
   * Renders a distinct, signature attack animation for each attacking mob, NPC, and animal
   * oriented along `cr.direction` ('up', 'down', 'left', 'right').
   */
  private drawCreatureAttackAnimation(
    ctx: CanvasRenderingContext2D,
    cr: CreatureEntity,
    anchorFootY: number,
    drawW: number,
    drawH: number
  ): void {
    const maxDur =
      cr.kind === 'OGRE' || cr.kind === 'STONE_GOLEM' ? 0.38 : 0.34;
    const p = Math.max(0, Math.min(1, 1 - cr.attackTimer / maxDur));
    const alpha = Math.max(0.15, Math.sin(p * Math.PI));

    const baseAngle =
      cr.direction === 'right'
        ? 0
        : cr.direction === 'down'
        ? Math.PI / 2
        : cr.direction === 'left'
        ? Math.PI
        : -Math.PI / 2;

    const centerY = anchorFootY - drawH * 0.45;
    const reach = Math.max(14, drawW * 0.48);

    ctx.save();
    ctx.translate(cr.x, centerY);
    ctx.rotate(baseAngle);
    ctx.globalAlpha = alpha;

    switch (cr.kind) {
      case 'ZOMBIE': {
        // Double necrotic green/violet claw & bite tear arcs
        const clawX = 8 + p * 12;
        ctx.strokeStyle = '#84cc16';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(clawX - 4, 0, 11, -0.75 + p * 0.3, 0.75 + p * 0.3);
        ctx.stroke();

        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(clawX - 1, -2, 9, -0.65, 0.65);
        ctx.stroke();

        // Necrotic claw tips
        ctx.fillStyle = '#bef264';
        ctx.fillRect(clawX + 4, -6, 3, 2);
        ctx.fillRect(clawX + 5, -1, 3, 2);
        ctx.fillRect(clawX + 4, 4, 3, 2);
        break;
      }

      case 'OGRE': {
        // Colossal overhead spiked war-club smash & crimson/amber ground shockwave
        const swingAng = -1.15 + p * 2.1;
        ctx.save();
        ctx.rotate(swingAng);
        // Heavy wooden club shaft & iron studs
        ctx.fillStyle = '#451a03';
        ctx.fillRect(8, -4, 24, 8);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(9, -3, 22, 6);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(22, -6, 3, 3);
        ctx.fillRect(27, -6, 3, 3);
        ctx.fillRect(25, 3, 3, 3);
        ctx.restore();

        // Heavy smash arc & ground impact ring
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(4, 0, reach + 8, -1.0, -1.0 + p * 2.0);
        ctx.stroke();

        if (p > 0.45) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.arc(reach + 6, 0, (p - 0.4) * 18, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }

      case 'FOREST_STALKER': {
        // Venomous spider chelicerae pincer snap + neon green venom & web strands
        const snapClose = (1 - p) * 0.55 + 0.12;
        const fangReach = reach + p * 8;
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2.5;
        // Upper fang arc snapping inward
        ctx.beginPath();
        ctx.moveTo(6, -8);
        ctx.quadraticCurveTo(fangReach * 0.7, -11, fangReach, -snapClose * 8);
        ctx.stroke();
        // Lower fang arc snapping inward
        ctx.beginPath();
        ctx.moveTo(6, 8);
        ctx.quadraticCurveTo(fangReach * 0.7, 11, fangReach, snapClose * 8);
        ctx.stroke();

        // Violet venom spark & web cross-threads at bite point
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(4, -4);
        ctx.lineTo(fangReach - 2, 4);
        ctx.moveTo(4, 4);
        ctx.lineTo(fangReach - 2, -4);
        ctx.stroke();

        ctx.fillStyle = '#a855f7';
        ctx.beginPath();
        ctx.arc(fangReach, 0, 3.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'DESERT_SCORPION': {
        // Overhead whipped tail stinger strike + snapping golden pincers
        const stingDist = 6 + Math.sin(p * Math.PI) * (reach + 7);
        // Golden pincer snap arcs
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(6, -6, 10, -0.7, 0.35);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(6, 6, 10, -0.35, 0.7);
        ctx.stroke();

        // Whipped overhead segmented stinger line & glowing purple/gold venom barb
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 3.0;
        ctx.beginPath();
        ctx.moveTo(-4, -8);
        ctx.quadraticCurveTo(stingDist * 0.5, -14, stingDist, 0);
        ctx.stroke();

        ctx.fillStyle = '#a855f7';
        ctx.beginPath();
        ctx.arc(stingDist, 0, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(stingDist + 1, 0, 2.0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'STONE_GOLEM': {
        // Dual-fist tectonic monolith slam with cyan/gold runic shockwave
        const slamDist = 8 + p * (reach + 6);
        // Stone boulder fist impact blocks
        ctx.fillStyle = '#64748b';
        ctx.fillRect(slamDist - 6, -9, 9, 7);
        ctx.fillRect(slamDist - 6, 2, 9, 7);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(slamDist - 3, -7, 4, 3);
        ctx.fillRect(slamDist - 3, 4, 4, 3);

        // Expanding runic shockwave ring
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3.0;
        ctx.beginPath();
        ctx.arc(slamDist - 2, 0, 6 + p * 16, -1.2, 1.2);
        ctx.stroke();

        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(slamDist - 2, 0, 3 + p * 11, -0.9, 0.9);
        ctx.stroke();
        break;
      }

      case 'BANDIT': {
        // Swift curved steel cutlass & crimson cross-slash
        const slashAng = -1.2 + p * 2.4;
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(4, 0, reach + 3, slashAng - 0.7, slashAng + 0.25);
        ctx.stroke();

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(3, 0, reach, slashAng - 0.85, slashAng + 0.1);
        ctx.stroke();

        // Cutlass blade gleam
        ctx.save();
        ctx.rotate(slashAng);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(7, -1.5, reach, 3);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(6, -3, 2, 6);
        ctx.restore();
        break;
      }

      case 'VILLAGER': {
        if (cr.npcRole === 'guardiao' || cr.heldItemId === 'iron_sword') {
          // Village Guardian Iron Broadsword wide steel-and-gold slash arc
          const slashAng = -1.25 + p * 2.5;
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.arc(4, 0, reach + 5, slashAng - 0.75, slashAng + 0.3);
          ctx.stroke();

          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.arc(4, 0, reach + 2, slashAng - 0.6, slashAng + 0.2);
          ctx.stroke();

          ctx.save();
          ctx.rotate(slashAng);
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(6, -2, reach + 4, 4);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(5, -4, 2.5, 8);
          ctx.restore();
        } else {
          // Village Defender spear-blade thrust & emerald-gold sweep
          const thrustX = 6 + Math.sin(p * Math.PI) * (reach + 5);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(4, 0, reach + 2, -0.75 + p * 0.4, 0.75 - p * 0.4);
          ctx.stroke();

          // Steel spear/blade thrust
          ctx.fillStyle = '#92400e';
          ctx.fillRect(4, -1.5, thrustX - 4, 3);
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.moveTo(thrustX + 6, 0);
          ctx.lineTo(thrustX - 2, -4);
          ctx.lineTo(thrustX - 2, 4);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#fde047';
          ctx.fillRect(thrustX - 3, -3, 2, 6);
        }
        break;
      }

      case 'WANDERER': {
        // Wayfarer lantern-staff & traveler blade golden-azure arc
        const sweepAng = -1.0 + p * 2.0;
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(4, 0, reach + 3, sweepAng - 0.65, sweepAng + 0.35);
        ctx.stroke();

        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(4, 0, reach, sweepAng - 0.5, sweepAng + 0.25);
        ctx.stroke();

        // Glowing lantern spark at staff tip
        const tipX = 4 + Math.cos(sweepAng) * (reach + 2);
        const tipY = Math.sin(sweepAng) * (reach + 2);
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(tipX, tipY, 3.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'BOAR': {
        // Ferocious ivory tusk upward gore charge ("Investida de Presas")
        const goreX = 6 + p * (reach + 4);
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2.8;
        // Twin curved ivory tusk arcs
        ctx.beginPath();
        ctx.moveTo(4, -3);
        ctx.quadraticCurveTo(goreX * 0.7, -9, goreX + 4, -5);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(4, 3);
        ctx.quadraticCurveTo(goreX * 0.7, 9, goreX + 4, 5);
        ctx.stroke();

        // Crimson/amber impact burst at tusk tips
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(goreX, 0, 8, -0.7, 0.7);
        ctx.stroke();
        break;
      }

      case 'CAMEL': {
        // Desert Camel forward hoof kick + pressurized sand/water spit burst
        const jetDist = 8 + p * (reach + 8);
        // Hoof kick arc
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(6, 2, 12, -0.6, 0.6);
        ctx.stroke();

        // Pressurized desert spit / sand-water droplets
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(jetDist, -3, 3.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(jetDist - 4, 2, 2.4, 0, Math.PI * 2);
        ctx.arc(jetDist + 3, 1, 2.0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      default:
        break;
    }

    ctx.restore();
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    player: PlayerState,
    globalTime: number,
    shadowDx: number,
    isSwimming = false,
    mountEntity: CreatureEntity | null = null
  ): void {
    const frame = player.isMoving && !mountEntity ? player.animFrame : 0;
    const isBoatMount = Boolean(mountEntity && mountEntity.kind === 'BOAT');
    const mountPose: 'none' | 'horse' | 'boat' = !mountEntity
      ? 'none'
      : isBoatMount
        ? 'boat'
        : 'horse';
    const sprite = spriteAtlas.getPlayerSprite(
      player.direction,
      frame,
      player,
      mountPose
    );

    const eq = player.equippedBySlot || {
      head: null,
      body: player.equippedArmorId || null,
      legs: null,
      feet: null,
    };
    const hasAstralGear =
      eq.head === 'astral_crown' ||
      eq.body === 'astral_armor' ||
      eq.legs === 'astral_leggings' ||
      eq.feet === 'astral_boots';

    // Compute seat offset using the reusable Transport Seat Model (Seat 1 = Pilot, Seat 2 = Passenger)
    let mountOffsetX = 0;
    let mountOffsetY = 0;
    let isBoatPassengerSeat = false;
    if (mountEntity) {
      if (mountEntity.kind === 'BOAT') {
        const pUid = player.persistentPlayerId || '';
        const isExplicitPassenger =
          player.mountedSeatIndex === 1 ||
          (Boolean(pUid) && mountEntity.passengerPlayerId === pUid) ||
          (Boolean(mountEntity.passengerPlayerId) &&
            mountEntity.riderPlayerId !== pUid &&
            player.mountedSeatIndex !== 0);
        isBoatPassengerSeat = isExplicitPassenger;
      }
      const seatIndex = isBoatPassengerSeat ? 1 : 0;
      const seatOffset = getTransportSeatOffset(
        mountEntity.kind,
        seatIndex,
        mountEntity.direction
      );
      mountOffsetX = seatOffset.x;
      mountOffsetY = seatOffset.y;
    }

    const baseMountX = mountEntity ? mountEntity.x : player.x;
    const baseMountY = mountEntity ? mountEntity.y : player.y;
    const drawX = baseMountX + mountOffsetX;
    const drawY = baseMountY + mountOffsetY;

    // Speed Buff / Gallop / Astral Gear Afterimage Trail & Step Dust Puff when moving on dry land
    if (player.isMoving && !isSwimming && !isBoatMount) {
      const puffPhase = (globalTime * 6) % 1;
      const puffX = player.x - Math.sign(player.vx || 0.1) * (6 + puffPhase * 8);
      const puffY = player.y + 8 - puffPhase * 3;
      ctx.fillStyle = player.isGalloping
        ? `rgba(253, 224, 71, ${(0.55 * (1 - puffPhase)).toFixed(2)})`
        : `rgba(226, 212, 183, ${(0.45 * (1 - puffPhase)).toFixed(2)})`;
      ctx.fillRect(puffX - 2, puffY - 2, player.isGalloping ? 4 : 3, player.isGalloping ? 4 : 3);

      if ((player.speedBuffTimer || 0) > 0 || hasAstralGear || player.isGalloping) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.drawImage(
          sprite,
          drawX - player.vx * 0.055 - 15,
          drawY - player.vy * 0.055 - 19,
          30,
          30
        );
        ctx.restore();
      }
    }

    // Active Buff Aura Ring under Player
    if ((player.strengthBuffTimer || 0) > 0 || (player.speedBuffTimer || 0) > 0) {
      const pulse = Math.sin(globalTime * 6) * 1.2;
      ctx.save();
      ctx.strokeStyle =
        (player.strengthBuffTimer || 0) > 0
          ? 'rgba(244, 63, 94, 0.72)'
          : 'rgba(192, 132, 252, 0.72)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(player.x, player.y + 8, 12 + pulse, 5 + pulse * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (isSwimming) {
      const ripplePulse = Math.sin(globalTime * (player.isMoving ? 7.5 : 3.5)) * 1.5;
      const waterLineY = player.y + 6;
      ctx.save();
      ctx.fillStyle = 'rgba(8, 47, 73, 0.38)';
      ctx.beginPath();
      ctx.ellipse(player.x, waterLineY + 1, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(186, 230, 253, 0.68)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(
        player.x,
        waterLineY,
        10.5 + ripplePulse,
        4.2 + ripplePulse * 0.35,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    } else if (!mountEntity) {
      // Directional Ground Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.fillRect(player.x - 8 + Math.round(shadowDx * 0.4), player.y + 7, 16, 4);
    }

    // Organic Walk Hop / Swim Bob & Idle Breathing Squash-and-Stretch
    const walkHop = isSwimming || isBoatMount
      ? Math.sin(globalTime * (player.isMoving ? 7 : 3.2)) * (isBoatMount ? 0.9 : 1.1)
      : player.isMoving
      ? Math.abs(Math.sin(globalTime * (player.isGalloping ? 16 : 12))) * (mountEntity ? 2.2 : 1.8)
      : 0;
    const breathScaleY = player.isMoving
      ? 1 + Math.sin(globalTime * 12) * 0.035
      : 1 + Math.sin(globalTime * 3.5) * 0.022;
    const breathScaleX = 2 - breathScaleY;

    const hurtShakeX =
      player.hitFlashTimer > 0 ? Math.sin(globalTime * 65) * 2.0 : 0;

    if (player.hitFlashTimer > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.72)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(
        player.x,
        isSwimming ? player.y + 6 : player.y + 8,
        11.5,
        4.6,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    if (isSwimming || isBoatMount) {
      // Half-sprite rendering: in water OR seated inside a boat hull (head 1.0x, body 1.5x -> 48x42 canvas)
      const ratio = isBoatMount ? 0.58 : 0.54;
      const srcHalfH = Math.max(1, Math.round(sprite.height * ratio));
      const drawHalfH = isBoatMount ? 22 : 20;
      const yAnchorOffset = isBoatMount ? 4 : 7;
      ctx.translate(drawX + hurtShakeX, drawY + yAnchorOffset - walkHop);
      ctx.scale(breathScaleX, breathScaleY);
      if (player.hitFlashTimer > 0) {
        ctx.filter = 'brightness(2.0) contrast(1.2)';
      }
      ctx.drawImage(
        sprite,
        0,
        0,
        sprite.width,
        srcHalfH,
        -22.5,
        -drawHalfH,
        45,
        drawHalfH
      );
    } else {
      ctx.translate(drawX + hurtShakeX, drawY - walkHop);
      ctx.scale(breathScaleX, breathScaleY);
      if (player.hitFlashTimer > 0) {
        ctx.filter = 'brightness(2.0) contrast(1.2)';
      }
      // 48x42 composite sprite drawn at 45x39.375 so head stays 1.0x and body is 1.5x larger
      ctx.drawImage(sprite, -22.5, -27.5, 45, 39.375);
    }
    ctx.restore();

    if (isSwimming) {
      ctx.save();
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.78)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(player.x - 9.5, player.y + 6);
      ctx.lineTo(player.x + 9.5, player.y + 6);
      ctx.stroke();
      ctx.restore();
    }

    const slot = player.inventory[player.selectedHotbarIndex];
    if (slot) {
      const itemCanvas = spriteAtlas.getItemCanvas(
        slot.itemId,
        slot.selectedColor
      );
      const isSwinging = player.swingTimer > 0;
      const swingProgress = isSwinging
        ? 1 - player.swingTimer / player.swingDuration
        : 0;

      // Exact hand anchor coordinates synced with 1.5x body arms & walking arm swing
      const stepL = frame === 1 ? -2 : frame === 3 ? 2 : 0;
      const stepR = -stepL;
      const swimItemOffsetY = isSwimming ? 5 : isBoatMount ? 2 : 0;

      let baseAngle = 0;
      let handOffsetX = 0;
      let handOffsetY = 0;
      if (player.direction === 'up') {
        baseAngle = -Math.PI / 2;
        handOffsetX = 6.5;
        handOffsetY = -1.5 + stepR * 1.1;
      } else if (player.direction === 'down') {
        baseAngle = Math.PI / 2;
        handOffsetX = -6.5;
        handOffsetY = -1.0 + stepL * 1.1;
      } else if (player.direction === 'left') {
        baseAngle = Math.PI;
        handOffsetX = -2.2 - stepL * 0.6;
        handOffsetY = -1.0 + stepL * 1.1;
      } else {
        baseAngle = 0;
        handOffsetX = 2.2 + stepR * 0.6;
        handOffsetY = -1.0 + stepR * 1.1;
      }

      ctx.save();
      ctx.translate(
        drawX + hurtShakeX + handOffsetX,
        drawY - walkHop + handOffsetY + swimItemOffsetY
      );

      if (isSwinging) {
        const swingArc = (swingProgress - 0.5) * 2.2;
        ctx.rotate(baseAngle + swingArc);

        const outerColor =
          slot.itemId === 'astral_sword' ||
          slot.itemId === 'primordial_axe' ||
          slot.itemId === 'primordial_pickaxe'
            ? 'rgba(250, 204, 21, 0.55)'
            : slot.itemId === 'shadow_blade'
            ? 'rgba(192, 132, 252, 0.55)'
            : slot.itemId === 'abyssal_trident'
            ? 'rgba(56, 189, 248, 0.55)'
            : 'rgba(226, 232, 240, 0.42)';

        const coreColor =
          slot.itemId === 'astral_sword' ||
          slot.itemId === 'primordial_axe' ||
          slot.itemId === 'primordial_pickaxe'
            ? '#fef08a'
            : slot.itemId === 'shadow_blade'
            ? '#e9d5ff'
            : slot.itemId === 'abyssal_trident'
            ? '#bae6fd'
            : '#ffffff';

        // Outer Elemental Slash Ribbon
        ctx.strokeStyle = outerColor;
        ctx.lineWidth = 5.5;
        ctx.beginPath();
        ctx.arc(0, 0, 20, -0.75, 0.65);
        ctx.stroke();

        // Inner Razor Core Arc
        ctx.strokeStyle = coreColor;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, 21, -0.6, 0.6);
        ctx.stroke();

        // Draw item anchored by its handle at the hand origin (0, 0)
        ctx.drawImage(itemCanvas, -3, -17, 20, 20);
      } else {
        // Anchor the held item directly to the character's hand in all 4 directions (never floating)
        if (player.direction === 'left') {
          ctx.scale(-1, 1);
          ctx.rotate(-0.12);
          ctx.drawImage(itemCanvas, -3, -11, 14, 14);
        } else if (player.direction === 'right') {
          ctx.rotate(-0.12);
          ctx.drawImage(itemCanvas, -3, -11, 14, 14);
        } else if (player.direction === 'down') {
          ctx.scale(-1, 1);
          ctx.rotate(0.35);
          ctx.drawImage(itemCanvas, -3, -11, 14, 14);
        } else {
          // facing up
          ctx.rotate(-0.25);
          ctx.drawImage(itemCanvas, -3, -11, 14, 14);
        }
        // Subtle hand-grip clasp over item handle so the hand visibly holds the item
        ctx.fillStyle = player.appearance?.skinColor || '#f1c27d';
        ctx.fillRect(-1.5, -1.5, 3, 3);
      }
      ctx.restore();
    }

    // Active Fishing Line & Floating Bobber on Water
    if (player.fishingState?.active) {
      const fs = player.fishingState;
      const rodTipX =
        player.x +
        (player.direction === 'left'
          ? -12
          : player.direction === 'right'
          ? 12
          : 5);
      const rodTipY = player.y - 10 - walkHop;

      const isBiting = fs.phase === 'biting';
      const bobberDip = isBiting
        ? Math.sin(globalTime * 28) * 2.8 + 1.8
        : Math.sin(globalTime * 4.2) * 1.1;
      const bx = fs.bobberX;
      const by = fs.bobberY + bobberDip;

      ctx.save();
      // Curved Fishing Line
      ctx.strokeStyle = isBiting
        ? 'rgba(254, 240, 138, 0.92)'
        : 'rgba(226, 232, 240, 0.82)';
      ctx.lineWidth = isBiting ? 1.4 : 1.0;
      ctx.beginPath();
      ctx.moveTo(rodTipX, rodTipY);
      const midX = (rodTipX + bx) * 0.5;
      const midY = Math.min(rodTipY, by) + (isBiting ? 2 : 7);
      ctx.quadraticCurveTo(midX, midY, bx, by);
      ctx.stroke();

      // Water ring around bobber
      ctx.strokeStyle = isBiting
        ? 'rgba(56, 189, 248, 0.85)'
        : 'rgba(186, 230, 253, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(
        bx,
        fs.bobberY + 2,
        isBiting ? 6.5 : 4.5,
        isBiting ? 3.2 : 2.2,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();

      // Classic Red & White Pixel Bobber
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(bx - 2), Math.round(by - 2), 4, 2);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(Math.round(bx - 2), Math.round(by - 4), 4, 2);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(Math.round(bx - 0.5), Math.round(by - 6), 1, 2);

      // Pulsing "!" Alert above bobber when a fish is biting
      if (isBiting) {
        const alertBounce = Math.abs(Math.sin(globalTime * 16)) * 3;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1c1008';
        ctx.fillText('!', bx + 1, by - 9 - alertBounce);
        ctx.fillStyle = '#fde047';
        ctx.fillText('!', bx, by - 10 - alertBounce);
      }
      ctx.restore();
    }
  }

  private drawRemotePlayer(
    ctx: CanvasRenderingContext2D,
    rp: RemotePlayerState,
    globalTime: number,
    shadowDx: number,
    isSwimming = false,
    mountEntity: CreatureEntity | null = null
  ): void {
    const frame = rp.isMoving && !mountEntity ? rp.animFrame : 0;
    const isBoatMount = Boolean(mountEntity && mountEntity.kind === 'BOAT');
    const mountPose: 'none' | 'horse' | 'boat' = !mountEntity
      ? 'none'
      : isBoatMount
        ? 'boat'
        : 'horse';
    const sprite = spriteAtlas.getPlayerSprite(
      rp.direction,
      frame,
      rp as unknown as PlayerState,
      mountPose
    );

    let mountOffsetX = 0;
    let mountOffsetY = 0;
    let isRpBoatPassenger = false;
    if (mountEntity) {
      if (mountEntity.kind === 'BOAT') {
        const rpUid = rp.persistentPlayerId || '';
        const matchesPassenger =
          rp.mountedSeatIndex === 1 ||
          mountEntity.passengerPlayerId === rp.peerId ||
          (Boolean(rpUid) && mountEntity.passengerPlayerId === rpUid);
        const matchesHelm =
          rp.mountedSeatIndex === 0 ||
          mountEntity.riderPlayerId === rp.peerId ||
          (Boolean(rpUid) && mountEntity.riderPlayerId === rpUid);
        isRpBoatPassenger =
          matchesPassenger || (Boolean(mountEntity.riderPlayerId) && !matchesHelm);
      }
      const seatIndex = isRpBoatPassenger ? 1 : 0;
      const seatOffset = getTransportSeatOffset(
        mountEntity.kind,
        seatIndex,
        mountEntity.direction
      );
      mountOffsetX = seatOffset.x;
      mountOffsetY = seatOffset.y;
    }
    const baseRpMountX = mountEntity ? mountEntity.x : rp.x;
    const baseRpMountY = mountEntity ? mountEntity.y : rp.y;
    const drawX = baseRpMountX + mountOffsetX;
    const drawY = baseRpMountY + mountOffsetY;

    // Subtle allied player ground aura ring (hidden when seated inside a Boat)
    if (!isBoatMount) {
      ctx.save();
      ctx.strokeStyle = rp.isHost
        ? 'rgba(251, 191, 36, 0.5)'
        : 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(drawX, isSwimming ? drawY + 6 : drawY + 8, 10, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (isSwimming) {
      const ripplePulse = Math.sin(globalTime * (rp.isMoving ? 7.5 : 3.5)) * 1.5;
      const waterLineY = rp.y + 6;
      ctx.save();
      ctx.fillStyle = 'rgba(8, 47, 73, 0.38)';
      ctx.beginPath();
      ctx.ellipse(rp.x, waterLineY + 1, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(186, 230, 253, 0.68)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(
        rp.x,
        waterLineY,
        10.5 + ripplePulse,
        4.2 + ripplePulse * 0.35,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    } else if (!mountEntity) {
      // Directional Ground Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.fillRect(rp.x - 8 + Math.round(shadowDx * 0.4), rp.y + 7, 16, 4);
    }

    const walkHop = isSwimming || isBoatMount
      ? Math.sin(globalTime * (rp.isMoving ? 7 : 3.2)) * (isBoatMount ? 0.9 : 1.1)
      : rp.isMoving
      ? Math.abs(Math.sin(globalTime * 12)) * (mountEntity ? 2.2 : 1.8)
      : 0;
    const breathScaleY = rp.isMoving
      ? 1 + Math.sin(globalTime * 12) * 0.035
      : 1 + Math.sin(globalTime * 3.5) * 0.022;
    const breathScaleX = 2 - breathScaleY;
    const rpHurtShakeX =
      rp.hitFlashTimer > 0 ? Math.sin(globalTime * 65) * 2.0 : 0;

    ctx.save();
    if (isSwimming || isBoatMount) {
      const ratio = isBoatMount ? 0.58 : 0.54;
      const srcHalfH = Math.max(1, Math.round(sprite.height * ratio));
      const drawHalfH = isBoatMount ? 22 : 20;
      const yAnchorOffset = isBoatMount ? 4 : 7;
      ctx.translate(drawX + rpHurtShakeX, drawY + yAnchorOffset - walkHop);
      ctx.scale(breathScaleX, breathScaleY);
      if (rp.hitFlashTimer > 0) {
        ctx.filter = 'brightness(2.0) contrast(1.2)';
      }
      ctx.drawImage(
        sprite,
        0,
        0,
        sprite.width,
        srcHalfH,
        -22.5,
        -drawHalfH,
        45,
        drawHalfH
      );
    } else {
      ctx.translate(drawX + rpHurtShakeX, drawY - walkHop);
      ctx.scale(breathScaleX, breathScaleY);
      if (rp.hitFlashTimer > 0) {
        ctx.filter = 'brightness(2.0) contrast(1.2)';
      }
      ctx.drawImage(sprite, -22.5, -27.5, 45, 39.375);
    }
    ctx.restore();

    if (isSwimming) {
      ctx.save();
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.78)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(rp.x - 9.5, rp.y + 6);
      ctx.lineTo(rp.x + 9.5, rp.y + 6);
      ctx.stroke();
      ctx.restore();
    }

    if (rp.heldItemId && ITEMS[rp.heldItemId]) {
      const itemCanvas = spriteAtlas.getItemCanvas(rp.heldItemId);
      const isSwinging = rp.swingTimer > 0;
      const swingProgress = isSwinging
        ? 1 - rp.swingTimer / Math.max(0.1, rp.swingDuration)
        : 0;

      const stepL = frame === 1 ? -2 : frame === 3 ? 2 : 0;
      const stepR = -stepL;
      const swimItemOffsetY = isSwimming ? 5 : isBoatMount ? 2 : 0;

      let baseAngle = 0;
      let handOffsetX = 0;
      let handOffsetY = 0;
      if (rp.direction === 'up') {
        baseAngle = -Math.PI / 2;
        handOffsetX = 6.5;
        handOffsetY = -1.5 + stepR * 1.1;
      } else if (rp.direction === 'down') {
        baseAngle = Math.PI / 2;
        handOffsetX = -6.5;
        handOffsetY = -1.0 + stepL * 1.1;
      } else if (rp.direction === 'left') {
        baseAngle = Math.PI;
        handOffsetX = -2.2 - stepL * 0.6;
        handOffsetY = -1.0 + stepL * 1.1;
      } else {
        baseAngle = 0;
        handOffsetX = 2.2 + stepR * 0.6;
        handOffsetY = -1.0 + stepR * 1.1;
      }

      ctx.save();
      ctx.translate(
        drawX + rpHurtShakeX + handOffsetX,
        drawY - walkHop + handOffsetY + swimItemOffsetY
      );

      if (isSwinging) {
        const swingArc = (swingProgress - 0.5) * 2.2;
        ctx.rotate(baseAngle + swingArc);
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(0, 0, 20, -0.75, 0.65);
        ctx.stroke();
        ctx.drawImage(itemCanvas, -3, -17, 20, 20);
      } else {
        if (rp.direction === 'left') {
          ctx.scale(-1, 1);
          ctx.rotate(-0.12);
          ctx.drawImage(itemCanvas, -3, -11, 14, 14);
        } else if (rp.direction === 'right') {
          ctx.rotate(-0.12);
          ctx.drawImage(itemCanvas, -3, -11, 14, 14);
        } else if (rp.direction === 'down') {
          ctx.scale(-1, 1);
          ctx.rotate(0.35);
          ctx.drawImage(itemCanvas, -3, -11, 14, 14);
        } else {
          ctx.rotate(-0.25);
          ctx.drawImage(itemCanvas, -3, -11, 14, 14);
        }
        ctx.fillStyle = rp.appearance?.skinColor || '#f1c27d';
        ctx.fillRect(-1.5, -1.5, 3, 3);
      }
      ctx.restore();
    }

    // Overhead Name Tag, Role Badge, Boat Seat Tag, HP Bar & Chat Bubble
    const headTopY = isSwimming || isBoatMount ? drawY - 13 : drawY - 22;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 7px "Plus Jakarta Sans", sans-serif';
    const seatSuffix = isBoatMount
      ? isRpBoatPassenger
        ? ' · Assento 2'
        : ' · Piloto'
      : '';
    const badgeText = `${rp.isHost ? '👑 ' : '🌐 '}${rp.name} [NV.${rp.level || 1}${seatSuffix}]`;
    const boxW = Math.max(66, badgeText.length * 4.4 + 10);
    ctx.fillStyle = 'rgba(10, 14, 23, 0.85)';
    ctx.fillRect(drawX - boxW / 2, headTopY - 14, boxW, 11);
    ctx.fillStyle = rp.isHost ? '#fde047' : '#38bdf8';
    ctx.fillText(badgeText, drawX, headTopY - 6);

    if (rp.chatMessage && (rp.chatTimer || 0) > 0) {
      const chatText = `💬 ${rp.chatMessage}`;
      const chatW = Math.max(72, Math.min(180, chatText.length * 4.6 + 12));
      ctx.fillStyle = 'rgba(26, 17, 11, 0.94)';
      ctx.fillRect(drawX - chatW / 2, headTopY - 28, chatW, 12);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.strokeRect(drawX - chatW / 2, headTopY - 28, chatW, 12);
      ctx.fillStyle = '#fef08a';
      ctx.fillText(chatText, drawX, headTopY - 20);
    }
    ctx.restore();

    if (rp.hp < rp.maxHp) {
      this.drawMiniBar(
        ctx,
        drawX,
        headTopY - 2,
        rp.hp / Math.max(1, rp.maxHp),
        '#38bdf8'
      );
    }
  }

  /**
   * Renders persistent fading footprints, water step ripples, and expanding interaction shockwave rings on the ground.
   */
  private drawGroundFootprintsAndRipples(ctx: CanvasRenderingContext2D): void {
    // 1. Footprints & Step Water Ripples
    for (const fp of this.footprints) {
      const alpha = Math.max(0, fp.timer / fp.maxTimer);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (fp.isRipple) {
        const radius = 3 + (1 - alpha) * 10;
        ctx.strokeStyle = fp.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(fp.x, fp.y, radius, radius * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = fp.color;
        ctx.fillRect(fp.x - 1.5, fp.y - 1, 3, 2);
      }
      ctx.restore();
    }

    // 2. Expanding Interaction / Impact Ripples
    for (const rp of this.ripples) {
      const progress = 1 - rp.timer / rp.maxTimer;
      const alpha = Math.max(0, 1 - progress);
      const radius = 4 + progress * rp.maxRadius;
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = rp.color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, radius, radius * 0.58, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Renders active burst particles (wood chips, leaves, sparks, hearts, heal crosses, smoke) and lightning arcs.
   */
  private drawActiveParticlesAndBolts(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const alpha = Math.max(0, Math.min(1, p.timer / p.maxTimer));
      ctx.save();
      ctx.globalAlpha = alpha;

      if (p.kind === 'heart') {
        ctx.fillStyle = p.color;
        ctx.font = 'bold 8px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('♥', p.x - 3, p.y);
      } else if (p.kind === 'plus') {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1, p.y - 3, 2, 6);
        ctx.fillRect(p.x - 3, p.y - 1, 6, 2);
      } else if (p.kind === 'spark') {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1, p.y - 1, p.size + 1, p.size + 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(p.x, p.y, 1.5, 1.5);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        if (p.secondaryColor) {
          ctx.fillStyle = p.secondaryColor;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, 1.5, 1.5);
        }
      }
      ctx.restore();
    }

    // Jagged Lightning Bolts (Guardian Totem Solar Zap)
    for (const bolt of this.lightningBolts) {
      const alpha = Math.max(0, bolt.timer / bolt.maxTimer);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = bolt.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bolt.x1, bolt.y1);
      const segments = 5;
      for (let s = 1; s < segments; s++) {
        const t = s / segments;
        const jx =
          bolt.x1 +
          (bolt.x2 - bolt.x1) * t +
          (Math.random() - 0.5) * 12;
        const jy =
          bolt.y1 +
          (bolt.y2 - bolt.y1) * t +
          (Math.random() - 0.5) * 12;
        ctx.lineTo(jx, jy);
      }
      ctx.lineTo(bolt.x2, bolt.y2);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * AAA Ambient World Particles (Fireflies at night, Butterflies & Golden Pollen by day, Desert Sand Motes, Ocean Caustics)
   * Deterministically computed in visible world-space with zero heap allocations.
   */
  private drawAmbientWorldParticles(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    world: WorldManager,
    timeOfDay: number,
    globalTime: number,
    halfW: number,
    halfH: number,
    lightSources: {
      x: number;
      y: number;
      radius: number;
      color: string;
      strength?: number;
      yellowTint?: boolean;
    }[]
  ): void {
    const isNight = timeOfDay >= 19.5 || timeOfDay < 5.5;
    const isDarkening = timeOfDay >= 17.5 || timeOfDay < 7.5;
    const cellSize = 88;
    const minGx = Math.floor((camera.x - halfW) / cellSize);
    const maxGx = Math.floor((camera.x + halfW) / cellSize);
    const minGy = Math.floor((camera.y - halfH) / cellSize);
    const maxGy = Math.floor((camera.y + halfH) / cellSize);

    for (let gy = minGy; gy <= maxGy; gy++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const seedHash = world.getTileDetailHash(gx, gy, 991);
        if (seedHash > 0.72) continue;

        const baseX = gx * cellSize + seedHash * cellSize;
        const baseY = gy * cellSize + ((seedHash * 13) % 1) * cellSize;
        const phase = globalTime * 1.6 + seedHash * 25;

        const px = baseX + Math.sin(phase) * 16;
        const py = baseY + Math.cos(phase * 0.85) * 12;
        const biome = world.getBiomeAtWorld(px, py);

        if (biome === BiomeType.PLAINS || biome === BiomeType.ISLAND) {
          if (isNight || isDarkening) {
            // Night fireflies are rendered in the dedicated low-density wandering pass below
            continue;
          } else if (seedHash < 0.16) {
            // Daytime Fluttering Pixel Butterfly
            const wingSpan = Math.abs(Math.sin(globalTime * 14 + seedHash * 40)) > 0.45 ? 2 : 1;
            ctx.fillStyle =
              seedHash < 0.06
                ? '#fde047'
                : seedHash < 0.11
                ? '#38bdf8'
                : '#f472b6';
            ctx.fillRect(px - wingSpan, py - 1, wingSpan, 2);
            ctx.fillRect(px + 1, py - 1, wingSpan, 2);
          } else {
            // Daytime drifting golden pollen / dandelion mote
            ctx.fillStyle = 'rgba(254, 249, 195, 0.58)';
            ctx.fillRect(px, py, 2, 2);
          }
        } else if (biome === BiomeType.DESERT) {
          // Wind-swept golden sand streak & heat shimmer mote
          const windX = baseX + ((globalTime * 42 + seedHash * 100) % cellSize);
          ctx.fillStyle = 'rgba(254, 240, 138, 0.44)';
          ctx.fillRect(windX, py, 5, 1);
          if (seedHash < 0.2) {
            ctx.fillStyle = 'rgba(251, 191, 36, 0.5)';
            ctx.fillRect(px, py, 2, 2);
          }
        } else if (biome === BiomeType.OCEAN) {
          // Animated water caustic wave ribbon & specular sun/moon glint
          const waveW = 6 + Math.round(Math.sin(phase * 1.8) * 3);
          ctx.fillStyle = 'rgba(125, 211, 252, 0.25)';
          ctx.fillRect(px - waveW / 2, py + 2, waveW, 1);
          if (Math.sin(phase * 2.2) > 0.35) {
            ctx.fillStyle = 'rgba(224, 242, 254, 0.72)';
            ctx.fillRect(px, py, 2, 2);
          }
        }
      }
    }

    // Dedicated Night Fireflies Pass:
    // - Very low density (large 260px cells + low spawn probability)
    // - Spawn for a few seconds (~6.5s) and then disappear
    // - Wander slowly across the world instead of staying in one place
    // - Twinkle/blink with light strength varying slowly between ON (up to 80%) and OFF (0%)
    if (isNight || isDarkening) {
      const fireflyCell = 260;
      const fMinGx = Math.floor((camera.x - halfW) / fireflyCell) - 1;
      const fMaxGx = Math.floor((camera.x + halfW) / fireflyCell) + 1;
      const fMinGy = Math.floor((camera.y - halfH) / fireflyCell) - 1;
      const fMaxGy = Math.floor((camera.y + halfH) / fireflyCell) + 1;

      for (let fgy = fMinGy; fgy <= fMaxGy; fgy++) {
        for (let fgx = fMinGx; fgx <= fMaxGx; fgx++) {
          const seedHash = world.getTileDetailHash(fgx, fgy, 1777);
          // Very low density: only ~22% of large 260x260 cells can host a firefly
          if (seedHash > 0.22) continue;

          // Finite spawn/despawn cycle: firefly lifetime is 10 seconds, then disappears for several seconds
          const cyclePeriod = 20.0 + ((seedHash * 97) % 8.0); // 20s to 28s total cycle
          const activeDuration = 10.0; // stays alive for 10.0 seconds then vanishes
          const timeOffset = seedHash * 313.7;
          const cycleTime = (globalTime + timeOffset) % cyclePeriod;
          if (cycleTime > activeDuration) continue;

          const cycleIndex = Math.floor((globalTime + timeOffset) / cyclePeriod);
          const spawnHashX = world.getTileDetailHash(fgx + cycleIndex * 7, fgy, 3301);
          const spawnHashY = world.getTileDetailHash(fgx, fgy + cycleIndex * 11, 4409);

          const startX = (fgx + 0.15 + spawnHashX * 0.7) * fireflyCell;
          const startY = (fgy + 0.15 + spawnHashY * 0.7) * fireflyCell;

          // Low-speed wandering trajectory (~15 px/s with gentle organic curve)
          const dirAngle = (spawnHashX * 17 + spawnHashY * 31) * Math.PI * 2;
          const wanderSpeed = 14 + (seedHash * 40) % 5; // 14..19 px/s
          const age = cycleTime;
          const perpAngle = dirAngle + Math.PI * 0.5;
          const curveOffset = Math.sin(age * 1.15 + seedHash * 23) * 9;

          const fx =
            startX +
            Math.cos(dirAngle) * age * wanderSpeed +
            Math.cos(perpAngle) * curveOffset;
          const fy =
            startY +
            Math.sin(dirAngle) * age * wanderSpeed +
            Math.sin(perpAngle) * curveOffset;

          const biome = world.getBiomeAtWorld(fx, fy);
          if (biome !== BiomeType.PLAINS && biome !== BiomeType.ISLAND) continue;

          // Life envelope (smooth fade in at spawn and fade out before disappearing)
          const lifeEnvelope = Math.sin((age / activeDuration) * Math.PI);
          // Slow real-life firefly twinkle: smoothly varies between completely OFF (0) and ON (1)
          const slowPulse = Math.max(
            0,
            Math.sin(age * 1.85 + spawnHashX * Math.PI * 2)
          );
          const blinkFactor = lifeEnvelope * slowPulse;

          if (blinkFactor <= 0.02) {
            // Firefly is currently in its dark ("apagado") phase: tiny faint silhouette only, zero light
            ctx.fillStyle = 'rgba(161, 161, 170, 0.18)';
            ctx.fillRect(fx, fy, 1, 1);
            continue;
          }

          ctx.fillStyle = `rgba(250, 204, 21, ${(blinkFactor * 0.36).toFixed(2)})`;
          ctx.fillRect(fx - 2, fy - 2, 5, 5);
          ctx.fillStyle = `rgba(254, 240, 138, ${(blinkFactor * 0.95).toFixed(2)})`;
          ctx.fillRect(fx - 1, fy - 1, 2, 2);

          lightSources.push({
            x: fx,
            y: fy,
            radius: 10 + 12 * blinkFactor,
            color: '250, 204, 21',
            strength: 0.8 * blinkFactor,
            yellowTint: true,
          });
        }
      }
    }
  }

  private drawMiniBar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    ratio: number,
    color: string
  ): void {
    const w = 24;
    const h = 4;
    ctx.fillStyle = 'rgba(18, 12, 8, 0.92)';
    ctx.fillRect(cx - w / 2, cy, w, h);
    const fillW = Math.max(0, Math.min(1, ratio)) * (w - 2);
    ctx.fillStyle = color;
    ctx.fillRect(cx - w / 2 + 1, cy + 1, fillW, h - 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(cx - w / 2 + 1, cy + 1, fillW, 1);
  }

  private drawFlowerInWorld(
    ctx: CanvasRenderingContext2D,
    itemId: string,
    flowerColor: ClothingColorId,
    wx: number,
    wy: number,
    tileX: number,
    tileY: number,
    globalTime: number,
    isHitFlashing: boolean,
    hp: number,
    maxHp: number,
    isAimed: boolean
  ): void {
    const cx = wx + TILE_SIZE / 2;
    const cy = wy + TILE_SIZE / 2 + 3;
    const sway =
      Math.sin(globalTime * 2.3 + tileX * 0.65 + tileY * 0.45) * 1.1;
    const isSunflower = itemId === 'flower_sunflower';
    const isSolarDrop = itemId === 'flower_solar_drop';
    const size = isSunflower ? 22 : 19;

    // Subtle ground shadow
    ctx.fillStyle = 'rgba(8, 12, 18, 0.22)';
    ctx.fillRect(Math.round(cx - 5), Math.round(cy + 4), 10, 3);

    // Gota Solar warm golden ground aura
    if (isSolarDrop) {
      const pulse = Math.sin(globalTime * 4 + tileX + tileY) * 1.5;
      ctx.save();
      ctx.fillStyle = 'rgba(253, 224, 71, 0.22)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, 9 + pulse, 4.5 + pulse * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const icon = spriteAtlas.getItemCanvas(itemId, flowerColor);
    ctx.save();
    ctx.translate(cx + sway, cy + 6);
    if (isHitFlashing) {
      ctx.filter = 'brightness(1.8)';
    }
    ctx.drawImage(icon, -size / 2, -size, size, size);
    ctx.restore();

    if (hp < maxHp && !isAimed) {
      this.drawMiniBar(ctx, cx, wy - 8, hp / Math.max(1, maxHp), '#22c55e');
    }
  }

  private renderDayNightOverlay(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    timeOfDay: number,
    globalTime: number,
    lights: {
      x: number;
      y: number;
      radius: number;
      color: string;
      strength?: number;
      yellowTint?: boolean;
    }[],
    playerHpRatio = 1.0
  ): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // 1. Night / Dusk / Dawn Darkness Layer & Progressive Luminosity Mask
    // Light is never drawn as a bright/cloudy overlay on top of the game view;
    // instead, darkness is a layer over the world, and each light source acts as a
    // subtractive luminosity mask (100% clear at the center point of light, progressively
    // losing luminosity until full ambient darkness at the outer radius).
    let darkness = 0;
    const tintR = 6;
    const tintG = 10;
    const tintB = 24;

    if (timeOfDay >= 20 || timeOfDay < 5) {
      darkness = 0.78;
    } else if (timeOfDay >= 17.5 && timeOfDay < 20) {
      const t = (timeOfDay - 17.5) / 2.5;
      darkness = t * 0.78;
    } else if (timeOfDay >= 5 && timeOfDay < 7.5) {
      const t = 1 - (timeOfDay - 5) / 2.5;
      darkness = t * 0.78;
    }

    if (darkness > 0.01) {
      if (!this.lightCanvas) {
        this.lightCanvas = document.createElement('canvas');
      }
      if (this.lightCanvas.width !== w || this.lightCanvas.height !== h) {
        this.lightCanvas.width = w;
        this.lightCanvas.height = h;
      }

      const lCtx = this.lightCanvas.getContext('2d')!;
      lCtx.globalCompositeOperation = 'source-over';
      lCtx.clearRect(0, 0, w, h);
      lCtx.fillStyle = `rgba(${tintR}, ${tintG}, ${tintB}, ${darkness.toFixed(3)})`;
      lCtx.fillRect(0, 0, w, h);

      // Carve out darkness using a pure progressive luminosity mask:
      // 100% light (or custom strength, e.g. 80% for fireflies) at the exact point of light (r = 0),
      // progressively fading out to 0% light (100% ambient darkness) at r.
      lCtx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < lights.length; i++) {
        const light = lights[i];
        const flicker = 1 + Math.sin(globalTime * 7.5 + i * 1.9) * 0.02;
        const { sx, sy } = camera.worldToScreen(light.x, light.y);
        const r = light.radius * camera.zoom * flicker;
        if (sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h) continue;

        const strength = Math.max(0, Math.min(1, light.strength ?? 1.0));
        const grad = lCtx.createRadialGradient(sx, sy, 0, sx, sy, r);
        grad.addColorStop(0.0, `rgba(0, 0, 0, ${(1.0 * strength).toFixed(3)})`);
        grad.addColorStop(0.15, `rgba(0, 0, 0, ${(0.92 * strength).toFixed(3)})`);
        grad.addColorStop(0.35, `rgba(0, 0, 0, ${(0.72 * strength).toFixed(3)})`);
        grad.addColorStop(0.6, `rgba(0, 0, 0, ${(0.42 * strength).toFixed(3)})`);
        grad.addColorStop(0.82, `rgba(0, 0, 0, ${(0.14 * strength).toFixed(3)})`);
        grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

        lCtx.fillStyle = grad;
        lCtx.beginPath();
        lCtx.arc(sx, sy, r, 0, Math.PI * 2);
        lCtx.fill();
      }
      lCtx.globalCompositeOperation = 'source-over';

      // Apply yellowish effect ("efeito amarelado") for night fireflies inside the existing light overlay
      const darknessRatio = Math.min(1, darkness / 0.78);
      for (let i = 0; i < lights.length; i++) {
        const light = lights[i];
        if (!light.yellowTint) continue;
        const flicker = 1 + Math.sin(globalTime * 7.5 + i * 1.9) * 0.02;
        const { sx, sy } = camera.worldToScreen(light.x, light.y);
        const r = light.radius * camera.zoom * flicker;
        if (sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h) continue;

        const yellowScale =
          darknessRatio * Math.min(1, Math.max(0, (light.strength ?? 0.8) / 0.8));
        if (yellowScale <= 0.01) continue;

        const yGrad = lCtx.createRadialGradient(sx, sy, 0, sx, sy, r);
        yGrad.addColorStop(0.0, `rgba(250, 204, 21, ${(0.34 * yellowScale).toFixed(3)})`);
        yGrad.addColorStop(0.45, `rgba(250, 204, 21, ${(0.18 * yellowScale).toFixed(3)})`);
        yGrad.addColorStop(0.8, `rgba(250, 204, 21, ${(0.06 * yellowScale).toFixed(3)})`);
        yGrad.addColorStop(1.0, 'rgba(250, 204, 21, 0.0)');

        lCtx.fillStyle = yGrad;
        lCtx.beginPath();
        lCtx.arc(sx, sy, r, 0, Math.PI * 2);
        lCtx.fill();
      }

      ctx.drawImage(this.lightCanvas, 0, 0);
    }

    // 2. Low-HP Critical Heartbeat Edge Alert (only when HP <= 30%)
    if (playerHpRatio <= 0.3) {
      const pulseAlpha = 0.18 + Math.abs(Math.sin(globalTime * 5.5)) * 0.18;
      const outerRadius = Math.hypot(w, h) * 0.55;
      const vig = ctx.createRadialGradient(
        w / 2,
        h / 2,
        outerRadius * 0.6,
        w / 2,
        h / 2,
        outerRadius
      );
      vig.addColorStop(0, 'rgba(153, 27, 27, 0)');
      vig.addColorStop(1, `rgba(153, 27, 27, ${pulseAlpha.toFixed(2)})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
