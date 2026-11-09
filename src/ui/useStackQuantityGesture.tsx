import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface ActiveQuantizedDrag<K extends string | number> {
  slotKey: K;
  currentCount: number;
  maxCount: number;
  clientX: number;
  clientY: number;
}

interface UseStackQuantityGestureOptions<K extends string | number> {
  onSelectWithCount: (slotKey: K, count: number, maxCount: number) => void;
  onSlotTap: (slotKey: K) => void;
}

/**
 * Provides hold + horizontal left/right drag quantization for stackable inventory slots.
 * - Quick tap on a slot triggers `onSlotTap(slotKey)` (normal 2-click select/move).
 * - Holding a slot with `count > 1` (~160ms) or dragging horizontally while holding activates
 *   live quantity selection (`1 .. count`) by dragging the finger left (decrease) or right (increase).
 * - Releasing the finger locks in the chosen quantity via `onSelectWithCount(slotKey, count, maxCount)`.
 */
export function useStackQuantityGesture<K extends string | number>({
  onSelectWithCount,
  onSlotTap,
}: UseStackQuantityGestureOptions<K>) {
  const [activeDrag, setActiveDrag] = useState<ActiveQuantizedDrag<K> | null>(
    null
  );

  const stateRef = useRef<{
    pointerId: number;
    slotKey: K;
    maxCount: number;
    startX: number;
    startY: number;
    isQuantizing: boolean;
    currentCount: number;
    holdTimer: number | null;
    suppressNextClick: boolean;
  } | null>(null);

  const clearHoldTimer = () => {
    if (stateRef.current && stateRef.current.holdTimer !== null) {
      window.clearTimeout(stateRef.current.holdTimer);
      stateRef.current.holdTimer = null;
    }
  };

  useEffect(() => {
    return () => {
      clearHoldTimer();
    };
  }, []);

  const computeCountFromDx = (dx: number, maxCount: number): number => {
    if (maxCount <= 1) return 1;
    // Full sweep across [-54px .. +54px] with center at Math.ceil(maxCount / 2)
    const halfSpan = 54;
    const clampedRatio = Math.max(-1, Math.min(1, dx / halfSpan));
    const norm = (clampedRatio + 1) * 0.5; // 0..1
    const raw = 1 + Math.round(norm * (maxCount - 1));
    return Math.max(1, Math.min(maxCount, raw));
  };

  const getSlotGestureProps = useCallback(
    (
      slotKey: K,
      slotCount: number,
      canStartQuantize: boolean
    ): {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
      onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
      onClick: (e: React.MouseEvent<HTMLElement>) => void;
      onContextMenu: (e: React.MouseEvent<HTMLElement>) => void;
    } => {
      return {
        onContextMenu: (e) => {
          e.preventDefault();
        },
        onPointerDown: (e) => {
          if (e.button !== undefined && e.button !== 0) return;
          clearHoldTimer();

          if (!canStartQuantize || slotCount <= 1) {
            stateRef.current = null;
            return;
          }

          const initialCount = Math.max(1, Math.ceil(slotCount / 2));
          const clientX = e.clientX;
          const clientY = e.clientY;
          const pointerId = e.pointerId;
          const targetEl = e.currentTarget;

          const holdTimer = window.setTimeout(() => {
            if (!stateRef.current || stateRef.current.pointerId !== pointerId) {
              return;
            }
            stateRef.current.isQuantizing = true;
            stateRef.current.suppressNextClick = true;
            try {
              targetEl.setPointerCapture(pointerId);
            } catch {
              // Ignore if capture is unavailable
            }
            setActiveDrag({
              slotKey,
              currentCount: stateRef.current.currentCount,
              maxCount: slotCount,
              clientX: stateRef.current.startX,
              clientY: stateRef.current.startY,
            });
          }, 165);

          stateRef.current = {
            pointerId,
            slotKey,
            maxCount: slotCount,
            startX: clientX,
            startY: clientY,
            isQuantizing: false,
            currentCount: initialCount,
            holdTimer,
            suppressNextClick: false,
          };
        },
        onPointerMove: (e) => {
          const st = stateRef.current;
          if (!st || st.pointerId !== e.pointerId || st.slotKey !== slotKey) {
            return;
          }
          const dx = e.clientX - st.startX;
          const dy = e.clientY - st.startY;

          if (!st.isQuantizing) {
            // If user scrolls vertically before hold timer fires, cancel hold so scroll works naturally
            if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
              clearHoldTimer();
              stateRef.current = null;
              return;
            }
            // If user drags horizontally deliberately, activate quantization immediately
            if (Math.abs(dx) >= 10 && Math.abs(dx) > Math.abs(dy)) {
              clearHoldTimer();
              st.isQuantizing = true;
              st.suppressNextClick = true;
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // Ignore
              }
            } else {
              return;
            }
          }

          e.preventDefault();
          const nextCount = computeCountFromDx(dx, st.maxCount);
          st.currentCount = nextCount;
          setActiveDrag({
            slotKey,
            currentCount: nextCount,
            maxCount: st.maxCount,
            clientX: e.clientX,
            clientY: st.startY,
          });
        },
        onPointerUp: (e) => {
          const st = stateRef.current;
          if (!st || st.pointerId !== e.pointerId || st.slotKey !== slotKey) {
            return;
          }
          clearHoldTimer();
          try {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          } catch {
            // Ignore
          }

          if (st.isQuantizing) {
            e.preventDefault();
            e.stopPropagation();
            const chosen = st.currentCount;
            const max = st.maxCount;
            setActiveDrag(null);
            onSelectWithCount(slotKey, chosen, max);
            window.setTimeout(() => {
              if (stateRef.current?.slotKey === slotKey) {
                stateRef.current = null;
              }
            }, 60);
            return;
          }

          stateRef.current = null;
          setActiveDrag(null);
        },
        onPointerCancel: (e) => {
          const st = stateRef.current;
          if (!st || st.pointerId !== e.pointerId) return;
          clearHoldTimer();
          stateRef.current = null;
          setActiveDrag(null);
        },
        onClick: (e) => {
          if (stateRef.current?.suppressNextClick) {
            e.preventDefault();
            e.stopPropagation();
            stateRef.current = null;
            return;
          }
          onSlotTap(slotKey);
        },
      };
    },
    [onSelectWithCount, onSlotTap]
  );

  return {
    activeDrag,
    getSlotGestureProps,
  };
}

