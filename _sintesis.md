# Bot de WhatsApp — plan de arreglo por causa raíz

Cinco auditores encontraron 70+ hallazgos y los revisores confirmaron la mayoría. Deduplicados y agrupados por causa raíz, quedan **12 problemas** que hay que arreglar. Ordenados por lo que cuesta plata.

---

## GRUPO A — Cotiza incorrectamente (plata directa)

### A.1 · La cantidad se trunca a 3 dígitos y todo lo demás sigue rota atrás
**Un solo regex mal escrito envenena toda la cotización.**

- **Archivo**: `src/app/api/whatsapp/webhook/route.ts:454`
- **Bug**: `body.match(/(\d{1,3}(?:\.\d{3})*|\d+)/)`. Para "2600" la alternativa `\d{1,3}` tiene éxito con "260" y la segunda nunca se prueba. 2600→260, 4000→400, 10000→100.
- **Costo real**: en la transcripción del dueño, "2600 unidades" quedó como 260 → cotización 10× menor. Si el cliente confirma, o la fábrica pierde plata o hay que rehacer todo.
- **Fix concreto**:
  ```ts
  // Reemplazar la línea 454 por:
  const quantityMatch = body.match(/(\d{1,3}(?:\.\d{3})+|\d+)/);
  //                                            ^ obligar >=1 grupo de miles
  ```
  El `+` en lugar de `*` fuerza al engine a probar `\d+` si no hay separadores de miles. Ya está bien hecho en `whatsapp.ts:252` (donde el sufijo "unidades" obliga el backtracking) — copiar de ahí.
- **No requiere base de datos**. 5 minutos.

---

### A.2 · Todos los "elegí una opción" del bot son substring match: activan impresión, mal-clasifican canal, y confirman lo que no pediste
Es una familia de un mismo bug. `bodyLower.includes('1')`, `.includes('2')`, `.includes('3')`, `.includes('si')` matchean cualquier subcadena.

**Casos confirmados**:
| Estado | Línea | Input | Interpretado como |
|---|---|---|---|
| waiting_client_type | 321-326 | "necesito 1000 cajas" | particular |
| waiting_client_type | 321-326 | "empresa SRL" | particular Y empresa (gana particular) |
| waiting_printing | 476-480 | "2600 no 260" | con impresión (+15%) |
| waiting_printing | 476-480 | "sin impresión" | con impresión (`'sin'` contiene `'si'`) |
| quoted | 545 | "quiero un asesor si es posible" | confirmar (contiene 'si') |
| quoted | 545 | "hablo con 1 asesor" | confirmar (contiene '1') |
| quoted | 554 | "quiero cambiar a 300 unidades" | asesor (contiene '3') |

**Fix concreto**: reemplazar los 8 `includes()` de matching de opciones por matching estructurado:

```ts
// Helper en whatsapp.ts:
function detectarOpcion(body: string, opciones: {n: number, palabras: string[]}[]): number | null {
  const b = body.trim().toLowerCase();
  // 1) número aislado
  const soloNumero = b.match(/^([123])\s*[.\-)]?\s*$/);
  if (soloNumero) return parseInt(soloNumero[1], 10);
  // 2) número al principio: "1 confirmar", "2. modificar"
  const prefijo = b.match(/^([123])\b/);
  if (prefijo) return parseInt(prefijo[1], 10);
  // 3) palabra clave (una sola de la lista, con word boundary)
  for (const o of opciones) {
    for (const p of o.palabras) {
      if (new RegExp(`\\b${p}\\b`, 'i').test(b)) return o.n;
    }
  }
  return null;
}

// En waiting_printing (route.ts:475):
const opcion = detectarOpcion(body, [
  {n: 1, palabras: ['lisa', 'lisas', 'sin impresion', 'sin impresión', 'sin impreso', 'sin logo']},
  {n: 2, palabras: ['impresion', 'impresión', 'impreso', 'con logo', 'estampado']},
]);
if (opcion === null) { responseMessage = 'No entendí. Respondé "1" (sin impresión) o "2" (con impresión).'; }
else { hasPrinting = (opcion === 2); ... }
```

Aplicar el mismo patrón en waiting_client_type y en `quoted` (1=confirmar, 2=modificar, 3=asesor).

**Bonus**: la palabra `'si'` sin boundary rompe todo. Usar `\bsí?\b`.

**No requiere base de datos**. 30 minutos.

---

### A.3 · El bot tiene su propio calculateQuote y su propio calculateQuote (dos copias) — el motor central no se usa
**Este es el problema estructural más caro**. Todo lo que se arregla en el motor no llega al canal por el que más gente cotiza.

