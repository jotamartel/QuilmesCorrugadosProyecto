/**
 * Una fila incompleta no puede voltear una pantalla entera.
 *
 * POR QUE
 *
 * El 25/08/2026 /cotizaciones-web dejó de renderizar: "Application error: a
 * client-side exception". La causa era una línea,
 * `quote.total_sqm.toLocaleString()`, sobre tres filas de sesenta que el
 * asistente de WhatsApp había guardado sin medidas ni precios. React no
 * renderiza a medias: una excepción en el map y no queda nada en pantalla.
 *
 * Lo que lo hizo posible no fue el null: fue que el TIPO MENTIA. PublicQuote
 * declaraba `total_sqm: number`, `quantity: number`, `subtotal: number` —todos
 * no nulables— cuando `guardar_lead` inserta filas sin ninguno de ellos.
 * Con el tipo diciendo que eran seguros, nadie los guardó, y el compilador no
 * tenía nada que marcar. Al corregir el tipo aparecieron 28 errores en SIETE
 * pantallas: la misma bomba estaba puesta en todas.
 *
 * LAS TRES PROMESAS QUE ESTA QA DEFIENDE
 *
 *   1. El tipo sigue diciendo la verdad. Si alguien vuelve a poner
 *      `total_sqm: number` para sacarse un error de encima, esto lo agarra.
 *   2. Los formateadores aguantan un null y devuelven una raya. Un monto que
 *      no existe NO es "$ 0,00": eso en pantalla dice que salió gratis.
 *   3. Ninguna pantalla toca un campo nulable sin protegerlo.
 *
 *   npx tsx scripts/qa-cotizaciones-incompletas.mts
 */
import * as dotenv from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const { formatCurrency, formatM2 } = await import('@/lib/utils/pricing');
const { formatBoxDimensions } = await import('@/lib/utils/format');
const { createAdminClient } = await import('@/lib/supabase/admin');

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

const lee = (f: string) => readFileSync(f, 'utf8');

/** Los campos que `guardar_lead` deja vacíos y que por lo tanto pueden ser null. */
const NULABLES = [
  'length_mm', 'width_mm', 'height_mm', 'quantity',
  'sheet_width_mm', 'sheet_length_mm', 'sqm_per_box', 'total_sqm',
  'price_per_m2', 'unit_price', 'subtotal', 'estimated_days',
];

console.log('');
console.log('El tipo dice la verdad sobre lo que puede faltar');
{
  const tipos = lee('src/lib/types/database.ts');
  const bloque = tipos.slice(tipos.indexOf('export interface PublicQuote '));
  const cuerpo = bloque.slice(0, bloque.indexOf('\n}'));

  const mienten = NULABLES.filter((campo) => {
    const m = cuerpo.match(new RegExp(`^\\s*${campo}:\\s*([^;]+);`, 'm'));
    return m ? !/null/.test(m[1]) : false;
  });
  ok('PublicQuote declara nulable todo lo que el asistente deja vacío',
     mienten.length === 0,
     `estos dicen que nunca son null y sí lo son: ${mienten.join(', ')}`);
}

console.log('');
console.log('Los formateadores aguantan que no haya dato');
{
  ok('formatCurrency(null) no explota y no dice cero',
     formatCurrency(null) === '—', formatCurrency(null));
  ok('formatCurrency(undefined) tampoco', formatCurrency(undefined) === '—');
  ok('formatCurrency(NaN) tampoco', formatCurrency(NaN) === '—', formatCurrency(NaN));
  // El cero SI es un importe: envío gratis, descuento total. No es lo mismo.
  ok('pero el cero de verdad se sigue mostrando como cero',
     /0,00/.test(formatCurrency(0)), formatCurrency(0));
  // Ojo con el espacio: Intl mete un espacio DURO (U+00A0) entre el signo y el
  // número, no uno normal. Compararlo contra un literal tipeado a mano falla
  // por un carácter invisible.
  ok('y un monto normal no cambió',
     formatCurrency(1213197.18).replace(/\s/g, ' ') === '$ 1.213.197,18',
     formatCurrency(1213197.18));

  ok('formatM2(null) da raya', formatM2(null) === '—');
  ok('formatM2(0) sigue siendo cero', /0,00/.test(formatM2(0)), formatM2(0));

  ok('formatBoxDimensions sin medidas lo dice',
     formatBoxDimensions(null, null, null) === 'Sin medidas', formatBoxDimensions(null, null, null));
  ok('con una sola faltando tambien',
     formatBoxDimensions(400, null, 200) === 'Sin medidas', formatBoxDimensions(400, null, 200));
  ok('y con las tres formatea igual que antes',
     formatBoxDimensions(400, 300, 200) === '400 x 300 x 200 mm', formatBoxDimensions(400, 300, 200));
}

