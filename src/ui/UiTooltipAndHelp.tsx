import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface HoldIconButtonProps {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
  tooltipTitle: string;
  tooltipDesc?: string;
  tooltipAlign?: 'left' | 'center' | 'right' | 'top';
  children: React.ReactNode;
}

/**
 * Compact icon button that executes `onClick` on tap/click,
 * and shows an explanatory floating tooltip when held (pointer hold) or hovered.
 * Holding on touch/pointer suppresses the click action so the player can safely inspect what an icon does.
 */
export const HoldIconButton: React.FC<HoldIconButtonProps> = ({
  onClick,
  disabled = false,
  className = '',
  tooltipTitle,
  tooltipDesc,
  tooltipAlign = 'center',
  children,
}) => {
  const [showTip, setShowTip] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const didHoldRef = useRef(false);

  const clearHoldTimer = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearHoldTimer();
  }, []);

  const handlePointerDown = () => {
    didHoldRef.current = false;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      didHoldRef.current = true;
      setShowTip(true);
    }, 260);
  };

  const handlePointerUpOrLeave = () => {
    clearHoldTimer();
    if (showTip) {
      window.setTimeout(() => setShowTip(false), 900);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (didHoldRef.current) {
      e.preventDefault();
      e.stopPropagation();
      didHoldRef.current = false;
      return;
    }
    if (onClick && !disabled) {
      onClick(e);
    }
  };

  const alignClass =
    tooltipAlign === 'right'
      ? 'right-0 top-full mt-1.5'
      : tooltipAlign === 'left'
      ? 'left-0 top-full mt-1.5'
      : tooltipAlign === 'top'
      ? 'left-1/2 -translate-x-1/2 bottom-full mb-1.5'
      : 'left-1/2 -translate-x-1/2 top-full mt-1.5';

  return (
    <div className="relative inline-flex items-center justify-center">
      <button
        type="button"
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUpOrLeave}
        onPointerCancel={handlePointerUpOrLeave}
        onPointerLeave={() => {
          clearHoldTimer();
          setShowTip(false);
        }}
        onMouseEnter={() => {
          clearHoldTimer();
          holdTimerRef.current = window.setTimeout(() => {
            setShowTip(true);
          }, 420);
        }}
        onMouseLeave={() => {
          clearHoldTimer();
          setShowTip(false);
        }}
        onClick={handleClick}
        className={`select-none ${className}`}
      >
        {children}
      </button>

      {showTip && (
        <div
          className={`pointer-events-none absolute z-[80] ${alignClass} w-max max-w-[210px] px-2.5 py-1.5 bg-[#120b07] border-2 border-amber-400/80 shadow-[0_6px_18px_rgba(0,0,0,0.92)] text-left`}
        >
          <div className="font-pixel text-[10px] font-bold text-amber-300 leading-tight">
            {tooltipTitle}
          </div>
          {tooltipDesc && (
            <div className="text-[10px] text-[#e5d5b5] leading-snug mt-0.5">
              {tooltipDesc}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface HelpSectionItem {
  title: string;
  body: string;
}

interface WindowHelpButtonProps {
  onClick: () => void;
}

export const WindowHelpButton: React.FC<WindowHelpButtonProps> = ({
  onClick,
}) => (
  <HoldIconButton
    onClick={onClick}
    tooltipTitle="Ajuda da Janela (?)"
    tooltipDesc="Toque para aprender a usar esta janela."
    tooltipAlign="right"
    className="min-h-[34px] min-w-[34px] medieval-btn-wood flex items-center justify-center shrink-0 text-amber-300 font-pixel text-xs font-extrabold"
  >
    <HelpCircle className="w-4 h-4 text-amber-300" />
  </HoldIconButton>
);

interface WindowHelpModalProps {
  title: string;
  subtitle?: string;
  sections: HelpSectionItem[];
  onClose: () => void;
}

export const WindowHelpModal: React.FC<WindowHelpModalProps> = ({
  title,
  subtitle,
  sections,
  onClose,
}) => (
  <div
    className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-3"
    onClick={onClose}
  >
    <div
      className="w-full max-w-lg medieval-panel border-2 border-amber-500/80 overflow-hidden flex flex-col max-h-[88dvh]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3.5 py-2 bg-[#1a110b] border-b-2 border-[#4a301e] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 mc-slot-active flex items-center justify-center shrink-0">
            <HelpCircle className="w-4 h-4 text-amber-300" />
          </div>
          <div className="min-w-0">
            <h3 className="font-pixel text-xs font-bold text-amber-300 truncate">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[10px] text-[#c4ab7d] truncate">{subtitle}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[32px] min-w-[32px] medieval-btn-crimson flex items-center justify-center shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3.5 overflow-y-auto space-y-2.5 bg-[#140c07]">
        {sections.map((sec, idx) => (
          <div
            key={idx}
            className="medieval-inset p-2.5 border border-[#4a301e] space-y-1"
          >
            <div className="font-pixel text-[10px] font-bold text-amber-300">
              {sec.title}
            </div>
            <p className="text-[11px] text-[#e5d5b5] leading-relaxed">
              {sec.body}
            </p>
          </div>
        ))}
        <div className="text-[10px] text-[#a38b65] text-center pt-1">
          💡 Dica: Segure o clique sobre qualquer ícone da interface para ver sua função.
        </div>
      </div>

      <div className="px-3.5 py-2 bg-[#1a110b] border-t border-[#4a301e] flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-4 min-h-[32px] medieval-btn-gold font-pixel text-[10px] font-bold"
        >
          Entendi
        </button>
      </div>
    </div>
  </div>
);
