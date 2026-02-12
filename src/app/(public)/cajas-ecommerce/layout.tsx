import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cajas para E-commerce y Envíos',
  description: 'Cajas de cartón a medida para tiendas online y envíos. Packaging para MercadoLibre y e-commerce. Cotizá online al instante. Fábrica en Quilmes.',
};

export default function CajasEcommerceLayout({
  children,
}: { children: React.ReactNode }) {
  return children;
}
