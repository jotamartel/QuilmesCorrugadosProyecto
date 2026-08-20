import { NextRequest, NextResponse } from 'next/server';
import {
  sendWhatsAppMessage,
  sendWhatsAppDocument,
  parseBoxDimensions,
  parseCompanyInfo,
  getConversationState,
  updateConversationState,
  clearConversationState,
  validateDimensions,
  getWelcomeMessage,
  getNameMessage,
  getCompanyInfoMessage,
  getDataConfirmedMessage,
  getQuantityMessage,
  getPrintingMessage,
  getQuoteMessage,
  getConfirmationMessage,
  getAdvisorMessage,
  getShippingMessage,
  getOutOfHoursMessage,
  getUnsupportedMediaMessage,
  isWithinBusinessHours,
  getPhoneQuoteHistory,
  detectarOpcion,
  ClientType,
} from '@/lib/whatsapp';
import { calcularCotizacion } from '@/lib/cotizacion/motor';
import { responder, agenteDisponible } from '@/lib/agente';
import { createAdminClient } from '@/lib/supabase/admin';
import { HORARIO, RETAIL_CONFIG } from '@/lib/retail/config';
import { CONTACTO } from '@/lib/contacto';
import { sendNotification } from '@/lib/notifications';
import { calculateUnfolded, calculateTotalM2 } from '@/lib/utils/box-calculations';
import { SITE_URL } from '@/lib/site';
import { firmaTwilioValida, urlsPosibles } from '@/lib/webhooks/firmas';
import { getPricePerM2, getProductionDays, getActivePricingConfig } from '@/lib/utils/pricing';
import { createClient } from '@/lib/supabase/server';
import { classifyIntent, isGroqEnabled } from '@/lib/groq';
import type { PricingConfig } from '@/lib/types/database';
import {
  upsertContactProfile,
  linkConversationToClient,
} from '@/lib/contact-matching';
import {
  generateConversationalResponse,
  getRecentConversationHistory,
  isWhatsAppAIEnabled,
  type BoxTemplateResponse,
} from '@/lib/whatsapp-ai';

/**
 * Cotiza usando el mismo motor que la web, la API y el MCP.
 *
 * Antes este archivo tenia su propia copia del calculo, con su propio +15% por
 * impresion y su propio redondeo. Los arreglos que se hacian en el motor
 * —el IVA, el limite de colores, saber si la impresion aplica a este canal—
 * nunca llegaban al canal por el que mas gente pregunta.
 */
async function cotizar(
  dimensions: { length: number; width: number; height: number },
  quantity: number,
  printingColors: number,
  config: PricingConfig,
) {
  const supabase = createAdminClient();
  const { data: catalogo } = await supabase
    .from('boxes')
    .select('length_mm, width_mm, height_mm, stock')
    .eq('is_standard', true)
    .eq('is_active', true);

  return calcularCotizacion(
    [{
      length_mm: dimensions.length,
      width_mm: dimensions.width,
      height_mm: dimensions.height,
      quantity,
      printing_colors: printingColors,
    }],
    config,
    catalogo || [],
  );
}

/**
 * Guarda la comunicacion en la base de datos
 */
async function saveCommunication(
  phoneNumber: string,
  direction: 'inbound' | 'outbound',
  content: string,
  metadata?: Record<string, unknown>,
  clientId?: string | null
) {
  try {
    // Service role a proposito: este endpoint lo llama Twilio, no un usuario
    // logueado, asi que no hay sesion que satisfaga las policies de RLS.
    const supabase = createAdminClient();
    const { error } = await supabase.from('communications').insert({
      channel: 'whatsapp',
      direction,
      content,
      client_id: clientId || null,
      metadata: {
        phone: phoneNumber,
        ...metadata,
      },
    });
    if (error) console.error('[WhatsApp] Error guardando comunicacion:', error);
  } catch (error) {
    console.error('[WhatsApp] Error guardando comunicacion:', error);
  }
}

/**
 * Crea un lead en public_quotes desde WhatsApp
 */
