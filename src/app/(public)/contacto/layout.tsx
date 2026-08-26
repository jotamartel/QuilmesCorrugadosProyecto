import type { Metadata } from 'next';
import { metadataPagina } from '@/lib/seo';

// page.tsx es un componente cliente y no puede exportar metadata: va en el
// layout. El layout público aplica el template "%s | Quilmes Corrugados".
export const metadata: Metadata = metadataPagina({
  titulo: 'Contacto',
  descripcion:
    'Escribinos o llamanos. Fábrica en Lugones 219, Quilmes, Buenos Aires. Respondemos cotizaciones el mismo día hábil.',
  ruta: '/contacto',
});

export default function ContactoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
