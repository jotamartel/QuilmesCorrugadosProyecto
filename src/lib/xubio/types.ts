// Tipos específicos para la API de Xubio
// Documentación: https://xubio.com/ar/api

export interface XubioToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number; // Calculado
}

// Condiciones de IVA en Xubio
export type XubioIvaCondition =
  | 'RI' // Responsable Inscripto
  | 'MO' // Monotributista
  | 'CF' // Consumidor Final
  | 'EX' // Exento
  | 'NG'; // No Gravado

// Tipos de comprobante
export type XubioVoucherType =
  | 'FA' // Factura A
  | 'FB' // Factura B
  | 'FC' // Factura C
  | 'NCA' // Nota de Crédito A
  | 'NCB' // Nota de Crédito B
  | 'NCC' // Nota de Crédito C
  | 'NDA' // Nota de Débito A
  | 'NDB' // Nota de Débito B
  | 'NDC' // Nota de Débito C
  | 'REM'; // Remito

// IVA por defecto (21%)
export const XUBIO_IVA_21 = 5; // ID del IVA 21% en Xubio

export interface XubioCustomerRequest {
  nombre: string;
  tipo_identificacion?: string; // 'CUIT' | 'CUIL' | 'DNI'
  identificacion?: string;
  condicion_iva: XubioIvaCondition;
  domicilio?: string;
  localidad?: string;
  provincia_id?: number;
  codigo_postal?: string;
  email?: string;
  telefono?: string;
  contacto?: string;
  observaciones?: string;
}

export interface XubioCustomerResponse {
  id: number;
  nombre: string;
  tipo_identificacion: string;
  identificacion: string;
  condicion_iva: XubioIvaCondition;
  domicilio: string;
  localidad: string;
  provincia: {
    id: number;
    nombre: string;
  };
  codigo_postal: string;
  email: string;
  telefono: string;
  created_at: string;
  updated_at: string;
}

export interface XubioInvoiceItemRequest {
  concepto_id?: number;
  concepto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  bonificacion?: number;
  iva_id: number;
  alicuota_iva?: number;
}

export interface XubioInvoiceRequest {
  cliente_id: number;
  fecha: string; // YYYY-MM-DD
  fecha_vencimiento?: string;
  tipo_comprobante: XubioVoucherType;
  punto_venta: number;
  concepto?: number; // 1: Productos, 2: Servicios, 3: Productos y Servicios
  condicion_venta?: string;
  items: XubioInvoiceItemRequest[];
  observaciones?: string;
}

export interface XubioInvoiceResponse {
  id: number;
  numero: string;
  cliente: {
    id: number;
    nombre: string;
  };
  fecha: string;
  fecha_vencimiento: string;
  tipo_comprobante: XubioVoucherType;
  punto_venta: number;
  cae: string;
  cae_vencimiento: string;
  subtotal: number;
  total_iva: number;
  total: number;
  estado: string;
  created_at: string;
}

export interface XubioReceiptRequest {
  cliente_id: number;
  fecha: string;
  monto: number;
  forma_pago_id: number;
  facturas?: {
    factura_id: number;
    monto: number;
  }[];
  observaciones?: string;
}

export interface XubioReceiptResponse {
  id: number;
  numero: string;
  cliente: {
    id: number;
    nombre: string;
  };
  fecha: string;
  monto: number;
  forma_pago: {
    id: number;
    nombre: string;
  };
  created_at: string;
}

export interface XubioRemitoItemRequest {
  concepto_nombre: string;
  cantidad: number;
  unidad?: string;
}

export interface XubioRemitoRequest {
  cliente_id: number;
  fecha: string;
  domicilio_entrega: string;
  localidad_entrega?: string;
  observaciones?: string;
  items: XubioRemitoItemRequest[];
}

export interface XubioRemitoResponse {
  id: number;
  numero: string;
  cliente: {
    id: number;
    nombre: string;
  };
  fecha: string;
  domicilio_entrega: string;
  items: {
    concepto_nombre: string;
    cantidad: number;
  }[];
  created_at: string;
}

// Formas de pago comunes
export const XUBIO_PAYMENT_METHODS = {
  EFECTIVO: 1,
  TRANSFERENCIA: 2,
  CHEQUE: 3,
  TARJETA_CREDITO: 4,
  TARJETA_DEBITO: 5,
} as const;

// Mapeo de provincias argentinas a IDs de Xubio
export const XUBIO_PROVINCES: Record<string, number> = {
  'Buenos Aires': 1,
  'CABA': 2,
  'Capital Federal': 2,
  'Catamarca': 3,
  'Chaco': 4,
  'Chubut': 5,
  'Córdoba': 6,
  'Corrientes': 7,
  'Entre Ríos': 8,
  'Formosa': 9,
  'Jujuy': 10,
  'La Pampa': 11,
  'La Rioja': 12,
  'Mendoza': 13,
  'Misiones': 14,
  'Neuquén': 15,
  'Río Negro': 16,
  'Salta': 17,
  'San Juan': 18,
  'San Luis': 19,
  'Santa Cruz': 20,
  'Santa Fe': 21,
  'Santiago del Estero': 22,
  'Tierra del Fuego': 23,
  'Tucumán': 24,
};

export interface XubioApiError {
  error: string;
  message: string;
  status_code: number;
}
