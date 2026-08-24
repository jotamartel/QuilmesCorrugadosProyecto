import { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

const BASE_URL = SITE_URL

// Rutas privadas. Se listan una por una en vez de bloquear /api/ entero:
// un `Disallow: /api/` junto a un `Allow: /api/v1/` deja la decisión librada a
// cómo cada crawler resuelve reglas que se pisan, y justamente /api/v1/ es la
// que queremos que lean.
const API_PRIVADA = [
  '/api/config/',
  '/api/admin/',
  '/api/retail-sales',
  '/api/public-quotes',
  '/api/webhooks/',
  '/api/whatsapp/',
  '/api/telegram/',
  '/api/retell/',
  '/api/xubio/',
  '/api/traffic/',
  '/api/contacts/',
  '/api/marketing/',
]

const PRIVADO = [
  ...API_PRIVADA,
  '/dashboard/', '/admin/', '/_next/', '/static/', '/login', '/auth/',
  // La pagina de seguimiento es de quien tiene el link. Ya se declara noindex
  // ella misma; esto es defensa en profundidad.
  '/pedido/',
]

/**
 * Lo que se abre DENTRO de una carpeta bloqueada.
 *
 * /_next/ esta cerrado entero, y eso se llevaba puestos el CSS, el JavaScript y
 * las imagenes optimizadas. Googlebot renderiza la pagina como un navegador
 * antes de decidir que indexa: sin la hoja de estilos y sin el JS ve otra
 * pagina que la que ve una persona. En Search Console aparecia como seis URLs
 * "bloqueadas por robots.txt" que parecian ruido —chunks y una tipografia— y
 * eran los archivos con los que se dibuja el sitio.
 *
 * Google resuelve reglas que se pisan por la mas especifica, asi que este Allow
 * le gana al Disallow de arriba sin tener que abrir /_next/ entero: lo que no
 * sea /static/ ni /image sigue cerrado.
 */
const EXCEPCIONES = ['/_next/static/', '/_next/image']

// Lo que sí queremos que un asistente de IA lea y use.
const PUBLICO = [
  '/',
  '/productos',
  '/nosotros',
  '/contacto',
  '/faq',
  '/precios',
  '/cajas',
  '/cajas-ecommerce',
  '/cajas-alimentos',
  '/cajas-mudanza',
  '/mayorista',
  '/llms.txt',
  '/api/v1/quote',
  '/api/v1/docs',
  '/api/v1/openapi.json',
  // Genera el PDF de la caja desplegada para que el cliente ubique su diseño.
  // Es público a propósito: que un asistente lo pueda ofrecer junto al precio.
  '/api/box-template',
  '/api/mcp',
  '/cotizar/',
]

/**
 * Agentes de IA a los que les damos acceso explícito.
 *
 * OAI-SearchBot es el importante y faltaba: GPTBot sólo alimenta el
 * entrenamiento de OpenAI, mientras que OAI-SearchBot es el que indexa para
 * las respuestas de ChatGPT con búsqueda. Sin él, ChatGPT puede recomendar la
 * empresa pero no llega al cotizador.
 *
 * Claude-Web y Anthropic-AI quedaron obsoletos; el crawler actual es ClaudeBot.
 */
const AGENTES_IA = [
  // OpenAI
  'GPTBot',            // entrenamiento
  'OAI-SearchBot',     // indexación para ChatGPT Search
  'ChatGPT-User',      // navegación en vivo cuando el usuario pregunta
  // Anthropic
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'Claude-Web',        // legacy, se deja por compatibilidad
  'anthropic-ai',      // legacy
  // Google (Gemini y AI Overviews)
  'Google-Extended',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Otros asistentes
  'Applebot-Extended',
  'meta-externalagent',
  'Amazonbot',
  'DuckAssistBot',
  'YouBot',
  'cohere-ai',
  'Bytespider',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [...PUBLICO, ...EXCEPCIONES],
        disallow: PRIVADO,
      },
      {
        userAgent: AGENTES_IA,
        allow: [...PUBLICO, ...EXCEPCIONES],
        disallow: PRIVADO,
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
