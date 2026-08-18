import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { createAdminClient } from '@/lib/supabase/admin';
import { calcularCotizacion, validarCajas } from '@/lib/cotizacion/motor';
import { RETAIL_CONFIG } from '@/lib/retail/config';
import { SITE_URL } from '@/lib/site';
import type { PricingConfig } from '@/lib/types/database';

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

/** "400x600x600" o "40x60x60cm" → milimetros. */
function leerMedidas(crudo: string): { l: number; a: number; h: number } | null {
  const limpio = crudo.toLowerCase().trim();
  const enCm = limpio.endsWith('cm');
  const partes = limpio.replace(/(cm|mm)$/, '').split(/[x×\-_]/);
  if (partes.length !== 3) return null;
  const nums = partes.map((p) => Number(p.replace(',', '.')));
  if (!nums.every((n) => Number.isFinite(n) && n > 0)) return null;
  const f = enCm ? 10 : 1;
  return { l: Math.round(nums[0] * f), a: Math.round(nums[1] * f), h: Math.round(nums[2] * f) };
}

function leerCantidad(crudo: string): { cantidad: number; colores: number } | null {
  // Acepta "3000" o "3000/2" ya partido por el router; el segundo tramo es
  // opcional y viaja como "3000-2" para no complicar la ruta.
  const [c, col] = crudo.split(/[-_]/);
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
  const m = leerMedidas(medidas);
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
  const b = q.boxes[0];
  const { caja } = r;

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
      price: Math.round(b.unit_price),
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
                <td className="px-4 py-3 text-lg font-semibold tabular-nums">{ars(b.unit_price)}</td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-medium text-gray-600">Total sin IVA</th>
                <td className="px-4 py-3 text-lg font-semibold tabular-nums">{ars(q.subtotal)}</td>
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
                    ? `${caja.printing_colors} color${caja.printing_colors > 1 ? 'es' : ''} (+15% por color)`
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
            {ars(b.price_per_m2)} por m². Todos los precios son sin IVA.
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
