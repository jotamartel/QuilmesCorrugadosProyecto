import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActivePricingConfig } from '@/lib/utils/pricing';
import {
  calcularCotizacion,
  precioUnitarioARS,
  urlPlantilla,
  notaImpresion,
  instruccionDeImpedimento,
  mensajeDeImpedimento,
} from '@/lib/cotizacion/motor';
import { RETAIL_CONFIG, MINIMOS, ENVIO, HORARIO, MATERIAL } from '@/lib/retail/config';
import { MEDIDA_MINIMA, MEDIDA_MAXIMA } from '@/lib/utils/box-calculations';
import { buscarConocimiento, anotarPreguntaSinRespuesta } from '@/lib/conocimiento';
import { getBankDataForClient } from '@/lib/config/system';
import { sendNotification } from '@/lib/notifications';
import { CONTACTO } from '@/lib/contacto';
import { upsertContactProfile } from '@/lib/contact-matching';
import { SITE_URL } from '@/lib/site';

/**
 * Las herramientas del agente de ventas.
 *
 * POR QUE ESTAN ACA Y NO EN EL PROMPT
 *
 * Durante meses el chat tuvo escrito en el prompt "NUNCA inventes precios
 * exactos". Medido contra la API, los tres modelos que probamos inventaron uno
 * igual: $130, $120 y "$ X por caja". Pedirle a un modelo que no invente es una
 * instruccion; darle una funcion que devuelve el numero es una garantia.
 *
 * Por eso el prompt de sistema de este agente es corto y no lleva ni precios ni
 * minimos ni plazos: todo eso se pregunta acá. Un dato que no esta en el prompt
 * no se puede desactualizar en el prompt.
 *
 * Todas leen del mismo motor y de la misma config que la web, la API publica y
 * el servidor MCP. Es el punto del ejercicio: una sola fuente, cuatro consumos.
 */

/**
 * De dónde viene la conversación. El teléfono llega solo cuando entra por
 * WhatsApp: ahí ya lo sabemos, así que el agente no tiene que pedirlo ni el
 * modelo tiene que acordarse de pasarlo.
 */
export interface ContextoAgente {
  canal: 'web' | 'whatsapp';
  /** E.164 sin el prefijo whatsapp:, cuando el canal lo trae. */
  telefono?: string;
}

async function leerCatalogoDeStock() {
  try {
    const { data } = await createAdminClient()
      .from('boxes')
      .select('length_mm, width_mm, height_mm, stock')
      .eq('is_standard', true)
      .eq('is_active', true);
    return data || [];
  } catch {
    // Sin catalogo el motor asume produccion a medida, que es la promesa mas
    // conservadora: nunca ofrece una entrega en 48 horas que no se pueda dar.
    return [];
  }
}

/**
 * Arma las herramientas para una conversación.
 *
 * Es una factory y no un array constante porque `guardar_lead` necesita el
 * teléfono de quien escribe, y ese dato cambia por conversación. La
 * alternativa —que el modelo lo pase como parámetro— es confiar en que se
 * acuerde de un dato que el sistema ya tiene: exactamente el tipo de cosa que
 * conviene sacarle de encima.
 */