**Copias paralelas del cálculo**:
- `webhook/route.ts:48-79` — devuelve `{total, totalM2, deliveryDays}`.
- `whatsapp-ai.ts:295-311` — otra copia, también manual.
- Motor central en `src/lib/cotizacion/motor.ts` — devuelve además `tax_rate`, `tax_amount`, `total_with_tax`, `subtotal_includes_tax`, `channel`, `channel_note`, `printing.available`, `printing_colors`, `valid_until`, `estimated_days`, `whatsapp_message` (handoff `[COTIZADO-WEB]`), `summary`.

**Consecuencias directas confirmadas**:
| Síntoma | Efecto en el cliente |
|---|---|
| No aplica IVA | "Total: $333.899" → factura llega $404.018 |
| No sabe qué es canal stock | Ofrece impresión a 293 m² (canal stock, no imprime) y cobra +15% de recargo por algo que no se fabrica |
| Boolean `hasPrinting` | El cliente que pide 3 colores queda cotizado con 1 (motor cobra +45%, bot cobra +15%) |
| `printing_colors=1` hardcoded en `createWhatsAppLead` (route.ts:149) | Lead queda mal y si se produce sin revisar, la caja sale con 1 solo color |
| Ignora `channel_note` | No dice "24-48 hs de stock" vs "14 días a medida" según corresponde |
| Escribe `Validez: 7 días` como literal | Ignora `pricing_config.quote_validity_days` |
| `PRINTING_INCREMENT = 0.15` duplicado en 3 archivos | El día que suba a 0.18, la web sube y el bot no |

**Fix concreto** (refactor de una tarde):

1. **Borrar** `calculateQuote` y `PRINTING_INCREMENT` de `route.ts:41-79`.
2. **Borrar** la copia paralela de `whatsapp-ai.ts:295-311`.
3. **Agregar** un paso `waiting_printing_colors` entre `waiting_printing` y `quoted`:
   ```ts
   // En waiting_printing, si hasPrinting === true:
   await updateConversationState(phoneNumber, {step: 'waiting_printing_colors', has_printing: true});
   responseMessage = '¿Cuántos colores? Respondé 1, 2 o 3.';
   ```
4. **Reemplazar** la llamada actual por:
   ```ts
   import { calcularCotizacion } from '@/lib/cotizacion/motor';

   const quote = await calcularCotizacion(
     [{
       length_mm: state.dimensions.length,
       width_mm: state.dimensions.width,
       height_mm: state.dimensions.height,
       quantity: state.quantity,
       printing_colors: state.printingColors ?? 0,
     }],
     pricingConfig
   );
   ```
5. **Reescribir** `getQuoteMessage` (`whatsapp.ts:614`) para consumir el `QuoteResult`:
   ```
   COTIZACIÓN QUILMES CORRUGADOS

   Caja: 300x380x420mm ({colores} colores | sin impresión)
   Cantidad: 2.600 unidades  (293,3 m²)

   Subtotal:      $333.899 (sin IVA)
   IVA 21%:        $70.119
   Total:         $404.018

   {quote.boxes[0].channel_note}
   Entrega estimada: {quote.estimated_days} días hábiles
   Cotización válida hasta: {quote.valid_until}
   ```
6. Si `quote.boxes[0].printing.available === false` y el cliente pidió impresión, saltar la pregunta con: *"Este pedido sale de stock (293 m² < 3.000 m²). La impresión se produce a medida. ¿Cotizo sin impresión o subís la cantidad?"*
7. **Usar** el `quote.whatsapp_message` (`[COTIZADO-WEB]`) como handoff a asesor.

**Requiere agregar una columna `printing_colors` en `whatsapp_conversations`** (o convertir `has_printing` en int). Migración simple.

---

### A.4 · Los mismos datos de negocio están escritos a mano en el bot en vez de leer las constantes centralizadas
El proyecto ya vivió este bug con colores, IVA, mínimos, teléfono y envío. El subsistema del bot es el archivo que quedó afuera del refactor.

**Datos duplicados confirmados**:

