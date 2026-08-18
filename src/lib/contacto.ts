/**
 * Los datos de contacto del negocio, en un solo lugar.
 *
 * POR QUE EXISTE
 *
 * El telefono estaba escrito a mano 32 veces, en 22 archivos y en cuatro
 * formatos distintos: el E.164 para los links de wa.me, el formato visible con
 * separadores, el local con 011, y el crudo sin nada. Cambiarlo significaba
 * encontrar los 32 y no equivocarse en ninguno.
 *
 * El riesgo no es simetrico. Varias de esas apariciones estan en las
 * superficies que lee un asistente de IA —llms.txt, la respuesta de la API, el
 * servidor MCP, el schema.org— y esas se repiten como dato verificado. Un
 * numero viejo ahi no es una molestia: es un lead que llama a un telefono que
 * no atiende y no vuelve a intentar.
 *
 * Es el mismo patron que ya obligo a corregir tres veces los colores de
 * impresion y una vez el IVA: el mismo hecho viviendo en muchos lados y
 * actualizandose solo en algunos.
 *
 * SI CAMBIA EL NUMERO DE WHATSAPP, ojo con esto: cambiar la constante arregla
 * lo que el sitio MUESTRA, pero no de donde RECIBE. El bot atiende en el
 * numero de Twilio, que vive en las variables TWILIO_NUMBER y
 * TWILIO_WHATSAPP_NUMBER. Si no se actualizan tambien, el sitio manda gente a
 * un numero donde no hay nadie escuchando.
 */

/** Solo digitos, con codigo de pais y sin el "+". Es lo que espera wa.me. */
const E164 = '5491133411781';

export const CONTACTO = {
  /** Para armar enlaces de WhatsApp y de teléfono. */
  telefonoE164: E164,

  /** Como se muestra. */
  telefonoVisible: '+54 9 11 3341-1781',

  /** Formato local, para el pie y las fichas de contacto. */
  telefonoLocal: '011 3341-1781',

  /** Link directo a la conversación, sin mensaje. */
  whatsapp: `https://wa.me/${E164}`,

  /** Link con un mensaje ya escrito. */
  whatsappCon: (mensaje: string) => `https://wa.me/${E164}?text=${encodeURIComponent(mensaje)}`,

  /** Para href="tel:". */
  tel: `+${E164}`,

  email: 'ventas@quilmescorrugados.com.ar',

  direccion: 'Lugones 219, B1878 Quilmes, Buenos Aires',
  localidad: 'Quilmes',
  provincia: 'Buenos Aires',
  pais: 'Argentina',
} as const;