async function createWhatsAppLead(data: {
  phoneNumber: string;
  clientName?: string;
  companyName?: string;
  clientEmail?: string;
  clientType?: 'particular' | 'empresa';
  dimensions: { length: number; width: number; height: number };
  quantity: number;
  printingColors: number;
  quote: { total: number; totalM2: number; deliveryDays: number };
  conversationId?: string;
}): Promise<string | null> {
  try {
    // Con el cliente SSR este insert venia fallando con RLS 42501 en cada
    // consulta: salia el mail al equipo pero el lead no quedaba en la base.
    const supabase = createAdminClient();

    // Calcular m² por caja
    const { m2: sqmPerBox } = calculateUnfolded(
      data.dimensions.length,
      data.dimensions.width,
      data.dimensions.height
    );

    // Insertar lead
    const { data: lead, error } = await supabase
      .from('public_quotes')
      .insert({
        // Datos del solicitante
        requester_name: data.companyName || data.clientName || 'WhatsApp ' + data.phoneNumber.slice(-4),
        requester_company: data.companyName,
        requester_email: data.clientEmail || null,
        requester_phone: data.phoneNumber,
        requester_tax_condition: data.clientType === 'empresa' ? 'responsable_inscripto' : 'consumidor_final',

        // Datos de la caja
        length_mm: data.dimensions.length,
        width_mm: data.dimensions.width,
        height_mm: data.dimensions.height,
        quantity: data.quantity,
        has_printing: data.printingColors > 0,
        printing_colors: data.printingColors,

        // Cálculos
        sqm_per_box: sqmPerBox,
        total_sqm: data.quote.totalM2,
        subtotal: data.quote.total,
        estimated_days: data.quote.deliveryDays,

        // Origen WhatsApp
        source: 'whatsapp',
        source_ip: 'whatsapp:' + data.phoneNumber,
        whatsapp_conversation_id: data.conversationId || null,

        // Estado inicial: lead (no pidió contacto, solo vio precio)
        requested_contact: false,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[WhatsApp] Error creando lead:', error);
      return null;
    }

    console.log('[WhatsApp] Lead creado:', lead.id);
    return lead.id;
  } catch (error) {
    console.error('[WhatsApp] Error creando lead:', error);
    return null;
  }
}

/**
 * Detecta si el mensaje contiene media (audio, imagen, video)
 */
function hasMediaContent(formData: FormData): boolean {
  const mediaFields = ['MediaUrl0', 'MediaContentType0', 'NumMedia'];
  for (const field of mediaFields) {
    const value = formData.get(field);
    if (value && value !== '0') {
      return true;
    }
  }
  return false;
}

/**
 * Manda la respuesta del agente y, si menciona la plantilla, tambien el PDF.
 *
 * En WhatsApp un archivo adjunto es mejor que un link: se abre sin salir de la
 * conversacion. El agente devuelve la URL en el texto, asi que se detecta y se
 * manda tambien como documento. WhatsApp no permite texto junto con un
 * adjunto, por eso van en dos mensajes.
 */
async function enviarRespuestaDelAgente(
  from: string,
  phoneNumber: string,
  texto: string,
  clientId: string | null,
) {
  const plantilla = texto.match(/https?:\/\/\S*\/api\/box-template\?\S+/);
  if (plantilla) {
    await sendWhatsAppDocument({ to: from, mediaUrl: plantilla[0] });
  }
  await sendWhatsAppMessage({ to: from, body: texto });
  await saveCommunication(phoneNumber, 'outbound', texto, { agente: true }, clientId);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // ─────────────────────────────────────────────────────────────────────
    // Verificar que la llamada viene de Twilio.
    //
    // Sin esto, el destinatario del mensaje sale de `From`, que es un campo
    // de un formulario sin autenticar. Cualquiera podia hacer un POST con el
    // numero que quisiera y esta cuenta le mandaba —y pagaba— un WhatsApp.
    // Repetido, ademas de la factura, expone el numero a que Meta lo marque
    // por spam, y ese numero es el canal de ventas.
    //
    // Se valida contra las dos formas del dominio porque Twilio firma la URL
    // exacta que tiene cargada en su panel, y el apex responde 308 hacia www:
    // si alla quedo la del apex, la request llega por www con una firma que
    // corresponde al apex.
    // ─────────────────────────────────────────────────────────────────────
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const firma = request.headers.get('x-twilio-signature');

    if (authToken) {
      const params: Record<string, string> = {};
      formData.forEach((valor, clave) => {
        if (typeof valor === 'string') params[clave] = valor;
      });

      // La query string va incluida: Twilio firma la URL completa, y si en el
      // panel quedo cargada con parametros, sin esto la firma nunca coincide.
      const candidatas = urlsPosibles(request.nextUrl.pathname, request.nextUrl.search.slice(1));
      const valida = !!firma && candidatas.some((url) => firmaTwilioValida(authToken, firma, url, params));

      if (!valida) {
        // MODO OBSERVACION, a proposito y por poco tiempo.
        //
        // Bloquear de entrada arriesga el canal de ventas a que yo haya
        // reconstruido mal la URL: Twilio firma la que tiene cargada en su
        // panel, que puede diferir en dominio o en query de la que llega. Si
        // me equivoco, los mensajes de clientes reales se caen en silencio.
        //
        // Entonces primero se mide. Este log dice si la validacion habria
        // pasado con mensajes de verdad; cuando se confirme que si, se
        // reemplaza este bloque por el 403 y queda cerrado.
        console.error(
          '[whatsapp][firma] NO VALIDA — se dejo pasar. firma=%s urls=%s params=%s',
          firma ? firma.slice(0, 12) + '...' : '(ausente)',
          candidatas.join(' | '),
          Object.keys(params).sort().join(','),
        );
      } else {
        console.log('[whatsapp][firma] valida');
      }
    } else {
      // Sin token no se puede verificar nada. Se sigue atendiendo para no
      // cortar el servicio, pero queda registrado: es una configuracion
      // incompleta, no una decision.
      console.error(
        '[whatsapp] TWILIO_AUTH_TOKEN no configurado: el webhook esta ' +
          'aceptando mensajes sin verificar su origen',
      );
    }

    const from = formData.get('From') as string;
    const body = (formData.get('Body') as string || '').trim();
    const phoneNumber = from.replace('whatsapp:', '');
    const bodyLower = body.toLowerCase();

    // Omnicanalidad: upsert contact_profile y matching con client
    const state = await getConversationState(phoneNumber);
    let clientId: string | null = null;
    try {
      const result = await upsertContactProfile({
        phoneNumber,
        email: state.clientEmail,
        displayName: state.clientName,
        companyName: state.companyName,
      });
      clientId = result.clientId;
      await linkConversationToClient(phoneNumber, clientId);
    } catch (err) {
      console.warn('[WhatsApp] Omnicanal: tablas no disponibles o error:', err);
    }

    // Guardar mensaje entrante con client_id si hay match
    await saveCommunication(phoneNumber, 'inbound', body, {
      hasMedia: hasMediaContent(formData),
    }, clientId);
    let responseMessage: string | BoxTemplateResponse = '';
    let quoteData: { total: number; totalM2: number } | null = null;
    let needsAdvisor = false;
    /** Con impresión: enviar desplegado PDF inmediatamente */
    let boxTemplateToSend: { length: number; width: number; height: number } | null = null;

    // ─────────────────────────────────────────────────────────────────────
    // El agente atiende primero. La maquina de estados de mas abajo queda de
    // respaldo por si la API no esta disponible: es el mismo criterio que en el
    // chat del sitio, y no comparte proveedor con el camino principal.
    //
    // Se salta cuando llega media, que el agente no puede leer, y cuando la
    // conversacion ya venia a mitad de un flujo viejo, para no cortarle el paso
    // a alguien que quedo esperando responder "1" o "2".
    // ─────────────────────────────────────────────────────────────────────
    const enFlujoViejo = state.step !== 'initial';
    if (!hasMediaContent(formData) && !enFlujoViejo && agenteDisponible()) {
      try {
        const historial = await getRecentConversationHistory(phoneNumber, 10);
        const r = await responder(body, historial, {
          canal: 'whatsapp',
          telefono: phoneNumber,
        });
        if (r.texto) {
          console.log(
            '[WhatsApp] agente ok. herramientas: %s',
            r.herramientasUsadas.join(',') || 'ninguna',
          );
          await enviarRespuestaDelAgente(from, phoneNumber, r.texto, clientId);
          return new NextResponse(
            '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
            { headers: { 'Content-Type': 'text/xml' } },
          );
        }
        console.error('[WhatsApp] el agente devolvio vacio, pasando al respaldo');
      } catch (error) {
        console.error('[WhatsApp] el agente fallo, pasando al respaldo:', error);
      }
    }

    // Detectar media (audio/imagen/video)
    if (hasMediaContent(formData)) {
      responseMessage = getUnsupportedMediaMessage();
    }
    // Continuar con el flujo normal si no hay media
    else {
      // Patrones de mensajes de cierre
      const closingPatterns = [
        'gracias', 'gracia', 'muchas gracias', 'mil gracias',
        'ok', 'okay', 'okey', 'dale', 'buenisimo', 'buenísimo',
        'perfecto', 'excelente', 'genial', 'barbaro', 'bárbaro',
        'listo', 'entendido', 'recibido', 'anotado',
        'nos vemos', 'hasta luego', 'chau', 'adios', 'adiós',
        'buen dia', 'buen día', 'saludos',
      ];
      // Solo se toman como cierre cuando no hay una cotizacion en curso.
      // "dale", "ok", "listo" y "perfecto" estan en esta lista y tambien son
      // la forma normal de decir que si: a mitad del flujo cerraban la
      // conversacion en vez de avanzarla, y encima borraban el estado.
      const enMedioDelFlujo = state.step !== 'initial';
      const isClosingMessage = !enMedioDelFlujo && closingPatterns.some(pattern =>
        bodyLower === pattern || bodyLower.startsWith(pattern + ' ') || bodyLower.endsWith(' ' + pattern)
      );

      // Salidas de emergencia. Antes solo funcionaban con el texto exacto, asi
      // que "quiero cancelar" o "cancelar por favor" no hacian nada y la
      // persona quedaba atrapada en el paso donde estuviera.
      const quiereSalir = detectarOpcion(body, [
        { n: 1, palabras: ['cancelar', 'reiniciar', 'empezar', 'basta', 'salir'] },
      ]) === 1;
      const pideHumano = state.step !== 'quoted' && detectarOpcion(body, [
        { n: 1, palabras: ['asesor', 'vendedor', 'humano'] },
      ]) === 1;

      // Comandos especiales
      if (quiereSalir) {
        await clearConversationState(phoneNumber);
        responseMessage = 'Listo, empezamos de cero. Escribi "cotizar" cuando quieras.';
      }
      // Pedir un humano tiene que funcionar en cualquier momento, no solo
      // despues de cotizar.
      else if (pideHumano) {
        responseMessage = getAdvisorMessage();
        needsAdvisor = true;
        await sendNotification({
          type: 'advisor_request',
          origin: 'WhatsApp',
          contact: {
            phone: phoneNumber,
            name: state.clientName,
            email: state.clientEmail,
          },
        });
      }
      // Mensajes de cierre
      else if (isClosingMessage) {
        responseMessage = `Gracias a vos! Si necesitas otra cotizacion, escribi "cotizar".

Quilmes Corrugados - ${HORARIO.corto}`;
      }
      // Esperando tipo de cliente (particular o empresa)
      else if (state.step === 'waiting_client_type') {
        // includes('1') matcheaba "necesito 1000 cajas" como particular, y
        // "empresa" contiene ambas opciones si se busca por substring.
        const tipoElegido = detectarOpcion(body, [
          { n: 1, palabras: ['particular', 'persona', 'yo', 'personal'] },
          { n: 2, palabras: ['empresa', 'negocio', 'compañia', 'compania', 'pyme', 'comercio'] },
        ]);
        let isParticular = tipoElegido === 1;
        let isEmpresa = tipoElegido === 2;

        // Si no detectamos con patterns simples, usar Groq
        if (!isParticular && !isEmpresa && isGroqEnabled()) {
          try {
            const classification = await classifyIntent(body, state.step);
            if (classification.intent === 'client_particular') {
              isParticular = true;
            } else if (classification.intent === 'client_empresa') {
              isEmpresa = true;
            }
          } catch (error) {
            console.error('[WhatsApp] Error con Groq en waiting_client_type:', error);
          }
        }

        if (isParticular) {
          await updateConversationState(phoneNumber, {
            step: 'waiting_name',
            clientType: 'particular' as ClientType,
          });
          responseMessage = getNameMessage();
        } else if (isEmpresa) {
          await updateConversationState(phoneNumber, {
            step: 'waiting_company_info',
            clientType: 'empresa' as ClientType,
          });
          responseMessage = getCompanyInfoMessage();
        } else {
          responseMessage = `No entendi tu respuesta. Por favor elegi:

1 - Particular
2 - Empresa`;
        }
      }
      // Esperando nombre (para particulares)
      else if (state.step === 'waiting_name') {
        // Validar que el mensaje parece un nombre (al menos 2 palabras o más de 3 caracteres)
        const name = body.trim();
        if (name.length >= 3) {
          await updateConversationState(phoneNumber, {
            step: 'waiting_dimensions',
            clientName: name,
          });
          responseMessage = getDataConfirmedMessage('particular', name);
        } else {
          responseMessage = `Por favor, indicame tu nombre completo.`;
        }
      }
      // Esperando datos de empresa
      else if (state.step === 'waiting_company_info') {
        const parsed = parseCompanyInfo(body);

        // Acumular datos parciales del estado actual
        const currentCompany = state.companyName || parsed.companyName;
        const currentName = state.clientName || parsed.contactName;
        const currentEmail = state.clientEmail || parsed.email;

        // Si tenemos todos los datos, pasar a dimensiones
        if (currentCompany && currentName && currentEmail) {
          await updateConversationState(phoneNumber, {
            step: 'waiting_dimensions',
            companyName: currentCompany,
            clientName: currentName,
            clientEmail: currentEmail,
          });
          responseMessage = getDataConfirmedMessage('empresa', currentName, currentCompany);
        }
        // Si tenemos datos parciales, guardarlos y pedir lo que falta
        else if (parsed.companyName || parsed.contactName || parsed.email) {
          await updateConversationState(phoneNumber, {
            companyName: currentCompany,
            clientName: currentName,
            clientEmail: currentEmail,
          });

          const missing: string[] = [];
          if (!currentCompany) missing.push('nombre de la empresa');
          if (!currentName) missing.push('tu nombre de contacto');
          if (!currentEmail) missing.push('email de contacto');

          responseMessage = `Gracias! Todavia me falta: ${missing.join(', ')}.`;
        }
        // Si no pudimos parsear nada
        else {
          responseMessage = `No pude entender los datos. Por favor enviame:

- Nombre de la empresa
- Tu nombre de contacto
- Email de contacto

Ejemplo:
Acme SRL
Juan Perez
juan@acme.com`;
        }
      }
      // Esperando dimensiones
      else if (state.step === 'waiting_dimensions') {
        const parsed = parseBoxDimensions(body);

        if (parsed?.length && parsed?.width && parsed?.height) {
          const validation = validateDimensions(parsed.length, parsed.width, parsed.height);

          if (!validation.valid) {
            responseMessage = validation.error!;
          } else {
            await updateConversationState(phoneNumber, {
              step: 'waiting_quantity',
              dimensions: { length: parsed.length, width: parsed.width, height: parsed.height },
            });
            responseMessage = getQuantityMessage(parsed.length, parsed.width, parsed.height);
          }
        } else {
          responseMessage = `No pude entender las medidas.

Por favor usa el formato:
- 400x300x300
- 40x30x30 cm
- Largo 400 Ancho 300 Alto 300`;
        }
      }
      // Esperando cantidad
      else if (state.step === 'waiting_quantity') {
        // El '+' no es cosmetico. Con '*' la primera alternativa matcheaba
        // \d{1,3} sola y tenia exito, asi que \d+ nunca se probaba: todo
        // numero de 4 o mas digitos sin puntos se leia truncado a sus primeros
        // tres. "2600 unidades" entraba como 260 y salia una cotizacion diez
        // veces menor que se veia perfectamente valida. El caso mas silencioso
        // era 1000 -> 100, que ademas pasa el control de minimo.
        const qtyMatch = body.match(/(\d{1,3}(?:\.\d{3})+|\d+)/);

        if (qtyMatch) {
          const quantity = Number(qtyMatch[1].replace(/\./g, ''));

          // El minimo se mide en m² de carton, no en cajas: 100 cajas chicas
          // son 34 m² y 100 grandes pasan los 100. Con las medidas ya
          // capturadas se puede decir exactamente cuantas cajas faltan, que es
          // lo que la persona necesita para decidir.
          const d = state.dimensions!;
          const m2PorCaja = calculateUnfolded(d.length, d.width, d.height).m2;
          const m2Pedido = calculateTotalM2(m2PorCaja, quantity);

          if (m2Pedido < RETAIL_CONFIG.MIN_M2_PEDIDO) {
            const cajasMinimo = Math.ceil(RETAIL_CONFIG.MIN_M2_PEDIDO / m2PorCaja);
            responseMessage =
              `El minimo de compra es ${RETAIL_CONFIG.MIN_M2_PEDIDO} m² de carton y ` +
              `${quantity.toLocaleString('es-AR')} cajas de ${d.length}x${d.width}x${d.height} son ` +
              `${m2Pedido.toFixed(1)} m².\n\n` +
              `Con esta medida el minimo son ${cajasMinimo.toLocaleString('es-AR')} cajas. ` +
              `Te sirve esa cantidad?`;
          } else {
            await updateConversationState(phoneNumber, {
              step: 'waiting_printing',
              quantity,
            });
            responseMessage = getPrintingMessage(quantity);
          }
        } else {
          responseMessage = `No entendi la cantidad. Por favor escribe solo el numero.

Ejemplo: 500`;
        }
      }
      // Esperando impresion
      else if (state.step === 'waiting_printing') {
        // "sin impresion" va primero: si se evaluara "impresion" antes, la
        // negacion matchearia la opcion contraria. Y 'si' pelado no entra en
        // la lista, porque estaba matcheando adentro de "sin".
        const impresionElegida = detectarOpcion(body, [
          {
            n: 1,
            palabras: [
              'sin impresion', 'sin impresión', 'sin logo', 'sin nada',
              'no quiero', 'no lleva', 'no llevan', 'no necesito',
              'lisa', 'lisas', 'liso',
            ],
            exacto: ['no', 'ninguna', 'ninguno', 'nada'],
          },
          { n: 2, palabras: ['impresion', 'impresa', 'impreso', 'logo', 'estampado', 'color', 'colores'] },
        ]);

        const { dimensions, quantity } = state;

        if (impresionElegida === null) {
          // Antes cualquier texto con un 2 adentro contaba como "si". El dueño
          // escribio "2600 no 260" para corregir la cantidad y el bot lo tomo
          // como opcion 2: perdio la correccion y cobro un recargo que nadie
          // habia pedido. Preguntar de nuevo cuesta un mensaje; adivinar mal
          // cuesta la cotizacion entera.
          responseMessage = `No entendi si llevan impresion.

1 - Sin impresion (lisa)
2 - Con impresion (hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores)`;
        } else if (!dimensions || !quantity) {
          await clearConversationState(phoneNumber);
          responseMessage = 'Hubo un error. Escribe "cotizar" para empezar de nuevo.';
        } else {
          // Obtener configuración de precios activa
          const pricingConfig = await getActivePricingConfig();
          if (!pricingConfig) {
            responseMessage = 'Disculpá, hay un problema técnico con los precios. Por favor contactá con un asesor.';
          } else {
            const hasPrinting = impresionElegida === 2;
            // Un color mientras no exista la columna para guardar cuantos. Es
            // lo mismo que cobraba antes, pero ahora sale del motor y no de un
            // +15% escrito a mano en este archivo.
            const cotizacion = await cotizar(
              dimensions,
              quantity,
              hasPrinting ? 1 : 0,
              pricingConfig,
            );
            const quote = {
              total: cotizacion.subtotal,
              totalM2: cotizacion.total_m2,
              deliveryDays: cotizacion.estimated_days,
            };

            await updateConversationState(phoneNumber, {
              step: 'quoted',
              hasPrinting,
              lastQuoteTotal: quote.total,
              lastQuoteM2: quote.totalM2,
            });

            responseMessage = getQuoteMessage(dimensions, quantity, cotizacion);
            quoteData = { total: quote.total, totalM2: quote.totalM2 };
            // Solo se promete el desplegado si la impresion aplica de verdad a
            // este pedido: en el canal de stock no se imprime.
            if (hasPrinting && cotizacion.printing.available) boxTemplateToSend = dimensions;

            // Crear lead en public_quotes
            await createWhatsAppLead({
              phoneNumber,
              clientName: state.clientName,
              companyName: state.companyName,
              clientEmail: state.clientEmail,
              clientType: state.clientType,
              dimensions,
              quantity,
              printingColors: cotizacion.boxes[0].printing_colors,
              quote,
            });

            // Notificar al equipo con datos del cliente
            await sendNotification({
              type: 'lead_with_contact',
              origin: 'WhatsApp',
              box: dimensions,
              quantity,
              totalArs: quote.total,
              contact: {
                phone: phoneNumber,
                name: state.clientName,
                email: state.clientEmail,
                company: state.companyName,
              },
            });
          }
        }
      }
      // Ya cotizado, esperando confirmacion
      else if (state.step === 'quoted') {
        // includes('3') convertia "quiero cambiar a 300 unidades" en pedido de
        // asesor, e includes('si') hacia que "un asesor si es posible" contara
        // como confirmacion del pedido.
        const accion = detectarOpcion(body, [
          { n: 3, palabras: ['asesor', 'vendedor', 'humano', 'hablar', 'persona'] },
          { n: 2, palabras: ['modificar', 'cambiar', 'corregir', 'otra', 'otras'] },
          { n: 1, palabras: ['confirmar', 'confirmo', 'dale', 'avancemos', 'acepto'] },
        ]);

        if (accion === 1) {
          responseMessage = getConfirmationMessage();
          await clearConversationState(phoneNumber);
        } else if (accion === 2) {
          await updateConversationState(phoneNumber, { step: 'waiting_dimensions' });
          responseMessage = `OK, empecemos de nuevo. Indicame las nuevas medidas:

Formato: Largo x Ancho x Alto
Ejemplo: 400x300x300`;
        } else if (accion === 3) {
          responseMessage = getAdvisorMessage();
          needsAdvisor = true;

          // Notificar al equipo que piden asesor con datos del cliente
          await sendNotification({
            type: 'advisor_request',
            origin: 'WhatsApp',
            contact: {
              phone: phoneNumber,
              name: state.clientName,
              email: state.clientEmail,
            },
          });
        } else {
          responseMessage = `No entendi tu respuesta. Por favor elegi una opcion:

1 - Confirmar pedido
2 - Modificar medidas
3 - Hablar con un asesor`;
        }
      }
      // Inicio de conversacion
      else if (
        state.step === 'initial' ||
        bodyLower.includes('hola') ||
        bodyLower.includes('cotizar') ||
        bodyLower.includes('buenos dias') ||
        bodyLower.includes('buenas tardes')
      ) {
        // Verificar si es cliente repetido
        const history = await getPhoneQuoteHistory(phoneNumber);
        const isReturning = history.totalQuotes > 0;

        // Ahora va a waiting_client_type para pedir datos primero
        await updateConversationState(phoneNumber, { step: 'waiting_client_type' });

        // Mensaje de bienvenida que pregunta si es particular o empresa
        responseMessage = getWelcomeMessage(isReturning, history.lastQuote);

        // Si es fuera de horario y es primer mensaje, agregar aviso
        if (!isWithinBusinessHours() && state.step === 'initial') {
          responseMessage = getOutOfHoursMessage() + '\n\n---\n\n' + responseMessage;
        }
      }
      // Estado desconocido - clasificar y responder (IA conversacional cuando corresponde)
      else {
        if (isGroqEnabled()) {
          try {
            const classification = await classifyIntent(body, state.step);
            console.log('[WhatsApp] Groq classification:', classification);

            switch (classification.intent) {
              case 'greeting':
              case 'quote_request': {
                const history = await getPhoneQuoteHistory(phoneNumber);
                await updateConversationState(phoneNumber, { step: 'waiting_client_type' });
                responseMessage = getWelcomeMessage(history.totalQuotes > 0, history.lastQuote);
                break;
              }

              case 'closing':
                responseMessage = `Gracias a vos! Si necesitas otra cotizacion, escribi "cotizar".

Quilmes Corrugados - ${HORARIO.corto}`;
                break;

              case 'advisor':
                responseMessage = getAdvisorMessage();
                needsAdvisor = true;
                await sendNotification({
                  type: 'advisor_request',
                  origin: 'WhatsApp',
                  contact: {
                    phone: phoneNumber,
                    name: state.clientName,
                    email: state.clientEmail,
                  },
                });
                break;

              case 'question_shipping':
              case 'question_other':
              case 'unknown':
                // IA conversacional: respuestas detalladas con conocimiento del negocio
                if (isWhatsAppAIEnabled()) {
                  responseMessage = await generateConversationalResponse(body, phoneNumber, {
                    conversationState: state.step,
                    clientName: state.clientName,
                    companyName: state.companyName,
                    lastQuoteTotal: state.lastQuoteTotal,
                    lastQuoteM2: state.lastQuoteM2,
                  });
                } else {
                  responseMessage = classification.intent === 'question_shipping'
                    ? getShippingMessage(state.step === 'quoted')
                    : `No entendi tu mensaje. Escribe "cotizar" para una cotizacion o "asesor" para hablar con alguien.`;
                }
                break;

              default:
                if (isWhatsAppAIEnabled()) {
                  responseMessage = await generateConversationalResponse(body, phoneNumber, {
                    conversationState: state.step,
                    clientName: state.clientName,
                    companyName: state.companyName,
                  });
                } else {
                  responseMessage = `No entendi tu mensaje.

Escribe "cotizar" para una cotizacion o "asesor" para hablar con alguien.`;
                }
            }
          } catch (error) {
            console.error('[WhatsApp] Error con Groq:', error);
            if (isWhatsAppAIEnabled()) {
              try {
                responseMessage = await generateConversationalResponse(body, phoneNumber);
              } catch {
                responseMessage = 'Escribe "cotizar" para empezar una nueva cotizacion.';
              }
            } else {
              responseMessage = 'Escribe "cotizar" para empezar una nueva cotizacion.';
            }
          }
        } else {
          responseMessage = 'Escribe "cotizar" para empezar una nueva cotizacion.';
        }
      }
    }

    // Preparar metadata
    const outboundMetadata: Record<string, unknown> = { state: state.step };

    if (quoteData) {
      outboundMetadata.quote = quoteData;
    }

    if (needsAdvisor) {
      outboundMetadata.needsAdvisor = true;
    }

    // Manejar respuesta que puede ser string o BoxTemplateResponse
    let textToSend: string;
    let boxTemplateDims: BoxTemplateResponse['boxTemplate'] | null = null;

    if (typeof responseMessage === 'object' && responseMessage !== null && 'boxTemplate' in responseMessage) {
      textToSend = responseMessage.response;
      boxTemplateDims = responseMessage.boxTemplate;
    } else {
      textToSend = responseMessage as string;
    }

    if (boxTemplateDims) {
      const baseUrl = SITE_URL;
      const templateUrl = `${baseUrl}/api/box-template?length=${boxTemplateDims.length}&width=${boxTemplateDims.width}&height=${boxTemplateDims.height}`;
      await sendWhatsAppDocument({ to: from, mediaUrl: templateUrl });
    } else if (boxTemplateToSend) {
      const baseUrl = SITE_URL;
      const templateUrl = `${baseUrl}/api/box-template?length=${boxTemplateToSend.length}&width=${boxTemplateToSend.width}&height=${boxTemplateToSend.height}`;
      await sendWhatsAppDocument({ to: from, mediaUrl: templateUrl });
    }

    // Enviar mensaje de texto (WhatsApp no permite body junto con document, por eso se envía después)
    await sendWhatsAppMessage({ to: from, body: textToSend });

    // Guardar mensaje saliente con client_id
    await saveCommunication(phoneNumber, 'outbound', textToSend, outboundMetadata, clientId);

    // TwiML vacío
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { 'Content-Type': 'text/xml' } }
    );

  } catch (error) {
    console.error('[WhatsApp] Webhook error:', error);

    // Antes esto devolvia 200 con TwiML vacio: la persona escribia y no le
    // contestaba nadie, sin forma de saber si el mensaje habia llegado. Se le
    // avisa y se le deja una salida humana. El 200 se mantiene a proposito:
    // con un 500 Twilio reintenta y, como el handler todavia no es idempotente,
    // el reintento puede avanzar el flujo dos veces.
    try {
      const from = (await request.clone().formData()).get('From') as string | null;
      if (from) {
        await sendWhatsAppMessage({
          to: from,
          body:
            `Perdon, tuvimos un problema tecnico y no pude procesar tu mensaje.\n\n` +
            `Escribinos directamente al ${CONTACTO.telefonoVisible} o a ${CONTACTO.email} ` +
            `y lo resolvemos a mano.`,
        });
      }
    } catch (avisoError) {
      console.error('[WhatsApp] Tampoco se pudo avisar del error:', avisoError);
    }

    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'active',
    service: 'WhatsApp webhook',
    timestamp: new Date().toISOString(),
    businessHours: isWithinBusinessHours(),
  });
}
