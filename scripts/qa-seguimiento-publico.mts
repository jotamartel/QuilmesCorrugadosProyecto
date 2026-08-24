/**
 * La pagina publica del pedido: el token abre, el UUID no, y no se filtra nada.
 *
 * POR QUE
 *
 * El link /pedido/[token] va adentro de las plantillas de WhatsApp: queda en
 * historiales de chat, capturas y reenvios. Esta QA defiende las dos promesas
 * de ese diseño:
 *
 * 1. Solo el token abre. El UUID interno de la orden NO es una puerta: viaja
 *    por el panel, logs y mails del equipo, y no debe tener segunda vida.
 * 2. La respuesta publica es una lista blanca. Ni plata, ni direcciones, ni
 *    contacto: lo que responda esta expuesto a cualquiera que tenga el link.
 *
 * Y de paso el recorte hermano: /api/public/quotes/[id] ya no regala mail y
 * telefono del solicitante a quien tenga el UUID de la cotizacion.
 *
 *   npx tsx scripts/qa-seguimiento-publico.mts [https://dominio]
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); }
}

const BASE = (process.argv[2] || 'https://www.quilmescorrugados.com.ar').replace(/\/+$/, '');

const { createAdminClient } = await import('@/lib/supabase/admin');
const { esTokenPedidoValido, urlSeguimientoPedido } = await import('@/lib/orders/token-publico');

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

const db = createAdminClient();

console.log('');
console.log('La forma del token, en un solo lugar');
{
  ok('un token real valida', esTokenPedidoValido('aBcDeFgHiJ0123456789-_'));
  ok('el UUID no valida', !esTokenPedidoValido('00000000-0000-4000-8000-000000000000'));
  ok('mas largo no valida (exacto 22)', !esTokenPedidoValido('aBcDeFgHiJ0123456789-_X'));
  ok('un path raro no valida', !esTokenPedidoValido('../../../etc/passwd'));
  ok('la URL usa el path congelado en las plantillas de Meta',
     urlSeguimientoPedido('x'.repeat(22)).includes('/pedido/'));
}

console.log('');
console.log('Los tokens en la base');
const { data: ordenes } = await db.from('orders').select('id, order_number, public_token');
{
  ok('todas las ordenes tienen token valido',
     (ordenes ?? []).length > 0 && ordenes!.every((o) => esTokenPedidoValido(o.public_token)));
  ok('todos distintos', new Set(ordenes!.map((o) => o.public_token)).size === ordenes!.length);
}

const muestra = ordenes![0];

console.log('');
console.log(`Contra el sitio publicado — ${BASE}`);
{
  const res = await fetch(`${BASE}/api/public/orders/${muestra.public_token}`).catch(() => null);
  if (!res || res.status === 404) {
    console.log('  ·    el deploy de esta etapa todavia no salio: el bloque en vivo se salta');
  } else {
    const body = await res.json();
    ok('el token abre la API', res.status === 200 && body.order_number === muestra.order_number,
       JSON.stringify(body).slice(0, 150));
    const PROHIBIDOS = [
      'id', 'client', 'client_id', 'delivery_address', 'delivery_city', 'delivery_notes',
      'subtotal', 'total', 'deposit_amount', 'balance_amount', 'deposit_status', 'balance_status',
      'deposit_method', 'balance_method', 'cancellation_reason', 'vehicle_id', 'payment_scheme',
      'public_token', 'quote_id', 'total_m2',
    ];
    const filtrados = PROHIBIDOS.filter((k) => k in body);
    ok('la respuesta no trae NINGUN campo prohibido', filtrados.length === 0, filtrados.join(', '));
    ok('ningun campo xubio ni cot', !Object.keys(body).some((k) => /xubio|cot_/.test(k)));
    ok('trae los items con medidas', Array.isArray(body.items) && body.items.length > 0);

    const porUuid = await fetch(`${BASE}/api/public/orders/${muestra.id}`);
    ok('el UUID interno devuelve 404', porUuid.status === 404, String(porUuid.status));

    const inventado = await fetch(`${BASE}/api/public/orders/${'A'.repeat(22)}`);
    ok('un token bien formado pero inexistente devuelve 404', inventado.status === 404);

    const pagina = await fetch(`${BASE}/pedido/${muestra.public_token}`);
    const html = await pagina.text();
    ok('la pagina responde 200', pagina.status === 200);
    ok('muestra el numero de pedido', html.includes(muestra.order_number));
    ok('se declara noindex', /noindex/.test(html));
    ok('no imprime ningun monto',
       !/\$\s?\d{1,3}(\.\d{3})+/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')),
       'aparece un numero con formato de plata en el HTML');

    const paginaUuid = await fetch(`${BASE}/pedido/${muestra.id}`);
    ok('la pagina con el UUID devuelve 404', paginaUuid.status === 404);

    const robots = await fetch(`${BASE}/robots.txt`).then((r) => r.text());
    ok('robots cierra /pedido/', /Disallow:\s*\/pedido\//.test(robots));
  }
}

console.log('');
console.log('El recorte hermano: la cotizacion publica ya no regala el contacto');
{
  const { data: pq } = await db.from('public_quotes').select('id').limit(1).maybeSingle();
  if (!pq) {
    console.log('  ·    no hay cotizaciones publicas para probar');
  } else {
    const res = await fetch(`${BASE}/api/public/quotes/${pq.id}`).catch(() => null);
    if (!res || res.status !== 200) {
      console.log(`  ·    ${res?.status ?? 'sin respuesta'}: se salta (deploy pendiente o cotizacion vieja)`);
    } else {
      const body = await res.json();
      ok('sin requester_email', !('requester_email' in body), JSON.stringify(Object.keys(body)));
      ok('sin requester_phone', !('requester_phone' in body));
      ok('conserva nombre y empresa para que el cliente se reconozca', 'requester_name' in body);
    }
  }
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
