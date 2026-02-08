# Análisis Completo del Proyecto - Quilmes Corrugados

## 📋 Resumen Ejecutivo

Sistema completo de gestión para fábrica de cajas de cartón corrugado con:
- **Landing pública** con cotizador integrado
- **Dashboard administrativo** completo
- **API pública** para integración con LLMs y sistemas externos
- **Integraciones** con servicios externos (Xubio ERP, ARBA COT, Retell AI, WhatsApp)
- **Sistema de tracking** de leads y cotizaciones

---

## 🏗️ Arquitectura del Sistema

### Stack Tecnológico

- **Frontend:** Next.js 16.1.1 (App Router) + React 19.2.3
- **Styling:** Tailwind CSS 4
- **Base de Datos:** Supabase (PostgreSQL)
- **Autenticación:** Supabase Auth con sistema de usuarios autorizados
- **Deploy:** Vercel (auto-deploy desde GitHub)
- **Email:** Resend
- **PDF:** pdfjs-dist, pdf-lib, jsPDF
- **3D:** Three.js + React Three Fiber
- **IA/Voz:** Retell AI SDK
- **Mensajería:** Twilio (WhatsApp)

### Estructura de Carpetas

```
src/
├── app/
│   ├── (public)/          # Landing pública
│   │   ├── page.tsx       # Landing principal
│   │   ├── productos/     # Catálogo
│   │   ├── nosotros/      # Sobre nosotros
│   │   ├── contacto/      # Formulario contacto
│   │   ├── faq/           # FAQ con schema
│   │   └── cotizacion/    # Página de cotización
│   ├── (dashboard)/        # Dashboard admin (protegido)
│   │   ├── inicio/        # Dashboard principal
│   │   ├── cotizaciones/  # Gestión cotizaciones
│   │   ├── cotizaciones-web/ # Cotizaciones públicas
│   │   ├── leads-web/     # Leads de web
│   │   ├── ordenes/       # Órdenes de producción
│   │   ├── clientes/      # CRM
│   │   ├── pagos/         # Gestión pagos
│   │   ├── cheques/       # Gestión cheques
│   │   ├── catalogo/      # Catálogo cajas
│   │   ├── costos/        # Control de costos
│   │   ├── reportes/      # Reportes y analytics
│   │   ├── whatsapp/      # Conversaciones WhatsApp
│   │   ├── api-stats/     # Estadísticas API
│   │   ├── api-keys/      # Gestión API keys
│   │   └── configuracion/ # Configuración sistema
│   ├── api/               # API Routes
│   │   ├── v1/            # API pública
│   │   │   ├── quote/     # Endpoint cotización
│   │   │   └── docs/      # Documentación API
│   │   ├── quotes/       # API cotizaciones (admin)
│   │   ├── orders/       # API órdenes
│   │   ├── clients/      # API clientes
│   │   ├── retell/       # Webhooks Retell AI
│   │   ├── whatsapp/     # Webhooks WhatsApp
│   │   ├── xubio/        # Integración Xubio
│   │   ├── arba/         # Integración ARBA COT
│   │   └── ...
│   ├── auth/             # Callback auth
│   └── login/            # Página login
├── components/
│   ├── public/           # Componentes landing
│   │   ├── QuoterForm.tsx      # Formulario cotización
│   │   ├── BoxItemForm.tsx     # Formulario item caja
│   │   ├── BoxPreview3D.tsx    # Vista 3D caja
│   │   ├── DesignUploader.tsx  # Upload diseños PDF
│   │   ├── PriceSummary.tsx    # Resumen precios
│   │   ├── LandingHeader.tsx   # Header público
│   │   ├── LandingFooter.tsx   # Footer público
│   │   ├── SchemaMarkup.tsx    # Schemas JSON-LD
│   │   └── WhatsAppButton.tsx  # Botón WhatsApp flotante
│   ├── admin/           # Componentes dashboard
│   └── ui/               # Componentes UI reutilizables
├── lib/
│   ├── supabase/         # Clientes Supabase
│   │   ├── admin.ts      # Cliente admin (service role)
│   │   ├── client.ts      # Cliente público
│   │   └── server.ts     # Cliente servidor
│   ├── utils/
│   │   ├── box-calculations.ts  # Cálculos cajas
│   │   ├── pricing.ts           # Cálculos precios
│   │   ├── format.ts            # Formateo
│   │   └── dates.ts             # Utilidades fechas
│   ├── xubio/            # Cliente Xubio ERP
│   ├── arba/             # Cliente ARBA COT
│   ├── notifications.ts  # Sistema notificaciones
│   ├── whatsapp.ts       # Integración WhatsApp
│   ├── groq.ts           # Cliente Groq (IA)
│   └── ...
└── types/
    └── retell.ts          # Tipos Retell AI
```

