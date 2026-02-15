'use client';

import Image from 'next/image';
import { Phone, Mail, MapPin } from 'lucide-react';
import { trackEvent } from '@/lib/utils/tracking';

export function LandingFooter() {
  return (
    <footer id="contacto" className="bg-[#002E55] text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Image
                src="/logo.svg"
                alt="Quilmes Corrugados"
                width={180}
                height={45}
                className="h-10 w-auto brightness-0 invert"
              />
            </div>
            <p className="text-sm">
              Fábrica de cajas de cartón corrugado a medida.
              Más de 20 años de experiencia en el rubro.
            </p>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-white mb-4">Contacto</h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#4F6D87]" />
                <a href="tel:+5491169249801" onClick={() => trackEvent('phone_click', { source: 'footer' })} className="hover:text-white">
                  +54 9 11 6924-9801
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#4F6D87]" />
                <a href="mailto:ventas@quilmescorrugados.com.ar" onClick={() => trackEvent('email_click', { source: 'footer' })} className="hover:text-white">
                  ventas@quilmescorrugados.com.ar
                </a>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#4F6D87]" />
                <span>Quilmes, Buenos Aires</span>
              </li>
            </ul>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-semibold text-white mb-4">Enlaces</h3>
            <ul className="space-y-2">
              <li>
                <a href="/productos" className="hover:text-white">
                  Productos
                </a>
              </li>
              <li>
                <a href="/#cotizador" className="hover:text-white">
                  Cotizar online
                </a>
              </li>
              <li>
                <a href="/nosotros" className="hover:text-white">
                  Sobre nosotros
                </a>
              </li>
              <li>
                <a href="/faq" className="hover:text-white">
                  Preguntas frecuentes
                </a>
              </li>
              <li>
                <a href="/contacto" className="hover:text-white">
                  Contacto
                </a>
              </li>
              <li>
                <a href="/login" className="hover:text-white">
                  Acceso clientes
                </a>
              </li>
              <li>
                <a href="/privacidad" className="hover:text-white">
                  Política de privacidad
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#4F6D87]/30 mt-8 pt-8 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} Quilmes Corrugados. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
