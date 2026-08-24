/**
 * Los avisos automáticos al cliente por WhatsApp, cuando el pedido se mueve.
 *
 * Es lo que le prometimos a Fernando: "cuando la empezás a fabricar, le
 * notifica al cliente". Hasta acá el cambio de estado solo escribía un renglón
 * en el historial interno; del otro lado no se enteraba nadie.
 *
 * LA IDEMPOTENCIA VIVE EN LA BASE, NO EN LA MEMORIA DEL CÓDIGO
 *
 * El UNIQUE (order_id, evento) de order_notifications es la llave: el motor
 * intenta el INSERT ANTES de llamar a Meta, y si choca es porque ese aviso ya
 * salió. Eso importa porque el doble disparo es real, no hipotético: despachar
 * escribe el estado por su lado y el panel puede escribirlo por el otro, y el
 * cliente no tiene por qué recibir dos veces la misma noticia.
 *
 * Solo un aviso EFECTIVAMENTE ENVIADO bloquea. Uno que quedó en error —Meta
 * caído, plantilla todavía sin aprobar, alias sin cargar— se puede reintentar:
 * la idempotencia protege contra mandar dos veces, no contra terminar de
 * mandar una.
 *
 * "OMITIDA" NO ES UN ERROR
 *
 * Hay motivos legítimos para que un aviso no salga: el cliente no tiene
 * WhatsApp cargado, pidió que no le escriban, el alias todavía no está en la
 * configuración. Quien atiende necesita ver "no salió, y está bien" distinto
 * de "no salió y hay un problema", porque el segundo se arregla y el primero
 * no. Por eso el resultado es una unión discriminada y cada omisión lleva su
 * motivo.
 *
 * EL MOTOR ARMA LAS VARIABLES, NO LAS RECIBE
 *
 * Ningún endpoint le pasa los valores. Si los recibiera, cualquiera podría
 * mandar una variable vacía y Meta rechazaría el envío ENTERO con un error que
 * no dice cuál falló. Acá salen de la orden, con un valor de reserva cuando el
 * dato puede faltar.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarPlantillaWhatsApp } from '@/lib/whatsapp';
import { getBankDataForClient } from '@/lib/config/system';
import {
  PEDIDO_CONFIRMADO,
  PEDIDO_EN_PRODUCCION,
  PEDIDO_SALDO_ACTUALIZADO,
  PEDIDO_DESPACHADO,
  PEDIDO_ENTREGADO,
  PEDIDO_CANCELADO,
  type Plantilla,
} from '@/lib/whatsapp-plantillas';
import {
  EVENTO_POR_ESTADO as EVENTOS,
  type EventoDePedido as Evento,
  type MotivoDeOmision as Motivo,
  type ResultadoAviso as Resultado,
} from '@/lib/avisos/eventos';
import type { OrderStatus } from '@/lib/types/database';

// El vocabulario vive aparte y sin dependencias de servidor: la UI lo importa
// sin arrastrar el cliente de Supabase ni el SDK de WhatsApp. Se re-exporta
// para que quien ya importaba desde acá siga funcionando.
export {
  EVENTO_POR_ESTADO,
  explicarResultado,
  type EventoDePedido,
  type MotivoDeOmision,
  type ResultadoAviso,
} from '@/lib/avisos/eventos';

/**
 * Cuánto vale una reserva antes de darla por muerta.
 *
 * Una fila 'enviando' es un envío en vuelo; si el proceso muere entre la
 * reserva y la respuesta de Meta, queda así para siempre. Pasado este rato se
 * la considera abandonada y se puede retomar.
 *
 * Noventa segundos: más que cualquier llamada a Meta razonable, menos que la
 * paciencia de quien está mirando el panel. El riesgo de retomar una que sí
 * había salido —Meta entregó y el proceso murió justo después— es un duplicado
 * raro; el de no retomarla nunca es un cliente que no se entera.
 */
const RESERVA_VENCE_EN_MS = 90_000;

const PLANTILLA_POR_EVENTO: Record<Evento, Plantilla> = {
  confirmada: PEDIDO_CONFIRMADO,
  en_produccion: PEDIDO_EN_PRODUCCION,
  saldo_actualizado: PEDIDO_SALDO_ACTUALIZADO,
  despachada: PEDIDO_DESPACHADO,
  entregada: PEDIDO_ENTREGADO,
  cancelada: PEDIDO_CANCELADO,
};

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n));

