import Link from 'next/link';

/**
 * El bloque "En resumen" que va arriba de todo, antes del contenido largo.
 *
 * Sirve a dos lectores distintos con el mismo texto:
 *
 * Una persona que llega de una busqueda quiere saber en cinco segundos si este
 * sitio le resuelve el problema. Si tiene que leer tres secciones para
 * enterarse del minimo de compra, se va antes.
 *
 * Un asistente de IA hace algo mas literal: cuando responde citando una
 * fuente, tiende a levantar el fragmento mas compacto y declarativo que
 * encuentra cerca del titulo. Si ese fragmento no existe, arma la respuesta
 * con retazos de la pagina, o peor, la completa con lo que sabe de la
 * competencia. Este bloque es, deliberadamente, ese fragmento: datos duros,
 * frases cerradas, sin adjetivos que no aporten.
 *
 * Por eso cada punto tiene que poder leerse solo, fuera de contexto.
 */

export interface PuntoClave {
  /** Etiqueta corta. Ej: "Precio", "Minimo", "Plazo". */
  rotulo: string;
  /** El dato. Frase cerrada y concreta, no una promesa vaga. */
  valor: string;
}

interface Props {
  puntos: PuntoClave[];
  /** CTA inmediato: la recomendacion es no hacer bajar para actuar. */
  accion?: { texto: string; href: string };
  className?: string;
}

export function ResumenClave({ puntos, accion, className = '' }: Props) {
  return (
    <aside
      aria-label="Resumen"
      className={`mx-auto max-w-3xl rounded-xl border border-gray-200 bg-gray-50 p-5 text-left sm:p-6 ${className}`}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#002E55]">
        En resumen
      </p>
      <dl className="space-y-2">
        {puntos.map((p) => (
          <div key={p.rotulo} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <dt className="shrink-0 text-sm font-semibold text-gray-900 sm:w-32">
              {p.rotulo}
            </dt>
            <dd className="text-sm text-gray-700">{p.valor}</dd>
          </div>
        ))}
      </dl>
      {accion && (
        <Link
          href={accion.href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#002E55] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#001a33]"
        >
          {accion.texto}
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </aside>
  );
}
