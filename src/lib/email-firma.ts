/**
 * Comprueba que un POST al webhook de mails entrantes lo haya hecho Resend.
 *
 * POR QUE EXISTE
 *
 * /api/email/inbound es publico —lo golpea Resend, no un usuario logueado— y
 * escribe en `communications` con la service role. Sin esta comprobacion,
 * cualquiera que descubra la URL inserta mensajes en el historial de un cliente
 * a nombre de esa persona, y ademas dispara la respuesta automatica: la cuenta
 * manda —y paga— un mail a la direccion que el que llama quiera.
 *
 * Antes no se notaba porque RLS se tragaba el insert en silencio. Cuando el
 * endpoint paso a createAdminClient(), el mismo POST falso empezo a escribir de
 * verdad.
 *
 * COMO FIRMA RESEND
 *
 * Con Svix, que es el mismo esquema del "standard webhooks". Tres cabeceras:
 *
 *   svix-id         el id del mensaje
 *   svix-timestamp  segundos unix de cuando lo mando
 *   svix-signature  una o varias firmas, separadas por espacio, cada una
 *                   "v1,<base64>". Vienen varias durante una rotacion de clave.
 *
 * La firma es HMAC-SHA256 sobre `${id}.${timestamp}.${cuerpo}`, en base64, con
 * una clave que NO es el texto del secreto: el secreto viene como
 * "whsec_<base64>" y la clave son esos bytes decodificados. Firmar con el texto
 * tal cual da una firma que no cierra nunca.
 *
 * El cuerpo tiene que ser el crudo, byte por byte. Un JSON.parse seguido de un
 * JSON.stringify cambia espacios y orden de claves y rompe la firma: por eso el
 * webhook lee con request.text() UNA sola vez y parsea despues, igual que el de
 * WhatsApp.
 *
 * POR QUE A MANO Y NO CON EL PAQUETE `svix`
 *
 * `svix` esta en node_modules, pero como dependencia transitiva de `resend`, no
 * nuestra: el dia que resend deje de usarlo, el import se rompe sin que nadie
 * haya tocado nada. Son treinta lineas y se prueban solas —
 * scripts/qa-firma-email.mts las corre contra vectores fijos y, mientras el
 * paquete siga estando, tambien contra el.
 *
 * QUE PASA CUANDO FALTA EL SECRETO
 *
 * Mismo criterio que la firma de Meta (ver `rechazaFirmaInvalida` en
 * src/lib/whatsapp-transporte/tipos.ts): sin secreto no se bloquea, se atiende
 * y se avisa fuerte, para que un despliegue al que se le olvido una variable no
 * deje de recibir mails. Con el secreto puesto, una firma que no cierra se
 * rechaza. Que no vengan cabeceras NO es "no puedo comprobar": Resend siempre
 * firma, asi que el que no firma no es Resend.
 */

import crypto from 'node:crypto';

/** Cuanto se acepta de desfasaje entre el reloj de Resend y el nuestro. */
export const TOLERANCIA_EN_SEGUNDOS = 5 * 60;

const PREFIJO_DEL_SECRETO = 'whsec_';

/**
 * El resultado de comprobar el origen.
 *
 * Son tres estados y no un booleano porque "no cierra" y "no tengo con que
 * comprobarlo" llevan a cosas opuestas —uno corta con 403, el otro deja pasar—
 * y colapsarlos en false es exactamente el agujero que esto cierra.
 */
export type VeredictoDeFirma =
  | { estado: 'valida' }
  | { estado: 'invalida'; motivo: MotivoDeRechazo }
  | { estado: 'sin-con-que-comprobar' };

export type MotivoDeRechazo =
  /** No vino alguna de las tres cabeceras. Resend siempre manda las tres. */
  | 'faltan-cabeceras'
  /** El secreto configurado no es un whsec_ valido: no se pudo decodificar. */
  | 'secreto-ilegible'
  /** svix-timestamp no es un numero. */
  | 'timestamp-ilegible'
  /** Fuera de la ventana: o es un reenvio viejo o los relojes estan corridos. */
  | 'timestamp-fuera-de-ventana'
  /** Ninguna de las firmas v1 de la cabecera coincide con la calculada. */
  | 'no-cierra';

/** Las tres cabeceras, tal como llegan. */
export interface CabecerasDeFirma {
  id: string | null;
  timestamp: string | null;
  firma: string | null;
}

/**
 * Saca las cabeceras de una request.
 *
 * Acepta los dos nombres: Svix manda `svix-*` y el estandar que salio de ahi
 * usa `webhook-*`. Resend hoy manda las primeras; leer las dos evita que un
 * cambio de nomenclatura del proveedor deje el endpoint rechazando todo.
 */
