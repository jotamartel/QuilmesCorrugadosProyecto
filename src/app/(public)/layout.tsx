import type { Metadata } from 'next';
import { TrafficTracker } from '@/components/tracking/TrafficTracker';

export const metadata: Metadata = {
  title: 'Fábrica de Cajas de Cartón Corrugado a Medida | Quilmes, Buenos Aires',
  description: 'Fabricamos cajas de cartón corrugado a medida para empresas en Argentina. Cotizá online al instante con precio en tiempo real. Fábrica propia en Quilmes. Envío gratis zona sur GBA. Pedido mínimo 3.000 m². +20 años de experiencia.',
  alternates: {
    canonical: 'https://quilmes-corrugados.vercel.app',
  },
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <TrafficTracker />
      {children}
    </>
  );
}
