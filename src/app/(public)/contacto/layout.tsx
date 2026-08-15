import type { Metadata } from 'next';

// page.tsx es un componente cliente y no puede exportar metadata: va en el layout.
// El layout raiz aplica el template "%s | Quilmes Corrugados".
export const metadata: Metadata = {
  title: 'Contacto',
  description:
    'Escribinos o llamanos. Fábrica en Lugones 219, Quilmes, Buenos Aires. Respondemos cotizaciones el mismo día hábil.',
  alternates: { canonical: '/contacto' },
};

export default function ContactoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
