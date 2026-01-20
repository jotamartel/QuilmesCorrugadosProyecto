import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Quilmes Corrugados - Cajas de cartón a medida',
  description: 'Fábrica de cajas de cartón corrugado. Cotizá online en segundos. Entregas en todo AMBA.',
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
