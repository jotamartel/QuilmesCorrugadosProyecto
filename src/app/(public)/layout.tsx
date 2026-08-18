import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site';
import { MINIMOS, ENVIO } from '@/lib/retail/config';
import { TrafficTracker } from '@/components/tracking/TrafficTracker';
import { LenisProvider } from '@/components/providers/LenisProvider';
import { ChatWidget } from '@/components/public/ChatWidget';

export const metadata: Metadata = {
  // 46 chars. Con el "| Quilmes Corrugados" que agrega el template del layout
  // raiz queda en 66, justo en el limite de lo que muestra Google. La version
  // anterior sumaba 90 y se cortaba a mitad de "Buenos Aires", que es
  // desperdiciar el unico texto que la persona lee antes de decidir el clic.
  title: 'Fábrica de cajas de cartón corrugado a medida',
  description: 'Fabricamos cajas de cartón corrugado a medida para empresas en Argentina. Cotizá online al instante con precio en tiempo real. Fábrica propia en Quilmes. Envío ' + ENVIO.corto + '. Mínimos: ' + MINIMOS.corto + '. +20 años de experiencia.',
  alternates: {
    canonical: SITE_URL,
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
      <LenisProvider>
        {children}
        <ChatWidget />
      </LenisProvider>
    </>
  );
}
