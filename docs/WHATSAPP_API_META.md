# WhatsApp por la API de Meta

Cómo pasar el canal de WhatsApp de Twilio a la Cloud API de Meta, sin dejar de
atender en el medio.

El código ya está. Lo que falta es de tu lado: la cuenta, el número y cuatro
variables en Vercel. Este documento es esa parte.

---

## Por qué Meta y no Twilio ni Kapso

Twilio y Kapso son intermediarios: los dos revenden el mismo WhatsApp de Meta y
los dos cobran un margen encima del precio de Meta. Kapso además trae su propio
constructor de bots, que no nos sirve porque el agente ya está escrito y es el
mismo que atiende la web, la API pública y el conector de ChatGPT.

Yendo directo a Meta se paga el precio de lista y no hay un tercero entre la
fábrica y el canal por el que más gente pregunta.

---

## Cómo está armado el código

El webhook —`src/app/api/whatsapp/webhook/route.ts`, casi mil líneas— es todo
lógica de negocio: cotiza, deriva, guarda el lead, pausa al asistente. Nada de
eso sabe quién trae el mensaje.

Quién lo trae vive en `src/lib/whatsapp-transporte/`:

| Archivo | Qué es |
|---|---|
| `tipos.ts` | El contrato: lo que el webhook necesita de un proveedor, y nada más |
| `twilio.ts` | Lo que está atendiendo hoy, sobre el número de prueba |
| `meta.ts` | La Cloud API, sin intermediario |
| `index.ts` | Elige uno según `WHATSAPP_PROVEEDOR` |

Cambiar de proveedor es cambiar una variable de entorno. Volver atrás, también.

---

## Los cuatro valores que hay que cargar en Vercel

Todos van en **Vercel → Settings → Environment Variables**, para Production.

### `META_WA_TOKEN`

El token con el que la web le habla a Meta.

**Dónde sale:** business.facebook.com → Configuración del negocio → Usuarios →
Usuarios del sistema → agregar uno (rol *Administrador*) → **Generar token** →
elegir la app → permisos `whatsapp_business_messaging` y
`whatsapp_business_management`.

**Importante:** pedí el token **sin vencimiento** (System User token). El token
temporal del panel de la app dura 24 horas y cuando vence el canal se queda
mudo sin avisar, un sábado, en el peor momento.

### `META_WA_PHONE_NUMBER_ID`

**No es el número de teléfono.** Es un id largo de dígitos que Meta le pone al
número dentro de la cuenta.

**Dónde sale:** Administrador de WhatsApp → API de WhatsApp → Configuración de
la API → aparece debajo del número, como *Identificador del número de teléfono*.

### `META_WA_APP_SECRET`

Con esto se comprueba que el que golpea el webhook es Meta y no cualquiera.
Sin esto, cualquiera podría hacer un POST diciendo ser un cliente y la cuenta
le mandaría —y pagaría— un WhatsApp.

**Dónde sale:** developers.facebook.com → tu app → Configuración → Básica →
*Clave secreta de la app* → Mostrar.

### `META_WA_VERIFY_TOKEN`

Una cadena que elegimos nosotros. Meta la repite cuando da de alta el webhook y
el servidor comprueba que coincida. No la ve nadie más.

Generada para esto:

```
2RswYnE4tbUhUXoN0KR8ofB63M2aY-vu
```

El mismo valor va en Vercel y en el formulario de Meta. Si difieren en un
carácter, el alta falla y Meta no dice por qué.

### `WHATSAPP_PROVEEDOR`

Esta va **al final**, cuando lo demás esté probado. Ver más abajo.

---

## El orden importa

Está pensado para que en ningún momento quede el canal sin atender.

**1. Cargá las cuatro variables de arriba y redesplegá.**
El canal sigue andando por Twilio: mientras `WHATSAPP_PROVEEDOR` no diga `meta`,
nada cambia.

**2. Dale de alta el webhook en Meta.**
developers.facebook.com → tu app → WhatsApp → Configuración → Webhooks → Editar:

- **URL de devolución de llamada:** `https://www.quilmescorrugados.com.ar/api/whatsapp/webhook`
- **Token de verificación:** `2RswYnE4tbUhUXoN0KR8ofB63M2aY-vu`

**Con `www`, no sin.** El dominio sin `www` contesta un redirect 308 hacia
`www`, y la verificación de Meta no lo sigue: cargando la URL sin `www` el alta
falla y el mensaje de error no dice que el problema es ese. Está comprobado
contra producción:

```bash
curl -s -o /dev/null -w "%{http_code}" "https://www.quilmescorrugados.com.ar/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=123"
```

Con `www` y un token equivocado devuelve **403**, que es lo correcto: el
endpoint está y rechaza el token que no es. Sin `www` devuelve **308**.

Meta hace un GET a esa URL y espera que le devuelvan un desafío. Eso **contesta
aunque el proveedor activo siga siendo Twilio**, justamente para que puedas dar
de alta el webhook sin apagar el canal que funciona.

Después, en **Campos del webhook**, suscribí `messages`. Sin eso el webhook
queda dado de alta pero no llega ningún mensaje.

