// Generación de COT para órdenes

import { createClient } from '@/lib/supabase/server';
import { getCompanyConfig, getArbaConfig } from '@/lib/config/system';
import { generateCotFile, generateCotFilename } from './file-generator';
import { sendCotToArba } from './client';
import type { CotRequestData, CotResponse } from './types';
import type { Order, OrderItem, Client, Vehicle } from '@/lib/types/database';

/**
 * Parsea una dirección en sus componentes
 */
function parseAddress(fullAddress: string): {
  calle: string;
  numero: string;
  piso?: string;
  depto?: string;
} {
  const match = fullAddress.match(/^(.+?)\s+(\d+)\s*(.*)$/);

  if (match) {
    const [, calle, numero, resto] = match;
    const pisoMatch = resto?.match(/piso\s*(\w+)/i);
    const deptoMatch = resto?.match(/(?:dto|depto|dpto)\s*(\w+)/i);

    return {
      calle: calle.trim(),
      numero,
      piso: pisoMatch?.[1],
      depto: deptoMatch?.[1],
    };
  }

  return {
    calle: fullAddress,
    numero: 'S/N',
  };
}

/**
 * Genera un COT para una orden
 */
export async function generateCot(orderId: string): Promise<CotResponse> {
  const supabase = await createClient();
  const companyConfig = await getCompanyConfig();
  const arbaConfig = await getArbaConfig();

  // Obtener orden completa
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      *,
      client:clients(*),
      items:order_items(*),
      vehicle:vehicles(*)
    `)
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return { success: false, error_message: 'Orden no encontrada' };
  }

  if (!order.vehicle_id || !order.vehicle) {
    return { success: false, error_message: 'Vehículo no asignado a la orden' };
  }

  if (!order.client_id || !order.client) {
    return { success: false, error_message: 'Cliente no asignado a la orden' };
  }

  const client = order.client as Client;
  const vehicle = order.vehicle as Vehicle;

  // Validaciones
  if (!client.cuit) {
    return { success: false, error_message: 'El cliente no tiene CUIT' };
  }

  if (!vehicle.driver_cuit) {
    return { success: false, error_message: 'El vehículo no tiene CUIT del conductor' };
  }

  if (!companyConfig.company_cuit) {
    return { success: false, error_message: 'CUIT de la empresa no configurado' };
  }

  // Parsear direcciones
  const remitenteAddress = parseAddress(companyConfig.company_address);
  const deliveryAddress = order.delivery_address || client.address || '';
  const destinatarioAddress = parseAddress(deliveryAddress);

  // Preparar datos del COT
  const cotData: CotRequestData = {
    order_id: orderId,
    vehicle_id: order.vehicle_id,

    remitente: {
      cuit: companyConfig.company_cuit,
      razon_social: companyConfig.company_name,
      domicilio: {
        calle: remitenteAddress.calle,
        numero: remitenteAddress.numero,
        piso: remitenteAddress.piso,
        depto: remitenteAddress.depto,
        codigo_postal: companyConfig.company_postal_code,
        localidad: companyConfig.company_city,
        provincia: companyConfig.company_province,
      },
    },

    destinatario: {
      cuit: client.cuit,
      razon_social: client.company || client.name,
      domicilio: {
        calle: destinatarioAddress.calle,
        numero: destinatarioAddress.numero,
        piso: destinatarioAddress.piso,
        depto: destinatarioAddress.depto,
        codigo_postal: client.postal_code || '',
        localidad: order.delivery_city || client.city || '',
        provincia: client.province,
      },
    },

    transporte: {
      cuit_conductor: vehicle.driver_cuit,
      nombre_conductor: vehicle.driver_name || '',
      patente: vehicle.patent,
    },

    productos: order.items.map((item: OrderItem) => {
      const quantity = item.quantity_delivered || item.quantity;
      // Calcular precio unitario basado en el total
      const unitPrice = order.subtotal / order.total_m2 * item.m2_per_box;

      return {
        codigo: arbaConfig.arba_cot_product_code || '16.05.11.10',
        descripcion: `Caja carton corrugado ${item.length_mm}x${item.width_mm}x${item.height_mm}mm`,
        cantidad: quantity,
        unidad: arbaConfig.arba_cot_product_unit || 'UNI',
        valor_unitario: unitPrice,
      };
    }),
  };

  // Generar archivo
  const archivo = generateCotFile(cotData, { cuit: companyConfig.company_cuit });

  // Registrar intento en log
  await supabase.from('integration_logs').insert({
    integration: 'arba',
    operation: 'generate_cot',
    order_id: orderId,
    client_id: order.client_id,
    request_data: cotData,
    status: 'pending',
  });

  // Enviar a ARBA
  const response = await sendCotToArba(archivo);

  // Actualizar log con resultado
  await supabase
    .from('integration_logs')
    .update({
      response_data: response,
      status: response.success ? 'success' : 'error',
      error_message: response.error_message,
    })
    .eq('order_id', orderId)
    .eq('operation', 'generate_cot')
    .eq('status', 'pending');

  // Si fue exitoso, actualizar orden
  if (response.success && response.cot_number) {
    await supabase
      .from('orders')
      .update({
        cot_number: response.cot_number,
        cot_generated_at: new Date().toISOString(),
      })
      .eq('id', orderId);
  }

  return response;
}

/**
 * Genera un preview del COT sin enviarlo a ARBA
 * Útil para verificar los datos antes de generar
 */
export async function previewCot(orderId: string): Promise<{
  remitente: {
    cuit: string;
    razon_social: string;
    domicilio: string;
  };
  destinatario: {
    cuit: string;
    razon_social: string;
    domicilio: string;
  };
  transporte: {
    patente: string;
    conductor: string;
    cuit_conductor: string;
  };
  productos: {
    descripcion: string;
    cantidad: number;
    valor: number;
  }[];
  warnings: string[];
}> {
  const supabase = await createClient();
  const companyConfig = await getCompanyConfig();
  const arbaConfig = await getArbaConfig();

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
  const vehicle = order.vehicle as Vehicle | null;
  const warnings: string[] = [];

  // Validaciones
  if (!client.cuit) warnings.push('El cliente no tiene CUIT');
  if (!vehicle) warnings.push('No hay vehículo asignado');
  if (vehicle && !vehicle.driver_cuit) warnings.push('El vehículo no tiene CUIT del conductor');
  if (!companyConfig.company_cuit) warnings.push('CUIT de la empresa no configurado');
  if (!companyConfig.company_address) warnings.push('Domicilio de la empresa no configurado');

  const deliveryAddress = order.delivery_address || client.address || '';
  const deliveryCity = order.delivery_city || client.city || '';

  return {
    remitente: {
      cuit: companyConfig.company_cuit || '-',
      razon_social: companyConfig.company_name || '-',
      domicilio: `${companyConfig.company_address}, ${companyConfig.company_city}`,
    },
    destinatario: {
      cuit: client.cuit || '-',
      razon_social: client.company || client.name,
      domicilio: `${deliveryAddress}, ${deliveryCity}`,
    },
    transporte: {
      patente: vehicle?.patent || '-',
      conductor: vehicle?.driver_name || '-',
      cuit_conductor: vehicle?.driver_cuit || '-',
    },
    productos: order.items.map((item: OrderItem) => {
      const quantity = item.quantity_delivered || item.quantity;
      const unitPrice = order.subtotal / order.total_m2 * item.m2_per_box;

      return {
        descripcion: `Caja ${item.length_mm}x${item.width_mm}x${item.height_mm}mm`,
        cantidad: quantity,
        valor: quantity * unitPrice,
      };
    }),
    warnings,
  };
}

/**
 * Regenera un COT para una orden (si el anterior falló o expiró)
 */
export async function regenerateCot(orderId: string): Promise<CotResponse> {
  const supabase = await createClient();

  // Verificar que la orden tenga un COT anterior
  const { data: order, error } = await supabase
    .from('orders')
    .select('cot_number')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    return { success: false, error_message: 'Orden no encontrada' };
  }

  // Limpiar COT anterior
  await supabase
    .from('orders')
    .update({
      cot_number: null,
      cot_generated_at: null,
    })
    .eq('id', orderId);

  // Generar nuevo
  return generateCot(orderId);
}
