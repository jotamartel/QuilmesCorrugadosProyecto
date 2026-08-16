/**
 * URL canónica del sitio.
 *
 * Está en un solo lugar a propósito: la usan el sitemap, robots.txt, llms.txt,
 * los metadatos canonical y todos los ejemplos que publica la API. Si viven
 * repetidas, se desincronizan y terminamos publicando dos dominios distintos.
 *
 * Hoy el proyecto responde 200 tanto en quilmes-corrugados.vercel.app como en
 * www.quilmescorrugados.com.ar, con el mismo contenido. Eso parte la autoridad
 * entre dos dominios y hace que un asistente de IA cite la URL de Vercel en
 * lugar de la marca. Cuando se decida unificar, se cambia acá y hay que
 * configurar en Vercel que el dominio no canónico redirija al canónico.
 */
const FALLBACK = 'https://quilmes-corrugados.vercel.app';

/**
 * Sanea el valor de la variable de entorno.
 *
 * El .trim() no es decorativo: la variable en produccion venia con un salto de
 * linea al final, y como solo se limpiaba la barra final, todas las URLs
 * salieron partidas en dos ("https://dominio.com.ar\n/api/v1/quote"). Eso dejo
 * el sitemap sin URLs validas y el robots.txt apuntando a un sitemap
 * inexistente. Un valor mal cargado no puede romper el SEO del sitio entero.
 */
function normalizar(valor: string | undefined): string | null {
  if (!valor) return null;
  const limpio = valor.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/.test(limpio)) {
    console.warn(`[site] NEXT_PUBLIC_SITE_URL invalida (${JSON.stringify(valor)}), se usa ${FALLBACK}`);
    return null;
  }
  return limpio;
}

export const SITE_URL = normalizar(process.env.NEXT_PUBLIC_SITE_URL) || FALLBACK;

/** Arma una URL absoluta sobre el dominio canónico. */
export const siteUrl = (path = '') =>
  `${SITE_URL}${path.startsWith('/') || path === '' ? path : `/${path}`}`;
