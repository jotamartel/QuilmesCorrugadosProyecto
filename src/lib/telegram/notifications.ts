/**
 * Telegram lead notifications
 * Sends formatted notifications when new retail quotes arrive
 */

import { sendMessage, isTelegramEnabled } from './bot';

interface RetailBox {
  largo: number;
  ancho: number;
  alto: number;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  m2PerBox: number;
  totalM2: number;
  isMayorista: boolean;
  standardBoxId?: string;
}

interface RetailLeadData {
  quoteId: string;
  quoteNumber: string;
  clientType: 'empresa' | 'particular';
  nombre: string;
  empresa?: string | null;
  email: string;
  telefono: string;
  cuit?: string | null;
  boxes: RetailBox[];
  shippingMethod?: string | null;
  shippingCost?: number;
  shippingCostConfirmed?: boolean;
  direccion?: string | null;
  ciudad?: string | null;
  provincia?: string | null;
  source?: 'retail' | 'mayorista' | 'lead';  // Origen del lead
}

function formatPrecio(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Send a Telegram notification for a new retail lead
 */
export async function notifyNewRetailLead(data: RetailLeadData): Promise<boolean> {
  if (!isTelegramEnabled()) {
    console.log('[Telegram] Bot no configurado, saltando notificacion');
    return false;
  }

  try {
    const totalProductos = data.boxes.reduce((sum, b) => sum + b.subtotal, 0);
    const totalCantidad = data.boxes.reduce((sum, b) => sum + b.cantidad, 0);
    const totalM2 = data.boxes.reduce((sum, b) => sum + b.totalM2, 0);

    // Format shipping
    const shippingLabels: Record<string, string> = {
      retiro_sucursal: 'Retiro sucursal',
      envio_caba_amba: 'Envio CABA/AMBA',
      envio_resto_pais: 'Envio resto del pais',
    };
    const shippingText = data.shippingMethod
      ? shippingLabels[data.shippingMethod] || data.shippingMethod
      : 'No especificado';

    // Build box details
    const boxLines = data.boxes.map((b, i) => {
      const dims = `${b.largo}x${b.ancho}x${b.alto}mm`;
      const precio = formatPrecio(b.subtotal);
      const tag = b.isMayorista ? ' (mayorista)' : '';
      return `  ${i + 1}. ${dims} — ${b.cantidad} uds — ${precio}${tag}`;
    }).join('\n');

    // Clean phone for WhatsApp link
    const cleanPhone = data.telefono.replace(/\D/g, '');
    const whatsappPhone = cleanPhone.startsWith('54') ? cleanPhone : `54${cleanPhone}`;

    // Header based on source
    const sourceLabels: Record<string, string> = {
      retail: '🛒 Nueva solicitud retail',
      mayorista: '🏭 Nueva cotizacion mayorista',
      lead: '👁 Nuevo lead (vio precio)',
    };
    const headerLabel = sourceLabels[data.source || 'retail'] || sourceLabels.retail;

    // Build the notification message
    const message = [
      `<b>${headerLabel} #${escapeHtml(data.quoteNumber)}</b>`,
      ``,
      `<b>👤 Cliente:</b>`,
      `  ${escapeHtml(data.nombre)}${data.empresa ? ` (${escapeHtml(data.empresa)})` : ''}`,
      `  ${data.clientType === 'empresa' ? '🏢 Empresa' : '👤 Particular'}${data.cuit ? ` — CUIT: ${escapeHtml(data.cuit)}` : ''}`,
      `  📧 ${escapeHtml(data.email)}`,
      `  📱 ${escapeHtml(data.telefono)}`,
      ``,
      `<b>📐 Cajas:</b>`,
      boxLines,
      ``,
      `<b>💰 Total:</b> ${formatPrecio(totalProductos)} (${totalCantidad} uds, ${totalM2.toFixed(1)} m²)`,
      `<b>🚚 Envio:</b> ${shippingText}${data.shippingCost && data.shippingCostConfirmed ? ` (${formatPrecio(data.shippingCost)})` : ''}`,
      data.direccion ? `<b>📍 Direccion:</b> ${escapeHtml(data.direccion)}${data.ciudad ? `, ${escapeHtml(data.ciudad)}` : ''}${data.provincia ? `, ${escapeHtml(data.provincia)}` : ''}` : '',
    ].filter(Boolean).join('\n');

    // WhatsApp default message
    const defaultWaMsg = encodeURIComponent(
      `Hola ${data.nombre.split(' ')[0]}! Soy de Quilmes Corrugados. Recibimos tu pedido de cajas y queria coordinar los detalles. ¿Tenes un momento?`
    );

    const result = await sendMessage({
      text: message,
      parseMode: 'HTML',
      inlineKeyboard: [
        [
          { text: '💬 WhatsApp', url: `https://wa.me/${whatsappPhone}?text=${defaultWaMsg}` },
        ],
        [
          { text: '✍️ Generar mensaje de venta', callback_data: `gen_msg:${data.quoteId}` },
        ],
      ],
    });

    if (result.ok) {
      console.log(`[Telegram] Notificacion enviada para quote ${data.quoteNumber}`);
      return true;
    } else {
      console.error('[Telegram] Error enviando notificacion:', result);
      return false;
    }
  } catch (error) {
    console.error('[Telegram] Error en notifyNewRetailLead:', error);
    return false;
  }
}
