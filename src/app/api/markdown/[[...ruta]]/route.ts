/**
 * La cara markdown del sitio (acceptmarkdown.com).
 *
 * Nadie navega hasta acá: src/proxy.ts reescribe a esta ruta cuando una página
 * pública recibe `Accept: text/markdown`, así que para el cliente la URL sigue
 * siendo la de la página. El contenido vive en lib/agentes/markdown-paginas.
 *
 * Una ruta sin versión markdown devuelve 404 CON cuerpo markdown y links para
 * seguir: es también el 404 que ve un agente que negocia markdown contra
 * cualquier path inexistente del sitio.
 */

import { NextRequest, NextResponse } from 'next/server';
import { paginaMarkdown, markdown404 } from '@/lib/agentes/markdown-paginas';

const CABECERAS = {
  'Content-Type': 'text/markdown; charset=utf-8',
  // La misma URL sirve dos formatos: sin Vary, un CDN puede cachear uno y
  // servírselo a quien pidió el otro.
  Vary: 'Accept',
  'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Origin': '*',
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ruta?: string[] }> },
) {
  const { ruta } = await params;
  const path = '/' + (ruta ?? []).join('/');

  const markdown = paginaMarkdown(path);
  if (markdown !== null) {
    return new NextResponse(markdown, {
      headers: { ...CABECERAS, 'Cache-Control': 'public, max-age=300, s-maxage=300' },
    });
  }

  return new NextResponse(markdown404(path), {
    status: 404,
    headers: { ...CABECERAS, 'Cache-Control': 'no-store' },
  });
}
