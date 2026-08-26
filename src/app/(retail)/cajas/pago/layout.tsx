import type { Metadata } from 'next';

// page.tsx es un componente cliente y no puede exportar metadata: va acá.
// Estado de un pago de MercadoPago con querystring propio de cada compra:
// no es contenido indexable y compartir el link no debería exponerlo a bots.
export const metadata: Metadata = {
  title: 'Estado del pago',
  robots: { index: false, follow: false },
};

export default function PagoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
