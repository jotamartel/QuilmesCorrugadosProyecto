/**
 * Las plantillas de WhatsApp aprobadas por Meta.
 *
 * POR QUÉ HACEN FALTA
 *
 * WhatsApp deja escribir texto libre solo dentro de las 24 horas del último
 * mensaje del cliente. Pasado eso, la conversación queda cerrada: el vendedor
 * abre el panel, ve la consulta de ayer, escribe la respuesta y le rebota. Hoy
 * eso pasa y la única salida es que el cliente vuelva a escribir por su cuenta.
 *
 * Una plantilla es un texto fijo que Meta revisó y aprobó de antemano. Se puede
 * mandar fuera de la ventana, y cuando el cliente contesta la ventana se
 * reabre y ahí sí se puede hablar normal. O sea: la plantilla no lleva la
 * respuesta, lleva el golpe en la puerta.
 *
 * POR QUÉ SIN VARIABLES
 *
 * Se puede personalizar con {{1}}, {{2}}… pero Meta exige que TODAS las
 * variables lleguen con contenido: mandar una vacía es un error de la API. De
 * los leads de WhatsApp, muchos nunca dijeron su nombre, así que una plantilla
 * con {{1}} = nombre falla justo en los casos donde más hace falta. El nombre
 * no vale ese riesgo.
 *
 * CÓMO SE DAN DE ALTA
 *
 * En el Administrador de WhatsApp de Meta → Herramientas → Plantillas de
 * mensajes → Crear plantilla. El `nombre` de acá tiene que coincidir EXACTO con
 * el de allá, y el `idioma` también: si el texto se carga como "es_AR" y acá
 * dice "es", Meta rechaza el envío con un error que no explica nada.
 *
 * La categoría importa. UTILITY (Utilidad / Servicio) es la que corresponde
 * —hay una consulta previa del cliente y esto es su seguimiento— y además es
 * más barata que MARKETING y se aprueba sin vueltas. Cargarla como MARKETING
 * la hace pasar por las reglas de publicidad, que son otras.
 */

/** Una plantilla tal como está dada de alta en Meta. */
export interface Plantilla {
  /** Debe coincidir EXACTO con el nombre en el Administrador de WhatsApp. */
  nombre: string;
  /** El código de idioma con que se cargó allá: "es", "es_AR", "es_ES". */
  idioma: string;
  /** Cuántas variables {{n}} tiene el cuerpo. Cero es lo que buscamos. */
  variables: number;
  /**
   * El texto exacto que hay que cargar en Meta.
   *
   * Vive acá al lado del código y no solo en el panel de Meta a propósito:
   * cuando alguien lea esto dentro de seis meses va a querer saber qué le llega
   * al cliente sin tener que entrar a la cuenta.
   */
  cuerpo: string;
  categoria: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
}

/**
 * Reabrir una conversación que se pasó de las 24 horas.
 *
 * No lleva la respuesta adentro: invita a contestar. Cuando el cliente
 * responde, la ventana se abre y el vendedor escribe lo que tenga que escribir
 * como en cualquier conversación.
 */
export const RETOMAR_CONVERSACION: Plantilla = {
  nombre: 'retomar_conversacion',
  idioma: process.env.META_WA_IDIOMA_PLANTILLAS || 'es',
  variables: 0,
  categoria: 'UTILITY',
  cuerpo:
    'Hola, te escribimos de Quilmes Corrugados por tu consulta de cajas.\n\n' +
    'Tenemos la respuesta lista. Respondé este mensaje y seguimos por acá.',
};

export const PLANTILLAS = [RETOMAR_CONVERSACION];
