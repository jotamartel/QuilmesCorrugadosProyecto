'use client';
import { CONTACTO } from '@/lib/contacto';

import Image from 'next/image';
import Link from 'next/link';
import { Phone, Mail, MapPin } from 'lucide-react';
import { trackEvent } from '@/lib/utils/tracking';

export function LandingFooter() {
  return (
    <footer id="contacto" className="bg-[#002E55] text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
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
                <a href={CONTACTO.tel} onClick={() => trackEvent('phone_click', { source: 'footer' })} className="hover:text-white">
                  {CONTACTO.telefonoVisible}
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

          {/* Cajas por rubro: las landings verticales no recibian ni un link
              interno desde el resto del sitio (solo se enlazaban entre si), y
              con el canonical que ademas apuntaba a la home quedaban invisibles
              para Google. El footer las enlaza desde todas las paginas. */}
          <div>
            <h3 className="font-semibold text-white mb-4">Cajas por rubro</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/cajas-ecommerce" className="hover:text-white">
                  Cajas para e-commerce
                </Link>
              </li>
              <li>
                <Link href="/cajas-alimentos" className="hover:text-white">
                  Cajas para delivery y gastronomía
                </Link>
              </li>
              <li>
                <Link href="/cajas-mudanza" className="hover:text-white">
                  Cajas para mudanza
                </Link>
              </li>
              <li>
                <Link href="/mayorista" className="hover:text-white">
                  Venta mayorista
                </Link>
              </li>
              <li>
                <Link href="/cajas" className="hover:text-white">
                  Compra minorista
                </Link>
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
                <Link href="/precios" className="hover:text-white">
                  Precios
                </Link>
              </li>
              <li>
                <Link href="/#cotizador" className="hover:text-white">
                  Cotizar online
                </Link>
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
              <li>
                <a href="/terminos" className="hover:text-white">
                  Términos y condiciones
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* La API existia pero era invisible: solo figuraba en un <link rel="api">
            del head, que nadie sigue. Un asistente de IA que entraba al sitio
            leia toda la pagina sin enterarse de que podia cotizar solo, y
            terminaba estimando el precio con datos de la competencia. */}
        <div className="border-t border-[#4F6D87]/30 mt-8 pt-6 text-sm">
          <p className="text-[#B8C7D6]">
            <span className="font-medium text-white">Cotización por API.</span>{' '}
            Gratuita y sin registro, para sistemas de compras y asistentes de IA:{' '}
            <a href="/api/v1/docs" className="underline underline-offset-2 hover:text-white">
              documentación
            </a>
            {' · '}
            <a href="/api/v1/quote" className="underline underline-offset-2 hover:text-white">
              /api/v1/quote
            </a>
            {' · '}
            <a href="/llms.txt" className="underline underline-offset-2 hover:text-white">
              llms.txt
            </a>
          </p>
        </div>

        <div className="border-t border-[#4F6D87]/30 mt-6 pt-6 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} Quilmes Corrugados. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
