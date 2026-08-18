'use client';

import { useEffect, useState } from 'react';
import { trackEvent } from '@/lib/utils/tracking';

const WHATSAPP = '5491133411781';

/**
 * Barra de accion fija al pie, solo en movil.
 *
 * En escritorio el boton de cotizar del hero queda a la vista casi todo el
 * tiempo. En un telefono desaparece apenas la persona empieza a leer, y a
 * partir de ahi la unica forma de actuar es volver a subir. Esa fricción se
 * paga entera: quien se convence leyendo la mitad de la pagina no tiene donde
 * hacer clic.
 *
 * No aparece de entrada. Se muestra despues de que la persona bajo un poco,
 * que es cuando el gesto pasa de interrumpir a ser util, y se esconde cuando
 * el cotizador esta en pantalla para no taparlo ni competir con el.
 */
export function CtaMovilFijo({
  hrefCotizar = '#cotizador',
  mensajeWhatsapp = 'Hola, quiero cotizar cajas de cartón corrugado.',
}: {
  hrefCotizar?: string;
  mensajeWhatsapp?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const cotizador = document.getElementById('cotizador');

    // Si el cotizador esta en pantalla, la barra sobra.
    let cotizadorALaVista = false;
    const observer = cotizador
      ? new IntersectionObserver(
          ([e]) => {
            cotizadorALaVista = e.isIntersecting;
            evaluar();
          },
          { threshold: 0.15 },
        )
      : null;
    if (cotizador && observer) observer.observe(cotizador);

    function evaluar() {
      setVisible(window.scrollY > 400 && !cotizadorALaVista);
    }

    evaluar();
    window.addEventListener('scroll', evaluar, { passive: true });
    return () => {
      window.removeEventListener('scroll', evaluar);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 p-3 backdrop-blur-sm transition-transform duration-300 md:hidden ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
      // Fuera de pantalla no debe ser enfocable con el teclado ni anunciarse.
      aria-hidden={!visible}
    >
      <div
        className="flex items-center gap-2"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <a
          href={hrefCotizar}
          onClick={() => trackEvent('quote_started', { source: 'cta_movil_fijo' })}
          className="flex-1 rounded-lg bg-[#002E55] px-4 py-3 text-center text-sm font-semibold text-white"
          tabIndex={visible ? 0 : -1}
        >
          Cotizar ahora
        </a>
        <a
          href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensajeWhatsapp)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent('whatsapp_click', { source: 'cta_movil_fijo' })}
          className="rounded-lg border-2 border-[#25D366] px-4 py-3 text-sm font-semibold text-[#128C7E]"
          tabIndex={visible ? 0 : -1}
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
}
