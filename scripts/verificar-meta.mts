/**
 * Comprueba, uno por uno, los cuatro valores de la cuenta de WhatsApp de Meta.
 *
 * POR QUÉ EXISTE
 *
 * Meta rechaza las cosas con errores que no dicen cuál de los cuatro está mal.
 * "Error validating access token", "(#100) Invalid parameter" o directamente un
 * alta de webhook que falla sin explicación pueden venir de un token vencido, de
 * un id de número que es el número y no el id, o de un secreto que corresponde a
 * otra app. Buscar eso a mano lleva una tarde.
 *
 * Esto los prueba de a uno contra la API de verdad y dice cuál falla.
 *
 * Solo hace lecturas: ningún GET de acá cambia nada en la cuenta.
 *
 *   npx tsx scripts/verificar-meta.mts
 *
 * Las variables se leen de .env.local o del archivo que hayas bajado con
 * `vercel env pull`. Si las cargaste en Vercel y todavía no las bajaste:
 *   npx vercel env pull .env.qa.tmp
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import crypto from 'node:crypto';

for (const f of ['.env.qa.tmp', '.env.vercel.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const { VERSION_DE_GRAPH: VERSION, VENCE_LA_VERSION } = await import('@/lib/whatsapp-transporte/meta');
// La plantilla que espera el codigo, leida del modulo y no reescrita aca.
// Tenia su propia copia del idioma por defecto —'es'— y cuando el modulo paso
// a es_AR este script siguio comparando contra el viejo y reportaba que no
// coincidian cuando coincidian perfecto. El mismo dato en dos lugares, en el
// script escrito para detectar justamente eso.
const { RETOMAR_CONVERSACION } = await import('@/lib/whatsapp-plantillas');
const TOKEN = process.env.META_WA_TOKEN;
const PHONE_ID = process.env.META_WA_PHONE_NUMBER_ID;
const APP_SECRET = process.env.META_WA_APP_SECRET;
const VERIFY_TOKEN = process.env.META_WA_VERIFY_TOKEN;
const SITIO = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.quilmescorrugados.com.ar';

let problemas = 0;

function bien(t: string) { console.log(`  ✓ ${t}`); }
function mal(t: string, comoSeArregla: string) {
  problemas++;
  console.log(`  ✗ ${t}`);
  console.log(`     → ${comoSeArregla}`);
}

/** Las llamadas van firmadas cuando se puede: es lo que prueba el secreto. */
function conFirma(url: string): string {
  if (!TOKEN || !APP_SECRET) return url;
  const proof = crypto.createHmac('sha256', APP_SECRET).update(TOKEN).digest('hex');
  return url + (url.includes('?') ? '&' : '?') + `appsecret_proof=${proof}`;
}

