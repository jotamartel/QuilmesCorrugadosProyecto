/**
 * Identidad del visitante para las plataformas de pauta.
 *
 * El problema que resuelve: el pixel del navegador pierde entre un tercio y la
 * mitad de los eventos —bloqueadores, ITP de Safari, iOS, extensiones—. Lo que
 * se pierde no es solo un numero en un panel: es gente que no entra a ninguna
 * audiencia de retargeting y conversiones que el algoritmo nunca ve, asi que
 * nunca aprende a buscar mas parecidos.
 *
 * La unica solucion real es mandar el mismo evento dos veces, por el navegador
 * y por el servidor, y que la plataforma entienda que es UNO. Eso es lo que
 * hace el event_id: si los dos caminos mandan el mismo id, Meta deduplica; si
 * uno se pierde, queda el otro. Sin event_id compartido, activar las dos vias
 * no mejora la cobertura: duplica las conversiones y arruina el aprendizaje.
 *
 * SOBRE LOS DATOS PERSONALES
 * El email y el telefono se hashean ACA, en el navegador, con SHA-256 sobre el
 * valor normalizado. Al servidor propio y a las plataformas solo viaja el
 * hash. Es lo que exigen Meta y Google para el cruce, y significa que la ruta
 * publicitaria nunca transporta el dato en claro.
 *
 * Aun hasheado, esto sigue siendo tratamiento de datos personales con fines
 * publicitarios: la Ley 25.326 pide que el aviso de privacidad lo contemple.
 * Ver docs/PLAN_ADQUISICION.md antes de activar Customer Match.
 */

/** SHA-256 en hexadecimal, con la Web Crypto del navegador. */
async function sha256(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Normaliza el telefono a E.164 sin el "+", que es como lo esperan las dos
 * plataformas. Un numero argentino escrito como "11 3341-1781" y otro como
 * "+5491133411781" tienen que producir el mismo hash o no cruzan con nada.
 */
export function normalizarTelefono(tel: string | null | undefined): string | null {
  if (!tel) return null;
  let d = tel.replace(/\D/g, '');
  if (d.length < 8) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (!d.startsWith('54')) d = `54${d}`;
  return d;
}

/** Email en minusculas y sin espacios. Sin normalizar, el hash no cruza. */
export function normalizarEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const limpio = email.trim().toLowerCase();
  return limpio.includes('@') ? limpio : null;
}

/** Nombre y apellido: minusculas, sin acentos ni puntuacion. */
function normalizarNombre(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpio = valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '')
    .trim();
  return limpio || null;
}

/**
 * user_data hasheado, con los nombres de campo que usa Meta.
 * Google usa otros nombres; los traduce `paraGoogle()`.
 */
export interface IdentidadHasheada {
  /** email */
  em?: string;
  /** telefono */
  ph?: string;
  /** nombre de pila */
  fn?: string;
  /** apellido */
  ln?: string;
  /** ciudad */
  ct?: string;
  /** pais, siempre "ar" hasheado */
  country?: string;
}

export interface DatosDeContacto {
  email?: string | null;
  telefono?: string | null;
  /** Nombre completo; se parte en nombre y apellido. */
  nombre?: string | null;
  ciudad?: string | null;
}

/**
 * Convierte los datos que dejo el visitante en el paquete hasheado que
 * entienden las plataformas. Devuelve solo los campos que existen: mandar
 * campos vacios baja el match rate que reporta Meta.
 */
export async function construirIdentidad(datos: DatosDeContacto): Promise<IdentidadHasheada> {
  const salida: IdentidadHasheada = {};

  const email = normalizarEmail(datos.email);
  if (email) salida.em = await sha256(email);

  const tel = normalizarTelefono(datos.telefono);
  if (tel) salida.ph = await sha256(tel);

  const nombre = normalizarNombre(datos.nombre);
  if (nombre) {
    const partes = nombre.split(/\s+/);
    salida.fn = await sha256(partes[0]);
    if (partes.length > 1) salida.ln = await sha256(partes[partes.length - 1]);
  }

  const ciudad = normalizarNombre(datos.ciudad);
  if (ciudad) salida.ct = await sha256(ciudad.replace(/\s/g, ''));

  // El pais es constante y siempre suma al cruce.
  salida.country = await sha256('ar');

  return salida;
}

/** Los mismos hashes con los nombres de campo de Google (enhanced conversions). */
export function paraGoogle(id: IdentidadHasheada): Record<string, string> {
  const g: Record<string, string> = {};
  if (id.em) g.sha256_email_address = id.em;
  if (id.ph) g.sha256_phone_number = id.ph;
  if (id.fn || id.ln) {
    const dir: Record<string, string> = {};
    if (id.fn) dir.sha256_first_name = id.fn;
    if (id.ln) dir.sha256_last_name = id.ln;
    if (id.ct) dir.city = id.ct;
    dir.country = 'AR';
    (g as Record<string, unknown>).address = dir;
  }
  return g;
}

/**
 * Un id unico por evento, compartido entre el pixel del navegador y la CAPI
 * del servidor. Es la pieza de la que depende toda la deduplicacion.
 */
export function nuevoEventId(prefijo: string): string {
  const azar =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefijo}-${Date.now()}-${azar}`;
}

/** Lee una cookie del navegador. Sirve para _fbp y _fbc, que pone el pixel. */
export function leerCookie(nombre: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

const CLAVE_IDENTIDAD = 'qc_identidad';

/**
 * Guarda la identidad hasheada para reusarla en los eventos siguientes.
 *
 * Sin esto, el unico evento que llega identificado es aquel en el que la
 * persona escribio sus datos. Todo lo que hace despues —volver, mirar precios,
 * abandonar— viaja anonimo y no se puede atribuir ni perseguir. Guardarla
 * convierte una sesion suelta en un recorrido con nombre.
 *
 * Es localStorage a proposito: sobrevive al cierre del navegador, que es
 * exactamente el caso de quien vuelve tres dias despues a decidir.
 */
export function recordarIdentidad(id: IdentidadHasheada): void {
  try {
    localStorage.setItem(CLAVE_IDENTIDAD, JSON.stringify(id));
  } catch {
    /* modo privado o storage lleno: seguir sin romper */
  }
}

export function identidadRecordada(): IdentidadHasheada | null {
  try {
    const crudo = localStorage.getItem(CLAVE_IDENTIDAD);
    return crudo ? (JSON.parse(crudo) as IdentidadHasheada) : null;
  } catch {
    return null;
  }
}

/** Borra la identidad guardada. Necesario para poder honrar una baja. */
export function olvidarIdentidad(): void {
  try {
    localStorage.removeItem(CLAVE_IDENTIDAD);
  } catch {
    /* nada que hacer */
  }
}
