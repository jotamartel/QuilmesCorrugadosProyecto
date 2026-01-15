// Gestión de recibos/cobranzas en Xubio

import { xubioPost, xubioGet } from './client';
import { ensureXubioCustomer } from './customers';
import { createClient } from '@/lib/supabase/server';
import type { PaymentMethod } from '@/lib/types/database';
import type { XubioReceiptRequest, XubioReceiptResponse } from './types';
import { XUBIO_PAYMENT_METHODS } from './types';

/**
 * Mapea método de pago de Supabase a Xubio
 */
function mapPaymentMethodToXubio(method: PaymentMethod): number {
  const mapping: Record<PaymentMethod, number> = {
    efectivo: XUBIO_PAYMENT_METHODS.EFECTIVO,
    transferencia: XUBIO_PAYMENT_METHODS.TRANSFERENCIA,
    cheque: XUBIO_PAYMENT_METHODS.CHEQUE,
    echeq: XUBIO_PAYMENT_METHODS.CHEQUE, // eCheq se maneja como cheque
  };
  return mapping[method] || XUBIO_PAYMENT_METHODS.TRANSFERENCIA;
}

/**
 * Crea un recibo de pago en Xubio
 */
export async function createReceipt(
  paymentId: string
): Promise<XubioReceiptResponse> {
  const supabase = await createClient();

  // Obtener pago con orden y cliente
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select(`
      *,
      order:orders(*),
      client:clients(*)
    `)
    .eq('id', paymentId)
    .single();

  if (paymentError || !payment) {
    throw new Error('Pago no encontrado');
  }

  if (!payment.client_id) {
    throw new Error('El pago no tiene cliente asignado');
  }

  // Asegurar que el cliente esté en Xubio
  const xubioCustomerId = await ensureXubioCustomer(payment.client_id);

  // Determinar factura a asociar
  const order = payment.order;
  let facturaId: number | undefined;

  if (order) {
    if (payment.type === 'deposit' && order.xubio_deposit_invoice_id) {
      facturaId = parseInt(order.xubio_deposit_invoice_id);
    } else if ((payment.type === 'balance' || payment.type === 'full') && order.xubio_balance_invoice_id) {
      facturaId = parseInt(order.xubio_balance_invoice_id);
    }
  }

  // Crear recibo
  const receiptRequest: XubioReceiptRequest = {
    cliente_id: parseInt(xubioCustomerId),
    fecha: new Date().toISOString().split('T')[0],
    monto: payment.amount,
    forma_pago_id: mapPaymentMethodToXubio(payment.method),
    facturas: facturaId ? [{ factura_id: facturaId, monto: payment.amount }] : undefined,
    observaciones: order
      ? `Pago ${payment.type === 'deposit' ? 'seña' : 'saldo'} - Orden ${order.order_number}`
      : payment.notes || undefined,
  };

  const receipt = await xubioPost<XubioReceiptResponse>('/cobranzas', receiptRequest);

  // Actualizar pago con datos del recibo
  await supabase
    .from('payments')
    .update({
      xubio_receipt_id: String(receipt.id),
      xubio_receipt_number: receipt.numero,
      status: 'completed',
    })
    .eq('id', paymentId);

  // Registrar en log
  await supabase.from('integration_logs').insert({
    integration: 'xubio',
    operation: 'create_receipt',
    order_id: payment.order_id,
    client_id: payment.client_id,
    request_data: receiptRequest,
    response_data: receipt,
    status: 'success',
  });

  return receipt;
}

/**
 * Crea un recibo de seña para una orden
 */
export async function createDepositReceipt(
  orderId: string,
  method: PaymentMethod,
  amount: number,
  checkData?: {
    bank: string;
    number: string;
    date: string;
    holder?: string;
    cuit?: string;
  }
): Promise<XubioReceiptResponse> {
  const supabase = await createClient();

  // Obtener orden
  const { data: order, error } = await supabase
    .from('orders')
    .select('client_id, order_number')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    throw new Error('Orden no encontrada');
  }

  // Crear registro de pago
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      order_id: orderId,
      client_id: order.client_id,
      type: 'deposit',
      amount,
      method,
      check_bank: checkData?.bank,
      check_number: checkData?.number,
      check_date: checkData?.date,
      check_holder: checkData?.holder,
      check_cuit: checkData?.cuit,
      status: 'pending',
    })
    .select()
    .single();

  if (paymentError || !payment) {
    throw new Error('No se pudo registrar el pago');
  }

  // Si es cheque, crear registro en cartera
  if ((method === 'cheque' || method === 'echeq') && checkData) {
    await supabase.from('checks').insert({
      payment_id: payment.id,
      client_id: order.client_id,
      bank: checkData.bank,
      number: checkData.number,
      amount,
      due_date: checkData.date,
      holder: checkData.holder,
      holder_cuit: checkData.cuit,
      status: 'in_portfolio',
    });
  }

  // Crear recibo en Xubio
  return createReceipt(payment.id);
}

/**
 * Crea un recibo de saldo para una orden
 */
export async function createBalanceReceipt(
  orderId: string,
  method: PaymentMethod,
  amount: number,
  checkData?: {
    bank: string;
    number: string;
    date: string;
    holder?: string;
    cuit?: string;
  }
): Promise<XubioReceiptResponse> {
  const supabase = await createClient();

  // Obtener orden
  const { data: order, error } = await supabase
    .from('orders')
    .select('client_id, order_number, payment_scheme')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    throw new Error('Orden no encontrada');
  }

  // Determinar tipo de pago
  const paymentType = order.payment_scheme === 'credit' ? 'full' : 'balance';

  // Crear registro de pago
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      order_id: orderId,
      client_id: order.client_id,
      type: paymentType,
      amount,
      method,
      check_bank: checkData?.bank,
      check_number: checkData?.number,
      check_date: checkData?.date,
      check_holder: checkData?.holder,
      check_cuit: checkData?.cuit,
      status: 'pending',
    })
    .select()
    .single();

  if (paymentError || !payment) {
    throw new Error('No se pudo registrar el pago');
  }

  // Si es cheque, crear registro en cartera
  if ((method === 'cheque' || method === 'echeq') && checkData) {
    await supabase.from('checks').insert({
      payment_id: payment.id,
      client_id: order.client_id,
      bank: checkData.bank,
      number: checkData.number,
      amount,
      due_date: checkData.date,
      holder: checkData.holder,
      holder_cuit: checkData.cuit,
      status: 'in_portfolio',
    });
  }

  // Crear recibo en Xubio
  return createReceipt(payment.id);
}

/**
 * Obtiene un recibo de Xubio por ID
 */
export async function getXubioReceipt(
  receiptId: string
): Promise<XubioReceiptResponse> {
  return xubioGet<XubioReceiptResponse>(`/cobranzas/${receiptId}`);
}
