/**
 * Verifica que quien llama sea un usuario autorizado del dashboard.
 *
 * El proyecto no tiene middleware.ts, así que las rutas de API que devuelven
 * datos internos quedaron sin protección: usan el service role y contestan a
 * cualquiera. /api/retail-sales es el caso conocido y sigue abierto.
 *
 * Este helper existe para que las rutas nuevas no repitan ese error, y para
 * poder cerrar las viejas agregándole una línea a cada una.
 *
 * Cómo funciona: lee la sesión de Supabase desde las cookies (o sea, el
 * usuario tiene que estar logueado en el dashboard) y confirma que su email
 * figure en authorized_users. No alcanza con estar logueado: hay que estar en
 * la lista.
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface ResultadoAuth {
  autorizado: boolean;
  email?: string;
  motivo?: string;
}

export async function verificarAdmin(): Promise<ResultadoAuth> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user?.email) {
      return { autorizado: false, motivo: 'sin sesion' };
    }

    // La consulta va con service role a proposito: authorized_users tiene RLS
    // y una policy que exige estar ya autorizado para leerla, con lo cual un
    // usuario nuevo no podria ni consultarse a si mismo.
    const admin = createAdminClient();
    const { data: autorizado } = await admin
      .from('authorized_users')
      .select('email')
      .eq('email', user.email.toLowerCase())
      .maybeSingle();

    if (!autorizado) {
      return { autorizado: false, email: user.email, motivo: 'no esta en authorized_users' };
    }

    return { autorizado: true, email: user.email };
  } catch (err) {
    console.error('[auth] Error verificando admin:', err);
    return { autorizado: false, motivo: 'error verificando la sesion' };
  }
}