| Dato | Fuente de verdad | Dónde está mal escrito | Impacto |
|---|---|---|---|
| Teléfono | `contacto.ts` → `CONTACTO.tel` | `whatsapp.ts:10` fallback `'+5491133411781'`; `whatsapp-ai.ts:51` idem | Cambia el número, el bot sigue mandando al viejo |
| Email | `contacto.ts` → `CONTACTO.email` | `whatsapp.ts:675`, `whatsapp-ai.ts:101` | Idem |
| Mínimo minorista | `retail/config.ts` → `RETAIL_CONFIG.MIN_CANTIDAD` (100) | `route.ts:459`, `whatsapp.ts:24-30 LIMITS`, `whatsapp-ai.ts:281` | Un día lo suben a 150, el bot sigue en 100 |
| Mínimo mayorista m² | `retail/config.ts` → `MIN_M2_A_MEDIDA` (3000) | `whatsapp.ts:611` literal `< 3000`, `getQuantityMessage` literal | Idem |
| Texto de mínimos | `retail/config.ts` → `MINIMOS.corto/largo` | `getQuantityMessage` inventa su propio texto | Al minorista con 260 cajas le dice "menos del mínimo" cuando está OK |
| Envío | `retail/config.ts` → `ENVIO.micro/corto/largo` | `getShippingMessage` (`whatsapp.ts`) hardcodea "60km" y "3000 m²" sin mencionar retiro en fábrica ni distinción mayorista/minorista | Mismo bug que ya se corrigió en 14 lugares del sitio |
| Colores máx. | `retail/config.ts` → `MAX_PRINTING_COLORS` (3) | `getPrintingMessage` "hasta 3 colores" literal | Cambia a 4, el bot sigue en 3 |
| Validez cotización | `pricing_config.quote_validity_days` | `whatsapp.ts:633` "Validez: 7 días" literal; `whatsapp-ai.ts:352` idem | Bajan validez a 3, bot sigue prometiendo 7 |
| Dimensiones min/max | `RETAIL_CONFIG.MIN_LARGO/ANCHO/ALTO` | `whatsapp.ts:24-30 LIMITS` (más estrictas que el resto) | Bot rechaza 150x150x80 que la web acepta |
| Ancho máx plancha | `RETAIL_CONFIG.MAX_SHEET_WIDTH` (1200) | `whatsapp.ts:26`, `whatsapp-ai.ts:74` texto | Idem |
| Horario | ver A.5 abajo | 5 lugares en el bot | ver A.5 |
| Recargo impresión | motor.ts | `route.ts:41`, `whatsapp-ai.ts:21` | Cambio no llega |

**Fix concreto**: en `route.ts`, `whatsapp.ts` y `whatsapp-ai.ts` agregar los imports:
```ts
import { CONTACTO } from '@/lib/contacto';
import { RETAIL_CONFIG, MINIMOS, ENVIO } from '@/lib/retail/config';
```

Reemplazar todos los literales por referencias. Borrar el objeto `LIMITS` de `whatsapp.ts:24-30` y hacer que `validateDimensions` lea `RETAIL_CONFIG`. Borrar `BUSINESS_PHONE` y usar `CONTACTO.tel`. Reemplazar textos de mínimos por `MINIMOS.corto` (o `.largo`). Reemplazar `getShippingMessage` para que devuelva `ENVIO.largo` con el bloque de retiro en fábrica.

Para `pricingConfig`, pasar el objeto a `getQuoteMessage` y usar `config.quote_validity_days`.

**No requiere base de datos**. Un par de horas.

---

### A.5 · Horario 7-16 en el bot, 8-17 en todo el resto del negocio (dos horarios distintos convivendo)
**Necesita decisión del dueño**: ¿el horario real es 7-16 o 8-17? La página de contacto, el FAQ, el JSON-LD del sitio, el bot telefónico Retell y `types/retell.ts:227` dicen 8-17. Solo el bot de WhatsApp dice 7-16 (5 apariciones).

**Consecuencias medidas**:
- Cliente a las 7:30: el bot lo atiende, el vendedor no está. Cotiza, confirma, espera respuesta que llega en 30 min a la mejor.
- Cliente a las 16:30: el bot le dice "fuera de horario" pero el sitio dice que hay alguien hasta las 17.
- Cliente compara los dos canales y ve dos horarios distintos: pierde confianza.

**Lugares desincronizados**:
- Bot 7-16: `whatsapp.ts:17`, `whatsapp.ts:662`, `:677`, `:708`, `whatsapp-ai.ts:103`, `webhook/route.ts:317`, `:618`, `email-parser.ts:174`, `:206`, `llms.txt/route.ts:270`.
- Sitio 8-17: `layout.tsx:129` (schema.org), `contacto/page.tsx:102`, `faq/page.tsx:54`, `retell-agent.ts:34`, `types/retell.ts:227-228`, `retell/transferir/route.ts:194-199`.

**Fix concreto**:
1. **Decisión del dueño**: ¿7-16 u 8-17?
2. Crear `src/lib/horario.ts`:
   ```ts
   export const HORARIO = {
     desde: 8, hasta: 17,
     dias: [1,2,3,4,5],
     texto: 'Lunes a Viernes de 8:00 a 17:00',
   };
   export function estaEnHorario(d = new Date()): boolean {...}
   ```
3. Reemplazar las 11 apariciones por `HORARIO`. Generar el texto de `getOutOfHoursMessage` con `HORARIO.texto`.

**No requiere base de datos**. 1 hora. Bloqueado por decisión del dueño.

---

## GRUPO B — El lead se pierde en silencio (plata directa)

