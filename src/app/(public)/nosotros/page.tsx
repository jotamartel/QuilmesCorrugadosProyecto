import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { BreadcrumbSchema, OrganizationSchema } from '@/components/public/SchemaMarkup';
import { Factory, Users, MapPin, Award, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Sobre Nosotros | Fábrica de Cajas de Cartón en Quilmes',
  description: 'Quilmes Corrugados: +20 años fabricando cajas de cartón corrugado a medida en Quilmes, Buenos Aires. Fábrica propia, +500 clientes activos. Conocé nuestra historia y valores.',
  alternates: {
    canonical: 'https://quilmes-corrugados.vercel.app/nosotros',
  },
  openGraph: {
    title: 'Sobre Quilmes Corrugados | Fábrica de Cartón Corrugado',
    description: '+20 años fabricando cajas de cartón corrugado a medida en Quilmes, Buenos Aires.',
    url: 'https://quilmes-corrugados.vercel.app/nosotros',
    type: 'website',
  },
};

const stats = [
  { value: '+20', label: 'Años de experiencia', icon: Award },
  { value: '+500', label: 'Clientes activos', icon: Users },
  { value: 'Quilmes', label: 'Buenos Aires, Argentina', icon: MapPin },
  { value: '100%', label: 'Producción propia', icon: Factory },
];

const industries = [
  'Alimentos y bebidas',
  'E-commerce y retail',
  'Industria farmacéutica',
  'Electrónica y tecnología',
  'Cosmética y perfumería',
  'Exportación',
  'Logística y distribución',
  'Industria metalúrgica',
];

export default function NosotrosPage() {
  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      <OrganizationSchema />
      <BreadcrumbSchema
        items={[
          { name: 'Inicio', url: 'https://quilmes-corrugados.vercel.app' },
          { name: 'Nosotros', url: 'https://quilmes-corrugados.vercel.app/nosotros' },
        ]}
      />

      <main className="pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-16">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Fábrica de Cajas de Cartón Corrugado en Quilmes
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Más de dos décadas fabricando soluciones de packaging para empresas de toda la Argentina.
            </p>
          </div>

          {/* Nuestra Historia */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Nuestra historia</h2>
            <div className="prose prose-lg text-gray-600 space-y-4">
              <p>
                Quilmes Corrugados nació con una misión clara: ofrecer cajas de cartón corrugado a medida
                de la más alta calidad, con atención personalizada y precios competitivos. Desde nuestra
                fábrica en Quilmes, zona sur del Gran Buenos Aires, abastecemos a empresas de todo el país.
              </p>
              <p>
                A lo largo de más de 20 años, hemos invertido constantemente en tecnología y capacitación
                para mantenernos a la vanguardia de la industria del packaging. Nuestra planta cuenta con
                equipamiento de última generación que nos permite producir cajas de cualquier medida con
                tiempos de entrega competitivos.
              </p>
              <p>
                Hoy, más de 500 empresas confían en nosotros para sus necesidades de embalaje, desde
                pymes que recién comienzan hasta grandes corporaciones con requerimientos complejos de
                packaging industrial y exportación.
              </p>
            </div>
          </section>

          {/* Stats */}
          <section className="mb-16">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {stats.map((stat) => (
                <div key={stat.label} className="bg-gray-50 rounded-lg p-6 text-center">
                  <stat.icon className="w-8 h-8 text-[#002E55] mx-auto mb-3" />
                  <p className="text-2xl font-bold text-[#002E55] mb-1">{stat.value}</p>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Nuestros valores */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Nuestros valores</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-2">Calidad</h3>
                <p className="text-gray-600 text-sm">
                  Utilizamos materias primas de primera calidad y controlamos cada etapa del proceso
                  productivo para garantizar un producto final que cumple con los más altos estándares.
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-2">Compromiso</h3>
                <p className="text-gray-600 text-sm">
                  Cumplimos con los plazos de entrega acordados y brindamos atención personalizada
                  a cada cliente. Tu pedido es nuestra prioridad.
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-2">Innovación</h3>
                <p className="text-gray-600 text-sm">
                  Incorporamos tecnología constantemente. Nuestro cotizador online con visualización 3D
                  es un ejemplo de cómo simplificamos el proceso para nuestros clientes.
                </p>
              </div>
            </div>
          </section>

          {/* Industrias */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Industrias que atendemos</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {industries.map((industry) => (
                <div key={industry} className="bg-blue-50 rounded-lg px-4 py-3 text-center">
                  <p className="text-sm font-medium text-[#002E55]">{industry}</p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <div className="text-center bg-[#002E55] rounded-xl p-8 md:p-12 text-white">
            <h2 className="text-2xl font-bold mb-3">
              Sumate a nuestros +500 clientes
            </h2>
            <p className="text-blue-100 mb-6">
              Cotizá online al instante y descubrí por qué somos la elección de cientos de empresas.
            </p>
            <Link
              href="/#cotizador"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#002E55] font-semibold rounded-lg hover:bg-blue-50 transition-colors"
            >
              Cotizar ahora
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
