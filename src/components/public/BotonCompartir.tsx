'use client';

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { trackEvent } from '@/lib/utils/tracking';

/**
 * Boton para compartir la pagina.
 *
 * En B2B esto no es un gesto social: quien cotiza casi nunca es quien
 * autoriza. El encargado de compras arma el numero y se lo tiene que pasar al
 * dueño o al area de finanzas. Hoy eso se resuelve con una captura de
 * pantalla, que llega sin link, sin precio actualizado y sin forma de volver.
 * Un boton de compartir convierte ese reenvio en una visita mas, atribuible.
 *
 * Usa la Web Share API, que en movil abre WhatsApp y mail directo. Donde no
 * existe —la mayoria de los escritorios— copia el link, que es lo que la
 * persona iba a hacer igual.
 */
export function BotonCompartir({
  titulo,
  texto,
  className = '',
}: {
  titulo: string;
  texto?: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function compartir() {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: texto, url });
        trackEvent('whatsapp_click', { source: 'boton_compartir', via: 'web_share' });
        return;
      } catch {
        // El usuario cancelo el dialogo. No es un error ni amerita el fallback.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      trackEvent('whatsapp_click', { source: 'boton_compartir', via: 'portapapeles' });
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin permiso de portapapeles: no hay nada mejor que hacer */
    }
  }

  return (
    <button
      type="button"
      onClick={compartir}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-[#002E55] hover:text-[#002E55] ${className}`}
    >
      {copiado ? (
        <>
          <Check className="h-4 w-4" aria-hidden="true" />
          Link copiado
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Compartir
        </>
      )}
    </button>
  );
}
