import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cajas para Delivery y Gastronomía',
  description: 'Cajas para pizzas, empanadas y delivery. Packaging gastronómico a medida. Cartón resistente. Cotizá online. Fábrica en Quilmes.',
};

export default function CajasAlimentosLayout({
  children,
}: { children: React.ReactNode }) {
  return children;
}
