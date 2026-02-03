import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { BreadcrumbSchema } from '@/components/public/SchemaMarkup';
import { Phone, Mail, MapPin, Clock, MessageCircle, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contacto | Quilmes Corrugados - Fábrica de Cajas de Cartón',
  description: 'Contactá a Quilmes Corrugados: fábrica de cajas de cartón corrugado en Quilmes, Buenos Aires. Tel: +54 9 11 6924-9801. Email: ventas@quilmescorrugados.com.ar. Lunes a viernes 8 a 17 hs.',
  alternates: {
    canonical: 'https://quilmes-corrugados.vercel.app/contacto',
  },
  openGraph: {
    title: 'Contacto | Quilmes Corrugados',
    description: 'Contactanos para cotizar cajas de cartón corrugado. Fábrica en Quilmes, Buenos Aires.',
    url: 'https://quilmes-corrugados.vercel.app/contacto',
    type: 'website',
  },
};

const WHATSAPP_NUMBER = '5491169249801';

export default function ContactoPage() {
  const whatsappMessage = 'Hola, me interesa cotizar cajas de cartón corrugado.';

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      <BreadcrumbSchema
        items={[
          { name: 'Inicio', url: 'https://quilmes-corrugados.vercel.app' },
          { name: 'Contacto', url: 'https://quilmes-corrugados.vercel.app/contacto' },
        ]}
      />

      <main className="pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Contacto
            </h1>
            <p className="text-lg text-gray-600">
              Estamos para ayudarte con tu proyecto de packaging.
              Contactanos por el canal que prefieras.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {/* Info de contacto */}
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900">Datos de contacto</h2>

              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                  <Phone className="w-5 h-5 text-[#002E55] mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Teléfono</h3>
                    <a href="tel:+5491169249801" className="text-gray-600 hover:text-[#002E55]">
                      +54 9 11 6924-9801
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                  <Mail className="w-5 h-5 text-[#002E55] mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Email</h3>
                    <a href="mailto:ventas@quilmescorrugados.com.ar" className="text-gray-600 hover:text-[#002E55]">
                      ventas@quilmescorrugados.com.ar
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                  <MapPin className="w-5 h-5 text-[#002E55] mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Ubicación</h3>
                    <p className="text-gray-600">Quilmes, Buenos Aires, Argentina</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                  <Clock className="w-5 h-5 text-[#002E55] mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Horario de atención</h3>
                    <p className="text-gray-600">Lunes a viernes de 8:00 a 17:00 hs</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Acciones rápidas */}
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900">Contacto rápido</h2>

              <div className="space-y-4">
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                >
                  <MessageCircle className="w-6 h-6 text-green-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-green-900">WhatsApp</p>
                    <p className="text-sm text-green-700">Respuesta inmediata en horario laboral</p>
                  </div>
                </a>

                <a
                  href="mailto:ventas@quilmescorrugados.com.ar?subject=Consulta%20cajas%20de%20cart%C3%B3n"
                  className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Mail className="w-6 h-6 text-blue-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-blue-900">Email</p>
                    <p className="text-sm text-blue-700">Respondemos en menos de 24 hs hábiles</p>
                  </div>
                </a>

                <Link
                  href="/#cotizador"
                  className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  <ArrowRight className="w-6 h-6 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-900">Cotizar online</p>
                    <p className="text-sm text-amber-700">Precio al instante, sin esperas</p>
                  </div>
                </Link>
              </div>
            </div>
          </div>

          {/* Zona de envío */}
          <section className="bg-gray-50 rounded-xl p-8 text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Zona de cobertura</h2>
            <p className="text-gray-600 max-w-xl mx-auto">
              Envío gratis dentro de un radio de 60 km desde Quilmes (zona sur GBA, CABA, La Plata).
              Para el resto del país, coordinamos transporte con tarifas competitivas.
            </p>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
