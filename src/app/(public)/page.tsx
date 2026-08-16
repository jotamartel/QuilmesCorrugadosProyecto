'use client';

import { useEffect } from 'react';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { QuoterForm } from '@/components/public/QuoterForm';
import { CotizarSinJavaScript } from '@/components/public/CotizarSinJavaScript';
import { ResumenClave } from '@/components/public/ResumenClave';
import { PreguntasFrecuentes } from '@/components/public/PreguntasFrecuentes';
import { CtaMovilFijo } from '@/components/public/CtaMovilFijo';
import { BotonCompartir } from '@/components/public/BotonCompartir';
import Link from 'next/link';
import { Factory, Truck, Ruler, Palette, ArrowDown, ShoppingBag } from 'lucide-react';
import { trackEvent } from '@/lib/utils/tracking';
import { RETAIL_CONFIG } from '@/lib/retail/config';

const benefits = [
  {
    icon: Factory,
    title: 'Fábrica propia',
    description: 'Producimos todo en nuestra fábrica',
  },
  {
    icon: Truck,
    title: 'Envíos a todo el país',
    description: 'Envío gratis hasta 60 km',
  },
  {
    icon: Ruler,
    title: 'Pedido mínimo',
    description: '3.000 m² por modelo de caja',
  },
  {
    icon: Palette,
    title: 'Impresión',
    description: 'Hasta 3 colores con tu diseño',
  },
];

