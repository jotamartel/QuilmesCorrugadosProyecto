import type { Metadata } from 'next';
import { metadataPagina } from '@/lib/seo';

// page.tsx es un componente cliente y no puede exportar metadata: va acá.
// La página está permitida en robots.ts y ahora también en el sitemap: es la
// puerta de entrada de desarrolladores y asistentes de IA a la API de
// cotización, y venía heredando el title/description genéricos del layout raíz.
export const metadata: Metadata = metadataPagina({
  titulo: 'API pública de cotización de cajas',
  descripcion:
    'API gratuita y sin registro para cotizar cajas de cartón corrugado en Argentina. Precio real al instante con un GET. Documentación, ejemplos y spec OpenAPI.',
  ruta: '/api/v1/docs',
});

export default function ApiDocsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
