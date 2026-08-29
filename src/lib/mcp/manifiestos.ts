/**
 * Los documentos de descubrimiento del servidor MCP.
 *
 * Dos formatos porque hay dos propuestas activas en la spec y los clientes se
 * reparten entre ambas: el Server Card de SEP-1649 (se sirve en
 * /.well-known/mcp.json y en /.well-known/mcp/server-card.json) y el manifest
 * de SEP-1960 (/.well-known/mcp). Publicar los dos cuesta dos rutas de diez
 * líneas y evita apostar a cuál gana.
 *
 * Son documentos públicos: nada de claves ni datos operativos.
 */

import { SITE_URL } from '@/lib/site';
import { HERRAMIENTAS, VERSION_POR_DEFECTO } from '@/lib/mcp/definicion';

/** Server Card (SEP-1649). El protocolVersion es el mismo que negocia el server. */
export function serverCard() {
  return {
    $schema: 'https://modelcontextprotocol.io/schemas/server-card/v1.0',
    version: '1.0',
    protocolVersion: VERSION_POR_DEFECTO,
    serverInfo: {
      name: 'Quilmes Corrugados',
      version: '1.0.0',
      description:
        'Cotización de cajas de cartón corrugado a medida en Argentina: precio real por ' +
        'medidas y cantidad, plantilla de impresión en PDF y condiciones comerciales ' +
        'vigentes. Sin autenticación.',
      homepage: SITE_URL,
    },
    transport: {
      type: 'streamable-http',
      url: `${SITE_URL}/api/mcp`,
    },
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
    },
    tools: HERRAMIENTAS.map((h) => ({ name: h.name, description: h.description })),
  };
}

/** Manifest liviano (SEP-1960): enumeración de endpoints. Sin auth: no hay. */
export function manifiestoMcp() {
  return {
    mcp_version: VERSION_POR_DEFECTO,
    endpoints: [
      {
        url: `${SITE_URL}/api/mcp`,
        transport: 'streamable-http',
        capabilities: ['tools'],
      },
    ],
  };
}

/** Cabeceras que piden las guías de .well-known: JSON, nosniff, cacheable, CORS. */
export const CABECERAS_WELL_KNOWN = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'public, max-age=3600, s-maxage=3600',
  'Access-Control-Allow-Origin': '*',
} as const;
