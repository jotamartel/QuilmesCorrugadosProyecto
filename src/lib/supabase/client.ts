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
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        lock: async <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> =>
          fn(),
      },
    },
  );
}
