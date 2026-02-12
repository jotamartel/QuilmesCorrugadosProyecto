'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { QuoterForm } from '@/components/public/QuoterForm';
import { Package, Shield, Move, ArrowRight } from 'lucide-react';
import { trackEvent } from '@/lib/utils/tracking';

export default function CajasMudanzaPage() {
  useEffect(() => {
    trackEvent('product_page_view', { section: 'cajas-mudanza' });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      <div data-snap-section>
        <div className="h-16" aria-hidden />
        <section className="pt-24 pb-16 px-4 bg-gradient-to-br from-slate-50 to-slate-100 -mt-16">
          <div className="max-w-7xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Cajas para <span className="text-[#002E55]">Mudanza</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Cajas resistentes para mudanzas y guardamuebles. Cartón corrugado de alta calidad. Medidas personalizadas.
            </p>
            <a
              href="#cotizador"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#002E55] hover:bg-[#001a33] text-white font-medium rounded-lg transition-colors"
            >
              Cotizar cajas
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </section>
      </div>

      <section className="py-12 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
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
