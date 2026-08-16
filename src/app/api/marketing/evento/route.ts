/**
 * POST /api/marketing/evento
 *
 * Espejo por servidor de un evento que el navegador ya le mando al pixel.
 *
 * Es publico a proposito: lo llama el navegador de cualquier visitante, igual
 * que el pixel. Lo que lo hace seguro es que no LEE nada —no devuelve datos,
 * no consulta la base— y que solo acepta un puñado de nombres de evento
 * conocidos. Un abusador puede, como mucho, ensuciar las metricas del pixel
 * propio; no puede sacar informacion ni gastar plata.
 *
 * El cuerpo nunca trae PII en claro: la identidad viaja hasheada desde el
 * navegador (ver src/lib/marketing/identidad.ts). Si alguna vez llega algo con
 * pinta de email o telefono sin hashear, se descarta.
 */

import { NextRequest, NextResponse } from 'next/server';
import { enviarEventoAMeta, metaEstaConfigurado } from '@/lib/marketing/conversiones';

export const runtime = 'nodejs';

/** Solo estos. Cualquier otro nombre se rechaza. */
const EVENTOS_PERMITIDOS = new Set([
  'Lead',
  'ViewContent',
  'Contact',
  'InitiateCheckout',
  'CompleteRegistration',
  'Search',
]);

/** Campos de user_data que Meta acepta hasheados. */
const CAMPOS_HASH = new Set(['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'external_id']);

const ES_SHA256 = /^[a-f0-9]{64}$/;

/** Toma la IP real detras del proxy de Vercel. */
function ipDelRequest(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

export async function POST(req: NextRequest) {
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: 'json_invalido' }, { status: 400 });
  }

  const nombre = String(cuerpo.nombre || '');
  if (!EVENTOS_PERMITIDOS.has(nombre)) {
    return NextResponse.json({ ok: false, motivo: 'evento_no_permitido' }, { status: 400 });
  }

  const eventId = String(cuerpo.eventId || '');
  // Sin event_id no hay deduplicacion posible y el evento se contaria dos
  // veces. Es preferible no mandarlo.
  if (!eventId || eventId.length > 120) {
    return NextResponse.json({ ok: false, motivo: 'event_id_invalido' }, { status: 400 });
  }

  // Se copia solo lo que es un SHA-256 valido en un campo conocido. Esto
  // descarta de raiz cualquier intento de mandar un dato en claro.
  const identidad: Record<string, string> = {};
  const crudo = (cuerpo.identidad || {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(crudo)) {
    if (CAMPOS_HASH.has(k) && typeof v === 'string' && ES_SHA256.test(v)) {
      identidad[k] = v;
    }
  }

  const valorCrudo = Number(cuerpo.valor);
  const valor = Number.isFinite(valorCrudo) && valorCrudo > 0 ? valorCrudo : null;

  // El chequeo de configuracion va DESPUES de validar, no antes: si sale
  // primero, cortocircuita y no hay forma de comprobar desde afuera que el
  // filtro de eventos y el de PII funcionan. Validar siempre deja el endpoint
  // testeable con la CAPI apagada, que es como esta hoy.
  if (!metaEstaConfigurado()) {
    return NextResponse.json({ ok: false, motivo: 'capi_sin_configurar' });
  }

  const resultado = await enviarEventoAMeta({
    nombre,
    eventId,
    identidad,
    fbp: typeof cuerpo.fbp === 'string' ? cuerpo.fbp.slice(0, 200) : null,
    fbc: typeof cuerpo.fbc === 'string' ? cuerpo.fbc.slice(0, 300) : null,
    ip: ipDelRequest(req),
    userAgent: req.headers.get('user-agent'),
    url: typeof cuerpo.url === 'string' ? cuerpo.url.slice(0, 500) : null,
    valor,
    contenido:
      cuerpo.contenido && typeof cuerpo.contenido === 'object'
        ? (cuerpo.contenido as Record<string, unknown>)
        : undefined,
  });

  if (!resultado.ok) {
    console.error(`[marketing/evento] ${nombre}: ${resultado.detalle}`);
  }

  // Siempre 200: es telemetria, no puede romperle la navegacion a nadie.
  return NextResponse.json({ ok: resultado.ok });
}
