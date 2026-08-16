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
import { Package, Truck, Shield, ArrowRight } from 'lucide-react';
import { trackEvent } from '@/lib/utils/tracking';
import { RETAIL_CONFIG } from '@/lib/retail/config';

const MIN = RETAIL_CONFIG.MIN_CANTIDAD;

/**
 * El H1 dice algo distinto del title a proposito. El title compite por
 * "cajas para e-commerce"; el H1 va por como lo escribe alguien que ya tiene
 * la tienda armada y busca proveedor. Repetir la misma frase en los dos
 * lugares gasta el encabezado mas importante de la pagina en no agregar nada.
 */
const PREGUNTAS = [
  {
    pregunta: '¿Cuál es la cantidad mínima para pedir cajas de e-commerce?',
    respuesta:
      `Desde ${MIN} cajas si la medida está en catálogo y sale de stock. ` +
      `Para una medida propia fabricada a pedido el mínimo es de 3.000 m² por modelo, ` +
      `que en una caja chica de envíos equivale a varios miles de unidades.`,
  },
  {
    pregunta: '¿Cuánto sale una caja para envíos?',
    respuesta:
      `El precio se calcula por metro cuadrado de cartón, así que depende de la medida. ` +
      `Va de $${RETAIL_CONFIG.VOLUME_PRICE_PER_M2} por m² en pedidos de volumen a ` +
      `$${RETAIL_CONFIG.RETAIL_PRICE_PER_M2} por m² en pedidos chicos. ` +
      `El cotizador da el precio exacto de tu medida al instante, sin dejar datos.`,
  },
  {
    pregunta: '¿Las cajas sirven para Correo Argentino y Mercado Envíos?',
    respuesta:
      'Sí. Al ser a medida se fabrican dentro de las dimensiones que acepta cada operador, ' +
      'y ajustar la caja al producto baja el peso volumétrico, que es lo que se factura ' +
      'cuando la caja es más grande que lo que lleva adentro.',
  },
  {
    pregunta: '¿Puedo imprimir mi logo en las cajas?',
    respuesta:
      'Sí, impresión flexográfica de hasta 3 colores. A partir de 1.000 m² generamos el ' +
      'archivo troquelado con las medidas exactas de tu caja para que tu diseñador arme ' +
      'el arte sobre esa plantilla.',
  },
  {
    pregunta: '¿Cuánto tarda la entrega?',
    respuesta:
      'Lo que está en stock sale en 24 a 48 horas. La producción a medida demora 7 días ' +
      'hábiles. El envío es gratis hasta 60 km de la fábrica en Quilmes y llega a todo el país.',
  },
];