---

## 🗄️ Modelo de Datos

### Tablas Principales

#### **pricing_config**
Configuración de precios (actualizable mensualmente)
- Precios por m² (estándar/volumen)
- Umbrales de volumen
- Días de producción
- Envío gratis

#### **clients**
CRM de clientes
- Datos de contacto
- Integración con Xubio (`xubio_id`)
- Condición fiscal
- Crédito y límites

#### **quotes**
Cotizaciones internas
- Estados: draft, sent, approved, rejected, expired, converted
- Canales: manual, whatsapp, email, web
- Cálculos: m², precios, impresión, troquelado, envío
- Diseños PDF adjuntos

#### **public_quotes**
Cotizaciones públicas (web)
- Vinculadas a `leads_web`
- Sin cliente asociado inicialmente
- Conversión a cotización interna

#### **orders**
Órdenes de producción
- Estados: pending, confirmed, in_production, ready, dispatched, completed, cancelled
- Integración Xubio (facturas, remitos)
- COT ARBA
- Pagos y cheques

#### **order_items**
Items de órdenes
- Cantidad cotizada vs entregada
- Precios unitarios

#### **api_requests**
Tracking de API pública
- Endpoint, método, IP, User-Agent
- Detección de LLMs
- Rate limiting
- Métricas (m², montos)

#### **api_keys**
API keys para clientes
- Hash SHA-256
- Rate limits personalizados
- Expiración

#### **llamadas** (Retell AI)
Registro de llamadas telefónicas
- Transcripts
- Análisis de sentimiento
- Transferencias

#### **whatsapp_conversations**
Conversaciones WhatsApp
- Mensajes
- Leads generados

#### **cost_categories, fixed_costs, supplies, order_costs**
Sistema de control de costos
- Categorías de costos
- Costos fijos
- Insumos y precios históricos
- Costos por orden

#### **payments, checks**
Gestión financiera
- Pagos de órdenes
- Cheques (depósito, endoso, efectivización)

#### **vehicles**
Vehículos para envíos
- Patentes
- Conductores
- CUITs

---

## 🚀 Funcionalidades Principales

### 1. Landing Pública

#### **Cotizador Inteligente** (`QuoterForm`)
- Formulario multi-step
- Múltiples tipos de cajas
- Vista 3D de cajas (Three.js)
- Upload de diseños PDF (preview con pdfjs-dist)
- Cálculo en tiempo real
- Validación de mínimos (3.000 m²)
- Selección de ciudades Buenos Aires (con distancia)
- Generación de leads

#### **Componentes SEO**
- Meta tags completos (OG, Twitter Cards)
- JSON-LD Schemas (LocalBusiness, FAQPage, Product, Organization)
- Sitemap dinámico
- Robots.txt optimizado para LLMs
- Instrucciones para LLMs en HTML comments

### 2. API Pública v1

#### **Endpoint:** `POST /api/v1/quote`

**Características:**
- Rate limiting (10 req/min anónimo, configurable con API key)
- Detección automática de LLMs (GPT, Claude, Perplexity, etc.)
- Validación completa de inputs
- Cálculo preciso de precios
- Tracking de requests
- Notificaciones automáticas (leads, alto valor)

**Request:**
```json
{
  "boxes": [{
    "length_mm": 400,
    "width_mm": 300,
    "height_mm": 200,
    "quantity": 1000,
    "has_printing": false,
    "printing_colors": 0
  }],
  "contact": {
    "name": "Juan",
    "email": "juan@example.com",
    "phone": "+541169249801"
  },
  "origin": "mi-ecommerce"
}
```

**Response:**
```json
{
  "success": true,
  "quote": {
    "boxes": [...],
    "total_m2": 725,
    "subtotal": 507500,
    "currency": "ARS",
    "estimated_days": 7,
    "valid_until": "2025-02-19",
    "minimum_m2": 3000,
    "meets_minimum": false
  },
  "rate_limit": {
    "remaining": 9,
    "reset_at": "2025-01-20T10:01:00Z"
  }
}
```

**Documentación:**
- `/api/v1/docs` - Documentación interactiva
- `/api/v1/openapi.json` - OpenAPI spec
- `/llms.txt` - Instrucciones para LLMs

### 3. Dashboard Administrativo

#### **Módulos Principales:**

**Inicio**
- Métricas generales
- Accesos rápidos

**Cotizaciones**
- Lista de cotizaciones (filtros, búsqueda)
- Crear/editar cotizaciones
- Aprobar/rechazar
- Convertir a orden
- Enviar por email/WhatsApp

