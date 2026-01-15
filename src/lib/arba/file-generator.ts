// Generador de archivo TXT para COT ARBA
// Según especificación técnica de ARBA para el sistema COT

import type { CotHeader, CotRemito, CotProduct, CotRequestData } from './types';
import { ARBA_PROVINCE_CODES } from './types';

/**
 * Formatea un string a longitud fija, rellenando con espacios a la derecha
 */
function padRight(value: string, length: number): string {
  return value.substring(0, length).padEnd(length, ' ');
}

/**
 * Formatea un string a longitud fija, rellenando con ceros a la izquierda
 */
function padLeft(value: string, length: number, char: string = '0'): string {
  return value.substring(0, length).padStart(length, char);
}

/**
 * Formatea un número a string sin decimales
 */
function formatNumber(value: number, length: number): string {
  const intValue = Math.round(value * 100); // Multiplicar por 100 para quitar decimales
  return padLeft(intValue.toString(), length);
}

/**
 * Formatea una fecha al formato ARBA (YYYYMMDD)
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Genera el registro tipo 01 (cabecera)
 */
function generateHeader(data: {
  cuit: string;
  fecha: Date;
  secuencia: number;
  cantidadRemitos: number;
}): string {
  const parts = [
    '01', // Tipo registro
    padLeft(data.cuit.replace(/\D/g, ''), 11), // CUIT sin guiones
    formatDate(data.fecha), // Fecha proceso
    padLeft(data.secuencia.toString(), 4), // Secuencia
    padLeft(data.cantidadRemitos.toString(), 5), // Cantidad remitos
  ];

  return parts.join('');
}

/**
 * Parsea una dirección en sus componentes
 */
function parseAddress(fullAddress: string): {
  calle: string;
  numero: string;
  piso: string;
  depto: string;
} {
  // Intentar extraer número de la dirección
  const match = fullAddress.match(/^(.+?)\s+(\d+)\s*(.*)$/);

  if (match) {
    const [, calle, numero, resto] = match;
    // Intentar extraer piso/depto del resto
    const pisoMatch = resto?.match(/piso\s*(\w+)/i);
    const deptoMatch = resto?.match(/(?:dto|depto|dpto|departamento)\s*(\w+)/i);

    return {
      calle: calle.trim(),
      numero: numero,
      piso: pisoMatch?.[1] || '',
      depto: deptoMatch?.[1] || '',
    };
  }

  return {
    calle: fullAddress,
    numero: 'S/N',
    piso: '',
    depto: '',
  };
}

/**
 * Genera el registro tipo 02 (remito)
 */
function generateRemito(data: CotRequestData, numeroUnico: string): string {
  const remitenteAddress = data.remitente.domicilio;
  const destinatarioAddress = data.destinatario.domicilio;

  // Calcular valor total
  const valorTotal = data.productos.reduce(
    (sum, p) => sum + p.cantidad * p.valor_unitario,
    0
  );

  const parts = [
    '02', // Tipo registro (2)
    'E', // Tipo operación: Entrega (1)
    'V', // Sujeto obligado: Vendedor (1)
    formatDate(new Date()), // Fecha emisión (8)
    padRight(numeroUnico, 20), // Número único (20)
    padLeft('1', 4), // Código sucursal (4)
    padLeft('1', 8), // Número remito (8)

    // Remitente
    padLeft(data.remitente.cuit.replace(/\D/g, ''), 11), // CUIT (11)
    padRight(data.remitente.razon_social, 50), // Razón social (50)
    padRight(remitenteAddress.calle, 40), // Calle (40)
    padRight(remitenteAddress.numero || 'S/N', 6), // Número (6)
    padRight(remitenteAddress.piso || '', 4), // Piso (4)
    padRight(remitenteAddress.depto || '', 4), // Depto (4)
    padRight(remitenteAddress.barrio || '', 30), // Barrio (30)
    padLeft(remitenteAddress.codigo_postal || '', 8), // CP (8)
    padRight(remitenteAddress.localidad, 50), // Localidad (50)
    padLeft(ARBA_PROVINCE_CODES[remitenteAddress.provincia] || '01', 2), // Provincia (2)

    // Destinatario
    padLeft(data.destinatario.cuit.replace(/\D/g, ''), 11), // CUIT (11)
    padRight(data.destinatario.razon_social, 50), // Razón social (50)
    padRight(destinatarioAddress.calle, 40), // Calle (40)
    padRight(destinatarioAddress.numero || 'S/N', 6), // Número (6)
    padRight(destinatarioAddress.piso || '', 4), // Piso (4)
    padRight(destinatarioAddress.depto || '', 4), // Depto (4)
    padRight(destinatarioAddress.barrio || '', 30), // Barrio (30)
    padLeft(destinatarioAddress.codigo_postal || '', 8), // CP (8)
    padRight(destinatarioAddress.localidad, 50), // Localidad (50)
    padLeft(ARBA_PROVINCE_CODES[destinatarioAddress.provincia] || '01', 2), // Provincia (2)

    // Transporte
    padLeft(data.transporte.cuit_conductor.replace(/\D/g, ''), 11), // CUIT transportista (11)
    padRight(data.transporte.patente.replace(/\s/g, '').toUpperCase(), 10), // Patente (10)

    // Totales
    padLeft(data.productos.length.toString(), 4), // Cantidad productos (4)
    formatNumber(valorTotal, 15), // Valor total (15)
  ];

  return parts.join('');
}

/**
 * Genera los registros tipo 03 (productos)
 */
function generateProducts(data: CotRequestData, numeroUnico: string): string[] {
  return data.productos.map((producto) => {
    const parts = [
      '03', // Tipo registro (2)
      padRight(numeroUnico, 20), // Número único (20)
      padRight(producto.codigo, 13), // Código producto NCM (13)
      padRight(producto.descripcion, 50), // Descripción (50)
      formatNumber(producto.cantidad, 11), // Cantidad (11)
      padRight(producto.unidad, 3), // Unidad medida (3)
      formatNumber(producto.valor_unitario, 15), // Valor unitario (15)
    ];

    return parts.join('');
  });
}

/**
 * Genera el archivo TXT completo para COT
 */
export function generateCotFile(
  data: CotRequestData,
  companyConfig: { cuit: string }
): string {
  const fecha = new Date();
  const secuencia = Math.floor(Math.random() * 9999) + 1;
  const numeroUnico = `${fecha.getTime()}`.slice(-15);

  const lines: string[] = [];

  // Cabecera
  lines.push(
    generateHeader({
      cuit: companyConfig.cuit,
      fecha,
      secuencia,
      cantidadRemitos: 1,
    })
  );

  // Remito
  lines.push(generateRemito(data, numeroUnico));

  // Productos
  lines.push(...generateProducts(data, numeroUnico));

  return lines.join('\r\n');
}

/**
 * Genera un nombre de archivo válido para COT
 */
export function generateCotFilename(cuit: string): string {
  const fecha = new Date();
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');
  const secuencia = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');

  const cuitClean = cuit.replace(/\D/g, '');

  return `COT_${cuitClean}_${year}${month}${day}_${secuencia}.txt`;
}
