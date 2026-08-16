/**
 * Seccion de preguntas frecuentes con su schema FAQPage.
 *
 * Las dos cosas van juntas a proposito. El HTML es para la persona; el
 * FAQPage es lo que permite que Google muestre la respuesta directamente en
 * el resultado y que un asistente la levante como par pregunta-respuesta en
 * vez de tener que inferirla de un parrafo.
 *
 * Solo /faq y /precios tenian FAQPage. Las landings de intencion —ecommerce,
 * mudanza, delivery, mayorista— son justamente donde la persona llega con una
 * duda concreta y especifica de su caso, y no habia ni una respuesta marcada.
 *
 * Las preguntas se escriben como las escribe la gente ("¿cual es el minimo?"),
 * no como las escribiria un catalogo ("Cantidad minima de compra"). Es lo que
 * se parece a la consulta real.
 */

export interface Pregunta {
  pregunta: string;
  /** Texto plano: va tal cual al schema, asi que no puede llevar etiquetas. */
  respuesta: string;
}

interface Props {
  preguntas: Pregunta[];
  titulo?: string;
  className?: string;
}

export function PreguntasFrecuentes({
  preguntas,
  titulo = 'Preguntas frecuentes',
  className = '',
}: Props) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: preguntas.map((p) => ({
      '@type': 'Question',
      name: p.pregunta,
      acceptedAnswer: { '@type': 'Answer', text: p.respuesta },
    })),
  };

  return (
    <section className={`px-4 py-12 ${className}`} aria-labelledby="faq-titulo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <div className="mx-auto max-w-3xl">
        <h2 id="faq-titulo" className="mb-6 text-center text-2xl font-bold text-gray-900">
          {titulo}
        </h2>
        <div className="divide-y divide-gray-200 rounded-xl border border-gray-200">
          {preguntas.map((p) => (
            // <details> en vez de un acordeon con estado: funciona sin
            // JavaScript, asi que la respuesta esta en el HTML servido y un
            // asistente la lee aunque no ejecute nada.
            <details key={p.pregunta} className="group p-5">
              <summary className="cursor-pointer list-none font-semibold text-gray-900 marker:content-none">
                <span className="flex items-start justify-between gap-4">
                  {p.pregunta}
                  <span
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-[#002E55] transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-gray-700">{p.respuesta}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
