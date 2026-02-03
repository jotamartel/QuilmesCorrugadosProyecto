/**
 * API: /api/retell/registrar-lead
 * Función custom para registrar leads telefónicos
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { RegistrarLeadParams, RegistrarLeadResponse } from '@/types/retell';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extraer parámetros - Retell los envía en args
    const params: RegistrarLeadParams = body.args || body;

    console.log('[Retell RegistrarLead] Parámetros recibidos:', params);

    const { nombre, email, telefono, consulta, cotizacion_id, call_id } = params;

    // Validar que haya al menos una forma de contacto o consulta
    if (!consulta && !email && !telefono) {
      return NextResponse.json({
        response: 'Necesito al menos tu consulta o un dato de contacto para poder ayudarte. ' +
          '¿Cuál es tu consulta o querés dejarme tu email?',
      } as RegistrarLeadResponse);
    }

    const supabase = createAdminClient();

    // Si hay cotización_id, actualizar la cotización existente
    if (cotizacion_id) {
      const updateData: Record<string, unknown> = {
        requested_contact: true,
        message: consulta || null,
      };

      if (nombre) updateData.requester_name = nombre;
      if (email) updateData.requester_email = email.toLowerCase().trim();
      if (telefono) updateData.requester_phone = telefono.replace(/\D/g, '');

      const { error: updateError } = await supabase
        .from('public_quotes')
        .update(updateData)
        .eq('id', cotizacion_id);

      if (updateError) {
        console.error('[Retell RegistrarLead] Error actualizando cotización:', updateError);
      } else {
        console.log('[Retell RegistrarLead] Cotización actualizada:', cotizacion_id);
      }

      // Si hay email, enviar cotización por email
      let emailEnviado = false;
      if (email) {
        emailEnviado = await enviarCotizacionPorEmail(supabase, cotizacion_id, email, nombre);
      }

      // Construir respuesta
      let respuesta = '';
      if (nombre) {
        respuesta = `Perfecto ${nombre}, `;
      } else {
        respuesta = 'Perfecto, ';
      }

      if (emailEnviado) {
        respuesta += `ya te envié la cotización a ${email}. `;
      } else if (email) {
        respuesta += 'registré tu email para enviarte la cotización. ';
      }

      respuesta += 'Un asesor se va a comunicar con vos a la brevedad. ¿Hay algo más en lo que pueda ayudarte?';

      return NextResponse.json({
        response: respuesta,
        data: {
          lead_id: cotizacion_id,
          email_enviado: emailEnviado,
        },
      } as RegistrarLeadResponse);
    }

    // Si no hay cotización, crear un nuevo lead en public_quotes
    const { data: newLead, error: insertError } = await supabase
      .from('public_quotes')
      .insert({
        requester_name: nombre || 'Cliente Telefónico',
        requester_email: email?.toLowerCase().trim() || 'pendiente@telefono.local',
        requester_phone: telefono?.replace(/\D/g, '') || 'Llamada entrante',
        message: consulta || 'Consulta telefónica',
        // Datos mínimos de caja (se pueden actualizar después)
        length_mm: 0,
        width_mm: 0,
        height_mm: 0,
        quantity: 0,
        has_printing: false,
        // Metadata
        canal: 'telefono',
        call_id: call_id || null,
        status: 'pending',
        requested_contact: true,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[Retell RegistrarLead] Error creando lead:', insertError);
      return NextResponse.json({
        response: 'Tuve un problema guardando tus datos. ' +
          '¿Querés que te pase con un asesor directamente?',
      } as RegistrarLeadResponse);
    }

    console.log('[Retell RegistrarLead] Lead creado:', newLead?.id);

    // Construir respuesta
    let respuesta = '';
    if (nombre) {
      respuesta = `Listo ${nombre}, registré tu consulta. `;
    } else {
      respuesta = 'Listo, registré tu consulta. ';
    }

    if (email) {
      respuesta += `Te vamos a contactar a ${email}. `;
    } else if (telefono) {
      respuesta += 'Te vamos a llamar a este mismo número. ';
    }

    respuesta += 'Un asesor se va a comunicar con vos a la brevedad. ¿Necesitás algo más?';

    return NextResponse.json({
      response: respuesta,
      data: {
        lead_id: newLead?.id,
        email_enviado: false,
      },
    } as RegistrarLeadResponse);

  } catch (error) {
    console.error('[Retell RegistrarLead] Error:', error);
    return NextResponse.json({
      response: 'Disculpá, tuve un problema guardando tus datos. ' +
        '¿Querés que te pase con un asesor?',
    } as RegistrarLeadResponse);
  }
}

/**
 * Enviar cotización por email usando Resend
 */
