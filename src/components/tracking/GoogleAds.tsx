'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { identidadRecordada, paraGoogle } from '@/lib/marketing/identidad';

const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID; // formato AW-XXXXXXXXX

/**
 * Etiqueta de Google Ads, separada de la de GA4.
 *
 * Por que hace falta si ya esta GA4: vincular GA4 con Google Ads e importar
 * conversiones funciona, pero se paga un precio. La importacion tarda horas,
 * pierde resolucion a nivel gclid y —lo que mas duele— no habilita enhanced
 * conversions, que es el mecanismo por el cual Google recupera conversiones
 * que el navegador no pudo atribuir. En un negocio donde el cierre pasa por
 * WhatsApp y por telefono, esa recuperacion es la diferencia entre una campaña
 * que parece no rendir y una que se puede escalar.
 *
 * La etiqueta AW convive con la de GA4 sin conflicto: las dos usan el mismo
 * gtag, con dos 'config' distintos.
 *
 * A Google se le pasa el mismo user_data hasheado que a Meta, traducido a sus
 * nombres de campo. Nunca un dato en claro.
 */
export function GoogleAds() {
  useEffect(() => {
    if (!ADS_ID || typeof window === 'undefined') return;
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    if (typeof gtag !== 'function') return;

    const id = identidadRecordada();
    if (id) {
      const datos = paraGoogle(id);
      if (Object.keys(datos).length) gtag('set', 'user_data', datos);
    }
  }, []);

  if (!ADS_ID) return null;

  return (
    <>
      {/* Carga su propio gtag.js en vez de depender del de GA4: si mañana se
          saca la medicion de Analytics, la etiqueta de Ads tiene que seguir
          viva. El navegador cachea el archivo, asi que el costo es nulo, y
          gtag admite varios 'config' sobre el mismo dataLayer. */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads" strategy="afterInteractive">
        {`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        (function(){
          try {
            var g = localStorage.getItem('qc_identidad');
            if (g) {
              var h = JSON.parse(g) || {};
              var ud = {};
              if (h.em) ud.sha256_email_address = h.em;
              if (h.ph) ud.sha256_phone_number = h.ph;
              if (Object.keys(ud).length) gtag('set', 'user_data', ud);
            }
          } catch (e) {}
        })();
        gtag('config', '${ADS_ID}', { allow_enhanced_conversions: true });
      `}
      </Script>
    </>
  );
}
