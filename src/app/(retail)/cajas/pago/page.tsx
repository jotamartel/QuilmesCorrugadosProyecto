'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function PagoContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get('status');
  const quoteId = searchParams.get('quote');
  const paymentId = searchParams.get('payment_id');

  const isApproved = status === 'approved';
  const isPending = status === 'pending' || status === 'in_process';
  const isRejected = status === 'rejected' || status === 'failure';

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-6"
      style={{ background: 'var(--retail-bg)' }}
    >
      <div className="max-w-sm w-full text-center space-y-6">
        {/* Icon */}
        <div
          className="mx-auto w-20 h-20 rounded-full flex items-center justify-center"
          style={{
            background: isApproved
              ? 'var(--retail-primary)'
              : isPending
                ? '#f59e0b'
                : '#ef4444',
          }}
        >
          {isApproved && (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {isPending && (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          )}
          {isRejected && (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
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
            {isApproved && 'Pago aprobado'}
            {isPending && 'Pago en proceso'}
            {isRejected && 'Pago rechazado'}
            {!status && 'Estado del pago'}
          </h2>
          <p
            className="text-sm"
            style={{
              fontFamily: 'var(--font-retail-sans), sans-serif',
              color: 'var(--retail-text-muted)',
            }}
          >
            {isApproved && 'Tu pedido fue confirmado. Te contactaremos pronto para coordinar la entrega.'}
            {isPending && 'Tu pago esta siendo procesado. Te notificaremos cuando se confirme.'}
            {isRejected && 'El pago no pudo ser procesado. Podes intentar nuevamente.'}
            {!status && 'No pudimos determinar el estado de tu pago.'}
          </p>
        </div>

        {/* Payment details */}
        {(paymentId || quoteId) && (
          <div
            className="rounded-xl p-4 text-left space-y-2"
            style={{
              background: 'var(--retail-surface)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            {paymentId && (
              <div className="flex justify-between text-xs">
                <span style={{ fontFamily: 'var(--font-retail-sans), sans-serif', color: 'var(--retail-text-muted)' }}>
                  ID Pago
                </span>
                <span style={{ fontFamily: 'var(--font-retail-mono), monospace', color: 'var(--retail-text)' }}>
                  #{paymentId}
                </span>
              </div>
            )}
            {quoteId && (
              <div className="flex justify-between text-xs">
                <span style={{ fontFamily: 'var(--font-retail-sans), sans-serif', color: 'var(--retail-text-muted)' }}>
                  Cotizacion
                </span>
                <span style={{ fontFamily: 'var(--font-retail-mono), monospace', color: 'var(--retail-text)' }}>
                  #{quoteId.slice(0, 8)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {isRejected && (
            <a
              href="/cajas"
              className="block w-full rounded-2xl py-4 text-base font-semibold tracking-wide text-center"
              style={{
                fontFamily: 'var(--font-retail-sans), sans-serif',
                background: 'var(--retail-primary)',
                color: '#fff',
                textDecoration: 'none',
              }}
            >
              INTENTAR DE NUEVO
            </a>
          )}
          <a
            href="/cajas"
            className="block w-full rounded-2xl py-3 text-sm font-medium tracking-wide text-center"
            style={{
              fontFamily: 'var(--font-retail-sans), sans-serif',
              background: 'transparent',
              color: 'var(--retail-text-muted)',
              border: '1px solid var(--retail-border, #e0e0e0)',
              textDecoration: 'none',
            }}
          >
            {isApproved ? 'Nueva cotizacion' : 'Volver al inicio'}
          </a>
        </div>
      </div>
    </div>
  );
}

export default function PagoPage() {
  return (
    <Suspense
      fallback={
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: 'var(--retail-bg)' }}
        >
          <p style={{ fontFamily: 'var(--font-retail-sans), sans-serif', color: 'var(--retail-text-muted)' }}>
            Cargando...
          </p>
        </div>
      }
    >
      <PagoContent />
    </Suspense>
  );
}
