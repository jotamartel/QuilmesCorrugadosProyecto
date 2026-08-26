/**
 * Tracking utility for Facebook Pixel and Google Ads
 * Events are only fired if the corresponding pixel/tag IDs are configured.
 *
 * Usa los tags GLOBALES del layout raíz (MetaPixel + GoogleAds): este módulo
 * no carga scripts propios. Antes vivía sobre RetailTracking, que duplicaba
 * fbevents.js y gtag.js en /cajas con otra env var (NEXT_PUBLIC_FB_PIXEL_ID)
 * y sin advanced matching; ahora comparte gate, identidad y espejo a la
 * Conversions API con el resto del sitio.
 */

import { nuevoEventId } from '@/lib/marketing/identidad';
import { espejarACapi } from '@/lib/utils/tracking';

type TrackingEventName =
  | 'PageView'
  | 'ViewContent'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'Lead';

interface TrackingParams {
  content_name?: string;
  content_category?: string;
  value?: number;
  currency?: string;
  [key: string]: string | number | boolean | undefined;
}

// Extend window for FB Pixel and gtag
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

// Mismo gate que MetaPixel en el layout raíz: si se seteara otra variable acá
// (como la vieja NEXT_PUBLIC_FB_PIXEL_ID) la configuración quedaría partida.
const FB_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const GADS_CONVERSION_LABEL = process.env.NEXT_PUBLIC_GADS_CONVERSION_LABEL;

// La Conversions API acepta estos nombres (ver /api/marketing/evento):
// AddToCart y PageView quedan solo en el pixel.
const EVENTOS_CAPI = new Set(['ViewContent', 'InitiateCheckout', 'Lead']);

function fbTrack(event: string, params?: TrackingParams) {
  if (typeof window === 'undefined' || !window.fbq || !FB_PIXEL_ID) return;
  // Mismo event_id en pixel y CAPI: Meta deduplica y los dos caminos suman
  // cobertura (bloqueadores, ITP) en vez de duplicar conversiones.
  const eventId = nuevoEventId(event);
  window.fbq('track', event, params ?? {}, { eventID: eventId });
  if (EVENTOS_CAPI.has(event)) {
    espejarACapi(event, eventId, params as Record<string, unknown> | undefined);
  }
}

function gtagEvent(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.gtag || !GOOGLE_ADS_ID) return;
  window.gtag('event', eventName, params || {});
}

// Map of game events to tracking calls
const EVENT_MAP: Record<TrackingEventName, {
  fb: { event: string; getParams?: (p?: TrackingParams) => TrackingParams };
  google: { event: string; getParams?: (p?: TrackingParams) => Record<string, unknown> };
}> = {
  PageView: {
    fb: { event: 'PageView' },
    google: { event: 'page_view' },
  },
  ViewContent: {
    fb: {
      event: 'ViewContent',
      getParams: (p) => ({
        content_name: 'Caja personalizada',
        content_category: 'Corrugados',
        ...p,
      }),
    },
    google: {
      event: 'view_item',
      getParams: (p) => ({
        item_name: 'Caja personalizada',
        item_category: 'Corrugados',
        ...p,
      }),
    },
  },
  AddToCart: {
    fb: {
      event: 'AddToCart',
      getParams: (p) => ({
        content_name: 'Caja personalizada',
        content_category: 'Corrugados',
        currency: 'ARS',
        ...p,
      }),
    },
    google: {
      event: 'add_to_cart',
      getParams: (p) => ({
        currency: 'ARS',
        ...p,
      }),
    },
  },
  InitiateCheckout: {
    fb: {
      event: 'InitiateCheckout',
      getParams: (p) => ({
        currency: 'ARS',
        ...p,
      }),
    },
    google: {
      event: 'begin_checkout',
      getParams: (p) => ({
        currency: 'ARS',
        ...p,
      }),
    },
  },
  Lead: {
    fb: {
      event: 'Lead',
      getParams: (p) => ({
        content_name: 'Cotización retail',
        currency: 'ARS',
        ...p,
      }),
    },
    google: {
      event: 'conversion',
      getParams: (p) => ({
        send_to: GADS_CONVERSION_LABEL ? `${GOOGLE_ADS_ID}/${GADS_CONVERSION_LABEL}` : undefined,
        currency: 'ARS',
        ...p,
      }),
    },
  },
};

export function trackEvent(eventName: TrackingEventName, params?: TrackingParams) {
  const mapping = EVENT_MAP[eventName];
  if (!mapping) return;

  // Facebook Pixel
  const fbParams = mapping.fb.getParams ? mapping.fb.getParams(params) : params;
  fbTrack(mapping.fb.event, fbParams);

  // Google Ads
  const googleParams = mapping.google.getParams ? mapping.google.getParams(params) : (params as Record<string, unknown>);
  gtagEvent(mapping.google.event, googleParams);
}
