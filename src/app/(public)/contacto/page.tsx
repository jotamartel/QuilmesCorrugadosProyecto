'use client';

import { useEffect } from 'react';
import { SITE_URL } from '@/lib/site';
import { ENVIO, HORARIO } from '@/lib/retail/config';
import { CONTACTO } from '@/lib/contacto';
import Link from 'next/link';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { BreadcrumbSchema } from '@/components/public/SchemaMarkup';
import { Phone, Mail, MapPin, Clock, MessageCircle, ArrowRight } from 'lucide-react';
import { trackEvent } from '@/lib/utils/tracking';

const WHATSAPP_NUMBER = CONTACTO.telefonoE164;

export default function ContactoPage() {
  const whatsappMessage = 'Hola, me interesa cotizar cajas de cartón corrugado.';

  // Esta pagina no tiene formulario: es la ficha con telefono, mail y
  // direccion. Disparaba 'contact_form_submitted' al montar, o sea que cada
  // visita entraba como Lead en GA4 y habria entrado como Lead en Meta.
  //
  // No es solo un numero inflado en un panel: la campaña aprende de las
  // conversiones que recibe. Contando visitas como leads, el algoritmo optimiza
  // para traer gente que mira el telefono y se va, y el costo por lead real
  // queda escondido detras de un promedio que no existe.
  //
  // La conversion de verdad en esta pagina es el clic a WhatsApp, al telefono o
  // al mail, que ya se trackean por separado mas abajo.
  useEffect(() => {
    trackEvent('contact_page_view', { page: 'contacto' });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      <BreadcrumbSchema
        items={[
          { name: 'Inicio', url: SITE_URL },
          { name: 'Contacto', url: `${SITE_URL}/contacto` },
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
                    <a 
                      href={CONTACTO.tel} 
                      onClick={() => trackEvent('phone_click')}
                      className="text-gray-600 hover:text-[#002E55]"
                    >
                      {CONTACTO.telefonoVisible}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                  <Mail className="w-5 h-5 text-[#002E55] mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Email</h3>
                    <a 
                      href="mailto:ventas@quilmescorrugados.com.ar" 
                      onClick={() => trackEvent('email_click')}
                      className="text-gray-600 hover:text-[#002E55]"
                    >
                      ventas@quilmescorrugados.com.ar
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                  <MapPin className="w-5 h-5 text-[#002E55] mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Ubicación</h3>
                    <p className="text-gray-600">{CONTACTO.direccion}, Argentina</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                  <Clock className="w-5 h-5 text-[#002E55] mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Horario de atención</h3>
                    <p className="text-gray-600">{HORARIO.texto}</p>
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
                  onClick={() => trackEvent('whatsapp_click', { source: 'contacto_page' })}
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
                  onClick={() => trackEvent('email_click', { source: 'contacto_page' })}
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

          {/* Dónde estamos: el embed clásico de Google Maps del negocio. No usa
              la API de Maps Platform (que factura por carga) ni ninguna key:
              es el iframe gratuito de "Compartir → Insertar un mapa", con la
              ficha del perfil de Google Business y el botón de cómo llegar. */}
          <section className="mb-12" aria-labelledby="mapa-titulo">
            <h2 id="mapa-titulo" className="text-xl font-bold text-gray-900 mb-4">
              Dónde estamos
            </h2>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3279.5!2d-58.2429798!3d-34.7383833!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x95a32ef8f174d295%3A0x27b722dc660e86d7!2sQuilmes%20Corrugados!5e0!3m2!1ses!2sar!4v1756230000000"
                title={`Mapa de Quilmes Corrugados en ${CONTACTO.direccion}`}
                width="100%"
                height="400"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
            <p className="mt-3 text-sm text-gray-600">
              {CONTACTO.direccion}.{' '}
              <a
                href="https://maps.app.goo.gl/yMqqkhtgP1jrZeWN7"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#002E55] hover:underline"
              >
                Abrir en Google Maps
              </a>
            </p>
          </section>

          {/* Zona de envío */}
          <section className="bg-gray-50 rounded-xl p-8 text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Zona de cobertura</h2>
            <p className="text-gray-600 max-w-xl mx-auto">
              {ENVIO.largo}
            </p>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
