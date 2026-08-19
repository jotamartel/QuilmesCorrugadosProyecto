import Anthropic from '@anthropic-ai/sdk';
import { HERRAMIENTAS } from './herramientas';
import { HORARIO } from '@/lib/retail/config';
import { SITE_URL } from '@/lib/site';

/**
 * El agente de ventas del sitio.
 *
 * QUE CAMBIA RESPECTO DE LO ANTERIOR
 *
 * Antes había una máquina de estados de diecisiete ramas y una torre de
 * expresiones regulares tratando de adivinar qué había escrito la persona, con
 * la IA de suplente para cuando los regex fallaban. Tres parsers distintos
 * truncaron cantidades de tres formas distintas: "2600 unidades" entró como
 * 260, "2600 cajas de 300x380x420" entró como 20, y "500 cajas de 400x300x300"
 * entró como cero. Cada uno se arregló y apareció el siguiente.
 *
 * Acá el modelo interpreta y las herramientas hacen. No hay regex que engañar.
 *
 * EL PROMPT ES CORTO A PROPOSITO
 *
 * No lleva precios, ni mínimos, ni plazos, ni el horario de atención como
 * datos. Todo eso se pregunta con `condiciones_y_precios`. Un dato metido en el
 * prompt es un dato más que se desactualiza en un lugar y no en los otros, que
 * es exactamente el problema que veníamos arrastrando.
 */

/**
 * El .trim() no es decorativo. La variable cargada en Vercel terminaba en un
 * salto de línea —se ve en los códigos de los últimos caracteres: 65 65 92 110—
 * y una key con un carácter de más da 401 sin decir por qué. Es el mismo
 * accidente que tuvo NEXT_PUBLIC_SITE_URL y que rompió el sitemap: pegar el
 * valor en el panel arrastra el salto y no se ve en ningún lado.
 */
const CLAVE = process.env.ANTHROPIC_API_KEY?.trim();

const anthropic = CLAVE ? new Anthropic({ apiKey: CLAVE }) : null;

export function agenteDisponible(): boolean {
  return !!anthropic;
}

const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const INSTRUCCIONES = `Sos quien atiende las consultas de Quilmes Corrugados, una fábrica de cajas de cartón corrugado en Quilmes, provincia de Buenos Aires. Hablás con alguien que entró al sitio.

CÓMO HABLÁS
Español rioplatense, de vos. Directo y cordial, como quien atiende el mostrador de la fábrica: sabe del tema y no hace perder el tiempo. Respuestas cortas, de dos o tres frases; esto es un chat, no un mail. Sin emoji. Sin markdown ni asteriscos: el texto se muestra plano.

LO QUE NO SABÉS DE MEMORIA
No sabés precios, ni mínimos, ni plazos, ni condiciones de envío. Están en las herramientas y cambian. Preguntá antes de afirmar.

Nunca estimes un precio, ni siquiera aproximado, ni siquiera si la persona insiste o dice que es solo para tener una idea. El precio sale por metro cuadrado de cartón desplegado y por escalón de volumen: cualquier número calculado a ojo va a estar mal. Si te falta un dato para cotizar, pedilo.

CÓMO COTIZÁS
Para cotizar necesitás las tres medidas y la cantidad. Si la persona dio todo, cotizá antes de responder en vez de preguntar de nuevo.

Si dio las medidas en centímetros, convertilas a milímetros multiplicando por diez, y aclarale que las tomaste así.

Si mencionó impresión pero no dijo cuántos colores, preguntáselo antes de cotizar: el recargo depende de eso. Si no habló de impresión, cotizá lisa.

Al dar un precio decí siempre las cuatro cosas que vienen en la respuesta: que es en pesos, que el subtotal va sin IVA y el total lo incluye, el plazo de entrega y hasta cuándo vale. Y pasale el link de la cotización, que puede compartir con su equipo.

CUANDO TE CORRIGEN
Si la persona se corrige a mitad de camino —"2600 no 260", "perdón, eran 40 de alto"— tomá la corrección y seguí. No vuelvas a empezar ni le pidas que repita lo que ya dijo.

Si algo te queda ambiguo, preguntá. Preguntar cuesta un mensaje; adivinar mal cuesta la venta.

CUANDO NO PODÉS
Si el pedido no se puede fabricar, la herramienta te dice el motivo. Decí el motivo concreto y ofrecé una salida, en vez de decir que no se puede.

Si la consulta se va de lo comercial, si hay un reclamo, o si la persona pide hablar con alguien, derivala. No la dejes esperando.

QUÉ HACÉS CON QUIEN MUESTRA INTERÉS
Si deja nombre, empresa, mail o teléfono, guardalo. Si pide que la contacten, guardalo. Es lo que hace que la consulta no se pierda cuando cierra la pestaña. No le pidas los datos antes de darle el precio: primero resolvés, después preguntás.

Podés mandarla a ${SITE_URL}/cajas para comprar de stock online, o a ${SITE_URL}/precios para ver la escalera completa.

El horario de atención sale de la herramienta de condiciones. Fuera de ese horario podés seguir cotizando igual: para eso está el chat.`;

export interface TurnoConversacion {
  role: 'user' | 'assistant';
  content: string;
}

export interface RespuestaAgente {
  texto: string;
  /** Cuántas herramientas se usaron. Sirve para medir si el agente cotiza de verdad. */
  herramientasUsadas: string[];
}

/**
 * Responde un turno de conversación.
 *
 * `max_iterations` acota el ida y vuelta de herramientas: sin tope, un modelo
 * confundido puede quedarse llamando funciones mientras la persona espera. Seis
 * alcanza de sobra para cotizar, consultar condiciones y guardar el lead.
 */
export async function responder(
  mensaje: string,
  historial: TurnoConversacion[] = [],
  contexto?: { paginaActual?: string },
): Promise<RespuestaAgente> {
  if (!anthropic) throw new Error('ANTHROPIC_API_KEY no configurada');

  const dondeEsta = contexto?.paginaActual
    ? `\n\nLa persona está en la página ${contexto.paginaActual} del sitio.`
    : '';

  const runner = anthropic.beta.messages.toolRunner({
    model: MODELO,
    max_tokens: 4096,
    // El bloque de instrucciones no cambia entre consultas, así que se cachea y
    // deja de pagarse entero en cada turno.
    system: [
      {
        type: 'text',
        text: INSTRUCCIONES,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: HERRAMIENTAS,
    max_iterations: 6,
    messages: [
      ...historial.slice(-10).map((t) => ({ role: t.role, content: t.content })),
      { role: 'user' as const, content: mensaje + dondeEsta },
    ],
  });

  const herramientasUsadas: string[] = [];
  for await (const m of runner) {
    for (const bloque of m.content) {
      if (bloque.type === 'tool_use') herramientasUsadas.push(bloque.name);
    }
  }

  const final = await runner.done();
  const texto = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return { texto, herramientasUsadas };
}
