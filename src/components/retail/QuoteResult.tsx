'use client';

import { useEffect, useState } from 'react';
import type { BoxQuoteLine } from '@/lib/retail/types';
import { formatPrecio, calcularPrecioMinorista } from '@/lib/retail/pricing';
import { RETAIL_CONFIG } from '@/lib/retail/config';

export interface StandardSuggestion {
  id: string;
  name: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  m2_per_box: number;
  stock: number;
}

interface QuoteResultProps {
  boxes: BoxQuoteLine[];
  visible: boolean;
  onReset: () => void;
  onOrder: () => void;
  onSelectStandard?: (box: StandardSuggestion) => void;
}

export default function QuoteResult({ boxes, visible, onReset, onOrder, onSelectStandard }: QuoteResultProps) {

  const precioTotal = boxes.reduce((sum, b) => sum + b.subtotal, 0);
  const totalM2 = boxes.reduce((sum, b) => sum + b.totalM2, 0);
  const hasMayorista = boxes.some(b => b.isMayorista);
  const belowMinimum = precioTotal < RETAIL_CONFIG.PRECIO_MINIMO_PEDIDO;

  // Standard box suggestions (only for < 1000 m²)
  const [suggestions, setSuggestions] = useState<StandardSuggestion[]>([]);
  const [allBoxes, setAllBoxes] = useState<StandardSuggestion[]>([]);
  const [showAllBoxes, setShowAllBoxes] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const primaryBox = boxes[0];
  const showSuggestions = totalM2 < 1000 && onSelectStandard;

  // Whether user is forced to pick a standard box (suggestions present)
  const mustSelectStandard = showSuggestions && suggestions.length > 0;

  useEffect(() => {
    if (!visible || !showSuggestions || !primaryBox) {
      setSuggestions([]);
      setAllBoxes([]);
      setShowAllBoxes(false);
      return;
    }

    let cancelled = false;

    fetch(`/api/public/standard-suggestions?l=${primaryBox.largo}&w=${primaryBox.ancho}&h=${primaryBox.alto}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.suggestions) {
          setSuggestions(data.suggestions);
        }
      })
      .catch(() => {
        // Silently fail — suggestions are optional
      });

    return () => { cancelled = true; };
  }, [visible, showSuggestions, primaryBox?.largo, primaryBox?.ancho, primaryBox?.alto]);

  // Load all standard boxes when "ver todas las medidas" is clicked
  const handleShowAllBoxes = () => {
    if (allBoxes.length > 0) {
      setShowAllBoxes(true);
      return;
    }
    setLoadingAll(true);
    fetch('/api/public/standard-boxes')
      .then((res) => res.json())
      .then((data) => {
        if (data.boxes) {
          setAllBoxes(data.boxes);
          setShowAllBoxes(true);
        }
      })
      .catch(() => {
        // Silently fail
      })
      .finally(() => {
        setLoadingAll(false);
      });
  };

  // Render a suggestion card (reused for both top-2 and "all" list)
  const renderBoxCard = (sug: StandardSuggestion, isDashed: boolean) => {
    const price = calcularPrecioMinorista(
      sug.length_mm, sug.width_mm, sug.height_mm, primaryBox.cantidad
    );
    const hasStock = sug.stock > 0;
    const hasEnoughStock = sug.stock >= primaryBox.cantidad;
    return (
      <div
        key={sug.id}
        className="rounded-xl p-4 flex items-center justify-between gap-3"
        style={{
          background: 'var(--retail-surface)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          border: isDashed
            ? `1px dashed ${hasStock ? 'var(--retail-primary)' : 'var(--retail-border, #d0d0d0)'}`
            : `1px solid var(--retail-border, #e0e0e0)`,
        }}
      >
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-semibold tabular-nums"
            style={{
              fontFamily: 'var(--font-retail-mono), monospace',
              color: 'var(--retail-text)',
            }}
          >
            {sug.length_mm} x {sug.width_mm} x {sug.height_mm} mm
          </div>
          <div className="flex items-baseline gap-3 mt-1">
            <span
              className="text-xs tabular-nums"
              style={{
                fontFamily: 'var(--font-retail-mono), monospace',
                color: 'var(--retail-primary)',
              }}
            >
              {formatPrecio(price.precioUnitario)} /ud
            </span>
            <span
              className="text-xs"
              style={{
                fontFamily: 'var(--font-retail-sans), sans-serif',
                color: hasStock ? '#16a34a' : 'var(--retail-text-muted)',
              }}
            >
              {hasStock
                ? `${sug.stock} en stock`
                : 'Entrega inmediata'}
            </span>
          </div>
        </div>
        <button
          onClick={() => onSelectStandard!(sug)}
          className="rounded-xl px-4 py-2 text-xs font-semibold tracking-wide whitespace-nowrap active:scale-95"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            background: hasEnoughStock ? 'var(--retail-primary)' : 'transparent',
            color: hasEnoughStock ? '#fff' : 'var(--retail-primary)',
            border: hasEnoughStock ? 'none' : '2px solid var(--retail-primary)',
            transition: 'transform 150ms',
          }}
        >
          ELEGIR
        </button>
      </div>
    );
  };

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

        {/* Standard box suggestions — forced selection */}
        {mustSelectStandard && (
          <div
            className="max-w-sm mx-auto mt-6"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(20px)',
              transition: `all 400ms cubic-bezier(0.4, 0, 0.2, 1) ${300 + boxes.length * 100}ms`,
            }}
          >
            <p
              className="text-sm text-center mb-4 leading-relaxed"
              style={{
                fontFamily: 'var(--font-retail-sans), sans-serif',
                color: 'var(--retail-text)',
              }}
            >
              El volumen de cajas solicitado no alcanza para producirlas a medida, elegi alguna de nuestro catalogo, estas son las mas parecidas:
            </p>

            {/* Top 2 closest suggestions */}
            <div className="space-y-2">
              {suggestions.map((sug) => renderBoxCard(sug, true))}
            </div>

            {/* "Ver todas las medidas" toggle */}
            {!showAllBoxes && (
              <button
                onClick={handleShowAllBoxes}
                disabled={loadingAll}
                className="w-full mt-4 py-2 text-sm font-medium tracking-wide active:scale-95"
                style={{
                  fontFamily: 'var(--font-retail-sans), sans-serif',
                  background: 'transparent',
                  color: 'var(--retail-primary)',
                  border: 'none',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                  cursor: 'pointer',
                  transition: 'transform 150ms',
                  opacity: loadingAll ? 0.5 : 1,
                }}
              >
                {loadingAll ? 'Cargando...' : 'Ver todas las medidas'}
              </button>
            )}

            {/* All boxes list */}
            {showAllBoxes && allBoxes.length > 0 && (
              <div className="mt-4">
                <p
                  className="text-xs tracking-[0.15em] uppercase text-center mb-3"
                  style={{
                    fontFamily: 'var(--font-retail-sans), sans-serif',
                    color: 'var(--retail-text-muted)',
                  }}
                >
                  Todas las medidas
                </p>
                <div className="space-y-2">
                  {allBoxes
                    // Don't re-show boxes already in the top-2 suggestions
                    .filter((box) => !suggestions.some((s) => s.id === box.id))
                    .map((box) => renderBoxCard(box, false))}
                </div>
                <button
                  onClick={() => setShowAllBoxes(false)}
                  className="w-full mt-3 py-2 text-xs font-medium tracking-wide"
                  style={{
                    fontFamily: 'var(--font-retail-sans), sans-serif',
                    background: 'transparent',
                    color: 'var(--retail-text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Ocultar
                </button>
              </div>
            )}
          </div>
        )}
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
        {/* Only show COTIZAR ENVIO if user does NOT need to pick a standard box */}
        {!mustSelectStandard && (
          <button
            onClick={onOrder}
            className="w-full rounded-2xl py-4 text-base font-semibold tracking-wide active:scale-95"
            style={{
              fontFamily: 'var(--font-retail-sans), sans-serif',
              background: 'var(--retail-primary)',
              color: '#fff',
              border: 'none',
              transition: 'transform 150ms',
            }}
          >
            COTIZAR ENVIO
          </button>
        )}
        <button
          onClick={onReset}
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
