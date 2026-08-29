/**
 * /.well-known/mcp — manifest de endpoints MCP (SEP-1960).
 * El Server Card completo está en /.well-known/mcp.json y en
 * /.well-known/mcp/server-card.json.
 */
import { NextResponse } from 'next/server';
import { manifiestoMcp, CABECERAS_WELL_KNOWN } from '@/lib/mcp/manifiestos';

export async function GET() {
  return NextResponse.json(manifiestoMcp(), { headers: CABECERAS_WELL_KNOWN });
}
