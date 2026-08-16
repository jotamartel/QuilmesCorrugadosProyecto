/**
 * URL canónica del sitio.
 *
 * Está en un solo lugar a propósito: la usan el sitemap, robots.txt, llms.txt,
 * los metadatos canonical, next.config.ts y todos los ejemplos que publica la
 * API. Si viven repetidas se desincronizan, y terminamos publicando un dominio
 * distinto del que efectivamente sirve el sitio.
 *
 * POR QUE www Y NO EL APEX
 *
 * El apex es el que se ve mejor escrito, pero técnicamente es el peor de los
 * dos, y no por una cuestión de gusto: el spec de DNS prohíbe usar CNAME en un
 * dominio raíz. Un apex sólo puede apuntarse con un registro A, o sea con una
 * IP escrita a mano. Cuando el proveedor mueve su infraestructura, esa IP
 * queda vieja y hay que ir a cambiarla; hasta que alguien se acuerde, el
 * dominio sigue resolviendo a donde ya no conviene.
 *
 * Eso es exactamente lo que estaba pasando acá: el apex apuntaba a la IP vieja
 * de Vercel (76.76.21.21) y el panel marcaba "DNS Change Recommended", mientras
 * que www —que es un CNAME— se había mantenido al día solo, sin que nadie
 * tocara nada. Es también lo que recomienda Vercel, porque un CNAME le permite
 * mover el tráfico ante un ataque o para optimizar latencia sin depender de
 * que el dueño del dominio actualice un registro.
 *
 * El apex sigue funcionando: redirige a www con 308 permanente.
 *
 * Este valor se puede sobreescribir con NEXT_PUBLIC_SITE_URL, pero conviene NO
 * definirla: tenerla en el código la deja versionada y revisable, y evita el
 * problema de que un valor mal pegado en un panel rompa el SEO del sitio
 * entero, que ya pasó una vez (ver normalizar()).
 */
const FALLBACK = 'https://www.quilmescorrugados.com.ar';

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

const DESDE_ENTORNO = normalizar(process.env.NEXT_PUBLIC_SITE_URL);

// Avisar cuando la variable esta pisando al codigo con otro valor.
//
// Sin esto, la divergencia es muda: se cambia el dominio en el repo, se
// deploya, y el sitio sigue publicando el anterior porque la variable sigue
// cargada en el panel. Pasó exactamente eso, y para descubrirlo hubo que
// comparar el ID del deployment que servia produccion contra el canonical.
// Un warning en el build lo habria dicho en dos segundos.
if (DESDE_ENTORNO && DESDE_ENTORNO !== FALLBACK) {
  console.warn(
    `[site] NEXT_PUBLIC_SITE_URL (${DESDE_ENTORNO}) esta pisando el dominio ` +
      `del codigo (${FALLBACK}). Si no es intencional, borra la variable en Vercel ` +
      `y volve a deployar: el canonical, el sitemap y el llms.txt salen de aca.`,
  );
}

export const SITE_URL = DESDE_ENTORNO || FALLBACK;

/** Arma una URL absoluta sobre el dominio canónico. */
export const siteUrl = (path = '') =>
  `${SITE_URL}${path.startsWith('/') || path === '' ? path : `/${path}`}`;
