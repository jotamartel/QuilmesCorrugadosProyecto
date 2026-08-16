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
import { Pizza, Truck, UtensilsCrossed, ArrowRight } from 'lucide-react';
import { trackEvent } from '@/lib/utils/tracking';
import { RETAIL_CONFIG } from '@/lib/retail/config';

const MIN = RETAIL_CONFIG.MIN_CANTIDAD;

const PREGUNTAS = [
  {
    pregunta: '¿El cartón es apto para contacto con alimentos?',
    respuesta:
      'Trabajamos con cartón kraft sin tratamientos ni tintas en la cara interna. Para ' +
      'contacto directo con alimentos grasos o húmedos lo habitual es usar una lámina o ' +
      'papel intermedio; si tu producto lo requiere, avisanos al cotizar y lo resolvemos ' +
      'en el diseño de la caja.',
  },
  {
    pregunta: '¿Cuánto sale una caja de pizza a medida?',
    respuesta:
      `El precio va por metro cuadrado de cartón: de $${RETAIL_CONFIG.VOLUME_PRICE_PER_M2} ` +
      `por m² en volumen a $${RETAIL_CONFIG.RETAIL_PRICE_PER_M2} por m² en pedidos chicos. ` +
      'Una caja de pizza de 32 cm cuadrada usa alrededor de 0,25 m². El cotizador da el ' +
      'número exacto de tu medida al instante.',
  },
  {
    pregunta: '¿Puedo imprimir el logo de mi local?',
    respuesta:
      'Sí, impresión flexográfica de hasta 3 colores. Es lo más pedido en delivery: la caja ' +
      'es el único contacto físico de la marca con el cliente. A partir de 1.000 m² te ' +
      'generamos la plantilla troquelada para que tu diseñador arme el arte sobre la medida real.',
  },
  {
    pregunta: '¿Cuál es el mínimo para un restaurante chico?',
    respuesta:
      `Desde ${MIN} cajas si la medida está en catálogo. Si querés una medida propia con ` +
      'impresión, el mínimo de fabricación es 3.000 m² por modelo, que en cajas de delivery ' +
      'son varios miles de unidades: conviene cuando ya tenés rotación estable.',
  },
  {
    pregunta: '¿Entregan en CABA y zona sur?',
    respuesta:
      'Sí. Envío gratis hasta 60 km de la fábrica en Quilmes, que cubre CABA y buena parte ' +
      'del GBA sur. A todo el país con costo de flete. Stock en 24 a 48 horas, producción a ' +
      'medida en 7 días hábiles.',
  },
];

export default function CajasAlimentosPage() {
  useEffect(() => {
    trackEvent('product_page_view', { section: 'cajas-alimentos' });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      <section className="pt-24 pb-16 px-4 bg-gradient-to-br from-amber-50 to-slate-100">
        <div className="max-w-7xl mx-auto text-center">
          {/* Distinto del title ("Cajas para Delivery y Gastronomía"): apunta
              a como lo busca el dueño de un local, no a la categoria. */}
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Cajas de cartón para{' '}
            <span className="text-[#002E55]">pizzería, delivery y catering</span>
          </h1>
          <p className="text-xl text-gray-600 mb-6 max-w-2xl mx-auto">
            Pizzas, empanadas, viandas y catering. Cartón kraft resistente en la medida de
            tu producto, con tu logo impreso. Producción propia en Quilmes.
          </p>
          <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#cotizador"
              onClick={() => trackEvent('quote_started', { source: 'hero_alimentos' })}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#002E55] hover:bg-[#001a33] text-white font-medium rounded-lg transition-colors"
            >
              Cotizar cajas
              <ArrowRight className="w-4 h-4" />
            </a>
            <BotonCompartir
              titulo="Cajas de cartón para delivery y gastronomía"
              texto="Cotizador online con precio al instante, fábrica en Quilmes."
            />
          </div>

          <ResumenClave
            puntos={[
              { rotulo: 'Mínimo', valor: `${MIN} cajas de stock, o 3.000 m² por modelo a medida` },
              {
                rotulo: 'Precio',
                valor: `De $${RETAIL_CONFIG.VOLUME_PRICE_PER_M2} a $${RETAIL_CONFIG.RETAIL_PRICE_PER_M2} por m² de cartón, según volumen`,
              },
              { rotulo: 'Impresión', valor: 'Hasta 3 colores; plantilla troquelada desde 1.000 m²' },
              { rotulo: 'Material', valor: 'Cartón kraft, sin tintas en la cara interna' },
              { rotulo: 'Entrega', valor: 'Stock en 24-48 h; envío gratis hasta 60 km de Quilmes' },
            ]}
            accion={{ texto: 'Ver todos los precios', href: '/precios' }}
          />
        </div>
      </section>

      <section className="py-12 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          {/* Agrupa los h3 que colgaban directo del h1. */}
          <h2 className="sr-only">Por qué estas cajas sirven para gastronomía</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="text-center p-6">
              <div className="inline-flex justify-center w-12 h-12 bg-amber-100 rounded-full mb-4">
                <Pizza className="w-6 h-6 text-[#002E55]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Pizzas y empanadas</h3>
              <p className="text-gray-600 text-sm">Cajas cuadradas, rectangulares. Mantienen temperatura y presentación.</p>
            </div>
            <div className="text-center p-6">
              <div className="inline-flex justify-center w-12 h-12 bg-amber-100 rounded-full mb-4">
                <UtensilsCrossed className="w-6 h-6 text-[#002E55]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Packaging gastronómico</h3>
              <p className="text-gray-600 text-sm">Para restaurantes, catering, delivery. Cartón kraft apto alimento.</p>
            </div>
            <div className="text-center p-6">
              <div className="inline-flex justify-center w-12 h-12 bg-amber-100 rounded-full mb-4">
                <Truck className="w-6 h-6 text-[#002E55]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Entrega rápida en GBA</h3>
              <p className="text-gray-600 text-sm">Producción en Quilmes. Envío gratis zona sur. Entrega en 7-14 días.</p>
            </div>
          </div>

          <section id="cotizador" className="py-8 px-4 bg-gray-50 rounded-xl">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Cotizá tus cajas para alimentos</h2>
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
        titulo="Preguntas frecuentes sobre cajas para gastronomía"
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
            <li><Link href="/mayorista" className="text-[#002E55] hover:underline">Compra por mayor</Link></li>
            <li><Link href="/precios" className="text-[#002E55] hover:underline">Precios por volumen</Link></li>
            <li><Link href="/cajas" className="text-[#002E55] hover:underline">Comprar desde {MIN} cajas</Link></li>
            <li><Link href="/faq" className="text-[#002E55] hover:underline">Todas las preguntas</Link></li>
          </ul>
        </div>
      </nav>

      <LandingFooter />
      <CtaMovilFijo mensajeWhatsapp="Hola, quiero cotizar cajas para mi local gastronómico." />
    </div>
  );
}
