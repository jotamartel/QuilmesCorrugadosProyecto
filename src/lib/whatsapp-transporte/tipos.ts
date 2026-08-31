/**
 * El contrato del transporte de WhatsApp.
 *
 * POR QUÉ EXISTE
 *
 * El webhook tiene casi mil líneas y son casi todas lógica de negocio: cotizar,
 * derivar, guardar el lead, pausar al asistente. Twilio aparecía metido en
 * cuatro lugares de esa lógica —cómo entra el mensaje, cómo se responde, cómo
 * se envía, cómo se valida la firma— así que cambiar de proveedor obligaba a
 * abrir el archivo entero y tocar cosas que no tienen nada que ver con el
 * proveedor.
 *
 * Con esta capa en el medio, la lógica de negocio no sabe quién trae el mensaje.
 * Cambiar de proveedor es cambiar una variable de entorno.
 *
 * POR QUÉ DOS IMPLEMENTACIONES Y NO UN REEMPLAZO DIRECTO
 *
 * La cuenta de WhatsApp Business con Meta necesita verificación de negocio, que
 * es un trámite de días. Hasta que esté, el canal tiene que seguir funcionando.
 * Con las dos adentro se prueba en Twilio mientras el trámite avanza, se cambia
 * la variable cuando la cuenta está lista, y si algo sale mal se vuelve atrás en
 * un minuto. Cuando Meta esté estable, se borra la implementación de Twilio.
 */

/**
 * Un archivo que vino adjunto en un mensaje: la referencia para descargarlo,
 * no los bytes. El proveedor guarda el archivo un tiempo (Meta, 30 días) y lo
 * entrega recién cuando se le pide con el id.
 */
export interface MediaEntrante {
  /** El id con que el proveedor guarda el archivo, para pedírselo después. */
  id: string;
  /**
   * Los stickers van aparte de las imágenes a propósito: son webp con otra
   * intención —un saludo, un ok— y quien los procese puede decidir distinto.
   */
  tipo: 'imagen' | 'audio' | 'video' | 'documento' | 'sticker';
  /** Como lo reporta el proveedor, p. ej. "audio/ogg; codecs=opus". */
  mime: string | null;
  /** El texto que acompaña una foto o un documento, si la persona escribió uno. */
  caption: string | null;
  /** Solo documentos: el nombre con que la persona mandó el archivo. */
  nombreDeArchivo: string | null;
}

/** Los bytes de un archivo ya descargado del proveedor. */
export interface MediaDescargada {
  datos: Uint8Array;
  mime: string;
}

/** Un mensaje entrante, ya sin las particularidades del proveedor. */
export interface MensajeEntrante {
  /**
   * En formato E.164 con el más adelante: +5491133411781.
   *
   * Es la forma en que ya está guardado el historial, así que los dos
   * proveedores tienen que normalizar a esto. Twilio lo manda como
   * "whatsapp:+549…" y Meta como "549…" sin el más: si alguno de los dos se
   * desvía, las conversaciones de ese cliente se parten en dos y el panel
   * muestra la mitad.
   */
  telefono: string;
  /** El texto del mensaje. Vacío cuando el cliente mandó solo un audio o una foto. */
  texto: string;
  tieneMedia: boolean;
  /**
   * El adjunto del mensaje, si trajo uno. Un mensaje de WhatsApp lleva a lo
   * sumo un archivo —mandar tres fotos son tres mensajes—, así que acá va uno
   * solo; el webhook junta los del lote.
   *
   * Es opcional y solo está cuando hay adjunto, a propósito: las pruebas de
   * los transportes comparan el mensaje entero contra el esperado, y un campo
   * que aparece en todos los mensajes de texto las obliga a saberlo.
   */
  media?: MediaEntrante;
  /**
   * El id que le puso el proveedor a este mensaje.
   *
   * Todavía no se usa. Queda expuesto porque es lo que hace falta para volver
   * idempotente al webhook —hoy no lo es, y el propio código lo comenta—: un
   * reintento del proveedor puede avanzar el flujo dos veces.
   */
  id: string | null;
}

/** Una plantilla lista para mandar, con sus variables ya resueltas. */
export interface PlantillaAEnviar {
  /** El nombre con que está dada de alta en Meta. */
  nombre: string;
  /** El código de idioma con que está dada de alta: "es", "es_AR". */
  idioma: string;
  /** Los valores de {{1}}, {{2}}… en orden. Vacío si la plantilla no tiene. */
  variables?: string[];
  /**
   * El valor de la variable del botón de URL, si la plantilla lleva uno.
   *
   * NUMERACIÓN APARTE: el botón tiene su propio {{1}}, independiente del
   * cuerpo. Una plantilla con dos variables en el cuerpo y un botón manda
   * {{1}} y {{2}} en el cuerpo, y otro {{1}} en el botón.
   */
  variableDeBoton?: string;
}

/** Lo que el webhook necesita de un proveedor, y nada más. */
export interface Transporte {
  readonly nombre: 'twilio' | 'meta';

  /** Si hay credenciales para operar. Sin esto el webhook no intenta responder. */
  configurado(): boolean;

  enviarTexto(telefono: string, texto: string): Promise<boolean>;
  enviarDocumento(telefono: string, urlDelArchivo: string): Promise<boolean>;

  /**
   * Trae los bytes de un adjunto a partir del id que vino en el mensaje.
   *
   * Devuelve null si no se pudo: sin credenciales, archivo vencido, o más
   * grande que el límite. Quien llama decide qué decirle al cliente en ese
   * caso; acá solo se registra el motivo.
   *
   * Es opcional porque Twilio entrega la media de otra forma —una URL con
   * basic auth en el propio webhook— y no vale la pena traducirla para un
   * proveedor que estamos por dejar. Ver el comentario de enviarPlantilla.
   */
  descargarMedia?(id: string): Promise<MediaDescargada | null>;

