import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { createAdminClient } from '@/lib/supabase/admin';
import { calcularCotizacion, validarCajas } from '@/lib/cotizacion/motor';
import { RETAIL_CONFIG } from '@/lib/retail/config';
import { SITE_URL } from '@/lib/site';
import { CONTACTO } from '@/lib/contacto';
import type { PricingConfig } from '@/lib/types/database';
import { precioUnitarioARS } from '@/lib/cotizacion/motor';

/**
 * Una cotizacion que es una PAGINA, no una respuesta JSON.
 *
 * POR QUE EXISTE
 *
 * El registro lo mostro sin ambiguedad: ChatGPT-User leyo /llms.txt y recibio
 * un 200. Leyo las instrucciones de como cotizar. Y despues no llamo ni una
 * sola vez a /api/v1/quote. Le dijo al usuario "no estoy pudiendo ejecutar la
 * llamada dinamica del cotizador".
 *
 * No es un problema de permisos ni de robots.txt. Es que su herramienta busca
 * paginas para leer y citar; no es un cliente HTTP que ejecute una API porque
 * un archivo se lo explique. Le estabamos pidiendo algo que no hace.
 *
 * Esta ruta elimina el problema en vez de pelearlo: convierte "cotizar" en
 * "abrir una URL". El precio de una caja concreta pasa a ser una pagina con
 * texto, que es exactamente lo que un asistente sabe traer y citar.
 *
 *   /cotizar/400x600x600/3000
 *   /cotizar/400x600x600/3000/2   (con 2 colores de impresion)
 *
 * La API sigue existiendo y es mejor para un sistema que integra de verdad.
 * Esto es para el caso mucho mas comun: alguien preguntandole a un asistente.
 */

export const revalidate = 300;

interface Props {
  params: Promise<{ medidas: string; cantidad: string }>;
}

/**
 * Lleva las medidas a la forma canonica: "400x500x600", con equis minuscula.
 *
 * Un asistente no escribe lo que le dictamos, escribe lo que le queda natural.
 * ChatGPT armo la URL con "×" —el signo de multiplicacion tipografico, U+00D7—
 * porque asi lo habia escrito en su propia respuesta. Con ese caracter crudo en
 * el path la ruta devolvia 500, y percent-encoded devolvia 404: el parametro
 * llega sin decodificar y no matchea nada.
 *
 * El resultado practico fue que ChatGPT le dijo al usuario que el sitio le
 * "bloqueo la URL como navegacion no segura". Habia hecho todo bien —leyo el
 * llms.txt, entendio el formato, armo la direccion— y se choco con un detalle
 * de tipografia.
 *
 * Entonces se acepta cualquier separador que no sea un digito, y despues se
 * redirige a la forma canonica. Dos beneficios: funciona escriban lo que
 * escriban, y cada cotizacion tiene UNA sola URL indexable en vez de una por
 * cada forma de escribir la equis.
 */
function canonizarMedidas(crudo: string): string | null {
  let texto = crudo;
  // El parametro puede llegar percent-encoded segun como se armo el enlace.
  try {
    texto = decodeURIComponent(crudo);
  } catch {
    /* secuencia mal formada: seguir con el texto tal cual */
  }

  texto = texto.toLowerCase().trim();
  const enCm = /cm\s*$/.test(texto);
  texto = texto.replace(/(cm|mm)\s*$/, '');

  // Cualquier cosa que no sea digito o separador decimal es un separador.
  const nums = texto
    .split(/[^\d.,]+/)
    .filter(Boolean)
    .map((p) => Number(p.replace(',', '.')));

  if (nums.length !== 3 || !nums.every((n) => Number.isFinite(n) && n > 0)) return null;

  const f = enCm ? 10 : 1;
  return nums.map((n) => Math.round(n * f)).join('x');
}

/** "400x600x600" → milimetros. Espera la forma ya canonizada. */
function leerMedidas(canonico: string): { l: number; a: number; h: number } | null {
  const [l, a, h] = canonico.split('x').map(Number);
  if (![l, a, h].every((n) => Number.isFinite(n) && n > 0)) return null;
  return { l, a, h };
}

