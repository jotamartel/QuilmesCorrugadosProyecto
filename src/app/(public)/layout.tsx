import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site';
import { RETAIL_CONFIG, ENVIO } from '@/lib/retail/config';
import { TrafficTracker } from '@/components/tracking/TrafficTracker';
import { LenisProvider } from '@/components/providers/LenisProvider';
import { ChatWidget } from '@/components/public/ChatWidget';

export const metadata: Metadata = {
  // 46 chars. Con el "| Quilmes Corrugados" que agrega el template del layout
  // raiz queda en 66, justo en el limite de lo que muestra Google. La version
  // anterior sumaba 90 y se cortaba a mitad de "Buenos Aires", que es
  // desperdiciar el unico texto que la persona lee antes de decidir el clic.
  title: 'Fábrica de cajas de cartón corrugado a medida',
  // Google corta cerca de los 160 caracteres. Lo que sobra no se lee, y lo
  // que se lee es lo unico que decide el clic.
  description:
    'Cajas de cartón corrugado a medida en Argentina. Cotizá online con precio real al ' +
    `instante, desde ${RETAIL_CONFIG.MIN_CANTIDAD} cajas. Fábrica en Quilmes. Envío ${ENVIO.micro}.`,
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
