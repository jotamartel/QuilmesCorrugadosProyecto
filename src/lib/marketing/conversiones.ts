/**
 * Conversiones offline: avisarle a Meta y a Google cuándo una cotización se
 * convirtió en venta.
 *
 * Por qué importa: hoy los algoritmos de las plataformas optimizan por
 * "formulario completado". No distinguen entre alguien que cotizó $80.000 y
 * nunca contestó, y alguien que cerró $5 millones. Devolviéndoles la venta
 * real con su monto, aprenden a buscar el segundo. Es lo que convierte una
 * campaña que trae volumen en una que trae facturación.
 *
 * El circuito se apoya en los click IDs que ya se guardan al cotizar
 * (gclid, fbclid) y en el email/teléfono hasheados.
 *
 * SOBRE LOS DATOS PERSONALES: a las plataformas nunca se les manda un email o
 * un teléfono en claro. Se envía el SHA-256 del valor normalizado, que es el
 * formato que ellas exigen y que les permite cruzar sin conocer el dato. Aun
 * así, usar datos de clientes para publicidad requiere que el aviso de
 * privacidad lo contemple: verificarlo antes de activar esto en serio.
 */

import crypto from 'crypto';

const META_PIXEL_ID = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_FB_PIXEL_ID;
const META_CAPI_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
const META_API_VERSION = 'v21.0';

export interface VentaCerrada {
  quoteId: string;
  quoteNumber: number | string;
  /** Monto de la venta, sin IVA */
  monto: number;
  email?: string | null;
  telefono?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  /** Cuándo se cotizó, para reconstruir el fbc */
  cotizadoEn?: string | null;
  /** Cuándo se cerró la venta */
  cerradoEn?: string | null;
}

/** SHA-256 del valor normalizado, que es lo que piden las plataformas. */
function hash(valor: string | null | undefined): string | undefined {
  if (!valor) return undefined;
  const limpio = valor.trim().toLowerCase();
  if (!limpio) return undefined;
  return crypto.createHash('sha256').update(limpio).digest('hex');
}

/** Teléfono en formato E.164 sin el +, que es como lo espera Meta. */
function normalizarTelefono(tel: string | null | undefined): string | undefined {
  if (!tel) return undefined;
  const soloDigitos = tel.replace(/\D/g, '');
  if (soloDigitos.length < 8) return undefined;
  // Argentina: si no trae código de país, se le antepone el 54.
  return soloDigitos.startsWith('54') ? soloDigitos : `54${soloDigitos}`;
}

/**
 * Reconstruye el parámetro fbc a partir del fbclid.
 * Formato de Meta: fb.{subdominio}.{timestamp_ms}.{fbclid}
 */
function construirFbc(fbclid: string, cuando: string | null | undefined): string {
  const ts = cuando ? new Date(cuando).getTime() : Date.now();
  return `fb.1.${ts}.${fbclid}`;
}

export function metaEstaConfigurado(): boolean {
  return !!(META_PIXEL_ID && META_CAPI_TOKEN);
}

/**
 * Reporta la venta a la API de Conversiones de Meta.
 * Si no está configurada, no hace nada y lo dice: nunca tira.
 */
export async function reportarVentaAMeta(venta: VentaCerrada): Promise<{ ok: boolean; detalle: string }> {
  if (!metaEstaConfigurado()) {
    return { ok: false, detalle: 'Meta CAPI sin configurar (faltan META_PIXEL_ID o META_CAPI_ACCESS_TOKEN)' };
  }

  const cuando = venta.cerradoEn ? new Date(venta.cerradoEn) : new Date();

  const userData: Record<string, string> = {};
  const em = hash(venta.email);
  if (em) userData.em = em;
  const ph = hash(normalizarTelefono(venta.telefono));
  if (ph) userData.ph = ph;
  if (venta.fbclid) userData.fbc = construirFbc(venta.fbclid, venta.cotizadoEn);

  // Sin ninguna señal de identidad, Meta no puede atribuir nada.
  if (Object.keys(userData).length === 0) {
    return { ok: false, detalle: 'sin email, telefono ni fbclid: no hay con que atribuir' };
  }

  const payload = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(cuando.getTime() / 1000),
        event_id: `venta-${venta.quoteId}`, // deduplica si se reporta dos veces
        action_source: 'system_generated',
        user_data: userData,
        custom_data: {
          currency: 'ARS',
          value: Math.round(venta.monto),
          order_id: String(venta.quoteNumber),
        },
      },
    ],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events?access_token=${META_CAPI_TOKEN}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, detalle: `Meta respondio ${res.status}: ${JSON.stringify(json).slice(0, 200)}` };
    }
    return { ok: true, detalle: `Meta recibio la venta (${JSON.stringify(json).slice(0, 120)})` };
  } catch (err) {
    return { ok: false, detalle: `Error llamando a Meta: ${(err as Error).message}` };
  }
}

/**
 * Una fila del CSV de conversiones offline de Google Ads.
 *
 * Google Ads tiene dos caminos: la API (que necesita OAuth, developer token y
 * aprobación) o subir un CSV desde el panel. El CSV funciona hoy, sin ninguna
 * credencial, así que es por donde conviene empezar: se exporta, se sube, y si
 * mas adelante el volumen lo justifica se automatiza con la API.
 */
export interface FilaGoogleAds {
  gclid: string;
  nombreConversion: string;
  fecha: string;
  valor: number;
  moneda: string;
}

/** Fecha en el formato que exige Google Ads: "yyyy-MM-dd HH:mm:ss". */
export function fechaGoogleAds(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Arma el CSV completo, con la línea de parámetros que Google exige arriba.
 * La zona horaria tiene que coincidir con la de la cuenta de Google Ads.
 */
export function construirCsvGoogleAds(filas: FilaGoogleAds[], zonaHoraria = 'America/Argentina/Buenos_Aires'): string {
  const escapar = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lineas = [
    `Parameters:TimeZone=${zonaHoraria}`,
    'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency',
    ...filas.map((f) =>
      [escapar(f.gclid), escapar(f.nombreConversion), escapar(f.fecha), String(Math.round(f.valor)), f.moneda].join(','),
    ),
  ];
  return lineas.join('\n') + '\n';
}
