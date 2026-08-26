import type { Metadata } from 'next';

// page.tsx es un componente cliente y no puede exportar metadata: va acá.
// La cotización es de quien tiene el link (igual criterio que /pedido/[token]):
// no se indexa, y robots.ts además cierra /cotizacion/ como defensa en
// profundidad.
export const metadata: Metadata = {
  title: 'Tu cotización',
  robots: { index: false, follow: false },
};

export default function CotizacionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
