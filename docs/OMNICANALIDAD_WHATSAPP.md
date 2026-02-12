# Omnicanalidad con WhatsApp como Hub

> Objetivo: Toda la comunicación pasa por WhatsApp. Historial unificado, perfil del contacto (empresa, compras, datos enriquecidos), y derivación a otros canales cuando se requiera.

---

## 1. Principios

1. **WhatsApp como hub**: Todo contacto entra por WhatsApp. Si el cliente pide email/llamada, se registra y se deriva, pero el thread principal vive en WhatsApp.
2. **Perfil unificado**: Un contacto = un perfil que junta: conversación (todos los canales), empresa, compras recientes, datos enriquecidos de Google.
3. **Identificación automática**: Si el teléfono/email coincide con `clients`, se vincula. Si no, se crea contacto potencial y se enriquece con empresa cuando haya `company_name`.

---

## 2. Modelo de datos

### 2.1 Cambios en tablas existentes

#### `whatsapp_conversations`
- **client_id** (UUID, FK clients): Vincular cuando identifiquemos al cliente.
- **contact_source** (TEXT): `'whatsapp'` | `'web'` | `'phone'` — origen del primer contacto.

#### `communications`
- Ya tiene `client_id`, `channel`, `metadata`.
- **metadata.phone**: Para WhatsApp, debe estar siempre.
- **metadata.thread_id** (opcional): Agrupar por conversación cuando haya varios hilos.
- Al guardar mensaje WhatsApp: si hay match por teléfono→client, setear `client_id`.

#### `clients`
- Ya tiene `whatsapp`, `phone`, `company`, `email`.
- **Normalizar**: `whatsapp` y `phone` sin espacios, sin +54 para matching.

### 2.2 Nueva tabla: `contact_profiles`

Perfil unificado antes de tener `client_id` (o en paralelo).