export default function CajasEcommercePage() {
  useEffect(() => {
    trackEvent('product_page_view', { section: 'cajas-ecommerce' });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      <section className="bg-gradient-to-br from-blue-50 to-slate-100 px-4 pb-12 pt-24">
        <div className="mx-auto max-w-7xl text-center">
          <h1 className="mb-6 text-4xl font-bold text-gray-900 md:text-5xl">
            Cajas de cartón a medida para{' '}
            <span className="text-[#002E55]">tu tienda online</span>
          </h1>
          <p className="mx-auto mb-6 max-w-2xl text-xl text-gray-600">
            Packaging profesional para e-commerce. Medidas compatibles con correo y
            mensajería, ajustadas a tu producto para que no pagues envío por aire.
          </p>

          {/* El CTA va antes del resumen y del contenido largo: quien ya sabe
              lo que quiere no deberia tener que bajar para actuar. */}
          <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#cotizador"
              onClick={() => trackEvent('quote_started', { source: 'hero_ecommerce' })}
              className="inline-flex items-center gap-2 rounded-lg bg-[#002E55] px-6 py-3 font-medium text-white transition-colors hover:bg-[#001a33]"
            >
              Cotizar mis cajas
              <ArrowRight className="h-4 w-4" />
            </a>
            <BotonCompartir
              titulo="Cajas de cartón a medida para e-commerce"
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
              { rotulo: 'Plazo', valor: 'Stock en 24-48 h, producción a medida en 7 días hábiles' },
              { rotulo: 'Impresión', valor: 'Hasta 3 colores, con plantilla troquelada desde 1.000 m²' },
              { rotulo: 'Envío', valor: 'Gratis hasta 60 km de Quilmes; a todo el país con costo' },
            ]}
            accion={{ texto: 'Ver todos los precios', href: '/precios' }}
          />
        </div>
      </section>

      <section className="bg-white px-4 py-12">
        <div className="mx-auto max-w-7xl">
          {/* Un h2 que agrupa las tres tarjetas. Sin el, los h3 colgaban
              directo del h1 y la jerarquia saltaba un nivel. */}
          <h2 className="sr-only">Por qué comprar acá tus cajas de e-commerce</h2>
          <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="p-6 text-center">
              <div className="mb-4 inline-flex h-12 w-12 justify-center rounded-full bg-blue-100">
                <Package className="h-6 w-6 self-center text-[#002E55]" />
              </div>
              <h3 className="mb-2 font-semibold text-gray-900">Medidas a tu gusto</h3>
              <p className="text-sm text-gray-600">
                Cajas que encajan perfecto con tus productos. Menos material, menos costo
                de envío.
              </p>
            </div>
            <div className="p-6 text-center">
              <div className="mb-4 inline-flex h-12 w-12 justify-center rounded-full bg-blue-100">
                <Truck className="h-6 w-6 self-center text-[#002E55]" />
              </div>
              <h3 className="mb-2 font-semibold text-gray-900">Envíos a todo el país</h3>
              <p className="text-sm text-gray-600">
                Compatible con Correo Argentino y mensajerías. Envío gratis en zona sur GBA.
              </p>
            </div>
            <div className="p-6 text-center">
              <div className="mb-4 inline-flex h-12 w-12 justify-center rounded-full bg-blue-100">
                <Shield className="h-6 w-6 self-center text-[#002E55]" />
              </div>
              <h3 className="mb-2 font-semibold text-gray-900">Experiencia de unboxing</h3>
              <p className="text-sm text-gray-600">
                Impresión opcional para tu marca. Tus clientes reciben packaging profesional.
              </p>
            </div>
          </div>

          <section id="cotizador" className="rounded-xl bg-gray-50 px-4 py-8">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-2 text-center text-2xl font-bold text-gray-900">
                Cotizá tus cajas para envíos
              </h2>
              <p className="mb-6 text-center text-gray-600">
                Ingresá medidas y cantidad. Precio al instante.
              </p>
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
        titulo="Preguntas frecuentes sobre cajas para e-commerce"
        className="bg-gray-50"
      />

      {/* Interlinking: las landings hermanas y las paginas de conversion.
          Antes esta pagina solo enlazaba al home, asi que quedaba como una
          hoja suelta en vez de parte de un cluster. */}
      <nav aria-label="Páginas relacionadas" className="px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-4 text-center text-lg font-semibold text-gray-900">
            Otros usos y secciones
          </h2>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <li>
              <Link href="/cajas-mudanza" className="text-[#002E55] hover:underline">
                Cajas para mudanza
              </Link>
            </li>
            <li>
              <Link href="/cajas-alimentos" className="text-[#002E55] hover:underline">
                Cajas para delivery y gastronomía
              </Link>
            </li>
            <li>
              <Link href="/mayorista" className="text-[#002E55] hover:underline">
                Compra por mayor
              </Link>
            </li>
            <li>
              <Link href="/precios" className="text-[#002E55] hover:underline">
                Precios por volumen
              </Link>
            </li>
            <li>
              <Link href="/cajas" className="text-[#002E55] hover:underline">
                Comprar desde {MIN} cajas
              </Link>
            </li>
            <li>
              <Link href="/faq" className="text-[#002E55] hover:underline">
                Todas las preguntas
              </Link>
            </li>
          </ul>
        </div>
      </nav>

      <LandingFooter />
      <CtaMovilFijo mensajeWhatsapp="Hola, quiero cotizar cajas para mi tienda online." />
    </div>
  );
}
