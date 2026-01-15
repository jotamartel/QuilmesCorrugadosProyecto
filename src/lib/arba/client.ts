// Cliente HTTP para ARBA COT
// El servicio COT de ARBA usa un web service SOAP

import { getArbaConfig, getCompanyConfig } from '@/lib/config/system';
import type { CotResponse } from './types';

const ARBA_COT_WSDL = 'https://cot.arba.gov.ar/TransporteBienes/SeguridadCliente/wsCOT.asmx?WSDL';
const ARBA_COT_ENDPOINT = 'https://cot.arba.gov.ar/TransporteBienes/SeguridadCliente/wsCOT.asmx';

/**
 * Crea el envelope SOAP para la solicitud de COT
 */
function createSoapEnvelope(
  user: string,
  password: string,
  cuit: string,
  archivo: string
): string {
  // Codificar archivo en Base64
  const archivoBase64 = Buffer.from(archivo).toString('base64');

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <InformarCOT xmlns="http://cot.arba.gov.ar/">
      <usuario>${user}</usuario>
      <clave>${password}</clave>
      <cuitEmpresa>${cuit}</cuitEmpresa>
      <archivo>${archivoBase64}</archivo>
    </InformarCOT>
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Parsea la respuesta SOAP de ARBA
 */
function parseSoapResponse(xml: string): CotResponse {
  // Buscar el número de COT en la respuesta
  const cotMatch = xml.match(/<NumeroComprobante>(\d+)<\/NumeroComprobante>/);
  const errorMatch = xml.match(/<CodigoError>(\w+)<\/CodigoError>/);
  const mensajeMatch = xml.match(/<MensajeError>([^<]+)<\/MensajeError>/);

  if (cotMatch) {
    return {
      success: true,
      cot_number: cotMatch[1],
    };
  }

  if (errorMatch) {
    return {
      success: false,
      error_code: errorMatch[1],
      error_message: mensajeMatch?.[1] || 'Error desconocido',
    };
  }

  // Buscar errores de validación
  const validationErrors: string[] = [];
  const errorRegex = /<Error>([^<]+)<\/Error>/g;
  let match;
  while ((match = errorRegex.exec(xml)) !== null) {
    validationErrors.push(match[1]);
  }

  if (validationErrors.length > 0) {
    return {
      success: false,
      error_message: 'Errores de validación',
      validation_errors: validationErrors,
    };
  }

  return {
    success: false,
    error_message: 'Respuesta inesperada de ARBA',
  };
}

/**
 * Envía un archivo COT a ARBA
 */
export async function sendCotToArba(archivo: string): Promise<CotResponse> {
  const arbaConfig = await getArbaConfig();
  const companyConfig = await getCompanyConfig();

  if (!arbaConfig.arba_cit_user || !arbaConfig.arba_cit_password) {
    throw new Error('Credenciales de ARBA no configuradas');
  }

  if (!companyConfig.company_cuit) {
    throw new Error('CUIT de la empresa no configurado');
  }

  const soapEnvelope = createSoapEnvelope(
    arbaConfig.arba_cit_user,
    arbaConfig.arba_cit_password,
    companyConfig.company_cuit.replace(/\D/g, ''),
    archivo
  );

  try {
    const response = await fetch(ARBA_COT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"http://cot.arba.gov.ar/InformarCOT"',
      },
      body: soapEnvelope,
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const responseText = await response.text();
    return parseSoapResponse(responseText);
  } catch (error) {
    console.error('Error enviando COT a ARBA:', error);
    return {
      success: false,
      error_message: error instanceof Error ? error.message : 'Error de conexión con ARBA',
    };
  }
}

/**
 * Prueba la conexión con ARBA
 * Nota: ARBA no tiene un endpoint de prueba, así que solo verificamos
 * que las credenciales estén configuradas
 */
export async function testArbaConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const arbaConfig = await getArbaConfig();
    const companyConfig = await getCompanyConfig();

    if (!arbaConfig.arba_cit_user || !arbaConfig.arba_cit_password) {
      return {
        success: false,
        message: 'Credenciales de ARBA no configuradas',
      };
    }

    if (!companyConfig.company_cuit) {
      return {
        success: false,
        message: 'CUIT de la empresa no configurado',
      };
    }

    // Verificar que podemos acceder al WSDL
    const response = await fetch(ARBA_COT_WSDL, {
      method: 'GET',
    });

    if (!response.ok) {
      return {
        success: false,
        message: 'No se puede conectar con el servicio de ARBA',
      };
    }

    return {
      success: true,
      message: 'Configuración verificada. Las credenciales serán validadas al generar un COT.',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}
