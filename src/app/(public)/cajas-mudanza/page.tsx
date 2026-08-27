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
import { Package, Shield, Move, ArrowRight } from 'lucide-react';
import { trackEvent } from '@/lib/utils/tracking';
import { RETAIL_CONFIG, ENVIO } from '@/lib/retail/config';


const PREGUNTAS = [
  {
    pregunta: '¿Qué medida de caja conviene para una mudanza?',
    respuesta:
      'Para libros y objetos pesados conviene una caja chica, de 40x30x30 cm, porque una ' +
      'grande llena de libros no se puede levantar. Para ropa y acolchados, 60x40x40 cm o ' +
      'más. Fabricamos hasta 1.200 mm de ancho de plancha, que es el límite de la bobina.',
  },
  {
    pregunta: '¿Cuántas cajas necesito para mudar una casa?',
    respuesta:
      'Como referencia práctica: un monoambiente ronda las 20 a 30 cajas, un dos ambientes ' +
      'entre 40 y 60, y una casa de familia entre 80 y 150. Conviene sumar un 15% de margen: ' +
      'siempre falta al final y una caja de más cuesta menos que un viaje de más.',
  },
  {
    pregunta: '¿Cuál es el mínimo de compra?',
    respuesta:
      `${RETAIL_CONFIG.MIN_M2_PEDIDO} m² de cartón si la medida sale de catálogo — el mínimo se ` +
      `mide en superficie, no en cantidad de cajas. Para empresas de mudanza y guardamuebles ` +
      `que piden por volumen, desde ${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m² se fabrica ` +
      `a medida, y de ahí en adelante el precio por m² baja por tramos.`,
  },
  {
    pregunta: '¿Qué cartón usan? ¿Aguanta objetos frágiles?',
    respuesta:
      'Corrugado onda C para uso general y doble onda BC cuando hay que apilar o proteger ' +
      'objetos frágiles. La doble onda tiene dos capas de ondulado y resiste bastante más ' +
      'peso de estiba, que es lo que importa cuando las cajas van una arriba de otra.',
  },
  {
    pregunta: '¿Hacen envíos y cuánto tardan?',
    respuesta:
      ENVIO.largo + ' ' +
      'Lo que está en stock sale en 24 a 48 horas; la producción a medida demora 7 días hábiles.',
  },
];

export default function CajasMudanzaPage() {
  useEffect(() => {
    trackEvent('product_page_view', { section: 'cajas-mudanza' });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      <section className="pt-24 pb-16 px-4 bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-7xl mx-auto text-center">
          {/* Distinto del title ("Cajas para Mudanza") a proposito: apunta a
              como lo busca alguien que se esta por mudar y no a la categoria. */}
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Cajas de cartón resistentes para{' '}
            <span className="text-[#002E55]">mudanzas y guardamuebles</span>
          </h1>
          <p className="text-xl text-gray-600 mb-6 max-w-2xl mx-auto">
            Cartón corrugado onda C y doble onda BC, en la medida que necesites. Para
            mudanzas de casa y para empresas que piden por volumen.
          </p>
          <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#cotizador"
              onClick={() => trackEvent('quote_started', { source: 'hero_mudanza' })}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#002E55] hover:bg-[#001a33] text-white font-medium rounded-lg transition-colors"
            >
              Cotizar cajas
              <ArrowRight className="w-4 h-4" />
            </a>
            <BotonCompartir
              titulo="Cajas de cartón para mudanza a medida"
              texto="Cotizador online con precio al instante, fábrica en Quilmes."
            />
          </div>

          <ResumenClave
            puntos={[
              {
                rotulo: 'Mínimo',
                valor: `${RETAIL_CONFIG.MIN_M2_PEDIDO} m² de cartón en medidas de catálogo, o ${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m² a medida`,
              },
              {
                rotulo: 'Precio',
                valor: `De $${RETAIL_CONFIG.VOLUME_PRICE_PER_M2} a $${RETAIL_CONFIG.RETAIL_PRICE_PER_M2} por m² de cartón, según volumen`,
              },
              {
                rotulo: 'Medidas',
                valor:
                  'A pedido: hasta 1.200 mm de ancho de plancha, y largo + ancho hasta ' +
                  '2.000 mm (las más grandes se fabrican en dos mitades pegadas)',
              },
              { rotulo: 'Cartón', valor: 'Onda C para uso general, doble onda BC para apilar y frágiles' },
              { rotulo: 'Envío', valor: ENVIO.corto },
            ]}
            accion={{ texto: 'Ver todos los precios', href: '/precios' }}
          />
        </div>
      </section>

      <section className="py-12 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          {/* Agrupa los h3 que colgaban directo del h1, saltandose un nivel. */}
          <h2 className="sr-only">Por qué estas cajas sirven para mudanza</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="text-center p-6">
              <div className="inline-flex justify-center w-12 h-12 bg-slate-100 rounded-full mb-4">
                <Package className="w-6 h-6 text-[#002E55]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Medidas grandes</h3>
              <p className="text-gray-600 text-sm">Cajas hasta 1.200 mm de ancho. Ideales para muebles, electrodomésticos, libros.</p>
            </div>
            <div className="text-center p-6">
              <div className="inline-flex justify-center w-12 h-12 bg-slate-100 rounded-full mb-4">
                <Shield className="w-6 h-6 text-[#002E55]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Resistentes</h3>
              <p className="text-gray-600 text-sm">Cartón corrugado onda C y doble onda BC. Protección para objetos frágiles.</p>
            </div>
            <div className="text-center p-6">
              <div className="inline-flex justify-center w-12 h-12 bg-slate-100 rounded-full mb-4">
                <Move className="w-6 h-6 text-[#002E55]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Mudanzas y guardamuebles</h3>
              <p className="text-gray-600 text-sm">Empresas de mudanzas, guardamuebles, almacenamiento. Pedidos por volumen.</p>
            </div>
          </div>

          <section id="cotizador" className="py-8 px-4 bg-gray-50 rounded-xl">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Cotizá cajas para mudanza</h2>
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
        titulo="Preguntas frecuentes sobre cajas para mudanza"
        className="bg-gray-50"
      />

      {/* Antes esta pagina solo enlazaba al home: quedaba como hoja suelta en
          vez de formar parte de un cluster de intenciones. */}
      <nav aria-label="Páginas relacionadas" className="px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-4 text-center text-lg font-semibold text-gray-900">
            Otros usos y secciones
          </h2>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <li><Link href="/cajas-ecommerce" className="text-[#002E55] hover:underline">Cajas para e-commerce</Link></li>
            <li><Link href="/mayorista" className="text-[#002E55] hover:underline">Compra por mayor</Link></li>
            <li><Link href="/precios" className="text-[#002E55] hover:underline">Precios por volumen</Link></li>
            <li><Link href="/cajas" className="text-[#002E55] hover:underline">Comprar desde {RETAIL_CONFIG.MIN_M2_PEDIDO} m²</Link></li>
            <li><Link href="/faq" className="text-[#002E55] hover:underline">Todas las preguntas</Link></li>
          </ul>
        </div>
      </nav>

      <LandingFooter />
      <CtaMovilFijo mensajeWhatsapp="Hola, quiero cotizar cajas para una mudanza." />
    </div>
  );
}