### B.1 · Cuando el cliente confirma el pedido (opción 1), el equipo no se entera
**Es el bug más caro del flujo**. En `route.ts:545-547`:

```ts
if (bodyLower.includes('1') || bodyLower.includes('confirmar') || bodyLower.includes('si')) {
  responseMessage = getConfirmationMessage();
  await clearConversationState(phoneNumber);  // 👈 solo esto
}
```

No hay `sendNotification`. No hay `UPDATE public_quotes SET requested_contact=true`. Ricardo confirma, el bot le dice "un vendedor te va a contactar en breve", nadie se entera, se lo lleva otro proveedor.

Peor: `clearConversationState` nulléa `client_name`, `company_name`, `client_email`, `dimensions`, `quantity`, `has_printing`. Se borra la huella del cierre.

**Fix concreto**:
```ts
if (opcion === 1) {  // con el detectarOpcion del fix A.2
  // 1. Notificar YA al equipo con asunto distinto
  await sendNotification({
    type: 'lead_confirmed',       // 👈 nuevo type
    origin: 'WhatsApp — CONFIRMÓ PEDIDO',
    box: state.dimensions,
    quantity: state.quantity,
    totalArs: state.lastQuoteTotal,
    totalWithTaxArs: state.lastQuoteTotalWithTax,
    contact: {
      phone: phoneNumber,
      name: state.clientName,
      email: state.clientEmail,
      company: state.companyName,
      notes: 'Cliente CONFIRMÓ pedido por WhatsApp. Contactar urgente.'
    }
  });
  // 2. Marcar en la base
  await supabase.from('public_quotes')
    .update({ requested_contact: true, status: 'confirmed_by_client' })
    .eq('whatsapp_conversation_id', state.conversationId);
  // 3. Marcar la conversación
  await supabase.from('whatsapp_conversations')
    .update({ attended: false, closed_confirmed: true })
    .eq('phone_number', phoneNumber);
  // 4. RECIÉN AHORA clearConversationState
  responseMessage = getConfirmationMessage();
  await clearConversationState(phoneNumber);
}
```

Además, agregar un asunto/label distinto en `sendNotification` para que el vendedor filtre en el inbox: `lead_new`, `advisor_request`, `lead_confirmed`.

**Requiere**: agregar el campo `status='confirmed_by_client'` en el enum de `public_quotes`, y `closed_confirmed`/`last_quote_total_with_tax` en `whatsapp_conversations`.

---

### B.2 · La firma de Twilio está en "modo observación": cualquiera puede envenenar leads y facturar Twilio
En `route.ts:228-247`:
```ts
if (!valida) {
  console.error('...MODO OBSERVACION, a proposito y por poco tiempo');
  // ❌ NO hay return 403
}
```

Además, `to = formData.get('From')` (línea 258) se reusa como destinatario del outbound. Quien POSTee elige a qué número Twilio manda WhatsApps facturados a esta cuenta.

**Escenario real**: `curl -X POST https://www.quilmescorrugados.com.ar/api/whatsapp/webhook -d 'From=whatsapp:+549XXX&Body=hola'` sin firma. El bot atiende, cobra a Twilio, y si repite el flujo entero crea un lead falso y dispara notificaciones al vendedor. A escala: factura Twilio infllada, número marcado como spam por Meta (pierden el canal), inbox del equipo con basura.

**Fix concreto** (5 minutos):
```ts
if (!valida) {
  console.error('[WhatsApp] Firma Twilio inválida', {from, sig});
  return new NextResponse('', { status: 403 });
}
```

Y en la rama `!authToken`:
```ts
if (!authToken) {
  console.error('[WhatsApp] TWILIO_AUTH_TOKEN no configurado');
  return new NextResponse('', { status: 503 });
}
```

**No requiere base de datos**. Corregir HOY.

---

### B.3 · Sin idempotencia por MessageSid + race condition = leads y notificaciones duplicadas
Dos problemas relacionados:

**(a) Reintentos de Twilio**: el camino crítico puede pasar los 15s que Twilio espera (Groq clasifica + Groq LLM 70b + Twilio download del PDF + Twilio send + Supabase inserts + email). Si tarda 16s, Twilio reenvía el mismo POST. Sin dedupe por `MessageSid`, se procesa como nuevo → lead duplicado, notificación duplicada, mensaje al cliente duplicado facturado.

**(b) Race condition**: dos mensajes del mismo número en paralelo (mobile con lag, tap doble) leen el mismo `state` y ambos ejecutan `createWhatsAppLead` + `sendNotification` + `sendWhatsAppMessage`.

`MessageSid` no aparece en ninguna parte del handler (grep confirmado). `getConversationState`→`updateConversationState` es last-write-wins sin optimistic locking.

**Fix concreto**:

