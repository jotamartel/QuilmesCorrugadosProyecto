/**
 * Parser de emails entrantes para extraer datos de cotizacion
 * Quilmes Corrugados
 */

export interface ParsedEmailData {
  dimensions?: { length: number; width: number; height: number };
  quantity?: number;
  hasPrinting?: boolean;
  clientName?: string;
  clientCompany?: string;
  clientPhone?: string;
}

/**
 * Parsea el contenido de un email para extraer datos de cotizacion
 */
export function parseEmailForQuote(subject: string, body: string): ParsedEmailData {
  const text = `${subject} ${body}`.toLowerCase();
  const result: ParsedEmailData = {};

  // Buscar dimensiones
  const dimPatterns = [
    /(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)/i,
    /medidas?\s*:?\s*(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)/i,
    /largo\s*:?\s*(\d+).*ancho\s*:?\s*(\d+).*alto\s*:?\s*(\d+)/i,
    /l\s*:?\s*(\d+).*a\s*:?\s*(\d+).*h\s*:?\s*(\d+)/i,
    /(\d+)\s*mm?\s*[x×]\s*(\d+)\s*mm?\s*[x×]\s*(\d+)\s*mm?/i,
    /(\d+)\s*cm\s*[x×]\s*(\d+)\s*cm\s*[x×]\s*(\d+)\s*cm/i,
  ];

  for (const pattern of dimPatterns) {
    const match = text.match(pattern);
    if (match) {
      let [, l, w, h] = match.map(Number);
      // Convertir cm a mm si necesario
      if (l < 100 && w < 100 && h < 100) {
        l *= 10;
        w *= 10;
        h *= 10;
      }
      result.dimensions = { length: l, width: w, height: h };
      break;
    }
  }

  // Buscar cantidad
  const qtyPatterns = [
    /(\d{3,})\s*(unidades|cajas|piezas)/i,
    /cantidad\s*:?\s*(\d+)/i,
    /necesito\s*(\d+)/i,
    /(\d+)\s*cajas/i,
    /pedido\s*(?:de\s*)?(\d+)/i,
    /(\d{3,})\s*u\.?/i,
  ];

  for (const pattern of qtyPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.quantity = Number(match[1]);
      break;
    }
  }

  // Buscar impresion
  result.hasPrinting =
    text.includes('impresion') ||
    text.includes('impreso') ||
    text.includes('logo') ||
    text.includes('sello') ||
    text.includes('estampado') ||
    text.includes('personalizada');

  // Buscar nombre (al final del email o en frases comunes)
  const namePatterns = [
    /(?:soy|mi nombre es|me llamo)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ\s]+?)(?:\.|,|$)/i,
    /(?:saludos|atte\.?|atentamente|cordialmente)[,\s]+([A-Za-zÁÉÍÓÚáéíóúñÑ\s]+?)(?:\n|$)/i,
    /^([A-Za-zÁÉÍÓÚáéíóúñÑ]+\s+[A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s*$/m,
  ];

  for (const pattern of namePatterns) {
    const match = body.match(pattern);
    if (match) {
      const name = match[1].trim();
      // Validar que no sea una palabra comun
      if (name.length > 3 && !['hola', 'buen', 'dias', 'tardes'].includes(name.toLowerCase())) {
        result.clientName = name;
        break;
      }
    }
  }

  // Buscar empresa
  const companyPatterns = [
    /(?:empresa|compañía|de parte de|trabajo en)\s*:?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ0-9\s\.\-]+?)(?:\.|,|$)/i,
    /(?:para|de)\s+(?:la empresa\s+)?([A-Za-zÁÉÍÓÚáéíóúñÑ0-9\s]+?(?:\s+(?:S\.?A\.?|S\.?R\.?L\.?|S\.?A\.?S\.?)))/i,
  ];

  for (const pattern of companyPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.clientCompany = match[1].trim();
      break;
    }
  }

  // Buscar telefono
  const phonePatterns = [
    /(?:tel[éeé]?fono|celular|whatsapp|cel|tel|movil)\s*:?\s*([\d\s\-\+\(\)]+)/i,
    /(\+?54\s*9?\s*\d{2,4}\s*\d{4}\s*\d{4})/,
    /(\d{2,4}[\s\-]?\d{4}[\s\-]?\d{4})/,
  ];

  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      const phone = match[1].replace(/[\s\-\(\)]/g, '');
      // Validar que tenga al menos 10 digitos
      if (phone.replace(/\D/g, '').length >= 10) {
        result.clientPhone = phone;
        break;
      }
    }
  }

  return result;
}

