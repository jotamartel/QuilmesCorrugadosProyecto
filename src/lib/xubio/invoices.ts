// Gestión de facturas en Xubio

import { xubioGet, xubioPost } from './client';
import { ensureXubioCustomer } from './customers';
import { getXubioConfig, getCompanyConfig } from '@/lib/config/system';
import { createClient } from '@/lib/supabase/server';
import type { Order, OrderItem, Client, TaxCondition } from '@/lib/types/database';
import type {
  XubioInvoiceRequest,
  XubioInvoiceResponse,
  XubioInvoiceItemRequest,
  XubioVoucherType,
} from './types';
import { XUBIO_IVA_21 } from './types';

/**
 * Determina el tipo de factura según la condición fiscal del cliente
 */
export function getInvoiceType(taxCondition: TaxCondition): XubioVoucherType {
  return taxCondition === 'responsable_inscripto' ? 'FA' : 'FB';
}

/**
 * Genera items de factura desde una orden
 */
function generateInvoiceItems(
  order: Order,
  items: OrderItem[],
  percentage: number = 100
): XubioInvoiceItemRequest[] {
  const invoiceItems: XubioInvoiceItemRequest[] = [];

  // Agregar items de cajas
  for (const item of items) {
    const quantity = item.quantity_delivered || item.quantity;
    const unitPrice = (order.subtotal / order.total_m2) * item.m2_per_box;

    invoiceItems.push({
      concepto_nombre: `Caja cartón corrugado ${item.length_mm}x${item.width_mm}x${item.height_mm}mm`,
      cantidad: quantity * (percentage / 100),
      precio_unitario: unitPrice,
      iva_id: XUBIO_IVA_21,
    });
  }

  // Agregar impresión si corresponde
  if (order.printing_cost > 0) {
    invoiceItems.push({
      concepto_nombre: 'Impresión flexográfica',
      cantidad: 1,
      precio_unitario: order.printing_cost * (percentage / 100),
      iva_id: XUBIO_IVA_21,
    });
  }

  // Agregar troquel si corresponde
  if (order.die_cut_cost > 0) {
    invoiceItems.push({
      concepto_nombre: 'Troquel',
      cantidad: 1,
      precio_unitario: order.die_cut_cost * (percentage / 100),
      iva_id: XUBIO_IVA_21,
    });
  }

  // Agregar envío si corresponde
  if (order.shipping_cost > 0) {
    invoiceItems.push({
      concepto_nombre: 'Envío',
      cantidad: 1,
      precio_unitario: order.shipping_cost * (percentage / 100),
      iva_id: XUBIO_IVA_21,
    });
  }

  return invoiceItems;
}

/**
 * Crea una factura de seña (50%) en Xubio
 */
export async function createDepositInvoice(
  orderId: string
): Promise<XubioInvoiceResponse> {
  const supabase = await createClient();
  const xubioConfig = await getXubioConfig();

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

  // Determinar tipo de factura
  const client = order.client as Client;
  const invoiceType = getInvoiceType(client.tax_condition);

  // Generar items (50% para seña)
  const items = generateInvoiceItems(order, order.items, 50);

  // Crear factura
  const invoiceRequest: XubioInvoiceRequest = {
    cliente_id: parseInt(xubioCustomerId),
    fecha: new Date().toISOString().split('T')[0],
    tipo_comprobante: invoiceType,
    punto_venta: parseInt(xubioConfig.xubio_point_of_sale) || 1,
    concepto: 1, // Productos
    items,
    observaciones: `Seña 50% - Orden ${order.order_number}`,
  };

  const invoice = await xubioPost<XubioInvoiceResponse>('/facturas', invoiceRequest);

  // Actualizar orden con datos de factura
  await supabase
    .from('orders')
    .update({
      xubio_deposit_invoice_id: String(invoice.id),
      xubio_deposit_invoice_number: invoice.numero,
    })
    .eq('id', orderId);

  // Registrar en log
  await supabase.from('integration_logs').insert({
    integration: 'xubio',
    operation: 'create_deposit_invoice',
    order_id: orderId,
    client_id: order.client_id,
    request_data: invoiceRequest,
    response_data: invoice,
    status: 'success',
  });

  return invoice;
}