1. **Dedupe por MessageSid** (nueva tabla):
   ```sql
   CREATE TABLE whatsapp_processed_sids (
     message_sid text PRIMARY KEY,
     processed_at timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX idx_processed_at ON whatsapp_processed_sids(processed_at);
   -- TTL con cron o DELETE WHERE processed_at < now() - interval '48 hours'
   ```
   Al inicio del handler:
   ```ts
   const messageSid = formData.get('MessageSid') as string;
   if (messageSid) {
     const {error} = await supabase.from('whatsapp_processed_sids')
       .insert({message_sid: messageSid});
     if (error?.code === '23505') {  // duplicate
       return new NextResponse('<Response></Response>', {status: 200, headers: {'Content-Type':'text/xml'}});
     }
   }
   ```

2. **Optimistic locking en state**:
   ```sql
   ALTER TABLE whatsapp_conversations ADD COLUMN state_version integer NOT NULL DEFAULT 0;
   ```
   ```ts
   // en updateConversationState:
   const {data, error} = await supabase.from('whatsapp_conversations')
     .update({...changes, state_version: state.version + 1})
     .eq('phone_number', phoneNumber)
     .eq('state_version', state.version)
     .select();
   if (!data || data.length === 0) {
     // otro POST ganó la carrera; no seguir
     return new NextResponse('<Response></Response>', {status: 200});
   }
   ```

3. **Sacar del camino crítico**: envolver `sendNotification` (que puede mandar email SMTP), `createWhatsAppLead` y `sendWhatsAppDocument` en `after()` de Next 15/16 para que el 200 vuelva rápido.

4. **Cachear `getActivePricingConfig`** con `unstable_cache` por 60s.

**Requiere**: dos migraciones (tabla `whatsapp_processed_sids` + columna `state_version`).

---

### B.4 · Los inserts en Supabase fallan en silencio (RLS + anon + no se lee `.error`)
- `saveCommunication` (`route.ts:90-104`) y `createWhatsAppLead` (`route.ts:133-172`) usan `createClient` de `@/lib/supabase/server` → rol anon.
- Migración `020_enable_rls.sql` activó RLS en `communications` y `whatsapp_conversations`, la 021 dropea las policies permisivas, y no hay policy nueva para insert desde anon.
- `saveCommunication` ni siquiera destructura `.error` (línea 92). El cliente supabase-js no lanza en RLS errors — devuelve `{data:null, error:{...}}` en la promesa resuelta.
- El `try/catch` solo atrapa fallas de red.

**Resultado**: mensajes que el cliente nos escribió no quedan guardados, y los leads con contacto tampoco. Todo pasa sin siquiera un `console.error`.

**Fix concreto**:
1. **Cambiar el cliente**: importar `createAdminClient` de `@/lib/supabase/admin` en `route.ts` para todas las escrituras del webhook. Es un webhook server-side, no debería usar anon.
2. **Destructurar y loguear** el error en `saveCommunication`:
   ```ts
   const {error} = await supabase.from('communications').insert({...});
   if (error) {
     console.error('[WhatsApp] Insert failed:', error);
     // opcional: alertar a Sentry
   }
   ```
3. **En createWhatsAppLead**, ya lo hace: pero el caller en línea 514 hace `await createWhatsAppLead(...)` sin usar el retorno → si es null, igual dispara `sendNotification`. Fix: si el lead no se guardó, marcar la notificación con `notes: 'Lead NO guardado en la base — anotar manualmente'`.

**No requiere migración nueva**, pero sí revisar policies existentes (o cambiar a service role, que es lo correcto).

---

### B.5 · El catch principal devuelve 200 con XML vacío: cliente ve silencio, Twilio no reintenta
`route.ts:729-735`:
```ts
} catch (error) {
  console.error('[WhatsApp] Webhook error:', error);
  return new NextResponse('<?xml...><Response></Response>', {status: 200, ...});
}
```

Cualquier throw (Groq caído, Twilio API caído, parseo raro) se traga. Status 200 le dice a Twilio "todo bien" → no reintenta. Cliente escribió, no le contestaron.

**Fix concreto**:
```ts
} catch (error) {
  console.error('[WhatsApp] Webhook error:', error);
  // Intentar mandar fallback al usuario
  try {
    const from = formData.get('From') as string;
    if (from) {
      await sendWhatsAppMessage({
        to: from,
        body: `Disculpanos, tuvimos un problema técnico. Escribinos al ${CONTACTO.telefonoVisible} o probá de nuevo en unos minutos.`
      });
    }
  } catch {}
  // Devolver 500 para que Twilio reintente
  return new NextResponse('', {status: 500});
}
```

Además: agregar alerta real (Sentry o email al equipo) cuando esto se dispara, no solo `console.error`.

**No requiere base de datos**. 15 minutos.

---

## GRUPO C — Fricción que espanta clientes calificados