/**
 * ¿Hay saldo que valga la pena cobrar?
 *
 * Un peso o menos redondea a "$ 0" y el mensaje queda diciendo "el saldo a
 * pagar es $ 0", que genera la consulta que el aviso venía a evitar. El monto
 * puede llegar como string desde Postgres (numeric), así que se normaliza.
 */
const hayQueCobrar = (monto: unknown) => {
  const n = typeof monto === 'string' ? Number(monto) : (monto as number);
  return Number.isFinite(n) && n >= 1;
};

/**
 * La fecha como la vive la fábrica, no como la vive el servidor.
 *
 * Sin timeZone, toLocaleDateString usa el del proceso — y en Vercel eso es
 * UTC. Un despacho de las 22:00 del 14 se guarda como 01:00Z del 15 y se le
 * anunciaba al cliente "despachamos el 15": un día que para el operador no
 * pasó. Y al revés en desarrollo, donde el proceso corre en horario argentino
 * y una fecha sin hora (las de entrega, que Postgres devuelve como
 * "2026-01-27") se leía a medianoche UTC y salía impresa un día antes.
 *
 * Es el tipo de error que nadie reporta como bug: el cliente lee una fecha
 * equivocada y ajusta su expectativa a eso.
 */
const fechaAR = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

/**
 * Una fecha de CALENDARIO, que no se convierte de zona horaria.
 *
 * estimated_delivery es un DATE de Postgres: llega como "2026-01-27" y quiere
 * decir el 27, en cualquier parte del mundo. Pasarla por Date la vuelve
 * medianoche UTC, y convertida a hora argentina cae a las 21:00 del 26 — se
 * anunciaba un día antes del comprometido.
 *
 * Es el reverso exacto de fechaAR(): esa convierte instantes, esta no
 * convierte nada porque no hay nada que convertir. Confundirlas mueve la fecha
 * un día para alguno de los dos lados, y el cliente ajusta su expectativa a lo
 * que leyó.
 */
const fechaDeCalendario = (fecha: string) => {
  const [a, m, d] = fecha.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : fecha;
};

/**
 * La fecha de entrega, o algo que se pueda decir cuando no hay.
 *
 * Meta rechaza el envío entero si una variable llega vacía, así que esta nunca
 * puede volver en blanco: 3 de 7 órdenes tenían la fecha en null cuando se
 * escribió esto.
 */
const fechaEstimada = (iso: string | null) =>
  iso ? fechaDeCalendario(iso) : 'los próximos días hábiles';

/**
 * Un teléfono que Meta pueda marcar de verdad.
 *
 * ONCE DIGITOS COMO MINIMO, y no diez: un movil argentino en E.164 son trece
 * (54 + 9 + area + numero). Con diez pasaba "1112345678" —un numero local sin
 * codigo de pais, de los que hay cargados en la base— y se le mandaba a Meta,
 * que lo rechaza con un error generico. El limite de arriba son los quince que
 * permite E.164.
 *
 * Lo agarro la QA: sin este chequeo el aviso "no salio" quedaba registrado
 * como error de Meta en vez de como un dato mal cargado, que se arregla
 * distinto.
 */
const telefonoUsable = (t: string | null | undefined) =>
  !!t && /^\+?[1-9]\d{10,14}$/.test(t.replace(/[\s()-]/g, ''));

interface OrdenParaAviso {
  id: string;
  order_number: string;
  status: OrderStatus;
  public_token: string;
  balance_amount: number;
  estimated_delivery: string | null;
  shipped_at: string | null;
  client_id: string | null;
  client: { id: string; name: string; whatsapp: string | null; whatsapp_optout: boolean } | null;
}

type Payload =
  | { ok: true; plantilla: Plantilla; variables: string[]; token: string }
  | { ok: false; motivo: Motivo };

/**
 * Los valores de cada aviso, sacados de la orden.
 *
 * Es async por el alias, que vive en la configuración y puede no estar
 * cargado: en ese caso el aviso se omite ANTES de llamar a Meta, porque una
 * variable vacía rechaza el envío entero.
 */
