/**
 * GET /api/public/bank-data — los datos para transferir, publicos.
 *
 * PUBLICO A PROPOSITO: un dato bancario existe para dárselo a cualquiera que
 * vaya a transferir; Fernando lo pega en cualquier chat de WhatsApp de todas
 * formas. Lo que NO se expone es el resto de system_config: el SELECT de la
 * config vive en getBankDataForClient(), que devuelve exactamente cinco
 * campos o null.
 *
 * Con la config incompleta responde { available: false } y la pagina de la
 * cotizacion cae a su texto anterior — nunca "CBU: undefined".
 *
 * Cae en la lista PUBLICO de src/proxy.ts por el prefijo /api/public/.
 */
import { NextResponse } from 'next/server';
import { getBankDataForClient } from '@/lib/config/system';

export const dynamic = 'force-dynamic';

export async function GET() {
  const datos = await getBankDataForClient();

  const respuesta = datos
    ? NextResponse.json({
        available: true,
        alias: datos.alias,
        cbu: datos.cbu,
        holder: datos.holder,
        cuit: datos.cuit,
        bank: datos.bank,
      })
    : NextResponse.json({ available: false });

  // La pagina de cotizacion la pide en cada view: un minuto de cache le
  // ahorra la ida a la base sin retrasar de forma visible un cambio de alias.
  respuesta.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  return respuesta;
}