### C.1 · Los "patrones de cierre" cortan pasos intermedios del flujo
`route.ts:296-306` chequea `closingPatterns` (`ok`, `dale`, `listo`, `perfecto`, `buen día`, `saludos`, `gracias`, ...) **antes** del switch por estado. Con `startsWith(pattern + ' ')`.

**Casos reales**:
- Cliente en `waiting_name` escribe "Buen día, Ricardo Montoto" → cierre.
- Cliente abre con "buen día, quiero cotizar 500 cajas" → cierre. La conversación muere antes de empezar.
- "ok las medidas son 40x30x30" → cierre.
- "dale, confirmo" → matchea startsWith('dale ') → cierre, no confirmación.

Y además: como no llama `clearConversationState`, el usuario queda trabado en el estado viejo.

**Fix concreto**:
1. **No evaluar closingPatterns si state.step !== 'initial' && state.step !== 'quoted'**. En pasos intermedios (waiting_*) desactivarlo.
2. **Sacar `buen día`/`buenos días`/`saludos` de closingPatterns** — son saludos de apertura, no de cierre. Moverlos a los reset patterns.
3. Si sí dispara cierre, hacer `clearConversationState`.

**No requiere base de datos**. 20 minutos.

---

### C.2 · Cuando dice "fuera de horario" igual cotiza y promete respuesta humana
`route.ts:595-596`:
```ts
if (!isWithinBusinessHours() && state.step === 'initial') {
  responseMessage = getOutOfHoursMessage() + '\n\n---\n\n' + responseMessage;
}
```

En la transcripción real: 21:59 el bot dice "Estamos fuera de horario. Dejá tu mensaje y te respondemos a la brevedad" y a los 2 minutos ya cotizó y prometió "un vendedor te va a contactar en breve". Además la condición exige `step === 'initial'`, así que en los pasos siguientes el aviso desaparece — el cliente puede olvidarse.

**Fix concreto**:
1. **Cambiar el copy de `getOutOfHoursMessage`**: no prometer "respuesta a la brevedad" cuando el bot ya está respondiendo. Decir: "En este momento estamos fuera de horario. Nuestro asistente automático te puede armar una cotización ahora mismo. Un vendedor va a confirmarla a partir de las {HORARIO.desde}:00 hs."
2. En `getConfirmationMessage` (cuando confirma la opción 1), si `!estaEnHorario()`: agregar "Estamos fuera de horario. Un vendedor te contacta mañana en cuanto abramos."
3. En el mensaje de asesor (opción 3): idem.

**No requiere base de datos**. 30 minutos, depende del arreglo A.5 (horario).

---

### C.3 · El mensaje "menor al mínimo de 3.000 m²" aparece a un minorista con 260 cajas que está OK
`whatsapp.ts:611`:
```ts
if (quote.totalM2 < 3000) {
  message += '\n\n(Pedido menor al minimo recomendado de 3000 m2)';
}
```

Ese 3.000 es el mínimo del canal mayorista/a medida. Un particular con 260 cajas está por encima de `RETAIL_CONFIG.MIN_CANTIDAD=100` (el mínimo real de stock para su canal). El mensaje lo empuja a pensar que no puede comprar.

Es exactamente lo que documenta `MINIMOS.largo`: "la mitad de la verdad que espanta la venta".

**Fix concreto**:
```ts
// Usar el channel_note del motor:
if (quote.boxes[0].channel === 'stock') {
  // Es un pedido válido de stock — mensaje positivo
  message += `\n\n✅ Este pedido sale de stock: entrega en 24-48 hs.`;
} else if (quote.boxes[0].channel === 'made_to_order' && !quote.boxes[0].meets_minimum) {
  const faltan = 3000 - quote.totalM2;
  message += `\n\nPara producción a medida, el mínimo es 3.000 m² (te faltan ~${Math.round(faltan)} m²). Si preferís, cotizamos de stock en catálogo.`;
} else {
  message += `\n\nEste pedido es de producción a medida: ${quote.estimated_days} días hábiles.`;
}
```

Automáticamente resuelto por A.3 (usar el motor).

---

### C.4 · `clientType` se pregunta al principio y no cambia absolutamente nada
Se captura, se guarda como `requester_tax_condition` en el lead, y no se pasa a `calculateQuote`, no cambia el mínimo mostrado, no cambia la disponibilidad de impresión, no cambia el mensaje de envío.

**Decisión del dueño**:
- Opción A: **quitar la pregunta**. Va directo a dimensiones.
- Opción B: **hacer que discrimine**:
  - Particular → `getQuantityMessage` dice "Mínimo: 100 cajas". Envío: retiro en fábrica o cotización manual.
  - Empresa → mostrar la escalera completa (`MINIMOS.largo`), impresión disponible siempre, envío gratis si aplica.