async function armarPayload(evento: Evento, o: OrdenParaAviso): Promise<Payload> {
  const plantilla = PLANTILLA_POR_EVENTO[evento];
  const token = o.public_token;

  switch (evento) {
    case 'confirmada': {
      // Sin saldo por delante, "Saldo estimado: $ 0" confunde más de lo que
      // informa. El pedido queda confirmado igual, sin aviso.
      if (!hayQueCobrar(o.balance_amount)) return { ok: false, motivo: 'sin_saldo' };
      return { ok: true, plantilla, token, variables: [o.order_number, pesos(Number(o.balance_amount))] };
    }
    case 'en_produccion':
      return {
        ok: true, plantilla, token,
        variables: [o.order_number, fechaEstimada(o.estimated_delivery)],
      };
    case 'saldo_actualizado': {
      if (!hayQueCobrar(o.balance_amount)) return { ok: false, motivo: 'sin_saldo' };
      const banco = await getBankDataForClient();
      if (!banco) return { ok: false, motivo: 'alias_faltante' };
      return {
        ok: true, plantilla, token,
        variables: [o.order_number, pesos(Number(o.balance_amount)), banco.alias],
      };
    }
    case 'despachada':
      return {
        ok: true, plantilla, token,
        // shipped_at se estampa en el mismo update que dispara el aviso, pero
        // si por lo que sea no está, hoy sirve igual y nunca queda vacío.
        variables: [o.order_number, fechaAR(o.shipped_at ?? new Date().toISOString())],
      };
    case 'entregada':
    case 'cancelada':
      return { ok: true, plantilla, token, variables: [o.order_number] };
  }
}

/**
 * Manda el aviso que corresponde a un evento del pedido.
 *
 * Nunca tira: cualquier problema vuelve como resultado. Un aviso que falla no
 * puede tumbar el cambio de estado que lo disparó — el pedido avanzó igual, y
 * lo que quedó pendiente es contarlo.
 */
