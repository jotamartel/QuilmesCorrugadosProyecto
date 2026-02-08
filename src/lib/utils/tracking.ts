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
  | 'faq_viewed';

interface EventData {
  [key: string]: unknown;
}

/**
 * Trackea un evento de conversión
 */
export function trackEvent(eventType: ConversionEvent, eventData?: EventData) {
  if (typeof window === 'undefined') return;

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
