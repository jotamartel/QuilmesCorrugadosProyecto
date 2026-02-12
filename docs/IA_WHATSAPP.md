# IA Conversacional para WhatsApp - Quilmes Corrugados

> Asistente especializado en el conocimiento del negocio, con respuestas detalladas en el estilo del dueño.

## Objetivo

Conectar una IA a WhatsApp que pueda:
- **Llevar conversaciones naturales** (no solo respuestas estructuradas)
- **Estar especializada** en todo el conocimiento del proyecto
- **Responder de forma detallada** como si hablara el dueño del negocio

## Arquitectura

### Flujo actual (híbrido)

1. **Flujo estructurado** (cotización): Se mantiene el flujo paso a paso (dimensiones → cantidad → impresión → cotización). Los cálculos son precisos y determinísticos.

2. **IA conversacional**: Para mensajes que no encajan en el flujo:
   - `question_shipping` (preguntas sobre envíos)
   - `question_other` (formas de pago, tiempos, stock, etc.)
   - `unknown` (mensajes no clasificables)

3. **Clasificación**: Groq sigue clasificando intents; la IA genera la respuesta solo cuando corresponde.

### Componentes

| Archivo | Función |
|---------|---------|
| `src/lib/whatsapp-ai.ts` | Prompt de conocimiento, `generateConversationalResponse`, historial |
| `src/lib/groq.ts` | `classifyIntent` (clasificación de mensajes) |
| `src/app/api/whatsapp/webhook/route.ts` | Integración: usa IA para question_shipping, question_other, unknown |

## Conocimiento inyectado

El prompt del sistema incluye:

- **Producto**: cajas RSC, medidas, límites técnicos
- **Precios**: 900/850 publicado, 700 estándar, 5000+ m² mayorista
- **Envíos**: gratis 60km, 4000 m², resto del país
- **Producción**: 7/14 días hábiles
- **Formas de pago**: contado, cheque 30 días
- **Contacto**: WhatsApp, email, dirección, horario
- **Estrategias**: 850 para pedidos chicos, combinación de pedidos, re-compra

Fuentes: `ESTRATEGIA_VENTAS_IA.md`, `retell-agent.ts`, `llms.txt`, `pricing.ts`, `whatsapp.ts`.

## Configuración

```env
GROQ_API_KEY=xxx   # Requerido para IA (ya usado para clasificación)
```

## Limitaciones

- **Respuestas cortas**: Se limitan a ~350 tokens para evitar mensajes largos en WhatsApp
- **No inventa precios**: El prompt instruye a no inventar; si piden cotización, guía a escribir "cotizar"
- **Horario**: La IA sabe el horario; si es fuera de hora puede mencionarlo

## Mejoras futuras

1. **Precios dinámicos**: Pasar la config activa de `pricing_config` al prompt para que los precios sean exactos
2. **Tool calling**: Si Groq soporta tools, la IA podría llamar a `calculateQuote` directamente
3. **Personalización**: Más contexto del cliente (historial de compras) para respuestas más relevantes
4. **Enriquecimiento de empresa**: Cuando tengamos `company_enrichment`, pasarlo al contexto
