'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { QuoterForm } from '@/components/public/QuoterForm';
import { Package, TrendingDown, Factory, ArrowRight } from 'lucide-react';
import { trackEvent } from '@/lib/utils/tracking';

export default function MayoristaPage() {
  useEffect(() => {
    trackEvent('product_page_view', { section: 'mayorista' });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      <div data-snap-section>
        <div className="h-16" aria-hidden />
        <section className="pt-24 pb-16 px-4 bg-gradient-to-br from-blue-50 to-slate-100 -mt-16">
          <div className="max-w-7xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Cajas de Cartón <span className="text-[#002E55]">por Mayor</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Comprá directo de fábrica. Mejores precios a mayor cantidad. Desde 100 unidades por modelo.
            </p>
            <a
              href="#cotizador"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#002E55] hover:bg-[#001a33] text-white font-medium rounded-lg transition-colors"
            >
              Cotizar ahora
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </section>
      </div>

      <section className="py-12 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
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
              <p className="text-gray-600 text-sm">Desde 3.000 m² precio estándar. Más de 5.000 m² descuento mayorista.</p>
            </div>
            <div className="text-center p-6">
              <div className="inline-flex justify-center w-12 h-12 bg-blue-100 rounded-full mb-4">
                <Package className="w-6 h-6 text-[#002E55]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Desde 100 unidades</h3>
              <p className="text-gray-600 text-sm">Mínimo 100 cajas por modelo. Cantidad flexible según tu necesidad.</p>
            </div>
          </div>

          <section id="cotizador" className="py-8 px-4 bg-gray-50 rounded-xl">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Cotizá por volumen</h2>
              <p className="text-gray-600 text-center mb-6">Ingresá medidas y cantidad. Precio al instante.</p>
              <QuoterForm />
            </div>
          </section>
        </div>
      </section>

      <div className="py-8 text-center">
        <Link href="/" className="text-[#002E55] hover:underline font-medium">
          ← Volver al inicio
        </Link>
      </div>

      <LandingFooter />
    </div>
  );
}
