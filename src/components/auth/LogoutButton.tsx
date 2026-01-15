'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading';
import { signOut } from '@/lib/auth/client';
import { LogOut } from 'lucide-react';

interface LogoutButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive';
  showIcon?: boolean;
  showText?: boolean;
  className?: string;
}

export function LogoutButton({
  variant = 'ghost',
  showIcon = true,
  showText = true,
  className = '',
}: LogoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Error al cerrar sesion:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={variant}
      onClick={handleLogout}
      disabled={loading}
      className={className}
    >
      {loading ? (
        <LoadingSpinner size="sm" />
      ) : (
        <>
          {showIcon && <LogOut className="w-4 h-4" />}
          {showText && <span className={showIcon ? 'ml-2' : ''}>Cerrar sesion</span>}
        </>
      )}
    </Button>
  );
}
