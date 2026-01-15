// Gestión de remitos en Xubio

import { xubioPost, xubioGet } from './client';
import { ensureXubioCustomer } from './customers';
import { createClient } from '@/lib/supabase/server';
import type { Order, OrderItem, Client } from '@/lib/types/database';
import type { XubioRemitoRequest, XubioRemitoResponse, XubioRemitoItemRequest } from './types';

/**
 * Genera items de remito desde una orden
 */
function generateRemitoItems(items: OrderItem[]): XubioRemitoItemRequest[] {
  return items.map(item => {
    const quantity = item.quantity_delivered || item.quantity;
    return {
      concepto_nombre: `Caja cartón corrugado ${item.length_mm}x${item.width_mm}x${item.height_mm}mm`,
      cantidad: quantity,
      unidad: 'unidades',
    };
  });
}

/**
 * Crea un remito en Xubio
 */
export async function createRemito(
  orderId: string
): Promise<XubioRemitoResponse> {
  const supabase = await createClient();

  // Obtener orden con cliente e items
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      *,
      client:clients(*),
      items:order_items(*)
    `)
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new Error('Orden no encontrada');
  }

  if (!order.client_id) {
    throw new Error('La orden no tiene cliente asignado');
  }

  // Asegurar que el cliente esté en Xubio
  const xubioCustomerId = await ensureXubioCustomer(order.client_id);

  const client = order.client as Client;

  // Generar items
  const items = generateRemitoItems(order.items);

  // Dirección de entrega
  const deliveryAddress = order.delivery_address || client.address || '';
  const deliveryCity = order.delivery_city || client.city || '';
  const fullAddress = `${deliveryAddress}${deliveryCity ? `, ${deliveryCity}` : ''}`;

  // Crear remito
  const remitoRequest: XubioRemitoRequest = {
    cliente_id: parseInt(xubioCustomerId),
    fecha: new Date().toISOString().split('T')[0],
    domicilio_entrega: fullAddress,
    localidad_entrega: deliveryCity || undefined,
    observaciones: `Orden ${order.order_number}${order.delivery_notes ? ` - ${order.delivery_notes}` : ''}`,
    items,
  };

  const remito = await xubioPost<XubioRemitoResponse>('/remitos', remitoRequest);

  // Actualizar orden con datos del remito
  await supabase
    .from('orders')
    .update({
      xubio_remito_id: String(remito.id),
      xubio_remito_number: remito.numero,
    })
    .eq('id', orderId);

  // Registrar en log
  await supabase.from('integration_logs').insert({
    integration: 'xubio',
    operation: 'create_remito',
    order_id: orderId,
    client_id: order.client_id,
    request_data: remitoRequest,
    response_data: remito,
    status: 'success',
  });

  return remito;
}

/**
 * Obtiene un remito de Xubio por ID
 */
export async function getXubioRemito(
  remitoId: string
): Promise<XubioRemitoResponse> {
  return xubioGet<XubioRemitoResponse>(`/remitos/${remitoId}`);
}

/**
 * Genera preview de remito (sin crear en Xubio)
 */
export async function previewRemito(orderId: string): Promise<{
  cliente: string;
  domicilio_entrega: string;
  fecha: string;
  items: { concepto: string; cantidad: number }[];
  cot_number?: string;
}> {
  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      *,
      client:clients(*),
      items:order_items(*)
    `)
    .eq('id', orderId)
    .single();

  if (error || !order) {
    throw new Error('Orden no encontrada');
  }

  const client = order.client as Client;

  // Dirección de entrega
  const deliveryAddress = order.delivery_address || client.address || '';
  const deliveryCity = order.delivery_city || client.city || '';
  const fullAddress = `${deliveryAddress}${deliveryCity ? `, ${deliveryCity}` : ''}`;

  // Items
  const items = order.items.map((item: OrderItem) => ({
    concepto: `Caja ${item.length_mm}x${item.width_mm}x${item.height_mm}mm`,
    cantidad: item.quantity_delivered || item.quantity,
  }));

  return {
    cliente: client.company || client.name,
    domicilio_entrega: fullAddress,
    fecha: new Date().toLocaleDateString('es-AR'),
    items,
    cot_number: order.cot_number || undefined,
  };
}

/**
 * Genera HTML para imprimir remito
 */
export async function generateRemitoPrintHtml(orderId: string): Promise<string> {
  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      *,
      client:clients(*),
      items:order_items(*),
      vehicle:vehicles(*)
    `)
    .eq('id', orderId)
    .single();

  if (error || !order) {
    throw new Error('Orden no encontrada');
  }

  const client = order.client as Client;
  const vehicle = order.vehicle;

  const deliveryAddress = order.delivery_address || client.address || '';
  const deliveryCity = order.delivery_city || client.city || '';

  const itemsHtml = order.items
    .map((item: OrderItem) => {
      const qty = item.quantity_delivered || item.quantity;
      return `
        <tr>
          <td>${qty}</td>
          <td>Caja cartón corrugado ${item.length_mm}x${item.width_mm}x${item.height_mm}mm</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Remito ${order.xubio_remito_number || order.order_number}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .company { font-size: 24px; font-weight: bold; }
        .remito-number { font-size: 18px; }
        .section { margin-bottom: 15px; }
        .section-title { font-weight: bold; margin-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background: #f5f5f5; }
        .footer { margin-top: 30px; }
        .cot { font-size: 14px; color: #666; margin-top: 10px; }
        .signature { margin-top: 50px; display: flex; justify-content: space-between; }
        .signature-line { width: 200px; border-top: 1px solid #000; text-align: center; padding-top: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company">QUILMES CORRUGADOS</div>
        <div class="remito-number">
          Remito N° ${order.xubio_remito_number || order.order_number}<br>
          Fecha: ${new Date().toLocaleDateString('es-AR')}
        </div>
      </div>

      <div class="section">
        <div class="section-title">Cliente:</div>
        <div>${client.company || client.name}</div>
        <div>CUIT: ${client.cuit || '-'}</div>
      </div>

      <div class="section">
        <div class="section-title">Dirección de entrega:</div>
        <div>${deliveryAddress}</div>
        <div>${deliveryCity}${client.province ? `, ${client.province}` : ''}</div>
      </div>

      ${vehicle ? `
      <div class="section">
        <div class="section-title">Transporte:</div>
        <div>Patente: ${vehicle.patent}</div>
        <div>Conductor: ${vehicle.driver_name || '-'}</div>
        <div>CUIT Conductor: ${vehicle.driver_cuit || '-'}</div>
      </div>
      ` : ''}

      ${order.cot_number ? `
      <div class="cot">
        <strong>COT ARBA:</strong> ${order.cot_number}
      </div>
      ` : ''}

      <table>
        <thead>
          <tr>
            <th width="100">Cantidad</th>
            <th>Descripción</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      ${order.delivery_notes ? `
      <div class="section" style="margin-top: 20px;">
        <div class="section-title">Observaciones:</div>
        <div>${order.delivery_notes}</div>
      </div>
      ` : ''}

      <div class="signature">
        <div class="signature-line">Entregué conforme</div>
        <div class="signature-line">Recibí conforme</div>
      </div>
    </body>
    </html>
  `;
}