export async function notificarEventoDePedido(params: {
  orderId: string;
  evento: Evento;
  actor?: string;
}): Promise<Resultado> {
  const { orderId, evento, actor = 'sistema' } = params;

  try {
    const db = createAdminClient();

    const { data, error } = await db
      .from('orders')
      .select(
        `id, order_number, status, public_token, balance_amount, estimated_delivery, shipped_at,
         client_id, client:clients(id, name, whatsapp, whatsapp_optout)`,
      )
      .eq('id', orderId)
      .maybeSingle();

    if (error || !data) return { estado: 'error', motivo: 'orden_no_encontrada' };
    const orden = data as unknown as OrdenParaAviso;

    // ── A quién, y si quiere ────────────────────────────────────────────────
    if (!orden.client) return { estado: 'omitida', motivo: 'sin_cliente' };
    if (orden.client.whatsapp_optout) return { estado: 'omitida', motivo: 'cliente_opt_out' };
    if (!orden.client.whatsapp) return { estado: 'omitida', motivo: 'sin_whatsapp' };
    // Hay números históricos sin código de país. Meta los rechazaría con un
    // error genérico; se corta acá con el motivo puesto.
    if (!telefonoUsable(orden.client.whatsapp)) {
      return { estado: 'omitida', motivo: 'whatsapp_invalido' };
    }

    const payload = await armarPayload(evento, orden);
    if (!payload.ok) return { estado: 'omitida', motivo: payload.motivo };

    const telefono = orden.client.whatsapp.startsWith('+')
      ? orden.client.whatsapp
      : `+${orden.client.whatsapp}`;

    // ── RESERVAR EL AVISO, DE FORMA ATOMICA ─────────────────────────────────
    //
    // El estado 'enviando' existe para que "en vuelo" y "falló" no se
    // confundan. Antes la reserva se escribía como 'error' y un segundo
    // proceso lo leía como "el anterior falló, mando yo": una fila en la base
    // y dos WhatsApp en el teléfono del cliente. Se reprodujo ejecutándolo.
    //
    // El INSERT es la primera puerta y es atómica: gana uno solo. La segunda
    // puerta es el UPDATE condicionado por el resultado que se acaba de leer
    // —un compare-and-swap— para que dos reintentos simultáneos tampoco
    // pasen los dos.
    const ahora = new Date().toISOString();
    const fila = {
      order_id: orden.id,
      evento,
      plantilla: payload.plantilla.nombre,
      canal: 'whatsapp',
      telefono_destino: telefono,
      variables: { cuerpo: payload.variables, boton: payload.token },
      resultado: 'enviando',
      motivo: null as string | null,
      actor,
      updated_at: ahora,
    };

    const { error: errorInsert } = await db.from('order_notifications').insert(fila);

    if (errorInsert) {
      // 23505 = choque con el unique: ese aviso ya existe.
      if (errorInsert.code !== '23505') {
        console.error('[avisos] no se pudo registrar el aviso:', errorInsert.message);
        return { estado: 'error', motivo: 'no_se_pudo_registrar' };
      }

      const { data: previa } = await db
        .from('order_notifications')
        .select('resultado, updated_at')
        .eq('order_id', orden.id)
        .eq('evento', evento)
        .maybeSingle();

      // Ya se enteró: no hay nada que hacer.
      if (previa?.resultado === 'enviada') return { estado: 'ya_enviada' };

      // Otro lo está mandando ahora. Retomarlo sería mandar dos veces.
      const reservaViva =
        previa?.resultado === 'enviando' &&
        Date.now() - new Date(previa.updated_at as string).getTime() < RESERVA_VENCE_EN_MS;
      if (reservaViva) return { estado: 'en_curso' };

      // Reintento: se reclama la fila solo si nadie la movió desde que se leyó.
      const { data: reclamada } = await db
        .from('order_notifications')
        .update(fila)
        .eq('order_id', orden.id)
        .eq('evento', evento)
        .eq('resultado', previa!.resultado as string)
        .select('id')
        .maybeSingle();

      if (!reclamada) return { estado: 'en_curso' };
    }

    // ── Mandar ──────────────────────────────────────────────────────────────
    const salida = await enviarPlantillaWhatsApp(
      telefono,
      payload.plantilla,
      payload.variables,
      payload.plantilla.botonUrl ? payload.token : undefined,
    );

    const motivo =
      salida === 'enviada'
        ? null
        : salida === 'sin_soporte'
          ? 'el proveedor activo no manda plantillas'
          // No se afirma la causa porque desde acá no se sabe: el detalle
          // exacto de Meta queda en el log del transporte. Se nombra la
          // sospecha más común mientras haya plantillas sin aprobar.
          : 'Meta rechazó el envío (puede ser que la plantilla no esté aprobada todavía)';

    const { error: errorCierre } = await db
      .from('order_notifications')
      .update({ resultado: salida, motivo, updated_at: new Date().toISOString() })
      .eq('order_id', orden.id)
      .eq('evento', evento);

    if (salida !== 'enviada') {
      console.error('[avisos] %s de %s: %s', evento, orden.order_number, motivo);
      return salida === 'sin_soporte'
        ? { estado: 'sin_soporte' }
        : { estado: 'error', motivo: motivo! };
    }

    // Salió, pero la fila quedó diciendo 'enviando'. Importa avisarlo: el
    // próximo disparo la va a ver vencida y lo va a mandar de nuevo.
    if (errorCierre) {
      console.error(
        '[avisos] AVISO ENVIADO SIN REGISTRAR — %s de %s: %s. Puede duplicarse.',
        evento, orden.order_number, errorCierre.message,
      );
      return { estado: 'enviada_sin_registrar', plantilla: payload.plantilla.nombre };
    }

    // El aviso también queda en el historial de la orden, junto al resto de
    // los mensajes, para que quien abra el detalle vea la conversación entera
    // y no solo la mitad que escribió una persona.
    const { error: errorHistorial } = await db.from('communications').insert({
      client_id: orden.client_id,
      order_id: orden.id,
      channel: 'whatsapp',
      direction: 'outbound',
      subject: `Aviso automático: ${evento.replace(/_/g, ' ')}`,
      content: payload.plantilla.cuerpo.replace(
        /\{\{(\d+)\}\}/g,
        (_, n) => payload.variables[Number(n) - 1] ?? '',
      ),
      metadata: {
        automatico: true,
        evento,
        plantilla: payload.plantilla.nombre,
        order_number: orden.order_number,
      },
    });

    // El aviso salió: que no haya quedado en el historial es prolijidad, no
    // corrección. Se registra en el log y no se le miente al caller.
    if (errorHistorial) {
      console.error('[avisos] el aviso salió pero no quedó en el historial:', errorHistorial.message);
    }

    console.log('[avisos] %s enviado a %s por %s', evento, telefono, orden.order_number);
    return { estado: 'enviada', plantilla: payload.plantilla.nombre };
  } catch (e) {
    // Un aviso que explota no puede tumbar el cambio de estado que lo disparó.
    console.error('[avisos] error inesperado:', e);
    return { estado: 'error', motivo: e instanceof Error ? e.message : 'desconocido' };
  }
}
