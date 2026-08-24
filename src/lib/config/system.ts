// Sistema de configuración centralizado
// Lee y escribe configuración desde la tabla system_config de Supabase
//
// POR QUE createAdminClient Y NO EL CLIENTE DE SESION
//
// system_config tiene RLS prendido con cero policies: el cliente de sesion lee
// CERO filas sin error y los upserts rebotan con violacion de RLS. Este modulo
// usaba el cliente de sesion, asi que getCompanyConfig(), getXubioConfig() y
// getArbaConfig() devolvian todo vacio en silencio, y el guardado del tab
// Empresa fallaba. Se descubrio al construir los datos bancarios (2026-08):
// las 19 keys existentes las habian sembrado migraciones, no la UI.
//
// La autorizacion no se pierde: todas las rutas que llaman aca estan detras de
// la compuerta de src/proxy.ts, que exige sesion antes de llegar al handler.

import { createAdminClient } from '@/lib/supabase/admin';
import type {
  SystemConfig,
  CompanyConfig,
  XubioConfig,
  ArbaConfig,
  FullSystemConfig,
  PaymentBankConfig
} from '@/lib/types/database';

// Cache en memoria para evitar múltiples queries
let configCache: Map<string, string | null> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minuto

/**
 * Invalida el cache de configuración
 */
export function invalidateConfigCache(): void {
  configCache = null;
  cacheTimestamp = 0;
}

/**
 * Obtiene todas las configuraciones
 */
export async function getAllConfig(): Promise<Map<string, string | null>> {
  const now = Date.now();

  // Retornar cache si es válido
  if (configCache && (now - cacheTimestamp) < CACHE_TTL) {
    return configCache;
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('system_config')
    .select('key, value');

  if (error) {
    console.error('Error loading system config:', error);
    throw new Error('No se pudo cargar la configuración del sistema');
  }

  configCache = new Map();
  for (const row of data || []) {
    configCache.set(row.key, row.value);
  }
  cacheTimestamp = now;

  return configCache;
}

/**
 * Obtiene un valor de configuración específico
 */
export async function getConfigValue(key: string): Promise<string | null> {
  const config = await getAllConfig();
  return config.get(key) ?? null;
}

/**
 * Obtiene múltiples valores de configuración
 */
export async function getConfigValues(keys: string[]): Promise<Record<string, string | null>> {
  const config = await getAllConfig();
  const result: Record<string, string | null> = {};

  for (const key of keys) {
    result[key] = config.get(key) ?? null;
  }

  return result;
}

/**
 * Establece un valor de configuración
 */
export async function setConfigValue(key: string, value: string | null): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('system_config')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) {
    console.error('Error setting config value:', error);
    throw new Error(`No se pudo guardar la configuración: ${key}`);
  }

  // Invalidar cache
  invalidateConfigCache();
}

/**
 * Establece múltiples valores de configuración
 */
export async function setConfigValues(values: Record<string, string | null>): Promise<void> {
  const supabase = createAdminClient();

  const rows = Object.entries(values).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('system_config')
    .upsert(rows, { onConflict: 'key' });

  if (error) {
    console.error('Error setting config values:', error);
    throw new Error('No se pudo guardar la configuración');
  }

  // Invalidar cache
  invalidateConfigCache();
}

/**
 * Obtiene la configuración de la empresa
 */
export async function getCompanyConfig(): Promise<CompanyConfig> {
  const keys = [
    'company_name',
    'company_cuit',
    'company_address',
    'company_city',
    'company_province',
    'company_postal_code',
    'company_email',
    'company_phone',
    'company_iibb',
    'company_start_date',
  ];

  const values = await getConfigValues(keys);

  return {
    company_name: values.company_name || '',
    company_cuit: values.company_cuit || '',
    company_address: values.company_address || '',
    company_city: values.company_city || '',
    company_province: values.company_province || '',
    company_postal_code: values.company_postal_code || '',
    company_email: values.company_email || '',
    company_phone: values.company_phone || '',
    company_iibb: values.company_iibb || '',
    company_start_date: values.company_start_date || '',
  };
}

/**
 * Obtiene la configuración de Xubio
 */
