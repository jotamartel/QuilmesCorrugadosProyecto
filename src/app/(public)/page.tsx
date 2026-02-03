'use client';

import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { WhatsAppButton } from '@/components/public/WhatsAppButton';
import { QuoterForm } from '@/components/public/QuoterForm';
import { Factory, Truck, Ruler, Palette, ArrowDown } from 'lucide-react';

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
  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      {/* Hero Section */}
      <section className="pt-24 pb-16 px-4 bg-gradient-to-br from-blue-50 to-slate-100">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
            Cajas de cartón corrugado
            <span className="text-[#002E55]"> a medida</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Cotizá online en segundos. Fábrica en Quilmes, entregas en todo el país.
          </p>
          <a
            href="#cotizador"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#002E55] hover:bg-[#001a33] text-white font-medium rounded-lg transition-colors"
          >
            Cotizar ahora
            <ArrowDown className="w-4 h-4" />
          </a>
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
      <section id="cotizador" className="py-16 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Cotizá tu caja</h2>
            <p className="text-gray-600">
              Ingresá las dimensiones y cantidad. Obtendrás el precio al instante.
            </p>
          </div>

          <QuoterForm />
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

      <LandingFooter />
      <WhatsAppButton />
    </div>
  );
}
