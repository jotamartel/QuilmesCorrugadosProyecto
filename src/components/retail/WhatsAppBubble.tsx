'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BoxQuoteLine } from '@/lib/retail/types';
import type { StandardSuggestion } from './QuoteResult';
import { trackEvent } from '@/lib/utils/tracking';

// Mismo numero que src/components/public/WhatsAppButton.tsx.
export const WHATSAPP_NUMBER = '5491169249801';

const APERTURA_MS = 900; // deja respirar la revelacion del precio antes de aparecer

interface WhatsAppBubbleProps {
  boxes: BoxQuoteLine[];
}

function formatMedidas(b: BoxQuoteLine): string {
  return `${b.largo}×${b.ancho}×${b.alto} mm`;
}

/**
 * Globo de dialogo sobre el icono de WhatsApp.
 *
 * Aparece cuando el usuario ya vio su precio y busca convertir esa consulta en
 * una conversacion: repite lo que acaba de cotizar, ofrece las medidas estandar
 * que SI se pueden despachar rapido, y abre WhatsApp con el mensaje escrito.
 *
 * Es click-to-WhatsApp a proposito: el negocio no puede iniciar conversaciones
 * fuera de la ventana de 24hs sin plantilla aprobada, asi que la conversacion
 * tiene que arrancarla el usuario. Ademas convierte mejor que un mensaje frio.
 *
 * BoxGame lo monta y desmonta segun el paso, asi que el estado se reinicia solo
 * cuando el usuario arranca una cotizacion nueva.
 */
