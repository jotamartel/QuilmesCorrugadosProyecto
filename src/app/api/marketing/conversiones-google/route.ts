/**
 * GET /api/marketing/conversiones-google
 *
 * Exporta las ventas cerradas en el formato de importación de conversiones
 * offline de Google Ads.
 *
 * Existe por una razón práctica: la API de Google Ads necesita OAuth, un
 * developer token y aprobación de Google, que es un trámite. El CSV se sube
 * desde el panel y funciona hoy, sin ninguna credencial. Cuando el volumen
 * justifique automatizarlo, se cambia el transporte y el cálculo ya está.
 *
 * Cómo usarlo:
 *   1. Bajar el archivo
 *   2. Google Ads → Objetivos → Conversiones → Importaciones → Subir archivo
 *   3. La conversión tiene que existir antes, creada como "Importar > Desde
 *      clics" con el mismo nombre que sale en la columna Conversion Name
 *
 * Parámetros:
 *   desde  yyyy-mm-dd  — por defecto, los últimos 90 días
 *   hasta  yyyy-mm-dd
 *   nombre — nombre de la conversión en Google Ads (default "Venta cerrada")
 *
 * Google Ads sólo acepta conversiones de clics de los últimos 90 días, así que
 * el default coincide con esa ventana.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verificarAdmin } from '@/lib/auth/require-admin';
import { construirCsvGoogleAds, fechaGoogleAds, type FilaGoogleAds } from '@/lib/marketing/conversiones';

const DIAS_POR_DEFECTO = 90;

export async function GET(request: NextRequest) {
  // El archivo lleva montos de ventas, datos de campaña e identificadores de
  // clic: es información interna y va detrás de sesión.
  const auth = await verificarAdmin();
  if (!auth.autorizado) {
    return NextResponse.json(
      { error: 'Necesitás iniciar sesión en el dashboard para descargar este archivo.' },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const nombreConversion = searchParams.get('nombre')?.trim() || 'Venta cerrada';

  const hasta = searchParams.get('hasta')
    ? new Date(`${searchParams.get('hasta')}T23:59:59`)
    : new Date();
  const desde = searchParams.get('desde')
    ? new Date(`${searchParams.get('desde')}T00:00:00`)
    : new Date(Date.now() - DIAS_POR_DEFECTO * 86400000);

  try {
    const supabase = createAdminClient();

    // Sólo las que tienen gclid: sin el identificador de clic, Google no puede
    // atribuir la venta a ningún anuncio y rechaza la fila.
    const { data, error } = await supabase
      .from('public_quotes')
      .select('quote_number, gclid, subtotal, converted_at, updated_at, created_at, utm_campaign')
      .eq('status', 'converted')
      .not('gclid', 'is', null)
      .gte('created_at', desde.toISOString())
      .lte('created_at', hasta.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[conversiones-google] error consultando:', error);
      return NextResponse.json({ error: 'Error al generar el archivo' }, { status: 500 });
    }

    const filas: FilaGoogleAds[] = (data || []).map((q) => ({
      gclid: q.gclid as string,
      nombreConversion,
      // Google quiere cuándo ocurrió la conversión, no cuándo se cotizó.
      fecha: fechaGoogleAds(new Date(q.converted_at || q.updated_at || q.created_at)),
      valor: Number(q.subtotal) || 0,
      moneda: 'ARS',
    }));

    const csv = construirCsvGoogleAds(filas);
    const nombreArchivo = `conversiones-google-${desde.toISOString().slice(0, 10)}-a-${hasta.toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
        // Cuántas filas salieron, para poder chequearlo sin abrir el archivo.
        'X-Conversiones-Exportadas': String(filas.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[conversiones-google] error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
