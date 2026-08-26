'use client';

import { useEffect } from 'react';
import { SITE_URL } from '@/lib/site';
import { MINIMOS } from '@/lib/retail/config';
import Link from 'next/link';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { BreadcrumbSchema, ProductSchema } from '@/components/public/SchemaMarkup';
import { CajasPorRubro } from '@/components/public/CajasPorRubro';
import { Package, Palette, ShoppingBag, Truck, ArrowRight } from 'lucide-react';
import { trackEvent } from '@/lib/utils/tracking';
import { RETAIL_CONFIG } from '@/lib/retail/config';

// Metadata movida - usar generateMetadata si es necesario

const products = [
  {
    icon: Package,
    title: 'Cajas de Cartón Corrugado Estándar',
    slug: 'cajas-medida',
    description: 'Cajas a medida en cartón corrugado onda C, ideales para embalaje, almacenamiento y transporte. Fabricadas con papel kraft marrón o blanco. Disponibles en cualquier medida, ' + MINIMOS.corto + '.',
    features: ['Cartón onda C (4mm)', 'Papel kraft marrón o blanco', 'Cualquier medida personalizada', `Desde ${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m² de cartón`],
  },
  {
    icon: Palette,
    title: 'Cajas Impresas Personalizadas',
    slug: 'cajas-impresas',
    description: 'Cajas con impresión flexográfica de hasta 3 colores. Ideales para branding, identificación de producto e información logística. Mejorá la imagen de tu marca con packaging personalizado.',
    features: ['Impresión flexográfica', 'Hasta 3 colores', 'Logo y diseño personalizado', 'Ideal para branding'],
  },
  {
    icon: ShoppingBag,
    title: 'Cajas para E-commerce y Envíos',
    slug: 'cajas-ecommerce',
    description: 'Cajas diseñadas para el comercio electrónico y envíos por correo. Medidas compatibles con servicios de mensajería. Protección óptima para tus productos en tránsito.',
    features: ['Medidas para correo argentino', 'Protección reforzada', 'Experiencia de unboxing', 'Impresión opcional'],
  },
  {
    icon: Truck,
    title: 'Packaging Industrial y Exportación',
    slug: 'packaging-industrial',
    description: 'Soluciones de embalaje para industria pesada y exportación. Cartón corrugado doble onda (BC) para máxima resistencia. Cajas reforzadas para productos pesados o de alto valor.',
    features: ['Doble onda (BC) extra resistente', 'Para productos pesados', 'Apto exportación', 'Diseño estructural personalizado'],
  },
];

export default function ProductosPage() {
  useEffect(() => {
    // Con section, como el resto de las landings: sin el parámetro esta página
    // quedaba fuera de las audiencias segmentadas por sección.
    trackEvent('product_page_view', { section: 'productos' });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      <BreadcrumbSchema
        items={[
          { name: 'Inicio', url: SITE_URL },
          { name: 'Productos', url: `${SITE_URL}/productos` },
        ]}
      />
      {products.map((product) => (
        <ProductSchema
          key={product.slug}
          name={product.title}
          description={product.description}
          offers={{
            priceCurrency: 'ARS',
            availability: 'https://schema.org/InStock',
            description: `Cotización según dimensiones y cantidad. Mínimo de compra ${RETAIL_CONFIG.MIN_M2_PEDIDO} m² de cartón; a medida desde ${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m².`,
          }}
        />
      ))}

      <main className="pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Cajas de Cartón Corrugado a Medida
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Fabricamos soluciones de packaging en cartón corrugado para empresas de todos los rubros.
              Cada caja se produce a la medida exacta que necesitás.
            </p>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            {products.map((product) => (
              <article
                key={product.slug}
                className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-4">
                  <product.icon className="w-6 h-6 text-[#002E55]" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-3">{product.title}</h2>
                <p className="text-gray-600 mb-4">{product.description}</p>
                <ul className="space-y-2 mb-6">
                  {product.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="w-1.5 h-1.5 bg-[#002E55] rounded-full shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/#cotizador"
                  className="inline-flex items-center gap-2 text-[#002E55] font-semibold hover:underline"
                >
                  Cotizar este producto
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </article>
            ))}
          </div>

          {/* Specs Section */}
          <section className="bg-gray-50 rounded-xl p-8 md:p-12 mb-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
              Especificaciones Técnicas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <h3 className="font-semibold text-gray-900 mb-2">Material</h3>
                <p className="text-gray-600 text-sm">
                  Cartón corrugado onda C (4mm) y doble onda BC. Papel kraft marrón o blanco.
                  Gramajes desde 120g hasta 200g según necesidad.
                </p>
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-gray-900 mb-2">Medidas</h3>
                <p className="text-gray-600 text-sm">
                  {/* Decia "sin límite de medidas... más de 1.200mm", y hay un límite
                      duro: ancho + alto no puede superar el ancho de bobina. Prometer
                      lo que la máquina no hace termina en un pedido que hay que
                      rechazar después de que el cliente ya decidió. */}
                  Cualquier combinación de largo x ancho x alto, dentro de un límite de
                  producción: ancho + alto no puede superar {RETAIL_CONFIG.MAX_SHEET_WIDTH} mm,
                  que es el ancho de la bobina de cartón.
                </p>
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-gray-900 mb-2">Impresión</h3>
                <p className="text-gray-600 text-sm">
                  Flexografía directa sobre cartón. Hasta 3 colores. Resolución estándar
                  industrial. Ideal para logos, textos e información del producto.
                </p>
              </div>
            </div>
          </section>

          {/* Landings por rubro: /productos cataloga por TIPO de caja; esto
              enlaza el corte por USO, que vive en las landings verticales. */}
          <CajasPorRubro className="mb-16 !py-0" />

          {/* CTA */}
          <div className="text-center bg-[#002E55] rounded-xl p-8 md:p-12 text-white">
            <h2 className="text-2xl font-bold mb-3">
              Cotizá tus cajas en segundos
            </h2>
            <p className="text-blue-100 mb-6 max-w-xl mx-auto">
              Ingresá las dimensiones y cantidad en nuestro cotizador online y obtené el precio al instante.
            </p>
            <Link
              href="/#cotizador"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#002E55] font-semibold rounded-lg hover:bg-blue-50 transition-colors"
            >
              Ir al cotizador
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