/**
 * Crea una factura de saldo (50% restante o 100% para crédito) en Xubio
 */
export async function createBalanceInvoice(
  orderId: string
): Promise<XubioInvoiceResponse> {
  const supabase = await createClient();
  const xubioConfig = await getXubioConfig();

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

  // Determinar tipo de factura
  const client = order.client as Client;
  const invoiceType = getInvoiceType(client.tax_condition);

  // Porcentaje según esquema de pago
  const percentage = order.payment_scheme === 'credit' ? 100 : 50;

  // Generar items
  const items = generateInvoiceItems(order, order.items, percentage);

  // Fecha de vencimiento para crédito
  const dueDate = order.payment_scheme === 'credit' && client.credit_days
    ? new Date(Date.now() + client.credit_days * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]
    : undefined;

  // Crear factura
  const invoiceRequest: XubioInvoiceRequest = {
    cliente_id: parseInt(xubioCustomerId),
    fecha: new Date().toISOString().split('T')[0],
    fecha_vencimiento: dueDate,
    tipo_comprobante: invoiceType,
    punto_venta: parseInt(xubioConfig.xubio_point_of_sale) || 1,
    concepto: 1, // Productos
    items,
    observaciones: order.payment_scheme === 'credit'
      ? `Pago a ${client.credit_days} días - Orden ${order.order_number}`
      : `Saldo 50% - Orden ${order.order_number}`,
  };

  const invoice = await xubioPost<XubioInvoiceResponse>('/facturas', invoiceRequest);

  // Actualizar orden con datos de factura
  await supabase
    .from('orders')
    .update({
      xubio_balance_invoice_id: String(invoice.id),
      xubio_balance_invoice_number: invoice.numero,
    })
    .eq('id', orderId);

  // Registrar en log
  await supabase.from('integration_logs').insert({
    integration: 'xubio',
    operation: 'create_balance_invoice',
    order_id: orderId,
    client_id: order.client_id,
    request_data: invoiceRequest,
    response_data: invoice,
    status: 'success',
  });

  return invoice;
}

/**
 * Obtiene una factura de Xubio por ID
 */
export async function getXubioInvoice(
  invoiceId: string
): Promise<XubioInvoiceResponse> {
  return xubioGet<XubioInvoiceResponse>(`/facturas/${invoiceId}`);
}

/**
 * Genera preview de factura (sin crear en Xubio)
 */
export async function previewInvoice(
  orderId: string,
  type: 'deposit' | 'balance'
): Promise<{
  tipo_comprobante: string;
  cliente: string;
  cuit: string;
  items: { concepto: string; cantidad: number; precio: number; subtotal: number }[];
  subtotal: number;
  iva: number;
  total: number;
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
  const invoiceType = getInvoiceType(client.tax_condition);
  const percentage = type === 'deposit' ? 50 : (order.payment_scheme === 'credit' ? 100 : 50);

  const items = generateInvoiceItems(order, order.items, percentage);

  const previewItems = items.map(item => ({
    concepto: item.concepto_nombre,
    cantidad: item.cantidad,
    precio: item.precio_unitario,
    subtotal: item.cantidad * item.precio_unitario,
  }));

  const subtotal = previewItems.reduce((sum, item) => sum + item.subtotal, 0);
  const iva = subtotal * 0.21;

  return {
    tipo_comprobante: invoiceType === 'FA' ? 'Factura A' : 'Factura B',
    cliente: client.company || client.name,
    cuit: client.cuit || '-',
    items: previewItems,
    subtotal,
    iva,
    total: subtotal + iva,
  };
}
