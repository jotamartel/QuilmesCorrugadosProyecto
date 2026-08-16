import type { Metadata } from 'next';
import BoxGame from '@/components/retail/BoxGame';
import { CotizarSinJavaScript } from '@/components/public/CotizarSinJavaScript';
import { RETAIL_CONFIG } from '@/lib/retail/config';
import { SITE_URL } from '@/lib/site';

/**
 * Esta pagina era 'use client' y devolvia solo <BoxGame />, sin metadata.
 * Para un buscador o un asistente eso es una pagina en blanco: el titulo lo
 * ponia el layout raiz, no habia descripcion, y el precio recien aparece
 * despues de que corre el JS del configurador.
 *
 * Ahora es un server component que envuelve al mismo configurador (que sigue
 * siendo cliente, sin cambios) y agrega lo que se puede leer sin ejecutar
 * nada: metadata propia, un parrafo con las condiciones reales del canal y la
 * salida por API.
 */

const DESCRIPCION =
  `Compra minorista de cajas de carton corrugado a medida, desde ` +
  `${RETAIL_CONFIG.MIN_CANTIDAD} cajas, con stock y entrega en AMBA. ` +
  `Configura la medida, mira el precio al instante y pagas online.`;

export const metadata: Metadata = {
  title: 'Comprar cajas de cartón por unidad | Desde 100 cajas | Quilmes Corrugados',
  description: DESCRIPCION,
  alternates: { canonical: `${SITE_URL}/cajas` },
  openGraph: {
    title: 'Comprar cajas de cartón corrugado a medida — desde 100 cajas',
    description: DESCRIPCION,
    url: `${SITE_URL}/cajas`,
    type: 'website',
  },
};

export default function CajasPage() {
  return (
    <>
      {/* Lo que se lee sin ejecutar JS. Va antes del configurador para que
          quede en el primer tramo del HTML, que es lo que muchos extractores
          conservan cuando truncan. */}
      <h1 className="sr-only">
        Comprar cajas de cartón corrugado a medida desde {RETAIL_CONFIG.MIN_CANTIDAD} cajas
      </h1>
      <p className="sr-only">
        {DESCRIPCION} El precio minorista es de $
        {RETAIL_CONFIG.RETAIL_PRICE_PER_M2} por m² para pedidos de menos de{' '}
        {RETAIL_CONFIG.WHOLESALE_THRESHOLD_M2.toLocaleString('es-AR')} m². A partir
        de ese volumen el pedido pasa al canal mayorista, con produccion a medida y
        precio mas bajo. Fabrica en Quilmes, Buenos Aires.
      </p>

      <BoxGame />

      <div className="mx-auto max-w-2xl px-4 pb-10 text-center">
        <CotizarSinJavaScript />
      </div>
    </>
  );
}
