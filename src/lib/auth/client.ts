/**
 * Funciones de autenticación del lado cliente
 */

import { createBrowserClient } from '@supabase/ssr';

export function createAuthClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

  // Verificar si el usuario está autorizado
  const isAuthorized = await checkUserAuthorized(email);
  if (!isAuthorized) {
    await supabase.auth.signOut();
    throw new Error('Usuario no autorizado. Contacte al administrador.');
  }

  return data;
}

/**
 * Login con Google
 */
export async function signInWithGoogle() {
  const supabase = createAuthClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/api/auth/callback`,
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Cerrar sesión
 */
export async function signOut() {
  const supabase = createAuthClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

/**
 * Obtener sesión actual
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
 * Verificar si el email está en la lista de usuarios autorizados
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
 * Suscribirse a cambios de autenticación
 */
export function onAuthStateChange(callback: (event: string, session: unknown) => void) {
  const supabase = createAuthClient();
  return supabase.auth.onAuthStateChange(callback);
}