export default function LandingPage() {
  // Trackear vista de landing page
  useEffect(() => {
    trackEvent('landing_page_view');
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      {/* Hero Section */}
      <section className="pt-24 pb-16 px-4 bg-gradient-to-br from-blue-50 to-slate-100">
        <div className="max-w-7xl mx-auto text-center">
          {/* El title dice "Fabrica de cajas de carton corrugado a medida".
              El H1 agrega lo que el title no puede: que se cotiza solo y en el
              momento, que es el diferencial y otra forma de buscar. */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
            Cotizá cajas de cartón corrugado
            <span className="text-[#002E55]"> a medida, al instante</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Cotizá online en segundos. Fábrica en Quilmes, entregas en todo el país.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#cotizador"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#002E55] hover:bg-[#001a33] text-white font-medium rounded-lg transition-colors"
            >
              Cotizar ahora
              <ArrowDown className="w-4 h-4" />
            </a>
            <Link
              href="/cajas"
              className="inline-flex items-center gap-2 px-6 py-3 border-2 border-[#002E55] text-[#002E55] hover:bg-[#002E55] hover:text-white font-medium rounded-lg transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              Compra Minorista
            </Link>
          </div>
          <p className="mt-4 text-sm text-gray-500">
            Mayorista: mín 3.000 m² · Minorista: desde {RETAIL_CONFIG.MIN_CANTIDAD} cajas
          </p>
          {/* El precio en el texto visible del home.
              Un asistente de IA que entra acá leía la página entera sin
              encontrar un solo número, así que estimaba con precios de la
              competencia. Ahora se lleva el dato de una. */}
          <p className="mt-2 text-sm text-gray-600">
            El m² va de{' '}
            <strong>${RETAIL_CONFIG.VOLUME_PRICE_PER_M2}</strong> por volumen a{' '}
            <strong>${RETAIL_CONFIG.RETAIL_PRICE_PER_M2}</strong> en pedidos chicos.{' '}
            <Link href="/precios" className="text-[#002E55] underline underline-offset-2">
              Ver todos los precios
            </Link>
          </p>

          <div className="mt-6 flex justify-center">
            <BotonCompartir
              titulo="Quilmes Corrugados — cajas de cartón a medida"
              texto="Cotizador online con precio al instante, fábrica en Quilmes."
            />
          </div>

          <ResumenClave
            className="mt-8"
            puntos={[
              {
                rotulo: 'Qué hacemos',
                valor: 'Fabricamos cajas de cartón corrugado a medida en Quilmes, Buenos Aires, desde hace más de 20 años.',
              },
              {
                rotulo: 'Precio',
                valor: `De $${RETAIL_CONFIG.VOLUME_PRICE_PER_M2} a $${RETAIL_CONFIG.RETAIL_PRICE_PER_M2} por m² de cartón, según el volumen. Publicado, sin pedir datos.`,
              },
              {
                rotulo: 'Mínimos',
                valor: `${RETAIL_CONFIG.MIN_CANTIDAD} cajas si sale de stock; 3.000 m² por modelo para producción a medida.`,
              },
              {
                rotulo: 'Plazos',
                valor: 'Stock en 24 a 48 horas. Producción a medida en 7 días hábiles.',
              },
              {
                rotulo: 'Cómo cotizar',
                valor: 'Online al instante en este sitio, o por API pública y gratuita sin registro.',
              },
            ]}
            accion={{ texto: 'Ver la escalera de precios', href: '/precios' }}
          />
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-12 px-4 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto">
          <h2 className="sr-only">Por qué elegir Quilmes Corrugados</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {benefits.map((benefit) => (
              <div key={benefit.title} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
                  <benefit.icon className="w-6 h-6 text-[#002E55]" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{benefit.title}</h3>
                <p className="text-sm text-gray-500">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quoter Section */}
      <section id="cotizador" className="py-6 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Cotizá tu caja</h2>
            <p className="text-sm text-gray-600">
              Ingresá las dimensiones y cantidad. Obtendrás el precio al instante.
            </p>
          </div>

          <QuoterForm />

          {/* Salida para quien no puede ejecutar el formulario */}
          <div className="mt-4 text-center">
            <CotizarSinJavaScript />
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="nosotros" className="py-16 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Sobre nosotros</h2>
          <p className="text-lg text-gray-600 mb-8">
            Con más de 20 años de experiencia en el rubro, Quilmes Corrugados es una fábrica
            dedicada a la producción de cajas de cartón corrugado a medida. Nos especializamos
            en brindar soluciones de packaging para empresas de todos los tamaños.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-gray-50 rounded-lg p-6">
              <p className="text-3xl font-bold text-[#002E55] mb-2">+20</p>
              <p className="text-gray-600">Años de experiencia</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-6">
              <p className="text-3xl font-bold text-[#002E55] mb-2">+500</p>
              <p className="text-gray-600">Clientes activos</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-6">
              <p className="text-3xl font-bold text-[#002E55] mb-2">Quilmes</p>
              <p className="text-gray-600">Buenos Aires</p>
            </div>
          </div>
        </div>
      </section>

      <PreguntasFrecuentes
        preguntas={[
          {
            pregunta: '¿Cuánto sale una caja de cartón corrugado?',
            respuesta:
              `El precio se calcula por metro cuadrado de cartón, así que depende de la ` +
              `medida y de la cantidad. Va de $${RETAIL_CONFIG.VOLUME_PRICE_PER_M2} por m² ` +
              `en pedidos de volumen a $${RETAIL_CONFIG.RETAIL_PRICE_PER_M2} por m² en ` +
              `pedidos chicos. La escalera completa está publicada en /precios y el ` +
              `cotizador da el número exacto de tu medida al instante, sin dejar datos.`,
          },
          {
            pregunta: '¿Cuál es el pedido mínimo?',
            respuesta:
              `Depende del canal. Si la medida está en catálogo y sale de stock, desde ` +
              `${RETAIL_CONFIG.MIN_CANTIDAD} cajas. Si querés una medida propia fabricada ` +
              `a pedido, el mínimo es 3.000 m² de cartón por modelo de caja.`,
          },
          {
            pregunta: '¿Puedo cotizar sin hablar con un vendedor?',
            respuesta:
              'Sí. El cotizador del sitio da el precio en el momento con las medidas y la ' +
              'cantidad. También hay una API pública y gratuita, sin registro ni API key, ' +
              'para que un sistema de compras o un asistente de IA pida el precio ' +
              'directamente: GET /api/v1/quote.',
          },
          {
            pregunta: '¿Hacen impresión con mi logo?',
            respuesta:
              'Sí, impresión flexográfica de hasta 3 colores. A partir de 1.000 m² generamos ' +
              'el archivo troquelado con las medidas exactas de tu caja para que tu ' +
              'diseñador arme el arte sobre esa plantilla.',
          },
          {
            pregunta: '¿Hacen envíos? ¿Cuánto tardan?',
            respuesta:
              'Envío gratis hasta 60 km de la fábrica en Quilmes y a todo el país con costo ' +
              'de flete. Lo que está en stock sale en 24 a 48 horas; la producción a medida ' +
              'demora 7 días hábiles.',
          },
        ]}
        className="bg-gray-50"
      />

      <LandingFooter />
      <CtaMovilFijo />
    </div>
  );
}
