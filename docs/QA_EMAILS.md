# 🧪 Plan de QA - Emails Automáticos

## Checklist de Pruebas

### ✅ Pre-requisitos

- [ ] Variables de entorno configuradas:
  - `RESEND_API_KEY`
  - `NOTIFICATION_EMAIL`
  - `FROM_EMAIL`
  - `RESEND_WEBHOOK_SECRET` (solo para el Test 3; ver la nota ahí)
- [ ] Servidor en ejecución (`npm run dev`)
- [ ] Acceso a la bandeja de `NOTIFICATION_EMAIL`

---

## 📋 Tests Manuales

### Test 1: Lead con Datos de Contacto

**Objetivo:** Verificar que se envía email cuando alguien cotiza con datos de contacto.

**Pasos:**
1. Hacer POST a `/api/v1/quote` con datos de contacto:
```bash
curl -X POST http://localhost:3000/api/v1/quote \
  -H "Content-Type: application/json" \
  -d '{
    "boxes": [{
      "length_mm": 400,
      "width_mm": 300,
      "height_mm": 200,
      "quantity": 1000
    }],
    "contact": {
      "name": "Juan Pérez",
      "email": "juan@example.com",
      "phone": "+541169249801",
      "company": "Mi Empresa"
    },
    "origin": "Test Manual"
  }'
```

**Resultado Esperado:**
- ✅ HTTP 200
- ✅ Email recibido en `NOTIFICATION_EMAIL`
- ✅ Asunto: "Nuevo lead via Test Manual"
- ✅ Contiene: dimensiones, cantidad, total, datos de contacto
- ✅ Botones de WhatsApp y Email funcionan

---

### Test 2: Cotización de Alto Valor

**Objetivo:** Verificar alerta cuando cotización > $500k sin contacto.

**Pasos:**
1. Hacer POST a `/api/v1/quote` con cotización grande:
```bash
curl -X POST http://localhost:3000/api/v1/quote \
  -H "Content-Type: application/json" \
  -d '{
    "boxes": [{
      "length_mm": 600,
      "width_mm": 400,
      "height_mm": 400,
      "quantity": 10000
    }],
    "origin": "Test Alto Valor"
  }'
```

**Resultado Esperado:**
- ✅ HTTP 200
- ✅ Email recibido en `NOTIFICATION_EMAIL`
- ✅ Asunto: "Cotizacion alto valor: $XXX.XXX"
- ✅ Contiene: monto destacado, IP del cliente

---

### Test 3: Email Entrante (Webhook)

**Objetivo:** Verificar respuesta automática a emails.

> ⚠️ **El curl de abajo va sin firmar.** Desde que el webhook valida el origen,
> solo pasa si `RESEND_WEBHOOK_SECRET` **no** está cargada en el entorno donde
> corre — que es el caso normal en local. Con la variable puesta, este mismo
> curl tiene que dar **403**, y eso es lo correcto: probar la lógica de
> cotización y probar la validación de firma son dos tests distintos (el segundo
> es el Test 3b).

**Pasos:**
1. Simular webhook de Resend:
```bash
curl -X POST http://localhost:3000/api/email/inbound \
  -H "Content-Type: application/json" \
  -d '{
    "from": "cliente@example.com",
    "subject": "Necesito cotizar cajas de 40x30x20 cm, cantidad 500",
    "text": "Hola, necesito cotizar cajas de 40x30x20 cm, cantidad 500 unidades."
  }'
```

**Resultado Esperado (sin `RESEND_WEBHOOK_SECRET`):**
- ✅ HTTP 200
- ✅ En los logs: `[Email Inbound][firma] no hay con que verificar el origen...`
- ✅ Email automático enviado al remitente
- ✅ Contiene cotización calculada (si detecta dimensiones)
- ✅ Notificación interna si detecta datos de contacto

---

### Test 3b: Validación de Firma del Webhook

**Objetivo:** Verificar que nadie que no sea Resend puede escribir en
`communications`.

Importa porque el endpoint escribe con la service role, que saltea RLS: sin esta
validación, cualquiera que descubra la URL inserta mensajes en el historial de
un cliente atribuidos a esa persona.

**Pasos:**
```bash
npx tsx scripts/qa-firma-email.mts
```

Cubre, sin tocar la red ni levantar el servidor:

| Caso | Esperado |
|---|---|
| Firma buena | acepta |
| Firma calculada sobre otro cuerpo | rechaza |
| Sin cabecera y con secreto configurado | rechaza (no "no puedo comprobar") |
| Sin secreto configurado | "no hay con qué comprobar" → deja pasar |
| Mensaje viejo reenviado, con firma auténtica | rechaza (replay) |
| Rotación de clave: dos firmas, cierra una | acepta |

Además contrasta el algoritmo contra un HMAC calculado aparte y contra el
paquete `svix`, así que si alguien "simplifica" la firma se cae acá y no en
producción.

**Resultado Esperado:**
- ✅ `Todo bien.` y exit 0

**Prueba en caliente contra el endpoint** (con la variable cargada):
```bash
curl -X POST http://localhost:3000/api/email/inbound \
  -H "Content-Type: application/json" \
  -H "svix-id: msg_falso" \
  -H "svix-timestamp: 1770000000" \
  -H "svix-signature: v1,firmainventada" \
  -d '{"from":"atacante@example.com","text":"inyectado"}'
```
- ✅ HTTP 403
- ✅ En los logs: `[Email Inbound][firma] NO VALIDA (...) — RECHAZADA`
- ✅ **No** aparece ninguna fila nueva en `communications`

