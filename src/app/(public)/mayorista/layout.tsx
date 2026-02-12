import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cajas de Cartón por Mayor',
  description: 'Comprá cajas de cartón directo de fábrica. Precios por volumen. Desde 100 unidades. Cotizá online al instante. Quilmes Corrugados.',
};

export default function MayoristaLayout({
  children,
}: { children: React.ReactNode }) {
  return children;
}
