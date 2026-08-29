import Link from 'next/link';
import { SITE_URL } from '@/lib/site';
import { CONTACTO } from '@/lib/contacto';

/**
 * El 404 del sitio. Antes no existía y Next servía el suyo pelado: status
 * correcto, pero sin ninguna salida. Un 404 sin links deja tanto a una persona
 * como a un agente adivinando URLs; este trae el mapa. La versión markdown
 * del mismo 404 (para `Accept: text/markdown`) vive en
 * lib/agentes/markdown-paginas.
 */
export default function NotFound() {
  const destinos = [
    { href: '/', titulo: 'Inicio', detalle: 'la página principal, con el cotizador' },
    { href: '/cajas', titulo: 'Cajas de stock', detalle: 'medidas estándar con entrega rápida' },
    { href: '/precios', titulo: 'Precios', detalle: 'la escalera de precios vigente' },
    { href: '/contacto', titulo: 'Contacto', detalle: `WhatsApp ${CONTACTO.telefonoVisible}` },
    { href: '/developers', titulo: 'Developers', detalle: 'API, OpenAPI, MCP y docs' },
  ] as const;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-xl w-full py-16">
        <p className="text-sm font-medium text-[#4F6D87] mb-2">Error 404</p>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Esta página no existe</h1>
        <p className="text-gray-600 mb-8">
          La dirección puede estar mal escrita o la página ya no está. Por dónde seguir:
        </p>

        <ul className="space-y-3 mb-10">
          {destinos.map((d) => (
            <li key={d.href}>
              <Link href={d.href} className="group flex items-baseline gap-2">
                <span className="font-medium text-[#002E55] underline underline-offset-2 group-hover:text-[#001a33]">
                  {d.titulo}
                </span>
                <span className="text-sm text-gray-500">— {d.detalle}</span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Para agentes y crawlers que leen el cuerpo del 404: las salidas
            machine-friendly, como texto plano con URLs absolutas. */}
        <pre className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
          {`404 — recursos para agentes:
- Mapa del sitio: ${SITE_URL}/sitemap.xml
- Guía para agentes de IA: ${SITE_URL}/llms.txt
- API de cotización: ${SITE_URL}/api/v1/quote (docs: ${SITE_URL}/api/v1/docs)
- Cotizar: ${SITE_URL}/cotizar/LARGOxANCHOxALTO/CANTIDAD (mm)`}
        </pre>
      </div>
    </div>
  );
}