Recomendado: opción B, con textos armados desde `MINIMOS` y `ENVIO`.

**No requiere base de datos**. Depende de decisión.

---

### C.5 · Escape hatch inexistente: "cancelar", "asesor", "atrás" no funcionan en pasos intermedios
- `route.ts:309`: `if (bodyLower === 'cancelar' || bodyLower === 'reiniciar')` con igualdad estricta. "cancelar por favor", "me equivoqué" no matchean.
- `asesor`/`humano` solo se chequean en `state='quoted'` (línea 554). En `waiting_dimensions` escribir "asesor" cae en "no pude entender las medidas".
- `cotizar` en la última rama del else-if: en `waiting_*` no llega.

**Fix concreto**: al principio del handler (después de la firma, antes del switch):
```ts
// Escape hatches globales
const escape = detectarEscape(bodyLower);
if (escape === 'reset') {
  await clearConversationState(phoneNumber);
  responseMessage = getWelcomeMessage();
  // ...
} else if (escape === 'asesor') {
  await sendNotification({type: 'advisor_request', ...});
  responseMessage = getAdvisorMessage();
  await clearConversationState(phoneNumber);
  // ...
}

function detectarEscape(b: string): 'reset' | 'asesor' | null {
  if (/\b(cancelar|reiniciar|empezar|volver|atras|atrás|me equivoqu|olvidate)\b/.test(b)) return 'reset';
  if (/\b(asesor|humano|persona|vendedor|hablar con alguien)\b/.test(b)) return 'asesor';
  return null;
}
```

**No requiere base de datos**. 20 minutos.

---

### C.6 · `parseBoxDimensions` convierte "40x30x30" a mm sin avisar y descarta la cantidad si viene en el mismo mensaje
Dos problemas en `whatsapp.ts:216-252`:

**(a) Conversión silenciosa a cm**: si `l<100 && w<100 && h<100`, multiplica por 10 sin preguntar. `convertedFromCm` se devuelve pero `route.ts:441` no lo lee. Un cliente que escribió "90x90x90" **en mm** queda cotizado como 900x900x900 (precio 100× mayor).

**(b) Descarta `quantity`**: `parseBoxDimensions` retorna `{length, width, height, quantity, convertedFromCm}` pero el handler solo usa las 3 dimensiones. Si el cliente dice "300x380x420, 2600 unidades", el bot pierde la cantidad y la vuelve a pedir.

**Fix concreto**:
```ts
// En waiting_dimensions (route.ts:429):
const parsed = parseBoxDimensions(body);
if (parsed) {
  // Si convirtió de cm, confirmar antes de avanzar
  if (parsed.convertedFromCm) {
    responseMessage = `Interpreté las medidas como cm → ${parsed.length}x${parsed.width}x${parsed.height} mm. ¿Es correcto? Respondé "sí" o mandá las medidas en mm.`;
    await updateConversationState(phoneNumber, {
      step: 'confirming_dimensions',
      pending_dimensions: parsed
    });
    return;
  }
  // Si vino con cantidad, saltarse un paso
  if (parsed.quantity && parsed.quantity >= RETAIL_CONFIG.MIN_CANTIDAD) {
    await updateConversationState(phoneNumber, {
      step: 'waiting_printing',
      dimensions: parsed,
      quantity: parsed.quantity
    });
    responseMessage = getPrintingMessage(parsed.quantity);
    return;
  }
  // Flujo normal
  ...
}
```

**Requiere**: agregar step `confirming_dimensions` y campo `pending_dimensions` (o reusar `dimensions`) en `whatsapp_conversations`.

---

### C.7 · `parseCompanyInfo` toma cualquier línea con mayúscula como razón social → loop infinito
`whatsapp.ts:170-181`: si `!companyName && !line.includes('@') && lines.indexOf(line)===0`, matchea con `/^[A-Z]/` (cualquier línea que empiece con mayúscula) o cae al fallback `companyName = lines[0]`.

**Caso confirmado**: cliente envía "Juan Perez\njuan@mail.com" → companyName='Juan Perez', contactName=undefined. Bot pide contactName. Cliente responde "Juan Perez". Vuelve a matchear. Loop.

**Fix concreto**: rehacer `parseCompanyInfo` con reglas más estrictas:
1. Si hay línea con `@` → email.
2. Si hay línea que empieza con "CUIT " o coincide con `\d{2}-\d{8}-\d` → CUIT.
3. Si hay línea con sufijos legales (`SA|SRL|SAS|SAU|SCA|Cooperativa`) → razón social.
4. Contact name = primera línea que no sea ninguna de las anteriores.
5. Si no puede determinar razón social vs contacto, **preguntar explícitamente**: "Escribime en líneas separadas:\nRazón social\nNombre y apellido\nCUIT\nEmail".

**No requiere base de datos**. 45 minutos.

