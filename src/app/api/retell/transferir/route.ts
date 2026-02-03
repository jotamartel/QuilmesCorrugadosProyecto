/**
 * API: /api/retell/transferir
 * Función custom para transferir llamadas a ventas
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TransferirParams, TransferirResponse, TransferStatus } from '@/types/retell';
import { RETELL_CONSTANTS } from '@/types/retell';

const { TIMEZONE, HORARIO_LABORAL } = RETELL_CONSTANTS;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extraer parámetros - Retell los envía en args
    const params: TransferirParams = body.args || body;

    console.log('[Retell Transferir] Parámetros recibidos:', params);

    const { motivo, call_id, telefono_cliente } = params;

    // Verificar horario laboral
    const ahoraArgentina = getHoraArgentina();
    const esHorarioLaboral = verificarHorarioLaboral(ahoraArgentina);

    console.log('[Retell Transferir] Hora Argentina:', ahoraArgentina.toISOString(), {
      hora: ahoraArgentina.getHours(),
      dia: ahoraArgentina.getDay(),
      esHorarioLaboral,
    });

    const supabase = createAdminClient();

    // Registrar intento de transferencia
    let transferenciaId: string | undefined;
    try {
      const { data: transferencia, error } = await supabase
        .from('transferencias')
        .insert({
          call_id: call_id || null,
          from_number: telefono_cliente || 'Desconocido',
          requested_at: new Date().toISOString(),
          status: 'pending' as TransferStatus,
          horario_laboral: esHorarioLaboral,
          motivo: motivo || null,
        })
        .select('id')
        .single();

      if (!error && transferencia) {
        transferenciaId = transferencia.id;
        console.log('[Retell Transferir] Transferencia registrada:', transferenciaId);
      }
    } catch (dbError) {
      console.error('[Retell Transferir] Error registrando transferencia:', dbError);
      // Continuar aunque falle el registro
    }

    // Si está en horario laboral, transferir
    if (esHorarioLaboral) {
      const numeroVentas = process.env.VENTAS_PHONE_NUMBER;

      if (!numeroVentas) {
        console.error('[Retell Transferir] VENTAS_PHONE_NUMBER no configurado');
        return NextResponse.json({
          response: 'En este momento no puedo transferirte, pero tomé nota de tu consulta. ' +
            'Un asesor te va a llamar a la brevedad. ¿Hay algo más en lo que pueda ayudarte?',
          transfer: false,
          data: {
            transferencia_id: transferenciaId,
            horario_laboral: true,
            callback_programado: true,
          },
        } as TransferirResponse);
      }

      // Actualizar estado de transferencia
      if (transferenciaId) {
        await supabase
          .from('transferencias')
          .update({ status: 'completed' as TransferStatus })
          .eq('id', transferenciaId);
      }

      return NextResponse.json({
        response: 'Te paso con un asesor de ventas. Un momento por favor.',
        transfer: true,
        transfer_number: numeroVentas,
        data: {
          transferencia_id: transferenciaId,
          horario_laboral: true,
        },
      } as TransferirResponse);
    }

    // Fuera de horario laboral
    const proximaApertura = getProximaApertura(ahoraArgentina);
    const horaApertura = formatearHora(proximaApertura);
    const diaApertura = formatearDia(proximaApertura);

    // Programar callback
    if (transferenciaId) {
      await supabase
        .from('transferencias')
        .update({
          status: 'callback_scheduled' as TransferStatus,
          callback_scheduled_at: proximaApertura.toISOString(),
        })
        .eq('id', transferenciaId);
    }

    // Construir mensaje según el momento
    let respuesta = 'En este momento el equipo de ventas no está disponible. ';
    respuesta += `Nuestro horario de atención es de lunes a viernes de ${HORARIO_LABORAL.INICIO} a ${HORARIO_LABORAL.FIN} horas. `;

    if (proximaApertura.getDate() === ahoraArgentina.getDate()) {
      // Mismo día (esto no debería pasar si estamos fuera de horario)
      respuesta += `¿Querés que te llamen hoy a las ${horaApertura}?`;
    } else if (proximaApertura.getDate() === ahoraArgentina.getDate() + 1) {
      // Mañana
      respuesta += `¿Querés que te llamen mañana a primera hora?`;
    } else {
      // Otro día (fin de semana)
      respuesta += `¿Querés que te llamen el ${diaApertura} a primera hora?`;
    }

    return NextResponse.json({
      response: respuesta,
      transfer: false,
      data: {
        transferencia_id: transferenciaId,
        horario_laboral: false,
        callback_programado: true,
      },
    } as TransferirResponse);

  } catch (error) {
    console.error('[Retell Transferir] Error:', error);
    return NextResponse.json({
      response: 'Disculpá, tuve un problema técnico. ' +
        'Tomé nota de tu consulta y un asesor te va a contactar. ' +
        '¿Puedo ayudarte en algo más?',
      transfer: false,
      data: {
        horario_laboral: false,
        callback_programado: true,
      },
    } as TransferirResponse);
  }
}

/**
 * Obtener hora actual en Argentina
 */
function getHoraArgentina(): Date {
  // Crear fecha en timezone de Argentina
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };

  const formatter = new Intl.DateTimeFormat('en-CA', options);
  const parts = formatter.formatToParts(now);

  const getPart = (type: string) =>
    parts.find((p) => p.type === type)?.value || '0';

  return new Date(
    parseInt(getPart('year')),
    parseInt(getPart('month')) - 1,
    parseInt(getPart('day')),
    parseInt(getPart('hour')),
    parseInt(getPart('minute')),
    parseInt(getPart('second'))
  );
}

/**
 * Verificar si es horario laboral
 */
function verificarHorarioLaboral(fecha: Date): boolean {
  const hora = fecha.getHours();
  const dia = fecha.getDay(); // 0 = Domingo, 1 = Lunes, etc.

  // Verificar día laboral (Lunes a Viernes = 1-5)
  if (!HORARIO_LABORAL.DIAS.includes(dia)) {
    return false;
  }

  // Verificar hora (8:00 - 17:00)
  if (hora < HORARIO_LABORAL.INICIO || hora >= HORARIO_LABORAL.FIN) {
    return false;
  }

  return true;
}

/**
 * Obtener próxima apertura de atención
 */
function getProximaApertura(fecha: Date): Date {
  const proximaApertura = new Date(fecha);
  proximaApertura.setHours(HORARIO_LABORAL.INICIO, 0, 0, 0);

  // Si ya pasó la hora de apertura hoy, ir al próximo día
  if (fecha.getHours() >= HORARIO_LABORAL.INICIO) {
    proximaApertura.setDate(proximaApertura.getDate() + 1);
  }

  // Buscar próximo día laboral
  while (!HORARIO_LABORAL.DIAS.includes(proximaApertura.getDay())) {
    proximaApertura.setDate(proximaApertura.getDate() + 1);
  }

  return proximaApertura;
}

/**
 * Formatear hora para respuesta
 */
function formatearHora(fecha: Date): string {
  const hora = fecha.getHours();
  const minutos = fecha.getMinutes();
  if (minutos === 0) {
    return `${hora} horas`;
  }
  return `${hora}:${minutos.toString().padStart(2, '0')}`;
}

/**
 * Formatear día para respuesta
 */
function formatearDia(fecha: Date): string {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return dias[fecha.getDay()];
}
