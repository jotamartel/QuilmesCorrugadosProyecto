import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';

export const metadata: Metadata = {
  title: 'Política de Privacidad | Quilmes Corrugados',
  description: 'Política de privacidad de Quilmes Corrugados. Cómo protegemos y utilizamos la información personal de nuestros clientes.',
  alternates: {
    canonical: 'https://quilmescorrugados.com.ar/privacidad',
  },
};

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <nav className="mb-8">
          <Link href="/" className="text-slate-600 hover:text-slate-900 transition-colors">
            ← Volver al inicio
          </Link>
        </nav>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">Política de Privacidad</h1>
        <p className="text-slate-600 mb-10">Última actualización: Febrero 2025</p>

        <div className="prose prose-slate max-w-none space-y-8 text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Responsable del tratamiento</h2>
            <p>
              Quilmes Corrugados, con domicilio en Lugones 219, B1878 Quilmes, Buenos Aires, Argentina, es el responsable del tratamiento de los datos personales que recopilamos a través de nuestro sitio web y canales de contacto.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Datos que recopilamos</h2>
            <p>Recopilamos la información que nos proporcionás voluntariamente cuando:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Completás el formulario de cotización (nombre, email, teléfono, medidas de cajas)</li>
              <li>Envías el formulario de contacto</li>
              <li>Nos contactás por WhatsApp, teléfono o email</li>
              <li>Interactuás con nuestro chat en la web</li>
            </ul>
            <p className="mt-4">
              También recopilamos datos técnicos de forma automática (dirección IP, tipo de navegador, páginas visitadas) para mejorar el funcionamiento del sitio y medir el rendimiento de nuestras campañas publicitarias.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Finalidad del tratamiento</h2>
            <p>Utilizamos tus datos para:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Procesar cotizaciones y gestionar pedidos</li>
              <li>Responder consultas y dar seguimiento comercial</li>
              <li>Enviar información sobre nuestros productos y servicios (con tu consentimiento)</li>
              <li>Mejorar nuestro sitio web y la experiencia del usuario</li>
              <li>Cumplir obligaciones legales y normativas</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Protección de los datos</h2>
            <p>
              Protegemos la información personal mediante: transmisión cifrada (HTTPS), almacenamiento en bases de datos con controles de acceso, restricción del acceso solo al personal autorizado, y no compartimos datos con terceros con fines comerciales sin tu consentimiento.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Conservación</h2>
            <p>
              Conservamos los datos el tiempo necesario para gestionar la relación comercial y cumplir obligaciones legales. Podés ejercer tus derechos de acceso, rectificación, supresión y oposición contactándonos por los medios indicados en nuestro sitio.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Contacto</h2>
            <p>
              Para consultas sobre esta política o sobre tus datos personales: ventas@quilmescorrugados.com.ar o WhatsApp +54 11 6924-9801.
            </p>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
