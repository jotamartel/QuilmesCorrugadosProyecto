import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActivePricingConfig } from '@/lib/utils/pricing';
import { calcularCotizacion, precioUnitarioARS, urlPlantilla, notaImpresion } from '@/lib/cotizacion/motor';
import { RETAIL_CONFIG, MINIMOS, ENVIO, HORARIO, MATERIAL } from '@/lib/retail/config';
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
    if (ancho_mm + alto_mm > RETAIL_CONFIG.MAX_SHEET_WIDTH) {
      problemas.push(
        `No se puede fabricar: ancho + alto es ${ancho_mm + alto_mm} mm y el ancho ` +
          `máximo de plancha es ${RETAIL_CONFIG.MAX_SHEET_WIDTH} mm, que es el límite del rollo.`,
      );
    }
    if (largo_mm < RETAIL_CONFIG.MIN_LARGO || ancho_mm < RETAIL_CONFIG.MIN_ANCHO || alto_mm < RETAIL_CONFIG.MIN_ALTO) {
      problemas.push(
        `La medida mínima por caja es ${RETAIL_CONFIG.MIN_LARGO}x${RETAIL_CONFIG.MIN_ANCHO}x${RETAIL_CONFIG.MIN_ALTO} mm.`,
      );
    }
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
        minimo_de_compra_m2: RETAIL_CONFIG.MIN_M2_PEDIDO,
        motivo: imp.motivo,
        cajas_necesarias_de_esta_medida: imp.cajas_necesarias,
        m2_faltantes: imp.m2_faltantes,
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
          'NO des ningun precio para la medida que pidió: no lo tenés y no existe. Decí el ' +
          'mínimo, cuántos m² son y cuántas cajas hacen falta. ' +
          (imp.alternativas.length
            ? 'Y OFRECELE DIRECTAMENTE las de alternativas_de_catalogo, con su medida, su ' +
              'cantidad y su precio, que ya están calculados acá. No preguntes si querés que ' +
              'las busque: son estas. Si alguna tiene entra_lo_que_iba_en_la_pedida en false, ' +
              'avisá que es más chica que la medida que pidió, pero ofrecela igual: el cliente ' +
              'sabe qué va adentro. '
            : '') +
          'NO ofrezcas coordinarlo por WhatsApp, ni consultarlo, ni pasarlo a un asesor para ' +
          'que la busque una persona: el mínimo es excluyente y la alternativa ya la tenés.',
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
      como_se_cobra_la_impresion: caja.printing_colors > 0 ? q.printing.price_note : undefined,
      link_para_compartir: `${SITE_URL}/cotizar/${largo_mm}x${ancho_mm}x${alto_mm}/${cantidad}`,
      instruccion:
        'Al dar el precio decí siempre que es en pesos, que el subtotal va sin IVA y ' +
        'el total con IVA incluido, el plazo y hasta cuándo vale. Pasale el link. ' +
        (caja.printing_colors > 0
          ? 'Este pedido lleva impresión: avisá que el polímero se cotiza aparte y va a ' +
            'cargo del comprador, así el total no parece cerrado cuando todavía falta ese ítem.'
          : ''),
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
        medida_minima_mm: `${RETAIL_CONFIG.MIN_LARGO}x${RETAIL_CONFIG.MIN_ANCHO}x${RETAIL_CONFIG.MIN_ALTO}`,
        ancho_mas_alto_max_mm: RETAIL_CONFIG.MAX_SHEET_WIDTH,
        motivo: 'Es el ancho del rollo de cartón.',
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
    'desplegado, el troquel o cómo mandar el diseño.',
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
          // Service role: no hay sesion de usuario en un endpoint publico, y con
          // el cliente SSR las policies de RLS rechazan el insert en silencio.
          // Ya paso con los leads de WhatsApp, que se perdieron todos.
          const { error } = await createAdminClient().from('public_quotes').insert({
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
          });
          if (error) console.error('[Agente] No se pudo guardar la consulta:', error);
          else guardadoAlgo = true;
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
    return JSON.stringify({
      whatsapp: CONTACTO.whatsappCon(contexto),
      telefono: CONTACTO.telefonoVisible,
      email: CONTACTO.email,
      horario: HORARIO.texto,
      instruccion: 'Pasale el link tal cual: ya lleva el mensaje escrito.',
    });
  },
});

  return [cotizarCajas, condicionesYPrecios, plantillaDeImpresion, guardarLead, derivarAHumano];
}
