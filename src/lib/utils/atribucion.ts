/**
 * Atribución de campañas.
 *
 * Responde una pregunta que hoy no se puede contestar: de dónde vino el cliente
 * que cotizó. Había 7.031 visitas y 183 cotizaciones sin ninguna forma de
 * conectarlas, así que no se sabía qué campaña funciona.
 *
 * Se guardan dos momentos, porque cuentan cosas distintas:
 *
 *   PRIMER contacto  — cómo nos conoció. Vive en localStorage y no se pisa
 *                      nunca. Dice qué campaña genera demanda nueva.
 *   ÚLTIMO contacto  — qué lo trajo el día que cotizó. Vive en sessionStorage.
 *                      Dice qué campaña cierra.
 *
 * Una campaña de reconocimiento puede tener pésimo último contacto y ser la
 * que trae a todos: mirando sólo el último, se corta lo que funciona.
 */

const CLAVE_PRIMERA = 'qc_atrib_primera';
const CLAVE_ULTIMA = 'qc_atrib_ultima';

// Mismas claves que usa el tracking de visitas: reutilizarlas es lo que une la
// cotización con el recorrido previo en web_visits.
const CLAVE_VISITOR = 'traffic_visitor_id';
const CLAVE_SESSION = 'traffic_session_id';

interface Toque {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  landing_page?: string;
  referrer?: string;
  ts?: string;
}

export interface Atribucion extends Toque {
  first_utm_source?: string;
  first_utm_campaign?: string;
  first_landing_page?: string;
  visitor_id?: string;
  session_id?: string;
}

const leer = (store: Storage, clave: string): Toque | null => {
  try {
    const v = store.getItem(clave);
    return v ? (JSON.parse(v) as Toque) : null;
  } catch {
    return null;
  }
};

const guardar = (store: Storage, clave: string, valor: Toque) => {
  try {
    store.setItem(clave, JSON.stringify(valor));
  } catch {
    // Modo incógnito o storage lleno: la atribución es best-effort, nunca
    // debe romper el flujo de cotización.
  }
};

/** Lee los parámetros de campaña de la URL actual. */
function toqueActual(): Toque | null {
  const p = new URLSearchParams(window.location.search);
  const g = (k: string) => p.get(k)?.trim() || undefined;

  const toque: Toque = {
    utm_source: g('utm_source'),
    utm_medium: g('utm_medium'),
    utm_campaign: g('utm_campaign'),
    utm_term: g('utm_term'),
    utm_content: g('utm_content'),
    gclid: g('gclid'),
    fbclid: g('fbclid'),
    landing_page: window.location.pathname,
    referrer: document.referrer || undefined,
    ts: new Date().toISOString(),
  };

  const tieneCampania = !!(toque.utm_source || toque.utm_campaign || toque.gclid || toque.fbclid);

  // Un referrer del propio sitio es navegación interna, no una fuente nueva.
  let referrerExterno = false;
  if (document.referrer) {
    try {
      referrerExterno = new URL(document.referrer).hostname !== window.location.hostname;
    } catch {
      referrerExterno = false;
    }
  }

  // Sin campaña ni referrer externo es tráfico directo o navegación interna:
  // no debe pisar la atribución que ya venía.
  if (!tieneCampania && !referrerExterno) return null;

  return toque;
}

/**
 * Registra la visita. Llamar una vez al cargar cualquier página pública.
 * Es idempotente y no pisa el primer contacto.
 */
export function registrarVisita(): void {
  if (typeof window === 'undefined') return;

  const toque = toqueActual();
  if (!toque) return;

  if (!leer(localStorage, CLAVE_PRIMERA)) {
    guardar(localStorage, CLAVE_PRIMERA, toque);
  }
  guardar(sessionStorage, CLAVE_ULTIMA, toque);
}

/** Arma el payload de atribución para mandar junto con una cotización. */
export function getAtribucion(): Atribucion {
  if (typeof window === 'undefined') return {};

  const ultima = leer(sessionStorage, CLAVE_ULTIMA) || {};
  const primera = leer(localStorage, CLAVE_PRIMERA) || {};

  let visitor_id: string | undefined;
  let session_id: string | undefined;
  try {
    visitor_id = localStorage.getItem(CLAVE_VISITOR) || undefined;
    session_id = sessionStorage.getItem(CLAVE_SESSION) || undefined;
  } catch {
    // sin storage, se manda sin ids
  }

  return {
    utm_source: ultima.utm_source,
    utm_medium: ultima.utm_medium,
    utm_campaign: ultima.utm_campaign,
    utm_term: ultima.utm_term,
    utm_content: ultima.utm_content,
    gclid: ultima.gclid,
    fbclid: ultima.fbclid,
    // Si la sesión actual no trae landing, sirve la página donde está ahora.
    landing_page: ultima.landing_page || window.location.pathname,
    referrer: ultima.referrer,
    first_utm_source: primera.utm_source,
    first_utm_campaign: primera.utm_campaign,
    first_landing_page: primera.landing_page,
    visitor_id,
    session_id,
  };
}

/** Campos que acepta el servidor, para validar del lado de la API. */
export const CAMPOS_ATRIBUCION = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'landing_page', 'referrer',
  'first_utm_source', 'first_utm_campaign', 'first_landing_page',
  'visitor_id', 'session_id',
] as const;

const LARGO_MAX = 500;

/**
 * Toma la atribución de un body y devuelve sólo los campos conocidos, como
 * texto y recortados. Corre en el servidor, así que no toca `window`.
 *
 * El recorte no es paranoia de más: estos valores llegan de la URL, o sea que
 * los escribe cualquiera. Sin límite, alguien puede mandar un utm_campaign de
 * un megabyte y ensuciar la base.
 */
export function sanitizarAtribucion(
  origen: Record<string, unknown> | undefined | null,
): Record<string, string | null> {
  const salida: Record<string, string | null> = {};
  if (!origen) return salida;

  for (const campo of CAMPOS_ATRIBUCION) {
    const v = origen[campo];
    if (typeof v === 'string' && v.trim()) {
      salida[campo] = v.trim().slice(0, LARGO_MAX);
    }
  }
  return salida;
}
