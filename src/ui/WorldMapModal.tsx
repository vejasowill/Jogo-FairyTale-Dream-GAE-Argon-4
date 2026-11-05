import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Crosshair,
  Eye,
  Layers,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Sparkles,
  Trash2,
  Trees,
  Users,
  X,
} from 'lucide-react';
import {
  BiomeType,
  CreatureEntity,
  CreatureKind,
  EcologicalZone,
  MapWaypoint,
  NatureNodeType,
  PlaceableType,
  PlacedStructure,
  PlayerAppearance,
  PlayerState,
} from '../game/core/types';
import { DEFAULT_PLAYER_APPEARANCE } from '../game/rendering/SpriteAtlas';
import { GameEngine } from '../game/loop/GameEngine';
import { CHUNK_SIZE, TILE_SIZE, WorldManager } from '../game/world/WorldManager';
import { WindowHelpButton, WindowHelpModal } from './UiTooltipAndHelp';

interface WorldMapModalProps {
  engine: GameEngine;
  world: WorldManager;
  player: PlayerState;
  tamedAnimals: CreatureEntity[];
  waypoints: MapWaypoint[];
  onClose: () => void;
}

interface PetCluster {
  kind: CreatureKind;
  pets: CreatureEntity[];
  avgTileX: number;
  avgTileY: number;
  screenX: number;
  screenY: number;
}

interface HoveredMapInfo {
  tileX: number;
  tileY: number;
  biomeLabel: string;
  distanceTiles: number;
  title?: string;
  subtitle?: string;
  badgeColor?: string;
}

const WAYPOINT_COLORS = [
  '#f59e0b',
  '#38bdf8',
  '#4ade80',
  '#f43f5e',
  '#c084fc',
  '#fde047',
];

function getBiomeDisplayName(biome?: BiomeType, zone?: EcologicalZone): string {
  if (biome === BiomeType.TAIGA_FOREST) return 'Floresta de Taiga';
  if (biome === BiomeType.TEMPERATE_FOREST) return 'Floresta Temperada';
  if (biome === BiomeType.FOREST) return 'Floresta Comum';
  if (biome === BiomeType.DESERT) {
    if (zone === EcologicalZone.DESERT_OASIS) return 'Oásis do Deserto';
    if (zone === EcologicalZone.CRYSTAL_BADLANDS) return ' Terras Cristalinas';
    return 'Deserto Solar';
  }
  if (biome === BiomeType.ISLAND) return 'Ilha Oceânica';
  if (biome === BiomeType.PLAINS) {
    if (zone === EcologicalZone.ROCKY_HIGHLANDS) return 'Colinas Rochosas';
    if (zone === EcologicalZone.MEADOW_CLEARING) return 'Campina Florida';
    if (zone === EcologicalZone.COASTAL_TROPICS) return 'Costa Tropical';
    return 'Planície Verdejante';
  }
  if (biome === BiomeType.OCEAN) {
    if (zone === EcologicalZone.SHALLOW_REEF) return 'Recife Raso';
    return 'Oceano Aberto';
  }
  return 'Território Desconhecido';
}

function getPetKindDisplayName(kind: CreatureKind): string {
  switch (kind) {
    case CreatureKind.HORSE:
      return 'Cavalo';
    case CreatureKind.CAMEL:
      return 'Camelo';
    case CreatureKind.SHEEP:
      return 'Ovelha';
    case CreatureKind.BOAR:
      return 'Javali';
    case CreatureKind.COW:
      return 'Vaca';
    default:
      return 'Mascote';
  }
}

/**
 * Draws a crisp miniature pixel-art character head on the map canvas,
 * reflecting the player's skin tone, hair style, hair color, eyes, and equipped headgear.
 */
function drawMiniPlayerHead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  appearance?: PlayerAppearance,
  headItemId?: string | null,
  borderColor = '#ffffff',
  isHost = false,
  scale = 1
): void {
  const app = appearance || DEFAULT_PLAYER_APPEARANCE;
  const skin = app.skinColor || '#fdba74';
  const hair = app.hairColor || '#451a03';
  const eyes = app.eyeColor || '#0284c7';
  const hairStyle = app.hairStyle || 'adventurer';

  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  ctx.scale(scale, scale);

  // Subtle drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.arc(0, 2, 9, 0, Math.PI * 2);
  ctx.fill();

  // Outer backing frame (squircle/shield around head)
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-8, -8, 16, 16);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(-7.5, -7.5, 15, 15);

  // Back hair layer for long / curly / ponytail styles
  if (
    hairStyle === 'long_mane' ||
    hairStyle === 'curly_crown' ||
    hairStyle === 'ponytail' ||
    hairStyle === 'braided' ||
    hairStyle === 'twin_tails' ||
    hairStyle === 'noble_waves'
  ) {
    ctx.fillStyle = hair;
    ctx.fillRect(-6, -5, 12, 11);
  }

  // Face skin base
  ctx.fillStyle = skin;
  ctx.fillRect(-5, -4, 10, 9);

  // Eyes (2x2 with white glint)
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-4, 0, 2, 2);
  ctx.fillRect(2, 0, 2, 2);
  ctx.fillStyle = eyes;
  ctx.fillRect(-3, 0, 1, 2);
  ctx.fillRect(2, 0, 1, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-4, 0, 1, 1);
  ctx.fillRect(3, 0, 1, 1);

  // Rosy cheek / nose detail
  ctx.fillStyle = 'rgba(244, 63, 94, 0.28)';
  ctx.fillRect(-4, 2, 2, 1);
  ctx.fillRect(2, 2, 2, 1);

  // Hair / Hat top layer
  if (headItemId === 'fiber_hat') {
    ctx.fillStyle = '#eab308';
    ctx.fillRect(-7, -5, 14, 3);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(-5, -7, 10, 3);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(-5, -5, 10, 1);
  } else if (headItemId === 'leather_hat') {
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-7, -5, 14, 3);
    ctx.fillStyle = '#9a5b25';
    ctx.fillRect(-5, -7, 10, 3);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-1, -5, 2, 1);
  } else if (headItemId === 'iron_helmet') {
    ctx.fillStyle = '#475569';
    ctx.fillRect(-6, -6, 12, 5);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-5, -6, 10, 2);
    ctx.fillRect(-1, -3, 2, 3);
  } else if (headItemId === 'gold_helmet' || headItemId === 'astral_crown') {
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-6, -6, 12, 4);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(-5, -7, 2, 2);
    ctx.fillRect(-1, -8, 2, 3);
    ctx.fillRect(3, -7, 2, 2);
    ctx.fillStyle = headItemId === 'astral_crown' ? '#38bdf8' : '#ef4444';
    ctx.fillRect(-1, -5, 2, 2);
  } else if (headItemId === 'crystal_helmet') {
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(-6, -6, 12, 5);
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(-4, -7, 8, 3);
  } else {
    ctx.fillStyle = hair;
    ctx.fillRect(-5, -6, 10, 3);
    if (hairStyle === 'adventurer' || hairStyle === 'valkyrie_bangs') {
      ctx.fillRect(-6, -5, 3, 3);
      ctx.fillRect(3, -5, 3, 2);
    } else if (hairStyle === 'warrior_crest') {
      ctx.fillRect(-5, -7, 2, 2);
      ctx.fillRect(-1, -8, 3, 2);
      ctx.fillRect(3, -7, 2, 2);
    } else if (hairStyle === 'curly_crown') {
      ctx.fillRect(-6, -6, 12, 4);
    } else {
      ctx.fillRect(-6, -5, 2, 6);
      ctx.fillRect(4, -5, 2, 6);
    }
  }

  // Host crown indicator on top if online host
  if (isHost) {
    ctx.fillStyle = '#1f1209';
    ctx.fillRect(-5, -12, 10, 4);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(-4, -11, 8, 3);
    ctx.fillRect(-4, -12, 2, 1);
    ctx.fillRect(-1, -12, 2, 1);
    ctx.fillRect(2, -12, 2, 1);
  }

  ctx.restore();
}

/**
 * Draws a miniature pixel-art animal head for a pet or pet cluster,
 * plus an optional numeric counter badge when multiple of the same pet are clustered.
 */