interface QuoteData {
  total: number;
  m2_total: number;
  unit_price: number;
  delivery_days: number;
}

/**
 * Genera respuesta automatica de email
 */
export function generateEmailResponse(
  parsed: ParsedEmailData,
  quote?: QuoteData
): { subject: string; body: string } {
  const greeting = parsed.clientName
    ? `Hola ${parsed.clientName}`
    : 'Hola';

  // Si pudimos cotizar
  if (quote && parsed.dimensions && parsed.quantity) {
    const { dimensions: d, quantity, hasPrinting } = parsed;

    return {
      subject: `Re: Cotizacion cajas ${d.length}x${d.width}x${d.height}mm - Quilmes Corrugados`,
      body: `${greeting},

Gracias por tu consulta!

Aca esta tu cotizacion:

CAJA: ${d.length} x ${d.width} x ${d.height} mm ${hasPrinting ? '(con impresion)' : '(lisa)'}
CANTIDAD: ${quantity.toLocaleString('es-AR')} unidades
TOTAL m2: ${quote.m2_total.toLocaleString('es-AR', { maximumFractionDigits: 1 })}

TOTAL: $${quote.total.toLocaleString('es-AR')}
Precio unitario: $${quote.unit_price.toLocaleString('es-AR')}

Tiempo de entrega: ${quote.delivery_days} dias habiles
Validez de la cotizacion: 7 dias

${quote.m2_total < 3000 ? 'Nota: Este pedido esta por debajo del minimo recomendado de 3.000 m2.\n' : ''}
Para confirmar tu pedido o si tenes alguna consulta, responde este email o contactanos:
- WhatsApp: +54 9 11 6924-9801
- Telefono: Lunes a Viernes 7:00 - 16:00

Saludos!
Equipo Quilmes Corrugados

---
Quilmes Corrugados
Fabrica de cajas de carton corrugado
https://quilmescorrugados.com.ar`,
    };
  }

  // Si no pudimos parsear las medidas
  return {
    subject: 'Re: Consulta de cotizacion - Quilmes Corrugados',
    body: `${greeting},

Gracias por tu consulta!

Para poder cotizarte necesitamos los siguientes datos:

- Medidas de la caja (Largo x Ancho x Alto en mm o cm)
- Cantidad de unidades
- Lleva impresion? (hasta 3 colores)

Ejemplo: "Necesito 500 cajas de 400x300x300mm sin impresion"

Tambien podes usar nuestro cotizador online:
https://quilmescorrugados.com.ar

O contactarnos directamente:
- WhatsApp: +54 9 11 6924-9801
- Horario: Lunes a Viernes 7:00 - 16:00

Saludos!
Equipo Quilmes Corrugados

---
Quilmes Corrugados
Fabrica de cajas de carton corrugado
https://quilmescorrugados.com.ar`,
  };
}

/**
 * Extrae el email del campo From (puede venir como "Nombre <email@domain.com>")
 */
export function extractEmailAddress(from: string): string {
  const match = from.match(/<(.+)>/);
  return match ? match[1] : from;
}

/**
 * Extrae el nombre del campo From si esta disponible
 */
export function extractNameFromFrom(from: string): string | null {
  const match = from.match(/^([^<]+)</);
  if (match) {
    const name = match[1].trim().replace(/"/g, '');
    return name.length > 0 ? name : null;
  }
  return null;
}
