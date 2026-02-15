/**
 * Utilidades para tracking de eventos de conversión
 */

export type ConversionEvent =
  | 'landing_page_view'
  | 'quoter_viewed'
  | 'quote_started'
  | 'box_added'
  | 'quote_step_2'
  | 'price_revealed'
  | 'quote_submitted'
  | 'whatsapp_click'
  | 'phone_click'
  | 'email_click'
  | 'contact_form_submitted'
  | 'product_page_view'
  | 'faq_viewed'
  | 'chat_opened'
  | 'chat_message_sent';

interface EventData {
  [key: string]: unknown;
}

/** Mapeo para Meta Pixel (Facebook/Instagram Ads) */
function mapToFbqEvent(
  eventType: ConversionEvent,
  eventData?: EventData
): { event: string; params?: Record<string, unknown> } | null {
  const base = (eventData || {}) as Record<string, unknown>;
  const contentName = (base.section || base.sectionId || eventType) as string;
  switch (eventType) {
    case 'quote_submitted':
      return {
        event: 'Lead',
        params: { content_name: 'quote_submitted', value: 2000, currency: 'ARS', ...base },
      };
    case 'contact_form_submitted':
      return {
        event: 'Lead',
        params: { content_name: 'contact_form_submitted', value: 1500, currency: 'ARS', ...base },
      };
    case 'chat_message_sent':
      return {
        event: 'Lead',
        params: { content_name: 'chat_message_sent', ...base },
      };
    case 'whatsapp_click':
    case 'phone_click':
    case 'email_click':
      return {
        event: 'Contact',
        params: { content_name: eventType, ...base },
      };
    case 'quoter_viewed':
    case 'product_page_view':
      return {
        event: 'ViewContent',
        params: { content_name: contentName, content_type: 'product', ...base },
      };
    case 'quote_started':
      return {
        event: 'InitiateCheckout',
        params: { content_name: 'quote_started', ...base },
      };
    case 'chat_opened':
      return {
        event: 'ViewContent',
        params: { content_name: 'chat_opened', content_type: 'chat', ...base },
      };
    default:
      return null;
  }
}

/** Mapeo para GA4 / Google Ads (Campaña SEM - docs/CAMPANA_SEM_GOOGLE_ADS.md) */
function mapToGtagEvent(
  eventType: ConversionEvent,
  eventData?: EventData
): { name: string; params?: Record<string, unknown> } | null {
  const base = (eventData || {}) as Record<string, unknown>;
  switch (eventType) {
    case 'quote_submitted':
      return {
        name: 'quote_submitted',
        params: { ...base, value: 2000, currency: 'ARS' },
      };
    case 'contact_form_submitted':
      return {
        name: 'contact_form_submitted',
        params: { ...base, value: 1500, currency: 'ARS' },
      };
    case 'whatsapp_click':
      return {
        name: 'whatsapp_click',
        params: { ...base, value: 500, currency: 'ARS' },
      };
    case 'phone_click':
      return {
        name: 'phone_click',
        params: { ...base, value: 500, currency: 'ARS' },
      };
    case 'landing_page_view':
      return { name: 'page_view', params: base };
    default:
      return { name: eventType, params: base };
  }
}

/**
 * Trackea un evento de conversión
 */
export function trackEvent(eventType: ConversionEvent, eventData?: EventData) {
  if (typeof window === 'undefined') return;

  // GA4 / Google Ads: enviar a gtag para conversiones y remarketing
  if (typeof (window as any).gtag === 'function') {
    const gtagEvent = mapToGtagEvent(eventType, eventData);
    if (gtagEvent) {
      (window as any).gtag('event', gtagEvent.name, gtagEvent.params);
    }
  }

  // Meta (Facebook) Pixel: enviar eventos para campañas Meta Ads
  if (typeof (window as any).fbq === 'function') {
    const fbqEvent = mapToFbqEvent(eventType, eventData);
    if (fbqEvent) {
      (window as any).fbq('track', fbqEvent.event, fbqEvent.params);
    }
  }

  // Usar la función global si está disponible (desde TrafficTracker)
  if ((window as any).trackTrafficEvent) {
    (window as any).trackTrafficEvent(eventType, eventData);
    return;
  }

  // Fallback: enviar directamente al API
  const sessionId = sessionStorage.getItem('traffic_session_id') || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const visitorId = localStorage.getItem('traffic_visitor_id') || `vis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  fetch('/api/traffic/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      visitorId,
      pagePath: window.location.pathname,
      pageTitle: document.title,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      eventType,
      eventData: eventData || {},
    }),
  }).catch(() => {
    // Silenciar errores de tracking
  });
}

/**
 * Trackea cuando el usuario hace scroll hasta una sección específica
 */
export function trackScrollToSection(sectionId: string, eventType: ConversionEvent = 'quoter_viewed') {
  if (typeof window === 'undefined') return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          trackEvent(eventType, { sectionId });
          observer.disconnect();
        }
      });
    },
    { threshold: 0.3 }
  );

  const element = document.getElementById(sectionId);
  if (element) {
    observer.observe(element);
  }
}
