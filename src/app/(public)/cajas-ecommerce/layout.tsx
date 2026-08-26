import type { Metadata } from 'next';
import { metadataPagina } from '@/lib/seo';

// page.tsx es un componente cliente y no puede exportar metadata: va en el
// layout. El layout público aplica el template "%s | Quilmes Corrugados".
export const metadata: Metadata = metadataPagina({
  titulo: 'Cajas para E-commerce y Envíos',
  descripcion:
    'Cajas de cartón a medida para tiendas online y envíos. Packaging para MercadoLibre y e-commerce. Cotizá online al instante. Fábrica en Quilmes.',
  ruta: '/cajas-ecommerce',
});

export default function CajasEcommerceLayout({
  children,
}: { children: React.ReactNode }) {
  return children;
}
