import { CONSTRUCTION_BLUEPRINTS, ITEMS, NATURE_BLUEPRINTS } from '../core/ItemRegistry';
import {
  BiomeType,
  CreatureEntity,
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
} from '../core/types';
import {
  CHUNK_SIZE,
  CHUNK_WORLD_SIZE,
  TILE_SIZE,
  WorldManager,
} from '../world/WorldManager';
import { Camera } from './Camera';
import { spriteAtlas } from './SpriteAtlas';

interface RenderableItem {
  ySort: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export interface AimedTargetInfo {
  kind: 'station' | 'wild_animal' | 'tamed_animal' | 'villager' | 'node' | 'crop';
  label: string;
  actionHint: string;
  worldX: number;
  worldY: number;
  stationType?: PlaceableType;
  creatureId?: string;
  iconItemId?: string;
  structureId?: string;
  cropType?: string;
  cropStage?: number;
  isWatered?: boolean;
}

export interface BuildRenderOptions {
  demolishMode?: boolean;
  orientation?: 'auto' | 'horizontal' | 'vertical';
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
        const biome = world.getBiomeAtWorld(cr.x, cr.y + 6);
        this.footprints.push({
          x: cr.x + (Math.random() - 0.5) * 5,
          y: cr.y + 8,
          color:
            biome === BiomeType.DESERT
              ? 'rgba(146, 64, 14, 0.28)'
              : 'rgba(20, 83, 45, 0.28)',
          timer: 1.0,
          maxTimer: 1.0,
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
    remotePlayers: RemotePlayerState[] = []
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
    const lightSources: { x: number; y: number; radius: number; color: string }[] = [];

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
            ctx.drawImage(sprite, wx, wy, TILE_SIZE, TILE_SIZE);

            // Seamless Auto-Tiling Coastlines & Biome Ecotone Transitions
            this.drawSeamlessBiomeBorders(ctx, world, tx, ty, wx, wy, biome, globalTime);

            // Procedural Ground Micro-Decorations (Clovers, Pebbles, Shells, Mushrooms, Lilypads)
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
            renderQueue.push({
              ySort: st.tileY * TILE_SIZE + TILE_SIZE * 0.85,
              draw: (c) =>
                this.drawStructure(
                  c,
                  world,
                  st,
                  globalTime,
                  shadowDx,
                  player,
                  creatures
                ),
            });
          }

          if (st.lightRadius && st.lightRadius > 0) {
            lightSources.push({
              x: st.tileX * TILE_SIZE + TILE_SIZE / 2,
              y: st.tileY * TILE_SIZE + TILE_SIZE / 2,
              radius: st.lightRadius,
              color:
                st.type === PlaceableType.HEALING_FOUNTAIN
                  ? '70, 205, 255'
                  : st.type === PlaceableType.GUARDIAN_TOTEM ||
                    st.type === PlaceableType.SOLAR_ALTAR ||
                    st.type === PlaceableType.IRON_LANTERN
                  ? '255, 220, 85'
                  : '255, 165, 65',
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

          // Luminous rare/sacred nature nodes also emit soft night light
          if (
            node.type === NatureNodeType.ANCIENT_WORLD_TREE ||
            node.type === NatureNodeType.SUNSTONE_OBELISK ||
            node.type === NatureNodeType.DESERT_CRYSTAL ||
            node.type === NatureNodeType.PEARL_CLAM
          ) {
            lightSources.push({
              x: wx + TILE_SIZE / 2,
              y: wy + TILE_SIZE / 2,
              radius:
                node.type === NatureNodeType.ANCIENT_WORLD_TREE ||
                node.type === NatureNodeType.SUNSTONE_OBELISK
                  ? 125
                  : 75,
              color:
                node.type === NatureNodeType.ANCIENT_WORLD_TREE
                  ? '60, 225, 160'
                  : node.type === NatureNodeType.DESERT_CRYSTAL
                  ? '255, 200, 65'
                  : '80, 205, 255',
            });
          }

          renderQueue.push({
            ySort: wy + TILE_SIZE * 0.9,
            draw: (c) => this.drawNatureNode(c, node, globalTime, shadowDx, player),
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

    // 2. Placement Grid & Connected Continuity Preview if player holds a PLACEABLE item
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

    // 2B. Aimed Target Reticle with Animated Corner Brackets & Ground Halo
    if (aimedTarget) {
      const pulse = Math.sin(globalTime * 8) * 1.5;
      const rx = aimedTarget.worldX - 16 - pulse;
      const ry = aimedTarget.worldY - 16 - pulse;
      const rw = 32 + pulse * 2;
      const rh = 32 + pulse * 2;

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
          : '#38bdf8';

      ctx.save();
      // Subtle ground lock-on ellipse
      ctx.strokeStyle = reticleColor;
      ctx.globalAlpha = 0.38;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(
        aimedTarget.worldX,
        aimedTarget.worldY + 10,
        14 + pulse,
        6 + pulse * 0.4,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();

      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 1.5;
      const cLen = 6;
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
          const icon = spriteAtlas.getItemCanvas(drop.itemId);
          c.drawImage(icon, drop.x - 9, drop.y - 11 + bob, 18, 18);

          // Specular item sparkle
          if (Math.sin(drop.bobTimer * 6 + drop.x) > 0.65) {
            c.fillStyle = '#fef08a';
            c.fillRect(drop.x + 4, drop.y - 10 + bob, 2, 2);
          }
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
      renderQueue.push({
        ySort: cr.y + 10,
        draw: (c) => this.drawCreature(c, cr, globalTime, shadowDx, timeOfDay),
      });
    }

    // 4B. Remote Online Players
    for (const rp of remotePlayers) {
      if (
        rp.x < camera.x - halfW ||
        rp.x > camera.x + halfW ||
        rp.y < camera.y - halfH ||
        rp.y > camera.y + halfH
      ) {
        continue;
      }
      renderQueue.push({
        ySort: rp.y + 10,
        draw: (c) => this.drawRemotePlayer(c, rp, globalTime, shadowDx),
      });
    }

    // 5. Local Player
    renderQueue.push({
      ySort: player.y + 10,
      draw: (c) => this.drawPlayer(c, player, globalTime, shadowDx),
    });

    // Sort by Y and draw all entities/objects
    renderQueue.sort((a, b) => a.ySort - b.ySort);
    for (const item of renderQueue) {
      item.draw(ctx);
    }

    // 5B. Active Burst Particles & Guardian Totem Lightning Arcs
    this.drawActiveParticlesAndBolts(ctx);

    // 6. AAA Ambient Biome & Atmospheric Particles (Fireflies, Butterflies, Golden Pollen, Sand Motes)
    this.drawAmbientWorldParticles(ctx, camera, world, timeOfDay, globalTime, halfW, halfH);

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
    const eq = player.equippedBySlot || {
      head: null,
      body: player.equippedArmorId || null,
      legs: null,
      feet: null,
    };
    const hasAstralPiece =
      eq.head === 'astral_crown' ||
      eq.body === 'astral_armor' ||
      eq.legs === 'astral_leggings' ||
      eq.feet === 'astral_boots';

    let playerLightRadius = 135;
    let playerLightColor = '255, 230, 140';
    if (heldItem?.id === 'torch' || heldItem?.id === 'iron_lantern') {
      playerLightRadius = 215;
      playerLightColor = '255, 175, 70';
    } else if (
      heldItem?.id === 'astral_sword' ||
      heldItem?.id === 'abyssal_trident' ||
      heldItem?.id === 'recall_crystal'
    ) {
      playerLightRadius = 195;
      playerLightColor = '80, 200, 255';
    }
    if (hasAstralPiece) {
      playerLightRadius = Math.max(playerLightRadius, 220);
      playerLightColor = '110, 215, 255';
    }

    lightSources.push({
      x: player.x,
      y: player.y,
      radius: playerLightRadius,
      color: playerLightColor,
    });

    for (const rp of remotePlayers) {
      let rpRadius = 135;
      let rpColor = '255, 230, 140';
      if (rp.heldItemId === 'torch' || rp.heldItemId === 'iron_lantern') {
        rpRadius = 215;
        rpColor = '255, 175, 70';
      } else if (
        rp.heldItemId === 'astral_sword' ||
        rp.heldItemId === 'abyssal_trident' ||
        rp.heldItemId === 'recall_crystal'
      ) {
        rpRadius = 195;
        rpColor = '80, 200, 255';
      }
      const rpEq = rp.equippedBySlot || {
        head: null,
        body: rp.equippedArmorId || null,
        legs: null,
        feet: null,
      };
      if (
        rpEq.head === 'astral_crown' ||
        rpEq.body === 'astral_armor' ||
        rpEq.legs === 'astral_leggings' ||
        rpEq.feet === 'astral_boots'
      ) {
        rpRadius = Math.max(rpRadius, 220);
        rpColor = '110, 215, 255';
      }
      lightSources.push({
        x: rp.x,
        y: rp.y,
        radius: rpRadius,
        color: rpColor,
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

  /**
   * Seamless Auto-Tiling for Coastlines (Ocean <-> Land) & Ecotones (Plains <-> Desert).
   * Eliminates hard square tile seams and creates animated pixel shorelines & dithered grass/sand edges.
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
    // A. OCEAN COASTLINE AUTO-TILING (Submerged Sand Shelf, Cliff Lip & Animated Seafoam)
    // =========================================================================
    if (biome === BiomeType.OCEAN) {
      const nLand = n !== BiomeType.OCEAN;
      const sLand = s !== BiomeType.OCEAN;
      const eLand = e !== BiomeType.OCEAN;
      const wLand = w !== BiomeType.OCEAN;

      if (!nLand && !sLand && !eLand && !wLand) {
        // Check outer diagonal corners for rounded island tips
        const nwLand = world.getTileBiomeFast(tx - 1, ty - 1) !== BiomeType.OCEAN;
        const neLand = world.getTileBiomeFast(tx + 1, ty - 1) !== BiomeType.OCEAN;
        const swLand = world.getTileBiomeFast(tx - 1, ty + 1) !== BiomeType.OCEAN;
        const seLand = world.getTileBiomeFast(tx + 1, ty + 1) !== BiomeType.OCEAN;

        ctx.fillStyle = '#bae6fd';
        if (nwLand) ctx.fillRect(wx, wy, 6, 6);
        if (neLand) ctx.fillRect(wx + TILE_SIZE - 6, wy, 6, 6);
        if (swLand) ctx.fillRect(wx, wy + TILE_SIZE - 6, 6, 6);
        if (seLand) ctx.fillRect(wx + TILE_SIZE - 6, wy + TILE_SIZE - 6, 6, 6);
        return;
      }

      const waveOffset = Math.round(
        Math.sin(globalTime * 3.2 + tx * 0.8 + ty * 0.6) * 2
      );
      const foamDist = 5 + waveOffset;

      // 1. Submerged warm sandbank shelf along land edges
      ctx.fillStyle = 'rgba(217, 169, 92, 0.42)';
      if (nLand) ctx.fillRect(wx, wy, TILE_SIZE, 8);
      if (sLand) ctx.fillRect(wx, wy + TILE_SIZE - 8, TILE_SIZE, 8);
      if (wLand) ctx.fillRect(wx, wy, 8, TILE_SIZE);
      if (eLand) ctx.fillRect(wx + TILE_SIZE - 8, wy, 8, TILE_SIZE);

      // 2. Earthen / Sandy Shoreline Lip at immediate tile boundary
      if (nLand) {
        ctx.fillStyle = n === BiomeType.PLAINS ? '#4d6b2a' : '#b88c3e';
        ctx.fillRect(wx, wy, TILE_SIZE, 3);
        ctx.fillStyle = '#d6b065';
        ctx.fillRect(wx, wy + 3, TILE_SIZE, 2);
      }
      if (sLand) {
        ctx.fillStyle = s === BiomeType.PLAINS ? '#4d6b2a' : '#b88c3e';
        ctx.fillRect(wx, wy + TILE_SIZE - 3, TILE_SIZE, 3);
      }
      if (wLand) {
        ctx.fillStyle = w === BiomeType.PLAINS ? '#4d6b2a' : '#b88c3e';
        ctx.fillRect(wx, wy, 3, TILE_SIZE);
      }
      if (eLand) {
        ctx.fillStyle = e === BiomeType.PLAINS ? '#4d6b2a' : '#b88c3e';
        ctx.fillRect(wx + TILE_SIZE - 3, wy, 3, TILE_SIZE);
      }

      // 3. Animated White-Turquoise Seafoam Wave Line
      ctx.fillStyle = '#e0f2fe';
      if (nLand) {
        for (let px = 2; px < TILE_SIZE - 2; px += 6) {
          ctx.fillRect(wx + px, wy + foamDist, 4, 2);
        }
      }
      if (sLand) {
        for (let px = 2; px < TILE_SIZE - 2; px += 6) {
          ctx.fillRect(wx + px, wy + TILE_SIZE - foamDist - 2, 4, 2);
        }
      }
      if (wLand) {
        for (let py = 2; py < TILE_SIZE - 2; py += 6) {
          ctx.fillRect(wx + foamDist, wy + py, 2, 4);
        }
      }
      if (eLand) {
        for (let py = 2; py < TILE_SIZE - 2; py += 6) {
          ctx.fillRect(wx + TILE_SIZE - foamDist - 2, wy + py, 2, 4);
        }
      }
      return;
    }

    // =========================================================================
    // B. PLAINS <-> DESERT ECOTONE AUTO-TILING (Organic Grass/Sand Blending)
    // =========================================================================
    if (biome === BiomeType.DESERT) {
      const nPlains = n === BiomeType.PLAINS;
      const sPlains = s === BiomeType.PLAINS;
      const wPlains = w === BiomeType.PLAINS;
      const ePlains = e === BiomeType.PLAINS;

      if (nPlains || sPlains || wPlains || ePlains) {
        // Draw encroaching pixel grass tufts & olive border over the sand edge
        if (nPlains) {
          ctx.fillStyle = '#486b27';
          ctx.fillRect(wx, wy, TILE_SIZE, 3);
          ctx.fillStyle = '#5c8434';
          for (let px = 0; px < TILE_SIZE; px += 4) {
            const h = 3 + ((px + tx * 3) % 5);
            ctx.fillRect(wx + px, wy, 3, h);
          }
        }
        if (sPlains) {
          ctx.fillStyle = '#486b27';
          ctx.fillRect(wx, wy + TILE_SIZE - 3, TILE_SIZE, 3);
          ctx.fillStyle = '#5c8434';
          for (let px = 0; px < TILE_SIZE; px += 4) {
            const h = 3 + ((px + tx * 5) % 5);
            ctx.fillRect(wx + px, wy + TILE_SIZE - h, 3, h);
          }
        }
        if (wPlains) {
          ctx.fillStyle = '#486b27';
          ctx.fillRect(wx, wy, 3, TILE_SIZE);
          ctx.fillStyle = '#5c8434';
          for (let py = 0; py < TILE_SIZE; py += 4) {
            const wLen = 3 + ((py + ty * 3) % 5);
            ctx.fillRect(wx, wy + py, wLen, 3);
          }
        }
        if (ePlains) {
          ctx.fillStyle = '#486b27';
          ctx.fillRect(wx + TILE_SIZE - 3, wy, 3, TILE_SIZE);
          ctx.fillStyle = '#5c8434';
          for (let py = 0; py < TILE_SIZE; py += 4) {
            const wLen = 3 + ((py + ty * 5) % 5);
            ctx.fillRect(wx + TILE_SIZE - wLen, wy + py, wLen, 3);
          }
        }
      }
    }
  }

  /**
   * Procedural Ground Micro-Decorations (Clovers, Flowers, Pebbles, Mushrooms, Shells)
   * Adapts density and flora species to the tile's EcologicalZone in v2 worlds while keeping v1 saves unchanged.
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
    const ox = Math.floor(world.getTileDetailHash(tx, ty, 509) * 18) + 6;
    const oy = Math.floor(world.getTileDetailHash(tx, ty, 701) * 18) + 6;
    const sway = Math.round(Math.sin(globalTime * 2.8 + tx + ty) * 1);

    if (world.worldGenVersion >= 2) {
      const zone = world.getEcologicalZoneAtTile(tx, ty);

      if (zone === EcologicalZone.MEADOW_CLEARING) {
        // Clean, open grassland clearing (~91% bare grass, occasional tiny clover/flower)
        if (h > 0.09) return;
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(wx + ox, wy + oy, 3, 2);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(wx + ox + 1, wy + oy - 1, 2, 2);
        return;
      }

      if (zone === EcologicalZone.OVERGROWN_SHRUBLAND) {
        // Dense wild tall-grass & wildflower thicket (~58% of tiles have swaying grass tufts)
        if (h > 0.58) return;
        ctx.fillStyle = '#14532d';
        ctx.fillRect(wx + ox - 1, wy + oy + 3, 7, 2);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(wx + ox + sway, wy + oy - 2, 2, 5);
        ctx.fillRect(wx + ox + 3 + sway, wy + oy - 3, 2, 6);
        ctx.fillRect(wx + ox - 2 + sway, wy + oy, 2, 3);
        if (h < 0.22) {
          ctx.fillStyle = h < 0.11 ? '#f472b6' : '#fde047';
          ctx.fillRect(wx + ox + 2 + sway, wy + oy - 4, 2, 2);
        }
        return;
      }

      if (
        zone === EcologicalZone.DENSE_WOODLAND ||
        zone === EcologicalZone.ANCIENT_GROVE
      ) {
        if (h > 0.36) return;
        if (h < 0.14) {
          // Forest floor red-white fairy mushroom & moss
          ctx.fillStyle = '#14532d';
          ctx.fillRect(wx + ox - 1, wy + oy + 3, 6, 2);
          ctx.fillStyle = '#fef3c7';
          ctx.fillRect(wx + ox + 1, wy + oy + 1, 2, 3);
          ctx.fillStyle =
            zone === EcologicalZone.ANCIENT_GROVE ? '#38bdf8' : '#dc2626';
          ctx.fillRect(wx + ox, wy + oy - 1, 4, 2);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(wx + ox + 1, wy + oy - 1, 1, 1);
        } else {
          // Woodland fern & moss patch
          ctx.fillStyle = '#064e3b';
          ctx.fillRect(wx + ox, wy + oy + 2, 6, 2);
          ctx.fillStyle = '#10b981';
          ctx.fillRect(wx + ox + 1 + sway, wy + oy - 1, 4, 3);
        }
        return;
      }

      if (zone === EcologicalZone.ROCKY_HIGHLANDS) {
        if (h > 0.42) return;
        ctx.fillStyle = '#334155';
        ctx.fillRect(wx + ox, wy + oy + 1, 6, 3);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(wx + ox + 1, wy + oy, 4, 2);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(wx + ox + 6, wy + oy + 2, 3, 2);
        return;
      }

      if (zone === EcologicalZone.OPEN_SAND_DUNES) {
        // Very clean, sculpted wind-swept dunes (~93% bare sand)
        if (h > 0.07) return;
        ctx.fillStyle = '#b45309';
        ctx.fillRect(wx + ox, wy + oy, 3, 2);
        return;
      }

      if (zone === EcologicalZone.CRYSTAL_BADLANDS) {
        if (h > 0.38) return;
        ctx.fillStyle = '#78350f';
        ctx.fillRect(wx + ox, wy + oy + 2, 6, 3);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(wx + ox + 1, wy + oy, 4, 3);
        if (h < 0.14) {
          ctx.fillStyle = '#fde047';
          ctx.fillRect(wx + ox + 2, wy + oy - 1, 2, 2);
        }
        return;
      }
    }

    if (h > 0.28) return;

    if (biome === BiomeType.PLAINS) {
      if (h < 0.09) {
        ctx.fillStyle = '#14532d';
        ctx.fillRect(wx + ox - 1, wy + oy + 3, 6, 2);
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(wx + ox + 1, wy + oy + 1, 2, 3);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(wx + ox, wy + oy - 1, 4, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(wx + ox + 1, wy + oy - 1, 1, 1);
      } else if (h < 0.18) {
        ctx.fillStyle = '#475569';
        ctx.fillRect(wx + ox, wy + oy, 5, 3);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(wx + ox + 1, wy + oy, 3, 2);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(wx + ox + 6, wy + oy + 2, 3, 2);
      } else {
        ctx.fillStyle = '#14532d';
        ctx.fillRect(wx + ox, wy + oy + 2, 4, 2);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(wx + ox + sway, wy + oy - 1, 1, 3);
        ctx.fillRect(wx + ox + 2 + sway, wy + oy - 2, 1, 4);
      }
    } else if (biome === BiomeType.DESERT) {
      if (h < 0.1) {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(wx + ox, wy + oy + 2, 6, 3);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(wx + ox + 1, wy + oy, 4, 3);
        ctx.fillStyle = '#fcd34d';
        ctx.fillRect(wx + ox + 1, wy + oy, 2, 1);
      } else if (h < 0.19) {
        ctx.fillStyle = '#713f12';
        ctx.fillRect(wx + ox + 1, wy + oy + 1, 3, 2);
        ctx.fillStyle = '#a16207';
        ctx.fillRect(wx + ox + sway, wy + oy - 1, 1, 2);
        ctx.fillRect(wx + ox + 3 + sway, wy + oy - 1, 1, 2);
      }
    } else if (biome === BiomeType.OCEAN && subZone === 0) {
      if (h < 0.12) {
        ctx.fillStyle = '#15803d';
        ctx.fillRect(wx + ox + sway, wy + oy, 6, 5);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(wx + ox + 1 + sway, wy + oy + 1, 4, 3);
        ctx.fillStyle = '#f472b6';
        ctx.fillRect(wx + ox + 2 + sway, wy + oy, 2, 2);
      }
    }
  }

  private drawNatureNode(
    ctx: CanvasRenderingContext2D,
    node: NatureNode,
    globalTime: number,
    shadowDx: number,
    player?: PlayerState
  ): void {
    // Deterministic spatial hashes for natural morphological variety, width variation, height variation & mirror flip
    const hVar =
      (((node.tileX * 374761393 + node.tileY * 668265263) ^ 0x5bf03635) >>> 0) % 1000;
    const wHash =
      (((node.tileX * 1103515245 + node.tileY * 12345) ^ 0x27d4eb2d) >>> 0) % 1000;
    const hHash =
      (((node.tileX * 214013 + node.tileY * 2531011) ^ 0x85ebca6b) >>> 0) % 1000;

    const variant = hVar % 3; // 0, 1, or 2 morphological silhouette
    const wNorm = wHash / 999; // 0.0 .. 1.0 independent width factor
    const hNorm = hHash / 999; // 0.0 .. 1.0 independent height factor
    const mirrorX = (hVar & 1) === 1;

    const animFrame = Math.floor(globalTime * 2.2 + node.animOffset) % 4;
    const sprite = spriteAtlas.getNatureSprite(node.type, animFrame, variant);
    const wx = node.tileX * TILE_SIZE;
    const wy = node.tileY * TILE_SIZE;

    const isLargeTree =
      node.type === NatureNodeType.OAK_TREE ||
      node.type === NatureNodeType.HARDWOOD_TREE ||
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
    }

    const centerX = wx + TILE_SIZE / 2;
    const baseY = wy + TILE_SIZE + groundPadY;
    const drawX = Math.round(centerX - drawW / 2);
    const drawY = Math.round(baseY - drawH);

    // Directional Sun/Moon Dappled Ground Shadow scaled to the element's actual width
    const shadowW = Math.round(drawW * (isLargeTree ? 0.68 : 0.76));
    const shadowH = isLargeTree ? 9 : node.type === NatureNodeType.BERRY_BUSH ? 4 : 6;
    ctx.fillStyle = isLargeTree
      ? 'rgba(8, 12, 18, 0.32)'
      : 'rgba(8, 12, 18, 0.24)';
    ctx.fillRect(
      Math.round(centerX - shadowW / 2 + shadowDx),
      wy + TILE_SIZE - Math.round(shadowH * 0.65),
      shadowW,
      shadowH
    );

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

    if (node.hp < node.maxHp) {
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
      this.drawTilledSoilAndCrop(ctx, st, sx, sy, tileAnimFrame);
      return;
    }

    const sprite = spriteAtlas.getStructureSprite(st.type, tileAnimFrame);
    ctx.drawImage(sprite, sx, sy, TILE_SIZE, TILE_SIZE);

    if (
      st.type === PlaceableType.WOOD_FLOOR ||
      st.type === PlaceableType.STONE_FLOOR ||
      st.type === PlaceableType.BRICK_FLOOR
    ) {
      const trimDark =
        st.type === PlaceableType.WOOD_FLOOR
          ? '#43230d'
          : st.type === PlaceableType.BRICK_FLOOR
          ? '#451a03'
          : '#1e293b';
      const trimLight =
        st.type === PlaceableType.WOOD_FLOOR
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

  private drawTilledSoilAndCrop(
    ctx: CanvasRenderingContext2D,
    st: PlacedStructure,
    sx: number,
    sy: number,
    tileAnimFrame: number
  ): void {
    const isWatered = Boolean(st.isWatered || (st.waterLevel && st.waterLevel > 0));
    const isFertilized = Boolean(st.fertilized);
    const stage = st.growthStage ?? 0;
    const crop = st.cropType;

    // 1. Base Soil Furrows
    const baseColor = isWatered ? '#3b2314' : '#684428';
    const ridgeColor = isWatered ? '#28170c' : '#54341c';
    const highlightColor = isWatered ? '#4d2d18' : '#785030';

    ctx.fillStyle = baseColor;
    ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);

    // 4 horizontal plowed furrows & ridges
    for (let r = 2; r < TILE_SIZE - 2; r += 7) {
      ctx.fillStyle = ridgeColor;
      ctx.fillRect(sx + 1, sy + r, TILE_SIZE - 2, 4);
      ctx.fillStyle = highlightColor;
      ctx.fillRect(sx + 1, sy + r, TILE_SIZE - 2, 1);
    }

    // Wet moisture glistening effect
    if (isWatered) {
      ctx.fillStyle = 'rgba(96, 165, 250, 0.28)';
      ctx.fillRect(sx + 5, sy + 6, 2, 1);
      ctx.fillRect(sx + 19, sy + 13, 2, 1);
      ctx.fillRect(sx + 11, sy + 20, 2, 1);
      ctx.fillRect(sx + 25, sy + 24, 2, 1);
    }

    // Organic Bone Fertilizer Flecks
    if (isFertilized) {
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(sx + 4, sy + 8, 2, 1);
      ctx.fillRect(sx + 22, sy + 5, 1, 2);
      ctx.fillRect(sx + 14, sy + 18, 2, 1);
      ctx.fillRect(sx + 27, sy + 16, 1, 1);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(sx + 8, sy + 12, 1, 1);
      ctx.fillRect(sx + 18, sy + 25, 2, 1);
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

  private drawStructure(
    ctx: CanvasRenderingContext2D,
    world: WorldManager,
    st: PlacedStructure,
    globalTime: number,
    shadowDx: number,
    player?: PlayerState,
    creatures?: CreatureEntity[]
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

      if (st.hp < st.maxHp) {
        this.drawMiniBar(ctx, wx + TILE_SIZE / 2, wy - 16, st.hp / st.maxHp, '#38bdf8');
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

      if (st.hp < st.maxHp) {
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
    if (st.orientation === 'vertical') {
      ctx.translate(centerX, wy + TILE_SIZE / 2);
      ctx.scale(-1, 1);
      ctx.translate(-centerX, -(wy + TILE_SIZE / 2));
    }

    ctx.drawImage(sprite, drawX, drawY, drawW, drawH);
    ctx.restore();

    // C. Continuous Structure Ambient FX (Smoke, Embers, Sacred Rings, Fountain Ripples)
    this.drawStructureAmbientFx(ctx, st, wx, wy, drawY, globalTime);

    // D. Market Stall: Render displayed merchandise on counter, Owner Nameplate, and Customer Offer Exclamation (`!`)
    if (st.type === PlaceableType.MARKET_STALL) {
      const activeSlots = Array.isArray(st.stallSlots)
        ? st.stallSlots.filter((s) => s !== null && s.count > 0 && s.enabled)
        : [];

      // Draw up to 4 mini item icons displayed on the wooden market counter
      if (activeSlots.length > 0) {
        const displayCount = Math.min(4, activeSlots.length);
        const startX = centerX - (displayCount * 9) / 2;
        for (let i = 0; i < displayCount; i++) {
          const sl = activeSlots[i]!;
          const itemSprite = spriteAtlas.getItemCanvas(sl.itemId);
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

    // If Villagers are currently sleeping/inside this house and player is nearby, show a cozy occupied indicator
    if (creatures && player) {
      const sleepingInside = creatures.filter(
        (c) => c.isInsideHouse && c.homeHouseId === st.id && c.hp > 0
      );
      if (
        sleepingInside.length > 0 &&
        Math.hypot(player.x - centerX, player.y - (wy + 16)) <= 145
      ) {
        const names = sleepingInside.map((r) => r.name).join(' & ');
        const badgeText = `🏠 ${names} (Em Casa · Bata na Porta)`;
        ctx.save();
        ctx.font = 'bold 6.5px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        const bW = Math.max(88, badgeText.length * 3.8);
        ctx.fillStyle = 'rgba(10, 14, 23, 0.88)';
        ctx.fillRect(centerX - bW / 2, drawY - 14, bW, 12);
        ctx.fillStyle = '#fde047';
        ctx.fillText(badgeText, centerX, drawY - 6);
        ctx.restore();
      }
    }

    if (st.hp < st.maxHp) {
      this.drawMiniBar(
        ctx,
        centerX,
        Math.max(wy - 18, drawY - 5),
        st.hp / st.maxHp,
        '#38bdf8'
      );
    }
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
      st.type === PlaceableType.FURNACE ||
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
    const isVertical =
      st.orientation === 'vertical' && !hasE && !hasW;
    const storedCount = Array.isArray(st.storageSlots)
      ? st.storageSlots.filter((s) => s !== null && s.count > 0).length
      : 0;

    if (isVertical) {
      // North-South Vertical Profile Chest (16x24 waist-high profile)
      ctx.fillStyle = '#3b1d0a';
      ctx.fillRect(wx + 8, wy + 5, 16, 23);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(wx + 9, wy + 6, 14, 21);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(wx + 10, wy + 7, 9, 19);
      // Forged iron bands
      ctx.fillStyle = '#334155';
      ctx.fillRect(wx + 8, wy + 9, 16, 3);
      ctx.fillRect(wx + 8, wy + 21, 16, 3);
      // Golden side clasp
      ctx.fillStyle = '#facc15';
      ctx.fillRect(wx + 21, wy + 14, 4, 5);
      if (st.isOpen) {
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(wx + 11, wy + 8, 8, 15);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(wx + 13, wy + 11, 4, 7);
      }
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
   * Renders 16-state connected Walls, Windows, Fences, and Auto-Aligning Doors/Gates.
   * Walls and Doors are rendered with true 2.5D architectural elevation (42px tall, reaching well above the 26px player's head),
   * while Fences remain waist/chest-high (26px tall).
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

    // 1. AUTO-ALIGNING DOORS & GATES (WOOD_DOOR, IRON_GATE — Elevated 40px tall architectural portals)
    if (
      st.type === PlaceableType.WOOD_DOOR ||
      st.type === PlaceableType.IRON_GATE
    ) {
      const orient = world.getDoorOrientationAt(
        st.tileX,
        st.tileY,
        st.type,
        st.orientation
      );
      const isIron = st.type === PlaceableType.IRON_GATE;
      const isOpen = Boolean(st.isOpen);

      const postColor = isIron ? '#334155' : '#4a250d';
      const postTop = isIron ? '#94a3b8' : '#8c5327';
      const leafColor = isIron ? '#475569' : '#78350f';
      const leafHi = isIron ? '#cbd5e1' : '#b45309';

      // Threshold floor plate
      ctx.fillStyle = isIron ? 'rgba(30, 41, 59, 0.55)' : 'rgba(67, 35, 13, 0.55)';
      if (orient === 'horizontal') {
        ctx.fillRect(wx, wy + 14, TILE_SIZE, 10);
      } else {
        ctx.fillRect(wx + 11, wy, 10, TILE_SIZE);
      }

      if (orient === 'horizontal') {
        // Left & Right Tall Door Jamb Pillars (wy - 12 to wy + 28 = 40px tall)
        ctx.fillStyle = postColor;
        ctx.fillRect(wx, wy - 12, 7, 40);
        ctx.fillRect(wx + TILE_SIZE - 7, wy - 12, 7, 40);
        ctx.fillStyle = postTop;
        ctx.fillRect(wx, wy - 14, 7, 6);
        ctx.fillRect(wx + TILE_SIZE - 7, wy - 14, 7, 6);

        // Top Lintel Beam bridging the doorway above player head
        ctx.fillStyle = postColor;
        ctx.fillRect(wx + 5, wy - 13, TILE_SIZE - 10, 5);
        ctx.fillStyle = postTop;
        ctx.fillRect(wx + 5, wy - 14, TILE_SIZE - 10, 2);

        if (!isOpen) {
          // Closed Door / Gate spanning horizontally across the jambs (34px tall leaf)
          if (isIron) {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(wx + 6, wy - 6, TILE_SIZE - 12, 4);
            ctx.fillRect(wx + 6, wy + 12, TILE_SIZE - 12, 4);
            for (let bx = wx + 8; bx <= wx + TILE_SIZE - 10; bx += 4) {
              ctx.fillStyle = leafColor;
              ctx.fillRect(bx, wy - 9, 2, 34);
              ctx.fillStyle = '#facc15';
              ctx.fillRect(bx, wy - 11, 2, 2);
            }
          } else {
            ctx.fillStyle = leafColor;
            ctx.fillRect(wx + 6, wy - 9, TILE_SIZE - 12, 35);
            ctx.fillStyle = leafHi;
            ctx.fillRect(wx + 7, wy - 9, TILE_SIZE - 14, 6);
            // Iron hinges & golden handle
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(wx + 6, wy - 1, TILE_SIZE - 12, 2);
            ctx.fillRect(wx + 6, wy + 16, TILE_SIZE - 12, 2);
            ctx.fillStyle = '#facc15';
            ctx.fillRect(wx + 19, wy + 7, 3, 4);
          }
        } else {
          // Open Door Leaf swung 90 degrees upward/inward on left jamb
          ctx.fillStyle = leafColor;
          ctx.fillRect(wx + 5, wy - 18, 5, 28);
          ctx.fillStyle = leafHi;
          ctx.fillRect(wx + 6, wy - 18, 3, 5);
          // Subtle green passable indicator dot on threshold
          ctx.fillStyle = 'rgba(74, 222, 128, 0.55)';
          ctx.fillRect(wx + 14, wy + 16, 4, 4);
        }
      } else {
        // Vertical Door Orientation (North-South walls)
        ctx.fillStyle = postColor;
        ctx.fillRect(wx + 9, wy - 12, 14, 14);
        ctx.fillRect(wx + 9, wy + TILE_SIZE - 10, 14, 12);
        ctx.fillStyle = postTop;
        ctx.fillRect(wx + 9, wy - 14, 14, 5);
        ctx.fillRect(wx + 9, wy + TILE_SIZE - 12, 14, 5);

        if (!isOpen) {
          ctx.fillStyle = leafColor;
          ctx.fillRect(wx + 11, wy - 4, 10, TILE_SIZE - 2);
          ctx.fillStyle = leafHi;
          ctx.fillRect(wx + 12, wy - 4, 4, TILE_SIZE - 2);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(wx + 14, wy + 10, 3, 4);
        } else {
          // Swung open to the East
          ctx.fillStyle = leafColor;
          ctx.fillRect(wx + 18, wy - 4, 13, 8);
          ctx.fillStyle = leafHi;
          ctx.fillRect(wx + 18, wy - 4, 13, 3);
          ctx.fillStyle = 'rgba(74, 222, 128, 0.55)';
          ctx.fillRect(wx + 14, wy + 14, 4, 4);
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
      if (hasW) {
        ctx.fillStyle = railDark;
        ctx.fillRect(wx, wy + 8, 14, 4);
        ctx.fillRect(wx, wy + 17, 14, 4);
        ctx.fillStyle = railLight;
        ctx.fillRect(wx, wy + 8, 14, 2);
        ctx.fillRect(wx, wy + 17, 14, 2);
      }
      if (hasE) {
        ctx.fillStyle = railDark;
        ctx.fillRect(wx + 18, wy + 8, 14, 4);
        ctx.fillRect(wx + 18, wy + 17, 14, 4);
        ctx.fillStyle = railLight;
        ctx.fillRect(wx + 18, wy + 8, 14, 2);
        ctx.fillRect(wx + 18, wy + 17, 14, 2);
      }
      if (hasN) {
        ctx.fillStyle = railDark;
        ctx.fillRect(wx + 13, wy - 2, 6, 12);
        ctx.fillStyle = railLight;
        ctx.fillRect(wx + 14, wy - 2, 4, 12);
      }
      // Center Post (24px tall waist-high post)
      ctx.fillStyle = '#4a250d';
      ctx.fillRect(wx + 11, wy + 3, 10, 24);
      ctx.fillStyle = '#7c471e';
      ctx.fillRect(wx + 12, wy + 4, 8, 21);
      ctx.fillStyle = '#b87a3d';
      ctx.fillRect(wx + 11, wy + 1, 10, 4);
      if (hasS) {
        ctx.fillStyle = railDark;
        ctx.fillRect(wx + 13, wy + 18, 6, 14);
        ctx.fillStyle = railLight;
        ctx.fillRect(wx + 14, wy + 18, 4, 14);
      }
      return;
    }

    // 3. 16-STATE ARCHITECTURAL WALLS & WINDOWS (WOOD_WALL, STONE_WALL, BRICK_WALL, WOOD_WINDOW, STONE_WINDOW)
    // Elevated 2.5D height: wy - 14 to wy + 28 (42px total height — 1.6x player height!)
    const isStone =
      st.type === PlaceableType.STONE_WALL ||
      st.type === PlaceableType.STONE_WINDOW;
    const isBrick = st.type === PlaceableType.BRICK_WALL;
    const isWindow =
      st.type === PlaceableType.WOOD_WINDOW ||
      st.type === PlaceableType.STONE_WINDOW;

    const topCap = isBrick ? '#d97706' : isStone ? '#94a3b8' : '#b87a3d';
    const topInner = isBrick ? '#b45309' : isStone ? '#64748b' : '#8c5327';
    const faceMain = isBrick ? '#9a3412' : isStone ? '#475569' : '#653716';
    const faceDark = isBrick ? '#451a03' : isStone ? '#1e293b' : '#3d1f0a';

    // Ground shadow
    ctx.fillStyle = 'rgba(8, 12, 18, 0.32)';
    ctx.fillRect(
      wx + 2 + Math.round(shadowDx * 0.5),
      wy + TILE_SIZE - 4,
      TILE_SIZE - 4,
      6
    );

    // North Arm
    if (hasN) {
      ctx.fillStyle = faceDark;
      ctx.fillRect(wx + 7, wy - 16, 18, 22);
      ctx.fillStyle = topCap;
      ctx.fillRect(wx + 7, wy - 16, 18, 18);
      ctx.fillStyle = topInner;
      ctx.fillRect(wx + 9, wy - 16, 14, 16);
    }

    // West Arm
    if (hasW) {
      ctx.fillStyle = faceDark;
      ctx.fillRect(wx, wy - 14, 10, 42);
      ctx.fillStyle = faceMain;
      ctx.fillRect(wx, wy - 4, 10, 30);
      ctx.fillStyle = topCap;
      ctx.fillRect(wx, wy - 14, 10, 10);
      ctx.fillStyle = topInner;
      ctx.fillRect(wx, wy - 12, 10, 6);
    }

    // East Arm
    if (hasE) {
      ctx.fillStyle = faceDark;
      ctx.fillRect(wx + 22, wy - 14, 10, 42);
      ctx.fillStyle = faceMain;
      ctx.fillRect(wx + 22, wy - 4, 10, 30);
      ctx.fillStyle = topCap;
      ctx.fillRect(wx + 22, wy - 14, 10, 10);
      ctx.fillStyle = topInner;
      ctx.fillRect(wx + 22, wy - 12, 10, 6);
    }

    // Central Pillar / Core Segment (wy - 14 to wy + 28 = 42px tall)
    const coreX = hasW ? wx + 6 : wx + 3;
    const coreW = (hasW ? 20 : 23) + (hasE ? 0 : 3);
    ctx.fillStyle = faceDark;
    ctx.fillRect(coreX, wy - 14, coreW, 42);
    ctx.fillStyle = faceMain;
    ctx.fillRect(coreX + 1, wy - 4, coreW - 2, 30);

    // Brick / Stone / Timber 3-course texture details on elevated front face
    if (isBrick) {
      ctx.fillStyle = '#c2410c';
      ctx.fillRect(wx + 4, wy - 2, TILE_SIZE - 8, 6);
      ctx.fillRect(wx + 4, wy + 7, TILE_SIZE - 8, 6);
      ctx.fillRect(wx + 4, wy + 16, TILE_SIZE - 8, 6);
      ctx.fillStyle = '#fdba74';
      ctx.fillRect(wx + 4, wy + 5, TILE_SIZE - 8, 1);
      ctx.fillRect(wx + 4, wy + 14, TILE_SIZE - 8, 1);
      ctx.fillRect(wx + 4, wy + 23, TILE_SIZE - 8, 1);
    } else if (isStone) {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(wx + 5, wy - 2, 10, 8);
      ctx.fillRect(wx + 17, wy - 2, 10, 8);
      ctx.fillRect(wx + 8, wy + 8, 16, 8);
      ctx.fillRect(wx + 5, wy + 18, 11, 7);
      ctx.fillRect(wx + 18, wy + 18, 9, 7);
    } else {
      ctx.fillStyle = '#7c471e';
      ctx.fillRect(wx + 4, wy - 2, TILE_SIZE - 8, 6);
      ctx.fillRect(wx + 4, wy + 7, TILE_SIZE - 8, 6);
      ctx.fillRect(wx + 4, wy + 16, TILE_SIZE - 8, 6);
      // Horizontal iron binding straps
      ctx.fillStyle = '#334155';
      ctx.fillRect(coreX, wy + 4, coreW, 2);
      ctx.fillRect(coreX, wy + 21, coreW, 2);
    }

    // Window Glass & Mullion Frame if WOOD_WINDOW or STONE_WINDOW (at eye level on the 42px wall)
    if (isWindow) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(wx + 7, wy - 1, 18, 19);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(wx + 9, wy + 1, 6, 15);
      ctx.fillRect(wx + 17, wy + 1, 6, 15);
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(wx + 10, wy + 2, 2, 7);
      ctx.fillRect(wx + 18, wy + 2, 2, 7);
      // Horizontal mullion & Window Sill
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(wx + 8, wy + 8, 16, 2);
      ctx.fillStyle = topCap;
      ctx.fillRect(wx + 6, wy + 17, 20, 3);
    }

    // Roof Coping / Top Cap
    ctx.fillStyle = topCap;
    ctx.fillRect(coreX, wy - 14, coreW, 10);
    ctx.fillStyle = topInner;
    ctx.fillRect(coreX + 2, wy - 12, coreW - 4, 6);

    // South Arm (drawn last so it overlaps cleanly down toward the southern tile)
    if (hasS) {
      ctx.fillStyle = faceDark;
      ctx.fillRect(wx + 7, wy + 14, 18, 18);
      ctx.fillStyle = topCap;
      ctx.fillRect(wx + 7, wy - 6, 18, 34);
      ctx.fillStyle = topInner;
      ctx.fillRect(wx + 9, wy - 6, 14, 32);
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

    // Draw ghost of the structure with live continuity connections!
    ctx.globalAlpha = 0.68;
    const ghostSt: PlacedStructure = {
      id: 'ghost_preview',
      type: placeableType,
      itemId: '',
      tileX: targetBuildTile.tx,
      tileY: targetBuildTile.ty,
      hp: bp?.maxHp || 100,
      maxHp: bp?.maxHp || 100,
      solid: Boolean(bp?.hasHitbox),
      hitFlashTimer: 0,
      orientation: buildOptions?.orientation || 'auto',
      isOpen: false,
    };

    if (bp?.layer === 'GROUND' || placeableType === PlaceableType.SPIKE_TRAP) {
      this.drawGroundStructure(ctx, world, ghostSt, tileAnimFrame);
    } else {
      this.drawStructure(ctx, world, ghostSt, globalTime, 0);
    }

    // Tile border frame
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = canPlace ? '#4ade80' : '#f43f5e';
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
      const tagText = !canPlace
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
      ctx.fillStyle = !canPlace
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
    timeOfDay = 12
  ): void {
    const sprite = spriteAtlas.getCreatureSprite(
      cr.kind,
      cr.animFrame,
      cr.attackTimer > 0
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

    // Independent individual build (width) and stature (height) variation
    const wVar = isHumanoid
      ? 0.94 + ((uHash % 13) / 12) * 0.12 // 0.94x .. 1.06x for humanoids
      : 0.88 + ((uHash % 19) / 18) * 0.24; // 0.88x .. 1.12x for fauna/monsters
    const hVar = isHumanoid
      ? 0.94 + (((uHash >> 5) % 13) / 12) * 0.12
      : 0.88 + (((uHash >> 5) % 19) / 18) * 0.24;

    // Anatomically proportional base width & height relative to the player (30x30 canvas, ~26px body height)
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
      case 'CAMEL':
        // Tall, long-legged desert dromedary towering above player
        baseW = 44;
        baseH = 44;
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
      case 'ZOMBIE':
      case 'BANDIT':
      case 'VILLAGER':
      case 'WANDERER':
      default:
        // Humanoid stature matching the player character
        baseW = 26;
        baseH = 30;
        break;
    }

    const eliteScale = cr.isElite ? 1.18 : 1.0;
    const drawW = Math.round(baseW * wVar * eliteScale);
    const drawH = Math.round(baseH * hVar * eliteScale);
    const footY = cr.y + 10; // Ground contact anchor matching renderQueue ySort

    // Directional Ground Shadow scaled to actual creature width
    const shadowW = Math.round(drawW * 0.68);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
    ctx.fillRect(
      Math.round(cr.x - shadowW / 2 + shadowDx * 0.4),
      footY - 3,
      shadowW,
      4
    );

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
      ctx.ellipse(cr.x, footY - 2, drawW * 0.38, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const isCrMoving = Math.hypot(cr.vx, cr.vy) > 4;
    const walkBounce = isCrMoving
      ? Math.abs(Math.sin(globalTime * 10 + cr.x * 0.1)) * 2.0
      : 0;
    const breathScaleY = isCrMoving
      ? 1 + Math.sin(globalTime * 10 + cr.x * 0.1) * 0.035
      : 1 + Math.sin(globalTime * 3.2 + cr.x) * 0.022;
    const breathScaleX = 2 - breathScaleY;

    ctx.save();
    ctx.translate(cr.x, footY - walkBounce);
    if (cr.hitFlashTimer > 0) {
      ctx.filter = 'brightness(2.0) contrast(1.2)';
    }
    if (cr.direction === 'left') {
      ctx.scale(-breathScaleX, breathScaleY);
    } else {
      ctx.scale(breathScaleX, breathScaleY);
    }
    ctx.drawImage(sprite, -drawW / 2, -drawH + 2, drawW, drawH);
    ctx.restore();

    const headTopY = footY - drawH;

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

    if (cr.tamed) {
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
      ctx.fillText('♥', cr.x - 12, headTopY - 3 + heartPulse);
      ctx.fillStyle = '#fde047';
      ctx.fillText(
        cr.aiState === 'stay' ? '[Base]' : '[Aliado]',
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

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    player: PlayerState,
    globalTime: number,
    shadowDx: number
  ): void {
    const frame = player.isMoving ? player.animFrame : 0;
    const sprite = spriteAtlas.getPlayerSprite(
      player.direction,
      frame,
      player
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

    // Speed Buff / Astral Gear Afterimage Trail & Step Dust Puff when moving
    if (player.isMoving) {
      const puffPhase = (globalTime * 6) % 1;
      const puffX = player.x - Math.sign(player.vx || 0.1) * (6 + puffPhase * 8);
      const puffY = player.y + 8 - puffPhase * 3;
      ctx.fillStyle = `rgba(226, 212, 183, ${(0.45 * (1 - puffPhase)).toFixed(2)})`;
      ctx.fillRect(puffX - 2, puffY - 2, 3, 3);

      if ((player.speedBuffTimer || 0) > 0 || hasAstralGear) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.drawImage(
          sprite,
          player.x - player.vx * 0.055 - 15,
          player.y - player.vy * 0.055 - 19,
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

    // Directional Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.fillRect(player.x - 8 + Math.round(shadowDx * 0.4), player.y + 7, 16, 4);

    // Organic Walk Hop & Idle Breathing Squash-and-Stretch
    const walkHop = player.isMoving
      ? Math.abs(Math.sin(globalTime * 12)) * 1.8
      : 0;
    const breathScaleY = player.isMoving
      ? 1 + Math.sin(globalTime * 12) * 0.035
      : 1 + Math.sin(globalTime * 3.5) * 0.022;
    const breathScaleX = 2 - breathScaleY;

    ctx.save();
    ctx.translate(player.x, player.y - walkHop);
    ctx.scale(breathScaleX, breathScaleY);
    if (player.hitFlashTimer > 0) {
      ctx.filter = 'brightness(2.0)';
    }
    ctx.drawImage(sprite, -15, -19, 30, 30);
    ctx.restore();

    const slot = player.inventory[player.selectedHotbarIndex];
    if (slot) {
      const itemCanvas = spriteAtlas.getItemCanvas(slot.itemId);
      const isSwinging = player.swingTimer > 0;
      const swingProgress = isSwinging
        ? 1 - player.swingTimer / player.swingDuration
        : 0;

      let baseAngle = 0;
      let offsetX = 10;
      let offsetY = -2;
      if (player.direction === 'up') {
        baseAngle = -Math.PI / 2;
        offsetX = 8;
        offsetY = -10;
      } else if (player.direction === 'down') {
        baseAngle = Math.PI / 2;
        offsetX = -8;
        offsetY = 6;
      } else if (player.direction === 'left') {
        baseAngle = Math.PI;
        offsetX = -11;
        offsetY = 0;
      } else {
        baseAngle = 0;
        offsetX = 11;
        offsetY = 0;
      }

      ctx.save();
      ctx.translate(player.x + offsetX, player.y + offsetY);

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

        ctx.drawImage(itemCanvas, 0, -14, 22, 22);
      } else {
        const idleBob = player.isMoving
          ? Math.sin(player.animTimer * 12) * 1.5
          : Math.sin(globalTime * 3.5) * 0.6;
        ctx.drawImage(itemCanvas, -6, -10 + idleBob, 16, 16);
      }
      ctx.restore();
    }
  }

  private drawRemotePlayer(
    ctx: CanvasRenderingContext2D,
    rp: RemotePlayerState,
    globalTime: number,
    shadowDx: number
  ): void {
    const frame = rp.isMoving ? rp.animFrame : 0;
    const sprite = spriteAtlas.getPlayerSprite(
      rp.direction,
      frame,
      rp as unknown as PlayerState
    );

    // Subtle allied player ground aura ring
    ctx.save();
    ctx.strokeStyle = rp.isHost
      ? 'rgba(251, 191, 36, 0.5)'
      : 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(rp.x, rp.y + 8, 10, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Directional Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.fillRect(rp.x - 8 + Math.round(shadowDx * 0.4), rp.y + 7, 16, 4);

    const walkHop = rp.isMoving ? Math.abs(Math.sin(globalTime * 12)) * 1.8 : 0;
    const breathScaleY = rp.isMoving
      ? 1 + Math.sin(globalTime * 12) * 0.035
      : 1 + Math.sin(globalTime * 3.5) * 0.022;
    const breathScaleX = 2 - breathScaleY;

    ctx.save();
    ctx.translate(rp.x, rp.y - walkHop);
    ctx.scale(breathScaleX, breathScaleY);
    if (rp.hitFlashTimer > 0) {
      ctx.filter = 'brightness(2.0)';
    }
    ctx.drawImage(sprite, -15, -19, 30, 30);
    ctx.restore();

    if (rp.heldItemId && ITEMS[rp.heldItemId]) {
      const itemCanvas = spriteAtlas.getItemCanvas(rp.heldItemId);
      const isSwinging = rp.swingTimer > 0;
      const swingProgress = isSwinging
        ? 1 - rp.swingTimer / Math.max(0.1, rp.swingDuration)
        : 0;

      let baseAngle = 0;
      let offsetX = 10;
      let offsetY = -2;
      if (rp.direction === 'up') {
        baseAngle = -Math.PI / 2;
        offsetX = 8;
        offsetY = -10;
      } else if (rp.direction === 'down') {
        baseAngle = Math.PI / 2;
        offsetX = -8;
        offsetY = 6;
      } else if (rp.direction === 'left') {
        baseAngle = Math.PI;
        offsetX = -11;
        offsetY = 0;
      } else {
        baseAngle = 0;
        offsetX = 11;
        offsetY = 0;
      }

      ctx.save();
      ctx.translate(rp.x + offsetX, rp.y + offsetY);

      if (isSwinging) {
        const swingArc = (swingProgress - 0.5) * 2.2;
        ctx.rotate(baseAngle + swingArc);
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(0, 0, 20, -0.75, 0.65);
        ctx.stroke();
        ctx.drawImage(itemCanvas, 0, -14, 22, 22);
      } else {
        const idleBob = rp.isMoving
          ? Math.sin(rp.animTimer * 12) * 1.5
          : Math.sin(globalTime * 3.5) * 0.6;
        ctx.drawImage(itemCanvas, -6, -10 + idleBob, 16, 16);
      }
      ctx.restore();
    }

    // Overhead Name Tag, Role Badge, HP Bar & Chat Bubble
    const headTopY = rp.y - 22;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 7px "Plus Jakarta Sans", sans-serif';
    const badgeText = `${rp.isHost ? '👑 ' : '🌐 '}${rp.name} [NV.${rp.level || 1}]`;
    const boxW = Math.max(66, badgeText.length * 4.4 + 10);
    ctx.fillStyle = 'rgba(10, 14, 23, 0.85)';
    ctx.fillRect(rp.x - boxW / 2, headTopY - 14, boxW, 11);
    ctx.fillStyle = rp.isHost ? '#fde047' : '#38bdf8';
    ctx.fillText(badgeText, rp.x, headTopY - 6);

    if (rp.chatMessage && (rp.chatTimer || 0) > 0) {
      const chatText = `💬 ${rp.chatMessage}`;
      const chatW = Math.max(72, Math.min(180, chatText.length * 4.6 + 12));
      ctx.fillStyle = 'rgba(26, 17, 11, 0.94)';
      ctx.fillRect(rp.x - chatW / 2, headTopY - 28, chatW, 12);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.strokeRect(rp.x - chatW / 2, headTopY - 28, chatW, 12);
      ctx.fillStyle = '#fef08a';
      ctx.fillText(chatText, rp.x, headTopY - 20);
    }
    ctx.restore();

    if (rp.hp < rp.maxHp) {
      this.drawMiniBar(
        ctx,
        rp.x,
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
    halfH: number
  ): void {
    const isNight = timeOfDay >= 19.5 || timeOfDay < 5.5;
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

        if (biome === BiomeType.PLAINS) {
          if (isNight) {
            // Glowing Bioluminescent Firefly at Night
            const alpha = 0.35 + Math.abs(Math.sin(phase * 1.5)) * 0.65;
            ctx.fillStyle = `rgba(190, 242, 100, ${(alpha * 0.28).toFixed(2)})`;
            ctx.fillRect(px - 3, py - 3, 7, 7);
            ctx.fillStyle = `rgba(254, 240, 138, ${alpha.toFixed(2)})`;
            ctx.fillRect(px - 1, py - 1, 2, 2);
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

  private renderDayNightOverlay(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    timeOfDay: number,
    globalTime: number,
    lights: { x: number; y: number; radius: number; color: string }[],
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
      // 100% light (0% darkness) at the exact point of light (r = 0),
      // progressively fading out to 0% light (100% ambient darkness) at r.
      lCtx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < lights.length; i++) {
        const light = lights[i];
        const flicker = 1 + Math.sin(globalTime * 7.5 + i * 1.9) * 0.02;
        const { sx, sy } = camera.worldToScreen(light.x, light.y);
        const r = light.radius * camera.zoom * flicker;
        if (sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h) continue;

        const grad = lCtx.createRadialGradient(sx, sy, 0, sx, sy, r);
        grad.addColorStop(0.0, 'rgba(0, 0, 0, 1.0)');
        grad.addColorStop(0.15, 'rgba(0, 0, 0, 0.92)');
        grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.72)');
        grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.42)');
        grad.addColorStop(0.82, 'rgba(0, 0, 0, 0.14)');
        grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

        lCtx.fillStyle = grad;
        lCtx.beginPath();
        lCtx.arc(sx, sy, r, 0, Math.PI * 2);
        lCtx.fill();
      }
      lCtx.globalCompositeOperation = 'source-over';

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
