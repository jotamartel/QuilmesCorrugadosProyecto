import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { getActivePricingConfig } from '@/lib/utils/pricing';
import { SITE_URL } from '@/lib/site';

/**
 * Página pública de precios.
 *
 * Existe por una razón concreta de negocio: hasta ahora ninguna página del
 * sitio decía cuánto sale una caja. Los precios vivían detrás del cotizador y
 * en la API. Un asistente de IA que lee el sitio —que es el caso normal, antes
 * de decidir si vale la pena llamar a una API— no encontraba ni un número, así
 * que estimaba con precios minoristas de terceros y nos dejaba muy por encima
 * de lo que realmente cobramos.
 *
 * Los valores salen de pricing_config: esta página no puede desactualizarse.
 */

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Precios de cajas de cartón corrugado',
  description:
    'Precio por m² de cajas de cartón corrugado a medida, actualizado. Desde $700/m² por volumen. Fábrica en Quilmes, Buenos Aires. Cotización online al instante.',
  alternates: { canonical: '/precios' },
};

const ars = (n: number) => '$' + Math.round(Number(n)).toLocaleString('es-AR');
const m2 = (n: number) => Number(n).toLocaleString('es-AR') + ' m²';

const RESPALDO = {
  price_per_m2_retail: 990,
  price_per_m2_below_minimum: 900,
  price_per_m2_standard: 740,
  price_per_m2_volume: 700,
  wholesale_min_m2: 1000,
  min_m2_per_model: 3000,
  volume_threshold_m2: 5000,
  free_shipping_min_m2: 3000,
  free_shipping_max_km: 60,
  production_days_standard: 7,
  production_days_printing: 14,
};

