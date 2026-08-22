# 📧 Emails Automáticos - Quilmes Corrugados

## Resumen de Emails Configurados

El sistema envía **7 tipos diferentes de emails automáticos** en diferentes escenarios:

---

## 1. 🎯 Lead con Datos de Contacto (`lead_with_contact`)

**Trigger:** Cuando alguien cotiza desde la API pública (`/api/v1/quote`) y proporciona datos de contacto.

**Ubicación:** `src/app/api/v1/quote/route.ts` (línea 510)

**Condición:**
```typescript
if (body.contact && (body.contact.email || body.contact.phone))
```

**Destinatario:** `NOTIFICATION_EMAIL` (ventas@quilmescorrugados.com.ar)

**Asunto:** `Nuevo lead via {origen}`

**Contenido:**
- Información de la cotización (dimensiones, cantidad, total)
- Datos de contacto del cliente (nombre, empresa, email, teléfono)
- Botones de acción (WhatsApp, Email)

**Origen puede ser:**
- `LLM (gpt)` / `LLM (claude)` / etc.
- `API (nombre-api-key)`
- `Web API`
- `mi-ecommerce` (custom)

---

## 2. 💰 Cotización de Alto Valor (`high_value_quote`)

**Trigger:** Cuando una cotización supera $500.000 ARS sin datos de contacto.

**Ubicación:** `src/app/api/v1/quote/route.ts` (línea 525)

**Condición:**
```typescript
else if (totalSubtotal >= HIGH_VALUE_THRESHOLD) // 500.000 ARS
```

**Destinatario:** `NOTIFICATION_EMAIL`

**Asunto:** `Cotizacion alto valor: ${monto}`

**Contenido:**
- Monto destacado
- Información de la caja
- IP del cliente (para investigación)

---

## 3. 📊 Alerta de Volumen (`volume_alert`)

**Trigger:** Cuando una IP hace muchas consultas (posible integrador).

**Ubicación:** `src/app/api/whatsapp/webhook/route.ts` (línea 440)

**Condición:** Lógica de detección de volumen alto desde una IP

**Destinatario:** `NOTIFICATION_EMAIL`

**Asunto:** `IP con {cantidad} consultas hoy - Posible integrador`

**Contenido:**
- IP del cliente
- Cantidad de requests
- Top cotizaciones de esa IP

---

## 4. 🆘 Solicitud de Asesor (`advisor_request`)

**Trigger:** Cuando un cliente solicita hablar con un asesor humano.

**Ubicación:** `src/app/api/whatsapp/webhook/route.ts` (línea 471, 539)

**Condición:** Cliente solicita explícitamente hablar con asesor

**Destinatario:** `NOTIFICATION_EMAIL`

**Asunto:** `URGENTE: Cliente solicita hablar con asesor ({origen})`

**Contenido:**
- Alerta urgente destacada
- Datos de contacto del cliente
- Botón de WhatsApp para contactar inmediatamente

---

## 5. 📨 Respuesta Automática a Emails Entrantes

**Trigger:** Cuando se recibe un email en el webhook de Resend.

**Ubicación:** `src/app/api/email/inbound/route.ts` (línea 128)

**Condición:** 
- Email recibido en webhook `/api/email/inbound`
- Resend está configurado

**Destinatario:** Remitente del email original

**Asunto:** Generado automáticamente según el contenido

**Contenido:**
- Respuesta automática parseando el email
- Si detecta cotización, incluye precio calculado
- Mensaje personalizado según el contenido

**Nota:** También envía notificación `lead_with_contact` si detecta datos válidos.

**Origen verificado:** el POST tiene que venir firmado por Resend (Svix:
`svix-id`, `svix-timestamp`, `svix-signature`). Si `RESEND_WEBHOOK_SECRET` está
cargada y la firma no cierra, se responde 403 y no se escribe nada. Detalle en
la sección de variables de entorno, más abajo.

---

## 6. 📞 Email de Cotización desde Retell AI

