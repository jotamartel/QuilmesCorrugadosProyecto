import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site';
import { RETAIL_CONFIG, ENVIO, MINIMOS } from '@/lib/retail/config';
import { TrafficTracker } from '@/components/tracking/TrafficTracker';
import { LenisProvider } from '@/components/providers/LenisProvider';
import { ChatWidget } from '@/components/public/ChatWidget';

export const metadata: Metadata = {
  // 46 chars. Con el "| Quilmes Corrugados" del template queda en 66, justo en
  // el limite de lo que muestra Google. La version anterior sumaba 90 y se
  // cortaba a mitad de "Buenos Aires", que es desperdiciar el unico texto que
  // la persona lee antes de decidir el clic.
  //
  // El template se re-declara aca a proposito: `title` como string pisa el
  // OBJETO title del layout raiz entero, template incluido, y las paginas de
  // abajo quedaban sin marca en el <title> (en produccion /mayorista era solo
  // "Cajas de Cartón por Mayor"). Con default + template, la home usa el
  // default y cada hija vuelve a salir como "X | Quilmes Corrugados".
  title: {
    default: 'Fábrica de cajas de cartón corrugado a medida',
    template: '%s | Quilmes Corrugados',
  },
  // Google corta cerca de los 160 caracteres. Lo que sobra no se lee, y lo
  // que se lee es lo unico que decide el clic.
  description:
    'Cajas de cartón corrugado a medida en Argentina. Cotizá online con precio real al ' +
    `instante, ${MINIMOS.corto}. Fábrica en Quilmes. Envío ${ENVIO.micro}.`,
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
