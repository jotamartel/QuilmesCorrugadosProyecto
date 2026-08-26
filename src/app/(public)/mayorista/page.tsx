'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { QuoterForm } from '@/components/public/QuoterForm';
import { CotizarSinJavaScript } from '@/components/public/CotizarSinJavaScript';
import { ResumenClave } from '@/components/public/ResumenClave';
import { PreguntasFrecuentes } from '@/components/public/PreguntasFrecuentes';
import { CtaMovilFijo } from '@/components/public/CtaMovilFijo';
import { BotonCompartir } from '@/components/public/BotonCompartir';
import { Package, TrendingDown, Factory, ArrowRight } from 'lucide-react';
import { trackEvent } from '@/lib/utils/tracking';
import { RETAIL_CONFIG, ENVIO } from '@/lib/retail/config';


const PREGUNTAS = [
  {
    pregunta: '¿Cuál es el mínimo para comprar por mayor?',
    respuesta:
      `${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m² de cartón. Ese es el punto donde ` +
      `arranca una tirada a medida: recién ahí se puede troquelar o imprimir. Por debajo, el ` +
      `pedido sale del catálogo de medidas estándar, con mínimo de ${RETAIL_CONFIG.MIN_M2_PEDIDO} m² ` +
      `y precio minorista. Los 3.000 m² son otra cosa: el tramo donde el precio por m² baja.`,
  },
  {
    pregunta: '¿Cuánto baja el precio por volumen?',
    respuesta:
      `El m² va de $${RETAIL_CONFIG.RETAIL_PRICE_PER_M2} en pedidos chicos a ` +
      `$${RETAIL_CONFIG.VOLUME_PRICE_PER_M2} en el tramo de mayor volumen. La escalera ` +
      'completa, con el precio de cada tramo, está publicada en /precios: no hay que pedir ' +
      'la lista ni dejar datos para verla.',
  },
  {
    pregunta: '¿Puedo cotizar sin hablar con un vendedor?',
    respuesta:
      'Sí. El cotizador da el precio al instante con las medidas y la cantidad. También hay ' +
      'una API pública y gratuita, sin registro, para que tu sistema de compras pida el ' +
      'precio directamente: GET /api/v1/quote.',
  },
  {
    pregunta: '¿Hacen impresión con nuestra marca?',
    respuesta:
      'Sí, flexográfica de hasta 3 colores. A partir de 1.000 m² generamos el archivo ' +
      'troquelado con las medidas exactas para que tu equipo de diseño arme el arte sobre ' +
      'la plantilla real y no haya sorpresas en la impresión.',
  },
  {
    pregunta: '¿Qué plazo de producción manejan y cómo se factura?',
    respuesta:
      'La producción a medida demora 7 días hábiles desde la aprobación. Facturamos A y B. ' +
      ENVIO.largo,
  },
];

