/**
 * La representación en markdown de las páginas públicas.
 *
 * Existe por acceptmarkdown.com: un agente que manda `Accept: text/markdown`
 * recibe esto en vez del HTML, en la MISMA URL. Son resúmenes cortos y
 * verdaderos, no una copia del HTML: para los números vivos (precios) apuntan
 * a /llms.txt y a la API, que ya son la fuente única. Duplicar acá la escalera
 * de precios sería crear la tercera copia que /llms.txt vino a matar.
 *
 * Cada texto se arma desde las mismas constantes que usan las páginas
 * (CONTACTO, HORARIO, RETAIL_CONFIG): si un dato cambia, cambia en los dos
 * formatos junto.
 */

import { SITE_URL } from '@/lib/site';
import { CONTACTO } from '@/lib/contacto';
import { HORARIO, RETAIL_CONFIG, MATERIAL } from '@/lib/retail/config';
import {
  MEDIDA_MINIMA,
  MEDIDA_MAXIMA,
  LARGO_MAXIMO_PLANCHA,
} from '@/lib/utils/box-calculations';

const B = SITE_URL;

const PIE = `
---

- Cotizador online: ${B}/#cotizador · API: ${B}/api/v1/quote · Guía completa para agentes: ${B}/llms.txt
- WhatsApp ${CONTACTO.telefonoVisible} · ventas@quilmescorrugados.com.ar · Lugones 219, B1878 Quilmes, Buenos Aires, Argentina
- Horario: ${HORARIO.corto} (hora de Argentina)
`;