async function enviarCotizacionPorEmail(
  supabase: ReturnType<typeof createAdminClient>,
  cotizacionId: string,
  email: string,
  nombre?: string
): Promise<boolean> {
  try {
    // Obtener datos de la cotización
    const { data: cotizacion, error } = await supabase
      .from('public_quotes')
      .select('*')
      .eq('id', cotizacionId)
      .single();

    if (error || !cotizacion) {
      console.error('[Retell RegistrarLead] Error obteniendo cotización:', error);
      return false;
    }

    // Si no hay datos válidos de caja, no enviar email
    if (!cotizacion.length_mm || cotizacion.length_mm === 0) {
      console.log('[Retell RegistrarLead] Cotización sin datos de caja, no se envía email');
      return false;
    }

    // Verificar si Resend está configurado
    if (!process.env.RESEND_API_KEY) {
      console.log('[Retell RegistrarLead] Resend no configurado');
      return false;
    }

    // Importar Resend dinámicamente
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Formatear datos para el email
    const nombreCliente = nombre || cotizacion.requester_name || 'Cliente';
    const largo = cotizacion.length_mm / 10;
    const ancho = cotizacion.width_mm / 10;
    const alto = cotizacion.height_mm / 10;
    const cantidad = cotizacion.quantity;
    const precioTotal = cotizacion.subtotal?.toLocaleString('es-AR') || '0';
    const precioUnitario = cotizacion.unit_price?.toLocaleString('es-AR') || '0';
    const tiempoProduccion = `${cotizacion.estimated_days || 5} días hábiles`;

    // Enviar email
    const { error: emailError } = await resend.emails.send({
      from: 'Quilmes Corrugados <cotizaciones@quilmescorrugados.com>',
      to: email,
      subject: `Tu cotización de cajas - Quilmes Corrugados`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #002E55;">Hola ${nombreCliente}!</h1>

          <p>Gracias por contactarnos. Acá está tu cotización:</p>

          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #002E55; margin-top: 0;">Detalle de la cotización</h2>

            <p><strong>Medidas de la caja:</strong> ${largo} x ${ancho} x ${alto} cm</p>
            <p><strong>Cantidad:</strong> ${cantidad} unidades</p>

            <hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;" />

            <p><strong>Precio unitario:</strong> $${precioUnitario}</p>
            <p style="font-size: 1.2em;"><strong>Precio total:</strong> $${precioTotal}</p>

            <p><strong>Tiempo de producción:</strong> ${tiempoProduccion}</p>
          </div>

          <p>Si tenés alguna consulta, no dudes en responder este email o llamarnos.</p>

          <p style="color: #666; font-size: 0.9em; margin-top: 30px;">
            Quilmes Corrugados<br/>
            Tel: (011) XXXX-XXXX<br/>
            WhatsApp: +54 9 11 XXXX-XXXX
          </p>
        </div>
      `,
    });

    if (emailError) {
      console.error('[Retell RegistrarLead] Error enviando email:', emailError);
      return false;
    }

    console.log('[Retell RegistrarLead] Email enviado a:', email);
    return true;

  } catch (error) {
    console.error('[Retell RegistrarLead] Error en envío de email:', error);
    return false;
  }
}
