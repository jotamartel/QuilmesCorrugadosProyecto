'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { FAQSchema, BreadcrumbSchema } from '@/components/public/SchemaMarkup';
import { ChevronDown } from 'lucide-react';
import { trackEvent } from '@/lib/utils/tracking';

// Metadata movida - usar generateMetadata si es necesario

const faqs = [
  {
    question: '¿Cuál es el pedido mínimo de cajas?',
    answer: 'El pedido mínimo es de 3.000 m² de cartón por modelo de caja. Esto equivale aproximadamente a 1.000-5.000 cajas dependiendo del tamaño. Por ejemplo, una caja de 400x300x300mm requiere un pedido mínimo de aproximadamente 2.800 unidades.',
  },
  {
    question: '¿Hacen envíos a todo el país?',
    answer: 'Sí, realizamos envíos a toda la Argentina. El envío es gratis dentro de un radio de 60 km desde nuestra fábrica en Quilmes (zona sur del Gran Buenos Aires). Para envíos a mayor distancia o al interior del país, coordinamos el transporte con tarifas competitivas.',
  },
  {
    question: '¿Cuánto tardan en entregar un pedido?',
    answer: 'El tiempo de entrega depende del volumen del pedido y si incluye impresión. Generalmente, un pedido estándar sin impresión se entrega en 7-10 días hábiles. Con impresión flexográfica, el plazo es de 10-15 días hábiles. Al cotizar online, el sistema te indica el plazo estimado para tu pedido.',
  },
  {
    question: '¿Puedo imprimir mi logo en las cajas?',
    answer: 'Sí, ofrecemos impresión flexográfica de hasta 3 colores directamente sobre el cartón corrugado. Podés enviar tu diseño o logo y lo adaptamos a las medidas de la caja. La impresión es ideal para branding, información del producto, instrucciones de manipulación o datos de contacto.',
  },
  {
    question: '¿Qué tipos de cartón corrugado manejan?',
    answer: 'Trabajamos principalmente con cartón corrugado onda C (4mm de espesor), que es el estándar para la mayoría de las aplicaciones. También ofrecemos cartón corrugado doble (onda BC) para productos más pesados que requieren mayor resistencia. El papel kraft puede ser marrón o blanco según la necesidad.',
  },
  {
    question: '¿Cuánto cuesta una caja de cartón corrugado?',
    answer: 'El precio depende de las dimensiones, la cantidad, si lleva impresión y el tipo de cartón. Podés obtener un precio al instante usando nuestro cotizador online. A modo de referencia, el precio se calcula por metro cuadrado de cartón utilizado, con descuentos por volumen.',
  },
  {
    question: '¿Hacen cajas para e-commerce?',
    answer: 'Sí, fabricamos cajas especialmente diseñadas para e-commerce y envíos por correo. Ofrecemos medidas compatibles con los estándares de correo argentino y servicios de mensajería. Las cajas pueden incluir impresión de tu marca para mejorar la experiencia de unboxing.',
  },
  {
    question: '¿Cuál es la diferencia entre corrugado y microcorrugado?',
    answer: 'El cartón corrugado (onda C, 4mm) es más resistente y se usa para embalaje, transporte y protección de productos. El microcorrugado (onda E, 1.5mm) es más delgado y se usa para estuches, exhibidores y packaging premium de menor peso. Nosotros nos especializamos en cartón corrugado.',
  },
  {
    question: '¿Puedo cotizar online?',
    answer: 'Sí, nuestro cotizador online te permite obtener un precio al instante. Solo necesitás ingresar las dimensiones de la caja (largo, ancho y alto en milímetros), la cantidad, y si querés impresión. El sistema calcula automáticamente el precio con IVA incluido y el plazo de entrega estimado.',
  },
  {
    question: '¿Dónde están ubicados?',
    answer: 'Nuestra fábrica está ubicada en Quilmes, zona sur del Gran Buenos Aires, Argentina. Contamos con planta propia de producción donde fabricamos todas nuestras cajas. Podés visitarnos de lunes a viernes de 8:00 a 17:00 hs.',
  },
  {
    question: '¿Trabajan con empresas de todo tipo?',
    answer: 'Sí, trabajamos con empresas de todos los rubros: alimentos, e-commerce, industria, logística, exportación, cosmética, electrónica y más. Nos adaptamos a las necesidades específicas de cada sector para ofrecer la mejor solución de packaging.',
  },
  {
    question: '¿Qué formas de pago aceptan?',
    answer: 'Aceptamos transferencia bancaria, cheques y efectivo. Para nuevos clientes, el primer pedido requiere un 50% de seña al confirmar la orden. Clientes habituales pueden acceder a condiciones de pago especiales.',
  },
];

export default function FAQPage() {
  useEffect(() => {
    trackEvent('faq_viewed');
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      <FAQSchema items={faqs} />
      <BreadcrumbSchema
        items={[
          { name: 'Inicio', url: 'https://quilmes-corrugados.vercel.app' },
          { name: 'Preguntas Frecuentes', url: 'https://quilmes-corrugados.vercel.app/faq' },
        ]}
      />

      <main className="pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-center">
            Preguntas Frecuentes
          </h1>
          <p className="text-lg text-gray-600 text-center mb-12">
            Todo lo que necesitás saber sobre nuestras cajas de cartón corrugado
          </p>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <details
                key={index}
                className="group border border-gray-200 rounded-lg overflow-hidden"
              >
                <summary className="flex items-center justify-between cursor-pointer p-5 bg-white hover:bg-gray-50 transition-colors">
                  <h2 className="text-base font-semibold text-gray-900 pr-4">
                    {faq.question}
                  </h2>
                  <ChevronDown className="w-5 h-5 text-gray-400 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-5 pb-5">
                  <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
                </div>
              </details>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-12 text-center bg-blue-50 rounded-xl p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              ¿No encontraste lo que buscabas?
            </h2>
            <p className="text-gray-600 mb-6">
              Cotizá tu caja online al instante o contactanos para una consulta personalizada.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/#cotizador"
                className="inline-flex items-center justify-center px-6 py-3 bg-[#002E55] hover:bg-[#001a33] text-white font-medium rounded-lg transition-colors"
              >
                Cotizar online
              </Link>
              <Link
                href="/#contacto"
                className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 hover:border-gray-400 text-gray-700 font-medium rounded-lg transition-colors"
              >
                Contactar
              </Link>
            </div>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
