import type { Metadata } from 'next';

// page.tsx es un componente cliente y no puede exportar metadata: va en el layout.
// El layout raiz aplica el template "%s | Quilmes Corrugados".
export const metadata: Metadata = {
  title: 'Productos: tipos de cajas de cartón corrugado',
  description:
    'Cajas RSC, troqueladas, con impresión y a medida. Fabricamos en Quilmes para e-commerce, alimentos, mudanza y mayorista.',
  alternates: { canonical: '/productos' },
};

export default function ProductosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
