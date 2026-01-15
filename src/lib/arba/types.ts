// Tipos para la integración con ARBA COT
// Sistema de Código de Operación de Traslado de la Provincia de Buenos Aires

/**
 * Tipos de operación para COT
 */
export type CotOperationType =
  | 'E' // Entrega
  | 'T' // Traslado
  | 'R'; // Retiro

/**
 * Sujetos obligados
 */
export type CotSubjectType =
  | 'V' // Vendedor
  | 'C' // Comprador
  | 'T'; // Transportista

/**
 * Registro tipo 01 - Cabecera del archivo
 */
export interface CotHeader {
  tipo_registro: '01';
  cuit_empresa: string; // 11 dígitos
  fecha_proceso: string; // YYYYMMDD
  secuencia: string; // 4 dígitos
  cantidad_remitos: number;
}

/**
 * Registro tipo 02 - Datos del remito
 */
export interface CotRemito {
  tipo_registro: '02';
  // Datos del remito
  tipo_operacion: CotOperationType;
  sujeto_obligado: CotSubjectType;
  fecha_emision: string; // YYYYMMDD
  numero_unico: string; // Identificador único
  codigo_sucursal: string; // 4 dígitos
  numero_remito: string; // 8 dígitos

  // Datos del remitente
  remitente_cuit: string;
  remitente_razon_social: string;
  remitente_calle: string;
  remitente_numero: string;
  remitente_piso: string;
  remitente_depto: string;
  remitente_barrio: string;
  remitente_codigo_postal: string;
  remitente_localidad: string;
  remitente_provincia: string; // Código de provincia

  // Datos del destinatario
  destinatario_cuit: string;
  destinatario_razon_social: string;
  destinatario_calle: string;
  destinatario_numero: string;
  destinatario_piso: string;
  destinatario_depto: string;
  destinatario_barrio: string;
  destinatario_codigo_postal: string;
  destinatario_localidad: string;
  destinatario_provincia: string;

  // Datos del transporte
  transportista_cuit: string;
  patente: string;

  // Datos del producto
  cantidad_productos: number;
  valor_total: number; // Sin decimales, multiplicado por 100
}

/**
 * Registro tipo 03 - Detalle de productos
 */
export interface CotProduct {
  tipo_registro: '03';
  numero_unico: string; // Debe coincidir con el remito
  codigo_producto: string; // Código NCM
  descripcion: string;
  cantidad: number;
  unidad_medida: string; // 3 caracteres
  valor_unitario: number; // Sin decimales
}

/**
 * Respuesta del servicio COT de ARBA
 */
export interface CotResponse {
  success: boolean;
  cot_number?: string;
  error_code?: string;
  error_message?: string;
  validation_errors?: string[];
}

/**
 * Datos necesarios para generar un COT
 */
export interface CotRequestData {
  order_id: string;
  vehicle_id: string;

  // Remitente (empresa)
  remitente: {
    cuit: string;
    razon_social: string;
    domicilio: {
      calle: string;
      numero: string;
      piso?: string;
      depto?: string;
      barrio?: string;
      codigo_postal: string;
      localidad: string;
      provincia: string;
    };
  };

  // Destinatario (cliente)
  destinatario: {
    cuit: string;
    razon_social: string;
    domicilio: {
      calle: string;
      numero: string;
      piso?: string;
      depto?: string;
      barrio?: string;
      codigo_postal: string;
      localidad: string;
      provincia: string;
    };
  };

  // Transporte
  transporte: {
    cuit_conductor: string;
    nombre_conductor: string;
    patente: string;
  };

  // Productos
  productos: {
    codigo: string;
    descripcion: string;
    cantidad: number;
    unidad: string;
    valor_unitario: number;
  }[];
}

/**
 * Códigos de provincia para ARBA
 */
export const ARBA_PROVINCE_CODES: Record<string, string> = {
  'Buenos Aires': '01',
  'CABA': '00',
  'Capital Federal': '00',
  'Catamarca': '02',
  'Chaco': '03',
  'Chubut': '04',
  'Córdoba': '05',
  'Corrientes': '06',
  'Entre Ríos': '07',
  'Formosa': '08',
  'Jujuy': '09',
  'La Pampa': '10',
  'La Rioja': '11',
  'Mendoza': '12',
  'Misiones': '13',
  'Neuquén': '14',
  'Río Negro': '15',
  'Salta': '16',
  'San Juan': '17',
  'San Luis': '18',
  'Santa Cruz': '19',
  'Santa Fe': '20',
  'Santiago del Estero': '21',
  'Tierra del Fuego': '22',
  'Tucumán': '23',
};

/**
 * Unidades de medida válidas para ARBA
 */
export const ARBA_UNITS: Record<string, string> = {
  UNI: 'UNI', // Unidades
  KGS: 'KGS', // Kilogramos
  LTS: 'LTS', // Litros
  MTS: 'MTS', // Metros
  M2: 'M2', // Metros cuadrados
  M3: 'M3', // Metros cúbicos
  PAR: 'PAR', // Pares
  DOC: 'DOC', // Docenas
  GRS: 'GRS', // Gramos
};
