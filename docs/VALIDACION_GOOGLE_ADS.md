# Validación: Campaña Google Ads

**Estado:** GA4 configurado (`G-5JLDNYXNB2`). Validar en tiempo real y vincular Google Ads.

---

## ✅ Lo que ya tenemos implementado

| Componente | Estado | Ubicación |
|------------|--------|-----------|
| Google Analytics 4 (gtag) | OK | `GoogleAnalytics.tsx` en layout |
| Eventos de conversión | OK | `tracking.ts` |
| Landing pages SEM | OK | `/cajas-ecommerce`, `/cajas-alimentos`, `/mayorista`, `/cajas-mudanza` |
| Cotizador con tracking | OK | `QuoterForm` → `quote_submitted` |
| Formulario contacto | OK | `/contacto` → `contact_form_submitted` |
| Clics WhatsApp/teléfono | OK | `whatsapp_click`, `phone_click` |
| Chat con attribution | OK | `chat_opened`, `chat_message_sent` con UTM |

---

## Datos que necesito de vos

### 1. Solo uno: **ID de medición de GA4**

**Formato:** `G-XXXXXXXXXX` (ej: `G-ABC123XYZ`)

**Dónde obtenerlo:**
1. Ir a [analytics.google.com](https://analytics.google.com)
2. Admin (engranaje) → Propiedad de datos
3. En "Flujos de datos" → seleccionar el del sitio web
4. Copiar el **ID de medición** (empieza con `G-`)

**Si no tenés GA4 aún:**
1. Crear propiedad en analytics.google.com
2. Elegir "Web" → URL del sitio (ej: `https://quilmes-corrugados.vercel.app`)
3. Copiar el ID que te asignan

---

## Configuración

### 1. Variable de entorno

Agregar en `.env.local` (local) y en Vercel (producción):

```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

**En Vercel:** Proyecto → Settings → Environment Variables → agregar

### 2. Redeploy

Después de agregar la variable en Vercel, hacer un redeploy (o push a `main`).

---

## Cómo validar que funciona

### Opción A: Revisar en tiempo real (GA4)

1. Ir a GA4 → Informes → Tiempo real
2. Abrir el sitio en otra pestaña
3. Hacer una acción: cotizar, enviar contacto, clic en WhatsApp
4. Debería aparecer el evento en tiempo real (puede tardar 1–2 min)

### Opción B: Consola del navegador

1. Abrir el sitio con la variable configurada
2. F12 → Console
3. Ejecutar: `Object.keys(window).filter(k => k.includes('gtag') || k.includes('dataLayer'))`
4. Si ves `dataLayer` o `gtag`, el script está cargado

### Opción C: Red (Network)

1. F12 → Network
2. Filtrar por "google" o "gtag"
3. Recargar la página → debería haber requests a `googletagmanager.com`

---

## Eventos que se envían (para importar en Google Ads)

| Evento | Valor ARS | Uso en Google Ads |
|--------|-----------|-------------------|
| `quote_submitted` | 2000 | Conversión primaria |
| `contact_form_submitted` | 1500 | Conversión primaria |
| `whatsapp_click` | 500 | Conversión secundaria |
| `phone_click` | 500 | Conversión secundaria |
| `chat_opened` | - | Solo para remarketing |
| `chat_message_sent` | - | Solo para remarketing |

---

## Pasos en Google Ads (después de validar GA4)

1. **Vincular GA4:** Google Ads → Herramientas → Cuentas vinculadas → Google Analytics 4
2. **Importar conversiones:** Objetivos → Conversiones → Nueva acción de conversión → Importar → Google Analytics 4
3. **Seleccionar:** `quote_submitted`, `contact_form_submitted`, `whatsapp_click`, `phone_click`
4. **Marcar primarias:** quote_submitted y contact_form_submitted

---

## Resumen

| Paso | Qué necesitás | Qué hacer |
|------|---------------|-----------|
| 1 | ID GA4 (`G-XXXX`) | Darlo para configurar |
| 2 | Variable en Vercel | Ya agregada o agregar |
| 3 | Validar en GA4 | Revisar tiempo real |
| 4 | Vincular en Google Ads | Manual en la interfaz |

---

**¿Tenés el ID de GA4?** Pasá el valor (ej: `G-ABC123XYZ`) y lo configurás en `.env.local` y en Vercel. O si ya tenés propiedad creada, solo confirmá que la variable está en el proyecto.
