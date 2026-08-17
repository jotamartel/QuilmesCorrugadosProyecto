import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente de Supabase para el navegador.
 *
 * TIENE QUE SER createBrowserClient DE @supabase/ssr, no el createClient de
 * @supabase/supabase-js. La diferencia no es de estilo: define DONDE queda
 * guardada la sesion.
 *
 *   createClient        → localStorage. Solo la ve el JavaScript del navegador.
 *   createBrowserClient → cookies.      La ve tambien el servidor.
 *
 * El proyecto tenia los dos conviviendo. El login y el callback de OAuth
 * usaban el de localStorage, asi que la sesion nunca llegaba al servidor. Eso
 * no se notaba mientras nada del lado servidor la necesitara, pero al agregar
 * la compuerta de acceso (src/proxy.ts) rompio el login entero: la persona se
 * autenticaba bien, la sesion quedaba guardada donde el proxy no puede mirar,
 * y cada pagina del dashboard la rebotaba de vuelta al login.
 *
 * El `lock` en bypass viene del cliente anterior, donde se agrego para evitar
 * un AbortError del lock de navegador. Se conserva por las dudas.
 */
/**
 * UNA sola instancia por pestaña.
 *
 * Cada llamada a createBrowserClient construye un GoTrueClient nuevo, y varios
 * clientes compartiendo la misma clave de storage se pisan entre si. La consola
 * lo dice con todas las letras:
 *
 *   "Multiple GoTrueClient instances detected in the same browser context...
 *    may produce undefined behavior when used concurrently under the same
 *    storage key"
 *
 * En produccion se llegaron a contar CINCO. Con esa cantidad, que la sesion
 * quede bien escrita pasa a ser cuestion de suerte: uno la guarda, otro la
 * refresca, y el que gana la carrera decide. Memorizar la instancia lo
 * convierte en determinista.
 *
 * La variable vive a nivel de modulo, asi que hay una por pestaña y se limpia
 * sola al cerrarla.
 */
let instancia: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (instancia) return instancia;

  instancia = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        lock: async <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> =>
          fn(),
      },
    },
  );

  return instancia;
}