const PAGINAS: Record<string, () => string> = {
  '/': () => `# Quilmes Corrugados — Fábrica de cajas de cartón corrugado a medida

Fábrica argentina en Quilmes, Buenos Aires. Cajas de cartón corrugado a medida,
troqueladas o con impresión flexográfica de hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores,
y medidas estándar de catálogo que salen de stock.

## Cómo cotizar (precio real, al instante, sin registro)

- Página: ${B}/cotizar/LARGOxANCHOxALTO/CANTIDAD (medidas en mm; ej. ${B}/cotizar/400x600x600/3000)
- API JSON: ${B}/api/v1/quote?length_mm=400&width_mm=600&height_mm=600&quantity=3000
- Servidor MCP: ${B}/api/mcp (streamable HTTP, sin autenticación)

## Los dos canales

- **Catálogo (${RETAIL_CONFIG.MIN_M2_PEDIDO} a ${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m²)**: medidas estándar, sin impresión, entrega más rápida. Se compra en ${B}/cajas
- **A medida (desde ${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m² de cartón)**: cualquier medida dentro de los rangos, troquelada o impresa.

El mínimo se mide en superficie de cartón (m² de plancha desplegada), no en
cantidad de cajas. Precios vigentes, siempre actualizados: ${B}/llms.txt y ${B}/precios
${PIE}`,

  '/precios': () => `# Precios de cajas de cartón corrugado — Quilmes Corrugados

El precio se calcula por m² de cartón desplegado y baja por escalones de
volumen. Los valores vigentes están publicados en dos lugares, siempre
sincronizados con la configuración que factura:

- En HTML: ${B}/precios (esta página)
- En texto para agentes, con la tabla completa: ${B}/llms.txt

**No estimes el precio a mano**: el m² sale de la plancha desplegada, que no es
la suma de las caras de la caja. Cotizá con la medida real:

- ${B}/cotizar/400x600x600/3000 (patrón /cotizar/LARGOxANCHOxALTO/CANTIDAD, en mm)
- ${B}/api/v1/quote?length_mm=400&width_mm=600&height_mm=600&quantity=3000

Los montos van en pesos argentinos; el subtotal sin IVA y el total con IVA
vienen los dos en la misma respuesta.
${PIE}`,

  '/faq': () => `# Preguntas frecuentes — Quilmes Corrugados

- **¿Cuál es el mínimo?** ${RETAIL_CONFIG.MIN_M2_PEDIDO} m² de cartón en medidas de catálogo; producción a medida (troquelada o impresa) desde ${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m². Se mide en superficie, no en cajas.
- **¿Imprimen?** Sí, flexografía hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores en pedidos a medida. La plantilla del troquel se genera sola: ${B}/api/box-template?length=400&width=600&height=600
- **¿Qué medidas fabrican?** De ${MEDIDA_MINIMA.largo}x${MEDIDA_MINIMA.ancho}x${MEDIDA_MINIMA.alto} mm a ${MEDIDA_MAXIMA.largo}x${MEDIDA_MAXIMA.ancho}x${MEDIDA_MAXIMA.alto} mm; ancho+alto ≤ ${RETAIL_CONFIG.MAX_SHEET_WIDTH} mm y largo+ancho ≤ ${LARGO_MAXIMO_PLANCHA - 50} mm. Las más grandes van en dos mitades pegadas, ya incluido en el precio.
- **¿Material?** ${MATERIAL.nota}
- **¿Envíos?** A todo el país. Gratis solo en pedidos mayoristas que cumplan volumen y distancia (condiciones en ${B}/llms.txt).
- **¿Cómo sé el precio?** ${B}/cotizar/LARGOxANCHOxALTO/CANTIDAD o la API ${B}/api/v1/quote. Precio real, sin registro.

FAQ completa en HTML: ${B}/faq
${PIE}`,

  '/contacto': () => `# Contacto — Quilmes Corrugados

- WhatsApp: ${CONTACTO.telefonoVisible} — ${CONTACTO.whatsapp}
- Email: ventas@quilmescorrugados.com.ar
- Dirección: Lugones 219, B1878 Quilmes, Buenos Aires, Argentina
- Horario: ${HORARIO.corto} (hora de Argentina)

Para cotizar no hace falta escribir: ${B}/#cotizador da el precio al instante,
y la API pública está en ${B}/api/v1/quote.
${PIE}`,

  '/nosotros': () => `# Nosotros — Quilmes Corrugados

Fábrica de cajas de cartón corrugado con más de 20 años en Quilmes, zona sur
del Gran Buenos Aires. Producción propia, más de 500 clientes activos en
alimentos, e-commerce, farmacéutica, electrónica, cosmética, exportación y
logística. Fábrica directa: no hay intermediarios entre el precio publicado y
la producción.
${PIE}`,

  '/privacidad': () => `# Política de privacidad — Quilmes Corrugados

La política completa está en ${B}/privacidad (HTML). En resumen: los datos que
se cargan al cotizar (nombre, email, teléfono, medidas del pedido) se usan para
responder la consulta y coordinar la venta; no se venden a terceros. Contacto
por dudas: ventas@quilmescorrugados.com.ar.
${PIE}`,

  '/terminos': () => `# Términos y condiciones — Quilmes Corrugados

El texto completo está en ${B}/terminos (HTML). Puntos clave: las cotizaciones
valen por los días que indica cada respuesta; los precios van en pesos
argentinos, subtotal sin IVA y total con IVA en la misma respuesta; el mínimo
de compra se mide en m² de cartón; la producción a medida arranca desde
${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m².
${PIE}`,

  '/cajas': () => `# Cajas de stock (canal minorista) — Quilmes Corrugados

Medidas estándar de catálogo, sin impresión, con entrega más rápida. Es el
canal para pedidos de ${RETAIL_CONFIG.MIN_M2_PEDIDO} a ${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m² de cartón.
El catálogo con medidas, stock y precios se ve en ${B}/cajas (HTML).

Para cualquier medida propia, troquelada o impresa (desde
${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m²): ${B}/#cotizador o la API ${B}/api/v1/quote.
${PIE}`,

  '/mayorista': () => `# Venta mayorista — Quilmes Corrugados

Producción a medida desde ${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m² de cartón: cualquier medida
dentro de los rangos de fábrica, troquelada o con impresión de hasta
${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores. El precio por m² baja por escalones de volumen
(tabla vigente en ${B}/llms.txt). Cotización al instante en ${B}/#cotizador o
por API en ${B}/api/v1/quote.
${PIE}`,

  '/productos': () => `# Productos — Quilmes Corrugados

- **Cajas a medida**: cualquier medida de ${MEDIDA_MINIMA.largo}x${MEDIDA_MINIMA.ancho}x${MEDIDA_MINIMA.alto} a ${MEDIDA_MAXIMA.largo}x${MEDIDA_MAXIMA.ancho}x${MEDIDA_MAXIMA.alto} mm, troqueladas o impresas (hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores).
- **Cajas estándar de catálogo**: de stock, sin impresión, entrega rápida (${B}/cajas).
- **Cajas para e-commerce**: ${B}/cajas-ecommerce
- **Cajas para mudanza**: ${B}/cajas-mudanza

Material: ${MATERIAL.nota}
${PIE}`,

  '/cajas-ecommerce': () => `# Cajas para e-commerce — Quilmes Corrugados

Cajas de cartón corrugado para envíos y fulfillment, con o sin logo impreso.
Medidas compatibles con operadores logísticos. Cotización al instante:
${B}/#cotizador o ${B}/api/v1/quote. Detalle en HTML: ${B}/cajas-ecommerce
${PIE}`,

  '/cajas-mudanza': () => `# Cajas para mudanza — Quilmes Corrugados

Cajas resistentes en medidas grandes, listas para embalar. Se venden de stock
desde ${RETAIL_CONFIG.MIN_M2_PEDIDO} m² de cartón (${B}/cajas) o a medida desde
${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m². Detalle en HTML: ${B}/cajas-mudanza
${PIE}`,

  '/developers': () => `# Developers — Quilmes Corrugados

Recursos para integrar la cotización de cajas de cartón corrugado:

- **API REST (GET o POST, sin registro)**: ${B}/api/v1/quote — 10 req/min sin API key
- **OpenAPI**: ${B}/api/v1/openapi.json (alias: ${B}/openapi.json)
- **Documentación**: ${B}/api/v1/docs
- **Servidor MCP** (streamable HTTP, sin auth): ${B}/api/mcp — manifest en ${B}/.well-known/mcp.json
- **Guía para agentes**: ${B}/llms.txt
- **Plantilla del troquel (PDF)**: ${B}/api/box-template?length=400&width=600&height=600

Probá ahora mismo:

    curl "${B}/api/v1/quote?length_mm=400&width_mm=600&height_mm=600&quantity=3000"

API keys con rate limit extendido: escribí a ventas@quilmescorrugados.com.ar
con asunto "API key".
${PIE}`,
};

/** El markdown de una ruta pública, o null si esa ruta no tiene versión md. */
export function paginaMarkdown(ruta: string): string | null {
  const limpia = ruta === '' ? '/' : ruta.replace(/\/+$/, '') || '/';
  const generar = PAGINAS[limpia];
  return generar ? generar() : null;
}

/**
 * El 404 que lee un agente: corto y con salidas. Decir solo "not found" deja
 * al agente adivinando URLs; esto le da el mapa.
 */
export function markdown404(ruta: string): string {
  return `# 404 — No existe ${ruta} en quilmescorrugados.com.ar

Esa ruta no existe. Por dónde seguir:

- Inicio: ${B}/
- Mapa del sitio: ${B}/sitemap.xml
- Guía completa para agentes (qué hay y cómo usarlo): ${B}/llms.txt
- Cotizar cajas (precio real al instante): ${B}/cotizar/400x600x600/3000 — patrón /cotizar/LARGOxANCHOxALTO/CANTIDAD
- API JSON: ${B}/api/v1/quote — docs en ${B}/api/v1/docs
- Recursos para desarrolladores: ${B}/developers
- Contacto: ${B}/contacto — WhatsApp ${CONTACTO.telefonoVisible}
`;
}