function leerCantidad(crudo: string): { cantidad: number; colores: number } | null {
  // Acepta "3000" o "3000/2" ya partido por el router; el segundo tramo es
  // opcional y viaja como "3000-2" para no complicar la ruta.
  let texto = crudo;
  try {
    texto = decodeURIComponent(crudo);
  } catch {
    /* secuencia mal formada */
  }
  const [c, col] = texto.split(/[^\d]+/).filter(Boolean).length > 1
    ? texto.split(/[^\d]+/).filter(Boolean)
    : [texto.replace(/\D/g, ''), undefined];
  const cantidad = Number(c);
  if (!Number.isFinite(cantidad) || cantidad < 1) return null;
  const colores = Number(col || 0);
  return { cantidad: Math.round(cantidad), colores: Number.isFinite(colores) ? colores : 0 };
}

type Caja = {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  printing_colors: number;
  has_printing: boolean;
};

type Resultado =
  | { errores: string[]; caja: Caja }
  | { cotizacion: ReturnType<typeof calcularCotizacion>; caja: Caja };

async function cotizar(medidas: string, cantidadCruda: string): Promise<Resultado | null> {
  const canonico = canonizarMedidas(medidas);
  if (!canonico) return null;
  const m = leerMedidas(canonico);
  const c = leerCantidad(cantidadCruda);
  if (!m || !c) return null;

  const caja = {
    length_mm: m.l,
    width_mm: m.a,
    height_mm: m.h,
    quantity: c.cantidad,
    printing_colors: c.colores,
    has_printing: c.colores > 0,
  };

  const errores = validarCajas([caja]);
  if (errores.length) return { errores, caja };

  const db = createAdminClient();
  const { data: config } = await db
    .from('pricing_config')
    .select('*')
    .eq('is_active', true)
    .order('valid_from', { ascending: false })
    .limit(1)
    .single();
  if (!config) return null;

  const { data: catalogo } = await db
    .from('boxes')
    .select('length_mm, width_mm, height_mm, stock')
    .eq('is_standard', true)
    .eq('is_active', true);

  return { cotizacion: calcularCotizacion([caja], config as PricingConfig, catalogo || []), caja };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { medidas, cantidad } = await params;
  const r = await cotizar(medidas, cantidad);
  const url = `${SITE_URL}/cotizar/${medidas}/${cantidad}`;

  if (!r || 'errores' in r) {
    return { title: 'Cotización', robots: { index: false }, alternates: { canonical: url } };
  }

  const q = r.cotizacion;
  const { caja } = r;

  // Sin precio no hay nada que indexar ni que mostrar en un resultado de
  // busqueda: esta URL existe solo para explicarle el minimo a quien llego.
  if (!q.cotizable) {
    return {
      title: `${caja.quantity.toLocaleString('es-AR')} cajas de ${caja.length_mm}x${caja.width_mm}x${caja.height_mm} mm: no llega al mínimo`,
      description: q.summary,
      robots: { index: false },
      alternates: { canonical: url },
    };
  }

  return {
    // El title lleva el precio: es lo primero que ve un asistente en un
    // resultado de busqueda, antes de decidir si abre la pagina.
    title: `${caja.quantity.toLocaleString('es-AR')} cajas de ${caja.length_mm}x${caja.width_mm}x${caja.height_mm} mm: $${Math.round(q.boxes[0].unit_price).toLocaleString('es-AR')} c/u`,
    description: q.summary,
    alternates: { canonical: url },
    openGraph: { title: q.summary.slice(0, 90), description: q.summary, url, type: 'website' },
  };
}

const ars = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