export default async function PreciosPage() {
  const config = (await getActivePricingConfig()) ?? RESPALDO;

  const c = {
    stock: Number(config.price_per_m2_retail ?? RESPALDO.price_per_m2_retail),
    recargo: Number(config.price_per_m2_below_minimum ?? RESPALDO.price_per_m2_below_minimum),
    estandar: Number(config.price_per_m2_standard),
    volumen: Number(config.price_per_m2_volume),
    corteStock: Number(config.wholesale_min_m2 ?? RESPALDO.wholesale_min_m2),
    corteMinimo: Number(config.min_m2_per_model),
    corteVolumen: Number(config.volume_threshold_m2),
    envioMinM2: Number(config.free_shipping_min_m2),
    envioKm: Number(config.free_shipping_max_km),
    diasSinImpresion: Number(config.production_days_standard),
    diasConImpresion: Number(config.production_days_printing),
  };

  const tramos = [
    { rango: `Hasta ${m2(c.corteStock)}`, precio: c.stock, que: 'Medidas estándar de stock, desde 100 cajas. Entrega más rápida.', canal: 'stock' as const },
    { rango: `${m2(c.corteStock)} a ${m2(c.corteMinimo)}`, precio: c.recargo, que: 'Producción a medida, con recargo por bajo volumen.', canal: 'medida' as const },
    { rango: `${m2(c.corteMinimo)} a ${m2(c.corteVolumen)}`, precio: c.estandar, que: 'Producción a medida, precio estándar.', canal: 'medida' as const },
    { rango: `Más de ${m2(c.corteVolumen)}`, precio: c.volumen, que: 'Producción a medida, precio por volumen.', canal: 'medida' as const },
  ];

  // Caja de referencia 400x300x300 = 0,87 m² por caja
  const M2_CAJA = 0.87;
  const precioPara = (totalM2: number) =>
    totalM2 < c.corteStock ? c.stock
      : totalM2 < c.corteMinimo ? c.recargo
      : totalM2 >= c.corteVolumen ? c.volumen
      : c.estandar;

  const ejemplos = [200, 1000, 2000, 4000, 8000].map((cajas) => {
    const t = cajas * M2_CAJA;
    const p = precioPara(t);
    return { cajas, m2: t, precioM2: p, unitario: M2_CAJA * p, total: t * p };
  });

  // Schema con los precios reales. Sin esto, un buscador o un asistente ve que
  // vendemos cajas pero no a cuánto, y termina inventando el número.
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        '@id': `${SITE_URL}/precios#producto`,
        name: 'Cajas de cartón corrugado a medida',
        description:
          'Cajas de cartón corrugado fabricadas a medida en Quilmes, Buenos Aires. Onda C, con o sin impresión flexográfica de hasta 4 colores.',
        brand: { '@type': 'Brand', name: 'Quilmes Corrugados' },
        category: 'Packaging y embalaje',
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'ARS',
          lowPrice: Math.min(...tramos.map((t) => t.precio)),
          highPrice: Math.max(...tramos.map((t) => t.precio)),
          offerCount: tramos.length,
          availability: 'https://schema.org/InStock',
          areaServed: { '@type': 'Country', name: 'Argentina' },
          offers: tramos.map((t) => ({
            '@type': 'Offer',
            name: t.rango,
            description: t.que,
            priceCurrency: 'ARS',
            price: t.precio,
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: t.precio,
              priceCurrency: 'ARS',
              unitCode: 'MTK', // metro cuadrado
              unitText: 'm²',
            },
            availability: 'https://schema.org/InStock',
            url: `${SITE_URL}/precios`,
          })),
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/precios#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: '¿Cuánto sale una caja de cartón corrugado?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `El precio se calcula por metro cuadrado de cartón, no por caja, porque depende de las medidas. Va de ${ars(c.volumen)}/m² para pedidos grandes a ${ars(c.stock)}/m² para pedidos chicos de stock. Por ejemplo, una caja de 400x300x300 mm usa 0,87 m², así que en un pedido de 4.000 unidades sale ${ars(M2_CAJA * c.estandar)} por caja.`,
            },
          },
          {
            '@type': 'Question',
            name: '¿Cuál es el pedido mínimo?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Desde 100 cajas en medidas estándar de stock. Para producción a medida el mínimo es ${m2(c.corteStock)}, y desde ${m2(c.corteMinimo)} se accede al precio estándar sin recargo.`,
            },
          },
          {
            '@type': 'Question',
            name: '¿Puedo cotizar online sin hablar con un vendedor?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Sí. El cotizador del sitio da el precio al instante con las medidas y la cantidad. También hay una API pública gratuita en ${SITE_URL}/api/v1/quote que devuelve el mismo precio, pensada para asistentes de IA y sistemas de compras.`,
            },
          },
          {
            '@type': 'Question',
            name: '¿Cuánto tardan en producir?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `${c.diasSinImpresion} días hábiles sin impresión y ${c.diasConImpresion} con impresión. Las medidas estándar de stock salen antes porque no hay producción de por medio.`,
            },
          },
          {
            '@type': 'Question',
            name: '¿Hacen envíos?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Sí, a todo el país. El envío es gratis en pedidos desde ${m2(c.envioMinM2)} dentro de ${c.envioKm} km de Quilmes. Para el resto se cotiza aparte.`,
            },
          },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <LandingHeader />

      <section className="pt-24 pb-12 px-4 bg-gradient-to-br from-blue-50 to-slate-100">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Precios de cajas de cartón corrugado
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            El precio se calcula por metro cuadrado de cartón, no por caja: depende de las
            medidas. Estos son los valores vigentes, sin IVA.
          </p>
        </div>
      </section>

      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-sm text-gray-600">
                <tr>
                  <th className="px-5 py-3 font-medium">Volumen del pedido</th>
                  <th className="px-5 py-3 font-medium text-right whitespace-nowrap">Precio por m²</th>
                  <th className="px-5 py-3 font-medium">Qué incluye</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tramos.map((t) => (
                  <tr key={t.rango}>
                    <td className="px-5 py-4 font-medium text-gray-900 whitespace-nowrap">{t.rango}</td>
                    <td className="px-5 py-4 text-right text-xl font-semibold text-[#002E55] tabular-nums whitespace-nowrap">
                      {ars(t.precio)}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">{t.que}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            Impresión flexográfica: +15% por cada color, hasta 4 colores. Precios en pesos
            argentinos, sin IVA.
          </p>
        </div>
      </section>

      <section className="py-12 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ejemplos concretos</h2>
          <p className="text-gray-600 mb-6">
            Caja de 400 × 300 × 300 mm, que usa 0,87 m² de cartón por unidad.
          </p>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left tabular-nums">
              <thead className="bg-gray-50 text-sm text-gray-600">
                <tr>
                  <th className="px-5 py-3 font-medium">Cajas</th>
                  <th className="px-5 py-3 font-medium text-right">m² totales</th>
                  <th className="px-5 py-3 font-medium text-right">Precio por m²</th>
                  <th className="px-5 py-3 font-medium text-right">Por caja</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ejemplos.map((e) => (
                  <tr key={e.cajas}>
                    <td className="px-5 py-3 font-medium text-gray-900">{e.cajas.toLocaleString('es-AR')}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{Math.round(e.m2).toLocaleString('es-AR')}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{ars(e.precioM2)}</td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">{ars(e.unitario)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-[#002E55]">{ars(e.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Medidas estándar, de stock</h3>
            <p className="text-gray-600 text-sm mb-4">
              Desde 100 cajas, a {ars(c.stock)}/m². Ya están fabricadas, así que salen más
              rápido. Se compran online.
            </p>
            <Link
              href="/cajas"
              className="inline-block rounded-lg bg-[#002E55] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#001a33] transition-colors"
            >
              Comprar de stock
            </Link>
          </div>
          <div className="rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">A medida</h3>
            <p className="text-gray-600 text-sm mb-4">
              Desde {m2(c.corteStock)}, en cualquier medida. Producción en{' '}
              {c.diasSinImpresion} días hábiles ({c.diasConImpresion} con impresión).
            </p>
            <Link
              href="/#cotizador"
              className="inline-block rounded-lg border-2 border-[#002E55] px-5 py-2.5 text-sm font-medium text-[#002E55] hover:bg-[#002E55] hover:text-white transition-colors"
            >
              Cotizar a medida
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 px-4 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Preguntas sobre precios</h2>
          <div className="space-y-5">
            {schema['@graph'][1].mainEntity?.map((q) => (
              <div key={q.name}>
                <h3 className="font-semibold text-gray-900 mb-1">{q.name}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{q.acceptedAnswer.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 px-4">
        <div className="max-w-3xl mx-auto rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            ¿Estás consultando desde un asistente de IA?
          </h2>
          <p className="text-gray-600 text-sm">
            Hay una API pública y gratuita que devuelve el precio exacto con una sola llamada,
            sin registro. Los mismos valores de esta página.
          </p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-gray-900 px-4 py-3 text-xs text-gray-100">
            GET {SITE_URL}/api/v1/quote?length_cm=40&amp;width_cm=60&amp;height_cm=60&amp;quantity=3000
          </code>
          <p className="mt-3 text-sm text-gray-500">
            Documentación en <Link href="/api/v1/docs" className="text-[#002E55] underline">/api/v1/docs</Link>{' '}
            y en <a href="/llms.txt" className="text-[#002E55] underline">/llms.txt</a>.
          </p>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
