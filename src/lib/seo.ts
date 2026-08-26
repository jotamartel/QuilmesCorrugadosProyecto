import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Metadata completa para una página pública.
 *
 * Existe porque Next no fusiona metadata en profundidad: una página que no
 * declara `openGraph` hereda el card genérico de la home (compartir /precios
 * por WhatsApp mostraba un tarjetón que no hablaba de precios), y una que lo
 * declara a mano pierde la imagen, el siteName y el locale del layout raíz.
 * Peor: sin `alternates` propio se hereda el canonical del layout público,
 * que apunta a la home — Google trataba a las landings de rubro como
 * duplicados de / y no las indexaba.
 */
export function metadataPagina({
  titulo,
  descripcion,
  ruta,
}: {
  titulo: string;
  descripcion: string;
  /** Ruta absoluta desde la raíz, p. ej. '/cajas-ecommerce'. */
  ruta: string;
}): Metadata {
  const tituloConMarca = `${titulo} | Quilmes Corrugados`;
  const imagen = {
    url: '/og-image.jpg?v=2',
    width: 1200,
    height: 630,
    alt: 'Quilmes Corrugados - Fábrica de Cajas de Cartón Corrugado a Medida',
  };
  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: ruta },
    openGraph: {
      title: tituloConMarca,
      description: descripcion,
      url: `${SITE_URL}${ruta}`,
      siteName: 'Quilmes Corrugados',
      locale: 'es_AR',
      type: 'website',
      images: [imagen],
    },
    twitter: {
      card: 'summary_large_image',
      title: tituloConMarca,
      description: descripcion,
      images: [imagen.url],
    },
  };
}