export async function getXubioConfig(): Promise<XubioConfig> {
  const keys = [
    'xubio_client_id',
    'xubio_secret_id',
    'xubio_enabled',
    'xubio_point_of_sale',
  ];

  const values = await getConfigValues(keys);

  return {
    xubio_client_id: values.xubio_client_id || '',
    xubio_secret_id: values.xubio_secret_id || '',
    xubio_enabled: values.xubio_enabled === 'true',
    xubio_point_of_sale: values.xubio_point_of_sale || '1',
  };
}

/**
 * Obtiene la configuración de ARBA COT
 */
export async function getArbaConfig(): Promise<ArbaConfig> {
  const keys = [
    'arba_cit_user',
    'arba_cit_password',
    'arba_cot_enabled',
    'arba_cot_product_code',
    'arba_cot_product_unit',
  ];

  const values = await getConfigValues(keys);

  return {
    arba_cit_user: values.arba_cit_user || '',
    arba_cit_password: values.arba_cit_password || '',
    arba_cot_enabled: values.arba_cot_enabled === 'true',
    arba_cot_product_code: values.arba_cot_product_code || '16.05.11.10',
    arba_cot_product_unit: values.arba_cot_product_unit || 'UNI',
  };
}

/**
 * Los datos bancarios para transferencias, crudos.
 *
 * Sembrados vacios por la migracion 032; los carga Fernando desde
 * /configuracion → Empresa. Para CONSUMIRLOS no usar esto: usar
 * getBankDataForClient(), que aplica la regla de todo-o-nada.
 */
export async function getPaymentBankConfig(): Promise<PaymentBankConfig> {
  const values = await getConfigValues([
    'payment_bank_alias',
    'payment_bank_cbu',
    'payment_bank_holder',
    'payment_bank_cuit',
    'payment_bank_name',
  ]);

  return {
    payment_bank_alias: values.payment_bank_alias || '',
    payment_bank_cbu: values.payment_bank_cbu || '',
    payment_bank_holder: values.payment_bank_holder || '',
    payment_bank_cuit: values.payment_bank_cuit || '',
    payment_bank_name: values.payment_bank_name || '',
  };
}

/** Lo que se le muestra a un cliente para transferir. */
export interface DatosBancarios {
  alias: string;
  cbu: string;
  holder: string;
  cuit: string;
  bank: string | null;
}

/**
 * Los datos bancarios listos para mostrarle a un cliente, o null.
 *
 * TODO O NADA A PROPOSITO: si falta cualquiera de los cuatro obligatorios
 * (alias, cbu, titular, cuit) devuelve null, y cada consumidor —la pagina
 * publica de la cotizacion, la herramienta del agente, los avisos— cae a su
 * texto anterior. Un "CBU: undefined" delante de un cliente es peor que no
 * mostrar nada, y mostrar el alias sin el titular invita a transferir a una
 * cuenta que no se puede verificar.
 */
export async function getBankDataForClient(): Promise<DatosBancarios | null> {
  const c = await getPaymentBankConfig();
  const obligatorios = [c.payment_bank_alias, c.payment_bank_cbu, c.payment_bank_holder, c.payment_bank_cuit];
  if (obligatorios.some((v) => !v.trim())) return null;

  return {
    alias: c.payment_bank_alias.trim(),
    cbu: c.payment_bank_cbu.trim(),
    holder: c.payment_bank_holder.trim(),
    cuit: c.payment_bank_cuit.trim(),
    bank: c.payment_bank_name.trim() || null,
  };
}

/**
 * Obtiene toda la configuración del sistema
 */
export async function getFullSystemConfig(): Promise<FullSystemConfig> {
  const [company, xubio, arba, bank] = await Promise.all([
    getCompanyConfig(),
    getXubioConfig(),
    getArbaConfig(),
    getPaymentBankConfig(),
  ]);

  return { ...company, ...xubio, ...arba, ...bank };
}

/**
 * Verifica si Xubio está habilitado y configurado
 */
export async function isXubioEnabled(): Promise<boolean> {
  const config = await getXubioConfig();
  return config.xubio_enabled && !!config.xubio_client_id && !!config.xubio_secret_id;
}

/**
 * Verifica si ARBA COT está habilitado y configurado
 */
export async function isArbaCotEnabled(): Promise<boolean> {
  const config = await getArbaConfig();
  return config.arba_cot_enabled && !!config.arba_cit_user && !!config.arba_cit_password;
}
