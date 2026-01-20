'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingPage } from '@/components/ui/loading';
import { checkUserAuthorized } from '@/lib/auth/client';
import { createClient } from '@supabase/supabase-js';

interface AuthGuardProps {
  children: React.ReactNode;
}

interface UserInfo {
  email: string;
  name?: string;
}

// Cliente de Supabase con lock deshabilitado
function getSupabaseClient() {
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

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    // Evitar doble ejecucion en StrictMode
    if (checkedRef.current) return;
    checkedRef.current = true;

    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      console.log('AuthGuard: Checking session...');

      const supabase = getSupabaseClient();
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error('AuthGuard: Error getting session:', error);
        setLoading(false);
        router.push('/login');
        return;
      }

      console.log('AuthGuard: Session result:', session ? 'exists' : 'null');

      if (!session || !session.user.email) {
        console.log('AuthGuard: No session, redirecting to login');
        setAuthenticated(false);
        setLoading(false);
        router.push('/login');
        return;
      }

      // Verificar si el usuario esta autorizado
      console.log('AuthGuard: Checking authorization for:', session.user.email);
      const isAuthorized = await checkUserAuthorized(session.user.email);
      console.log('AuthGuard: Authorization result:', isAuthorized);

      if (!isAuthorized) {
        console.log('AuthGuard: User not authorized, signing out');
        await supabase.auth.signOut();
        setLoading(false);
        router.push('/login?error=unauthorized');
        return;
      }

      setUser({
        email: session.user.email,
        name: session.user.user_metadata?.name || session.user.email.split('@')[0],
      });
      setAuthenticated(true);
      setLoading(false);
    } catch (error) {
      console.error('AuthGuard: Error checking auth:', error);
      setLoading(false);
      router.push('/login');
    }
  }

  if (loading) {
    return <LoadingPage />;
  }

  if (!authenticated) {
    return null;
  }

  return <>{children}</>;
}

// Hook para obtener informacion del usuario autenticado
export function useAuth() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      try {
        const supabase = getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user.email) {
          setUser({
            email: session.user.email,
            name: session.user.user_metadata?.name || session.user.email.split('@')[0],
          });
        }
      } catch (error) {
        console.error('Error loading user:', error);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  return { user, loading };
}
