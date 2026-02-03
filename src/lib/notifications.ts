import { Resend } from 'resend';

// Cliente Resend - solo se inicializa si hay API key configurada
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'ventas@quilmescorrugados.com.ar';
const FROM_EMAIL = process.env.FROM_EMAIL || 'notificaciones@quilmescorrugados.com.ar';

// Tipos de notificaciones
interface LeadNotification {
  type: 'lead_with_contact';
  origin: string;
  box: { length: number; width: number; height: number };
  quantity: number;
  totalArs: number;
  contact: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    notes?: string;
  };
}

interface HighValueNotification {
  type: 'high_value_quote';
  origin: string;
  box: { length: number; width: number; height: number };
  quantity: number;
  totalArs: number;
  ip: string;
}

interface VolumeAlertNotification {
  type: 'volume_alert';
  ip: string;
  requestsToday: number;
  topQuotes: Array<{ box: string; quantity: number; total: number }>;
}

interface AdvisorRequestNotification {
  type: 'advisor_request';
  origin: string;
  contact: {
    phone?: string;
    email?: string;
    name?: string;
  };
}

export type NotificationData = LeadNotification | HighValueNotification | VolumeAlertNotification | AdvisorRequestNotification;

/**
 * Envía una notificación por email al equipo de ventas
 */
export async function sendNotification(data: NotificationData): Promise<boolean> {
  // Si no hay Resend configurado, loguear y retornar
  if (!resend) {
    console.log('[Notifications] Resend no configurado. Notificación pendiente:', data.type);
    return false;
  }

  try {
    let subject = '';
    let html = '';

    switch (data.type) {
      case 'lead_with_contact':
        subject = `Nuevo lead via ${data.origin}`;
        html = buildLeadEmail(data);
        break;

      case 'high_value_quote':
        subject = `Cotizacion alto valor: $${data.totalArs.toLocaleString('es-AR')}`;
        html = buildHighValueEmail(data);
        break;

      case 'volume_alert':
        subject = `IP con ${data.requestsToday} consultas hoy - Posible integrador`;
        html = buildVolumeAlertEmail(data);
        break;

      case 'advisor_request':
        subject = `URGENTE: Cliente solicita hablar con asesor (${data.origin})`;
        html = buildAdvisorRequestEmail(data);
        break;
    }

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: NOTIFICATION_EMAIL,
      subject,
      html,
    });

    if (error) {
      console.error('[Notifications] Error enviando email:', error);
      return false;
    }

    console.log('[Notifications] Email enviado:', subject);
    return true;
  } catch (error) {
    console.error('[Notifications] Error:', error);
    return false;
  }
}

