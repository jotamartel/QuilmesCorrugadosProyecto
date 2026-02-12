# Estrategia de Ventas con IA - Quilmes Corrugados

> Basado en conversación dueño/Julian (11/2/26)

## Resumen ejecutivo

Objetivo: maximizar ventas de pedidos pequeños (1.000–3.000 m²) combinando precios estratégicos, ofertas por canal, y contacto proactivo vía WhatsApp según patrones de compra.

---

## 1. Estrategia de precios (900 publicado / 850 ofrecido)

### Contexto
- **800 ARS/m²** para 1.000 m² es competitivo y deja ganancia
- **850** también funciona
- **900** dejaría más margen
- El papel está subiendo mensualmente (estaba estancado 14 meses)

### Implementación propuesta

| Canal | Precio mostrado | Acción |
|-------|-----------------|--------|
| Web cotizador | 900/m² (below minimum) | `price_per_m2_below_minimum` en `pricing_config` |
| WhatsApp (contacto directo) | 850/m² ofrecido | Mensaje: "Por coordinar directo te puedo hacer 850" |
| Retell / Llamada | 850/m² ofrecido | Ana ofrece 850 si preguntan o si es pedido chico |
| Mínimo de negociación | 800/m² | Piso si cierran |

### Cambios técnicos

1. **Dashboard Configuración**: Permitir editar `price_per_m2_below_minimum` → seteado a 900
2. **Retell Agent (Ana)**: Actualizar prompt para que ofrezca 850 cuando:
   - El cliente cotiza < 3.000 m²
   - Pregunta por precio o descuento
   - Frase: "Para pedidos de ese tamaño te puedo hacer $850 el m² si lo coordinamos por acá"
3. **WhatsApp flow**: Agregar lógica para ofrecer 850 cuando:
   - Cliente completa cotización web con < 3.000 m²
   - Primer mensaje de seguimiento: incluir "Tenemos precio especial de $850/m² para pedidos coordinados"

---

## 2. Patrones de compra + WhatsApp proactivo

### Idea de Julian
> "Que la IA determine patrones de compra y que contacte por WhatsApp para coordinar venta"

### Contexto del mercado
- La mayoría compra poco, no se stockea
- Algunos no tienen lugar para guardar
- Reventa periódica = oportunidad de contacto recurrente

### Implementación propuesta

#### Fase 1: Datos (ya existe)
- `orders` + `order_items` → historial de compras por cliente
- `clients` → teléfono, email, última compra
- Calcular: última compra, m² típico, frecuencia aproximada

#### Fase 2: Lógica de "re.compra"
- Clientes que compraron hace 2–4 meses con m² similares
- Posible regla: `last_order_at` entre 60 y 120 días
- Lista exportable en dashboard: "Clientes a contactar"

#### Fase 3: Automatización WhatsApp
- **Opción A**: Cron (Vercel) que corre semanalmente
  - Identifica clientes elegibles
  - Envía mensaje: "Hola [nombre], ¿necesitás más cajas? La última vez pediste [X] m². ¿Querés que te cotice?"
- **Opción B**: Dashboard con botón "Enviar recordatorio" por cliente
- **Opción C**: Integración con sistema de campañas (ej. Twilio Messaging)

### Cambios técnicos

1. **Nueva vista en dashboard**: "Re.compra" o "Recordatorios"
   - Query: clientes con última orden entre 60–120 días
   - Columna: teléfono, última compra, m² total
   - Botón: "Enviar WhatsApp" (usa `sendWhatsAppMessage` existente)
2. **API route**: `POST /api/whatsapp/send-reminder`
   - Parámetros: `client_id` o `phone`, `template` (opcional)
   - Template por defecto con nombre, m² último pedido
3. **Cron (futuro)**: `api/cron/recompra-reminders/route.ts`
   - Ejecuta lógica de Fase 2
   - Envía mensajes en lotes (respetar rate limits Twilio)

---

## 3. Combinar pedidos (medidas similares)

### Idea de Julian
> "Lo ideal es combinar 2 que necesiten medida similar... Y decirle mira te puedo hacer esta (la que mejor te quede para combinar)"

### Contexto técnico (Fer)
- Plancha: **630 mm** de ancho → salen 2 cajas por plano
- Planchas disponibles: **1570** y **1270 mm** de ancho
- Ancho plancha en fórmula = Alto + Ancho de la caja (H + A)
- Siempre se puede combinar con otro cliente

### Implementación propuesta

#### Fase 1: Información al usuario
- En cotizador, cuando el pedido es < 3.000 m²: mensaje
  - "Si tu medida es similar a la de otro cliente, podés tener mejor precio por combinación. Consultanos."
- En FAQ: agregar pregunta sobre combinación de pedidos

#### Fase 2: Vista interna "Pedidos combinables"
- Dashboard: lista de cotizaciones/Órdenes pendientes con:
  - `unfolded_width_mm` (ancho plancha)
  - Agrupar por rangos compatibles (ej. 300–320 mm, 315–325 mm)
- Fer puede ver: "Cliente A y B tienen medidas combinables"
- Sin automatización inicial: decisión manual

#### Fase 3 (futuro): Sugerencia automática
- Al guardar cotización below-minimum: buscar otras cotizaciones con `unfolded_width` similar (±20 mm)
- Notificar a Fer: "Esta cotización podría combinarse con [ID]"

### Cambios técnicos

1. **Box calculations**: Ya se calcula `unfolded_width` (ancho + alto). Verificar que esté en `public_quotes` o `quotes`
2. **Migración**: Agregar `unfolded_width_mm` a `public_quotes` si no existe
3. **Dashboard**: Nueva página "Combinables" o sección en cotizaciones
4. **Copy**: Mensaje en BelowMinimumModal y/o QuoterForm

---

## 4. Priorización sugerida

| # | Feature | Esfuerzo | Impacto | Dependencias |
|---|---------|----------|---------|--------------|
| 1 | Precio 900 en config + actualizar Retell prompt | Bajo | Alto | Ninguna |
| 2 | Mensaje WhatsApp con oferta 850 al completar cotización below-min | Bajo | Alto | leads, whatsapp |
| 3 | Vista "Re.compra" en dashboard | Medio | Medio | orders, clients |
| 4 | Botón "Enviar recordatorio" WhatsApp | Bajo | Medio | #3 |
| 5 | Mensaje "combinación" en cotizador | Bajo | Bajo | Ninguna |
| 6 | Vista "Pedidos combinables" | Medio | Medio | unfolded_width |
| 7 | Cron re.compra automático | Medio | Alto | #3, Twilio |

---

## 5. Descuentos (para más adelante)

> Fer: "Para descuentos hay tiempo. Pago contado y demás."

- Pago contado: posible descuento adicional
- Por ahora: foco en precio 900/850 y re.compra

---

## Referencias

- `src/config/retell-agent.ts` - Prompt de Ana
- `src/lib/whatsapp.ts` - Envío de mensajes
- `src/app/api/config/pricing/route.ts` - Config de precios
- `pricing_config` - price_per_m2_below_minimum
- `orders`, `order_items`, `clients` - Historial de compras