export function crearHerramientas(ctx: ContextoAgente) {
  const cotizarCajas = betaTool({
  name: 'cotizar_cajas',
  description:
    'Calcula el precio real de un pedido de cajas de cartón corrugado. Es la ÚNICA ' +
    'fuente válida de precios: nunca estimes ni calcules un precio por tu cuenta. ' +
    'Las medidas van en milímetros. Si la persona las dio en centímetros, ' +
    'multiplicá por 10 antes de llamar. Devuelve el precio por caja, el subtotal ' +
    'sin IVA, el IVA, el total, el plazo de entrega, la validez y un link ' +
    'compartible con la cotización.',
  inputSchema: {
    type: 'object',
    properties: {
      largo_mm: { type: 'integer', description: 'Largo de la caja en milímetros' },
      ancho_mm: { type: 'integer', description: 'Ancho de la caja en milímetros' },
      alto_mm: { type: 'integer', description: 'Alto de la caja en milímetros' },
      cantidad: { type: 'integer', description: 'Cantidad de cajas' },
      colores_impresion: {
        type: 'integer',
        description:
          'Cantidad de colores de impresión flexográfica, de 0 a 3. Usá 0 si la ' +
          'persona no pidió impresión o dijo que la quiere lisa. Si pidió ' +
          'impresión pero no dijo cuántos colores, preguntale antes de llamar.',
      },
    },
    required: ['largo_mm', 'ancho_mm', 'alto_mm', 'cantidad', 'colores_impresion'],
    additionalProperties: false,
  },
  run: async (args) => {
    const { largo_mm, ancho_mm, alto_mm, cantidad, colores_impresion } = args;

    // Las validaciones van acá y no en el prompt: un limite de fabricacion que
    // el modelo tiene que recordar es un limite que alguna vez va a olvidar.
    const problemas: string[] = [];
    // El minimo se valida por m² en el motor, que es donde se conocen los
    // metros del pedido. Aca solo se descartan las cantidades absurdas.
    if (cantidad < 1) {
      problemas.push('La cantidad tiene que ser al menos una caja.');
    }
    // LOS LIMITES DE FABRICACION NO SE CHEQUEAN ACA, A PROPOSITO.
    //
    // Estaban: ancho+alto y la medida minima. Y cortaban antes de llamar al
    // motor, asi que para una caja que no entra en el rollo esta tool devolvia
    // {se_puede_cotizar:false, motivos:[...]} y nada mas. Sin alternativas de
    // catalogo, sin el texto ya redactado, sin nada que ofrecerle a la persona.
    //
    // Costo darse cuenta: se ajusto tres veces la instruccion del impedimento
    // —que el modelo listara las alternativas, que arrancara por el motivo— y no
    // cambiaba nada, porque este caso nunca llegaba a esa rama. Es el mismo
    // atajo que tenia validarCajas() y que ya se saco por lo mismo.
    //
    // Ahora decide calcularCotizacion(), que para la misma caja devuelve el
    // motivo, las tres medidas de catalogo mas parecidas ya cotizadas y el
    // "no" completo redactado. Aca quedan solo los chequeos que el motor no
    // hace, que son los de la entrada.
    if (colores_impresion > RETAIL_CONFIG.MAX_PRINTING_COLORS) {
      problemas.push(
        `Imprimimos hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores y pediste ${colores_impresion}.`,
      );
    }
    if (problemas.length) {
      return JSON.stringify({
        se_puede_cotizar: false,
        motivos: problemas,
        instruccion: 'Explicale el motivo concreto a la persona y ofrecele una alternativa.',
      });
    }

    const config = await getActivePricingConfig();
    if (!config) {
      return JSON.stringify({
        se_puede_cotizar: false,
        motivos: ['No se pudo leer la configuración de precios.'],
        instruccion:
          'Decile que hay un problema técnico con los precios y ofrecele hablar por WhatsApp. No inventes un precio.',
      });
    }

    const q = calcularCotizacion(
      [{
        length_mm: largo_mm,
        width_mm: ancho_mm,
        height_mm: alto_mm,
        quantity: cantidad,
        printing_colors: colores_impresion,
      }],
      config,
      await leerCatalogoDeStock(),
    );
    // El minimo de compra es excluyente. Antes esta tool devolvia el precio
    // igual y el agente lo leia: cotizo 272 m² —por debajo de los 500— y cerro
    // ofreciendo "coordinarlo por WhatsApp", que es la negociacion de cantidad
    // que no queremos abrir. Si no se puede vender, no hay numero que mostrar.
    if (!q.cotizable) {
      const imp = q.impedimento!;
      return JSON.stringify({
        se_puede_cotizar: false,
        medidas_mm: `${largo_mm}x${ancho_mm}x${alto_mm}`,
        cantidad,
        metros_cuadrados: q.total_m2,
        // El tipo viaja al modelo, no solo el texto: si la instruccion falla,
        // esto le sigue diciendo de que clase de "no" se trata.
        motivo_tipo: imp.tipo,
        motivo: imp.motivo,
        // El "no" ya redactado, con el motivo primero y las alternativas
        // despues. Es el mismo texto que usan la web y el respaldo de WhatsApp.
        //
        // Va porque una instruccion pidiendo ese orden no alcanzo: se probo
        // pidiendolo de dos formas distintas y el modelo, con un motivo por un
        // lado y un array de alternativas por el otro, componia desde el array
        // y arrancaba en "las mas cercanas son", sin decir nunca por que la
        // medida que habia pedido no se podia hacer. Dandole el texto armado
        // deja de tener que armarlo.
        texto_para_el_cliente: mensajeDeImpedimento(imp),
        // Los numeros del minimo SOLO cuando el minimo es el problema. Para una
        // caja que no entra en el rollo, mandar "minimo_de_compra_m2: 500" y
        // "cajas_necesarias: null" es darle al modelo justo los ingredientes
        // para escribir "te faltan cajas para llegar al minimo", que es lo que
        // hacia.
        ...(imp.tipo === 'no_fabricable'
          ? {}
          : {
              minimo_de_compra_m2: RETAIL_CONFIG.MIN_M2_PEDIDO,
              cajas_necesarias_de_esta_medida: imp.cajas_necesarias,
              // Cuantas le FALTAN, calculado, para que no haya que restarlo.
              //
              // Con solo el total el agente escribio "faltarian unas 1.334
              // cajas" sobre un pedido de 1.200, cuando faltaban 134. Quien lee
              // eso pide 2.534. El campo con el nombre correcto al lado del otro
              // es mas barato que una instruccion pidiendo que reste bien.
              cajas_que_faltan:
                imp.cajas_necesarias !== null
                  ? Math.max(0, imp.cajas_necesarias - cantidad)
                  : null,
              m2_faltantes: imp.m2_faltantes,
            }),
        // Las medidas de catalogo mas parecidas, YA COTIZADAS al minimo. No
        // hace falta otra llamada ni derivar a nadie: el precio de cada una es
        // el que se factura, sale de la misma escalera.
        alternativas_de_catalogo: imp.alternativas.map((a) => ({
          medidas_mm: `${a.length_mm}x${a.width_mm}x${a.height_mm}`,
          cantidad_minima: a.cantidad,
          metros_cuadrados: a.m2,
          precio_por_caja: precioUnitarioARS(a.precio_por_caja),
          subtotal_sin_iva: Math.round(a.subtotal),
          total_con_iva: Math.round(a.total_con_iva),
          en_stock: a.stock,
          // Si lo que iba a embalar entra en esta caja. No filtra nada: se
          // ofrecen las mas parecidas y el cliente decide, pero si es mas
          // chica hay que decirlo.
          entra_lo_que_iba_en_la_pedida: a.entra,
          link_para_compartir: `${SITE_URL}/cotizar/${a.length_mm}x${a.width_mm}x${a.height_mm}/${a.cantidad}`,
        })),
        instruccion:
          'NO des ningun precio para la medida que pidió: no lo tenés y no existe. ' +
          'ARRANCA tu respuesta con texto_para_el_cliente, que ya explica por que no se puede ' +
          'y con que reemplazarlo; podes reformularlo pero NO te saltees la explicacion para ' +
          'ir directo a las alternativas. ' +
          // El resto sale del motor, que es el que sabe de que clase de "no" se
          // trata. Antes esta instruccion decia "decí el mínimo y cuántas cajas
          // hacen falta" para los tres impedimentos, incluida la caja que no se
          // puede fabricar.
          instruccionDeImpedimento(imp) +
          ' ' +
          (imp.alternativas.length
            ? 'OFRECELE DIRECTAMENTE las de alternativas_de_catalogo, con su medida, su ' +
              'cantidad y su precio, que ya están calculados acá. No preguntes si querés que ' +
              'las busque: son estas. Si alguna tiene entra_lo_que_iba_en_la_pedida en false, ' +
              'avisá que es más chica que la medida que pidió, pero ofrecela igual: el cliente ' +
              'sabe qué va adentro. '
            : '') +
          'NO ofrezcas coordinarlo por WhatsApp, ni consultarlo, ni pasarlo a un asesor para ' +
          'que la busque una persona: la alternativa ya la tenés.',
      });
    }

    const caja = q.boxes[0];

    return JSON.stringify({
      se_puede_cotizar: true,
      medidas_mm: `${largo_mm}x${ancho_mm}x${alto_mm}`,
      cantidad,
      colores_impresion: caja.printing_colors,
      precio_por_caja: precioUnitarioARS(caja.unit_price),
      subtotal_sin_iva: Math.round(q.subtotal),
      iva_21: Math.round(q.tax_amount),
      total_con_iva: Math.round(q.total_with_tax),
      moneda: 'ARS',
      metros_cuadrados: q.total_m2,
      precio_por_m2: caja.price_per_m2,
      dias_habiles_entrega: q.estimated_days,
      valido_hasta: q.valid_until,
      canal: q.channel,
      nota_del_canal: q.channel_note,
      impresion_disponible: q.printing.available,
      // Resuelto por el motor, no deducido. El agente no tiene que comparar
      // los m² contra el umbral: con 2.932,8 m² una vez concluyo que superaba
      // los 3.000 y prometio envio gratis.
      envio: q.shipping.note,
      // Ya calculado: cuantas cajas mas, cuanto paga y cuanto ahorra. El
      // agente no tiene que deducir nada, solo contarlo si existe.
      conviene_agregar_cajas: q.next_tier,
      envio_gratis_por_volumen: q.shipping.meets_free_shipping_volume,
      // LA IMPRESION SE RESUELVE ACA, Y SIEMPRE. NO ES UN CAMPO OPCIONAL.
      //
      // Antes esto aparecia solo cuando la persona YA habia pedido impresion.
      // O sea: se enteraba de que se puede imprimir quien ya sabia que se puede
      // imprimir. El resto —la mayoria— cotizaba liso sin que nadie se lo
      // mencionara nunca, y el PDF del desplegado no salia jamas. Un servicio
      // que no se ofrece no existe.
      //
      // Los tres estados van escritos para que el agente no compare metros
      // contra ningun umbral: lee "que_hacer" y lo hace. Cual de los tres es
      // lo decide el motor, que es el unico que conoce los m² del pedido.
      impresion:
        caja.printing_colors > 0
          ? {
              lleva: true,
              como_se_cobra: q.printing.price_note,
              plantilla_pdf: caja.template_pdf,
              que_hacer:
                'Este pedido lleva impresión: avisá que el polímero se cotiza aparte y va a ' +
                'cargo del comprador, así el total no parece cerrado cuando todavía falta ese ' +
                'ítem. Y llamá a plantilla_impresion con estas medidas: el PDF del desplegado ' +
                'se manda adjunto y es lo que el diseñador necesita para armar el arte sobre ' +
                'la medida real.',
            }
          : q.printing.available
            ? {
                lleva: false,
                se_puede: true,
                que_hacer:
                  'La persona no dijo nada de impresión y este pedido puede llevarla. ' +
                  'PREGUNTASELO, en el mismo mensaje del precio, al final y en una sola ' +
                  'frase. Si no se lo preguntás no se entera de que existe. El precio de ' +
                  'arriba es sin impresión y sigue valiendo; no anticipes ningún recargo. Si ' +
                  'dice que sí, preguntale cuántos colores y volvé a cotizar con ese número.',
              }
            : {
                lleva: false,
                se_puede: false,
                por_que: q.printing.price_note,
                que_hacer:
                  'Este pedido no llega al volumen desde el que se imprime. No lo ofrezcas ni ' +
                  'lo menciones: ofrecer algo que después hay que negar es peor que no ' +
                  'ofrecerlo. Si pregunta la persona, contale lo que dice por_que.',
              },
      link_para_compartir: `${SITE_URL}/cotizar/${largo_mm}x${ancho_mm}x${alto_mm}/${cantidad}`,
      instruccion:
        'Al dar el precio decí siempre que es en pesos, que el subtotal va sin IVA y ' +
        'el total con IVA incluido, el plazo y hasta cuándo vale. Pasale el link. ' +
        'Y hacé lo que diga impresion.que_hacer, que ya viene resuelto para este pedido.',
    });
  },
});

  /**
   * El catalogo entero.
   *
   * Faltaba, y se notaba: cuando alguien pregunto "que otro tamano tenes de
   * estandar" el agente lo mando a la pagina del catalogo, que es la respuesta
   * de alguien que no tiene el dato. Lo tenemos en la base.
   *
   * Cada medida viene con la cantidad minima para llegar al piso de venta y el
   * precio de esa cantidad, calculados con la misma escalera que factura. Sin
   * eso el agente tendria que cotizar diez veces para poder listar el catalogo.
   */
  const medidasDeCatalogo = betaTool({
    name: 'medidas_de_catalogo',
    description:
      'Devuelve TODAS las medidas estándar de catálogo, cada una con su cantidad mínima y su ' +
      'precio ya calculados. Usala cuando pregunten qué medidas hay, qué otros tamaños tenés, ' +
      'o cuando quieras ofrecer opciones además de las que ya diste. No mandes a nadie a mirar ' +
      'el catálogo en la web: las medidas las tenés acá.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    run: async () => {
      const config = await getActivePricingConfig();
      const catalogo = await leerCatalogoDeStock();
      if (!config || catalogo.length === 0) {
        return JSON.stringify({
          medidas: [],
          instruccion: 'No se pudo leer el catálogo. Ofrecé la página ' + SITE_URL + '/cajas.',
        });
      }

      const medidas = catalogo
        .map((m) => {
          const q = calcularCotizacion(
            [{ length_mm: m.length_mm, width_mm: m.width_mm, height_mm: m.height_mm, quantity: 1 }],
            config,
            catalogo,
          );
          const m2PorCaja = q.boxes[0].sqm_per_box;
          const cantidad = Math.ceil(RETAIL_CONFIG.MIN_M2_PEDIDO / m2PorCaja);
          const cotizada = calcularCotizacion(
            [{ length_mm: m.length_mm, width_mm: m.width_mm, height_mm: m.height_mm, quantity: cantidad }],
            config,
            catalogo,
          );
          return {
            medidas_mm: `${m.length_mm}x${m.width_mm}x${m.height_mm}`,
            volumen_litros: Math.round((m.length_mm * m.width_mm * m.height_mm) / 1000),
            cantidad_minima: cantidad,
            precio_por_caja: cotizada.cotizable
              ? precioUnitarioARS(cotizada.boxes[0].unit_price)
              : null,
            subtotal_sin_iva: cotizada.cotizable ? Math.round(cotizada.subtotal) : null,
            total_con_iva: cotizada.cotizable ? Math.round(cotizada.total_with_tax) : null,
            en_stock: m.stock ?? 0,
            link_para_compartir: `${SITE_URL}/cotizar/${m.length_mm}x${m.width_mm}x${m.height_mm}/${cantidad}`,
          };
        })
        // De la mas chica a la mas grande: es como las compara quien elige.
        .sort((a, b) => a.volumen_litros - b.volumen_litros);

      return JSON.stringify({
        medidas,
        nota: `Estas medidas también se pueden imprimir, desde ${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m². Por debajo salen de stock, y lo que sale de stock va sin imprimir.`,
        // La caja mas grande del catalogo no es la caja mas grande que se
        // fabrica, y "cual es la mas grande que pueden hacer" se contesta con
        // esta herramienta. Sin este dato el agente contesto que no habia una
        // medida maxima puntual —la hay— y que la de catalogo era
        // "aproximadamente la cota maxima", que tampoco.
        tambien_a_medida: {
          medida_maxima_mm: `${MEDIDA_MAXIMA.largo}x${MEDIDA_MAXIMA.ancho}x${MEDIDA_MAXIMA.alto}`,
          ancho_mas_alto_max_mm: RETAIL_CONFIG.MAX_SHEET_WIDTH,
          desde_m2: RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA,
          nota:
            'Fuera del catálogo se fabrica cualquier medida que cumpla LOS DOS límites a la ' +
            'vez y llegue al volumen de producción a medida. Si preguntan cuál es la caja más ' +
            'grande que se puede hacer, la respuesta son estos dos números, no la más grande ' +
            'del catálogo.',
        },
        instruccion:
          'Ofrecé las que se parezcan a lo que pidió, con su medida, su cantidad mínima y su ' +
          'precio. Si no pidió ninguna medida en particular, mostrá tres o cuatro repartidas ' +
          'entre chicas, medianas y grandes en vez de la lista entera.',
      });
    },
  });

  const condicionesYPrecios = betaTool({
  name: 'condiciones_y_precios',
  description:
    'Devuelve las condiciones comerciales vigentes: mínimos de cada canal, escalera ' +
    'de precios por m², límites de fabricación, impresión, envío, plazos, horario y ' +
    'datos de contacto. Consultala cuando pregunten por mínimos, envíos, plazos, ' +
    'formas de contacto o rangos de precio. No respondas esas cosas de memoria.',
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  run: async () => {
    const c = await getActivePricingConfig();
    return JSON.stringify({
      minimos: {
        // Se miden en m² de carton desplegado, nunca en cantidad de cajas.
        compra_m2: RETAIL_CONFIG.MIN_M2_PEDIDO,
        medida_propia_m2: RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA,
        explicacion: MINIMOS.largo,
      },
      precios_por_m2_sin_iva: c
        ? {
            volumen: c.price_per_m2_volume,
            estandar: c.price_per_m2_standard,
            minorista: c.price_per_m2_retail,
            umbral_volumen_m2: c.volume_threshold_m2,
            nota: 'El precio se calcula por m² de cartón desplegado, no por el volumen de la caja.',
          }
        : null,
      iva: 'Los precios publicados van sin IVA. El IVA es 21% y se informa aparte.',
      material: MATERIAL.nota,
      impresion: c
        ? {
            max_colores: RETAIL_CONFIG.MAX_PRINTING_COLORS,
            tecnica: 'flexografía',
            como_se_cobra: notaImpresion(c),
            incluida_desde_m2: c.printing_included_min_m2,
            polimero: 'Se cotiza aparte, va a cargo del comprador y depende del diseño. No lo estimes.',
          }
        : null,
      limites_de_fabricacion: {
        medida_minima_mm: `${MEDIDA_MINIMA.largo}x${MEDIDA_MINIMA.ancho}x${MEDIDA_MINIMA.alto}`,
        // Faltaba, y por eso ante "cual es la caja mas grande que pueden hacer"
        // el agente contesto que no existe una medida maxima puntual. Existe, y
        // el cliente que pregunta eso esta por decidir si nos sirve o no.
        medida_maxima_mm: `${MEDIDA_MAXIMA.largo}x${MEDIDA_MAXIMA.ancho}x${MEDIDA_MAXIMA.alto}`,
        ancho_mas_alto_max_mm: RETAIL_CONFIG.MAX_SHEET_WIDTH,
        motivo:
          `El ancho de plancha sale de sumar ancho y alto y no puede pasar de ` +
          `${RETAIL_CONFIG.MAX_SHEET_WIDTH} mm, que es el ancho del rollo de cartón. El largo no ` +
          `entra en esa cuenta, pero igual tiene el tope de la medida máxima. Los dos límites ` +
          `valen a la vez: una caja tiene que cumplir los dos.`,
      },
      envio: ENVIO.largo,
      plazos: c
        ? {
            sin_impresion_dias_habiles: c.production_days_standard,
            con_impresion_dias_habiles: c.production_days_printing,
            stock: '24 a 48 horas',
          }
        : null,
      validez_cotizacion_dias: c?.quote_validity_days ?? 7,
      horario: HORARIO.texto,
      contacto: {
        whatsapp: CONTACTO.telefonoVisible,
        email: CONTACTO.email,
        direccion: CONTACTO.direccion,
      },
      solo_argentina: true,
    });
  },
});

  const plantillaDeImpresion = betaTool({
  name: 'plantilla_impresion',
  description:
    'Devuelve el link al PDF del desplegado de la caja, con las líneas de corte y ' +
    'plegado y las áreas donde va el diseño. Es lo que el diseñador necesita para ' +
    'armar el arte sobre la medida real. Usala cuando pidan la plantilla, el ' +
    'desplegado, el troquel o cómo mandar el diseño, Y TAMBIÉN apenas confirmen que ' +
    'el pedido va con impresión, aunque no la pidan: por WhatsApp el PDF sale ' +
    'adjunto solo, y es lo primero que el diseñador va a necesitar.',
  inputSchema: {
    type: 'object',
    properties: {
      largo_mm: { type: 'integer' },
      ancho_mm: { type: 'integer' },
      alto_mm: { type: 'integer' },
    },
    required: ['largo_mm', 'ancho_mm', 'alto_mm'],
    additionalProperties: false,
  },
  run: async ({ largo_mm, ancho_mm, alto_mm }) => {
    return JSON.stringify({
      pdf: urlPlantilla(largo_mm, ancho_mm, alto_mm),
      max_colores: RETAIL_CONFIG.MAX_PRINTING_COLORS,
      como_funciona:
        'Las áreas verdes marcan dónde va el diseño. Se puede mandar el arte terminado ' +
        'en PDF, AI o EPS por WhatsApp o por mail.',
    });
  },
});

  const guardarLead = betaTool({
    name: 'guardar_lead',
    description:
      'Guarda los datos de la persona para que un vendedor la contacte. Llamala ' +
      'cuando deje su nombre, empresa, mail o teléfono, o cuando pida que la ' +
      'contacten. No hace falta tener todos los datos ni haber cotizado: guardá ' +
      'lo que haya. Si ya cotizaste en esta conversación, pasá también las ' +
      'medidas y la cantidad. Llamala una sola vez, salvo que agregue datos nuevos.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre de la persona, si lo dijo' },
        empresa: { type: 'string', description: 'Empresa, si la dijo' },
        email: { type: 'string', description: 'Email, si lo dejó' },
        telefono: { type: 'string', description: 'Teléfono, si lo dejó y no lo tenemos ya' },
        resumen: {
          type: 'string',
          description:
            'Una o dos frases con lo que necesita: medidas, cantidad, uso, urgencia. ' +
            'Es lo que va a leer el vendedor antes de llamar.',
        },
        contacto_preferido: {
          type: 'string',
          enum: ['telefono', 'whatsapp', 'email', 'sin_preferencia'],
          description:
            'Cómo pidió que lo contacten. Si dijo "que me llamen" es telefono. ' +
            'Si no lo dijo, sin_preferencia.',
        },
        largo_mm: { type: 'integer', description: 'Solo si ya cotizaste' },
        ancho_mm: { type: 'integer', description: 'Solo si ya cotizaste' },
        alto_mm: { type: 'integer', description: 'Solo si ya cotizaste' },
        cantidad: { type: 'integer', description: 'Solo si ya cotizaste' },
      },
      required: ['resumen'],
      additionalProperties: false,
    },
    run: async (args) => {
      const telefono = ctx.telefono || args.telefono;

      // No confirmar un canal que no se puede cumplir.
      //
      // En una prueba, alguien dejo solo el mail y pidio que lo llamaran al dia
      // siguiente. El agente confirmo la llamada. El vendedor abre el lead y no
      // tiene numero: el cliente espera un llamado que nunca va a llegar.
      const quiereLlamada =
        args.contacto_preferido === 'telefono' || args.contacto_preferido === 'whatsapp';
      if (quiereLlamada && !telefono) {
        return JSON.stringify({
          guardado: false,
          falta: 'telefono',
          instruccion:
            'Pidió que lo contacten por teléfono y no tenemos su número. Pediselo en ' +
            'este mismo mensaje, antes de confirmarle nada. No le prometas un llamado.',
        });
      }
      if (args.contacto_preferido === 'email' && !args.email) {
        return JSON.stringify({
          guardado: false,
          falta: 'email',
          instruccion: 'Pidió que lo contacten por mail y no tenemos su dirección. Pediséla.',
        });
      }

      // Dos destinos distintos a proposito.
      //
      // contact_profiles es QUIEN es la persona y admite que todavia no haya
      // pedido nada. public_quotes es QUE pidio, y exige medidas y cantidad:
      // intentar guardar ahi un contacto que solo dejo el nombre revienta con
      // un NOT NULL en length_mm y el lead se pierde igual que antes.
      let guardadoAlgo = false;

      if (telefono) {
        try {
          await upsertContactProfile({
            phoneNumber: telefono,
            email: args.email,
            displayName: args.nombre,
            companyName: args.empresa,
          });
          guardadoAlgo = true;
        } catch (e) {
          console.error('[Agente] No se pudo guardar el contacto:', e);
        }
      }

      const hayCotizacion =
        args.largo_mm && args.ancho_mm && args.alto_mm && args.cantidad;

      // La tabla exige al menos un canal de contacto. Sin telefono ni mail la
      // fila no le sirve a nadie: alcanza con el perfil de contacto.
      const sePuedeContactar = !!telefono || !!args.email;
      if (sePuedeContactar && (hayCotizacion || !telefono)) {
        try {
          // ─────────────────────────────────────────────────────────────
          // Una consulta, un lead. No uno por vez que llamen a esta tool.
          //
          // La descripcion de la herramienta dice "llamala una sola vez", y el
          // agente la llamo dos veces igual: primero cuando la persona dijo su
          // nombre y despues cuando agrego la condicion frente al IVA. Las dos
          // llamadas eran razonables —la segunda traia un dato nuevo— y aun asi
          // el vendedor termina con dos filas identicas de la misma persona en
          // la lista de pendientes, y llama dos veces o llama uno y el otro
          // queda muerto.
          //
          // Se resuelve con datos y no con una instruccion: si ya hay una
          // consulta pendiente de esta misma persona y es reciente, se actualiza
          // en vez de crear otra. La ventana es de seis horas, que es mas que
          // una conversacion y menos que dos consultas de verdad: alguien que
          // vuelve a la semana es un lead nuevo y tiene que aparecer como tal.
          // ─────────────────────────────────────────────────────────────
          const VENTANA_MS = 6 * 60 * 60 * 1000;
          const desde = new Date(Date.now() - VENTANA_MS).toISOString();
          const db = createAdminClient();

          let existente: string | null = null;
          if (telefono || args.email) {
            const q = db
              .from('public_quotes')
              .select('id')
              .eq('status', 'pending')
              .gte('created_at', desde)
              .order('created_at', { ascending: false })
              .limit(1);
            // Por telefono si lo hay, y si no por mail. No por los dos a la vez:
            // un `or` con un mail vacio matchea filas ajenas.
            const { data } = telefono
              ? await q.eq('requester_phone', telefono)
              : await q.eq('requester_email', args.email!);
            existente = data && data.length > 0 ? (data[0].id as string) : null;
          }

          // Service role: no hay sesion de usuario en un endpoint publico, y con
          // el cliente SSR las policies de RLS rechazan el insert en silencio.
          // Ya paso con los leads de WhatsApp, que se perdieron todos.
          const fila = {
            requester_name:
              args.nombre || args.empresa ||
              (telefono ? 'WhatsApp ' + telefono.slice(-4) : 'Consulta del chat'),
            requester_company: args.empresa || null,
            requester_email: args.email || null,
            requester_phone: telefono || null,
            // Null y no cero: una caja de 0x0x0 no se distingue de un dato
            // mal cargado, y ensucia los reportes. Van los cuatro o ninguno,
            // que es lo que exige el CHECK de la tabla.
            length_mm: hayCotizacion ? args.largo_mm : null,
            width_mm: hayCotizacion ? args.ancho_mm : null,
            height_mm: hayCotizacion ? args.alto_mm : null,
            quantity: hayCotizacion ? args.cantidad : null,
            message: args.resumen,
            // source y canal tienen un CHECK que solo admite 'web' y
            // 'whatsapp'. Que la consulta la haya tomado el asistente y no el
            // formulario va en notes, que es texto libre: sirve para medir
            // cuanto trae este canal antes de poner plata en campañas.
            source: ctx.canal === 'whatsapp' ? 'whatsapp' : 'web',
            canal: ctx.canal === 'whatsapp' ? 'whatsapp' : 'web',
            notes: 'Tomado por el asistente automatico',
            requested_contact: true,
            status: 'pending',
          };

          // Al actualizar NO se pisan campos con null: la segunda llamada suele
          // traer un dato nuevo y ninguno de los viejos, y sobreescribir con
          // null le borraria al vendedor las medidas que ya tenia.
          const soloLoQueVino = Object.fromEntries(
            Object.entries(fila).filter(([, v]) => v !== null && v !== undefined),
          );

          const { error } = existente
            ? await db.from('public_quotes').update(soloLoQueVino).eq('id', existente)
            : await db.from('public_quotes').insert(fila);

          if (error) console.error('[Agente] No se pudo guardar la consulta:', error);
          else {
            guardadoAlgo = true;
            if (existente) console.log('[Agente] consulta ya existente, se actualizo:', existente);
          }
        } catch (e) {
          console.error('[Agente] No se pudo guardar la consulta:', e);
        }
      }

      if (!guardadoAlgo) {
        return JSON.stringify({
          guardado: false,
          instruccion:
            'No se pudo guardar. Pedile que escriba por WhatsApp así no se pierde la consulta.',
        });
      }
      return JSON.stringify({
        guardado: true,
        instruccion: 'Confirmale que un vendedor la va a contactar y en qué horario se atiende.',
      });
    },
  });

  const derivarAHumano = betaTool({
  name: 'derivar_a_humano',
  description:
    'Devuelve el link de WhatsApp con un mensaje ya escrito para seguir la ' +
    'conversación con una persona del equipo. Usala cuando pidan hablar con ' +
    'alguien, cuando la consulta se te vaya de lo que podés resolver, o cuando ' +
    'haya un reclamo.',
  inputSchema: {
    type: 'object',
    properties: {
      contexto: {
        type: 'string',
        description:
          'El mensaje que va a llegarle al equipo, escrito en primera persona como ' +
          'si lo mandara la persona. Incluí medidas, cantidad y precio si ya se ' +
          'cotizó, para que no tenga que contar todo de nuevo.',
      },
    },
    required: ['contexto'],
    additionalProperties: false,
  },
  run: async ({ contexto }) => {
    // ─────────────────────────────────────────────────────────────────────
    // POR WHATSAPP NO SE PASA NINGUN LINK.
    //
    // Esta herramienta se escribio pensando en el chat del sitio, donde mandar a
    // la persona a WhatsApp con el mensaje ya redactado es lo mejor que se le
    // puede ofrecer. Por WhatsApp es un absurdo: se le daba un wa.me/ del numero
    // desde el que estaba escribiendo. Paso en la primera prueba real —"quiero
    // hablar con un asesor" y el asistente contesto con un link a la misma
    // conversacion— y no hay forma de que eso no se lea como un error.
    //
    // Ahi lo correcto es decirle que ya avisamos y que le contestan por el mismo
    // lugar. De avisar y de callar al asistente se ocupa el webhook, que ademas
    // tiene el nombre y el mail de la conversacion.
    // ─────────────────────────────────────────────────────────────────────
    if (ctx.canal === 'whatsapp') {
      return JSON.stringify({
        avisado: true,
        horario: HORARIO.texto,
        instruccion:
          'Decile que ya avisaste al equipo y que una persona le va a contestar por acá ' +
          'mismo, sin que tenga que escribir a otro lado ni repetir nada. Si esta fuera del ' +
          'horario de atencion, aclaraselo. NO le pases ningun link de WhatsApp: ya esta en ' +
          'WhatsApp, y darle un link al numero desde el que escribe no tiene sentido. NO le ' +
          'pases el telefono por el mismo motivo.',
      });
    }

    // Por el chat del sitio si, y ademas se avisa: si la persona no hace clic en
    // el link, el pedido se evapora y nadie se entera de que existio. Lo hace la
    // herramienta y no el webhook porque el chat del sitio no pasa por ningun
    // webhook. Por WhatsApp NO se avisa aca, para no mandar dos mails.
    await sendNotification({
      type: 'advisor_request',
      origin: 'Chat del sitio',
      contact: { phone: ctx.telefono || undefined },
    }).catch((e) => console.error('[Agente] no se pudo avisar de la derivacion:', e));

    return JSON.stringify({
      whatsapp: CONTACTO.whatsappCon(contexto),
      telefono: CONTACTO.telefonoVisible,
      email: CONTACTO.email,
      horario: HORARIO.texto,
      instruccion:
        'Pasale el link tal cual: ya lleva el mensaje escrito con todo el contexto, asi no ' +
        'tiene que repetir nada. Del otro lado ya quedo avisado el equipo.',
    });
  },
});

  /**
   * Lo que el asistente no sabe: primero se fija si el equipo ya lo respondio,
   * y si no, lo anota y avisa.
   *
   * ES UNA SOLA HERRAMIENTA Y NO DOS A PROPOSITO. Si buscar y anotar fueran
   * separadas, el modelo podria decidir que no sabe y anotarlo sin haber
   * buscado, y le estariamos pidiendo al equipo que responda algo que ya
   * respondio. Aca no hay forma de saltearse la busqueda: es el primer paso de
   * la misma llamada.
   */
  const noSeLaRespuesta = betaTool({
    name: 'no_se_la_respuesta',
    description:
      'Usala cuando te preguntan algo que no podes contestar con las otras ' +
      'herramientas: formas de pago, si entregan un sabado, si hacen un tipo de ' +
      'caja que no cotizamos, cualquier cosa que no este en condiciones ni en el ' +
      'catalogo. Primero busca si el equipo ya respondio algo parecido, y si no, ' +
      'anota la consulta y avisa para que una persona siga la conversacion. NO la ' +
      'uses para lo que si podes averiguar: cotizar, el catalogo, las condiciones ' +
      'o los limites de fabricacion.',
    inputSchema: {
      type: 'object',
      properties: {
        pregunta: {
          type: 'string',
          description:
            'Lo que preguntaron, TEXTUAL. Sin sinonimos, sin reformular, sin ' +
            'corregirle la ortografia. Es lo que va a leer la persona del equipo ' +
            'que responda, y necesita ver con que palabras se lo preguntaron.',
        },
        busqueda: {
          type: 'string',
          description:
            'La misma pregunta MAS sinonimos y otras formas de decirla, para ' +
            'buscar. La busqueda es por palabras y no por significado: "formas de ' +
            'pago" no encuentra una respuesta que habla de "transferencia y ' +
            'efectivo", pero "formas de pago tarjeta transferencia efectivo credito ' +
            'debito" si. Agregar sinonimos no te cuesta nada y es lo unico que hace ' +
            'que encuentre.',
        },
        contexto: {
          type: 'string',
          description:
            'En que estaba la conversacion: si ya cotizo, que medida y cantidad, ' +
            'que necesita. Lo lee la persona del equipo que va a responder, para ' +
            'no tener que reconstruirlo.',
        },
        ya_revise_las_parecidas: {
          type: 'boolean',
          description:
            'Dejalo en false la primera vez. Si esta herramienta ya te devolvio ' +
            'respuestas parecidas y ninguna contestaba lo que preguntaron, volve a ' +
            'llamarla con esto en true: ahi se anota la consulta y se avisa al equipo.',
        },
      },
      required: ['pregunta', 'busqueda', 'contexto', 'ya_revise_las_parecidas'],
      additionalProperties: false,
    },
    run: async ({ pregunta, busqueda, contexto, ya_revise_las_parecidas }) => {
      // Se busca con los sinonimos y se GUARDA lo textual. Antes era un solo
      // campo y el equipo terminaba leyendo "cajas con ventana de acetato
      // transparente, ventana plastica, film" en vez de lo que el cliente habia
      // escrito, que es lo unico que le sirve para entender que le preguntaron.
      //
      // Solo se busca la primera vez: un modelo que ya leyo las candidatas y
      // decidio que ninguna sirve las recibiria de nuevo, y la consulta no se
      // anotaria nunca.
      const candidatas = ya_revise_las_parecidas
        ? []
        : await buscarConocimiento(busqueda || pregunta, 3);

      if (candidatas.length > 0) {
        return JSON.stringify({
          hay_respuestas_parecidas: true,
          respuestas: candidatas.map((c) => ({
            la_pregunta_que_respondimos: c.pregunta,
            respuesta: c.respuesta,
          })),
          instruccion:
            'Estas son respuestas que YA dio el equipo a preguntas parecidas. La busqueda ' +
            'es por palabras, no por significado, asi que puede traer algo que no viene al ' +
            'caso: leelas y usa una SOLO si responde exactamente lo que te preguntaron. Si ' +
            'ninguna responde, volve a llamar a esta herramienta con el mismo texto y ' +
            '"ya_revise_las_parecidas" en true, y ahi se anota la consulta.',
        });
      }

      const { esNueva, vecesPreguntada } = await anotarPreguntaSinRespuesta({
        pregunta,
        contexto,
        canal: ctx.canal,
        telefono: ctx.telefono || null,
      });

      // Se avisa solo la primera vez. La misma consulta repetida suma a la
      // cuenta de la lista, que es lo que el equipo mira, pero no manda un mail
      // por cada persona que la hace.
      if (esNueva) {
        await sendNotification({
          type: 'consulta_sin_respuesta',
          origin: ctx.canal === 'whatsapp' ? 'WhatsApp' : 'Chat del sitio',
          pregunta,
          contexto,
          contact: { phone: ctx.telefono || undefined },
        }).catch((e) => console.error('[Agente] no se pudo avisar de la consulta:', e));
      }

      return JSON.stringify({
        hay_respuestas_parecidas: false,
        anotada: true,
        veces_preguntada: vecesPreguntada,
        instruccion:
          'No tenemos la respuesta. Decile que no lo sabes con certeza y que le vas a pedir ' +
          'a alguien del equipo que le conteste por acá mismo, que ya quedo avisado. NO ' +
          'inventes una respuesta ni digas "creo que si". NO lo mandes a escribir a otro ' +
          'lado: la persona sigue esta conversacion. Y SEGUI ATENDIENDOLO normalmente para ' +
          'todo lo demas —si necesita una cotizacion, cotizale— que esto no lo deja ' +
          'esperando para el resto.',
      });
    },
  });

  /**
   * Los datos para transferir, leidos de la configuracion.
   *
   * Es una herramienta y no texto del prompt a proposito: un dato bancario
   * recitado de memoria es un dato que alguna vez va a estar desactualizado o
   * inventado, y una transferencia a una cuenta equivocada no tiene deshacer.
   * Si la configuracion esta incompleta, la herramienta lo dice y el agente
   * deriva — nunca da la mitad de los datos.
   */
  const datosParaTransferir = betaTool({
    name: 'datos_para_transferir',
    description:
      'Devuelve el alias, CBU, titular y CUIT para que el cliente transfiera la seña ' +
      'o el saldo. Usala cuando pregunten cómo pagar, si aceptamos transferencia, o ' +
      'pidan los datos de la cuenta. Nunca digas datos bancarios de memoria: llamala ' +
      'siempre.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    run: async () => {
      const datos = await getBankDataForClient();
      if (!datos) {
        return JSON.stringify({
          disponible: false,
          instruccion:
            'Los datos bancarios no están cargados en el sistema. NO inventes ninguno: ' +
            'decile que un asesor le pasa los datos por acá y llamá a derivar_a_humano.',
        });
      }
      return JSON.stringify({
        disponible: true,
        alias: datos.alias,
        cbu: datos.cbu,
        titular: datos.holder,
        cuit: datos.cuit,
        banco: datos.bank ?? undefined,
        instruccion:
          'Pasale los cuatro datos juntos (alias, CBU, titular con CUIT), no en varios ' +
          'mensajes. Cuando confirme que transfirió, pedile el comprobante por acá y ' +
          'avisale que una persona lo valida antes de dar por confirmado el pedido.',
      });
    },
  });

  return [
    cotizarCajas,
    medidasDeCatalogo,
    condicionesYPrecios,
    plantillaDeImpresion,
    datosParaTransferir,
    guardarLead,
    noSeLaRespuesta,
    derivarAHumano,
  ];
}
