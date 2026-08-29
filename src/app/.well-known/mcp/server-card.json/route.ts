/**
 * /.well-known/mcp/server-card.json — el mismo Server Card que
 * /.well-known/mcp.json, en la otra ruta que propone SEP-1649: los clientes
 * se reparten entre las dos y servir ambas cuesta estas líneas.
 */
import { NextResponse } from 'next/server';
import { serverCard, CABECERAS_WELL_KNOWN } from '@/lib/mcp/manifiestos';

export async function GET() {
  return NextResponse.json(serverCard(), { headers: CABECERAS_WELL_KNOWN });
}
