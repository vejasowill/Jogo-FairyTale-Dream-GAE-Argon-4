import React, { useEffect, useRef, useState } from 'react';
import {
  Compass,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  BiomeType,
  CreatureEntity,
  EcologicalZone,
  MapWaypoint,
  NatureNodeType,
  PlaceableType,
  PlayerState,
} from '../game/core/types';
import { GameEngine } from '../game/loop/GameEngine';
import { CHUNK_SIZE, TILE_SIZE, WorldManager } from '../game/world/WorldManager';

interface WorldMapModalProps {
  engine: GameEngine;
  world: WorldManager;
  player: PlayerState;
  tamedAnimals: CreatureEntity[];
  waypoints: MapWaypoint[];
  onClose: () => void;
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
  const [zoom, setZoom] = useState(4);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showRareNodes, setShowRareNodes] = useState(true);
  const [showStructures, setShowStructures] = useState(true);
  const [showPets, setShowPets] = useState(true);
  const [newWaypointName, setNewWaypointName] = useState('');

  const dragRef = useRef<{ active: boolean; startX: number; startY: number }>({
    active: false,
    startX: 0,
    startY: 0,
  });

  const playerTx = Math.floor(player.x / TILE_SIZE);
  const playerTy = Math.floor(player.y / TILE_SIZE);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Unexplored Dark Fog of War background
    ctx.fillStyle = '#0b0705';
    ctx.fillRect(0, 0, w, h);

    // Subtle cartographic chunk grid
    ctx.strokeStyle = 'rgba(92, 61, 40, 0.25)';
    ctx.lineWidth = 1;
    const gridStep = CHUNK_SIZE * zoom;
    for (let x = 0; x < w; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const centerX = w / 2 + pan.x;
    const centerY = h / 2 + pan.y;

    // Render ONLY chunks and tiles explored by the player
    for (const chunk of Object.values(world.chunks)) {
      const hasAnyExplored = chunk.explored.some((e) => e === 1);
      if (!hasAnyExplored) continue;

      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const idx = ly * CHUNK_SIZE + lx;
          if (chunk.explored[idx] !== 1) continue;

          const tx = chunk.cx * CHUNK_SIZE + lx;
          const ty = chunk.cy * CHUNK_SIZE + ly;

          const sx = Math.floor(centerX + (tx - playerTx) * zoom);
          const sy = Math.floor(centerY + (ty - playerTy) * zoom);

          if (sx + zoom < 0 || sx > w || sy + zoom < 0 || sy > h) continue;

          const biome = chunk.tiles[idx];
          const zone = chunk.ecologicalZones?.[idx];
          if (zone === EcologicalZone.DENSE_WOODLAND || zone === EcologicalZone.ANCIENT_GROVE) {
            ctx.fillStyle = '#1f5427';
          } else if (zone === EcologicalZone.MEADOW_CLEARING) {
            ctx.fillStyle = '#4c9444';
          } else if (zone === EcologicalZone.ROCKY_HIGHLANDS) {
            ctx.fillStyle = '#5c7042';
          } else if (zone === EcologicalZone.DESERT_OASIS) {
            ctx.fillStyle = '#34a853';
          } else if (zone === EcologicalZone.CRYSTAL_BADLANDS) {
            ctx.fillStyle = '#c98838';
          } else if (zone === EcologicalZone.SHALLOW_REEF) {
            ctx.fillStyle = '#2585b8';
          } else if (biome === BiomeType.PLAINS) {
            ctx.fillStyle = '#3f7d3b';
          } else if (biome === BiomeType.DESERT) {
            ctx.fillStyle = '#dfbe6f';
          } else {
            ctx.fillStyle = '#174e75';
          }
          ctx.fillRect(sx, sy, Math.ceil(zoom), Math.ceil(zoom));
        }
      }

      if (showRareNodes) {
        for (const node of chunk.nodes) {
          const lx = ((node.tileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const ly = ((node.tileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          if (chunk.explored[ly * CHUNK_SIZE + lx] !== 1) continue;

          const sx = centerX + (node.tileX - playerTx) * zoom;
          const sy = centerY + (node.tileY - playerTy) * zoom;

          if (
            node.type === NatureNodeType.SUNSTONE_OBELISK ||
            node.type === NatureNodeType.PEARL_CLAM ||
            node.type === NatureNodeType.ANCIENT_WORLD_TREE
          ) {
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(sx - 1, sy - 1, Math.max(3, zoom), Math.max(3, zoom));
          } else if (
            node.type === NatureNodeType.IRON_OUTCROP ||
            node.type === NatureNodeType.DESERT_CRYSTAL
          ) {
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(sx, sy, Math.max(2, zoom), Math.max(2, zoom));
          }
        }
      }

      if (showStructures) {
        for (const st of chunk.structures) {
          const lx = ((st.tileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          const ly = ((st.tileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
          if (chunk.explored[ly * CHUNK_SIZE + lx] !== 1) continue;

          const sx = centerX + (st.tileX - playerTx) * zoom;
          const sy = centerY + (st.tileY - playerTy) * zoom;
          ctx.fillStyle =
            st.type === PlaceableType.CHEST && st.lootItems && st.lootItems.length > 0
              ? '#f43f5e'
              : st.isBridge
              ? '#b45309'
              : '#fde047';
          ctx.fillRect(sx, sy, Math.max(3, zoom), Math.max(3, zoom));
        }

        if (chunk.landmarkName && chunk.explored[8 * CHUNK_SIZE + 8] === 1) {
          const lSx = centerX + (chunk.cx * CHUNK_SIZE + 8 - playerTx) * zoom;
          const lSy = centerY + (chunk.cy * CHUNK_SIZE + 8 - playerTy) * zoom;
          ctx.font = 'bold 8px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = '#fde047';
          ctx.fillText(`✦ ${chunk.landmarkName}`, lSx + 5, lSy - 4);
        }
      }
    }

    // Draw Tamed Animals pins
    if (showPets) {
      for (const pet of tamedAnimals) {
        const ptx = pet.x / TILE_SIZE;
        const pty = pet.y / TILE_SIZE;
        const sx = centerX + (ptx - playerTx) * zoom;
        const sy = centerY + (pty - playerTy) * zoom;
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw Custom Waypoints
    for (const wp of waypoints) {
      const sx = centerX + (wp.tileX - playerTx) * zoom;
      const sy = centerY + (wp.tileY - playerTy) * zoom;
      ctx.fillStyle = wp.color || '#f59e0b';
      ctx.fillRect(sx - 3, sy - 3, 6, 6);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 3, sy - 3, 6, 6);

      ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#fef08a';
      ctx.fillText(wp.label, sx + 5, sy + 3);
    }

    // Draw Player Marker
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#120b07';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [
    world,
    player,
    tamedAnimals,
    waypoints,
    zoom,
    pan,
    showRareNodes,
    showStructures,
    showPets,
    playerTx,
    playerTy,
  ]);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current = {
      active: true,
      startX: e.clientX - pan.x,
      startY: e.clientY - pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    setPan({
      x: e.clientX - dragRef.current.startX,
      y: e.clientY - dragRef.current.startY,
    });
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
  };

  const handleAddWaypointHere = (e: React.FormEvent) => {
    e.preventDefault();
    engine.addWaypoint(
      newWaypointName || `Marco (${playerTx},${playerTy})`,
      playerTx,
      playerTy,
      '#f59e0b'
    );
    setNewWaypointName('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-1.5 sm:p-3">
      <div className="w-full max-w-4xl medieval-panel flex flex-col max-h-[96dvh] overflow-hidden">
        {/* Compact Horizontal-Friendly Header */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a110b] border-b-2 border-[#4a301e] shrink-0">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-amber-400" />
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="font-pixel text-[11px] sm:text-xs font-bold text-amber-400">
                CARTOGRAFIA DE CHUNKS EXPLORADOS
              </h2>
              <span className="text-[10px] text-[#c4ab7d] font-mono-tabular">
                Pos: ({playerTx}, {playerTy}) · Revelados: {world.getExploredChunksCount()}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Body: Widescreen 2-Column on Horizontal Mobile (sm:grid-cols-12) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-2 sm:p-3">
          {/* Map Viewport (Left 8 cols) */}
          <div className="sm:col-span-8 relative medieval-inset overflow-hidden flex flex-col">
            {/* Layer Filter Toggles */}
            <div className="px-2 py-1.5 bg-[#120b07] border-b border-[#3d281a] flex flex-wrap items-center justify-between gap-1 text-[10px]">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowRareNodes((v) => !v)}
                  className={`px-2 py-0.5 font-bold ${
                    showRareNodes ? 'medieval-btn-gold' : 'medieval-btn-wood'
                  }`}
                >
                  Minérios & Relíquias
                </button>
                <button
                  onClick={() => setShowStructures((v) => !v)}
                  className={`px-2 py-0.5 font-bold ${
                    showStructures ? 'medieval-btn-gold' : 'medieval-btn-wood'
                  }`}
                >
                  Construções
                </button>
                <button
                  onClick={() => setShowPets((v) => !v)}
                  className={`px-2 py-0.5 font-bold ${
                    showPets ? 'medieval-btn-gold' : 'medieval-btn-wood'
                  }`}
                >
                  Pets ({tamedAnimals.length})
                </button>
              </div>
              <span className="text-[9px] text-[#c4ab7d] hidden md:inline">
                Arraste para mover o mapa
              </span>
            </div>

            <div className="relative flex-1 flex items-center justify-center bg-[#0b0705]">
              <canvas
                ref={canvasRef}
                width={520}
                height={260}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="w-full h-[185px] sm:h-[225px] md:h-[280px] cursor-grab active:cursor-grabbing touch-none"
              />

              {/* Zoom & Center Controls */}
              <div className="absolute bottom-2 right-2 flex items-center gap-1 medieval-panel p-1">
                <button
                  onClick={() => setZoom((z) => Math.max(2, z - 1))}
                  className="min-h-[32px] min-w-[32px] medieval-btn-wood flex items-center justify-center"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPan({ x: 0, y: 0 })}
                  className="min-h-[32px] px-2 medieval-btn-gold text-[10px] font-bold flex items-center gap-1"
                >
                  <Navigation className="w-3 h-3" />
                  <span>Você</span>
                </button>
                <button
                  onClick={() => setZoom((z) => Math.min(10, z + 1))}
                  className="min-h-[32px] min-w-[32px] medieval-btn-wood flex items-center justify-center"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Compact Legend */}
            <div className="px-2.5 py-1.5 bg-[#120b07] border-t border-[#3d281a] flex flex-wrap items-center gap-2.5 text-[10px] text-[#e5d5b5]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-[#3f7d3b] inline-block" /> Planície
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-[#dfbe6f] inline-block" /> Deserto
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-[#1d5f8a] inline-block" /> Oceano
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-[#38bdf8] inline-block" /> Relíquia
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-[#fde047] inline-block" /> Base/Ponte
              </span>
            </div>
          </div>

          {/* Right Sidebar: Custom Waypoints / Map Markers (Right 4 cols) */}
          <div className="sm:col-span-4 medieval-inset p-2.5 flex flex-col justify-between gap-2">
            <div className="space-y-2 flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-1.5 border-b border-[#3d281a] pb-1.5 shrink-0">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <h3 className="font-pixel text-[10px] font-bold text-amber-400">
                  MARCADORES ({waypoints.length})
                </h3>
              </div>

              <form onSubmit={handleAddWaypointHere} className="space-y-1.5 shrink-0">
                <input
                  type="text"
                  maxLength={22}
                  value={newWaypointName}
                  onChange={(e) => setNewWaypointName(e.target.value)}
                  placeholder="Nome do marco aqui..."
                  className="w-full h-8 px-2 mc-slot text-[11px] text-white placeholder-[#8c6d46] focus:outline-none"
                />
                <button
                  type="submit"
                  className="w-full min-h-[34px] medieval-btn-gold text-[11px] font-bold flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    Marcar ({playerTx}, {playerTy})
                  </span>
                </button>
              </form>

              <div className="space-y-1 flex-1 overflow-y-auto max-h-[140px] sm:max-h-[165px] pr-0.5">
                {waypoints.map((wp) => (
                  <div
                    key={wp.id}
                    className="mc-slot px-2 py-1.5 flex items-center justify-between gap-1.5 text-[11px]"
                  >
                    <button
                      onClick={() =>
                        setPan({
                          x: (playerTx - wp.tileX) * zoom,
                          y: (playerTy - wp.tileY) * zoom,
                        })
                      }
                      className="text-left flex-1 truncate"
                    >
                      <div className="font-bold text-amber-300 truncate">
                        {wp.label}
                      </div>
                      <div className="text-[9px] font-mono-tabular text-[#c4ab7d]">
                        Tile ({wp.tileX}, {wp.tileY})
                      </div>
                    </button>
                    <button
                      onClick={() => engine.removeWaypoint(wp.id)}
                      className="p-1 text-rose-400 hover:text-rose-200"
                      title="Remover Marcador"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
