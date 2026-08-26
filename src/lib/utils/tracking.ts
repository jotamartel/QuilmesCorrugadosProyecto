/**
 * Utilidades para tracking de eventos de conversión
 */

import {
  construirIdentidad,
  identidadRecordada,
  recordarIdentidad,
  leerCookie,
  nuevoEventId,
  paraGoogle,
  type DatosDeContacto,
} from '@/lib/marketing/identidad';

// Sin 'landing_page_view' (GA4 ya manda page_view automático, el evento extra
// duplicaba vistas) ni 'contact_form_submitted' (estaba mapeado como conversión
// primaria con value 1500 pero /contacto no tiene formulario: nunca disparó, y
// configurarlo en Google Ads era armar una meta imposible de cumplir).
export type ConversionEvent =
  | 'quoter_viewed'
  | 'quote_started'
  | 'box_added'
  | 'quote_step_2'
  | 'price_revealed'
  | 'quote_submitted'
  | 'whatsapp_click'
  | 'phone_click'
  | 'email_click'
  | 'contact_page_view'
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
  // El monto real de la cotización viaja como totalAmount; 2000 es solo el
  // respaldo para los llamadores que no lo tienen (BelowMinimumModal). Antes
  // el 2000 fijo pisaba siempre al real y el algoritmo de pujas optimizaba
  // por cantidad de leads en vez de por facturación.
  const montoCotizacion =
    typeof base.totalAmount === 'number' ? base.totalAmount : 2000;
  switch (eventType) {
    case 'quote_submitted':
      return {
        event: 'Lead',
        params: { content_name: 'quote_submitted', ...base, value: montoCotizacion, currency: 'ARS' },
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
    case 'contact_page_view':
      return {
        event: 'ViewContent',
        params: { content_name: contentName, content_type: 'product', ...base },
      };
    case 'quote_started':
      return {
        event: 'InitiateCheckout',
        params: { content_name: 'quote_started', ...base },
      };
    case 'price_revealed':
      // El mejor publico de remarketing que tenemos: alguien que dejo sus
      // datos, vio el precio y no compro. Hasta ahora caia en el default y
      // devolvia null, asi que nunca llegaba al Pixel.
      // Se manda con el valor real del pedido para que Meta pueda optimizar
      // por monto y no solo por cantidad de eventos.
      return {
        event: 'ViewContent',
        params: {
          content_name: 'price_revealed',
          content_type: 'product',
          currency: 'ARS',
          ...base,
        },
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
        // Mismo criterio que en el mapeo de Meta: value real de la cotización,
        // 2000 solo como respaldo. El 2000 fijo hacía que tROAS optimizara a
        // ciegas del monto.
        params: {
          ...base,
          value: typeof base.totalAmount === 'number' ? base.totalAmount : 2000,
          currency: 'ARS',
        },
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
    default:
      return { name: eventType, params: base };
  }
}

/**
 * Manda el mismo evento por servidor a la API de Conversiones de Meta.
 *
 * No es redundancia: entre bloqueadores, ITP de Safari y iOS, el pixel del
 * navegador pierde una porcion grande de los eventos. Los dos caminos llevan
 * el mismo event_id, asi que Meta se queda con el que le llegue y descarta el
 * repetido. Es lo que hace que activar los dos sume cobertura en vez de
 * duplicar conversiones.
 *
 * Falla en silencio a proposito: esto es telemetria, nunca puede interrumpir
 * lo que la persona estaba haciendo.
 */
// Exportada para que el tracking del flujo retail (/cajas) espeje sus eventos
// por el mismo camino, con el mismo formato de event_id.
export function espejarACapi(
  nombre: string,
  eventId: string,
  params?: Record<string, unknown>,
) {
  const cuerpo = {
    nombre,
    eventId,
    identidad: identidadRecordada() || {},
    fbp: leerCookie('_fbp'),
    fbc: leerCookie('_fbc'),
    url: window.location.href,
    valor: typeof params?.value === 'number' ? params.value : null,
    contenido: params,
  };

  // keepalive para que el envio sobreviva si la persona navega o cierra justo
  // despues: si no, se pierde exactamente el evento del que se va, que es el
  // que mas interesa para retargeting.
  fetch('/api/marketing/evento', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    keepalive: true,
  }).catch(() => {
    /* telemetria: nunca romper la navegacion */
  });
}

/**
 * Trackea un evento de conversión
 */
export function trackEvent(eventType: ConversionEvent, eventData?: EventData) {
  if (typeof window === 'undefined') return;

  // Un id por evento, compartido entre el pixel y la CAPI.
  const eventId = nuevoEventId(eventType);

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
      (window as any).fbq('track', fbqEvent.event, fbqEvent.params, { eventID: eventId });
      espejarACapi(fbqEvent.event, eventId, fbqEvent.params);
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
 * Marca el momento en que un visitante anonimo pasa a ser una persona.
 *
 * Se llama apenas alguien deja email o telefono: al revelar el precio, al
 * mandar el formulario, al pedir el troquel. Lo que hace:
 *
 *   1. Hashea los datos en el navegador y los guarda. A partir de aca TODO lo
 *      que la persona haga —hoy y cuando vuelva en tres dias— viaja
 *      identificado, no solo este evento.
 *   2. Re-inicializa el pixel de Meta con advanced matching y le pasa a Google
 *      el user_data para enhanced conversions. Ahi es donde sube el match rate
 *      y donde la persona empieza a poder entrar en audiencias.
 * No dispara ningun evento: solo deja la identidad puesta. El evento lo manda
 * quien la llama, despues de esperarla, para que salga ya identificado y no se
 * cuente dos veces.
 *
 * Devuelve si quedo identificada, por si el llamador quiere loguearlo.
 */
export async function identificar(datos: DatosDeContacto): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  let identidad;
  try {
    identidad = await construirIdentidad(datos);
  } catch {
    // crypto.subtle no existe fuera de contexto seguro (http sin TLS).
    // No es motivo para perder nada: se sigue sin identidad.
    return false;
  }

  // Solo el pais no alcanza: si no hay ni email ni telefono, no hay identidad.
  if (!identidad.em && !identidad.ph) return false;

  recordarIdentidad(identidad);

  const fbq = (window as any).fbq;
  if (typeof fbq === 'function' && process.env.NEXT_PUBLIC_META_PIXEL_ID) {
    fbq('init', process.env.NEXT_PUBLIC_META_PIXEL_ID, identidad);
  }

  const gtag = (window as any).gtag;
  if (typeof gtag === 'function') {
    const datosGoogle = paraGoogle(identidad);
    if (Object.keys(datosGoogle).length) gtag('set', 'user_data', datosGoogle);
  }

  return true;
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