---

## GRUPO D — Cosas menores (pulido)

### D.1 · El texto dice "Te enviamos el desplegado en el siguiente mensaje" pero el PDF llega antes
`route.ts:707-718`: se llama `sendWhatsAppDocument` **antes** que `sendWhatsAppMessage`. El texto queda mintiendo.

**Fix**: invertir el orden, o cambiar el copy a "Te mandamos también el desplegado".

---

### D.2 · Los mensajes conversacionales no linkean al sitio
`getQuoteMessage`, `getConfirmationMessage`, `getAdvisorMessage` no incluyen URLs. `SITE_URL` está importado pero solo se usa para el PDF del desplegado.

**Fix**: agregar en el pie de la cotización: `Ver online: ${SITE_URL}/cotizar/{medidas}/{cantidad}` (link mantiene la cotización). En el mensaje de asesor: `Más info: ${SITE_URL}/cajas`.

---

### D.3 · phoneNumber no se normaliza consistentemente
A veces con prefijo `whatsapp:`, a veces sin. `getPhoneQuoteHistory` filtra por `metadata->>phone` y puede fallar. Cliente returning se ve como nuevo.

**Fix**: crear `normalizarTelefono(from: string): string` que devuelva siempre en formato `5491133411781` (sin `whatsapp:`, sin `+`), y usarlo en todos los inserts y queries.

---

### D.4 · Textos sin tildes en todo el bot
`COTIZACION`, `impresion`, `dias habiles`, `cuantas`. WhatsApp soporta UTF-8, no hay razón técnica. Es cuestión de imagen.

**Fix**: reemplazar en batch. `whatsapp-ai.ts` ya usa tildes, alinear los otros.

---

### D.5 · `hasMediaContent` llamado 2 veces (`route.ts:281` y `:290`)
No es funcional, pero indica que faltó una revisión. Extraer a variable local.

---

## Resumen: qué se puede tocar hoy vs qué necesita decisión

### ✅ Se pueden aplicar YA, sin base de datos ni decisiones:
- **A.1** regex de cantidad — 5 min
- **A.2** detectarOpcion en 3 estados — 30 min
- **A.4** eliminar duplicaciones de datos (excepto horario) — 2 hs
- **B.2** cerrar la firma de Twilio — 5 min (**hoy sin falta**)
- **B.4** cambiar a admin client + destructurar errors — 30 min
- **B.5** catch principal con fallback + 500 — 15 min
- **C.1** desactivar closingPatterns en waiting_* — 20 min
- **C.5** escape hatches globales — 20 min
- **C.7** parseCompanyInfo estricto — 45 min
- **D.1** invertir orden PDF/texto — 2 min
- **D.2** links al sitio — 15 min
- **D.3** normalizar teléfono — 30 min
- **D.4** tildes — 15 min

### 🗄️ Necesitan migración de base de datos:
- **A.3** motor centralizado — agregar columna `printing_colors` en `whatsapp_conversations` + campos `last_quote_total_with_tax`, `last_quote_channel`
- **B.1** notificar confirmación — agregar valores al enum de `status` en `public_quotes` + columna `closed_confirmed` en `whatsapp_conversations`
- **B.3** idempotencia — nueva tabla `whatsapp_processed_sids` + columna `state_version`
- **C.6** confirmar cm→mm — nuevo step + campo `pending_dimensions`

### 🤔 Necesitan decisión del dueño antes de escribir código:
- **A.5** **¿Cuál es el horario correcto: 7-16 o 8-17?** (blocking: bot vs sitio se contradicen). Después de decidir, mover a `src/lib/horario.ts` y refactor de 11 lugares.
- **C.4** **¿Qué hace la pregunta particular/empresa?** Opción A: quitarla. Opción B: que discrimine mínimos/envío/impresión.
- **Volumen de reintentos Twilio**: para el fix B.3, ¿el trabajo pesado va en `after()` de Next 16 (más simple) o en cola dedicada (más robusto)? Depende de latencias medidas.

### Orden sugerido para pegar
1. **Ahora mismo**: B.2 (firma Twilio) — es un agujero de seguridad activo.
2. **Esta semana**: A.1, A.2, A.4, B.1, B.4, B.5, C.1, C.5 — todo lo que no necesita base de datos ni decisión, y detiene sangrado en las 3 categorías (cotiza mal, lead perdido, fricción).
3. **Sprint**: A.3 (motor centralizado) — es el refactor grande pero elimina toda una familia de bugs futuros. Combinar con B.1 y C.6 en la misma migración.
4. **Cuando esté la decisión**: A.5 (horario), C.4 (clientType).
5. **Después**: B.3 (idempotencia) — requiere migración y cambio de arquitectura del handler (`after()`), no es urgente pero es lo que sigue después de que el resto esté estable.