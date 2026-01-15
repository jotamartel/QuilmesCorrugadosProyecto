/**
 * Funciones de manejo de fechas
 * Quilmes Corrugados
 */

import { addDays, isWeekend, format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Calcula la fecha de entrega estimada considerando solo días hábiles
 * (excluye sábados y domingos)
 *
 * @param productionDays Días hábiles de producción
 * @param startDate Fecha de inicio (default: hoy)
 * @returns Fecha estimada de entrega
 */
export function calculateDeliveryDate(
  productionDays: number,
  startDate: Date = new Date()
): Date {
  let date = new Date(startDate);
  let daysAdded = 0;

  while (daysAdded < productionDays) {
    date = addDays(date, 1);
    if (!isWeekend(date)) {
      daysAdded++;
    }
  }

  return date;
}

/**
 * Calcula la fecha de vencimiento de una cotización
 * @param validityDays Días de validez (default: 7)
 * @param startDate Fecha de inicio
 * @returns Fecha de vencimiento
 */
export function calculateValidUntil(
  validityDays: number = 7,
  startDate: Date = new Date()
): Date {
  return addDays(startDate, validityDays);
}

/**
 * Verifica si una cotización está expirada
 */
export function isExpired(validUntil: string | Date): boolean {
  const validDate = typeof validUntil === 'string' ? parseISO(validUntil) : validUntil;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return validDate < today;
}

/**
 * Calcula los días restantes hasta una fecha
 * @returns Número de días (negativo si ya pasó)
 */
export function daysRemaining(targetDate: string | Date): number {
  const date = typeof targetDate === 'string' ? parseISO(targetDate) : targetDate;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return differenceInDays(date, today);
}

/**
 * Formatea una fecha en formato argentino (DD/MM/YYYY)
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd/MM/yyyy', { locale: es });
}

/**
 * Formatea una fecha con hora
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, "dd/MM/yyyy 'a las' HH:mm", { locale: es });
}

/**
 * Formatea una fecha de forma relativa (ej: "hace 2 días", "en 3 días")
 */
export function formatRelativeDate(date: string | Date): string {
  const days = daysRemaining(date);

  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  if (days === -1) return 'Ayer';
  if (days > 0) return `En ${days} días`;
  return `Hace ${Math.abs(days)} días`;
}

/**
 * Retorna la fecha en formato ISO (YYYY-MM-DD)
 */
export function toISODateString(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Obtiene el inicio del día actual
 */
export function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Formatea el nombre del mes y año
 */
export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy', { locale: es });
}