**Trigger:** Cuando el bot telefónico "Ana" registra un lead con email.

**Ubicación:** `src/app/api/retell/registrar-lead/route.ts` (línea 199)

**Condición:**
- Lead registrado desde llamada telefónica
- Email proporcionado
- Cotización válida con datos de caja

**Destinatario:** Email del cliente

**Asunto:** `Tu cotización de cajas - Quilmes Corrugados`

**Contenido:**
- Saludo personalizado
- Detalle completo de la cotización
- Precio unitario y total
- Tiempo de producción
- Información de contacto

---

## 7. 💬 Notificación de Lead desde WhatsApp

**Trigger:** Cuando se genera un lead desde conversación de WhatsApp.

**Ubicación:** `src/app/api/whatsapp/webhook/route.ts` (línea 440, 471, 539)

**Condición:** Conversación de WhatsApp genera lead calificado

**Destinatario:** `NOTIFICATION_EMAIL`

**Tipo:** `lead_with_contact` o `advisor_request`

---

## 📋 Variables de Entorno Requeridas

```env
RESEND_API_KEY=re_xxxxxxxxxxxxx
NOTIFICATION_EMAIL=ventas@quilmescorrugados.com.ar
FROM_EMAIL=notificaciones@quilmescorrugados.com.ar
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

### `RESEND_WEBHOOK_SECRET`

Es con lo que `/api/email/inbound` comprueba que el POST lo hizo Resend.

**De dónde sale:** panel de Resend → **Webhooks** → el endpoint
`/api/email/inbound` → **Signing Secret**. Empieza con `whsec_`.

**Por qué hace falta:** el endpoint es público y escribe en `communications` con
la service role, que saltea RLS. Sin la clave, cualquiera que descubra la URL
inserta mensajes en el historial de un cliente **atribuidos a esa persona**, y
además dispara la respuesta automática: la cuenta manda —y paga— un mail a la
dirección que el que llama quiera. Antes esto no se notaba porque RLS se tragaba
el insert en silencio; cuando el endpoint pasó a `createAdminClient()`, el mismo
POST falso empezó a escribir de verdad.

**Qué pasa si falta:** el webhook **no se cae**. Sigue recibiendo mails y deja
este log en cada request:

```
[Email Inbound][firma] no hay con que verificar el origen: falta RESEND_WEBHOOK_SECRET...
```

Es a propósito, mismo criterio que la firma de Meta en WhatsApp (ver
`rechazaFirmaInvalida` en `src/lib/whatsapp-transporte/tipos.ts`): un despliegue
al que se le olvidó una variable no tiene que dejar de recibir consultas de
clientes. Pero mientras esté así, **el endpoint acepta cualquier POST**.

**Qué pasa si está y la firma no cierra:** 403, y no se escribe nada.

**Cómo confirmar que quedó cargada**, sin exponer el valor:

```bash
curl -s https://quilmes-corrugados.vercel.app/api/email/inbound
```

Tiene que dar `"firma_verificada": true`.

**Si dejan de entrar mails y el log dice `NO VALIDA`**, mirar el motivo:
`no-cierra` o `secreto-ilegible` es el secreto mal copiado;
`timestamp-fuera-de-ventana` es un reloj corrido. Sacando la variable se vuelve
al modo permisivo mientras se arregla.

La comprobación vive en `src/lib/email-firma.ts` y se prueba con
`npx tsx scripts/qa-firma-email.mts`.

---

## 🔍 Endpoints que Envían Emails

1. **POST `/api/v1/quote`** - API pública de cotización
2. **POST `/api/email/inbound`** - Webhook de emails entrantes
3. **POST `/api/retell/registrar-lead`** - Registro de lead desde llamada
4. **POST `/api/whatsapp/webhook`** - Webhook de WhatsApp

---

## 📊 Flujo de Notificaciones

```
┌─────────────────┐
│  Evento Trigger │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  sendNotification│
│  (notifications)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Resend API    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ NOTIFICATION_    │
│ EMAIL            │
└─────────────────┘
```