**Cotizaciones Web**
- Cotizaciones públicas
- Conversión a cotización interna
- Gestión de leads

**Leads Web**
- Leads generados desde web
- Seguimiento
- Conversión a clientes

**Órdenes**
- Lista y kanban
- Confirmación de cantidades
- Estados de producción
- Despacho
- Pagos

**Clientes**
- CRM completo
- Historial de cotizaciones/órdenes
- Integración Xubio

**Pagos**
- Registro de pagos
- Cheques (depósito, endoso, efectivización)
- Conciliación

**Catálogo**
- Cajas estándar
- Templates

**Costos**
- Categorías
- Costos fijos
- Insumos
- Costos por orden
- Rentabilidad

**Reportes**
- Ventas por período
- Producción
- Top clientes
- Precisión de cotizaciones

**WhatsApp**
- Conversaciones
- Leads generados

**API Stats**
- Estadísticas de uso API
- Requests por LLM
- Rate limiting
- Métricas de conversión

**API Keys**
- Gestión de API keys
- Rate limits personalizados

**Configuración**
- Precios
- Vehículos
- Parámetros sistema

### 4. Integraciones

#### **Xubio ERP**
- Sincronización de clientes
- Creación de facturas (seña y saldo)
- Generación de remitos
- Receipts

#### **ARBA COT**
- Generación de COT (Certificado de Operación de Transporte)
- Validación de vehículos
- Archivos para carga

#### **Retell AI**
- Bot telefónico "Ana"
- Cotización por teléfono
- Registro de leads
- Transferencia a humano
- Análisis de llamadas

#### **WhatsApp (Twilio)**
- Webhooks de mensajes
- Conversaciones
- Generación de leads
- Respuestas automáticas

#### **Resend**
- Notificaciones por email
- Leads calificados
- Alertas de alto valor
- Alertas de volumen

---

## 🧮 Lógica de Negocio

### Cálculo de Cajas RSC

**Fórmula de plancha desplegada:**
- Ancho plancha = Alto + Ancho (H + A)
- Largo plancha = 2×Largo + 2×Ancho + 50mm (chapetón y refile)
- m² por caja = (Ancho × Largo) / 1.000.000

**Ejemplo:** Caja 600×400×400 mm
- Ancho: 400 + 400 = 800 mm
- Largo: 2×600 + 2×400 + 50 = 2050 mm
- m²: (800 × 2050) / 1.000.000 = 1.64 m²

### Precios

- **Hasta 5.000 m²:** $700/m²
- **Más de 5.000 m²:** $670/m²
- **Impresión:** +15% por cada color adicional
- **Troquelado:** Costo adicional según complejidad

### Envío Gratis

- Mínimo: 4.000 m²
- Distancia máxima: 60 km desde Quilmes
- Solo Buenos Aires

### Tiempos de Producción

- **Sin impresión:** 7 días hábiles
- **Con impresión:** 14 días hábiles

### Pedido Mínimo

- **3.000 m² por modelo de caja**
- Advertencia si no se cumple
- Sugerencia de cantidad mínima

### Pagos

- **50% seña** con orden de compra
- **50% contra entrega**
- Métodos: Transferencia, Cheque, Efectivo, eCheq

---

## 🔐 Seguridad y Autenticación

### Autenticación
- Supabase Auth
- Tabla `authorized_users` para control de acceso
- Protección de rutas con `AuthGuard`
- Service Role Key solo en servidor

### API Pública
- Rate limiting por IP/API key
- Validación de inputs
- Tracking de requests
- Hash de API keys (SHA-256)
- CORS configurado

### Webhooks
- Verificación de firma (Retell AI)
- Validación de origen

---

## 📊 Tracking y Analytics

### API Requests
- Logging completo de requests
- Detección de LLMs
- Métricas de uso
- Rate limiting tracking
- Vistas SQL para estadísticas

### Leads
- Tracking de origen
- Conversión a clientes
- Notificaciones automáticas

### Cotizaciones
- Historial completo
- Conversión a órdenes
- Precisión de cotizaciones

---

## 🎨 UI/UX

### Landing Pública
- Diseño moderno y limpio
- Responsive
- Vista 3D interactiva
- Formulario intuitivo multi-step
- Feedback visual inmediato

### Dashboard
- Sidebar navegación
- Mobile-friendly
- Tablas con filtros
- Kanban para órdenes
- Gráficos y métricas

---

## 🔄 Flujos Principales

### Flujo de Cotización Web

1. Usuario ingresa dimensiones en landing
2. Sistema calcula precio en tiempo real
3. Usuario completa datos de contacto
4. Se crea `public_quote` y `lead_web`
5. Notificación por email al equipo
6. Equipo convierte a cotización interna
7. Cliente recibe cotización formal

