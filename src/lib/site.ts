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

/**
 * El dominio canonico NO se puede sobreescribir por variable de entorno.
 *
 * Lo era, y costo caro. La variable quedo cargada con el apex, piso al codigo,
 * y el llms.txt salio publicando URLs del apex. El apex responde 308, asi que
 * un asistente que pide una cotizacion recibe el texto "Redirecting..." en vez
 * del JSON. ChatGPT lo reporto tal cual: "su API no esta devolviendo el
 * resultado desde aca". Tenia razon.
 *
 * O sea que un valor mal puesto en un panel no rompia un detalle de
 * posicionamiento: apagaba el cotizador para IA, que es el diferencial del
 * negocio. Un dato asi tiene que estar versionado, revisable en un diff y no
 * poder cambiarse sin que quede registro.
 *
 * Si algun dia hay que mover el dominio, se cambia esta constante.
 */
export const SITE_URL = FALLBACK;

/**
 * Origen para los redirects de OAuth. Este SI respeta la variable.
 *
 * Parece el mismo dato que SITE_URL, pero no lo es, y mezclarlos es peligroso:
 * este valor tiene que coincidir EXACTAMENTE con la lista de Redirect URLs de
 * Supabase. Si el canonico se mueve y este lo sigue solo, el login con Google
 * deja de funcionar de golpe, sin que nada mas del sitio se vea afectado.
 *
 * Por eso queda atado a la variable: mientras NEXT_PUBLIC_SITE_URL siga
 * cargada con el apex, el login sigue yendo al apex, que es lo que Supabase
 * tiene aprobado hoy. Cuando se agregue el callback de www alla, se borra la
 * variable y este valor pasa a seguir al canonico sin ningun otro cambio.
 */
export const AUTH_ORIGIN = normalizar(process.env.NEXT_PUBLIC_SITE_URL) || SITE_URL;

/** Arma una URL absoluta sobre el dominio canónico. */
export const siteUrl = (path = '') =>
  `${SITE_URL}${path.startsWith('/') || path === '' ? path : `/${path}`}`;
