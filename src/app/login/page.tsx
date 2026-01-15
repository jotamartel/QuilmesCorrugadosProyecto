import { Suspense } from 'react';
import { LoginForm } from '@/components/auth';
import { LoadingPage } from '@/components/ui/loading';

export const metadata = {
  title: 'Iniciar Sesion - Quilmes Corrugados',
  description: 'Acceso al sistema de gestion de Quilmes Corrugados',
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <LoginForm />
    </Suspense>
  );
}
