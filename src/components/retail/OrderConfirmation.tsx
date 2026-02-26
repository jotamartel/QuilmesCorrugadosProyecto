'use client';

import type { BoxQuoteLine, ShippingData } from '@/lib/retail/types';
import { formatPrecio } from '@/lib/retail/pricing';

interface OrderConfirmationProps {
  boxes: BoxQuoteLine[];
  visible: boolean;
  onReset: () => void;
  shippingData?: ShippingData | null;
}

export default function OrderConfirmation({ boxes, visible, onReset, shippingData }: OrderConfirmationProps) {
  const precioProductos = boxes.reduce((sum, b) => sum + b.subtotal, 0);
  const shippingCost = shippingData?.costConfirmed ? shippingData.cost : 0;
  const precioTotal = precioProductos + shippingCost;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center overflow-hidden px-6"
      style={{
        background: 'var(--retail-bg)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 400ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div
        className="max-w-sm w-full text-center space-y-6"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.95)',
          transition: 'all 500ms cubic-bezier(0.4, 0, 0.2, 1) 200ms',
        }}
      >
        {/* Checkmark */}
        <div
          className="mx-auto w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: 'var(--retail-primary)' }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        {/* Title */}
        <div>
          <h2
            className="text-2xl font-bold mb-2"
            style={{
              fontFamily: 'var(--font-retail-sans), sans-serif',
              color: 'var(--retail-text)',
            }}
          >
            Cotizacion enviada
          </h2>
          <p
            className="text-sm"
            style={{
              fontFamily: 'var(--font-retail-sans), sans-serif',
              color: 'var(--retail-text-muted)',
            }}
          >
            Te contactaremos pronto para coordinar tu pedido.
          </p>
        </div>

        {/* Summary */}
        <div
          className="rounded-xl p-4 space-y-2"
          style={{
            background: 'var(--retail-surface)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          {boxes.map((box, i) => (
            <div key={i} className="flex items-baseline justify-between">
              <span
                className="text-xs tabular-nums"
                style={{
                  fontFamily: 'var(--font-retail-mono), monospace',
                  color: 'var(--retail-text-muted)',
                }}
              >
                {box.largo}x{box.ancho}x{box.alto}mm x{box.cantidad}
              </span>
              <span
                className="text-sm font-semibold tabular-nums"
                style={{
                  fontFamily: 'var(--font-retail-mono), monospace',
                  color: 'var(--retail-text)',
                }}
              >
                {formatPrecio(box.subtotal)}
              </span>
            </div>
          ))}
          {/* Shipping line */}
          {shippingData && (
            <div className="pt-2 flex items-baseline justify-between"
              style={{ borderTop: '1px solid var(--retail-border, #e0e0e0)' }}
            >
              <span
                className="text-xs"
                style={{
                  fontFamily: 'var(--font-retail-sans), sans-serif',
                  color: 'var(--retail-text-muted)',
                }}
              >
                Envio: {shippingData.method === 'retiro_sucursal' ? 'Retiro en sucursal'
                  : shippingData.method === 'envio_caba_amba' ? 'CABA/AMBA'
                  : 'Resto del pais'}
              </span>
              <span
                className="text-sm tabular-nums"
                style={{
                  fontFamily: 'var(--font-retail-mono), monospace',
                  color: shippingData.method === 'retiro_sucursal' ? '#16a34a' : 'var(--retail-text)',
                }}
              >
                {shippingData.method === 'retiro_sucursal'
                  ? 'Gratis'
                  : shippingData.costConfirmed
                    ? formatPrecio(shippingData.cost)
                    : 'A confirmar'}
              </span>
            </div>
          )}

          <div
            className="pt-2 flex items-baseline justify-between"
            style={{ borderTop: shippingData ? 'none' : '1px solid var(--retail-border, #e0e0e0)' }}
          >
            <span
              className="text-sm font-semibold"
              style={{
                fontFamily: 'var(--font-retail-sans), sans-serif',
                color: 'var(--retail-text)',
              }}
            >
              TOTAL
            </span>
            <span
              className="text-lg font-bold tabular-nums"
              style={{
                fontFamily: 'var(--font-retail-mono), monospace',
                color: 'var(--retail-primary)',
              }}
            >
              {shippingData && !shippingData.costConfirmed
                ? `${formatPrecio(precioProductos)} + envio`
                : formatPrecio(precioTotal)}
            </span>
          </div>
        </div>

        {/* Reset button */}
        <button
          onClick={onReset}
          className="w-full rounded-2xl py-3 text-sm font-medium tracking-wide active:scale-95"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            background: 'transparent',
            color: 'var(--retail-text-muted)',
            border: '1px solid var(--retail-border, #e0e0e0)',
            transition: 'transform 150ms',
          }}
        >
          Nueva cotizacion
        </button>
      </div>
    </div>
  );
}
