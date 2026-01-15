'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingPage } from '@/components/ui/loading';
import { getSession, checkUserAuthorized, onAuthStateChange, signOut } from '@/lib/auth/client';

interface AuthGuardProps {
  children: React.ReactNode;
}

interface UserInfo {
  email: string;
  name?: string;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    checkAuth();

    // Suscribirse a cambios de autenticación
    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setAuthenticated(false);
        setUser(null);
        router.push('/login');
      } else if (event === 'SIGNED_IN' && session) {
        await checkAuth();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  async function checkAuth() {
    try {
      const session = await getSession();

      if (!session || !session.user.email) {
        setAuthenticated(false);
        router.push('/login');
        return;
      }

      // Verificar si el usuario está autorizado
      const isAuthorized = await checkUserAuthorized(session.user.email);

      if (!isAuthorized) {
        await signOut();
        router.push('/login?error=unauthorized');
        return;
      }

      setUser({
        email: session.user.email,
        name: session.user.user_metadata?.name || session.user.email.split('@')[0],
      });
      setAuthenticated(true);
    } catch (error) {
      console.error('Error checking auth:', error);
      router.push('/login');
    } finally {
      setLoading(false);
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

// Hook para obtener información del usuario autenticado
export function useAuth() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      try {
        const session = await getSession();
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