**3. Cargá el número.**
Administrador de WhatsApp → Agregar número de teléfono. Tiene que ser una línea
que **no** tenga WhatsApp activo hoy: si el número que se quiere usar ya está en
un celular con WhatsApp normal o Business, al pasarlo a la API deja de funcionar
en el celular. Es de ida.

Si es la línea con la que la fábrica ya atiende, hay que decidirlo antes:
al pasarla a la API, quien atendía desde el celular pasa a atender desde el
panel de la web.

**4. Recién ahí, `WHATSAPP_PROVEEDOR=meta` y redesplegá.**

Desde ese momento entra y sale todo por Meta. Twilio queda sin uso pero sin
borrar: si algo sale mal, `WHATSAPP_PROVEEDOR=twilio` y un redespliegue vuelven
todo atrás en un minuto.

**5. Probá con tu celular.**
Mandale un mensaje al número y fijate que conteste. En los registros de Vercel
tiene que aparecer:

```
[whatsapp][firma] valida (meta)
```

Si aparece `NO VALIDA`, el `META_WA_APP_SECRET` está mal, y **con Meta eso
bloquea**: el mensaje se rechaza con un 403 y el cliente no recibe respuesta.

Es a propósito. La firma de Meta es un HMAC sobre el cuerpo del mensaje: no
depende de reconstruir ninguna URL ni de qué proxy haya en el medio, así que si
no cierra, o la clave está mal o quien golpea no es Meta. Sin eso, cualquiera que
descubra la URL del webhook puede hacer que la cuenta mande —y pague— WhatsApps a
donde quiera, y que Meta termine marcando el número por spam.

**Si el canal se queda mudo y ese es el log que aparece**, corregí el secreto. Y
si necesitás destrabarlo en el momento mientras lo buscás, poné
`WHATSAPP_FIRMA_ESTRICTA=0` en Vercel y redesplegá: vuelve a dejar pasar y
registrar. Acordate de sacarla después.

Si **falta** `META_WA_APP_SECRET` no bloquea nada: no hay con qué comprobar, así
que se atiende igual y queda un error en el log. Eso también es a propósito —un
despliegue al que se le olvidó una variable no debería dejar la fábrica sin
WhatsApp— pero es una configuración incompleta, no un estado válido.

---

## Lo primero a mirar cuando entre el primer mensaje real

**Con qué forma llega el teléfono.** Los celulares argentinos llevan un 9
después del código de país —+54 9 11…— pero ese 9 no siempre viaja. El código
lo normaliza a la forma con 9, que es la que ya está en la base, pero eso está
escrito contra la documentación, no contra un mensaje de verdad.

Si Meta manda otra cosa, el mismo cliente aparece como dos conversaciones
distintas y quien atiende ve la mitad de lo que se habló. Se comprueba en el
panel: si al contestarte a vos mismo aparece una conversación sola, está bien.

---

## Las plantillas

WhatsApp deja escribir texto libre solo dentro de las **24 horas** del último
mensaje del cliente. Pasado eso la conversación queda cerrada: el vendedor abre
el panel, ve la consulta de ayer, escribe la respuesta y le rebota.

La salida es una plantilla: un texto fijo que Meta revisa y aprueba de antemano,
que se puede mandar fuera de la ventana. **No lleva la respuesta adentro** —
golpea la puerta para que el cliente conteste, y cuando contesta se reabre la
ventana y ahí sí se habla normal.

Hay que darla de alta a mano, una vez:

Administrador de WhatsApp → Herramientas → Plantillas de mensajes → Crear:

| Campo | Valor |
|---|---|
| Nombre | `retomar_conversacion` |
| Categoría | **Utilidad** (no Marketing: es más barata, se aprueba sin vueltas y es la que corresponde porque hay una consulta previa) |
| Idioma | **Español** (`es`) |
| Encabezado | *ninguno* |
| Pie | *ninguno* |
| Botones | *ninguno* |

Cuerpo, textual:

```
Hola, te escribimos de Quilmes Corrugados por tu consulta de cajas.

Tenemos la respuesta lista. Respondé este mensaje y seguimos por acá.
```

El nombre y el idioma tienen que coincidir **exacto** con lo que dice
`src/lib/whatsapp-plantillas.ts`. Si allá se carga como `es_AR` y acá dice `es`,
Meta rechaza el envío con un error que no explica nada. Si hace falta cargarla
como `es_AR`, se ajusta con la variable `META_WA_IDIOMA_PLANTILLAS`.

Aprobada la plantilla, en el panel de WhatsApp aparece el botón **"Pedirle que
responda"** en las conversaciones vencidas. El botón **no** aparece si esa
persona nunca escribió: mandarle una plantilla a alguien que nunca nos habló es
exactamente lo que hace que Meta marque el número por spam, y ese número es el
canal de ventas.

---

## Qué queda pendiente después de todo esto

- **Cerrar la validación de firma del lado de Twilio.** La de Meta ya bloquea.
  La de Twilio sigue en modo observación porque firma la URL que tiene cargada en
  su panel, que detrás de un proxy puede no ser la que ve el servidor: ahí un
  rechazo puede ser culpa nuestra. Como Twilio está de salida, lo más probable es
  que esto se resuelva borrándolo.
- **Confirmar con qué forma llega el teléfono**, arriba. Es lo primero a mirar
  cuando entre un mensaje de verdad.
