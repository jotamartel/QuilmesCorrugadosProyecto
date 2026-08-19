import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/site';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { CONTACTO } from '@/lib/contacto';
import { RETAIL_CONFIG, MINIMOS, ENVIO, MATERIAL } from '@/lib/retail/config';
import { getActivePricingConfig } from '@/lib/utils/pricing';

/**
 * Términos y condiciones.
 *
 * BORRADOR PARA REVISAR. Lo escribí describiendo lo que el sitio hace hoy —
 * validez de las cotizaciones, precios sin IVA, mínimos, envío, impresión— sin
 * inventar obligaciones que la fábrica no asumió. Antes de darlo por definitivo
 * conviene que lo lea un contador o un abogado, sobre todo la parte de
 * cancelaciones y la de jurisdicción, que son las que tienen consecuencias.
 *
 * Los números salen de la configuración vigente, no escritos a mano: unos
 * términos que contradigan al cotizador son peores que no tenerlos.
 */
export const metadata: Metadata = {
  title: 'Términos y Condiciones',
  description:
    'Términos y condiciones de uso del sitio y de las cotizaciones de Quilmes Corrugados: validez, precios, mínimos, plazos, impresión y envíos.',
  alternates: {
    canonical: `${SITE_URL}/terminos`,
  },
};

