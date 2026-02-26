/**
 * Tracking utility for Facebook Pixel and Google Ads
 * Events are only fired if the corresponding pixel/tag IDs are configured.
 */

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

const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const GADS_CONVERSION_LABEL = process.env.NEXT_PUBLIC_GADS_CONVERSION_LABEL;

function fbTrack(event: string, params?: TrackingParams) {
  if (typeof window === 'undefined' || !window.fbq || !FB_PIXEL_ID) return;
  if (params) {
    window.fbq('track', event, params);
  } else {
    window.fbq('track', event);
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
