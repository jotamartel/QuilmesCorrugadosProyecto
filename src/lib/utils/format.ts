/**
 * Funciones de formateo general
 * Quilmes Corrugados
 */

import type { QuoteStatus, OrderStatus, PaymentMethod, PaymentTerms } from '@/lib/types/database';

/**
 * Traducciones de estados de cotización
 */
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
  converted: 'Convertida',
};

/**
 * Colores para estados de cotización (Tailwind classes)
 */
export const QUOTE_STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  expired: 'bg-yellow-100 text-yellow-800',
  converted: 'bg-purple-100 text-purple-800',
};

/**
 * Traducciones de estados de orden
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_deposit: 'Pendiente seña',
  confirmed: 'Confirmada',
  in_production: 'En producción',
  ready: 'Lista',
  shipped: 'Despachada',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
};

/**
 * Colores para estados de orden (Tailwind classes)
 */
export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending_deposit: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  in_production: 'bg-orange-100 text-orange-800',
  ready: 'bg-green-100 text-green-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
};

/**
 * Flujo de estados de orden (para validación de transiciones)
 */
export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending_deposit: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'cancelled'],
  in_production: ['ready', 'cancelled'],
  ready: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

/**
 * Traducciones de métodos de pago
 */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  efectivo: 'Efectivo',
  echeq: 'eCheq',
};

/**
 * Traducciones de términos de pago
 */
export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  contado: 'Contado',
  cheque_30: 'Cheque a 30 días',
};

/**
 * Formatea medidas de caja (ej: "400 x 300 x 200 mm")
 */
export function formatBoxDimensions(
  length: number,
  width: number,
  height: number
): string {
  return `${length} x ${width} x ${height} mm`;
}

/**
 * Formatea medidas desplegadas
 */
export function formatUnfoldedDimensions(
  length: number,
  width: number
): string {
  return `${length} x ${width} mm`;
}

/**
 * Formatea cantidad con separador de miles
 */
export function formatQuantity(qty: number): string {
  return new Intl.NumberFormat('es-AR').format(qty);
}

/**
 * Formatea distancia en km
 */
export function formatDistance(km: number): string {
  return `${km} km`;
}

/**
 * Formatea CUIT (XX-XXXXXXXX-X)
 */
export function formatCUIT(cuit: string): string {
  const clean = cuit.replace(/\D/g, '');
  if (clean.length !== 11) return cuit;
  return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;
}

/**
 * Formatea teléfono
 */
export function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10) {
    return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  return phone;
}

/**
 * Trunca texto largo
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Genera iniciales de un nombre (para avatares)
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Valida si un email es válido
 */
export function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Valida si un CUIT es válido (solo formato, no dígito verificador)
 */
export function isValidCUIT(cuit: string): boolean {
  const clean = cuit.replace(/\D/g, '');
  return clean.length === 11;
}

/**
 * Verifica si una transición de estado de orden es válida
 */
export function isValidOrderStatusTransition(
  currentStatus: OrderStatus,
  newStatus: OrderStatus
): boolean {
  return ORDER_STATUS_FLOW[currentStatus].includes(newStatus);
}