export function leerCabecerasDeFirma(cabeceras: Headers): CabecerasDeFirma {
  return {
    id: cabeceras.get('svix-id') ?? cabeceras.get('webhook-id'),
    timestamp: cabeceras.get('svix-timestamp') ?? cabeceras.get('webhook-timestamp'),
    firma: cabeceras.get('svix-signature') ?? cabeceras.get('webhook-signature'),
  };
}

/** Los bytes de la clave, o null si el secreto no es un whsec_ decodificable. */
function claveDelSecreto(secreto: string): Buffer | null {
  const base64 = secreto.startsWith(PREFIJO_DEL_SECRETO)
    ? secreto.slice(PREFIJO_DEL_SECRETO.length)
    : secreto;

  // Buffer.from(x, 'base64') no falla nunca: ante basura devuelve lo que pudo
  // leer, y con "" devuelve vacio. Una clave vacia firma igual y da firmas que
  // no cierran nunca, con el log equivocado, asi que se corta aca.
  const clave = Buffer.from(base64, 'base64');
  return clave.length > 0 ? clave : null;
}

/**
 * La firma que le corresponde a este mensaje, en la forma "v1,<base64>".
 *
 * Exportada para la prueba: verificar con la misma funcion que firma no probaria
 * nada, asi que scripts/qa-firma-email.mts la contrasta ademas contra vectores
 * fijos calculados aparte.
 */
export function firmarComoResend(
  secreto: string,
  id: string,
  timestamp: string | number,
  cuerpoCrudo: string,
): string | null {
  const clave = claveDelSecreto(secreto);
  if (!clave) return null;

  const aFirmar = `${id}.${timestamp}.${cuerpoCrudo}`;
  return 'v1,' + crypto.createHmac('sha256', clave).update(aFirmar, 'utf8').digest('base64');
}

/** Comparacion en tiempo constante que no explota si los largos difieren. */
function igualesEnTiempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * El veredicto sobre el origen de la llamada.
 *
 * Funcion pura: el secreto, las cabeceras, el cuerpo y la hora entran por
 * parametro. Es lo unico de todo esto que decide si un mensaje entra o se
 * rechaza, asi que tiene que poder probarse sin levantar un servidor ni tocar
 * el reloj del sistema — por eso `ahoraEnSegundos` es un argumento.
 */
export function verificarFirmaResend(
  secreto: string | undefined,
  cabeceras: CabecerasDeFirma,
  cuerpoCrudo: string,
  ahoraEnSegundos: number = Math.floor(Date.now() / 1000),
): VeredictoDeFirma {
  // Sin clave no hay nada que comprobar. Unico caso que NO bloquea.
  if (!secreto) return { estado: 'sin-con-que-comprobar' };

  const { id, timestamp, firma } = cabeceras;
  if (!id || !timestamp || !firma) {
    return { estado: 'invalida', motivo: 'faltan-cabeceras' };
  }

  // Anti-replay. Va ANTES de calcular el HMAC: un mensaje viejo capturado
  // entero —cabeceras incluidas— tiene firma perfectamente valida, y lo unico
  // que lo distingue de uno nuevo es la hora. Sin esto, quien haya visto pasar
  // un mail legitimo puede reinyectarlo cuantas veces quiera.
  const segundos = Number(timestamp);
  if (!Number.isFinite(segundos)) {
    return { estado: 'invalida', motivo: 'timestamp-ilegible' };
  }
  // La ventana es para los dos lados: muy viejo es un reenvio, muy nuevo es un
  // reloj corrido —nuestro o de ellos— y tampoco corresponde aceptarlo.
  if (Math.abs(ahoraEnSegundos - segundos) > TOLERANCIA_EN_SEGUNDOS) {
    return { estado: 'invalida', motivo: 'timestamp-fuera-de-ventana' };
  }

  const esperada = firmarComoResend(secreto, id, timestamp, cuerpoCrudo);
  if (!esperada) {
    // Hay secreto pero no sirve. NO es 'sin-con-que-comprobar': un secreto mal
    // pegado dejaria el endpoint abierto justo cuando parece cerrado.
    return { estado: 'invalida', motivo: 'secreto-ilegible' };
  }

  // La cabecera puede traer varias firmas separadas por espacio: durante una
  // rotacion de clave Resend manda la vieja y la nueva. Alcanza con que cierre
  // una. Las versiones que no sean v1 se saltean, no se rechazan: si Svix saca
  // una v2, va a convivir con la v1 antes de reemplazarla.
  for (const versionada of firma.split(' ')) {
    if (!versionada.startsWith('v1,')) continue;
    if (igualesEnTiempoConstante(versionada, esperada)) {
      return { estado: 'valida' };
    }
  }

  return { estado: 'invalida', motivo: 'no-cierra' };
}
