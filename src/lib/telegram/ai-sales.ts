/**
 * AI-powered sales message generator for Telegram bot
 * Uses Claude (Anthropic) for high-quality personalized sales messages
 * Falls back to Groq if Anthropic key is not configured
 */

import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

interface QuoteData {
  id: string;
  quote_number: string;
  requester_name: string;
  requester_company: string | null;
  requester_email: string;
  requester_phone: string;
  requester_tax_condition: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  subtotal: number;
  total_sqm: number;
  shipping_method: string | null;
  shipping_cost: number;
  message: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  created_at: string;
}

/**
 * Fetch quote data from Supabase
 */
export async function getQuoteData(quoteId: string): Promise<QuoteData | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('public_quotes')
    .select('*')
    .eq('id', quoteId)
    .single();

  if (error || !data) {
    console.error('[AI Sales] Error fetching quote:', error);
    return null;
  }

  return data as QuoteData;
}

const SALES_SYSTEM_PROMPT = `Eres un vendedor experto de Quilmes Corrugados, una fabrica de cajas de carton corrugado en Quilmes, Buenos Aires.

Tu objetivo es generar un mensaje de WhatsApp para contactar a un cliente potencial que acaba de solicitar cajas por la web.

DATOS DE LA EMPRESA:
- Nombre: Quilmes Corrugados
- Ubicacion: Lugones 219, Quilmes, Buenos Aires
- Productos: Cajas de carton corrugado a medida y estandar
- Envios: Retiro en fabrica (gratis), CABA/AMBA, y resto del pais
- Diferencial: Fabrica directa, precios competitivos, entregas rapidas

REGLAS PARA EL MENSAJE:
1. Maximo 3-4 oraciones, breve y directo
2. Tono: profesional pero cercano, tipico vendedor argentino
3. Mencionar el nombre del cliente
4. Hacer referencia a lo que pidio (tipo de caja, cantidad)
5. Incluir un llamado a la accion claro (coordinar, confirmar, etc.)
6. NO usar emojis excesivos (maximo 1-2)
7. NO inventar precios ni plazos que no esten en los datos
8. Si es empresa, tratamiento mas formal
9. Escribir en espanol argentino natural (vos, tenes, etc.)
10. NO incluir saludos formales tipo "Estimado/a"

IMPORTANTE: Solo genera el texto del mensaje, sin comillas ni formato extra.`;

function buildUserPrompt(quote: QuoteData, instruction?: string): string {
  const isEmpresa = quote.requester_company || quote.requester_tax_condition !== 'consumidor_final';

  return `DATOS DEL CLIENTE:
- Nombre: ${quote.requester_name}
- Tipo: ${isEmpresa ? 'Empresa' : 'Particular'}${quote.requester_company ? ` (${quote.requester_company})` : ''}
- Pedido: ${quote.message || `Caja ${quote.length_mm}x${quote.width_mm}x${quote.height_mm}mm, ${quote.quantity} unidades`}
- Total: $${Math.round(quote.subtotal).toLocaleString('es-AR')}
- Envio: ${quote.shipping_method || 'no especificado'}
- Ubicacion: ${quote.city || ''} ${quote.province || ''}

${instruction ? `INSTRUCCION ADICIONAL: ${instruction}` : 'Genera un primer mensaje de contacto para iniciar la venta.'}`;
}

/**
 * Generate a sales message using Claude
 */
export async function generateSalesMessage(
  quote: QuoteData,
  instruction?: string
): Promise<string> {
  if (!anthropic) {
    return fallbackMessage(quote);
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: SALES_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildUserPrompt(quote, instruction) },
      ],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    if (!text) return fallbackMessage(quote);

    // Clean up: remove surrounding quotes if present
    return text.replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error('[AI Sales] Error generating message:', error);
    return fallbackMessage(quote);
  }
}

/**
 * Refine an existing message based on user instruction
 */
export async function refineSalesMessage(
  currentMessage: string,
  quote: QuoteData,
  instruction: string
): Promise<string> {
  if (!anthropic) {
    return currentMessage;
  }

  const systemPrompt = `Eres un asistente de ventas de Quilmes Corrugados (fabrica de cajas de carton).
El usuario quiere ajustar un mensaje de WhatsApp para un cliente.

REGLAS:
1. Modifica el mensaje segun la instruccion del usuario
2. Mantene el tono profesional pero cercano
3. Maximo 3-4 oraciones
4. Espanol argentino (vos, tenes, etc.)
5. Solo devolver el mensaje modificado, sin explicaciones
6. NO inventar datos que no esten disponibles`;

  const userPrompt = `MENSAJE ACTUAL:
${currentMessage}

DATOS DEL CLIENTE:
- Nombre: ${quote.requester_name}
- Total: $${Math.round(quote.subtotal).toLocaleString('es-AR')}
- Pedido: ${quote.message || `Caja ${quote.length_mm}x${quote.width_mm}x${quote.height_mm}mm, ${quote.quantity} uds`}

INSTRUCCION: ${instruction}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    return text?.replace(/^["']|["']$/g, '') || currentMessage;
  } catch (error) {
    console.error('[AI Sales] Error refining message:', error);
    return currentMessage;
  }
}

function fallbackMessage(quote: QuoteData): string {
  const firstName = quote.requester_name.split(' ')[0];
  return `Hola ${firstName}! Soy de Quilmes Corrugados. Recibimos tu pedido de cajas y queria coordinar los detalles con vos. ¿Cuando te queda comodo para que charlemos?`;
}
