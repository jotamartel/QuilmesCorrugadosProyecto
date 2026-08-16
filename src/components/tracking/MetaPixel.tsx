'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { identidadRecordada } from '@/lib/marketing/identidad';

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

/**
 * Meta Pixel para campañas en Facebook e Instagram.
 * Carga fbq cuando NEXT_PUBLIC_META_PIXEL_ID esta configurado.
 *
 * Arranca con "advanced matching" manual: si el visitante ya se identifico en
 * alguna visita anterior, el pixel se inicializa con su email y telefono
 * hasheados. La diferencia no es cosmetica —Meta reporta match rates bastante
 * mas altos con advanced matching—, y un match mas alto significa mas gente
 * que efectivamente entra en las audiencias de retargeting y mas conversiones
 * atribuidas a la campaña que las genero.
 *
 * A Meta nunca se le manda un dato en claro: lo que se pasa es el SHA-256 que
 * calculo el navegador (ver src/lib/marketing/identidad.ts).
 *
 * Eventos mapeados: ver src/lib/utils/tracking.ts
 */
export function MetaPixel() {
  const pathname = usePathname();

  useEffect(() => {
    if (!PIXEL_ID || typeof window === 'undefined') return;
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
    if (typeof fbq !== 'function') return;

    // Si la persona se identifico despues de que cargo el script, re-inicializar
    // con sus datos hace que los eventos siguientes ya viajen identificados.
    const id = identidadRecordada();
    if (id && Object.keys(id).length > 0) {
      fbq('init', PIXEL_ID, id);
    }

    fbq('track', 'PageView');
  }, [pathname]);

  if (!PIXEL_ID) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          (function(){
            var am = {};
            try {
              var g = localStorage.getItem('qc_identidad');
              if (g) am = JSON.parse(g) || {};
            } catch (e) {}
            if (Object.keys(am).length) { fbq('init', '${PIXEL_ID}', am); }
            else { fbq('init', '${PIXEL_ID}'); }
          })();
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
