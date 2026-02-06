# Quilmes Corrugados - Contexto del Proyecto

## Resumen Ejecutivo
Sitio web para fábrica de cajas de cartón corrugado en Quilmes, Buenos Aires. Incluye landing page pública, cotizador inteligente con IA, dashboard admin, y API pública para integración con LLMs.

## Stack Técnico
- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **AI/Voice:** Retell AI para llamadas telefónicas
- **PDF:** pdfjs-dist para visualización de diseños
- **Deploy:** Vercel (auto-deploy desde GitHub)
- **Repo:** https://github.com/jotamartel/QuilmesCorrugadosProyecto.git

## Estructura del Proyecto
```
src/
├── app/
│   ├── (public)/          # Páginas públicas (landing, productos, contacto, FAQ, nosotros)
│   ├── (auth)/            # Login/registro
│   ├── admin/             # Dashboard administrativo
│   ├── api/               # API routes
│   │   ├── v1/            # API pública (quote, docs, openapi)
│   │   └── retell/        # Webhooks para Retell AI (llamadas)
│   ├── layout.tsx         # Layout principal con SEO y schemas
│   ├── sitemap.ts         # Sitemap dinámico
│   └── robots.ts          # Robots.txt dinámico
├── components/
│   ├── public/            # Componentes de landing (Header, Footer, SchemaMarkup, DesignUploader)
│   ├── admin/             # Componentes del dashboard
│   └── ui/                # Componentes UI reutilizables
├── lib/                   # Utilidades (supabase client, helpers)
├── types/                 # TypeScript types (retell.ts tiene HORARIO_LABORAL)
└── hooks/                 # Custom React hooks
```

## Configuración Local

### 1. Clonar e instalar
```bash
git clone https://github.com/jotamartel/QuilmesCorrugadosProyecto.git
cd QuilmesCorrugadosProyecto
npm install
```

### 2. Variables de entorno
Crear `.env.local` con:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Retell AI (opcional, para llamadas)
RETELL_API_KEY=key_xxxxx
```

### 3. Correr en desarrollo
```bash
npm run dev
# Abre http://localhost:3000
```

### 4. Build de producción
```bash
npm run build
npm run start
```

## Deploy
- **Automático:** Push a `main` → Vercel detecta y deploya
- **URL Producción:** https://quilmes-corrugados.vercel.app
- **Vercel Project:** Conectado al repo de GitHub

## SEO Implementado
- ✅ Meta tags completos (OG, Twitter Cards)
- ✅ JSON-LD Schemas (LocalBusiness, FAQPage, Product, Organization, BreadcrumbList)
- ✅ Sitemap dinámico (`/sitemap.xml`)
- ✅ Robots.txt dinámico (`/robots.txt`)
- ✅ Favicon personalizado (`src/app/favicon.ico`)
- ✅ OG Image (`public/og-image.jpg`)
- ✅ Keywords optimizadas para Argentina

## Páginas Públicas
| Ruta | Descripción |
|------|-------------|
| `/` | Landing principal con hero, features, CTA |
| `/productos` | Catálogo de tipos de cajas |
| `/nosotros` | Historia de la empresa |
| `/contacto` | Formulario y datos de contacto |
| `/faq` | Preguntas frecuentes (12 Q&A con schema) |

## API Pública
La API está diseñada para ser consumida por LLMs:
- `POST /api/v1/quote` - Cotizar cajas
- `GET /api/v1/docs` - Documentación
- `GET /api/v1/openapi.json` - OpenAPI spec
- `GET /llms.txt` - Instrucciones para LLMs

## Archivos Clave Modificados Recientemente
- `src/app/layout.tsx` - SEO metadata, schemas, favicon
- `src/app/sitemap.ts` - Sitemap dinámico
- `src/app/robots.ts` - Robots.txt dinámico
- `src/components/public/DesignUploader.tsx` - Fix pdfjs-dist render
- `src/types/retell.ts` - Fix DIAS typing para horario laboral
- `src/components/public/SchemaMarkup.tsx` - Schemas reutilizables

## Problemas Conocidos y Fixes
1. **pdfjs-dist render():** Requiere parámetro `canvas` explícito
2. **HORARIO_LABORAL.DIAS:** Necesita cast `as number[]` para .includes()
3. **Favicon:** Debe estar en `src/app/favicon.ico` (no solo en public/)

## Datos del Negocio
- **Nombre:** Quilmes Corrugados
- **Dirección:** Lugones 219, B1878 Quilmes, Buenos Aires
- **Pedido mínimo:** 3.000 m²
- **Zona de envío gratis:** Sur del GBA

## Pendientes / Nice-to-have
- [ ] Testimonios de clientes
- [ ] Galería de productos con fotos reales
- [ ] Google Analytics
- [ ] Google Search Console verification
- [ ] WhatsApp Business API integration