async function graph(camino: string, firmar = true): Promise<{ ok: boolean; datos: Record<string, unknown> }> {
  const url = `https://graph.facebook.com/${VERSION}/${camino}`;
  const r = await fetch(firmar ? conFirma(url) : url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const datos = await r.json().catch(() => ({}));
  return { ok: r.ok, datos };
}

console.log('');
console.log('LAS VARIABLES ESTÁN CARGADAS');
for (const [nombre, valor] of [
  ['META_WA_TOKEN', TOKEN],
  ['META_WA_PHONE_NUMBER_ID', PHONE_ID],
  ['META_WA_APP_SECRET', APP_SECRET],
  ['META_WA_VERIFY_TOKEN', VERIFY_TOKEN],
] as const) {
  if (valor) bien(`${nombre} (${String(valor).length} caracteres)`);
  else mal(`${nombre} falta`, 'Cargala en Vercel → Settings → Environment Variables y bajá de nuevo con `npx vercel env pull .env.qa.tmp`.');
}

console.log('');
console.log('LA VERSIÓN DE LA API NO ESTÁ POR VENCER');
{
  // Cada version de la Graph API tiene fecha de muerte, y cuando llega las
  // llamadas dejan de funcionar. La anterior fijada acá, v21.0, vencía en enero
  // de 2027: se descubrió de casualidad mirando un ejemplo de la consola de
  // Meta. Que lo avise el verificador es mas barato que volver a tener suerte.
  const faltanDias = Math.round((new Date(VENCE_LA_VERSION).getTime() - Date.now()) / 86_400_000);
  const meses = Math.round(faltanDias / 30);
  if (faltanDias < 0) {
    mal(`${VERSION} venció hace ${-meses} meses`,
        'Subí VERSION_DE_GRAPH en src/lib/whatsapp-transporte/meta.ts. Las llamadas ya deben estar fallando.');
  } else if (faltanDias < 365) {
    mal(`${VERSION} vence en ${meses} meses (${VENCE_LA_VERSION})`,
        'Conviene subirla ahora y no cuando el canal se caiga. La lista esta en developers.facebook.com/docs/graph-api/changelog/versions');
  } else {
    bien(`${VERSION}, vence el ${VENCE_LA_VERSION} (faltan ${meses} meses)`);
  }
}

if (!TOKEN || !PHONE_ID) {
  console.log('\nSin token ni id de número no se puede seguir.\n');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('EL TOKEN SIRVE Y NO VENCE');
{
  const { ok, datos } = await graph('me?fields=id,name', false);
  if (!ok) {
    const e = (datos.error as Record<string, unknown>) || {};
    mal(`el token no lo acepta Meta: ${e.message || 'sin detalle'}`,
        'Generá uno nuevo en business.facebook.com → Configuración del negocio → Usuarios del sistema → Generar token, con los permisos whatsapp_business_messaging y whatsapp_business_management.');
  } else {
    bien(`el token funciona (${datos.name || datos.id})`);

    // Un token de usuario del sistema no tiene fecha de vencimiento. El del
    // panel de la app dura 24 horas, y cuando vence el canal se queda mudo sin
    // avisar, un sábado.
    const { ok: okD, datos: d } = await graph(
      `debug_token?input_token=${encodeURIComponent(TOKEN)}`, false,
    );
    const info = (d.data as Record<string, unknown>) || {};
    if (okD && info.expires_at === 0) {
      bien('no vence (es de usuario del sistema, que es lo que corresponde)');
    } else if (okD && typeof info.expires_at === 'number') {
      const cuando = new Date((info.expires_at as number) * 1000);
      mal(`VENCE el ${cuando.toLocaleString('es-AR')}`,
          'Ese es el token temporal del panel de la app. Generá uno de Usuario del sistema, que no vence: cuando este caduque el canal deja de contestar y no avisa.');
    }
    if (okD && Array.isArray(info.scopes)) {
      const faltan = ['whatsapp_business_messaging', 'whatsapp_business_management']
        .filter((p) => !(info.scopes as string[]).includes(p));
      if (faltan.length) {
        mal(`al token le faltan permisos: ${faltan.join(', ')}`,
            'Volvé a generarlo tildando esos permisos.');
      } else {
        bien('tiene los dos permisos que hacen falta');
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('EL SECRETO DE LA APP ES EL DE ESTA APP');
if (!APP_SECRET) {
  mal('no se puede comprobar sin META_WA_APP_SECRET', 'developers.facebook.com → tu app → Configuración → Básica → Clave secreta.');
} else {
  // appsecret_proof es un HMAC del token con el secreto. Si Meta lo acepta, el
  // secreto es el de la app que emitió el token. Es la única forma de
  // comprobarlo sin esperar a que llegue un mensaje.
  const { ok, datos } = await graph('me?fields=id');
  if (ok) {
    bien('coincide con la app del token (probado con appsecret_proof)');
  } else {
    const e = (datos.error as Record<string, unknown>) || {};
    mal(`Meta rechaza la firma: ${e.message || 'sin detalle'}`,
        'El secreto es de otra app, o está copiado con un espacio. Es el de la MISMA app donde diste de alta el webhook.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('EL ID DEL NÚMERO ES UN ID Y ES DE ESTA CUENTA');
{
  if (/^\+?\d{8,15}$/.test(PHONE_ID) && PHONE_ID.length <= 15) {
    console.log('     (ojo: parece un número de teléfono, no un id)');
  }
  const { ok, datos } = await graph(
    `${PHONE_ID}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,status,name_status,platform_type`,
  );
  if (!ok) {
    const e = (datos.error as Record<string, unknown>) || {};
    mal(`no se pudo leer el número: ${e.message || 'sin detalle'}`,
        'META_WA_PHONE_NUMBER_ID es el "Identificador del número de teléfono" que aparece en Administrador de WhatsApp → API de WhatsApp → Configuración de la API. NO es el número.');
  } else {
    bien(`${datos.display_phone_number} — ${datos.verified_name || 'sin nombre verificado'}`);

    // UNKNOWN no es una falla: es lo que dice un numero que todavia no mando
    // suficientes mensajes como para que Meta lo puntue. Marcarlo en rojo hacia
    // que un numero recien registrado —el caso normal— pareciera roto.
    if (datos.quality_rating === 'UNKNOWN' || !datos.quality_rating) {
      console.log('     calidad: todavia sin puntuar (normal en un numero nuevo)');
    } else if (datos.quality_rating !== 'GREEN') {
      mal(`la calidad del número está en ${datos.quality_rating}`,
          'Meta la baja cuando la gente bloquea o reporta. En rojo limita cuántos mensajes se pueden mandar por día.');
    } else {
      bien('calidad GREEN');
    }

    // Lo que de verdad decide si el numero puede atender.
    if (datos.status === 'CONNECTED') {
      bien('el numero esta REGISTRADO y conectado');
    } else {
      mal(`el numero esta en ${datos.status || 'estado desconocido'}, no CONNECTED`,
          datos.code_verification_status === 'VERIFIED'
            ? 'La verificacion por SMS ya paso; falta el paso "Registrar" con el PIN de 6 digitos. Si ese paso da error, casi siempre es que el numero todavia tiene WhatsApp activo en un celular: hay que ELIMINAR la cuenta desde la app (no cerrar sesion) y esperar la propagacion.'
            : 'Falta verificar el numero con el codigo que manda Meta por SMS o llamada.');
    }

    if (datos.name_status && datos.name_status !== 'APPROVED') {
      console.log(`     nombre visible: ${datos.name_status} — se aprueba despues de registrar el numero`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('LAS PLANTILLAS');
{
  // El id de la cuenta NO se puede sacar del numero: ese campo no existe en la
  // Graph API, y /me/businesses pide un permiso que este token no tiene. Se
  // pasa por variable. Sale del Administrador de WhatsApp, arriba del numero,
  // como "Identificador de la cuenta de WhatsApp Business".
  const waba = process.env.META_WA_WABA_ID;
  if (!waba) {
    console.log('     META_WA_WABA_ID no configurada: no se pueden listar las plantillas.');
    console.log('     Sale del Administrador de WhatsApp, arriba del numero.');
  } else {
    const { ok: okP, datos: p } = await graph(`${waba}/message_templates?fields=name,status,language&limit=50`);
    const lista = (p.data as Array<Record<string, unknown>>) || [];
    if (!okP) {
      console.log('     (no se pudieron listar las plantillas)');
    } else if (lista.length === 0) {
      mal('no hay ninguna plantilla cargada',
          'Sin plantilla no se puede reabrir una conversación pasadas las 24 horas. Cargá "retomar_conversacion" como dice docs/WHATSAPP_API_META.md.');
    } else {
      const nuestra = lista.find((t) => t.name === RETOMAR_CONVERSACION.nombre);
      if (!nuestra) {
        mal(`hay ${lista.length} plantilla(s) pero ninguna se llama "${RETOMAR_CONVERSACION.nombre}"`,
            `Tiene que llamarse "${RETOMAR_CONVERSACION.nombre}", como dice src/lib/whatsapp-plantillas.ts. Hay: ${lista.map((t) => t.name).join(', ')}`);
      } else if (nuestra.status !== 'APPROVED') {
        mal(`"retomar_conversacion" está en ${nuestra.status}`,
            'Hasta que Meta la apruebe no se puede usar. Suele tardar minutos.');
      } else {
        bien(`"${nuestra.name}" aprobada, idioma ${nuestra.language}`);
        if (nuestra.language !== RETOMAR_CONVERSACION.idioma) {
          mal(`el idioma no coincide: en Meta es "${nuestra.language}" y el código usa "${RETOMAR_CONVERSACION.idioma}"`,
              `Poné META_WA_IDIOMA_PLANTILLAS=${nuestra.language} en Vercel, o cambiá el default en src/lib/whatsapp-plantillas.ts.`);
        } else {
          bien(`el idioma coincide con el que espera el código`);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('EL WEBHOOK CONTESTA EL ALTA');
if (!VERIFY_TOKEN) {
  mal('no se puede probar sin META_WA_VERIFY_TOKEN', 'Cargalo en Vercel con el mismo valor que vas a poner en el formulario de Meta.');
} else {
  // Se prueban las dos formas del dominio. NEXT_PUBLIC_SITE_URL puede estar
  // cargada sin www —lo estaba— y entonces esto reportaba un 308 como si el
  // webhook estuviera mal, cuando lo que estaba mal era la URL que yo armaba.
  const base = new URL(SITIO);
  const candidatas = [
    `https://${base.host.startsWith('www.') ? base.host : 'www.' + base.host}`,
    `https://${base.host.replace(/^www\./, '')}`,
  ];

  let url = '';
  let r: Response | null = null;
  let cuerpo = '';
  for (const c of candidatas) {
    url = `${c}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}&hub.challenge=probando123`;
    r = await fetch(url, { redirect: 'manual' });
    cuerpo = await r.text().catch(() => '');
    if (cuerpo.trim() === 'probando123') break;
  }

  try {
    if (!r) {
      mal('no se pudo probar el webhook', 'revisá la conexión');
    } else if (r.status === 308 || r.status === 301 || r.status === 302) {
      mal(`ninguna de las dos formas del dominio contesta el desafío`,
          `Probá a mano: ${url}`);
    } else if (r.ok && cuerpo.trim() === 'probando123') {
      console.log(`     la URL que hay que darle a Meta es ${url.split('?')[0]}`);
      bien('devuelve el desafío tal cual: el alta va a pasar');
    } else if (r.status === 403) {
      mal('el webhook rechaza el token',
          'El META_WA_VERIFY_TOKEN de Vercel no es el mismo que tenés acá. Fijate que el despliegue haya terminado después de cargarlo.');
    } else {
      mal(`respuesta inesperada: ${r.status} ${cuerpo.slice(0, 80)}`,
          'Revisá que el último despliegue haya terminado.');
    }
  } catch (e) {
    mal(`no se pudo llegar al webhook: ${(e as Error).message}`, `Probá abrir ${SITIO} en el navegador.`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('QUÉ PROVEEDOR ESTÁ ACTIVO');
{
  const p = (process.env.WHATSAPP_PROVEEDOR || 'twilio').trim().toLowerCase();
  if (p === 'meta') bien('WHATSAPP_PROVEEDOR=meta — entra y sale todo por Meta');
  else console.log(`  · WHATSAPP_PROVEEDOR=${p} — todavía atiende Twilio. Cambialo a "meta" cuando lo de arriba esté en verde.`);
}

console.log('');
console.log(problemas === 0 ? 'Todo listo.' : `${problemas} cosa(s) para resolver.`);
console.log('');
process.exit(problemas === 0 ? 0 : 1);