function drawMiniPetHead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  kind: CreatureKind,
  count: number,
  isSelected = false
): void {
  const x = Math.round(cx);
  const y = Math.round(cy);

  ctx.save();

  // 1. Heatmap thermal glow when multiple pets of the same kind are gathered together
  if (count > 1) {
    const heatRadius = Math.min(34, 14 + count * 3.5);
    const grad = ctx.createRadialGradient(x, y, 2, x, y, heatRadius);
    if (count >= 5) {
      grad.addColorStop(0, 'rgba(254, 240, 138, 0.85)');
      grad.addColorStop(0.35, 'rgba(244, 63, 94, 0.65)');
      grad.addColorStop(0.7, 'rgba(234, 88, 12, 0.35)');
      grad.addColorStop(1, 'rgba(234, 88, 12, 0)');
    } else if (count >= 3) {
      grad.addColorStop(0, 'rgba(253, 224, 71, 0.78)');
      grad.addColorStop(0.45, 'rgba(249, 115, 22, 0.52)');
      grad.addColorStop(1, 'rgba(249, 115, 22, 0)');
    } else {
      grad.addColorStop(0, 'rgba(251, 191, 36, 0.72)');
      grad.addColorStop(0.55, 'rgba(245, 158, 11, 0.38)');
      grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, heatRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.translate(x, y);

  // Backing medallion
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(-7, -7, 14, 14);
  ctx.strokeStyle = isSelected
    ? '#fde047'
    : count >= 4
    ? '#fb7185'
    : count > 1
    ? '#fbbf24'
    : '#4ade80';
  ctx.lineWidth = isSelected ? 1.8 : 1.2;
  ctx.strokeRect(-6.5, -6.5, 13, 13);

  // Species-specific pixel-art head
  if (kind === CreatureKind.HORSE) {
    // Ears
    ctx.fillStyle = '#451a03';
    ctx.fillRect(-4, -6, 2, 2);
    ctx.fillRect(2, -6, 2, 2);
    // Chestnut head & dark mane
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-4, -4, 8, 7);
    ctx.fillStyle = '#9a3412';
    ctx.fillRect(-3, -4, 6, 5);
    // White forehead blaze
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-1, -3, 2, 5);
    // Muzzle
    ctx.fillStyle = '#d6d3d1';
    ctx.fillRect(-3, 2, 6, 3);
    // Eyes
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-4, -1, 1, 2);
    ctx.fillRect(3, -1, 1, 2);
  } else if (kind === CreatureKind.CAMEL) {
    // Rounded desert ears
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-5, -5, 2, 2);
    ctx.fillRect(3, -5, 2, 2);
    // Sandy head
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-4, -4, 8, 7);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-3, -4, 6, 5);
    // Broad camel snout
    ctx.fillStyle = '#92400e';
    ctx.fillRect(-3, 1, 6, 4);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(-2, 1, 4, 2);
    // Eyes
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-3, -1, 1, 2);
    ctx.fillRect(2, -1, 1, 2);
  } else if (kind === CreatureKind.SHEEP) {
    // Fluffy white wool head puff & ears
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-5, -5, 10, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-4, -6, 8, 4);
    // Dark ears & face
    ctx.fillStyle = '#334155';
    ctx.fillRect(-6, -2, 2, 2);
    ctx.fillRect(4, -2, 2, 2);
    ctx.fillRect(-3, -1, 6, 5);
    // Pink nose & eyes
    ctx.fillStyle = '#fda4af';
    ctx.fillRect(-1, 2, 2, 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-3, 0, 1, 1);
    ctx.fillRect(2, 0, 1, 1);
  } else if (kind === CreatureKind.BOAR) {
    // Bristled dark brown head
    ctx.fillStyle = '#27170b';
    ctx.fillRect(-5, -5, 10, 9);
    ctx.fillStyle = '#451a03';
    ctx.fillRect(-4, -4, 8, 7);
    // White tusks
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-5, 1, 2, 3);
    ctx.fillRect(3, 1, 2, 3);
    // Pink snout
    ctx.fillStyle = '#f472b6';
    ctx.fillRect(-3, 1, 6, 3);
    ctx.fillStyle = '#831843';
    ctx.fillRect(-2, 2, 1, 1);
    ctx.fillRect(1, 2, 1, 1);
    // Fierce eyes
    ctx.fillStyle = '#fde047';
    ctx.fillRect(-3, -1, 1, 1);
    ctx.fillRect(2, -1, 1, 1);
  } else {
    // COW (Vaca): Curved horns + black & white spotted head + pink muzzle
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(-6, -6, 2, 3);
    ctx.fillRect(4, -6, 2, 3);
    // Head base
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-4, -4, 8, 6);
    // Black spots
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-4, -4, 4, 3);
    ctx.fillRect(1, -2, 3, 3);
    // Pink muzzle
    ctx.fillStyle = '#fda4af';
    ctx.fillRect(-4, 1, 8, 4);
    ctx.fillStyle = '#9f1239';
    ctx.fillRect(-2, 2, 1, 1);
    ctx.fillRect(1, 2, 1, 1);
    // Eyes
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-3, -1, 1, 1);
    ctx.fillRect(2, -1, 1, 1);
  }

  // 2. Numeric counter badge when multiple pets of the same kind are clustered here
  if (count > 1) {
    const label = `${count}`;
    ctx.font = 'bold 8px "Silkscreen", "Plus Jakarta Sans", monospace';
    const bw = Math.max(11, ctx.measureText(label).width + 5);
    const bh = 10;
    const bx = 3;
    const by = -11;

    ctx.fillStyle = count >= 5 ? '#e11d48' : '#d97706';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label, bx + bw / 2, by + 7.5);
  }

  ctx.restore();
}

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  engine,
  world,
  player,
  tamedAnimals,
  waypoints,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(5);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showNature, setShowNature] = useState(true);
  const [showStructures, setShowStructures] = useState(true);
  const [showPets, setShowPets] = useState(true);
  const [showWaypoints, setShowWaypoints] = useState(true);
  const [newWaypointName, setNewWaypointName] = useState('');
  const [newWaypointColor, setNewWaypointColor] = useState(WAYPOINT_COLORS[0]);
  const [selectedTile, setSelectedTile] = useState<{ tx: number; ty: number } | null>(
    null
  );
  const [hoveredInfo, setHoveredInfo] = useState<HoveredMapInfo | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [remoteTick, setRemoteTick] = useState(0);

  useEffect(() => {
    if (!engine.multiplayer.isOnline) return;
    const id = window.setInterval(() => {
      setRemoteTick((t) => t + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, [engine.multiplayer.isOnline]);

  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    pointerDownX: number;
    pointerDownY: number;
  }>({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    pointerDownX: 0,
    pointerDownY: 0,
  });

  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map()
  );
  const pinchStateRef = useRef<{
    active: boolean;
    initialDist: number;
    initialZoom: number;
  }>({
    active: false,
    initialDist: 0,
    initialZoom: 4,
  });

  const playerTx = Math.floor(player.x / TILE_SIZE);
  const playerTy = Math.floor(player.y / TILE_SIZE);
  const remotePlayersList = Array.from(engine.multiplayer.remotePlayers.values());

  // Cluster tamed pets of the SAME species (CreatureKind) when they are close together
  const petClusters = useMemo(() => {
    const canvas = canvasRef.current;
    const w = canvas ? canvas.width : 640;
    const h = canvas ? canvas.height : 380;
    const centerX = w / 2 + pan.x;
    const centerY = h / 2 + pan.y;

    // Proximity threshold in screen pixels (merges overlapping/adjacent same-type pets)
    const clusterThresholdPx = 18;
    const byKind = new Map<CreatureKind, CreatureEntity[]>();
    for (const pet of tamedAnimals) {
      if (pet.hp <= 0) continue;
      const list = byKind.get(pet.kind) || [];
      list.push(pet);
      byKind.set(pet.kind, list);
    }

    const clusters: PetCluster[] = [];
    for (const [kind, list] of byKind.entries()) {
      const visited = new Set<string>();
      for (let i = 0; i < list.length; i++) {
        const seed = list[i];
        if (visited.has(seed.id)) continue;
        visited.add(seed.id);

        const group: CreatureEntity[] = [seed];
        let sumTx = seed.x / TILE_SIZE;
        let sumTy = seed.y / TILE_SIZE;

        // Iterative greedy clustering for same-species pets in the same area
        let added = true;
        while (added) {
          added = false;
          const curAvgTx = sumTx / group.length;
          const curAvgTy = sumTy / group.length;
          const curSx = centerX + (curAvgTx - playerTx) * zoom;
          const curSy = centerY + (curAvgTy - playerTy) * zoom;

          for (let j = 0; j < list.length; j++) {
            const candidate = list[j];
            if (visited.has(candidate.id)) continue;
            const candTx = candidate.x / TILE_SIZE;
            const candTy = candidate.y / TILE_SIZE;
            const candSx = centerX + (candTx - playerTx) * zoom;
            const candSy = centerY + (candTy - playerTy) * zoom;

            if (
              Math.hypot(candSx - curSx, candSy - curSy) <= clusterThresholdPx
            ) {
              visited.add(candidate.id);
              group.push(candidate);
              sumTx += candTx;
              sumTy += candTy;
              added = true;
            }
          }
        }

        const avgTileX = sumTx / group.length;
        const avgTileY = sumTy / group.length;
        clusters.push({
          kind,
          pets: group,
          avgTileX,
          avgTileY,
          screenX: centerX + (avgTileX - playerTx) * zoom,
          screenY: centerY + (avgTileY - playerTy) * zoom,
        });
      }
    }
    return clusters;
  }, [tamedAnimals, pan.x, pan.y, zoom, playerTx, playerTy]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    const w = canvas.width;
    const h = canvas.height;

    // Deep cartographic void background
    ctx.fillStyle = '#080604';
    ctx.fillRect(0, 0, w, h);

    const centerX = w / 2 + pan.x;
    const centerY = h / 2 + pan.y;
    const cellSize = Math.max(1, Math.ceil(zoom));

    // Subtle chunk coordinate grid in unexplored background
    ctx.strokeStyle = 'rgba(74, 48, 30, 0.16)';
    ctx.lineWidth = 1;
    const gridStep = CHUNK_SIZE * zoom;
    const offsetX = ((centerX % gridStep) + gridStep) % gridStep;
    const offsetY = ((centerY % gridStep) + gridStep) % gridStep;
    for (let x = offsetX; x < w; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(Math.floor(x) + 0.5, 0);
      ctx.lineTo(Math.floor(x) + 0.5, h);
      ctx.stroke();
    }
    for (let y = offsetY; y < h; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, Math.floor(y) + 0.5);
      ctx.lineTo(w, Math.floor(y) + 0.5);
      ctx.stroke();
    }

    const exploredChunks = Object.values(world.chunks).filter((c) => {
      if (!c) return false;
      const chunkLeft = centerX + (c.cx * CHUNK_SIZE - playerTx) * zoom;
      const chunkTop = centerY + (c.cy * CHUNK_SIZE - playerTy) * zoom;
      if (
        chunkLeft + CHUNK_SIZE * zoom < -24 ||
        chunkLeft > w + 24 ||
        chunkTop + CHUNK_SIZE * zoom < -24 ||
        chunkTop > h + 24
      ) {
        return false;
      }
      return Boolean(c.compactExplored) || c.explored.some((e) => e === 1);
    });

    // =========================================================================
    // PASS 1: TRUE MINIATURE BIOME & SUB-ZONE TERRAIN + SHORELINE CONTOURS
    // =========================================================================
    for (const chunk of exploredChunks) {

      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const idx = ly * CHUNK_SIZE + lx;
          if (chunk.explored[idx] !== 1) continue;

          const tx = chunk.cx * CHUNK_SIZE + lx;
          const ty = chunk.cy * CHUNK_SIZE + ly;

          const sx = Math.floor(centerX + (tx - playerTx) * zoom);
          const sy = Math.floor(centerY + (ty - playerTy) * zoom);
          if (sx + cellSize < 0 || sx > w || sy + cellSize < 0 || sy > h) {
            continue;
          }

          const biome = chunk.tiles[idx];
          const zone = chunk.ecologicalZones?.[idx];
          const sub = world.getTileSubZone(tx, ty, biome);

          let tileColor = '#174e75';
          if (biome === BiomeType.TAIGA_FOREST) {
            tileColor =
              sub === 0 ? '#19423a' : sub === 2 ? '#275c51' : '#204e45';
          } else if (biome === BiomeType.TEMPERATE_FOREST) {
            tileColor =
              sub === 0 ? '#14381d' : sub === 2 ? '#21522d' : '#1a4525';
          } else if (biome === BiomeType.FOREST) {
            tileColor =
              sub === 0 ? '#235924' : sub === 2 ? '#347833' : '#2b682c';
          } else if (biome === BiomeType.DESERT) {
            if (zone === EcologicalZone.DESERT_OASIS) {
              tileColor = '#32965d';
            } else if (zone === EcologicalZone.CRYSTAL_BADLANDS) {
              tileColor = sub === 0 ? '#bd7d2c' : '#d1943f';
            } else {
              tileColor =
                sub === 0 ? '#cfa85b' : sub === 2 ? '#c79a4c' : '#dcbd6c';
            }
          } else if (biome === BiomeType.ISLAND) {
            tileColor =
              zone === EcologicalZone.COASTAL_TROPICS || sub === 1
                ? '#e8cc7d'
                : '#358c44';
          } else if (biome === BiomeType.PLAINS) {
            if (zone === EcologicalZone.COASTAL_TROPICS) {
              tileColor = '#ebd286';
            } else if (zone === EcologicalZone.ROCKY_HIGHLANDS) {
              tileColor = '#5b6e46';
            } else if (zone === EcologicalZone.MEADOW_CLEARING) {
              tileColor = '#4e9646';
            } else {
              tileColor =
                sub === 0 ? '#36783c' : sub === 2 ? '#598538' : '#41853c';
            }
          } else {
            // OCEAN depth & reef shading
            if (zone === EcologicalZone.SHALLOW_REEF) {
              tileColor = '#2482b5';
            } else {
              tileColor =
                sub === 0 ? '#1b628f' : sub === 2 ? '#0f3c5c' : '#154e75';
            }
          }

          ctx.fillStyle = tileColor;
          ctx.fillRect(sx, sy, cellSize, cellSize);

          // Miniature coastal shoreline highlight where land meets water
          if (zoom >= 3 && biome !== BiomeType.OCEAN) {
            const nOcean = world.getTileBiomeFast(tx, ty - 1) === BiomeType.OCEAN;
            const sOcean = world.getTileBiomeFast(tx, ty + 1) === BiomeType.OCEAN;
            const wOcean = world.getTileBiomeFast(tx - 1, ty) === BiomeType.OCEAN;
            const eOcean = world.getTileBiomeFast(tx + 1, ty) === BiomeType.OCEAN;
            if (nOcean || sOcean || wOcean || eOcean) {
              const rim = Math.max(1, Math.floor(zoom * 0.25));
              ctx.fillStyle = '#e6cf8b';
              if (nOcean) ctx.fillRect(sx, sy, cellSize, rim);
              if (sOcean) ctx.fillRect(sx, sy + cellSize - rim, cellSize, rim);
              if (wOcean) ctx.fillRect(sx, sy, rim, cellSize);
              if (eOcean) ctx.fillRect(sx + cellSize - rim, sy, rim, cellSize);
            }
          }
        }
      }
    }

    // =========================================================================
    // PASS 2: MINIATURE GROUND STRUCTURES (Floors, Paths, Bridges, Tilled Crops)
    // =========================================================================
    if (showStructures) {
      for (const chunk of exploredChunks) {
        for (const gst of chunk.structures) {
          const lx = ((gst.tileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const ly = ((gst.tileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          if (chunk.explored[ly * CHUNK_SIZE + lx] !== 1) continue;

          const sx = Math.floor(centerX + (gst.tileX - playerTx) * zoom);
          const sy = Math.floor(centerY + (gst.tileY - playerTy) * zoom);
          if (sx + cellSize < 0 || sx > w || sy + cellSize < 0 || sy > h) {
            continue;
          }

          if (gst.type === PlaceableType.WOOD_FLOOR) {
            ctx.fillStyle = '#92400e';
            ctx.fillRect(sx, sy, cellSize, cellSize);
            if (cellSize >= 4) {
              ctx.fillStyle = '#b45309';
              ctx.fillRect(sx + 1, sy + 1, cellSize - 2, Math.max(1, Math.floor(cellSize * 0.4)));
            }
          } else if (gst.type === PlaceableType.DARK_OAK_FLOOR) {
            ctx.fillStyle = '#2b170b';
            ctx.fillRect(sx, sy, cellSize, cellSize);
            if (cellSize >= 4) {
              ctx.fillStyle = '#4a2c16';
              ctx.fillRect(sx + 1, sy + 1, cellSize - 2, Math.max(1, Math.floor(cellSize * 0.4)));
            }
          } else if (gst.type === PlaceableType.PINE_FLOOR) {
            ctx.fillStyle = '#b88c56';
            ctx.fillRect(sx, sy, cellSize, cellSize);
            if (cellSize >= 4) {
              ctx.fillStyle = '#e2be8a';
              ctx.fillRect(sx + 1, sy + 1, cellSize - 2, Math.max(1, Math.floor(cellSize * 0.4)));
            }
          } else if (gst.type === PlaceableType.STONE_FLOOR) {
            ctx.fillStyle = '#64748b';
            ctx.fillRect(sx, sy, cellSize, cellSize);
            if (cellSize >= 4) {
              ctx.fillStyle = '#94a3b8';
              ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
            }
          } else if (gst.type === PlaceableType.BRICK_FLOOR) {
            ctx.fillStyle = '#991b1b';
            ctx.fillRect(sx, sy, cellSize, cellSize);
            if (cellSize >= 4) {
              ctx.fillStyle = '#dc2626';
              ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
            }
          } else if (gst.type === PlaceableType.ROYAL_CARPET) {
            ctx.fillStyle = '#b91c1c';
            ctx.fillRect(sx, sy, cellSize, cellSize);
            if (cellSize >= 4) {
              ctx.fillStyle = '#facc15';
              ctx.fillRect(
                sx + Math.floor(cellSize * 0.3),
                sy + Math.floor(cellSize * 0.3),
                Math.max(1, Math.ceil(cellSize * 0.4)),
                Math.max(1, Math.ceil(cellSize * 0.4))
              );
            }
          } else if (gst.type === PlaceableType.DIRT_PATH) {
            const pad = cellSize >= 5 ? 1 : 0;
            ctx.fillStyle = '#8c6642';
            ctx.fillRect(
              sx + pad,
              sy + pad,
              Math.max(1, cellSize - pad * 2),
              Math.max(1, cellSize - pad * 2)
            );
          } else if (gst.type === PlaceableType.WOOD_BRIDGE) {
            ctx.fillStyle = '#78350f';
            ctx.fillRect(sx, sy, cellSize, cellSize);
            ctx.fillStyle = '#d97706';
            ctx.fillRect(
              sx,
              sy + Math.floor(cellSize * 0.2),
              cellSize,
              Math.max(1, Math.ceil(cellSize * 0.6))
            );
          } else if (gst.type === PlaceableType.TILLED_SOIL) {
            ctx.fillStyle = gst.isWatered ? '#3b2110' : '#5c3a1e';
            ctx.fillRect(sx, sy, cellSize, cellSize);
            if (gst.cropType) {
              const cropDot = Math.max(2, Math.floor(cellSize * 0.55));
              const off = Math.floor((cellSize - cropDot) / 2);
              ctx.fillStyle =
                gst.cropType === 'wheat'
                  ? '#facc15'
                  : gst.cropType === 'carrot'
                  ? '#f97316'
                  : gst.cropType === 'medic_herb'
                  ? '#2dd4bf'
                  : gst.cropType === 'solar_bloom'
                  ? '#fde047'
                  : '#ef4444';
              ctx.fillRect(sx + off, sy + off, cropDot, cropDot);
            }
          }
        }
      }
    }

    // =========================================================================
    // PASS 3: MINIATURE NATURE ELEMENTS (Trees, Rocks, Ores, Crystals, Bushes)
    // =========================================================================
    if (showNature) {
      for (const chunk of exploredChunks) {
        for (const node of chunk.nodes) {
          const lx = ((node.tileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const ly = ((node.tileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          if (chunk.explored[ly * CHUNK_SIZE + lx] !== 1) continue;

          const cx = Math.floor(centerX + (node.tileX + 0.5 - playerTx) * zoom);
          const cy = Math.floor(centerY + (node.tileY + 0.5 - playerTy) * zoom);
          if (cx < -12 || cx > w + 12 || cy < -12 || cy > h + 12) continue;

          if (node.type === NatureNodeType.OAK_TREE) {
            const r = Math.max(2, Math.round(zoom * 0.65));
            ctx.fillStyle = '#092212';
            ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
            ctx.fillStyle = '#16a34a';
            ctx.fillRect(cx - r + 1, cy - r + 1, Math.max(1, r * 2 - 2), Math.max(1, r * 2 - 2));
            if (r >= 3) {
              ctx.fillStyle = '#4ade80';
              ctx.fillRect(cx - r + 1, cy - r + 1, Math.max(1, r - 1), Math.max(1, r - 1));
            }
          } else if (node.type === NatureNodeType.TEMPERATE_TREE) {
            // Carvalho Escuro: Copa densa e grande verde-esmeralda escuro
            const r = Math.max(2, Math.round(zoom * 0.78));
            ctx.fillStyle = '#021a12';
            ctx.fillRect(cx - r, cy - r, r * 2 + 1, r * 2 + 1);
            ctx.fillStyle = '#064e3b';
            ctx.fillRect(cx - r + 1, cy - r + 1, Math.max(2, r * 2 - 1), Math.max(2, r * 2 - 1));
            if (r >= 3) {
              ctx.fillStyle = '#10b981';
              ctx.fillRect(cx - r + 2, cy - r + 2, Math.max(1, r - 1), Math.max(1, r - 1));
            }
          } else if (node.type === NatureNodeType.PINE_TREE) {
            // Pinheiro de Taiga: Silhueta cônica boreal verde-azulada
            const isSmall = (node.variant ?? 0) === 1;
            const r = Math.max(2, Math.round(zoom * (isSmall ? 0.52 : 0.7)));
            ctx.fillStyle = '#042f2e';
            ctx.beginPath();
            ctx.moveTo(cx, cy - r - 1);
            ctx.lineTo(cx + r, cy + r);
            ctx.lineTo(cx - r, cy + r);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#0d9488';
            ctx.fillRect(cx - Math.max(1, r - 2), cy - Math.max(1, r - 2), Math.max(2, r), Math.max(2, r));
          } else if (node.type === NatureNodeType.HARDWOOD_TREE) {
            const r = Math.max(2, Math.round(zoom * 0.7));
            ctx.fillStyle = '#451a03';
            ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
            ctx.fillStyle = '#ea580c';
            ctx.fillRect(cx - r + 1, cy - r + 1, Math.max(1, r * 2 - 2), Math.max(1, r * 2 - 2));
            if (r >= 3) {
              ctx.fillStyle = '#fbbf24';
              ctx.fillRect(cx - r + 1, cy - r + 1, Math.max(1, r - 1), Math.max(1, r - 1));
            }
          } else if (node.type === NatureNodeType.ANCIENT_WORLD_TREE) {
            const r = Math.max(4, Math.round(zoom * 1.1));
            ctx.fillStyle = '#022c22';
            ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
            ctx.fillStyle = '#10b981';
            ctx.fillRect(cx - r + 1, cy - r + 1, r * 2 - 2, r * 2 - 2);
            ctx.fillStyle = '#fde047';
            ctx.fillRect(cx - 1, cy - 1, 3, 3);
          } else if (node.type === NatureNodeType.PALM_TREE) {
            const r = Math.max(2, Math.round(zoom * 0.58));
            ctx.fillStyle = '#15803d';
            ctx.fillRect(cx - r, cy - 1, r * 2 + 1, 3);
            ctx.fillRect(cx - 1, cy - r, 3, r * 2 + 1);
            ctx.fillStyle = '#84cc16';
            ctx.fillRect(cx - 1, cy - 1, 2, 2);
          } else if (node.type === NatureNodeType.CACTUS) {
            const s = Math.max(2, Math.round(zoom * 0.42));
            ctx.fillStyle = '#15803d';
            ctx.fillRect(cx - Math.floor(s / 2), cy - Math.floor(s / 2), s, s);
          } else if (node.type === NatureNodeType.BERRY_BUSH) {
            const s = Math.max(2, Math.round(zoom * 0.45));
            ctx.fillStyle = '#166534';
            ctx.fillRect(cx - Math.floor(s / 2), cy - Math.floor(s / 2), s, s);
            if (zoom >= 4) {
              ctx.fillStyle = '#ef4444';
              ctx.fillRect(cx, cy, 1, 1);
            }
          } else if (node.type === NatureNodeType.BOULDER) {
            const s = Math.max(2, Math.round(zoom * 0.55));
            ctx.fillStyle = '#334155';
            ctx.fillRect(cx - Math.floor(s / 2), cy - Math.floor(s / 2), s, s);
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(
              cx - Math.floor(s / 2),
              cy - Math.floor(s / 2),
              Math.max(1, s - 1),
              Math.max(1, s - 1)
            );
          } else if (node.type === NatureNodeType.IRON_OUTCROP) {
            const s = Math.max(2, Math.round(zoom * 0.6));
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(cx - Math.floor(s / 2), cy - Math.floor(s / 2), s, s);
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(
              cx - Math.floor(s / 2) + 1,
              cy - Math.floor(s / 2) + 1,
              Math.max(1, s - 2),
              Math.max(1, s - 2)
            );
          } else if (
            node.type === NatureNodeType.DESERT_CRYSTAL ||
            node.type === NatureNodeType.SUNSTONE_OBELISK ||
            node.type === NatureNodeType.PEARL_CLAM
          ) {
            const s = Math.max(3, Math.round(zoom * 0.68));
            ctx.fillStyle =
              node.type === NatureNodeType.DESERT_CRYSTAL ? '#f59e0b' : '#0284c7';
            ctx.fillRect(cx - Math.floor(s / 2), cy - Math.floor(s / 2), s, s);
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(cx, cy, Math.max(1, Math.floor(s * 0.4)), Math.max(1, Math.floor(s * 0.4)));
          }
        }
      }
    }

    // =========================================================================
    // PASS 4: MINIATURE ARCHITECTURAL CONSTRUCTIONS (True Colors & Materials, NO Names)
    // =========================================================================
    if (showStructures) {
      for (const chunk of exploredChunks) {
        for (const st of chunk.structures) {
          const lx = ((st.tileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const ly = ((st.tileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          if (chunk.explored[ly * CHUNK_SIZE + lx] !== 1) continue;

          const sx = Math.floor(centerX + (st.tileX - playerTx) * zoom);
          const sy = Math.floor(centerY + (st.tileY - playerTy) * zoom);
          if (sx + cellSize * 2 < 0 || sx > w + cellSize || sy + cellSize * 2 < 0 || sy > h + cellSize) {
            continue;
          }

          const drawMiniWallSegment = (
            stObj: PlacedStructure,
            outerHex: string,
            innerHex: string,
            windowHex?: string
          ) => {
            const mask = world.getStructureConnectionMask(
              stObj.tileX,
              stObj.tileY,
              stObj.type
            );
            const hasN = (mask & 1) !== 0;
            const hasE = (mask & 2) !== 0;
            const hasS = (mask & 4) !== 0;
            const hasW = (mask & 8) !== 0;
            const isVertOnly = (hasN || hasS) && !hasE && !hasW;

            if (isVertOnly && cellSize >= 3) {
              const vw = Math.max(2, Math.floor(cellSize * 0.48));
              const vx = sx + Math.floor((cellSize - vw) / 2);
              ctx.fillStyle = outerHex;
              ctx.fillRect(vx, sy, vw, cellSize);
              ctx.fillStyle = innerHex;
              ctx.fillRect(vx + 1, sy, Math.max(1, vw - 1), cellSize);
            } else {
              ctx.fillStyle = outerHex;
              ctx.fillRect(sx, sy, cellSize, cellSize);
              ctx.fillStyle = innerHex;
              ctx.fillRect(
                sx + (cellSize >= 4 ? 1 : 0),
                sy + (cellSize >= 4 ? 1 : 0),
                Math.max(1, cellSize - (cellSize >= 4 ? 2 : 0)),
                Math.max(1, cellSize - (cellSize >= 4 ? 2 : 0))
              );
            }

            if (windowHex && cellSize >= 3) {
              const gw = Math.max(1, Math.floor(cellSize * 0.45));
              ctx.fillStyle = windowHex;
              ctx.fillRect(
                sx + Math.floor((cellSize - gw) / 2),
                sy + Math.floor((cellSize - gw) / 2),
                gw,
                gw
              );
            }
          };

          switch (st.type) {
            case PlaceableType.WOOD_WALL:
              drawMiniWallSegment(st, '#451a03', '#c28442');
              break;
            case PlaceableType.WOOD_WINDOW:
              drawMiniWallSegment(st, '#451a03', '#c28442', '#38bdf8');
              break;
            case PlaceableType.WOOD_DOOR:
              drawMiniWallSegment(
                st,
                '#3d1f0a',
                st.isOpen ? '#4ade80' : '#d97706',
                '#fde047'
              );
              break;

            case PlaceableType.DARK_OAK_WALL:
              drawMiniWallSegment(st, '#140904', '#5c3a21');
              break;
            case PlaceableType.DARK_OAK_WINDOW:
              drawMiniWallSegment(st, '#140904', '#5c3a21', '#0284c7');
              break;
            case PlaceableType.DARK_OAK_DOOR:
              drawMiniWallSegment(
                st,
                '#120804',
                st.isOpen ? '#4ade80' : '#3d2312',
                '#f59e0b'
              );
              break;

            case PlaceableType.PINE_WALL:
              drawMiniWallSegment(st, '#4a2e16', '#e2be8a');
              break;
            case PlaceableType.PINE_WINDOW:
              drawMiniWallSegment(st, '#4a2e16', '#e2be8a', '#7dd3fc');
              break;
            case PlaceableType.PINE_DOOR:
              drawMiniWallSegment(
                st,
                '#3d2410',
                st.isOpen ? '#4ade80' : '#b88c56',
                '#ea580c'
              );
              break;

            case PlaceableType.STONE_WALL:
              drawMiniWallSegment(st, '#1e293b', '#cbd5e1');
              break;
            case PlaceableType.STONE_WINDOW:
              drawMiniWallSegment(st, '#1e293b', '#cbd5e1', '#38bdf8');
              break;
            case PlaceableType.BRICK_WALL:
              drawMiniWallSegment(st, '#450a0a', '#dc2626');
              break;

            case PlaceableType.WOOD_FENCE:
              drawMiniWallSegment(st, '#4a250d', '#9a602d');
              break;
            case PlaceableType.IRON_GATE:
              drawMiniWallSegment(
                st,
                '#0f172a',
                st.isOpen ? '#4ade80' : '#94a3b8',
                '#facc15'
              );
              break;

            case PlaceableType.VILLAGE_HOUSE: {
              // Miniature terracotta gable cottage roof & walls
              const hw = Math.max(4, Math.round(cellSize * 1.8));
              const hx = sx - Math.floor((hw - cellSize) / 2);
              const hy = sy - Math.floor((hw - cellSize) / 2);
              ctx.fillStyle = '#1f1209';
              ctx.fillRect(hx, hy, hw, hw);
              ctx.fillStyle = '#c2410c';
              ctx.fillRect(hx + 1, hy + 1, Math.max(2, hw - 2), Math.max(2, hw - 2));
              ctx.fillStyle = '#fb923c';
              ctx.fillRect(
                hx + 1,
                hy + Math.floor(hw * 0.35),
                Math.max(2, hw - 2),
                Math.max(1, Math.floor(hw * 0.25))
              );
              break;
            }

            case PlaceableType.VILLAGE_WELL: {
              const ww = Math.max(4, Math.round(cellSize * 1.4));
              const wx = sx - Math.floor((ww - cellSize) / 2);
              const wy = sy - Math.floor((ww - cellSize) / 2);
              ctx.fillStyle = '#334155';
              ctx.fillRect(wx, wy, ww, ww);
              ctx.fillStyle = '#94a3b8';
              ctx.fillRect(wx + 1, wy + 1, Math.max(2, ww - 2), Math.max(2, ww - 2));
              ctx.fillStyle = '#38bdf8';
              ctx.fillRect(
                wx + Math.floor(ww * 0.28),
                wy + Math.floor(ww * 0.28),
                Math.max(1, Math.ceil(ww * 0.44)),
                Math.max(1, Math.ceil(ww * 0.44))
              );
              break;
            }

            case PlaceableType.MARKET_STALL: {
              const mw = Math.max(4, Math.round(cellSize * 1.4));
              const mx = sx - Math.floor((mw - cellSize) / 2);
              const my = sy - Math.floor((mw - cellSize) / 2);
              ctx.fillStyle = '#dc2626';
              ctx.fillRect(mx, my, mw, mw);
              ctx.fillStyle = '#fef3c7';
              ctx.fillRect(
                mx + Math.floor(mw * 0.33),
                my,
                Math.max(1, Math.floor(mw * 0.33)),
                mw
              );
              break;
            }

            case PlaceableType.CHEST: {
              const cw = Math.max(3, cellSize);
              ctx.fillStyle = '#2a1205';
              ctx.fillRect(sx, sy, cw, cw);
              ctx.fillStyle =
                st.lootItems && st.lootItems.length > 0 ? '#e11d48' : '#b45309';
              ctx.fillRect(sx + 1, sy + 1, Math.max(1, cw - 2), Math.max(1, cw - 2));
              ctx.fillStyle = '#fde047';
              ctx.fillRect(
                sx + Math.floor(cw * 0.35),
                sy + Math.floor(cw * 0.35),
                Math.max(1, Math.ceil(cw * 0.3)),
                Math.max(1, Math.ceil(cw * 0.3))
              );
              break;
            }

            case PlaceableType.BED: {
              const bw = Math.max(3, cellSize);
              ctx.fillStyle = '#78350f';
              ctx.fillRect(sx, sy, bw, bw);
              ctx.fillStyle = '#f8fafc';
              ctx.fillRect(sx + 1, sy + 1, Math.max(1, bw - 2), Math.max(1, Math.floor(bw * 0.35)));
              ctx.fillStyle = '#dc2626';
              ctx.fillRect(
                sx + 1,
                sy + Math.max(1, Math.floor(bw * 0.4)),
                Math.max(1, bw - 2),
                Math.max(1, Math.ceil(bw * 0.5))
              );
              break;
            }

            case PlaceableType.EXPLORER_TENT: {
              const tw = Math.max(4, Math.round(cellSize * 1.3));
              const tx = sx - Math.floor((tw - cellSize) / 2);
              const ty = sy - Math.floor((tw - cellSize) / 2);
              ctx.fillStyle = '#f8fafc';
              ctx.fillRect(tx, ty, tw, tw);
              ctx.fillStyle = '#dc2626';
              ctx.fillRect(tx + 1, ty + 1, Math.max(1, tw - 2), Math.max(1, Math.floor(tw * 0.4)));
              break;
            }

            case PlaceableType.WORKBENCH:
            case PlaceableType.WEAVING_TABLE: {
              const ww = Math.max(3, cellSize);
              ctx.fillStyle = '#451a03';
              ctx.fillRect(sx, sy, ww, ww);
              ctx.fillStyle =
                st.type === PlaceableType.WEAVING_TABLE ? '#ec4899' : '#d97706';
              ctx.fillRect(sx + 1, sy + 1, Math.max(1, ww - 2), Math.max(1, ww - 2));
              break;
            }

            case PlaceableType.FURNACE: {
              const fw = Math.max(3, cellSize);
              ctx.fillStyle = '#334155';
              ctx.fillRect(sx, sy, fw, fw);
              ctx.fillStyle = '#f97316';
              ctx.fillRect(
                sx + Math.floor(fw * 0.25),
                sy + Math.floor(fw * 0.25),
                Math.max(1, Math.ceil(fw * 0.5)),
                Math.max(1, Math.ceil(fw * 0.5))
              );
              break;
            }

            case PlaceableType.CAMPFIRE:
            case PlaceableType.TORCH:
            case PlaceableType.IRON_LANTERN: {
              const lw = Math.max(2, Math.floor(cellSize * 0.6));
              const loff = Math.floor((cellSize - lw) / 2);
              ctx.fillStyle = '#ea580c';
              ctx.fillRect(sx + loff, sy + loff, lw, lw);
              ctx.fillStyle = '#fef08a';
              ctx.fillRect(sx + loff, sy + loff, Math.max(1, lw - 1), Math.max(1, lw - 1));
              break;
            }

            case PlaceableType.HEALING_FOUNTAIN:
            case PlaceableType.SOLAR_ALTAR:
            case PlaceableType.GUARDIAN_TOTEM: {
              const sw = Math.max(4, Math.round(cellSize * 1.25));
              const ox = sx - Math.floor((sw - cellSize) / 2);
              const oy = sy - Math.floor((sw - cellSize) / 2);
              ctx.fillStyle =
                st.type === PlaceableType.HEALING_FOUNTAIN ? '#cbd5e1' : '#b45309';
              ctx.fillRect(ox, oy, sw, sw);
              ctx.fillStyle =
                st.type === PlaceableType.SOLAR_ALTAR ? '#fde047' : '#38bdf8';
              ctx.fillRect(ox + 1, oy + 1, Math.max(1, sw - 2), Math.max(1, sw - 2));
              break;
            }

            case PlaceableType.WOOD_FLOOR:
            case PlaceableType.STONE_FLOOR:
            case PlaceableType.BRICK_FLOOR:
            case PlaceableType.ROYAL_CARPET:
            case PlaceableType.DIRT_PATH:
            case PlaceableType.WOOD_BRIDGE:
            case PlaceableType.TILLED_SOIL:
              // Already rendered in Pass 2
              break;

            default: {
              const dw = Math.max(2, Math.floor(cellSize * 0.75));
              ctx.fillStyle = '#a16207';
              ctx.fillRect(sx, sy, dw, dw);
              break;
            }
          }
        }
      }
    }

    // =========================================================================
    // PASS 5: RESPAWN REST POINT & WAYPOINTS / DEATH BAGS
    // =========================================================================
    if (player.respawnX !== undefined && player.respawnY !== undefined) {
      const respawnTx = Math.floor(player.respawnX / TILE_SIZE);
      const respawnTy = Math.floor(player.respawnY / TILE_SIZE);
      const rsx = Math.round(centerX + (respawnTx - playerTx) * zoom);
      const rsy = Math.round(centerY + (respawnTy - playerTy) * zoom);

      ctx.fillStyle = '#052e16';
      ctx.fillRect(rsx - 5, rsy - 5, 10, 10);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(rsx - 4, rsy - 1, 8, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rsx - 4, rsy - 4, 8, 3);
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(rsx - 5.5, rsy - 5.5, 11, 11);
    }

    if (showWaypoints) {
      for (const wp of waypoints) {
        const sx = Math.round(centerX + (wp.tileX - playerTx) * zoom);
        const sy = Math.round(centerY + (wp.tileY - playerTy) * zoom);
        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;

        if (wp.isDeathBag) {
          ctx.fillStyle = 'rgba(244, 63, 94, 0.32)';
          ctx.beginPath();
          ctx.arc(sx, sy, 9, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#78350f';
          ctx.fillRect(sx - 4, sy - 4, 8, 8);
          ctx.fillStyle = '#fde047';
          ctx.fillRect(sx - 2, sy - 5, 4, 2);
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(sx - 4.5, sy - 4.5, 9, 9);
        } else {
          // Diamond pin marker
          const pinColor = wp.color || '#f59e0b';
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(-4, -4, 8, 8);
          ctx.fillStyle = pinColor;
          ctx.fillRect(-3, -3, 6, 6);
          ctx.restore();
        }
      }
    }

    // =========================================================================
    // PASS 7: PET HEAD ICONS WITH HEATMAP CLUSTERING & NUMERIC COUNTER
    // =========================================================================
    if (showPets) {
      for (const cluster of petClusters) {
        if (
          cluster.screenX < -24 ||
          cluster.screenX > w + 24 ||
          cluster.screenY < -24 ||
          cluster.screenY > h + 24
        ) {
          continue;
        }
        drawMiniPetHead(
          ctx,
          cluster.screenX,
          cluster.screenY,
          cluster.kind,
          cluster.pets.length,
          false
        );
      }
    }

    // =========================================================================
    // PASS 8: SELECTED TILE RETICLE (When user clicks a spot on the map)
    // =========================================================================
    if (selectedTile) {
      const stx = Math.round(centerX + (selectedTile.tx - playerTx) * zoom);
      const sty = Math.round(centerY + (selectedTile.ty - playerTy) * zoom);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        stx - Math.max(4, cellSize / 2),
        sty - Math.max(4, cellSize / 2),
        Math.max(8, cellSize),
        Math.max(8, cellSize)
      );
    }

    // =========================================================================
    // PASS 9: MINIATURE PLAYER CHARACTER HEADS (Remote Players + Local Player)
    // =========================================================================
    const remoteList = Array.from(engine.multiplayer.remotePlayers.values());
    for (const rp of remoteList) {
      const rpTx = rp.x / TILE_SIZE;
      const rpTy = rp.y / TILE_SIZE;
      const sx = centerX + (rpTx - playerTx) * zoom;
      const sy = centerY + (rpTy - playerTy) * zoom;
      if (sx < -24 || sx > w + 24 || sy < -24 || sy > h + 24) continue;

      drawMiniPlayerHead(
        ctx,
        sx,
        sy,
        rp.appearance,
        rp.equippedBySlot?.head || null,
        rp.isHost ? '#fde047' : '#38bdf8',
        rp.isHost,
        1
      );
    }

    // Local Player Head at center
    drawMiniPlayerHead(
      ctx,
      centerX,
      centerY,
      player.appearance,
      player.equippedBySlot?.head || null,
      '#4ade80',
      engine.multiplayer.isOnline && engine.multiplayer.role === 'HOST',
      1.08
    );

    // =========================================================================
    // PASS 10: CARTOGRAPHIC COMPASS ROSE & SCALE BAR OVERLAY
    // =========================================================================
    ctx.save();
    const compX = 26;
    const compY = 26;
    ctx.fillStyle = 'rgba(18, 11, 7, 0.82)';
    ctx.beginPath();
    ctx.arc(compX, compY, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#785538';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // North pointer
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(compX, compY - 12);
    ctx.lineTo(compX + 3.5, compY);
    ctx.lineTo(compX - 3.5, compY);
    ctx.closePath();
    ctx.fill();

    // South pointer
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(compX, compY + 12);
    ctx.lineTo(compX + 3.5, compY);
    ctx.lineTo(compX - 3.5, compY);
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 7px "Silkscreen", monospace';
    ctx.fillStyle = '#fde047';
    ctx.textAlign = 'center';
    ctx.fillText('N', compX, compY - 13);
    ctx.restore();
  }, [
    engine,
    world,
    player,
    tamedAnimals,
    petClusters,
    waypoints,
    zoom,
    pan,
    showNature,
    showStructures,
    showPets,
    showWaypoints,
    selectedTile,
    playerTx,
    playerTy,
    remoteTick,
  ]);

  const computeMapPointDetails = (clientX: number, clientY: number): HoveredMapInfo | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    const cx = (clientX - rect.left) * scaleX;
    const cy = (clientY - rect.top) * scaleY;

    const centerX = canvas.width / 2 + pan.x;
    const centerY = canvas.height / 2 + pan.y;

    const tx = Math.floor(playerTx + (cx - centerX) / zoom);
    const ty = Math.floor(playerTy + (cy - centerY) / zoom);
    const distanceTiles = Math.round(Math.hypot(tx - playerTx, ty - playerTy));

    const { cx: chunkX, cy: chunkY } = world.tileToChunk(tx, ty);
    const chunk = world.chunks[WorldManager.chunkKey(chunkX, chunkY)];
    const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const idx = ly * CHUNK_SIZE + lx;
    const isExplored = chunk?.explored?.[idx] === 1;

    const biomeLabel = isExplored
      ? getBiomeDisplayName(chunk.tiles[idx], chunk.ecologicalZones?.[idx])
      : 'Área Não Explorada';

    // Check if hovering local player
    if (Math.hypot(cx - centerX, cy - centerY) <= 10) {
      return {
        tileX: playerTx,
        tileY: playerTy,
        biomeLabel,
        distanceTiles: 0,
        title: 'Você (Sua Posição)',
        subtitle: `HP ${Math.ceil(player.hp)}/${player.maxHp}`,
        badgeColor: '#4ade80',
      };
    }

    // Check remote players
    for (const rp of remotePlayersList) {
      const rpSx = centerX + (rp.x / TILE_SIZE - playerTx) * zoom;
      const rpSy = centerY + (rp.y / TILE_SIZE - playerTy) * zoom;
      if (Math.hypot(cx - rpSx, cy - rpSy) <= 10) {
        return {
          tileX: Math.floor(rp.x / TILE_SIZE),
          tileY: Math.floor(rp.y / TILE_SIZE),
          biomeLabel,
          distanceTiles,
          title: `${rp.isHost ? '👑 ' : ''}${rp.name}`,
          subtitle: `Jogador Online · a ${distanceTiles} blocos`,
          badgeColor: rp.isHost ? '#fde047' : '#38bdf8',
        };
      }
    }

    // Check pet clusters
    if (showPets) {
      for (const cluster of petClusters) {
        if (Math.hypot(cx - cluster.screenX, cy - cluster.screenY) <= 11) {
          const kindName = getPetKindDisplayName(cluster.kind);
          const count = cluster.pets.length;
          const namesPreview = cluster.pets
            .slice(0, 3)
            .map((p) => p.name || kindName)
            .join(', ');
          return {
            tileX: Math.round(cluster.avgTileX),
            tileY: Math.round(cluster.avgTileY),
            biomeLabel,
            distanceTiles,
            title:
              count > 1
                ? `${count}x ${kindName}s Agrupados`
                : cluster.pets[0].name || kindName,
            subtitle:
              count > 1
                ? `${namesPreview}${count > 3 ? ` +${count - 3}` : ''} · Mapa de calor ativo`
                : `HP ${Math.ceil(cluster.pets[0].hp)}/${cluster.pets[0].maxHp} · Mascote domesticado`,
            badgeColor: count > 1 ? '#fbbf24' : '#4ade80',
          };
        }
      }
    }

    // Check waypoints
    if (showWaypoints) {
      for (const wp of waypoints) {
        const wsx = centerX + (wp.tileX - playerTx) * zoom;
        const wsy = centerY + (wp.tileY - playerTy) * zoom;
        if (Math.hypot(cx - wsx, cy - wsy) <= 9) {
          return {
            tileX: wp.tileX,
            tileY: wp.tileY,
            biomeLabel,
            distanceTiles,
            title: wp.label,
            subtitle: wp.isDeathBag
              ? 'Bolsinha de Espólios · Recupere seus itens'
              : `Marco salvo · a ${distanceTiles} blocos`,
            badgeColor: wp.isDeathBag ? '#f43f5e' : wp.color || '#f59e0b',
          };
        }
      }
    }

    return {
      tileX: tx,
      tileY: ty,
      biomeLabel,
      distanceTiles,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    activePointersRef.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
    });

    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStateRef.current = {
        active: true,
        initialDist: Math.max(10, dist),
        initialZoom: zoom,
      };
      dragRef.current.active = false;
      dragRef.current.moved = true;
      return;
    }

    if (activePointersRef.current.size === 1) {
      pinchStateRef.current.active = false;
      dragRef.current = {
        active: true,
        moved: false,
        startX: e.clientX - pan.x,
        startY: e.clientY - pan.y,
        pointerDownX: e.clientX,
        pointerDownY: e.clientY,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
      });
    }

    if (
      pinchStateRef.current.active &&
      activePointersRef.current.size >= 2
    ) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scale = dist / Math.max(10, pinchStateRef.current.initialDist);
      const nextZoom = Math.round(
        Math.max(2, Math.min(12, pinchStateRef.current.initialZoom * scale))
      );
      setZoom(nextZoom);
      return;
    }

    const info = computeMapPointDetails(e.clientX, e.clientY);
    if (info) setHoveredInfo(info);

    if (!dragRef.current.active) return;
    const dist = Math.hypot(
      e.clientX - dragRef.current.pointerDownX,
      e.clientY - dragRef.current.pointerDownY
    );
    if (dist > 5) {
      dragRef.current.moved = true;
    }
    setPan({
      x: e.clientX - dragRef.current.startX,
      y: e.clientY - dragRef.current.startY,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    activePointersRef.current.delete(e.pointerId);

    if (pinchStateRef.current.active) {
      if (activePointersRef.current.size < 2) {
        pinchStateRef.current.active = false;
        if (activePointersRef.current.size === 1) {
          const remaining = Array.from(activePointersRef.current.values())[0];
          dragRef.current = {
            active: true,
            moved: true,
            startX: remaining.x - pan.x,
            startY: remaining.y - pan.y,
            pointerDownX: remaining.x,
            pointerDownY: remaining.y,
          };
        }
      }
      return;
    }

    const wasClick = dragRef.current.active && !dragRef.current.moved;
    dragRef.current.active = false;
    if (wasClick) {
      const info = computeMapPointDetails(e.clientX, e.clientY);
      if (info) {
        setSelectedTile({ tx: info.tileX, ty: info.tileY });
        setHoveredInfo(info);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1 : -1;
    setZoom((z) => Math.max(2, Math.min(12, z + delta)));
  };

  const handleAddWaypoint = (e: React.FormEvent) => {
    e.preventDefault();
    const targetTx = selectedTile ? selectedTile.tx : playerTx;
    const targetTy = selectedTile ? selectedTile.ty : playerTy;
    engine.addWaypoint(
      newWaypointName.trim() || `Marco (${targetTx},${targetTy})`,
      targetTx,
      targetTy,
      newWaypointColor
    );
    setNewWaypointName('');
  };

  const centerOnTile = (tx: number, ty: number) => {
    setPan({
      x: (playerTx - tx) * zoom,
      y: (playerTy - ty) * zoom,
    });
    setSelectedTile({ tx, ty });
  };

  const activeInfo = hoveredInfo || {
    tileX: selectedTile?.tx ?? playerTx,
    tileY: selectedTile?.ty ?? playerTy,
    biomeLabel: getBiomeDisplayName(world.getTileBiomeFast(playerTx, playerTy)),
    distanceTiles: selectedTile
      ? Math.round(Math.hypot(selectedTile.tx - playerTx, selectedTile.ty - playerTy))
      : 0,
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-1.5 sm:p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl medieval-panel flex flex-col max-h-[96dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a110b] border-b-2 border-[#4a301e] shrink-0">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-amber-400" />
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="font-pixel text-[11px] sm:text-xs font-bold text-amber-400">
                ATLAS DO MUNDO EM MINIATURA
              </h2>
              <span className="text-[10px] text-[#c4ab7d] font-mono-tabular">
                Posição: ({playerTx}, {playerTy}) · Zoom {zoom}x
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <WindowHelpButton onClick={() => setShowHelp(true)} />
            <button
              onClick={onClose}
              className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-2 sm:p-3">
          {/* Map Viewport (Left 8 cols) */}
          <div className="sm:col-span-8 relative medieval-inset overflow-hidden flex flex-col">
            {/* Layer Filter Bar */}
            <div className="px-2 py-1.5 bg-[#120b07] border-b border-[#3d281a] flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  onClick={() => setShowNature((v) => !v)}
                  className={`px-2 py-0.5 font-bold flex items-center gap-1 ${
                    showNature ? 'medieval-btn-gold' : 'medieval-btn-wood opacity-75'
                  }`}
                >
                  <Trees className="w-3 h-3" />
                  <span>Natureza</span>
                </button>
                <button
                  onClick={() => setShowStructures((v) => !v)}
                  className={`px-2 py-0.5 font-bold flex items-center gap-1 ${
                    showStructures ? 'medieval-btn-gold' : 'medieval-btn-wood opacity-75'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>Construções</span>
                </button>
                <button
                  onClick={() => setShowPets((v) => !v)}
                  className={`px-2 py-0.5 font-bold flex items-center gap-1 ${
                    showPets ? 'medieval-btn-gold' : 'medieval-btn-wood opacity-75'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Pets ({tamedAnimals.length})</span>
                </button>
                <button
                  onClick={() => setShowWaypoints((v) => !v)}
                  className={`px-2 py-0.5 font-bold flex items-center gap-1 ${
                    showWaypoints ? 'medieval-btn-gold' : 'medieval-btn-wood opacity-75'
                  }`}
                >
                  <MapPin className="w-3 h-3" />
                  <span>Marcos ({waypoints.length})</span>
                </button>
              </div>

              {player.respawnX !== undefined && player.respawnY !== undefined && (
                <button
                  onClick={() =>
                    centerOnTile(
                      Math.floor((player.respawnX ?? 16) / TILE_SIZE),
                      Math.floor((player.respawnY ?? 16) / TILE_SIZE)
                    )
                  }
                  className="px-2 py-0.5 medieval-btn-wood text-[10px] font-bold text-emerald-300"
                >
                  Ir p/ Descanso
                </button>
              )}
            </div>

            {/* Interactive Canvas Surface */}
            <div className="relative flex-1 flex items-center justify-center bg-[#080604]">
              <canvas
                ref={canvasRef}
                width={640}
                height={380}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
                className="w-full h-[220px] sm:h-[290px] md:h-[350px] cursor-grab active:cursor-grabbing touch-none"
              />

              {/* Zoom & Center Controls */}
              <div className="absolute bottom-2 right-2 flex items-center gap-1 medieval-panel p-1">
                <button
                  onClick={() => setZoom((z) => Math.max(2, z - 1))}
                  className="min-h-[30px] min-w-[30px] medieval-btn-wood flex items-center justify-center"
                  title="Diminuir Zoom"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setPan({ x: 0, y: 0 });
                    setSelectedTile(null);
                  }}
                  className="min-h-[30px] px-2.5 medieval-btn-gold text-[10px] font-bold flex items-center gap-1"
                  title="Centralizar em Você"
                >
                  <Navigation className="w-3 h-3" />
                  <span>Você</span>
                </button>
                <button
                  onClick={() => setZoom((z) => Math.min(12, z + 1))}
                  className="min-h-[30px] min-w-[30px] medieval-btn-wood flex items-center justify-center"
                  title="Aumentar Zoom"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Bottom Live Inspector Bar */}
            <div className="px-2.5 py-1.5 bg-[#120b07] border-t border-[#3d281a] flex flex-wrap items-center justify-between gap-2 text-[10px]">
              <div className="flex items-center gap-2 min-w-0">
                <Crosshair className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-mono-tabular text-amber-300 font-bold shrink-0">
                  ({activeInfo.tileX}, {activeInfo.tileY})
                </span>
                <span className="text-[#c4ab7d] truncate">
                  {activeInfo.biomeLabel}
                </span>
                <span className="text-[#8c6d46] font-mono-tabular shrink-0">
                  · {activeInfo.distanceTiles} blocos
                </span>
              </div>

              {activeInfo.title && (
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: activeInfo.badgeColor || '#fbbf24' }}
                  />
                  <span className="font-bold text-white truncate">
                    {activeInfo.title}
                  </span>
                  {activeInfo.subtitle && (
                    <span className="text-[#c4ab7d] truncate hidden md:inline">
                      ({activeInfo.subtitle})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar: Players, Pet Clusters & Waypoints */}
          <div className="sm:col-span-4 medieval-inset p-2.5 flex flex-col justify-between gap-2 overflow-y-auto max-h-[420px]">
            <div className="space-y-2.5 flex-1 flex flex-col min-h-0">
              {/* Online Players Section */}
              {remotePlayersList.length > 0 && (
                <div className="space-y-1 border-b border-[#3d281a] pb-2 shrink-0">
                  <div className="flex items-center gap-1.5 text-[10px] font-pixel font-bold text-sky-300">
                    <Users className="w-3.5 h-3.5" />
                    <span>JOGADORES ({remotePlayersList.length + 1})</span>
                  </div>
                  <div className="space-y-1 max-h-[76px] overflow-y-auto pr-0.5">
                    {remotePlayersList.map((rp) => {
                      const rpTx = Math.floor(rp.x / TILE_SIZE);
                      const rpTy = Math.floor(rp.y / TILE_SIZE);
                      return (
                        <button
                          key={rp.peerId}
                          onClick={() => centerOnTile(rpTx, rpTy)}
                          className="w-full mc-slot px-2 py-1 flex items-center justify-between gap-1.5 text-[10px] hover:border-sky-400/60 text-left"
                        >
                          <span
                            className={`font-bold truncate ${
                              rp.isHost ? 'text-amber-300' : 'text-sky-300'
                            }`}
                          >
                            {rp.isHost ? '👑 ' : ''}
                            {rp.name}
                          </span>
                          <span className="text-[9px] font-mono-tabular text-[#c4ab7d] shrink-0">
                            ({rpTx}, {rpTy})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pet Clusters Quick-Jump Section */}
              {petClusters.length > 0 && (
                <div className="space-y-1 border-b border-[#3d281a] pb-2 shrink-0">
                  <div className="flex items-center justify-between text-[10px] font-pixel font-bold text-emerald-300">
                    <span>SEUS PETS ({tamedAnimals.length})</span>
                    <span className="text-[9px] text-[#c4ab7d] font-normal">
                      {petClusters.length} grupo(s)
                    </span>
                  </div>
                  <div className="space-y-1 max-h-[90px] overflow-y-auto pr-0.5">
                    {petClusters.map((cl, idx) => {
                      const kindName = getPetKindDisplayName(cl.kind);
                      const tx = Math.round(cl.avgTileX);
                      const ty = Math.round(cl.avgTileY);
                      const count = cl.pets.length;
                      return (
                        <button
                          key={`${cl.kind}_${idx}`}
                          onClick={() => centerOnTile(tx, ty)}
                          className="w-full mc-slot px-2 py-1 flex items-center justify-between gap-1.5 text-[10px] hover:border-amber-400/60 text-left"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {count > 1 && (
                              <span className="px-1.5 py-0.2 bg-amber-600 text-white font-bold text-[9px] shrink-0">
                                {count}x
                              </span>
                            )}
                            <span className="font-bold text-amber-200 truncate">
                              {count > 1
                                ? `${kindName}s`
                                : cl.pets[0].name || kindName}
                            </span>
                          </div>
                          <span className="text-[9px] font-mono-tabular text-[#c4ab7d] shrink-0">
                            ({tx}, {ty})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Waypoints Section */}
              <div className="flex items-center justify-between border-b border-[#3d281a] pb-1.5 shrink-0">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-amber-400" />
                  <h3 className="font-pixel text-[10px] font-bold text-amber-400">
                    MARCOS ({waypoints.length})
                  </h3>
                </div>
                {selectedTile && (
                  <button
                    onClick={() => setSelectedTile(null)}
                    className="text-[9px] text-amber-300 underline"
                  >
                    Usar minha posição
                  </button>
                )}
              </div>

              <form onSubmit={handleAddWaypoint} className="space-y-1.5 shrink-0">
                <input
                  type="text"
                  maxLength={22}
                  value={newWaypointName}
                  onChange={(e) => setNewWaypointName(e.target.value)}
                  placeholder={
                    selectedTile
                      ? `Marco em (${selectedTile.tx}, ${selectedTile.ty})...`
                      : 'Nome do marco...'
                  }
                  className="w-full h-8 px-2 mc-slot text-[11px] text-white placeholder-[#8c6d46] focus:outline-none"
                />
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    {WAYPOINT_COLORS.map((col) => (
                      <button
                        type="button"
                        key={col}
                        onClick={() => setNewWaypointColor(col)}
                        className={`w-4 h-4 border ${
                          newWaypointColor === col
                            ? 'border-white scale-110'
                            : 'border-black/60 opacity-75'
                        }`}
                        style={{ backgroundColor: col }}
                      />
                    ))}
                  </div>
                  <button
                    type="submit"
                    className="px-3 min-h-[28px] medieval-btn-gold text-[10px] font-bold flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>
                      {selectedTile
                        ? `Marcar (${selectedTile.tx},${selectedTile.ty})`
                        : 'Marcar Aqui'}
                    </span>
                  </button>
                </div>
              </form>

              <div className="space-y-1 flex-1 overflow-y-auto max-h-[140px] pr-0.5">
                {waypoints.length === 0 ? (
                  <div className="text-[10px] text-[#8c6d46] text-center py-3">
                    Toque em qualquer ponto do mapa ou clique em Marcar Aqui para criar um marco.
                  </div>
                ) : (
                  waypoints.map((wp) => (
                    <div
                      key={wp.id}
                      className={`mc-slot px-2 py-1.5 flex items-center justify-between gap-1.5 text-[11px] ${
                        wp.isDeathBag
                          ? 'border border-rose-500/60 bg-rose-950/30'
                          : ''
                      }`}
                    >
                      <button
                        onClick={() => centerOnTile(wp.tileX, wp.tileY)}
                        className="text-left flex-1 flex items-center gap-2 min-w-0"
                      >
                        <span
                          className="w-2.5 h-2.5 shrink-0 border border-black"
                          style={{
                            backgroundColor: wp.isDeathBag
                              ? '#f43f5e'
                              : wp.color || '#f59e0b',
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className={`font-bold truncate ${
                              wp.isDeathBag ? 'text-rose-300' : 'text-amber-300'
                            }`}
                          >
                            {wp.label}
                          </div>
                          <div className="text-[9px] font-mono-tabular text-[#c4ab7d]">
                            ({wp.tileX}, {wp.tileY}) · a{' '}
                            {Math.round(
                              Math.hypot(wp.tileX - playerTx, wp.tileY - playerTy)
                            )}{' '}
                            blocos
                          </div>
                        </div>
                      </button>
                      {!wp.isDeathBag && (
                        <button
                          onClick={() => engine.removeWaypoint(wp.id)}
                          className="p-1 text-rose-400 hover:text-rose-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showHelp && (
        <WindowHelpModal
          title="Ajuda — Atlas do Mundo em Miniatura"
          subtitle="Como funciona a visualização real em escala reduzida, cabeças de jogadores e agrupamento de pets"
          onClose={() => setShowHelp(false)}
          sections={[
            {
              title: '1. Mundo Real em Menor Escala',
              body: 'O mapa reflete fielmente cada bioma, costa, árvore (Carvalho, Carvalho Escuro, Pinheiro, Palmeira), rocha, plantação e estrutura construída com as cores e materiais reais de cada madeira ou pedra, sem poluir a tela com textos sobre as construções.',
            },
            {
              title: '2. Cabeças de Jogadores e Pets com Mapa de Calor',
              body: 'Cada jogador aparece com a cabeça customizada do seu próprio personagem. Seus pets são exibidos com a cabeça da espécie (Cavalo, Camelo, Ovelha, Javali, Vaca). Quando vários pets da mesma espécie estão juntos, eles se fundem em um único ícone com brilho de mapa de calor e contador numérico.',
            },
            {
              title: '3. Inspeção e Marcos em Qualquer Ponto',
              body: 'Passe o cursor ou toque em qualquer lugar do mapa para inspecionar as coordenadas, bioma e distância, ou para salvar um marco colorido exatamente naquele bloco.',
            },
          ]}
        />
      )}
    </div>
  );
};
