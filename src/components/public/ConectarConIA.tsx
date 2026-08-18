'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

/**
 * Conectar el cotizador al asistente de quien lo lee.
 *
 * SOBRE LO QUE ESTE COMPONENTE NO HACE
 *
 * No existe hoy —ni en Claude ni en ChatGPT— un enlace que agregue un servidor
 * MCP de un clic. Se verifico antes de construir esto: lo mas cerca que hay es
 * claude.ai/settings/connectors, que abre la pantalla pero no precarga nada.
 * Un boton que dijera "agregar automaticamente" y solo abriera una pagina
 * seria una promesa incumplida, y peor que no tenerlo: el que lo aprieta se
 * queda esperando algo que no va a pasar.
 *
 * Entonces hace lo unico honesto que se puede hacer, que igual sirve: copia la
 * URL al portapapeles y abre la pantalla exacta donde hay que pegarla. Dos
 * pasos en vez de cinco, sin inventar una capacidad que no existe.
 *
 * Si algun dia las plataformas publican un esquema de instalacion directa,
 * este es el archivo donde se agrega.
 */

const CLIENTES = [
  {
    id: 'claude',
    nombre: 'Claude',
    ajustes: 'https://claude.ai/settings/connectors',
    textoBoton: 'Abrir conectores de Claude',
    pasos: 'Add custom connector → pegar la URL → Add',
  },
  {
    id: 'chatgpt',
    nombre: 'ChatGPT',
    ajustes: 'https://chatgpt.com/#settings/Connectors',
    textoBoton: 'Abrir conectores de ChatGPT',
    // El modo desarrollador hace falta y no es obvio: sin eso no aparece la
    // opcion de agregar un servidor propio y la persona da vueltas sin
    // encontrarla.
    pasos: 'Advanced → Developer mode → Add → pegar la URL',
  },
] as const;

function BotonCopiar({
  valor,
  etiqueta,
  className = '',
}: {
  valor: string;
  etiqueta: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin permiso de portapapeles: el valor igual esta a la vista para
         seleccionarlo a mano */
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 ${className}`}
      aria-label={`Copiar ${etiqueta}`}
    >
      {copiado ? (
        <>
          <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
          Copiado
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copiar
        </>
      )}
    </button>
  );
}

export function ConectarConIA({ urlMcp, urlCotizar }: { urlMcp: string; urlCotizar: string }) {
  const comandoCli = `claude mcp add --transport http quilmes ${urlMcp}`;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
      <h2 className="text-xl font-bold text-gray-900">Conectalo a tu asistente</h2>
      <p className="mt-1 max-w-2xl text-gray-600">
        Con esto tu asistente cotiza cajas sin salir de la conversación: le preguntás por una
        medida y te devuelve el precio, el plazo y la plantilla de impresión.
      </p>

      {/* La URL, grande y copiable: es lo unico que hay que pegar. */}
      <div className="mt-6 rounded-xl bg-gray-50 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          URL del servidor MCP
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <code className="min-w-0 flex-1 break-all font-mono text-sm text-gray-900">
            {urlMcp}
          </code>
          <BotonCopiar valor={urlMcp} etiqueta="la URL del servidor MCP" />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {CLIENTES.map((c) => (
          <div key={c.id} className="rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900">{c.nombre}</h3>
            <p className="mt-1 text-sm text-gray-600">{c.pasos}</p>
            <a
              href={c.ajustes}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#002E55] hover:underline"
            >
              {c.textoBoton}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900">Claude Code</h3>
        <p className="mt-1 text-sm text-gray-600">Un comando, sin pasar por ninguna pantalla.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-gray-900 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-sm text-gray-100">
            {comandoCli}
          </code>
          <BotonCopiar valor={comandoCli} etiqueta="el comando" />
        </div>
      </div>

      {/* La salida para el caso mas comun, que es no tener MCP. Va al final
          pero va: la mayoria de la gente que lee esto no va a instalar nada. */}
      <p className="mt-6 border-t border-gray-200 pt-4 text-sm text-gray-600">
        <strong className="font-semibold text-gray-900">¿Tu asistente no soporta MCP?</strong>{' '}
        No hace falta instalar nada: cada cotización es una página. Abrí{' '}
        <a href={urlCotizar} className="text-[#002E55] underline underline-offset-2">
          {urlCotizar.replace(/^https:\/\//, '')}
        </a>{' '}
        y cambiá las medidas y la cantidad en la dirección. Da el mismo precio.
      </p>
    </section>
  );
}
