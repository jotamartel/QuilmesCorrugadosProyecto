'use client';

import Script from 'next/script';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/**
 * Google Analytics 4 + base para Google Ads
 * Carga gtag.js cuando NEXT_PUBLIC_GA_MEASUREMENT_ID está configurado.
 * Remarketing y conversiones se habilitan automáticamente con GA4.
 * Para Google Ads: vincular GA4 a Google Ads e importar conversiones desde eventos.
 *
 * Eventos mapeados para conversiones (configurar en Google Ads):
 * - quote_submitted → Cotización completada (primaria)
 * - contact_form_submitted → Formulario contacto (primaria)
 * - whatsapp_click → Clic WhatsApp (secundaria)
 * - phone_click → Clic teléfono (secundaria)
 */
export function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', {
            page_path: window.location.pathname,
            send_page_view: true
          });
        `}
      </Script>
    </>
  );
}
