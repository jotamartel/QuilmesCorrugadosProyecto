import type { Metadata } from 'next';
import { metadataPagina } from '@/lib/seo';

// page.tsx es un componente cliente y no puede exportar metadata: va en el
// layout. El layout público aplica el template "%s | Quilmes Corrugados".
//
// EN PAUSA (ago-2026): las cajas para gastronomía son de microcorrugado, que
// no fabricamos; hay una tercerización en negociación. Hasta que cierre, la
// página queda viva pero sin indexar y sin links internos, para no prometer
// un producto que todavía no se vende. Revertir el noindex (y los links en
// CajasPorRubro, LandingFooter, sitemap, robots y las landings hermanas)
// cuando el acuerdo esté firmado.
export const metadata: Metadata = {
  ...metadataPagina({
    titulo: 'Cajas para Delivery y Gastronomía',
    descripcion:
      'Cajas para pizzas, empanadas y delivery. Packaging gastronómico a medida. Cartón resistente. Cotizá online. Fábrica en Quilmes.',
    ruta: '/cajas-alimentos',
  }),
  robots: { index: false, follow: false },
};

export default function CajasAlimentosLayout({
  children,
}: { children: React.ReactNode }) {
  return children;
}
