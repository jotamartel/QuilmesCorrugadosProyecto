import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/site';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { CONTACTO } from '@/lib/contacto';

export const metadata: Metadata = {
  // El layout raiz aplica el template "%s | Quilmes Corrugados": no repetirlo aca.
  title: 'Política de Privacidad',
  description: 'Política de privacidad de Quilmes Corrugados. Cómo protegemos y utilizamos la información personal de nuestros clientes.',
  alternates: {
    // Era el unico canonical que habia quedado escrito a mano, apuntando al
    // apex, que redirige. Un canonical hacia una URL que no responde 200 es
    // peor que no tenerlo.
    canonical: `${SITE_URL}/privacidad`,
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
        <p className="text-slate-600 mb-10">Última actualización: agosto de 2026</p>

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
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              4. Asistentes automáticos, API pública y servidor MCP
            </h2>
            <p>
              El chat del sitio y el de WhatsApp los atiende un asistente automático. Para
              responder, el contenido de la conversación se procesa en servidores de proveedores
              de modelos de lenguaje contratados por nosotros. No les enviamos datos que no estén
              en la conversación, y esos proveedores actúan como encargados del tratamiento: no
              usan el contenido para entrenar modelos.
            </p>
            <p>
              La conversación queda registrada asociada a tu número de teléfono o a la sesión del
              sitio, para poder darle continuidad al pedido y para que el equipo pueda retomarlo.
            </p>
            <p>
              Nuestra API pública y el servidor MCP cotizan sin pedir datos personales: reciben
              medidas y cantidades, y devuelven un precio. Registramos la consulta —medidas,
              volumen, dirección IP y qué agente la hizo— para medir el uso y limitar el abuso.
              Si además nos dejás un dato de contacto, se guarda como una consulta comercial.
            </p>
            <p>
              Si consultás nuestros precios a través de un asistente de terceros —ChatGPT, Claude
              u otro—, esa plataforma trata tus datos según su propia política, sobre la que no
              tenemos control. Lo que llega a nuestros servidores es la consulta de cotización.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Protección de los datos</h2>
            <p>
              Protegemos la información personal mediante: transmisión cifrada (HTTPS), almacenamiento en bases de datos con controles de acceso, restricción del acceso solo al personal autorizado, y no compartimos datos con terceros con fines comerciales sin tu consentimiento.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Conservación</h2>
            <p>
              Conservamos los datos el tiempo necesario para gestionar la relación comercial y cumplir obligaciones legales. Podés ejercer tus derechos de acceso, rectificación, supresión y oposición contactándonos por los medios indicados en nuestro sitio.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Contacto</h2>
            <p>
              Para consultas sobre esta política o sobre tus datos personales:{' '}
              {CONTACTO.email} o WhatsApp {CONTACTO.telefonoVisible}.
            </p>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
