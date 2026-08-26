import type { Metadata } from 'next';
import { metadataPagina } from '@/lib/seo';

// page.tsx es un componente cliente y no puede exportar metadata: va en el
// layout. El layout público aplica el template "%s | Quilmes Corrugados".
export const metadata: Metadata = metadataPagina({
  titulo: 'Cajas de Cartón por Mayor',
  descripcion:
    'Comprá cajas de cartón directo de fábrica. Precios por volumen. Producción a medida desde 1.000 m² de cartón. Cotizá online al instante. Quilmes Corrugados.',
  ruta: '/mayorista',
});

export default function MayoristaLayout({
  children,
}: { children: React.ReactNode }) {
  return children;
}