### Flujo de Orden

1. Cotización aprobada
2. Convertir a orden
3. Confirmar cantidades
4. Crear factura seña en Xubio
5. Generar COT ARBA
6. Producción
7. Despacho
8. Factura saldo
9. Pago final

### Flujo Retell AI

1. Cliente llama
2. Bot "Ana" atiende
3. Función `cotizar` calcula precio
4. Si cliente interesado → `registrar_lead`
5. Si necesita humano → `transferir`
6. Webhook registra llamada
7. Notificación al equipo

---

## 🛠️ Utilidades y Helpers

### Cálculos (`lib/utils/box-calculations.ts`)
- `calculateUnfolded()` - Dimensiones plancha
- `calculateTotalM2()` - Total m²
- `isOversized()` / `isUndersized()` - Validaciones
- `calculateMinimumQuantity()` - Cantidad mínima
- `validateBoxDimensions()` - Validación completa

### Precios (`lib/utils/pricing.ts`)
- `getPricePerM2()` - Precio según volumen
- `calculateSubtotal()` - Subtotal
- `isFreeShipping()` - Envío gratis
- `getProductionDays()` - Días producción
- `formatCurrency()` - Formateo ARS

### Notificaciones (`lib/notifications.ts`)
- `sendNotification()` - Envío emails
- Tipos: lead, alto valor, volumen, asesor
- Templates HTML

---

## 📈 Métricas y KPIs

### Dashboard
- Cotizaciones pendientes
- Órdenes en producción
- Ventas del mes
- Leads nuevos
- Conversión cotización → orden

### API Stats
- Requests por día
- LLMs detectados
- Rate limiting
- Conversión leads

---

## 🔮 Capacidades Avanzadas

### 1. Vista 3D de Cajas
- Three.js + React Three Fiber
- Renderizado en tiempo real
- Interactivo

### 2. Preview de Diseños PDF
- pdfjs-dist para render
- Upload y preview
- Validación de formatos

### 3. Generación de Templates
- PDFs de plantillas de cajas
- jsPDF + autoTable

### 4. Bot Telefónico IA
- Retell AI
- Cotización por voz
- Análisis de sentimiento

### 5. Integración LLMs
- API pública optimizada
- Documentación completa
- Tracking de uso

---

## ⚠️ Consideraciones Técnicas

### Rate Limiting
- Actualmente en memoria (Map)
- Para producción: usar Redis/Upstash
- Rate limits configurables por API key

### Caché
- API keys cacheadas (5 min TTL)
- Configuración de precios (sin caché explícito)

### Performance
- Cálculos optimizados
- Queries SQL indexadas
- Lazy loading de componentes pesados (3D)

### Escalabilidad
- Stateless API
- Base de datos Supabase escalable
- Deploy en Vercel (auto-scaling)

---

## 📝 Estado del Proyecto

### ✅ Implementado
- Landing pública completa
- Cotizador funcional
- Dashboard administrativo
- API pública v1
- Integraciones (Xubio, ARBA, Retell, WhatsApp)
- Sistema de costos
- Reportes básicos
- SEO completo

### 🚧 Pendientes (del CURSOR_CONTEXT.md)
- Testimonios de clientes
- Galería de productos con fotos reales
- Google Analytics
- Google Search Console verification
- WhatsApp Business API integration (parcialmente implementado)

---

## 🎯 Fortalezas del Sistema

1. **Arquitectura sólida:** Next.js App Router, TypeScript, Supabase
2. **API pública bien diseñada:** Rate limiting, tracking, documentación
3. **Integraciones completas:** ERP, transporte, IA, mensajería
4. **UX moderna:** Vista 3D, formularios intuitivos, feedback inmediato
5. **SEO optimizado:** Schemas, sitemap, robots.txt
6. **Tracking completo:** Leads, requests, conversiones
7. **Sistema de costos:** Control de rentabilidad
8. **Multi-canal:** Web, WhatsApp, teléfono, email

---

## 🔍 Áreas de Mejora Potenciales

1. **Rate limiting:** Migrar a Redis para producción
2. **Caché:** Implementar caché para configuraciones frecuentes
3. **Testing:** Agregar tests unitarios e integración
4. **Monitoreo:** Implementar logging estructurado (Sentry, etc.)
5. **Documentación:** Expandir documentación técnica
6. **Performance:** Optimizar queries complejas
7. **Analytics:** Integrar Google Analytics
8. **Notificaciones:** Expandir canales (SMS, push)

---

Este análisis refleja el estado actual del proyecto basado en la revisión del código. El sistema es robusto y está bien estructurado para escalar.