  /**
   * Manda una plantilla aprobada por Meta.
   *
   * Es la unica forma de escribirle a alguien fuera de la ventana de 24 horas.
   * Ver src/lib/whatsapp-plantillas.ts para el porque y para los textos.
   *
   * Es opcional porque el modelo de plantillas de Twilio es otro —van por
   * Content SID, dadas de alta en el panel de Twilio, no en el de Meta— y no
   * tiene sentido inventar una traduccion para un proveedor que estamos por
   * dejar. Cuando no esta, quien llama tiene que decirlo claro en vez de fallar
   * en silencio.
   */
  enviarPlantilla?(telefono: string, plantilla: PlantillaAEnviar): Promise<boolean>;

  /**
   * Valida que la llamada venga de verdad del proveedor.
   *
   * Devuelve null SOLO cuando no tenemos con qué comprobarlo —falta la clave en
   * la configuración—. Que la request no traiga firma NO es null: si tenemos la
   * clave y el que llama no firmó, no es el proveedor, y eso es false.
   *
   * La distinción importa porque el webhook bloquea con false y deja pasar con
   * null: si "sin firma" contara como null, cualquiera que descubra la URL entra
   * simplemente omitiendo la cabecera, que es el agujero exacto que esto cierra.
   */
  firmaValida(request: Request, cuerpoCrudo: string): Promise<boolean | null>;

  /**
   * Si una firma que no cierra corta la request o solo queda anotada.
   *
   * No es lo mismo para los dos proveedores y por eso lo decide cada uno:
   *
   * - Meta firma un HMAC sobre el cuerpo crudo. Es determinístico, no depende de
   *   reconstruir nada, y está probado en scripts/qa-transporte-whatsapp.mts. Si
   *   no cierra, o la clave está mal o no es Meta. Bloquea.
   * - Twilio firma la URL más los campos del formulario, y la URL que firma es la
   *   que tiene cargada en su panel, que detrás de un proxy puede no ser la que
   *   ve el servidor. Ahí un rechazo puede ser culpa nuestra y se lleva puestos
   *   mensajes de clientes reales. No bloquea.
   *
   * WHATSAPP_FIRMA_ESTRICTA lo fuerza en cualquiera de los dos sentidos.
   */
  readonly rechazaFirmaInvalida: boolean;

  /**
   * Interpreta el cuerpo del webhook. Devuelve una lista vacía si lo que llegó
   * no es un mensaje de nadie.
   *
   * DEVUELVE UNA LISTA, no uno solo, porque Meta batchea: un mismo POST puede
   * traer varios `entry`, varios `changes` y varios `messages`, y pasa sobre
   * todo cuando alguien manda dos mensajes seguidos y cuando Meta reintenta una
   * entrega que se le acumuló. Leyendo solo el primero, el resto se perdía en
   * silencio: el cliente escribía "hola" y "necesito cajas" y del segundo no
   * quedaba ni registro en el panel.
   *
   * Twilio manda uno por request, así que ahí la lista trae cero o uno.
   */
  leerEntrantes(cuerpoCrudo: string, request: Request): MensajeEntrante[];

  /**
   * Lo que hay que contestarle al proveedor para que dé el mensaje por recibido.
   *
   * Twilio espera TwiML —un XML vacío significa "no respondas nada por tu
   * cuenta"—; Meta espera un 200 pelado. Es la clase de detalle que estaba
   * repetido seis veces en el webhook.
   */
  respuestaDeRecibido(): Response;

  /**
   * El saludo de alta, si el proveedor lo pide.
   *
   * Meta verifica el webhook con un GET que trae un desafío y espera que se le
   * devuelva tal cual. Twilio no hace nada parecido, así que devuelve null.
   */
  responderVerificacionDeAlta?(request: Request): Response | null;
}

/**
 * Deja un teléfono en la forma en que está guardado el historial.
 *
 * OJO CON ARGENTINA. Los celulares argentinos llevan un 9 después del código de
 * país —+54 9 11…— pero ese 9 no siempre viaja: según por dónde entre el
 * mensaje puede llegar como +5411… Si se guardan las dos formas, el mismo
 * cliente aparece como dos conversaciones distintas y quien atiende ve la mitad
 * de lo que se habló.
 *
 * Acá se normaliza a la forma CON 9, que es la que ya está en la base. No está
 * verificado contra tráfico real de Meta todavía: cuando la cuenta esté activa
 * hay que confirmar con qué forma llegan los mensajes de verdad antes de darlo
 * por bueno.
 */
export function normalizarTelefono(crudo: string): string {
  let n = crudo.replace('whatsapp:', '').replace(/[^\d+]/g, '');

  // Sin un solo digito no es un telefono, y devolver algo igual es peor que
  // devolver vacio: con la version anterior, un mensaje sin remitente salia de
  // aca como "+" —el mas que se agrega abajo, y nada mas— y eso pasaba el
  // control de "tiene telefono?" de los dos transportes. Se abria una
  // conversacion a nombre de "+", con su historial y su pausa.
  if (!/\d/.test(n)) return '';

  if (!n.startsWith('+')) n = '+' + n;

  // +54 seguido de un area y un numero, sin el 9 de celular.
  if (n.startsWith('+54') && !n.startsWith('+549')) {
    n = '+549' + n.slice(3);
  }
  return n;
}