---

### Test 4: Lead desde Retell AI

**Objetivo:** Verificar email de cotización desde llamada telefónica.

**Pasos:**
1. Simular registro de lead desde Retell:
```bash
curl -X POST http://localhost:3000/api/retell/registrar-lead \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "María González",
    "email": "maria@example.com",
    "telefono": "+541169249801",
    "consulta": "Cotización de cajas",
    "cotizacion_id": "test-123"
  }'
```

**Resultado Esperado:**
- ✅ HTTP 200
- ✅ Email enviado al cliente con cotización completa
- ✅ Asunto: "Tu cotización de cajas - Quilmes Corrugados"

---

### Test 5: Solicitud de Asesor (WhatsApp)

**Objetivo:** Verificar alerta urgente cuando cliente solicita asesor.

**Pasos:**
1. Simular mensaje de WhatsApp solicitando asesor
2. Verificar que se envía notificación `advisor_request`

**Resultado Esperado:**
- ✅ Email urgente recibido
- ✅ Asunto: "URGENTE: Cliente solicita hablar con asesor"
- ✅ Botón de WhatsApp destacado

---

## 🚀 Tests Automatizados

### Opción 1: Script Bash

```bash
./scripts/qa-test-emails.sh
```

### Opción 2: Script TypeScript (más detallado)

```bash
npx tsx scripts/qa-test-emails-detailed.ts
```

---

## 🔍 Verificación de Logs

Durante las pruebas, monitorea los logs:

```bash
npm run dev | grep -i "notification\|email\|resend"
```

**Logs esperados:**
- `[Notifications] Email enviado: ...`
- `[Email Inbound] Respuesta enviada a: ...`
- `[Retell RegistrarLead] Email enviado a: ...`

**Logs que hay que mirar:**
- `[Email Inbound][firma] no hay con que verificar el origen...` — falta
  `RESEND_WEBHOOK_SECRET`. El endpoint está aceptando cualquier POST.
- `[Email Inbound][firma] NO VALIDA (...) — RECHAZADA` — se rechazó un POST.
  Si son mails de clientes reales, ver abajo.

---

## ⚠️ Errores Comunes

### Dejaron de entrar mails y el log dice `NO VALIDA`

**Causas posibles, según el motivo del log:**
1. `no-cierra` / `secreto-ilegible` → `RESEND_WEBHOOK_SECRET` mal copiada. Tiene
   que ser el **Signing Secret** del endpoint en Resend → Webhooks, entero,
   arrancando con `whsec_`.
2. `timestamp-fuera-de-ventana` → reloj corrido más de 5 minutos, de un lado o
   del otro.
3. `faltan-cabeceras` → el POST no lo hizo Resend (o hay un proxy comiéndose las
   cabeceras `svix-*`).

**Solución:**
```bash
# Confirmar si la variable está cargada (no expone el valor)
curl -s https://quilmes-corrugados.vercel.app/api/email/inbound

# Confirmar que la validación en sí está bien
npx tsx scripts/qa-firma-email.mts
```

Para destrabar mientras se arregla: sacar `RESEND_WEBHOOK_SECRET` de Vercel y
redesplegar. Vuelve al modo permisivo —recibe todo y avisa en los logs—, que es
como estaba antes. Es una salida de emergencia, no un estado para dejar.

### Email no se envía

**Causas posibles:**
1. `RESEND_API_KEY` no configurada
2. Dominio no verificado en Resend
3. Rate limit alcanzado

**Solución:**
```bash
# Verificar variables
./scripts/resend-status.sh

# Verificar en Resend dashboard
# https://resend.com/emails
```

### Email va a spam

**Causas posibles:**
1. Dominio no verificado
2. SPF/DKIM no configurados
3. Contenido sospechoso

**Solución:**
- Verificar dominio en Resend
- Configurar registros DNS (SPF, DKIM)
- Revisar contenido del email

---

## 📊 Métricas a Monitorear

- **Tasa de entrega:** % de emails entregados
- **Tasa de apertura:** % de emails abiertos (si se habilita tracking)
- **Tiempo de respuesta:** Latencia del envío
- **Errores:** Cantidad de fallos por tipo

---

## 🎯 Casos Edge a Probar

1. **Email con caracteres especiales** en nombre/empresa
2. **Cotización con impresión** (debe incluir costo adicional)
3. **Múltiples cajas** en una cotización
4. **Email sin datos de contacto** pero con cotización válida
5. **Rate limiting** (múltiples requests rápidas)
6. **Email con HTML malformado** en el contenido

---

## 📝 Checklist Final

- [ ] Todos los tipos de email funcionan
- [ ] Emails llegan a la bandeja correcta
- [ ] Formato HTML se ve bien en diferentes clientes
- [ ] Links funcionan (WhatsApp, Email)
- [ ] No hay errores en logs
- [ ] Variables de entorno correctas en producción

---

## 🔗 Recursos

- **Dashboard Resend:** https://resend.com/emails
- **Logs del proyecto:** `npm run dev`
- **Variables de entorno:** `vercel env ls`
