// Gestión de clientes en Xubio
// Sincroniza clientes entre Supabase y Xubio

import { xubioGet, xubioPost, xubioPut } from './client';
import { createClient } from '@/lib/supabase/server';
import type { Client, TaxCondition } from '@/lib/types/database';
import type {
  XubioCustomerRequest,
  XubioCustomerResponse,
  XubioIvaCondition,
} from './types';
import { XUBIO_PROVINCES } from './types';

/**
 * Mapea condición fiscal de Supabase a Xubio
 */
export function mapTaxConditionToXubio(condition: TaxCondition): XubioIvaCondition {
  const mapping: Record<TaxCondition, XubioIvaCondition> = {
    responsable_inscripto: 'RI',
    monotributista: 'MO',
    consumidor_final: 'CF',
    exento: 'EX',
  };
  return mapping[condition] || 'CF';
}

/**
 * Mapea condición fiscal de Xubio a Supabase
 */
export function mapXubioToTaxCondition(condition: XubioIvaCondition): TaxCondition {
  const mapping: Record<XubioIvaCondition, TaxCondition> = {
    'RI': 'responsable_inscripto',
    'MO': 'monotributista',
    'CF': 'consumidor_final',
    'EX': 'exento',
    'NG': 'exento',
  };
  return mapping[condition] || 'consumidor_final';
}

/**
 * Convierte un cliente de Supabase al formato de Xubio
 */
export function clientToXubioCustomer(client: Client): XubioCustomerRequest {
  const provinceId = XUBIO_PROVINCES[client.province] || XUBIO_PROVINCES['Buenos Aires'];

  return {
    nombre: client.company || client.name,
    tipo_identificacion: client.cuit ? 'CUIT' : undefined,
    identificacion: client.cuit || undefined,
    condicion_iva: mapTaxConditionToXubio(client.tax_condition),
    domicilio: client.address || undefined,
    localidad: client.city || undefined,
    provincia_id: provinceId,
    codigo_postal: client.postal_code || undefined,
    email: client.email || undefined,
    telefono: client.phone || undefined,
    contacto: client.company ? client.name : undefined,
    observaciones: client.notes || undefined,
  };
}

/**
 * Crea un cliente en Xubio
 */
export async function createXubioCustomer(
  client: Client
): Promise<XubioCustomerResponse> {
  const customerData = clientToXubioCustomer(client);
  return xubioPost<XubioCustomerResponse>('/clientes', customerData);
}

/**
 * Actualiza un cliente en Xubio
 */
export async function updateXubioCustomer(
  xubioId: string,
  client: Client
): Promise<XubioCustomerResponse> {
  const customerData = clientToXubioCustomer(client);
  return xubioPut<XubioCustomerResponse>(`/clientes/${xubioId}`, customerData);
}

/**
 * Obtiene un cliente de Xubio por ID
 */
export async function getXubioCustomer(
  xubioId: string
): Promise<XubioCustomerResponse> {
  return xubioGet<XubioCustomerResponse>(`/clientes/${xubioId}`);
}

/**
 * Busca un cliente en Xubio por CUIT
 */
export async function findXubioCustomerByCuit(
  cuit: string
): Promise<XubioCustomerResponse | null> {
  try {
    const response = await xubioGet<{ data: XubioCustomerResponse[] }>(
      `/clientes?identificacion=${cuit}`
    );
    return response.data?.[0] || null;
  } catch {
    return null;
  }
}

/**
 * Sincroniza un cliente de Supabase con Xubio
 * - Si no tiene xubio_id, lo crea
 * - Si tiene xubio_id, lo actualiza
 * - Actualiza el xubio_id en Supabase si es nuevo
 */
export async function syncClientToXubio(clientId: string): Promise<{
  success: boolean;
  xubio_id: string | null;
  message: string;
}> {
  const supabase = await createClient();

  // Obtener cliente de Supabase
  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (error || !client) {
    return {
      success: false,
      xubio_id: null,
      message: 'Cliente no encontrado',
    };
  }

  try {
    let xubioCustomer: XubioCustomerResponse;

    if (client.xubio_id) {
      // Actualizar cliente existente
      xubioCustomer = await updateXubioCustomer(client.xubio_id, client as Client);
    } else {
      // Buscar por CUIT primero (evitar duplicados)
      if (client.cuit) {
        const existing = await findXubioCustomerByCuit(client.cuit);
        if (existing) {
          // Ya existe, asociar
          xubioCustomer = existing;
        } else {
          // Crear nuevo
          xubioCustomer = await createXubioCustomer(client as Client);
        }
      } else {
        // Sin CUIT, crear nuevo
        xubioCustomer = await createXubioCustomer(client as Client);
      }

      // Actualizar xubio_id en Supabase
      await supabase
        .from('clients')
        .update({ xubio_id: String(xubioCustomer.id) })
        .eq('id', clientId);
    }

    return {
      success: true,
      xubio_id: String(xubioCustomer.id),
      message: 'Cliente sincronizado correctamente',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return {
      success: false,
      xubio_id: client.xubio_id,
      message,
    };
  }
}

/**
 * Asegura que un cliente tenga xubio_id
 * Lo crea/sincroniza si no lo tiene
 */
export async function ensureXubioCustomer(clientId: string): Promise<string> {
  const supabase = await createClient();

  // Obtener cliente
  const { data: client, error } = await supabase
    .from('clients')
    .select('xubio_id')
    .eq('id', clientId)
    .single();

  if (error || !client) {
    throw new Error('Cliente no encontrado');
  }

  // Si ya tiene xubio_id, retornarlo
  if (client.xubio_id) {
    return client.xubio_id;
  }

  // Sincronizar con Xubio
  const result = await syncClientToXubio(clientId);

  if (!result.success || !result.xubio_id) {
    throw new Error(`No se pudo sincronizar cliente con Xubio: ${result.message}`);
  }

  return result.xubio_id;
}
