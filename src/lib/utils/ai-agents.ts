/**
 * Identificación de agentes de IA por user-agent.
 *
 * Sirve para dos cosas: medir si el trabajo de GEO funciona (ver /api-stats) y
 * saber qué asistente está cotizando.
 *
 * Ojo con un detalle que ya nos mordió: el user-agent de OpenAI para búsqueda
 * es "OAI-SearchBot", que NO contiene ni "gptbot" ni "chatgpt". Buscar sólo
 * esas dos cadenas deja afuera justamente al crawler que alimenta las
 * respuestas de ChatGPT, que es el que nos interesa medir.
 *
 * Mantener alineado con la lista de AGENTES_IA de src/app/robots.ts.
 */

/** Patrones por proveedor, en minúsculas. El orden importa: gana el primero. */
const AGENTES: Array<{ id: string; patrones: string[] }> = [
  // OpenAI. oai-searchbot indexa para ChatGPT Search; chatgpt-user navega en
  // vivo cuando alguien pregunta; gptbot es entrenamiento.
  { id: 'gpt', patrones: ['oai-searchbot', 'chatgpt-user', 'gptbot', 'chatgpt', 'openai'] },
  // Anthropic. claudebot es el actual; claude-web y anthropic-ai son legacy.
  { id: 'claude', patrones: ['claudebot', 'claude-searchbot', 'claude-user', 'claude-web', 'claude', 'anthropic'] },
  { id: 'perplexity', patrones: ['perplexitybot', 'perplexity-user', 'perplexity'] },
  { id: 'gemini', patrones: ['google-extended', 'gemini', 'bard'] },
  { id: 'apple', patrones: ['applebot-extended', 'applebot'] },
  { id: 'meta', patrones: ['meta-externalagent', 'facebookbot', 'meta-externalfetcher'] },
  { id: 'amazon', patrones: ['amazonbot'] },
  { id: 'duckduckgo', patrones: ['duckassistbot'] },
  { id: 'you', patrones: ['youbot'] },
  { id: 'cohere', patrones: ['cohere'] },
  { id: 'bytedance', patrones: ['bytespider'] },
  { id: 'bing', patrones: ['bingbot'] },
];

/** Devuelve el identificador del agente de IA, o null si no es uno. */
export function detectLLM(userAgent: string): string | null {
  const ua = (userAgent || '').toLowerCase();
  for (const { id, patrones } of AGENTES) {
    if (patrones.some((p) => ua.includes(p))) return id;
  }
  return null;
}

/** Clasifica el origen de una request para las estadísticas. */
export function getSourceType(userAgent: string, apiKey: string | null): string {
  if (detectLLM(userAgent)) return 'llm';
  if (apiKey) return 'api_client';
  const ua = userAgent || '';
  if (ua.includes('Mozilla') || ua.includes('Chrome') || ua.includes('Safari')) {
    return 'browser';
  }
  return 'unknown';
}
