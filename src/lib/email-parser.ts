/**
 * Parser de emails entrantes para extraer datos de cotizacion
 * Quilmes Corrugados
 */

import { SITE_URL } from '@/lib/site';
import { HORARIO } from '@/lib/retail/config';
import { CONTACTO } from '@/lib/contacto';
import {
  precioUnitarioARS,
  mensajeDeImpedimento,
  type Impedimento,
} from '@/lib/cotizacion/motor';

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
  /**
   * Subtotal SIN IVA. Antes se llamaba `total` y se etiquetaba "TOTAL" en el
   * mail, y esa misma confusion —decirle TOTAL a un numero sin IVA— ya viajo
   * hasta una orden de compra en este proyecto. El nombre ahora dice lo que
   * es, y el mail muestra las dos cifras con etiquetas claras.
   */
  subtotal: number;
  tax_amount: number;
  total_with_tax: number;
  m2_total: number;
  unit_price: number;
  delivery_days: number;
}

/**
 * Genera respuesta automatica de email
 */
export function generateEmailResponse(
  parsed: ParsedEmailData,
  quote?: QuoteData,
  impedimento?: Impedimento,
): { subject: string; body: string } {
  const greeting = parsed.clientName
    ? `Hola ${parsed.clientName}`
    : 'Hola';

  // Si pudimos cotizar
  if (quote && parsed.dimensions && parsed.quantity) {
    const { dimensions: d, quantity, hasPrinting } = parsed;

    // Antes esto decia "TOTAL: $X" con X = subtotal sin IVA. Ese error —
    // etiquetar como TOTAL a un numero sin IVA— es exactamente el que ya viajo
    // hasta una orden de compra en este proyecto. Se muestran las dos cifras
    // con etiquetas claras y el IVA en el medio.
    return {
      subject: `Re: Cotizacion cajas ${d.length}x${d.width}x${d.height}mm - Quilmes Corrugados`,
      body: `${greeting},

Gracias por tu consulta!

Aca esta tu cotizacion:

CAJA: ${d.length} x ${d.width} x ${d.height} mm ${hasPrinting ? '(con impresion)' : '(lisa)'}
CANTIDAD: ${quantity.toLocaleString('es-AR')} unidades
TOTAL m2: ${quote.m2_total.toLocaleString('es-AR', { maximumFractionDigits: 1 })}

Subtotal (sin IVA): $${quote.subtotal.toLocaleString('es-AR')}
IVA 21%: $${quote.tax_amount.toLocaleString('es-AR')}
TOTAL (con IVA): $${quote.total_with_tax.toLocaleString('es-AR')}
Precio unitario: ${precioUnitarioARS(quote.unit_price)}

Tiempo de entrega: ${quote.delivery_days} dias habiles
Validez de la cotizacion: 7 dias

Para confirmar tu pedido o si tenes alguna consulta, responde este email o contactanos:
- WhatsApp: ${CONTACTO.telefonoVisible}
- Horario: ${HORARIO.corto}

Saludos!
Equipo Quilmes Corrugados

---
Quilmes Corrugados
Fabrica de cajas de carton corrugado
${SITE_URL}`,
    };
  }

  // Se entendio el pedido pero el motor no lo pudo cotizar —bajo minimo,
  // medida propia sin volumen o directamente no fabricable—. Antes esta rama
  // no existia y todo caia en la de abajo pidiendole al cliente que reenviara
  // las medidas y la cantidad que YA habia mandado. Ahora se le lee el "por
  // que" que arma el motor y, cuando hay, las alternativas de catalogo ya
  // cotizadas al minimo.
  if (impedimento && parsed.dimensions && parsed.quantity) {
    const { dimensions: d, quantity } = parsed;

    const bloqueAlternativas = impedimento.alternativas.length
      ? '\n\nMedidas de catalogo mas parecidas, ya cotizadas al minimo:\n' +
        impedimento.alternativas
          .map((a) => {
            const etiquetaEntra = a.entra ? '' : ' (mas chica que la que pediste)';
            return (
              `- ${a.length_mm} x ${a.width_mm} x ${a.height_mm} mm${etiquetaEntra}: ` +
              `${a.cantidad.toLocaleString('es-AR')} cajas, ` +
              `${precioUnitarioARS(a.precio_por_caja)} por caja, ` +
              `subtotal $${a.subtotal.toLocaleString('es-AR')} (sin IVA)`
            );
          })
          .join('\n')
      : '';

    return {
      subject: `Re: Cotizacion cajas ${d.length}x${d.width}x${d.height}mm - Quilmes Corrugados`,
      body: `${greeting},

Gracias por tu consulta!

${mensajeDeImpedimento(impedimento)}

Pedido recibido: ${quantity.toLocaleString('es-AR')} cajas de ${d.length} x ${d.width} x ${d.height} mm.${bloqueAlternativas}

Cualquier duda, respondenos este mail o escribinos:
- WhatsApp: ${CONTACTO.telefonoVisible}
- Horario: ${HORARIO.corto}

Saludos!
Equipo Quilmes Corrugados

---
Quilmes Corrugados
Fabrica de cajas de carton corrugado
${SITE_URL}`,
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
${SITE_URL}

O contactarnos directamente:
- WhatsApp: ${CONTACTO.telefonoVisible}
- Horario: ${HORARIO.corto}

Saludos!
Equipo Quilmes Corrugados

---
Quilmes Corrugados
Fabrica de cajas de carton corrugado
${SITE_URL}`,
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
