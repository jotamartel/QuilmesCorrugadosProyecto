import type { Metadata } from 'next';
import { metadataPagina } from '@/lib/seo';

// page.tsx es un componente cliente y no puede exportar metadata: va en el
// layout. El layout público aplica el template "%s | Quilmes Corrugados".
export const metadata: Metadata = metadataPagina({
  titulo: 'Preguntas frecuentes sobre cajas de cartón',
  descripcion:
    'Pedido mínimo, plazos de producción, impresión, envíos y formas de pago. Las dudas más comunes sobre cajas de cartón corrugado.',
  ruta: '/faq',
});

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