export default function MayoristaPage() {
  useEffect(() => {
    trackEvent('product_page_view', { section: 'mayorista' });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      <section className="pt-24 pb-16 px-4 bg-gradient-to-br from-blue-50 to-slate-100">
        <div className="max-w-7xl mx-auto text-center">
          {/* Distinto del title ("Cajas de Cartón por Mayor"). */}
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Comprá cajas de cartón{' '}
            <span className="text-[#002E55]">directo de fábrica</span>
          </h1>
          {/* Decia "Desde 100 unidades por modelo", que es un minimo que ya no
              existe en ningun canal, y despues "desde 3.000 m²", que es el
              escalon donde BAJA EL PRECIO, no donde arranca la produccion. Una
              tirada a medida arranca en MIN_M2_A_MEDIDA_PROPIA. */}
          <p className="text-xl text-gray-600 mb-6 max-w-2xl mx-auto">
            Producción propia en Quilmes, sin intermediarios. Tiradas a medida desde{' '}
            {RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m² de cartón, con precio
            por m² que baja según el volumen.
          </p>
          <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#cotizador"
              onClick={() => trackEvent('quote_started', { source: 'hero_mayorista' })}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#002E55] hover:bg-[#001a33] text-white font-medium rounded-lg transition-colors"
            >
              Cotizar ahora
              <ArrowRight className="w-4 h-4" />
            </a>
            <BotonCompartir
              titulo="Cajas de cartón por mayor, directo de fábrica"
              texto="Precios por volumen publicados y cotizador online al instante."
            />
          </div>

          <ResumenClave
            puntos={[
              {
                rotulo: 'Mínimo',
                valor: `${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m² de cartón para producción a medida`,
              },
              {
                rotulo: 'Precio',
                valor: `De $${RETAIL_CONFIG.VOLUME_PRICE_PER_M2} a $${RETAIL_CONFIG.RETAIL_PRICE_PER_M2} por m², según el tramo de volumen`,
              },
              { rotulo: 'Plazo', valor: '7 días hábiles desde la aprobación' },
              { rotulo: 'Impresión', valor: 'Hasta 3 colores; plantilla troquelada desde 1.000 m²' },
              { rotulo: 'Cotizar', valor: 'Online al instante, o por API pública sin registro' },
            ]}
            accion={{ texto: 'Ver la escalera de precios', href: '/precios' }}
          />
        </div>
      </section>

      <section className="py-12 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          {/* Agrupa los h3 que colgaban directo del h1. */}
          <h2 className="sr-only">Cómo funciona la compra por mayor</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="text-center p-6">
              <div className="inline-flex justify-center w-12 h-12 bg-blue-100 rounded-full mb-4">
                <Factory className="w-6 h-6 text-[#002E55]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Fábrica directa</h3>
              <p className="text-gray-600 text-sm">Sin intermediarios. Producción propia en Quilmes. Ahorrá en cada pedido.</p>
            </div>
            <div className="text-center p-6">
              <div className="inline-flex justify-center w-12 h-12 bg-blue-100 rounded-full mb-4">
                <TrendingDown className="w-6 h-6 text-[#002E55]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Precios por volumen</h3>
              <p className="text-gray-600 text-sm">El precio por m² baja por tramos: a los 1.000, a los 3.000 y a los 5.000 m².</p>
            </div>
            <div className="text-center p-6">
              <div className="inline-flex justify-center w-12 h-12 bg-blue-100 rounded-full mb-4">
                <Package className="w-6 h-6 text-[#002E55]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Pedidos chicos, otro canal</h3>
              <p className="text-gray-600 text-sm">
                ¿No llegás a {RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m²? Desde{' '}
                {RETAIL_CONFIG.MIN_M2_PEDIDO} m² se compra de catálogo en{' '}
                <Link href="/cajas" className="text-[#002E55] underline underline-offset-2">
                  la tienda minorista
                </Link>
                .
              </p>
            </div>
          </div>

          <section id="cotizador" className="py-8 px-4 bg-gray-50 rounded-xl">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Cotizá por volumen</h2>
              <p className="text-gray-600 text-center mb-6">Ingresá medidas y cantidad. Precio al instante.</p>
              <QuoterForm />
              <div className="mt-4 text-center">
                <CotizarSinJavaScript />
              </div>
            </div>
          </section>
        </div>
      </section>

      <PreguntasFrecuentes
        preguntas={PREGUNTAS}
        titulo="Preguntas frecuentes sobre compra por mayor"
        className="bg-gray-50"
      />

      <nav aria-label="Páginas relacionadas" className="px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-4 text-center text-lg font-semibold text-gray-900">
            Otros usos y secciones
          </h2>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <li><Link href="/cajas-ecommerce" className="text-[#002E55] hover:underline">Cajas para e-commerce</Link></li>
            <li><Link href="/cajas-mudanza" className="text-[#002E55] hover:underline">Cajas para mudanza</Link></li>
            <li><Link href="/precios" className="text-[#002E55] hover:underline">Escalera de precios</Link></li>
            <li><Link href="/api/v1/docs" className="text-[#002E55] hover:underline">Cotizar por API</Link></li>
            <li><Link href="/faq" className="text-[#002E55] hover:underline">Todas las preguntas</Link></li>
          </ul>
        </div>
      </nav>

      <LandingFooter />
      <CtaMovilFijo mensajeWhatsapp="Hola, quiero cotizar cajas de cartón por mayor." />
    </div>
  );
}