```sql
CREATE TABLE contact_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identificadores
  phone_number TEXT UNIQUE NOT NULL,  -- WhatsApp principal
  email TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  
  -- Datos inferidos/capturados
  display_name TEXT,
  company_name TEXT,
  company_enriched_at TIMESTAMPTZ,
  company_enrichment JSONB,  -- { description, sector, url, employees, etc. }
  
  -- Preferencias de canal
  preferred_channel TEXT DEFAULT 'whatsapp' CHECK (preferred_channel IN ('whatsapp', 'email', 'phone')),
  preferred_channel_updated_at TIMESTAMPTZ,
  
  -- Stats cacheadas
  last_order_at TIMESTAMPTZ,
  last_order_total DECIMAL(12,2),
  total_orders INTEGER DEFAULT 0,
  total_m2 DECIMAL(12,4) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.3 Nueva tabla: `company_enrichments`

Cache de búsquedas de empresas (evitar repetir).

```sql
CREATE TABLE company_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  company_name_normalized TEXT NOT NULL,  -- lower, trim, sin S.A. etc.
  enrichment_data JSONB NOT NULL,
  source TEXT DEFAULT 'google',  -- 'google' | 'manual'
  fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_name_normalized)
);
```

---

## 3. Flujo: WhatsApp como hub

### 3.1 Llegada de mensaje

1. Webhook recibe mensaje.
2. Buscar `contact_profiles` por `phone_number` o crear uno.
3. Buscar `clients` por `whatsapp`/`phone` normalizado.
4. Si hay match: setear `contact_profiles.client_id` y `whatsapp_conversations.client_id`.
5. Guardar en `communications` con `client_id` si ya está identificado.
6. Actualizar estado de conversación en `whatsapp_conversations`.

### 3.2 Derivación a otro canal

Cuando el usuario dice "prefiero que me llamen" o "manden por email":

1. Actualizar `contact_profiles.preferred_channel`.
2. Si pide llamada: crear tarea/nota para que Ventas llame. El seguimiento puede seguir por WhatsApp.
3. Si pide email: enviar por Resend y registrar en `communications` con `channel='email'`.

### 3.3 Enriquecimiento de empresa

Cuando tengamos `company_name` (por WhatsApp o por formulario web):

1. Buscar en `company_enrichments` por nombre normalizado.
2. Si no existe: llamar a API de búsqueda (Serper, Exa, etc.) con `"[company_name] Argentina"` o similar.
3. Guardar en `company_enrichments`.
4. Actualizar `contact_profiles.company_enrichment` y `company_enriched_at`.

---

## 4. API de enriquecimiento (Google/búsqueda)

### Opciones

| Servicio | Uso | Costo aproximado |
|----------|-----|------------------|
| **Serper** (serper.dev) | Google Search API | ~$50/mes 10k búsquedas |
| **Exa** (exa.ai) | Búsqueda semántica | Freemium |
| **Tavily** | Búsqueda para AI | Freemium |
| **SerpAPI** | Google Search | Similar a Serper |

### Datos a extraer

- Descripción de la empresa
- Sector / rubro
- Sitio web
- Dirección (si aparece)
- Tamaño (empleados, facturación si está público)
- Noticias recientes (opcional)

### Implementación sugerida

```ts
// lib/company-enrichment.ts
export async function enrichCompany(companyName: string): Promise<CompanyEnrichment | null> {
  // 1. Check cache (company_enrichments)
  // 2. Call Serper/Exa: search "[companyName] Argentina empresa"
  // 3. Parse results (o usar LLM para extraer struct)
  // 4. Save to company_enrichments
  // 5. Return
}
```

---

## 5. Vista de perfil unificado (dashboard)

### Pantalla: "Contacto" o "Perfil de conversación"

Al abrir una conversación de WhatsApp:

1. **Header**: Nombre, empresa, teléfono.
2. **Panel lateral**:
   - **Empresa**: Si hay `company_name`, mostrar `company_enrichment` (descripción, sector, web).
   - **Compras**: Últimas órdenes (fecha, total, m²).
   - **Cotizaciones**: Últimas cotizaciones.
   - **Historial unificado**: Mensajes de todos los canales (WhatsApp, email, manual) ordenados por fecha.
3. **Acciones**:
   - "Enviar por email"
   - "Programar llamada"
   - "Crear cotización"
   - "Ver como cliente" (si hay `client_id` → link a `/clientes/[id]`)

### API: `GET /api/contacts/:phoneNumber` o `GET /api/contacts/profile?phone=...`

Respuesta:

```json
{
  "contact": {
    "phone_number": "+54911...",
    "display_name": "Juan Pérez",
    "company_name": "Distribuidora XYZ",
    "client_id": "uuid-o-null",
    "preferred_channel": "whatsapp",
    "company_enrichment": {
      "description": "...",
      "sector": "Distribución",
      "website": "https://..."
    }
  },
  "conversation_history": [...],
  "orders": [...],
  "quotes": [...]
}
```

---

## 6. Matching cliente ↔ conversación

### Lógica de matching

1. **Por teléfono**: Normalizar formateo (quitar espacios, guiones; considerar +54 vs 0 vs 9).
2. **Por email**: Si en la conversación obtuvimos email y coincide con `clients.email`.
3. **Por empresa**: Si `company_name` coincide con `clients.company` (fuzzy o exacto).
4. **Manual**: Botón "Vincular con cliente" en el dashboard para elegir cliente existente.

### Normalización de teléfono

```ts
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^54/, '').replace(/^9/, '');
}
// +54 9 11 1234-5678 → 91112345678
// 011 15 1234-5678   → 91112345678
```

---

## 7. Plan de implementación

| Fase | Tareas | Prioridad |
|------|--------|-----------|
| **1** | Migración: `client_id` en whatsapp_conversations, tabla contact_profiles | Alta |
| **2** | Matching automático teléfono→client en webhook | Alta |
| **3** | API `/api/contacts/profile?phone=` con historial + compras | Alta |
| **4** | Vista dashboard "Perfil de contacto" al abrir conversación | Alta |
| **5** | Enriquecimiento de empresa (Serper/Exa), tabla company_enrichments | Media |
| **6** | Botón "Vincular con cliente" manual | Media |
| **7** | Derivación a email/teléfono y preferred_channel | Media |
| **8** | Limpieza de `communications`: poblar client_id cuando match | Baja |

---

## 8. Archivos a crear/modificar

### Nuevos
- `supabase/migrations/018_omnicanal_contact_profiles.sql`
- `src/lib/company-enrichment.ts` (o `enrichment/serper.ts`)
- `src/app/api/contacts/profile/route.ts`
- `src/app/(dashboard)/whatsapp/[phone]/page.tsx` — vista de perfil (o integrar en página actual)

### Modificar
- `src/app/api/whatsapp/webhook/route.ts` — matching client_id, upsert contact_profiles
- `src/lib/whatsapp.ts` — aceptar client_id en updateConversationState
- `src/app/(dashboard)/whatsapp/page.tsx` — panel lateral con perfil al seleccionar conversación
- `supabase/migrations/` — alter whatsapp_conversations add client_id

---

## 9. Variables de entorno

```env
# Opcional: API para enriquecimiento de empresas
SERPER_API_KEY=xxx      # Serper (Google Search)
# o
EXA_API_KEY=xxx         # Exa (búsqueda semántica)
```

Si no hay key, el enriquecimiento se omite y solo se muestran datos ya guardados.

---

## 10. Ejecutar migración

### Opción A: Supabase CLI (recomendado)

1. Agregá a `.env.local` la URL completa (reemplazá `TU_PASSWORD` por la contraseña real):

```env
SUPABASE_DB_URL=postgresql://postgres:TU_PASSWORD@db.fuzrrodnwzxuosokooyx.supabase.co:5432/postgres
```

2. Ejecutá:

```bash
npm run db:push
```

O directamente:

```bash
supabase db push --db-url "postgresql://postgres:TU_PASSWORD@db.fuzrrodnwzxuosokooyx.supabase.co:5432/postgres"
```

### Opción B: Script con pg (apply-migration)

```bash
# Necesita SUPABASE_DB_PASSWORD en .env.local (o SUPABASE_DB_URL)
npm run migration:omnicanal
```

Si no tenés la contraseña: Supabase Dashboard → Settings → Database → Connection string.
