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
 * dice "es", Meta rechaza el envío con un error que no explica nada. Paso: se
 * cargó como "Spanish (ARG)", que es es_AR, y el default acá decía es.
 *
 * OJO CON LA CUENTA: las plantillas pertenecen a una WhatsApp Business Account,
 * no a la app. La que se cargue en la cuenta de prueba no existe en la cuenta
 * real: cuando se registre el número definitivo hay que volver a crearla ahí.
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
  /**
   * El botón de URL dinámica, si la plantilla lleva uno.
   *
   * POR QUÉ EL LINK VA EN UN BOTÓN Y NO EN EL TEXTO
   *
   * Un link en medio de un párrafo, en un teléfono, es un blanco chico y se
   * pierde entre las líneas. El botón nativo de WhatsApp va abajo del mensaje,
   * ocupa el ancho y no compite con nada. Y en estos avisos el link ES la
   * acción: lleva a la página donde el cliente ve su pedido y —cuando debe
   * plata— copia el alias y el CBU con un toque, que es lo que un WhatsApp no
   * puede hacer.
   *
   * Meta acepta la variable SOLO al final de la URL, que es justo la forma del
   * token. La parte fija queda revisada en la aprobación: cambiar el dominio o
   * el path obliga a dar de alta plantillas nuevas.
   */
  botonUrl?: {
    /** Lo que dice el botón. Máximo 25 caracteres. */
    texto: string;
    /** La URL sin la variable, tal cual se carga en Meta. */
    base: string;
  };
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
  // es_AR y no es: asi quedo cargada en Meta, como "Spanish (ARG)". El codigo
  // de idioma tiene que coincidir EXACTO con el de la plantilla o el envio
  // falla con un error que no dice cual es el problema. Se deja la variable
  // por si algun dia se carga distinto, pero el default es lo que hay.
  idioma: process.env.META_WA_IDIOMA_PLANTILLAS || 'es_AR',
  variables: 0,
  categoria: 'UTILITY',
  cuerpo:
    'Hola, te escribimos de Quilmes Corrugados por tu consulta de cajas.\n\n' +
    'Tenemos la respuesta lista. Respondé este mensaje y seguimos por acá.',
};


// ─────────────────────────────────────────────────────────────────────────────
// LOS AVISOS DEL CICLO DE VIDA DEL PEDIDO
//
// Seis eventos, seis plantillas. Es el mínimo que cubre el flujo: menos obliga
// a unir avisos que dicen cosas distintas, más es trámite muerto.
//
// LAS TRES REGLAS QUE LES DAN LA FORMA, todas aprendidas rebotando:
//
//   1. Ninguna variable puede ser lo primero ni lo último del cuerpo. Por eso
//      todas cierran con una línea de texto, que además invita a responder —y
//      una respuesta del cliente reabre la ventana de 24 horas, que es lo que
//      permite seguir la conversación en texto libre.
//   2. Meta rechaza el envío ENTERO si cualquier variable llega vacía. Por eso
//      cada una es un dato que existe siempre: el número de orden lo genera la
//      base, los montos siempre están calculados, las fechas tienen texto de
//      reserva. Ninguna depende de que alguien haya cargado algo opcional.
//   3. El link va en el botón y no en el texto, con la variable al final de la
//      URL, que es la única forma que Meta acepta.
//
// EL DOMINIO VA ESCRITO ACÁ Y NO SALE DE SITE_URL a propósito: lo que vale es
// lo que quedó aprobado en Meta, no lo que diga una variable de entorno. Si
// algún día no coinciden, el que está mal es el código.
// ─────────────────────────────────────────────────────────────────────────────

/** La página es siempre la misma; lo que cambia es a qué se va. */
const URL_SEGUIMIENTO = 'https://www.quilmescorrugados.com.ar/pedido/';

/** Los cinco avisos informativos: se va a mirar cómo viene el pedido. */
const BOTON_SEGUIMIENTO = { texto: 'Ver mi pedido', base: URL_SEGUIMIENTO } as const;

/**
 * El aviso del saldo: no se va a mirar, se va a PAGAR.
 *
 * El botón dice a dónde lleva de verdad —a los datos— y no "copiar el alias",
 * que sería mentira: el botón navega, el que copia es el de la página. Y la
 * página, cuando hay algo por pagar, pone esos datos primero, antes del
 * timeline, porque es a lo que vino la persona.
 */
const BOTON_PARA_PAGAR = { texto: 'Datos para transferir', base: URL_SEGUIMIENTO } as const;

const IDIOMA = process.env.META_WA_IDIOMA_PLANTILLAS || 'es_AR';

/**
 * La seña entró y el pedido queda agendado.
 *
 * El saldo va como ESTIMADO y con el motivo al lado: la cantidad producida
 * varía hasta un 5% y se factura lo entregado, así que el número exacto recién
 * existe cuando se confirman las cantidades. Prometer acá un número cerrado
 * que después cambia es un reclamo asegurado.
 */
