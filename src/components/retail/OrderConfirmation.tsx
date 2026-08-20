'use client';

import type { BoxQuoteLine, ShippingData } from '@/lib/retail/types';
import { formatPrecio } from '@/lib/retail/pricing';
import { CONTACTO } from '@/lib/contacto';
import { trackEvent } from '@/lib/utils/tracking';

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

  // El pedido se cierra por WhatsApp: no emitimos link de pago hasta tener el
  // proceso ajustado. Sin esto la pantalla terminaba en "te contactaremos" y la
  // pelota quedaba del lado de la fabrica, que es donde se enfrian los pedidos.
  const detalle = boxes
    .map((b) => `${b.cantidad.toLocaleString('es-AR')} x ${b.largo}x${b.ancho}x${b.alto}mm`)
    .join(', ');
  const mensaje =
    `Hola! Acabo de cerrar una cotizacion en la web: ${detalle}. ` +
    `Total ${formatPrecio(precioProductos)}${shippingData && !shippingData.costConfirmed ? ' + envio' : ''}. ` +
    `Quiero confirmar el pedido.`;

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
            Confirmala por WhatsApp y coordinamos entrega y pago.
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

        {/* Cierre del pedido. Es la accion principal de esta pantalla. */}
        <a
          href={CONTACTO.whatsappCon(mensaje)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent('whatsapp_click', { section: 'retail_confirmacion', totalSqm: boxes.reduce((s, b) => s + b.totalM2, 0) })}
          className="w-full rounded-2xl py-4 text-base font-semibold tracking-wide active:scale-95 flex items-center justify-center gap-2"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            background: '#25D366',
            color: '#fff',
            border: 'none',
            textDecoration: 'none',
            transition: 'transform 150ms',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5 0-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.2-.6-.4zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" />
          </svg>
          Confirmar por WhatsApp
        </a>

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
