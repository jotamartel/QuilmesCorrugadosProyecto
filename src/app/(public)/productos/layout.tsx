import type { Metadata } from 'next';
import { metadataPagina } from '@/lib/seo';

// page.tsx es un componente cliente y no puede exportar metadata: va en el
// layout. El layout público aplica el template "%s | Quilmes Corrugados".
export const metadata: Metadata = metadataPagina({
  titulo: 'Productos: tipos de cajas de cartón corrugado',
  descripcion:
    'Cajas RSC, troqueladas, con impresión y a medida. Fabricamos en Quilmes para e-commerce, mudanza y mayorista.',
  ruta: '/productos',
});

export default function ProductosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
