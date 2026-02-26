'use client';

import type { GameState } from '@/lib/retail/types';
import { calcularPrecioMinorista, formatPrecio } from '@/lib/retail/pricing';
import ScrubSlider from './ScrubSlider';

interface GameHeaderProps {
  state: GameState;
  largo: number;
  ancho: number;
  alto: number;
  cantidad: number;
  /** Scrub slider config — only needed during dimension states */
  scrub?: {
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
    validate?: (value: number) => number;
  };
}

function getLabel(state: GameState): string {
  switch (state) {
    case 'SET_LARGO': return 'LARGO';
    case 'SET_ANCHO': return 'ANCHO';
    case 'SET_ALTO': return 'ALTO';
    case 'SET_CANTIDAD': return 'CANTIDAD';
    default: return '';
  }
}

function getValue(state: GameState, largo: number, ancho: number, alto: number, cantidad: number): string {
  switch (state) {
    case 'SET_LARGO': return `${largo} mm`;
    case 'SET_ANCHO': return `${ancho} mm`;
    case 'SET_ALTO': return `${alto} mm`;
    case 'SET_CANTIDAD': return cantidad > 0 ? `${cantidad} uds` : '';
    default: return '';
  }
}

export default function GameHeader({ state, largo, ancho, alto, cantidad, scrub }: GameHeaderProps) {
  const isDimensionState = state === 'SET_LARGO' || state === 'SET_ANCHO' || state === 'SET_ALTO';
  const isQuantityState = state === 'SET_CANTIDAD';
  const showHeader = isDimensionState || isQuantityState;
  const isHidden = state === 'QUOTE';

  // Live price estimate
  const { precioUnitario } = calcularPrecioMinorista(largo, ancho, alto, 1);

  return (
    <div
      className="relative z-10 flex flex-col items-center px-4 pt-6"
      style={{
        opacity: isHidden ? 0 : 1,
        transition: 'opacity 300ms',
        pointerEvents: isHidden ? 'none' : 'auto',
      }}
    >
      {/* Brand */}
      <div
        className="text-xs tracking-[0.3em] uppercase opacity-50 mb-2"
        style={{ fontFamily: 'var(--font-retail-sans), sans-serif', color: 'var(--retail-text-muted)' }}
      >
        Quilmes Corrugados
      </div>

      {/* Dynamic measurement */}
      <div
        className="overflow-hidden"
        style={{
          height: showHeader ? '72px' : '0px',
          opacity: showHeader ? 1 : 0,
          transition: 'all 400ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="text-center">
          <div
            className="text-sm tracking-widest uppercase mb-1"
            style={{
              fontFamily: 'var(--font-retail-sans), sans-serif',
              color: 'var(--retail-primary)',
            }}
          >
            {getLabel(state)}
          </div>
          <div
            className="text-4xl font-semibold tabular-nums"
            style={{
              fontFamily: 'var(--font-retail-mono), monospace',
              color: 'var(--retail-text)',
            }}
          >
            {getValue(state, largo, ancho, alto, cantidad)}
          </div>
        </div>
      </div>

      {/* Live price estimate (subtle) */}
      {isDimensionState && (
        <div
          className="text-xs mt-1 tabular-nums"
          style={{
            fontFamily: 'var(--font-retail-mono), monospace',
            color: 'var(--retail-text-muted)',
            opacity: 0.6,
            transition: 'opacity 300ms',
          }}
        >
          ~{formatPrecio(precioUnitario)} /ud
        </div>
      )}

      {/* Scrub slider for fine adjustment */}
      {scrub && (
        <ScrubSlider
          value={scrub.value}
          min={scrub.min}
          max={scrub.max}
          onChange={scrub.onChange}
          validate={scrub.validate}
          visible={isDimensionState}
        />
      )}
    </div>
  );
}
