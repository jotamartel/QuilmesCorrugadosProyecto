import type { Metadata } from 'next';
import { metadataPagina } from '@/lib/seo';

// page.tsx es un componente cliente y no puede exportar metadata: va en el
// layout. El layout público aplica el template "%s | Quilmes Corrugados".
export const metadata: Metadata = metadataPagina({
  titulo: 'Cajas para Delivery y Gastronomía',
  descripcion:
    'Cajas para pizzas, empanadas y delivery. Packaging gastronómico a medida. Cartón resistente. Cotizá online. Fábrica en Quilmes.',
  ruta: '/cajas-alimentos',
});

export default function CajasAlimentosLayout({
  children,
}: { children: React.ReactNode }) {
  return children;
}