export default async function TerminosPage() {
  const c = await getActivePricingConfig();
  const validez = c?.quote_validity_days ?? 7;
  const diasStandard = c?.production_days_standard ?? 7;
  const diasImpresion = c?.production_days_printing ?? 14;
  const m2 = (n: number) => n.toLocaleString('es-AR') + ' m²';

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <nav className="mb-8">
          <Link href="/" className="text-slate-600 hover:text-slate-900 transition-colors">
            ← Volver al inicio
          </Link>
        </nav>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">Términos y Condiciones</h1>
        <p className="text-slate-600 mb-10">Última actualización: agosto de 2026</p>

        <div className="prose prose-slate max-w-none space-y-8 text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Quiénes somos</h2>
            <p>
              Quilmes Corrugados fabrica cajas de cartón corrugado a medida, con planta en
              Lugones 219, B1878 Quilmes, provincia de Buenos Aires, Argentina. Estos términos
              regulan el uso del sitio {SITE_URL.replace('https://', '')}, de su cotizador, de
              su API pública y del servidor MCP, y las condiciones de las cotizaciones que
              entregamos por esos medios.
            </p>
            <p>
              Al usar el sitio o cualquiera de esos canales, aceptás estos términos. Si no estás
              de acuerdo, no los uses.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Las cotizaciones</h2>
            <p>
              El precio que devuelve el cotizador, la API o el asistente es el mismo que paga un
              cliente y se calcula sobre los metros cuadrados de cartón desplegado del pedido.
              No es una estimación.
            </p>
            <p>
              Una cotización <strong>tiene una validez de {validez} días corridos</strong> desde
              su emisión. Vencida, hay que volver a cotizar: los precios del cartón se actualizan.
            </p>
            <p>
              Una cotización no reserva stock ni producción, y no constituye por sí sola un
              contrato de compraventa. El pedido queda confirmado cuando lo confirmamos nosotros
              por escrito y se cumple la condición de pago acordada.
            </p>
            <p>
              Si detectamos un error evidente en un precio publicado o cotizado, podemos
              corregirlo antes de confirmar el pedido, avisándote. En ese caso podés dejarlo sin
              efecto sin costo.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Precios e impuestos</h2>
            <p>
              Todos los precios están expresados en <strong>pesos argentinos</strong> y{' '}
              <strong>no incluyen IVA</strong>, salvo donde se indique lo contrario. El IVA es
              del 21% y se informa por separado en cada cotización, junto con el total con
              impuesto incluido.
            </p>
            <p>
              Los precios no incluyen el flete, salvo en los casos de envío sin cargo que se
              describen más abajo, ni ningún otro impuesto, tasa o percepción que corresponda
              según la condición fiscal del comprador.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Mínimos y canales</h2>
            <p>{MINIMOS.largo}</p>
            <p>
              La medida mínima por caja es de {RETAIL_CONFIG.MIN_LARGO} x {RETAIL_CONFIG.MIN_ANCHO}{' '}
              x {RETAIL_CONFIG.MIN_ALTO} mm. Además, el ancho más el alto no pueden superar los{' '}
              {RETAIL_CONFIG.MAX_SHEET_WIDTH} mm, que es el ancho del rollo de cartón. El largo no
              tiene esa limitación.
            </p>
            <p>
              Trabajamos en cartón corrugado {MATERIAL.detalle}. No fabricamos microcorrugado ni
              cartulina, y no exportamos: vendemos solo dentro de la República Argentina. Si
              necesitás otro gramaje, consultanos: se cotiza aparte.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Plazos de entrega</h2>
            <p>
              Las medidas estándar que están en stock se despachan en 24 a 48 horas. La producción
              a medida demora aproximadamente <strong>{diasStandard} días hábiles</strong>, y{' '}
              <strong>{diasImpresion} días hábiles</strong> cuando lleva impresión.
            </p>
            <p>
              Los plazos se cuentan desde la confirmación del pedido y, cuando corresponde, desde
              la recepción del arte de impresión aprobado. Son estimados de buena fe y pueden
              variar por causas ajenas a la fábrica, como faltantes de materia prima o cortes de
              suministro. En ese caso avisamos apenas lo sabemos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Impresión</h2>
            <p>
              Imprimimos por flexografía hasta {RETAIL_CONFIG.MAX_PRINTING_COLORS} colores, en
              pedidos desde {m2(c?.printing_min_m2 ?? 1000)}. El costo de la impresión está
              incluido en el precio por metro cuadrado.
            </p>
            <p>
              Las medidas estándar de catálogo se producen en tirada larga sin arte y no llevan
              impresión. Para imprimir hay que fabricar una medida propia.
            </p>
            <p>
              <strong>El polímero se cotiza aparte y queda a cargo del comprador.</strong> Es la
              matriz de impresión: se hace una por color, una sola vez por diseño, y sirve para las
              tiradas siguientes de ese mismo arte. Su costo depende del diseño, por eso no tiene
              precio de lista.
            </p>
            <p>
              El comprador es responsable de tener los derechos sobre el arte que nos envía para
              imprimir, y de que su contenido sea lícito. Producimos sobre el archivo aprobado: las
              diferencias de tono propias del proceso flexográfico sobre cartón kraft no se
              consideran defecto.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Envíos</h2>
            <p>{ENVIO.largo}</p>
            <p>
              La mercadería viaja por cuenta y riesgo del comprador desde que sale de la fábrica,
              salvo que el flete lo contratemos nosotros. Conviene revisar el estado de los bultos
              al recibirlos y dejar constancia en el remito si algo llegó dañado.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Cancelaciones y cambios</h2>
            <p>
              Un pedido de producción a medida se fabrica exclusivamente para el comprador y con
              sus medidas, así que una vez iniciada la producción no admite cancelación ni
              devolución por arrepentimiento. Antes de que arranque la producción se puede cancelar
              sin cargo.
            </p>
            <p>
              Si el producto entregado no se corresponde con lo cotizado y confirmado, o presenta
              un defecto de fabricación, lo reponemos o acreditamos el importe. El reclamo hay que
              hacerlo dentro de los 10 días corridos de recibida la mercadería, con fotos y el
              número de pedido.
            </p>
            <p>
              Nada de lo anterior afecta los derechos que la ley 24.240 de Defensa del Consumidor
              le reconoce a quien compre en calidad de consumidor final.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">9. Uso del cotizador, la API y el asistente</h2>
            <p>
              El cotizador, la API pública y el servidor MCP son de uso libre y gratuito, sin
              registro. Pedimos un uso razonable: hay un límite de consultas por minuto y podemos
              restringir el acceso ante un uso automatizado que afecte el servicio.
            </p>
            <p>
              El asistente automático del sitio y de WhatsApp responde con los precios y las
              condiciones vigentes al momento de la consulta. Ante cualquier diferencia entre lo
              que informe el asistente y estos términos o la confirmación escrita de un pedido,
              prevalecen estos últimos.
            </p>
            <p>
              El contenido del sitio, incluidos textos, imágenes y la marca Quilmes Corrugados, nos
              pertenece. Podés usar libremente las cotizaciones y las plantillas troqueladas que
              genera el sitio para tu propio pedido.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">10. Datos personales</h2>
            <p>
              El tratamiento de los datos que nos dejás está descrito en nuestra{' '}
              <Link href="/privacidad" className="text-[#002E55] underline underline-offset-2">
                Política de Privacidad
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">11. Cambios y jurisdicción</h2>
            <p>
              Podemos actualizar estos términos. La versión vigente es siempre la publicada en esta
              página, con su fecha de última actualización. Los pedidos ya confirmados se rigen por
              los términos vigentes al momento de la confirmación.
            </p>
            <p>
              Estos términos se rigen por las leyes de la República Argentina. Para cualquier
              controversia se aplican los tribunales ordinarios competentes del partido de Quilmes,
              provincia de Buenos Aires, salvo que la ley disponga otro fuero para consumidores.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">12. Contacto</h2>
            <p>
              Por cualquier consulta sobre estos términos:
              <br />
              WhatsApp: {CONTACTO.telefonoVisible}
              <br />
              Email: {CONTACTO.email}
              <br />
              Domicilio: {CONTACTO.direccion}
            </p>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
