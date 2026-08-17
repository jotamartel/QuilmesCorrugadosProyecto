/**
 * Funciones de autenticacion del lado cliente
 */

import { createClient } from '@supabase/supabase-js';
import { AUTH_ORIGIN } from '@/lib/site';

// Cliente de Supabase con lock deshabilitado para evitar AbortError
export function createAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        lock: async <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
          // Bypass del lock - ejecutar directamente
          return fn();
        },
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  );
}

/**
 * Login con email y password
 */
export async function signInWithEmail(email: string, password: string) {
  const supabase = createAuthClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  // Verificar si el usuario esta autorizado
  const isAuthorized = await checkUserAuthorized(email);
  if (!isAuthorized) {
    await supabase.auth.signOut();
    throw new Error('Usuario no autorizado. Contacte al administrador.');
  }

  return data;
}

/** Si estamos corriendo en la maquina del desarrollador. */
function esLocal(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h.includes('localhost') || h.includes('127.0.0.1');
}

/**
 * URL base para los redirects de OAuth.
 *
 * En desarrollo usa el origin actual, para que el login funcione contra
 * localhost. En cualquier otro lado usa AUTH_ORIGIN.
 *
 * Antes leia NEXT_PUBLIC_SITE_URL por su cuenta y, si no estaba, caia a un
 * apex escrito a mano. Eran dos fuentes de verdad para el mismo dato, con el
 * agravante de que esta decide a donde vuelve el usuario despues de loguearse:
 * si se desincronizaba de la lista de URLs permitidas de Supabase, el login se
 * rompia sin que nada mas del sitio se viera afectado.
 *
 * IMPORTANTE: el valor que salga de aca tiene que estar en Supabase, en
 * Authentication → URL Configuration → Redirect URLs, con el sufijo
 * /auth/callback. Si se cambia el dominio canonico, hay que agregarlo ALLA
 * ANTES de que este cambio llegue a produccion.
 */
function getBaseUrl(): string {
  if (esLocal()) return window.location.origin.trim();
  return AUTH_ORIGIN;
}

/**
 * Login con Google
 */
export async function signInWithGoogle() {
  const supabase = createAuthClient();
  
  // Esta funcion repetia entera la logica de getBaseUrl(), con la variable de
  // entorno leida por su cuenta y el apex escrito a mano. Dos copias de la
  // misma decision es como se desincronizan.
  const redirectUrl = `${getBaseUrl()}/auth/callback`.replace(/\s+/g, '').trim();

  console.log('[Auth Debug] Redirect URL:', redirectUrl);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Redirigir a la pagina de callback del cliente que maneja la sesion
      redirectTo: redirectUrl,
      // Forzar que Supabase use esta URL explícitamente
      skipBrowserRedirect: false,
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Cerrar sesion
 */
export async function signOut() {
  const supabase = createAuthClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

/**
 * Obtener sesion actual
 */
export async function getSession() {
  const supabase = createAuthClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  return session;
}

/**
 * Obtener usuario actual
 */
export async function getUser() {
  const supabase = createAuthClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  return user;
}

/**
 * Verificar si el email esta en la lista de usuarios autorizados
 */
export async function checkUserAuthorized(email: string): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/check-authorized', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.authorized === true;
  } catch {
    return false;
  }
}

/**
 * Suscribirse a cambios de autenticacion
 */
export function onAuthStateChange(callback: (event: string, session: unknown) => void) {
  const supabase = createAuthClient();
  return supabase.auth.onAuthStateChange(callback);
}