function buildLeadEmail(data: LeadNotification): string {
  const { origin, box, quantity, totalArs, contact } = data;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Nuevo Lead via API</h2>

      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <h3 style="margin-top: 0;">Cotizacion</h3>
        <p><strong>Origen:</strong> ${origin}</p>
        <p><strong>Caja:</strong> ${box.length} x ${box.width} x ${box.height} mm</p>
        <p><strong>Cantidad:</strong> ${quantity.toLocaleString('es-AR')} unidades</p>
        <p><strong>Total:</strong> $${totalArs.toLocaleString('es-AR')}</p>
      </div>

      <div style="background: #dcfce7; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <h3 style="margin-top: 0;">Datos de Contacto</h3>
        ${contact.name ? `<p><strong>Nombre:</strong> ${contact.name}</p>` : ''}
        ${contact.company ? `<p><strong>Empresa:</strong> ${contact.company}</p>` : ''}
        ${contact.email ? `<p><strong>Email:</strong> <a href="mailto:${contact.email}">${contact.email}</a></p>` : ''}
        ${contact.phone ? `<p><strong>Telefono:</strong> <a href="https://wa.me/${contact.phone.replace(/\D/g, '')}">${contact.phone}</a></p>` : ''}
        ${contact.notes ? `<p><strong>Notas:</strong> ${contact.notes}</p>` : ''}
      </div>

      ${contact.phone ? `
        <a href="https://wa.me/${contact.phone.replace(/\D/g, '')}?text=Hola! Vi tu consulta de cajas de ${box.length}x${box.width}x${box.height}mm. Te escribo de Quilmes Corrugados."
           style="display: inline-block; background: #25d366; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-right: 8px;">
          Contactar por WhatsApp
        </a>
      ` : ''}

      ${contact.email ? `
        <a href="mailto:${contact.email}?subject=Tu cotizacion de Quilmes Corrugados"
           style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
          Enviar Email
        </a>
      ` : ''}
    </div>
  `;
}

function buildHighValueEmail(data: HighValueNotification): string {
  const { origin, box, quantity, totalArs, ip } = data;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #059669;">Cotizacion de Alto Valor</h2>

      <div style="background: #ecfdf5; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="font-size: 24px; font-weight: bold; color: #059669; margin: 0;">
          $${totalArs.toLocaleString('es-AR')}
        </p>
      </div>

      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>Origen:</strong> ${origin}</p>
        <p><strong>Caja:</strong> ${box.length} x ${box.width} x ${box.height} mm</p>
        <p><strong>Cantidad:</strong> ${quantity.toLocaleString('es-AR')} unidades</p>
        <p><strong>IP:</strong> ${ip}</p>
      </div>

      <p style="color: #6b7280; font-size: 14px;">
        No tenemos datos de contacto. Podes investigar la IP o esperar que vuelvan a consultar.
      </p>
    </div>
  `;
}

function buildVolumeAlertEmail(data: VolumeAlertNotification): string {
  const { ip, requestsToday, topQuotes } = data;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #7c3aed;">Posible Integrador Detectado</h2>

      <div style="background: #f5f3ff; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p><strong>IP:</strong> ${ip}</p>
        <p><strong>Requests hoy:</strong> ${requestsToday}</p>
      </div>

      <h3>Ultimas cotizaciones de esta IP:</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #e5e7eb;">
            <th style="padding: 8px; text-align: left;">Caja</th>
            <th style="padding: 8px; text-align: right;">Cantidad</th>
            <th style="padding: 8px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${topQuotes.map(q => `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${q.box}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${q.quantity.toLocaleString('es-AR')}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${q.total.toLocaleString('es-AR')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">
        Esta IP podria ser una empresa evaluando integrarse.
        Considera contactarlos para ofrecerles una API key y soporte.
      </p>
    </div>
  `;
}

function buildAdvisorRequestEmail(data: AdvisorRequestNotification): string {
  const { origin, contact } = data;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Cliente Solicita Hablar con Asesor</h2>

      <div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #dc2626;">
        <p style="font-size: 18px; font-weight: bold; margin: 0;">
          Un cliente necesita atencion inmediata
        </p>
        <p style="margin: 8px 0 0 0; color: #6b7280;">
          Origen: ${origin}
        </p>
      </div>

      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <h3 style="margin-top: 0;">Datos de Contacto</h3>
        ${contact.name ? `<p><strong>Nombre:</strong> ${contact.name}</p>` : ''}
        ${contact.phone ? `<p><strong>Telefono:</strong> <a href="https://wa.me/${contact.phone.replace(/\D/g, '')}">${contact.phone}</a></p>` : ''}
        ${contact.email ? `<p><strong>Email:</strong> <a href="mailto:${contact.email}">${contact.email}</a></p>` : ''}
      </div>

      ${contact.phone ? `
        <a href="https://wa.me/${contact.phone.replace(/\D/g, '')}?text=Hola! Te escribo de Quilmes Corrugados. Vi que solicitaste hablar con un asesor, en que puedo ayudarte?"
           style="display: inline-block; background: #25d366; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Contactar AHORA por WhatsApp
        </a>
      ` : ''}

      <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">
        Este cliente solicito hablar con un asesor humano. Contactalo lo antes posible.
      </p>
    </div>
  `;
}

/**
 * Verifica si las notificaciones están configuradas
 */
export function isNotificationsEnabled(): boolean {
  return !!resend;
}
