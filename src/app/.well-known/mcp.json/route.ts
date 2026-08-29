/**
 * /.well-known/mcp.json — Server Card del servidor MCP (SEP-1649).
 * El documento se arma en lib/mcp/manifiestos, compartido con las otras rutas
 * de descubrimiento.
 */
import { NextResponse } from 'next/server';
import { serverCard, CABECERAS_WELL_KNOWN } from '@/lib/mcp/manifiestos';

export async function GET() {
  return NextResponse.json(serverCard(), { headers: CABECERAS_WELL_KNOWN });
}
