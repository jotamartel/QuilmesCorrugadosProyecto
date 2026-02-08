/**
 * Funciones de autenticacion del lado cliente
 */

import { createClient } from '@supabase/supabase-js';

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

/**
 * Obtiene la URL base correcta para redirects
 * En producción usa la variable de entorno, en desarrollo usa window.location.origin
 */
function getBaseUrl(): string {
  // NEXT_PUBLIC_SITE_URL está disponible en el cliente porque tiene el prefijo NEXT_PUBLIC_
  // Tiene prioridad absoluta si está configurada
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    return siteUrl;
  }
  
  // En el cliente, detectar si estamos en producción
  if (typeof window !== 'undefined') {
    const origin = window.location.origin.trim();
    const hostname = window.location.hostname;
    
    // Si estamos en producción (no localhost), usar el origin actual
    if (!hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
      return origin;
    }
    
    // Si estamos en localhost, usar localhost (para desarrollo)
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      return origin;
    }
  }
  
  // En el servidor, usar VERCEL_URL si está disponible
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.trim();
  }
  
  // Fallback por defecto para producción
  return 'https://quilmescorrugados.com.ar';
}

/**
 * Login con Google
 */
export async function signInWithGoogle() {
  const supabase = createAuthClient();
  
  // Determinar la URL base correcta - FORZAR URL DE PRODUCCIÓN si no es localhost
  let baseUrl: string;
  
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const origin = window.location.origin;
    
    // SIEMPRE usar NEXT_PUBLIC_SITE_URL si está disponible (tiene prioridad absoluta)
    if (process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
      baseUrl = process.env.NEXT_PUBLIC_SITE_URL.trim();
    }
    // Si estamos en localhost, usar localhost
    else if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      baseUrl = origin.trim();
    }
    // Si estamos en producción (cualquier otro dominio), usar el origin actual
    else {
      baseUrl = origin.trim();
    }
  } else {
    // En el servidor, usar NEXT_PUBLIC_SITE_URL o fallback
    baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://quilmescorrugados.com.ar';
  }
  
  // Limpiar la URL de cualquier espacio o salto de línea
  const redirectUrl = `${baseUrl}/auth/callback`.replace(/\s+/g, '').trim();

  // Log para debug (siempre activo para troubleshooting)
  console.log('[Auth Debug] ========================================');
  console.log('[Auth Debug] Redirect URL:', redirectUrl);
  console.log('[Auth Debug] Hostname:', typeof window !== 'undefined' ? window.location.hostname : 'server');
  console.log('[Auth Debug] Origin:', typeof window !== 'undefined' ? window.location.origin : 'server');
  console.log('[Auth Debug] NEXT_PUBLIC_SITE_URL:', process.env.NEXT_PUBLIC_SITE_URL);
  console.log('[Auth Debug] NODE_ENV:', process.env.NODE_ENV);
  console.log('[Auth Debug] ========================================');

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