export const StackDragFloatingHud: React.FC<{
  drag: ActiveQuantizedDrag<any> | null;
}> = ({ drag }) => {
  if (!drag) return null;
  const pct =
    drag.maxCount > 1
      ? Math.round(((drag.currentCount - 1) / (drag.maxCount - 1)) * 100)
      : 100;
  const clampedLeft =
    typeof window !== 'undefined'
      ? Math.max(75, Math.min(window.innerWidth - 75, drag.clientX))
      : drag.clientX;
  const clampedTop =
    typeof window !== 'undefined'
      ? Math.max(58, drag.clientY - 46)
      : drag.clientY - 46;

  return (
    <div
      style={{
        left: `${clampedLeft}px`,
        top: `${clampedTop}px`,
        transform: 'translate(-50%, -50%)',
      }}
      className="fixed z-[120] pointer-events-none bg-[#160e09]/95 border-2 border-amber-400 px-2.5 py-1.5 rounded-sm shadow-[0_6px_20px_rgba(0,0,0,0.9)] flex flex-col items-center gap-1 min-w-[124px]"
    >
      <div className="flex items-center justify-between w-full text-[10px] font-pixel font-bold text-amber-300">
        <span className="text-[#c4ab7d]">◀</span>
        <span className="text-xs text-[#fef08a] font-mono-tabular">
          {drag.currentCount} / {drag.maxCount}
        </span>
        <span className="text-[#c4ab7d]">▶</span>
      </div>
      <div className="w-full h-2 bg-black/80 border border-[#5c3d28] rounded-sm overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-75"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[8px] text-[#c4ab7d] leading-none">
        Arraste ◀ ▶ e solte
      </span>
    </div>
  );
};
