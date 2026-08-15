import type { Metadata } from 'next';

// page.tsx es un componente cliente y no puede exportar metadata: va en el layout.
// El layout raiz aplica el template "%s | Quilmes Corrugados".
export const metadata: Metadata = {
  title: 'Preguntas frecuentes sobre cajas de cartón',
  description:
    'Pedido mínimo, plazos de producción, impresión, envíos y formas de pago. Las dudas más comunes sobre cajas de cartón corrugado.',
  alternates: { canonical: '/faq' },
};

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
