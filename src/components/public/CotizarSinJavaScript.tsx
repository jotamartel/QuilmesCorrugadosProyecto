import { SITE_URL } from '@/lib/site';

/**
 * Le dice a quien no puede usar el formulario que hay otra vía.
 *
 * Nace de un QA real: ChatGPT entró al sitio, encontró el cotizador y
 * respondió "no puedo ejecutar el JavaScript del formulario para recuperar el
 * precio". Tenía razón y no tiene arreglo —el cotizador es interactivo—, pero
 * sí existe una salida: la API devuelve el mismo precio con un GET. El
 * problema era que nadie se lo estaba diciendo.
 *
 * Se renderiza de dos formas a propósito:
 *
 *   <noscript>  es la etiqueta que el HTML define exactamente para esto:
 *               contenido para clientes que no ejecutan JS. Un asistente que
 *               lee el HTML crudo lo ve; un usuario con navegador, no.
 *
 *   línea visible  por si el extractor descarta el contenido de noscript, que
 *                  varía según la herramienta. Además le sirve a un comprador
 *                  B2B que quiera integrar su sistema.
 */
export function CotizarSinJavaScript({ className = '' }: { className?: string }) {
  const ejemplo = `${SITE_URL}/api/v1/quote?length_cm=40&width_cm=60&height_cm=60&quantity=3000`;

  return (
    <>
      <noscript>
        <div
          style={{
            border: '1px solid #D3DCE7',
            borderRadius: 12,
            padding: 16,
            margin: '16px 0',
            background: '#F1F4F8',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
            Este cotizador necesita JavaScript. Si no podés ejecutarlo, usá la API.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            Devuelve el mismo precio que este formulario, con una sola llamada GET,
            sin API key ni registro. Acepta medidas en milímetros o en centímetros:
          </p>
          <p style={{ margin: '0 0 8px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {ejemplo}
          </p>
          <p style={{ margin: 0 }}>
            La respuesta incluye el precio por caja, el total, el plazo de producción y
            una frase lista para leerle al usuario. Documentación en{' '}
            {SITE_URL}/api/v1/docs y en {SITE_URL}/llms.txt. Los precios publicados
            están en {SITE_URL}/precios.
          </p>
        </div>
      </noscript>

      <p className={`text-xs text-gray-500 ${className}`}>
        ¿Necesitás cotizar desde otro sistema o desde un asistente de IA? El mismo
        precio se obtiene con una llamada:{' '}
        <a
          href="/api/v1/docs"
          className="text-[#002E55] underline underline-offset-2 hover:text-[#001a33]"
        >
          ver la API
        </a>
        , gratuita y sin registro.
      </p>
    </>
  );
}
