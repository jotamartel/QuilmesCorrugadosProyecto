import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

/**
 * Compuerta de acceso del sitio.
 *
 * SOBRE EL NOMBRE Y LA UBICACION DEL ARCHIVO
 *
 * Next 16 renombro `middleware` a `proxy`: el archivo tiene que llamarse
 * proxy.ts y exportar una funcion `proxy`. Y como `app` vive adentro de src/,
 * este archivo va en src/, no en la raiz.
 *
 * Vale la pena decirlo porque el modo de falla es silencioso: con el nombre o
 * la ubicacion equivocados Next no avisa nada, simplemente no lo ejecuta, y
 * todo sigue respondiendo 200 como si la compuerta no existiera. Se descubrio
 * porque scripts/verificar-acceso.mjs siguio marcando las mismas 27 rutas
 * abiertas despues de "protegerlas".
 *
 * POR QUE EXISTE
 *
 * El proyecto no tenía middleware, así que la autenticación era opt-in: cada
 * ruta tenía que acordarse de pedirla. Una auditoría de las 90 rutas de API
 * encontró que 69 no lo hacían, y que ninguna de las 36 páginas del dashboard
 * lo hacía tampoco. Verificado contra producción, sin ninguna credencial:
 *
 *   GET /api/retail-sales        200 — 98 KB, ~50 compras con datos personales
 *   GET /api/reports/sales       200 — reportes de facturación
 *   GET /api/config/pricing      200 — la configuración de precios
 *   GET /api/costs/profitability 200 — rentabilidad
 *
 * El RLS de la migración 020 no las cubre: estas rutas usan el service role,
 * que saltea RLS por diseño. Esa es justamente su función.
 *
 * Arreglarlo ruta por ruta deja el mismo agujero abierto para la ruta 70. Acá
 * se invierte la regla: todo pide sesión salvo lo que esté declarado abajo.
 * Una ruta nueva nace protegida, y para abrirla hay que escribirlo y que
 * alguien lo lea en el diff.
 *
 * COMO SE COMPRUEBA
 *
 *   node scripts/verificar-acceso.mjs https://www.quilmescorrugados.com.ar
 */

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se sirve sin sesión, y con qué métodos.
//
// `metodos` ausente = todos. Declararlos importa: hay rutas donde leer es
// público pero escribir no.
// ─────────────────────────────────────────────────────────────────────────────
const PUBLICO: Array<{ patron: RegExp; metodos?: string[]; nota: string }> = [
  // El sitio público y su cotizador.
  { patron: /^\/api\/public\//, nota: 'las llama el cotizador del sitio' },
  { patron: /^\/api\/v1\//, nota: 'API de cotización, pública a propósito' },
  { patron: /^\/api\/box-template/, nota: 'troquel, publicado para asistentes de IA' },

  // Leer el precio es público —lo necesita el cotizador—; escribirlo no.
  // Este es el motivo por el que la lista distingue métodos: sin eso,
  // cualquiera podía cambiar la escalera de precios con un POST.
  { patron: /^\/api\/config\/pricing$/, metodos: ['GET'], nota: 'el cotizador lee precios' },

  // El adjuntador de diseños del cotizador público. La ruta valida tipo y
  // tamaño por su cuenta.
  { patron: /^\/api\/upload$/, metodos: ['POST'], nota: 'adjuntar diseño al cotizar' },

  // Telemetría del navegador de cualquier visitante.
  { patron: /^\/api\/traffic\/track$/, metodos: ['POST'], nota: 'medición de visitas' },
  { patron: /^\/api\/marketing\/evento$/, metodos: ['POST'], nota: 'espejo del pixel' },

  // El flujo de login, que por definición corre sin sesión.
  { patron: /^\/api\/auth\//, nota: 'login' },

  // Webhooks. Los llama un tercero: no hay sesión posible y una compuerta acá
  // los rompería. Cada uno tiene que validar su propia firma o su token, que
  // es un trabajo aparte de este archivo.
  { patron: /^\/api\/webhooks\/mercadopago$/, nota: 'webhook: valida firma HMAC' },
  { patron: /^\/api\/whatsapp\/webhook$/, nota: 'webhook: valida firma de Twilio' },
  { patron: /^\/api\/telegram\/webhook$/, nota: 'webhook: valida secret token' },
  { patron: /^\/api\/retell\//, nota: 'agente de voz, con su propia API key' },
  { patron: /^\/api\/email\/inbound$/, nota: 'correo entrante, con API key' },
];

/** Páginas del dashboard. Todo lo que cuelgue de acá pide sesión. */
const PAGINAS_PRIVADAS = [
  '/inicio', '/clientes', '/cotizaciones', '/cotizaciones-web', '/ordenes',
  '/pagos', '/cheques', '/costos', '/reportes', '/configuracion', '/catalogo',
  '/funnels', '/leads-web', '/trafico', '/ventas-retail', '/whatsapp',
  '/api-keys', '/api-stats',
];

function necesitaSesion(pathname: string, metodo: string): boolean {
  if (pathname.startsWith('/api/')) {
    const abierta = PUBLICO.some(
      (r) => r.patron.test(pathname) && (!r.metodos || r.metodos.includes(metodo)),
    );
    return !abierta;
  }
  return PAGINAS_PRIVADAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// ─────────────────────────────────────────────────────────────────────────────
// Caché de la lista de autorizados.
//
// Validar la sesión ya cuesta una ida a Supabase; consultar authorized_users en
// cada request costaría una segunda. Como la lista cambia muy de vez en cuando
// y son un puñado de personas, se guarda por un minuto en la instancia caliente.
// El costo de la demora es que dar de baja a alguien tarda hasta 60 segundos en
// aplicarse, lo cual es aceptable; adelantarlo sería sacar esta caché.
// ─────────────────────────────────────────────────────────────────────────────
let cacheEmails: { valores: Set<string>; vence: number } | null = null;
const TTL_MS = 60_000;

async function estaAutorizado(email: string, ahora: number): Promise<boolean> {
  if (cacheEmails && cacheEmails.vence > ahora) {
    return cacheEmails.valores.has(email);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await admin.from('authorized_users').select('email');

  if (error || !data) {
    // Ante un error de lectura no se abre la puerta. Si la caché anterior
    // todavía existe se usa aunque esté vencida —mejor un dato de hace un
    // minuto que dejar el dashboard inaccesible por un hipo de red—, y si no
    // hay nada, se niega.
    console.error('[middleware] no se pudo leer authorized_users:', error?.message);
    return cacheEmails ? cacheEmails.valores.has(email) : false;
  }

  cacheEmails = {
    valores: new Set(data.map((f) => String(f.email).toLowerCase())),
    vence: ahora + TTL_MS,
  };
  return cacheEmails.valores.has(email);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Salir antes de tocar Supabase en todo lo que es público: si no, cada
  // visita al sitio pagaría una ida de red que no necesita.
  if (!necesitaSesion(pathname, request.method)) {
    return NextResponse.next();
  }

  const respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          ),
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();

  // Estar logueado no alcanza: con Google OAuth abierto, cualquiera puede
  // crearse una sesión. La lista de authorized_users es la puerta real.
  const pasa = !!email && (await estaAutorizado(email, Date.now()));

  if (!pasa) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: email ? 'Usuario no autorizado' : 'Necesitás iniciar sesión' },
        { status: email ? 403 : 401 },
      );
    }
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = `?volver=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(login);
  }

  return respuesta;
}

export const config = {
  // Se excluyen los assets estáticos para no correr esto en cada imagen.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|txt|xml|json)$).*)',
  ],
};
