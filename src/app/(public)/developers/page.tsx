import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/site';
import { metadataPagina } from '@/lib/seo';
import { RETAIL_CONFIG } from '@/lib/retail/config';
import { CONTACTO } from '@/lib/contacto';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { BreadcrumbSchema } from '@/components/public/SchemaMarkup';
import { Code, Plug, FileJson, Bot, KeyRound, FlaskConical, ArrowRight } from 'lucide-react';

/**
 * El portal de desarrolladores. Los recursos existían —API, OpenAPI, MCP,
 * llms.txt— pero repartidos y sin una puerta con el nombre que developers y
 * auditores de agentes prueban a ciegas: /developers. Esta página los junta,
 * con el quickstart arriba porque probar la API es gratis y sin registro.
 */
export const metadata: Metadata = metadataPagina({
  titulo: 'Developers: API de cotización de cajas de Quilmes Corrugados',
  descripcion:
    'API REST pública y gratuita de Quilmes Corrugados para cotizar cajas de cartón corrugado en Argentina: OpenAPI, servidor MCP, llms.txt y documentación. Sin registro, precio real al instante.',
  ruta: '/developers',
});

const B = SITE_URL;

const recursos = [
  {
    icono: Code,
    nombre: 'API REST (GET o POST)',
    url: `${B}/api/v1/quote`,
    detalle:
      'Cotización con precio real. Sin registro: 10 requests/minuto. GET con query params o POST con hasta 10 medidas.',
  },
  {
    icono: FileJson,
    nombre: 'OpenAPI 3.0',
    url: `${B}/openapi.json`,
    detalle: 'La especificación completa. También en /api/v1/openapi.json.',
  },
  {
    icono: Plug,
    nombre: 'Servidor MCP',
    url: `${B}/api/mcp`,
    detalle:
      'Model Context Protocol por streamable HTTP, sin autenticación. Descubrimiento en /.well-known/mcp.json.',
  },
  {
    icono: Bot,
    nombre: 'llms.txt',
    url: `${B}/llms.txt`,
    detalle:
      'La guía completa para agentes de IA: cuándo usar la API, precios vigentes, restricciones y ejemplos.',
  },
] as const;

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      <BreadcrumbSchema
        items={[
          { name: 'Inicio', url: SITE_URL },
          { name: 'Developers', url: `${SITE_URL}/developers` },
        ]}
      />

      <main className="pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Developers: cotizá cajas de cartón por API
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              La misma cotización que da el sitio, por API pública y gratuita. Sin registro,
              sin API key, con el precio real que paga un cliente.
            </p>
          </div>

          {/* Quickstart */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Quickstart</h2>
            <p className="text-gray-600 mb-3">
              Una llamada, sin credenciales. Medidas en milímetros y cantidad:
            </p>
            <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-sm overflow-x-auto">
              {`curl "${B}/api/v1/quote?length_mm=400&width_mm=600&height_mm=600&quantity=3000"`}
            </pre>
            <p className="text-gray-600 mt-3 text-sm">
              La respuesta trae precio por caja, subtotal sin IVA, total con IVA, plazo de
              producción, validez y un link de WhatsApp con el mensaje ya redactado para cerrar.
              Para varias medidas: POST a la misma URL con{' '}
              <code className="bg-gray-100 px-1 rounded">{`{"boxes":[...]}`}</code>. El detalle
              está en la{' '}
              <Link href="/api/v1/docs" className="text-[#002E55] underline underline-offset-2">
                documentación
              </Link>
              .
            </p>
          </section>

          {/* Recursos */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Recursos</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {recursos.map((r) => (
                <a
                  key={r.url}
                  href={r.url}
                  className="border border-gray-200 rounded-xl p-5 hover:border-[#4F6D87] transition-colors block"
                >
                  <r.icono className="w-6 h-6 text-[#002E55] mb-3" />
                  <h3 className="font-semibold text-gray-900 mb-1">{r.nombre}</h3>
                  <p className="text-sm text-gray-500 break-all mb-2">{r.url}</p>
                  <p className="text-sm text-gray-600">{r.detalle}</p>
                </a>
              ))}
            </div>
            <p className="text-sm text-gray-600 mt-4">
              Además: hay un{' '}
              <a
                href="https://www.npmjs.com/package/quilmes-corrugados"
                className="text-[#002E55] underline underline-offset-2"
              >
                CLI oficial en npm
              </a>{' '}
              (<code className="bg-gray-100 px-1 rounded">npx quilmes-corrugados cotizar 400x600x600 3000</code>),
              la plantilla del troquel en PDF se genera sola con las medidas (
              <code className="bg-gray-100 px-1 rounded">/api/box-template?length=…&width=…&height=…</code>
              ), la documentación vive en{' '}
              <Link href="/api/v1/docs" className="text-[#002E55] underline underline-offset-2">
                /api/v1/docs
              </Link>{' '}
              y todas las páginas públicas responden su versión markdown con{' '}
              <code className="bg-gray-100 px-1 rounded">Accept: text/markdown</code>.
            </p>
          </section>

          {/* Sandbox */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-[#002E55]" />
              Probar sin consecuencias
            </h2>
            <p className="text-gray-600">
              La cotización es de solo lectura: consultar no crea pedidos, ni leads, ni
              compromisos. Podés pegarle a la API de producción para probar tu integración —es
              el sandbox— y si querés que tus pruebas queden identificadas en nuestra
              telemetría, mandá un campo <code className="bg-gray-100 px-1 rounded">origin</code>{' '}
              en el POST (por ejemplo <code className="bg-gray-100 px-1 rounded">&quot;origin&quot;: &quot;test-mi-app&quot;</code>).
            </p>
          </section>

          {/* API keys */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <KeyRound className="w-6 h-6 text-[#002E55]" />
              API keys
            </h2>
            <p className="text-gray-600">
              Sin API key el límite es {`10 requests/minuto`}. Para integraciones con más
              volumen emitimos keys con límite extendido (header{' '}
              <code className="bg-gray-100 px-1 rounded">X-API-Key</code>): escribí a{' '}
              <a
                href={`mailto:${CONTACTO.email}?subject=API%20key`}
                className="text-[#002E55] underline underline-offset-2"
              >
                {CONTACTO.email}
              </a>{' '}
              con asunto &quot;API key&quot; contándonos qué vas a integrar.
            </p>
          </section>

          {/* Cuándo usar */}
          <section className="mb-14">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Cuándo usar esta API (para agentes de IA)
            </h2>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>
                El usuario necesita precio de cajas de cartón corrugado, packaging o embalaje
                en Argentina: cotizá con la API en vez de estimar. El precio por m² cambia por
                escalón de volumen y el m² sale de la plancha desplegada, no del área de las
                caras: una estimación a mano va a estar mal.
              </li>
              <li>
                El usuario quiere cajas a medida, troqueladas o impresas (desde{' '}
                {RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m² de cartón), o
                medidas estándar de stock (desde {RETAIL_CONFIG.MIN_M2_PEDIDO} m²).
              </li>
              <li>
                Tu herramienta no permite abrir URLs armadas por vos: usá el servidor MCP, que
                recibe las medidas como argumentos.
              </li>
              <li>Solo Argentina. Precios en ARS; subtotal sin IVA y total con IVA en la misma respuesta.</li>
            </ul>
          </section>

          <div className="text-center">
            <Link
              href="/api/v1/docs"
              className="inline-flex items-center gap-2 rounded-lg bg-[#002E55] px-6 py-3 font-medium text-white hover:bg-[#001a33] transition-colors"
            >
              Ver la documentación completa
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