console.log('');
console.log('Ninguna pantalla toca un campo nulable a pelo');
{
  // Las siete que rompieron. Se buscan los accesos directos —.toLocaleString,
  // .toFixed, aritmetica— sin ?. ni guarda previa.
  const PANTALLAS = [
    'src/app/(dashboard)/cotizaciones-web/page.tsx',
    'src/app/(dashboard)/cotizaciones-web/[id]/page.tsx',
    'src/app/(dashboard)/cotizaciones/page.tsx',
    'src/app/(dashboard)/leads-web/page.tsx',
    'src/app/(dashboard)/leads-web/below-minimum/page.tsx',
    'src/app/(dashboard)/ventas-retail/page.tsx',
    'src/app/(dashboard)/ventas-retail/[id]/page.tsx',
  ];

  const sospechosos: string[] = [];
  for (const p of PANTALLAS) {
    const src = lee(p);
    const lineas = src.split('\n');
    lineas.forEach((linea, i) => {
      for (const campo of NULABLES) {
        const directo = new RegExp(`\\.${campo}\\.(toLocaleString|toFixed|toString)\\b`);
        if (!directo.test(linea)) continue;

        // Un acceso directo no es un bug si arriba hay una guarda. Se miran
        // esta linea y las cuatro anteriores, porque el ternario que protege
        // suele abrir un par de renglones antes:
        //
        //   quote.total_sqm != null
        //     ? `${quote.total_sqm.toFixed(2)} m²`
        //     : '—'
        //
        // Sin esto la QA marca codigo correcto, y una QA que grita en falso
        // se termina ignorando — que es peor que no tenerla.
        const contexto = lineas.slice(Math.max(0, i - 4), i + 1).join('\n');
        const protegido = new RegExp(
          `${campo}\\s*(!=|!==)\\s*null` +      // campo != null
          `|${campo}\\s*\\?\\.` +               // campo?.
          `|${campo}\\s*&&` +                   // campo && ...
          `|\\b${campo}\\s*\\?[^.]` +           // campo ? ... (ternario)
          `|typeof\\s+[\\w.]*${campo}`,         // typeof x.campo === 'number'
        ).test(contexto);

        if (!protegido) sospechosos.push(`${p}:${i + 1}  ${linea.trim().slice(0, 80)}`);
      }
    });
  }
  ok('ningun acceso directo a un campo que puede faltar',
     sospechosos.length === 0, sospechosos.join('\n        '));
}

console.log('');
console.log('Y el caso real: las filas incompletas que hay en la base');
{
  const db = createAdminClient();
  const { data, error } = await db.from('public_quotes').select('*').limit(200);
  ok('se pudo leer public_quotes', !error, error?.message);

  const incompletas = (data ?? []).filter((q) =>
    NULABLES.some((c) => (q as Record<string, unknown>)[c] === null));

  console.log(`  (${incompletas.length} de ${data?.length} filas tienen algun campo vacio)`);

  // No se afirma que haya cero: las hay a proposito, son leads sin medidas.
  // Se afirma que renderizarlas no tira, que es lo que fallaba.
  let exploto: string | null = null;
  for (const q of incompletas) {
    const r = q as Record<string, number | null>;
    try {
      formatCurrency(r.subtotal);
      formatM2(r.total_sqm);
      formatBoxDimensions(r.length_mm, r.width_mm, r.height_mm);
      // Los dos accesos exactos que volteaban la tabla.
      void (r.quantity?.toLocaleString('es-AR') ?? '—');
      void (r.total_sqm?.toLocaleString('es-AR', { minimumFractionDigits: 0 }) ?? '—');
    } catch (e) {
      exploto = `${(q as Record<string, unknown>).quote_number}: ${String(e)}`;
      break;
    }
  }
  ok('formatear cada fila incompleta de la base no tira', exploto === null, exploto ?? '');
}

console.log('');
console.log('Y de raíz: el asistente ya no guarda la cotización a medias');
{
  // Los nulls tienen que seguir siendo posibles —un lead sin medidas es un
  // lead válido— pero cuando SI hay medidas, los números tienen que estar.
  // Antes el precio existía solo como texto adentro de `message` y el vendedor
  // tenía que recotizar a mano con la conversación al lado.
  const db = createAdminClient();
  const TEL = '+5491100000000'; // imposible de verdad: 11 0000-0000 no se asigna
  const { crearHerramientas } = await import('@/lib/agente/herramientas');
  type Tool = { name: string; run: (a: Record<string, unknown>) => Promise<string> };
  const guardar = (crearHerramientas({ canal: 'whatsapp', telefono: TEL }) as Tool[])
    .find((t) => t.name === 'guardar_lead')!;

  try {
    await guardar.run({
      resumen: 'QA de cotizaciones incompletas',
      largo_mm: 1470, ancho_mm: 210, alto_mm: 780, cantidad: 297,
    });
    const { data } = await db.from('public_quotes').select('*')
      .eq('requester_phone', TEL).order('created_at', { ascending: false }).limit(1);
    const q = data?.[0] as Record<string, number | null> | undefined;

    ok('guardó la consulta', !!q);
    if (q) {
      const vacios = ['total_sqm', 'sqm_per_box', 'price_per_m2', 'unit_price', 'subtotal', 'estimated_days']
        .filter((c) => q[c] === null);
      ok('con los m² y los precios ya calculados', vacios.length === 0,
         `siguen vacíos: ${vacios.join(', ')}`);
      // Que el número sea el MISMO que el motor le dijo al cliente, no otro.
      ok('y el subtotal coincide con el del motor',
         Math.abs(Number(q.subtotal) - 1002642.3) < 1, String(q.subtotal));
    }

    // Un lead sin medidas se sigue guardando, y sigue teniendo nulls. Eso NO
    // es un bug: es el caso que las guardas de arriba contemplan.
    await guardar.run({ resumen: 'QA sin medidas' });
    const { data: d2 } = await db.from('public_quotes').select('quantity, total_sqm')
      .eq('requester_phone', TEL).order('created_at', { ascending: false }).limit(1);
    ok('y el lead sin medidas se sigue guardando (con nulls, a propósito)', !!d2?.[0]);
  } finally {
    const { data: aBorrar } = await db.from('public_quotes').select('id').eq('requester_phone', TEL);
    for (const f of aBorrar ?? []) await db.from('public_quotes').delete().eq('id', f.id);
    await db.from('contact_profiles').delete().eq('phone_number', TEL);
    console.log(`  (limpieza: ${aBorrar?.length ?? 0} fila(s) de prueba borradas)`);
  }
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
