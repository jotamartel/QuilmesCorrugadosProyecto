# Meta (Facebook) Pixel - Configuración

Pixel de Facebook/Instagram para campañas de ads en Meta.

---

## Variable de entorno

Agregar en `.env.local` (local) y en Vercel (producción):

```
NEXT_PUBLIC_META_PIXEL_ID=XXXXXXXXXXXXXXX
```

**Obtener el ID:**
1. Ir a [business.facebook.com](https://business.facebook.com) → Administrador de eventos
2. O: Meta Business Suite → Configuración de la empresa → Fuentes de datos → Pixels
3. Crear pixel o copiar el ID del existente (formato numérico, ej: 1234567890123456)

---

## Eventos mapeados

| Evento interno | Meta Pixel | Uso en campañas |
|----------------|------------|-----------------|
| `quote_submitted` | Lead | Conversión primaria |
| `contact_form_submitted` | Lead | Conversión primaria |
| `chat_message_sent` | Lead | Conversión primaria |
| `whatsapp_click` | Contact | Conversión secundaria |
| `phone_click` | Contact | Conversión secundaria |
| `email_click` | Contact | Conversión secundaria |
| `quoter_viewed` | ViewContent | Engagement |
| `product_page_view` | ViewContent | Engagement |
| `quote_started` | InitiateCheckout | Funnel |
| `chat_opened` | ViewContent | Engagement |
| PageView | PageView | Automático en cada página |

---

## Validación

1. **Meta Pixel Helper** (extensión Chrome): Instalar y visitar el sitio. Debe detectar el pixel y los eventos.
2. **Administrador de eventos:** Meta Business Suite → Administrador de eventos → Prueba de eventos → Ver actividad en tiempo real.
3. **Consola del navegador:** `Object.keys(window).filter(k => k === 'fbq')` → debe existir `fbq`.

---

## UTM para campañas

Incluir en URLs de anuncios:

```
?utm_source=facebook&utm_medium=cpc&utm_campaign=lead_cajas
```

O por campaña específica:

```
?utm_source=facebook&utm_medium=cpc&utm_campaign=conversiones&utm_content=carousel_1
```