export default async function CotizarPage({ params }: Props) {
  const { medidas, cantidad } = await params;

  // Si la direccion no venia en la forma canonica —porque usaron "×", "X", un
  // asterisco o centimetros— se manda a la buena. Asi una misma cotizacion
  // tiene una sola URL indexable, y el que la escribio distinto igual llega.
  const canonico = canonizarMedidas(medidas);
  if (canonico && canonico !== medidas) {
    redirect(`/cotizar/${canonico}/${cantidad}`);
  }

  const r = await cotizar(medidas, cantidad);
  if (!r) notFound();

  const url = `${SITE_URL}/cotizar/${medidas}/${cantidad}`;

  if ('errores' in r) {
    return (
      <div className="min-h-screen bg-white">
        <LandingHeader />
        <main className="mx-auto max-w-2xl px-4 pb-16 pt-28">
          <h1 className="mb-4 text-2xl font-bold text-gray-900">
            Esa caja no la podemos fabricar
          </h1>
          <ul className="mb-6 list-disc space-y-1 pl-5 text-gray-700">
            {r.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="text-gray-700">
            Los límites son: largo 100 a 2000 mm, ancho 100 a 2000 mm, alto 50 a 1500 mm, y
            ancho + alto no puede superar {RETAIL_CONFIG.MAX_SHEET_WIDTH} mm, que es el ancho
            de la bobina de cartón. Si necesitás algo fuera de eso, escribinos por{' '}
            <a
              href="https://wa.me/5491133411781"
              className="text-[#002E55] underline underline-offset-2"
            >
              WhatsApp
            </a>{' '}
            y lo vemos.
          </p>
        </main>
        <LandingFooter />
      </div>
    );
  }

  const q = r.cotizacion;
  const { caja } = r;

  // El minimo de compra es excluyente: por debajo no se publica un precio, ni
  // en la pagina ni en el schema.org. Esta URL la comparte el agente, asi que
  // un precio aca es un precio que despues hay que sostener.
  if (!q.cotizable) {
    // Solo hay una cantidad que sirva si el problema es la cantidad. Una caja
    // que no se puede fabricar no se arregla pidiendo mas.
    const cajasMinimo =
      q.impedimento.tipo === 'no_fabricable' ? null : q.impedimento.cajas_necesarias;
    return (
      <div className="min-h-screen bg-white">
        <LandingHeader />
        <main className="mx-auto max-w-2xl px-4 pb-16 pt-28">
          <h1 className="mb-4 text-3xl font-bold text-gray-900">
            {caja.quantity.toLocaleString('es-AR')} cajas de {caja.length_mm}×{caja.width_mm}×
            {caja.height_mm} mm
          </h1>
          <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-amber-900 leading-relaxed">{q.impedimento.motivo}</p>
            <p className="mt-2 text-sm text-amber-800">
              No cotizamos por debajo de ese volumen.
            </p>
          </div>
          {cajasMinimo && (
            <p className="mb-6 text-gray-700">
              Con esta medida, el pedido más chico que podemos hacer son{' '}
              <strong>{cajasMinimo.toLocaleString('es-AR')} cajas</strong>.{' '}
              <Link
                href={`/cotizar/${caja.length_mm}x${caja.width_mm}x${caja.height_mm}/${cajasMinimo}`}
                className="font-semibold text-[#002E55] underline underline-offset-2"
              >
                Ver el precio de esa cantidad
              </Link>
            </p>
          )}

          {/* Las medidas de catalogo parecidas, ya cotizadas. Decir que no sin
              decir que si mandaba a la persona a preguntar por WhatsApp cual le
              servia, con el catalogo disponible de este lado. */}
          {q.impedimento.alternativas.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">
                Medidas de catálogo parecidas
              </h2>
              <ul className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200">
                {q.impedimento.alternativas.map((a) => (
                  <li
                    key={`${a.length_mm}x${a.width_mm}x${a.height_mm}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
                  >
                    <div>
                      <Link
                        href={`/cotizar/${a.length_mm}x${a.width_mm}x${a.height_mm}/${a.cantidad}`}
                        className="font-semibold text-[#002E55] underline underline-offset-2 tabular-nums"
                      >
                        {a.length_mm}×{a.width_mm}×{a.height_mm} mm
                      </Link>
                      <span className="ml-2 text-sm text-gray-600 tabular-nums">
                        {a.cantidad.toLocaleString('es-AR')} cajas · {a.m2.toLocaleString('es-AR')} m²
                      </span>
                      {!a.entra && (
                        <div className="text-xs text-amber-700">
                          Más chica que la que pediste
                        </div>
                      )}
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="font-semibold text-gray-900">
                        {ars(a.precio_por_caja)} <span className="text-sm font-normal text-gray-600">por caja</span>
                      </div>
                      <div className="text-sm text-gray-600">{ars(a.subtotal)} sin IVA</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-gray-700">
            ¿Ninguna te sirve? Escribinos por{' '}
            <a
              href={CONTACTO.whatsapp}
              className="text-[#002E55] underline underline-offset-2"
            >
              WhatsApp
            </a>{' '}
            y lo vemos.
          </p>
        </main>
        <LandingFooter />
      </div>
    );
  }

  const b = q.boxes[0];

  // Offer con el precio real de ESTA caja. Es lo que permite que un buscador
  // muestre el precio sin abrir la pagina.
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `Cajas de cartón corrugado ${caja.length_mm}x${caja.width_mm}x${caja.height_mm} mm`,
    description: q.summary,
    brand: { '@type': 'Brand', name: 'Quilmes Corrugados' },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'ARS',
      price: b.unit_price,
      eligibleQuantity: { '@type': 'QuantitativeValue', value: caja.quantity, unitText: 'cajas' },
      availability: 'https://schema.org/InStock',
      priceValidUntil: q.valid_until,
      seller: { '@type': 'Organization', name: 'Quilmes Corrugados' },
    },
  };

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-28">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          {caja.quantity.toLocaleString('es-AR')} cajas de {caja.length_mm}×{caja.width_mm}×
          {caja.height_mm} mm
        </h1>

        {/* El resumen primero y en una sola frase: es lo que un asistente
            levanta textual para contestarle a quien pregunto. */}
        <p className="mb-8 text-lg leading-relaxed text-gray-700">{q.summary}</p>

        <div className="mb-8 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-gray-200">
              <tr>
                <th scope="row" className="px-4 py-3 font-medium text-gray-600">Precio por caja</th>
                <td className="px-4 py-3 text-lg font-semibold tabular-nums">{precioUnitarioARS(b.unit_price)}</td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-medium text-gray-600">Subtotal sin IVA</th>
                <td className="px-4 py-3 text-lg font-semibold tabular-nums">{ars(q.subtotal)}</td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-medium text-gray-600">IVA 21%</th>
                <td className="px-4 py-3 tabular-nums">{ars(q.tax_amount)}</td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-medium text-gray-600">Total con IVA</th>
                <td className="px-4 py-3 text-lg font-semibold tabular-nums">{ars(q.total_with_tax)}</td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-medium text-gray-600">Cartón</th>
                <td className="px-4 py-3 tabular-nums">
                  {q.total_m2.toLocaleString('es-AR')} m² · {ars(b.price_per_m2)} por m²
                </td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-medium text-gray-600">Impresión</th>
                <td className="px-4 py-3">
                  {caja.printing_colors
                    ? `${caja.printing_colors} color${caja.printing_colors > 1 ? 'es' : ''}, incluida en el precio por m². Aparte solo el polímero`
                    : `Sin impresión. Hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores disponibles.`}
                </td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-medium text-gray-600">Plazo</th>
                <td className="px-4 py-3">{q.estimated_days} días hábiles</td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-medium text-gray-600">Validez</th>
                <td className="px-4 py-3">Hasta el {new Date(q.valid_until).toLocaleDateString('es-AR')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-4 text-gray-700">
          {q.channel_note}
        </p>

        <div className="mb-10 flex flex-wrap gap-3">
          <a
            href={q.contact.whatsapp_url}
            className="rounded-lg bg-[#002E55] px-5 py-3 font-medium text-white transition-colors hover:bg-[#001a33]"
          >
            Avanzar por WhatsApp
          </a>
          <a
            href={q.printing.template_pdf}
            className="rounded-lg border-2 border-[#002E55] px-5 py-3 font-medium text-[#002E55] transition-colors hover:bg-[#002E55] hover:text-white"
          >
            Descargar la plantilla de impresión
          </a>
        </div>

        <section className="border-t border-gray-200 pt-6 text-sm text-gray-600">
          <h2 className="mb-2 font-semibold text-gray-900">Cómo se calculó</h2>
          <p className="mb-4">
            El precio sale del cartón desplegado, no del volumen de la caja: una caja de{' '}
            {caja.length_mm}×{caja.width_mm}×{caja.height_mm} mm usa{' '}
            {b.sqm_per_box.toFixed(3)} m² de plancha, y {caja.quantity.toLocaleString('es-AR')}{' '}
            unidades suman {q.total_m2.toLocaleString('es-AR')} m². A ese volumen le corresponde{' '}
            {ars(b.price_per_m2)} por m². El precio por caja y el por m² son sin IVA.
          </p>
          <p>
            Podés{' '}
            <Link href="/precios" className="text-[#002E55] underline underline-offset-2">
              ver la escalera de precios completa
            </Link>
            , cambiar las medidas en{' '}
            <Link href="/#cotizador" className="text-[#002E55] underline underline-offset-2">
              el cotizador
            </Link>
            , o pedir esta misma cotización en JSON:{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
              {SITE_URL}/api/v1/quote?length_mm={caja.length_mm}&amp;width_mm={caja.width_mm}
              &amp;height_mm={caja.height_mm}&amp;quantity={caja.quantity}
            </code>
          </p>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