export default function WhatsAppBubble({ boxes }: WhatsAppBubbleProps) {
  const [abierto, setAbierto] = useState(false);
  const [cerradoPorUsuario, setCerradoPorUsuario] = useState(false);
  const [sugerencias, setSugerencias] = useState<StandardSuggestion[]>([]);

  // Abrir solo una vez, con un respiro despues de que se revela el precio.
  // Si el usuario ya lo cerro, no volver a insistir.
  useEffect(() => {
    if (cerradoPorUsuario) return;
    const t = setTimeout(() => setAbierto(true), APERTURA_MS);
    return () => clearTimeout(t);
  }, [cerradoPorUsuario]);

  // Buscar medidas estandar con stock suficiente para lo que pidio
  useEffect(() => {
    if (boxes.length === 0) return;
    let cancelado = false;

    Promise.all(
      boxes.map((b) =>
        fetch(`/api/public/standard-suggestions?l=${b.largo}&w=${b.ancho}&h=${b.alto}&qty=${b.cantidad}`)
          .then((r) => r.json())
          .then((d) => (d.suggestions || []) as StandardSuggestion[])
          .catch((err) => {
            console.error('[retail] Error buscando estandar para el globo de WhatsApp:', err);
            return [] as StandardSuggestion[];
          }),
      ),
    ).then((listas) => {
      if (cancelado) return;
      const vistas = new Set<string>();
      const unicas: StandardSuggestion[] = [];
      for (const s of listas.flat()) {
        if (vistas.has(s.id)) continue;
        vistas.add(s.id);
        unicas.push(s);
      }
      setSugerencias(unicas.slice(0, 2));
    });

    return () => { cancelado = true; };
  }, [boxes]);

  const resumen = useMemo(() => {
    if (boxes.length === 0) return '';
    if (boxes.length === 1) {
      const b = boxes[0];
      return `${b.cantidad.toLocaleString('es-AR')} cajas de ${formatMedidas(b)}`;
    }
    const total = boxes.reduce((s, b) => s + b.cantidad, 0);
    return `${total.toLocaleString('es-AR')} cajas en ${boxes.length} medidas`;
  }, [boxes]);

  const mensaje = useMemo(() => {
    const partes = [`Hola! Recién coticé ${resumen} en la web.`];
    if (sugerencias.length) {
      const nombres = sugerencias.map((s) => `${s.length_mm}×${s.width_mm}×${s.height_mm}`).join(' o ');
      partes.push(`Vi que tienen ${nombres} en stock.`);
    }
    partes.push('¿Me confirman plazo de entrega?');
    return partes.join(' ');
  }, [resumen, sugerencias]);

  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`;

  const handleClick = () => {
    trackEvent('whatsapp_click', {
      section: 'retail_bubble',
      message: mensaje.substring(0, 50),
      pagePath: typeof window !== 'undefined' ? window.location.pathname : '/cajas',
    });
  };

  return (
    <>
      <style>{`
        @keyframes qc-bubble-in {
          0%   { opacity: 0; transform: translateY(12px) scale(.86); }
          60%  { opacity: 1; transform: translateY(-3px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes qc-fab-in {
          0%   { opacity: 0; transform: scale(.5); }
          70%  { transform: scale(1.12); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes qc-fab-ring {
          0%   { box-shadow: 0 0 0 0 rgba(37,211,102,.55); }
          70%  { box-shadow: 0 0 0 14px rgba(37,211,102,0); }
          100% { box-shadow: 0 0 0 0 rgba(37,211,102,0); }
        }
        .qc-wa-fab   { animation: qc-fab-in .38s cubic-bezier(.34,1.56,.64,1) both, qc-fab-ring 2.4s ease-out .5s infinite; }
        .qc-wa-globo { animation: qc-bubble-in .42s cubic-bezier(.34,1.56,.64,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .qc-wa-fab, .qc-wa-globo { animation: none; }
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          right: 'max(16px, env(safe-area-inset-right))',
          bottom: 'calc(16px + env(safe-area-inset-bottom))',
          zIndex: 60,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 10,
          pointerEvents: 'none',
        }}
      >
        {abierto && (
          <div
            className="qc-wa-globo"
            style={{
              pointerEvents: 'auto',
              position: 'relative',
              maxWidth: 'min(300px, calc(100vw - 32px))',
              background: 'var(--retail-surface)',
              color: 'var(--retail-text)',
              borderRadius: 16,
              padding: '14px 16px',
              boxShadow: '0 12px 32px rgba(0,0,0,.16)',
              fontFamily: 'var(--font-retail-sans), sans-serif',
            }}
          >
            <button
              onClick={() => { setAbierto(false); setCerradoPorUsuario(true); }}
              aria-label="Cerrar"
              style={{
                position: 'absolute', top: 6, right: 8, border: 0, background: 'transparent',
                color: 'var(--retail-text-muted)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 4,
              }}
            >
              ×
            </button>

            <p style={{ margin: '0 6px 6px 0', fontSize: 14, fontWeight: 600 }}>
              ¿Lo necesitás para los próximos días?
            </p>

            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--retail-text-muted)' }}>
              Coticaste <strong style={{ color: 'var(--retail-text)' }}>{resumen}</strong>.
            </p>

            {sugerencias.length > 0 && (
              <div style={{ margin: '0 0 10px' }}>
                <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--retail-text-muted)' }}>
                  Estas medidas están en stock y salen antes:
                </p>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {sugerencias.map((s) => (
                    <li
                      key={s.id}
                      style={{
                        fontFamily: 'var(--font-retail-mono), monospace',
                        fontSize: 12,
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: 'var(--retail-bg)',
                        color: 'var(--retail-primary)',
                      }}
                    >
                      {s.length_mm}×{s.width_mm}×{s.height_mm}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleClick}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: '#25D366', color: '#fff', textDecoration: 'none',
                borderRadius: 12, padding: '10px 14px', fontSize: 14, fontWeight: 600,
              }}
            >
              Consultar por WhatsApp
            </a>
          </div>
        )}

        <button
          className="qc-wa-fab"
          onClick={() => setAbierto((v) => !v)}
          aria-label={abierto ? 'Ocultar mensaje de WhatsApp' : 'Consultar por WhatsApp'}
          aria-expanded={abierto}
          style={{
            pointerEvents: 'auto',
            width: 56, height: 56, borderRadius: '50%', border: 0, cursor: 'pointer',
            background: '#25D366', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 18px rgba(0,0,0,.2)',
          }}
        >
          {/* Glifo de WhatsApp */}
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.87 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z" />
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.13h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.36c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23z" />
          </svg>
        </button>
      </div>
    </>
  );
}
