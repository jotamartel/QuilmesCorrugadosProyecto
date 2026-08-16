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
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://quilmes-corrugados.vercel.app';

/** Arma una URL absoluta sobre el dominio canónico. */
export const siteUrl = (path = '') =>
  `${SITE_URL}${path.startsWith('/') || path === '' ? path : `/${path}`}`;
