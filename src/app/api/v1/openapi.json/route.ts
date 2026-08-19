import { NextResponse } from 'next/server';
import base from '@/lib/openapi-base.json';
import { SITE_URL } from '@/lib/site';

/**
 * La especificación OpenAPI, con el dominio puesto en tiempo de respuesta.
 *
 * Vivía como archivo estático en public/api/v1/openapi.json, lo que ademas de
 * congelarla hacia que pisara cualquier ruta dinamica. Quedo con todas las
 * URLs en quilmes-corrugados.vercel.app: el servidor de produccion, la base de
 * la API, los terminos y el link a la documentacion. Quien integraba leyendo
 * la spec apuntaba al dominio equivocado.
 *
 * Ahora el JSON vive en src/lib y las direcciones salen de SITE_URL, que es la
 * misma constante que usa todo el resto. Un cambio de dominio deja de ser una
 * cacería de archivos.
 */
export const dynamic = 'force-dynamic';

const VIEJO = 'https://quilmes-corrugados.vercel.app';

export async function GET() {
  const spec = JSON.parse(
    JSON.stringify(base).split(VIEJO).join(SITE_URL),
  );

  // El estatico apuntaba a /terms, que nunca existio. La pagina real es
  // /terminos, publicada el 19/08/2026.
  if (spec.info?.termsOfService) spec.info.termsOfService = `${SITE_URL}/terminos`;
  if (spec.info?.license?.url) spec.info.license.url = `${SITE_URL}/terminos`;

  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