export const PEDIDO_CONFIRMADO: Plantilla = {
  nombre: 'pedido_confirmado',
  idioma: IDIOMA,
  variables: 2,
  categoria: 'UTILITY',
  botonUrl: BOTON_SEGUIMIENTO,
  cuerpo:
    'Hola, te escribimos de Quilmes Corrugados.\n\n' +
    'Recibimos la seña del pedido *{{1}}*. Queda confirmado y agendado para fabricar.\n\n' +
    'Saldo estimado: *$ {{2}}*. La cantidad producida puede variar hasta un 5% ' +
    '—así se fabrica el cartón— y se factura lo entregado, por eso el saldo final ' +
    'se confirma al terminar la fabricación.\n\n' +
    'Ante cualquier duda, respondé este mensaje.',
};

/** Arrancó la fabricación. Es el aviso que pidió el dueño con todas las letras. */
export const PEDIDO_EN_PRODUCCION: Plantilla = {
  nombre: 'pedido_en_produccion',
  idioma: IDIOMA,
  variables: 2,
  categoria: 'UTILITY',
  botonUrl: BOTON_SEGUIMIENTO,
  cuerpo:
    'Hola, te escribimos de Quilmes Corrugados.\n\n' +
    'Empezamos a fabricar el pedido *{{1}}*.\n' +
    'Fecha estimada de entrega: *{{2}}*.\n\n' +
    'Ante cualquier duda, respondé este mensaje.',
};

/**
 * Salió de máquina: acá el número YA es el final.
 *
 * Es el único aviso donde el saldo no es estimado, y por eso lo dice. El alias
 * va como variable y no en el cuerpo fijo: si cambia el banco, cambia el dato
 * sin re-aprobar la plantilla.
 */
export const PEDIDO_SALDO_ACTUALIZADO: Plantilla = {
  nombre: 'pedido_saldo_actualizado',
  idioma: IDIOMA,
  variables: 3,
  categoria: 'UTILITY',
  botonUrl: BOTON_PARA_PAGAR,
  cuerpo:
    'Hola, te escribimos de Quilmes Corrugados.\n\n' +
    'El pedido *{{1}}* está listo. Confirmamos las cantidades finales: el saldo a pagar es *$ {{2}}*.\n\n' +
    'Alias para transferir: *{{3}}*\n' +
    // El alias de la fábrica termina en punto, y en una línea de texto ese
    // punto se lee como puntuación. En vez de aclararlo —que obligaría a saber
    // de antemano cómo es el alias— se empuja al botón, donde se copia el
    // valor exacto de un toque. Resuelve el problema sea cual sea el alias.
    'Tocá el botón de abajo para copiarlo sin errores.\n\n' +
    'Cuando confirmes la transferencia por acá, coordinamos la entrega.',
};

export const PEDIDO_DESPACHADO: Plantilla = {
  nombre: 'pedido_despachado',
  idioma: IDIOMA,
  variables: 2,
  categoria: 'UTILITY',
  botonUrl: BOTON_SEGUIMIENTO,
  cuerpo:
    'Hola, te escribimos de Quilmes Corrugados.\n\n' +
    'Despachamos el pedido *{{1}}* el *{{2}}*. Ya está en camino.\n\n' +
    'Ante cualquier duda, respondé este mensaje.',
};

export const PEDIDO_ENTREGADO: Plantilla = {
  nombre: 'pedido_entregado',
  idioma: IDIOMA,
  variables: 1,
  categoria: 'UTILITY',
  botonUrl: BOTON_SEGUIMIENTO,
  cuerpo:
    'Hola, te escribimos de Quilmes Corrugados.\n\n' +
    'El pedido *{{1}}* figura como entregado. Gracias por confiar en nosotros.\n\n' +
    'Si tenés algún tema con la entrega, respondé este mensaje.',
};

/**
 * Se canceló.
 *
 * Existe para que el cliente no se entere preguntando. Cierra invitando a
 * retomar: una cancelación no siempre es el final de la operación.
 */
export const PEDIDO_CANCELADO: Plantilla = {
  nombre: 'pedido_cancelado',
  idioma: IDIOMA,
  variables: 1,
  categoria: 'UTILITY',
  botonUrl: BOTON_SEGUIMIENTO,
  cuerpo:
    'Hola, te escribimos de Quilmes Corrugados.\n\n' +
    'El pedido *{{1}}* fue cancelado.\n\n' +
    'Si querés retomar la operación o necesitás una explicación, respondé este ' +
    'mensaje y te contactamos.',
};


export const PLANTILLAS = [
  RETOMAR_CONVERSACION,
  PEDIDO_CONFIRMADO,
  PEDIDO_EN_PRODUCCION,
  PEDIDO_SALDO_ACTUALIZADO,
  PEDIDO_DESPACHADO,
  PEDIDO_ENTREGADO,
  PEDIDO_CANCELADO,
];
