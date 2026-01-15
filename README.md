# Quilmes Corrugados - Sistema de Cotizacion

Sistema de gestion de cotizaciones, ordenes y clientes para fabrica de cajas de carton corrugado.

## Stack Tecnologico

- **Framework:** Next.js 14+ (App Router)
- **Base de datos:** Supabase (PostgreSQL)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel

## Requisitos

- Node.js 18+
- Cuenta de Supabase
- npm o yarn

## Instalacion

### 1. Clonar e instalar dependencias

```bash
cd quilmes-corrugados
npm install
```

### 2. Configurar Supabase

1. Crear un proyecto en [Supabase](https://supabase.com)
2. Copiar el archivo de ejemplo de variables de entorno:

```bash
cp .env.local.example .env.local
```

3. Completar las variables en `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`: URL de tu proyecto
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Anon key (publica)
   - `SUPABASE_SERVICE_ROLE_KEY`: Service role key (secreta)

### 3. Crear el schema de base de datos

En el SQL Editor de Supabase, ejecutar:

1. El archivo `supabase/migrations/001_initial_schema.sql`
2. El archivo `supabase/seed.sql` (datos de ejemplo)

### 4. Ejecutar en desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## Estructura del Proyecto

```
quilmes-corrugados/
├── src/
│   ├── app/
│   │   ├── api/                    # APIs REST
│   │   │   ├── quotes/             # Cotizaciones
│   │   │   ├── clients/            # Clientes
│   │   │   ├── orders/             # Ordenes
│   │   │   ├── boxes/              # Catalogo de cajas
│   │   │   ├── config/             # Configuracion
│   │   │   └── reports/            # Reportes
│   │   └── (dashboard)/            # Paginas del dashboard
│   │       ├── cotizaciones/
│   │       ├── ordenes/
│   │       ├── clientes/
│   │       ├── catalogo/
│   │       ├── configuracion/
│   │       └── reportes/
│   ├── lib/
│   │   ├── supabase/               # Clientes de Supabase
│   │   ├── utils/                  # Funciones de utilidad
│   │   └── types/                  # Tipos TypeScript
│   └── components/
│       └── ui/                     # Componentes UI
├── supabase/
│   ├── migrations/                 # Schema SQL
│   └── seed.sql                    # Datos de ejemplo
└── README.md
```

## Reglas de Negocio

### Precios
- Hasta 5.000 m2: $700/m2
- Mas de 5.000 m2: $670/m2

### Minimos
- Minimo ideal: 3.000 m2 por modelo de caja

### Calculo de plancha (cajas RSC con aletas simples)
- Ancho plancha = H + A (Alto + Ancho)
- Largo plancha = 2L + 2A + 50mm (chapeton y refile)
- m2 por caja = (ancho x largo) / 1.000.000
- Ejemplo: Caja 600x400x400 = 800mm x 2050mm = 1.64 m2

### Restricciones de tamano
- Minimo: 200 x 200 x 100 mm
- Maximo estandar: 600 x 400 x 400 mm

### Tiempos de produccion
- Sin impresion: 7 dias habiles
- Con impresion: 14 dias habiles

### Envio gratis
- Minimo 4.000 m2
- Distancia maxima 60 km

### Formas de pago
- 50% sena con orden de compra
- 50% contra entrega
- Metodos: Transferencia, Cheque, Efectivo, eCheq

### Validez de cotizacion
- 7 dias desde la fecha de emision

## APIs Disponibles

### Cotizaciones
- `POST /api/quotes/calculate` - Calcular cotizacion sin guardar
- `GET /api/quotes` - Listar cotizaciones
- `POST /api/quotes` - Crear cotizacion
- `GET /api/quotes/[id]` - Detalle de cotizacion
- `PATCH /api/quotes/[id]` - Actualizar cotizacion
- `POST /api/quotes/[id]/send` - Marcar como enviada
- `POST /api/quotes/[id]/approve` - Aprobar cotizacion
- `POST /api/quotes/[id]/convert` - Convertir a orden

### Clientes
- `GET /api/clients` - Listar clientes
- `POST /api/clients` - Crear cliente
- `GET /api/clients/[id]` - Detalle de cliente
- `PATCH /api/clients/[id]` - Actualizar cliente

### Ordenes
- `GET /api/orders` - Listar ordenes
- `GET /api/orders/[id]` - Detalle de orden
- `PATCH /api/orders/[id]/status` - Cambiar estado
- `PATCH /api/orders/[id]/payment` - Registrar pago

### Cajas
- `GET /api/boxes` - Listar catalogo de cajas
- `POST /api/boxes` - Agregar caja al catalogo

### Configuracion
- `GET /api/config/pricing` - Obtener configuracion de precios
- `POST /api/config/pricing` - Actualizar configuracion

### Reportes
- `GET /api/reports/sales` - Ventas por periodo
- `GET /api/reports/production` - Estado de produccion
- `GET /api/reports/clients` - Top clientes

## Dashboard

El sistema incluye un dashboard administrativo con:

1. **Dashboard Principal** - Metricas y accesos rapidos
2. **Cotizaciones** - Lista, crear, aprobar, convertir
3. **Ordenes** - Lista, kanban, pagos, estados
4. **Clientes** - Lista, crear, historial
5. **Catalogo** - Cajas estandar
6. **Configuracion** - Precios y parametros
7. **Reportes** - Ventas, produccion, clientes

## Deployment

### Vercel

1. Conectar el repositorio a Vercel
2. Configurar las variables de entorno en Vercel
3. Deploy automatico

## Licencia

Proyecto privado para Quilmes Corrugados.
