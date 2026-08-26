import type { Metadata } from 'next';
import { metadataPagina } from '@/lib/seo';

// page.tsx es un componente cliente y no puede exportar metadata: va en el
// layout. El layout público aplica el template "%s | Quilmes Corrugados".
export const metadata: Metadata = metadataPagina({
  // "de Cartón" suma la keyword real de búsqueda: "Cajas para Mudanza" a secas
  // eran 18 caracteres que desperdiciaban el ancho del resultado.
  titulo: 'Cajas de Cartón para Mudanza',
  descripcion:
    'Cajas de cartón resistentes para mudanzas y guardamuebles. Medidas grandes. Cartón corrugado de calidad. Cotizá online. Quilmes Corrugados.',
  ruta: '/cajas-mudanza',
});

export default function CajasMudanzaLayout({
  children,
}: { children: React.ReactNode }) {
  return children;
}
