'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { LoadingPage } from '@/components/ui/loading';

// Cliente de Supabase con lock deshabilitado
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        lock: async <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
          return fn();
        },
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  );
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    try {
      const supabase = getSupabaseClient();

      // Supabase automaticamente maneja el code en la URL
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Session error:', sessionError);
        router.push('/login?error=auth_error');
        return;
      }

      if (!session) {
        // Intentar obtener la sesion del hash/query params
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const queryParams = new URLSearchParams(window.location.search);

        const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error: setError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (setError) {
            console.error('Set session error:', setError);
            router.push('/login?error=auth_error');
            return;
          }
        } else {
          console.error('No session found');
          router.push('/login?error=auth_error');
          return;
        }
      }

      // Obtener sesion actualizada
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      if (!currentSession?.user?.email) {
        router.push('/login?error=auth_error');
        return;
      }

      // Verificar si el usuario esta autorizado
      const response = await fetch('/api/auth/check-authorized', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentSession.user.email }),
      });

      const authData = await response.json();

      if (!authData.authorized) {
        await supabase.auth.signOut();
        router.push('/login?error=unauthorized');
        return;
      }

      // Usuario autorizado - redirigir al dashboard
      router.push('/inicio');
    } catch (err) {
      console.error('Callback error:', err);
      setError('Error procesando la autenticacion');
      setTimeout(() => router.push('/login?error=auth_error'), 2000);
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <p className="text-gray-500">Redirigiendo...</p>
        </div>
      </div>
    );
  }

  return <LoadingPage />;
}
