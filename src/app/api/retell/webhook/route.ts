/**
 * API: /api/retell/webhook
 * Webhook principal para recibir eventos de Retell AI
 */

import { NextRequest, NextResponse } from 'next/server';
import { Retell } from 'retell-sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import type { RetellWebhookPayload, CallStatus } from '@/types/retell';

export async function POST(request: NextRequest) {
  try {
    // Obtener el body como texto para verificar la firma
    const rawBody = await request.text();
    const signature = request.headers.get('x-retell-signature') || '';

    // Verificar firma de Retell
    const apiKey = process.env.RETELL_API_KEY;
    if (!apiKey) {
      console.error('[Retell Webhook] RETELL_API_KEY no configurada');
      return NextResponse.json({ error: 'Configuración inválida' }, { status: 500 });
    }

    // Verificar la firma usando el SDK de Retell
    const isValid = Retell.verify(rawBody, apiKey, signature);
    if (!isValid) {
      console.error('[Retell Webhook] Firma inválida');
      return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
    }

    // Parsear el body
    const payload: RetellWebhookPayload = JSON.parse(rawBody);
    const { event, call } = payload;

    console.log(`[Retell Webhook] Evento recibido: ${event}`, {
      call_id: call.call_id,
      from: call.from_number,
      status: call.status,
    });

    const supabase = createAdminClient();

    switch (event) {
      case 'call_started':
        await handleCallStarted(supabase, call);
        break;

      case 'call_ended':
        await handleCallEnded(supabase, call);
        break;

      case 'call_analyzed':
        await handleCallAnalyzed(supabase, call);
        break;

      default:
        console.log(`[Retell Webhook] Evento no manejado: ${event}`);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[Retell Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Error procesando webhook' },
      { status: 500 }
    );
  }
}

/**
 * Manejar evento call_started
 * Registra la llamada en la base de datos
 */
async function handleCallStarted(
  supabase: ReturnType<typeof createAdminClient>,
  call: RetellWebhookPayload['call']
) {
  console.log(`[Retell Webhook] Llamada iniciada: ${call.call_id}`);

  const { error } = await supabase.from('llamadas').insert({
    call_id: call.call_id,
    from_number: call.from_number,
    to_number: call.to_number,
    started_at: new Date(call.start_timestamp).toISOString(),
    status: 'in_progress' as CallStatus,
  });

  if (error) {
    console.error('[Retell Webhook] Error insertando llamada:', error);
    throw error;
  }

  console.log(`[Retell Webhook] Llamada registrada: ${call.call_id}`);
}

/**
 * Manejar evento call_ended
 * Actualiza la llamada con duración y transcript
 */
async function handleCallEnded(
  supabase: ReturnType<typeof createAdminClient>,
  call: RetellWebhookPayload['call']
) {
  console.log(`[Retell Webhook] Llamada finalizada: ${call.call_id}`);

  const durationSeconds = call.duration_ms
    ? Math.round(call.duration_ms / 1000)
    : null;

  const endedAt = call.end_timestamp
    ? new Date(call.end_timestamp).toISOString()
    : new Date().toISOString();

  // Determinar status final
  let status: CallStatus = 'completed';
  if (call.status === 'error' || call.end_call_reason === 'error') {
    status = 'failed';
  }

  const { error } = await supabase
    .from('llamadas')
    .update({
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      transcript: call.transcript_object || null,
      status,
      recording_url: call.recording_url || null,
    })
    .eq('call_id', call.call_id);

  if (error) {
    console.error('[Retell Webhook] Error actualizando llamada:', error);
    throw error;
  }

  console.log(`[Retell Webhook] Llamada actualizada: ${call.call_id}`, {
    duration: durationSeconds,
    status,
  });
}

/**
 * Manejar evento call_analyzed
 * Actualiza con sentimiento y resumen
 */
async function handleCallAnalyzed(
  supabase: ReturnType<typeof createAdminClient>,
  call: RetellWebhookPayload['call']
) {
  console.log(`[Retell Webhook] Llamada analizada: ${call.call_id}`);

  if (!call.call_analysis) {
    console.log('[Retell Webhook] Sin análisis disponible');
    return;
  }

  const { error } = await supabase
    .from('llamadas')
    .update({
      sentiment: call.call_analysis.user_sentiment || null,
      summary: call.call_analysis.call_summary || null,
    })
    .eq('call_id', call.call_id);

  if (error) {
    console.error('[Retell Webhook] Error actualizando análisis:', error);
    throw error;
  }

  console.log(`[Retell Webhook] Análisis guardado: ${call.call_id}`, {
    sentiment: call.call_analysis.user_sentiment,
    summary: call.call_analysis.call_summary?.substring(0, 50),
  });
}
