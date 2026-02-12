import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cajas para Mudanza',
  description: 'Cajas de cartón resistentes para mudanzas y guardamuebles. Medidas grandes. Cartón corrugado de calidad. Cotizá online. Quilmes Corrugados.',
};

export default function CajasMudanzaLayout({
  children,
}: { children: React.ReactNode }) {
  return children;
}
