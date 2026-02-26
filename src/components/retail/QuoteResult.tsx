'use client';

import { useState } from 'react';
import type { BoxQuoteLine } from '@/lib/retail/types';
import { formatPrecio } from '@/lib/retail/pricing';
import { RETAIL_CONFIG } from '@/lib/retail/config';

interface QuoteResultProps {
  boxes: BoxQuoteLine[];
  visible: boolean;
  onReset: () => void;
  onOrder: () => Promise<void>;
}

export default function QuoteResult({ boxes, visible, onReset, onOrder }: QuoteResultProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleOrder = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onOrder();
    } catch {
      setError('Error al enviar. Intenta de nuevo.');
      setSubmitting(false);
    }
  };

  const precioTotal = boxes.reduce((sum, b) => sum + b.subtotal, 0);
  const totalM2 = boxes.reduce((sum, b) => sum + b.totalM2, 0);
  const hasMayorista = boxes.some(b => b.isMayorista);
  const belowMinimum = precioTotal < RETAIL_CONFIG.PRECIO_MINIMO_PEDIDO;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden"
      style={{
        background: 'var(--retail-bg)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 400ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Header */}
      <div className="pt-safe-top px-6 pt-6 pb-3 text-center">
        <div
          className="text-xs tracking-[0.3em] uppercase mb-2"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            color: 'var(--retail-text-muted)',
          }}
        >
          Quilmes Corrugados
        </div>
        <h2
          className="text-2xl font-bold"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            color: 'var(--retail-text)',
          }}
        >
          Tu cotizacion
        </h2>
      </div>

      {/* Box list */}
      <div className="flex-1 px-6 py-4 overflow-y-auto">
        <div className="max-w-sm mx-auto space-y-3">
          {boxes.map((box, i) => (
            <div
              key={i}
              className="rounded-xl p-4"
              style={{
                background: 'var(--retail-surface)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(20px)',
                transition: `all 400ms cubic-bezier(0.4, 0, 0.2, 1) ${150 + i * 100}ms`,
              }}
            >
              <div className="flex items-baseline justify-between mb-1">
                <span
                  className="text-sm font-semibold tabular-nums"
                  style={{
                    fontFamily: 'var(--font-retail-mono), monospace',
                    color: 'var(--retail-text)',
                  }}
                >
                  {box.largo} x {box.ancho} x {box.alto} mm
                </span>
                <span
                  className="text-xs"
                  style={{
                    fontFamily: 'var(--font-retail-sans), sans-serif',
                    color: 'var(--retail-text-muted)',
                  }}
                >
                  x{box.cantidad}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span
                  className="text-xs tabular-nums"
                  style={{
                    fontFamily: 'var(--font-retail-mono), monospace',
                    color: 'var(--retail-text-muted)',
                  }}
                >
                  {formatPrecio(box.precioUnitario)} /ud
                  {box.isMayorista && (
                    <span style={{ color: 'var(--retail-primary)', marginLeft: '6px' }}>
                      mayorista
                    </span>
                  )}
                </span>
                <span
                  className="text-base font-bold tabular-nums"
                  style={{
                    fontFamily: 'var(--font-retail-mono), monospace',
                    color: 'var(--retail-primary)',
                  }}
                >
                  {formatPrecio(box.subtotal)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div
          className="max-w-sm mx-auto mt-4 pt-4"
          style={{
            borderTop: '2px solid var(--retail-text)',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(20px)',
            transition: `all 400ms cubic-bezier(0.4, 0, 0.2, 1) ${150 + boxes.length * 100}ms`,
          }}
        >
          <div className="flex items-baseline justify-between">
            <span
              className="text-base font-semibold"
              style={{
                fontFamily: 'var(--font-retail-sans), sans-serif',
                color: 'var(--retail-text)',
              }}
            >
              TOTAL
            </span>
            <span
              className="text-2xl font-bold tabular-nums"
              style={{
                fontFamily: 'var(--font-retail-mono), monospace',
                color: 'var(--retail-text)',
              }}
            >
              {formatPrecio(precioTotal)}
            </span>
          </div>
          <p
            className="text-xs mt-2 text-center tabular-nums"
            style={{
              fontFamily: 'var(--font-retail-mono), monospace',
              color: hasMayorista ? 'var(--retail-primary)' : 'var(--retail-text-muted)',
            }}
          >
            {totalM2.toFixed(1)} m²
            {hasMayorista && ' — precio mayorista'}
          </p>
          {belowMinimum && (
            <p
              className="text-xs mt-1 text-center"
              style={{
                fontFamily: 'var(--font-retail-sans), sans-serif',
                color: 'var(--retail-text-muted)',
              }}
            >
              Pedido minimo: {formatPrecio(RETAIL_CONFIG.PRECIO_MINIMO_PEDIDO)}
            </p>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div
        className="px-6 pb-safe-bottom pb-6 space-y-3 max-w-sm mx-auto w-full"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: `all 400ms cubic-bezier(0.4, 0, 0.2, 1) ${300 + boxes.length * 100}ms`,
        }}
      >
        <button
          onClick={handleOrder}
          disabled={submitting}
          className="w-full rounded-2xl py-4 text-base font-semibold tracking-wide active:scale-95 disabled:opacity-50"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            background: 'var(--retail-primary)',
            color: '#fff',
            border: 'none',
            transition: 'transform 150ms',
          }}
        >
          {submitting ? 'ENVIANDO...' : 'SOLICITAR PEDIDO'}
        </button>
        {error && (
          <p
            className="text-xs text-center"
            style={{ color: '#ef4444', fontFamily: 'var(--font-retail-sans), sans-serif' }}
          >
            {error}
          </p>
        )}
        <button
          onClick={onReset}
          disabled={submitting}
          className="w-full rounded-2xl py-3 text-sm font-medium tracking-wide active:scale-95"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            background: 'transparent',
            color: 'var(--retail-text-muted)',
            border: 'none',
            transition: 'transform 150ms',
          }}
        >
          Empezar de nuevo
        </button>
      </div>
    </div>
  );
}
