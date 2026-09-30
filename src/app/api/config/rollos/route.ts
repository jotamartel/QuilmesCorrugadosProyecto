/**
 * API: /api/config/rollos
 * GET - Los precios de los rollos, para el panel (activos e inactivos)
 * PUT - Guarda la lista entera como quedó en el panel
 *
 * Solo con sesión: el proxy ya cierra /api a quien no está logueado, y acá se
 * vuelve a chequear porque la escritura usa la service role (la tabla tiene
 * RLS sin policies), igual que /api/whatsapp/conversations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { leerRollos, validarRollos, guardarRollos, type RolloEntrante } from '@/lib/rollos';

async function haySesion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

export async function GET() {
  if (!(await haySesion())) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  try {
    return NextResponse.json({ rollos: await leerRollos(false) });
  } catch (error) {
    console.error('Error in GET /api/config/rollos:', error);
    return NextResponse.json({ error: 'Error al leer los precios de rollos' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await haySesion())) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  try {
    const body = await request.json();
    const filas: RolloEntrante[] = Array.isArray(body?.rollos) ? body.rollos : [];
    const errores = validarRollos(filas);
    if (errores.length) return NextResponse.json({ error: errores.join(' ') }, { status: 400 });
    return NextResponse.json({ rollos: await guardarRollos(filas) });
  } catch (error) {
    console.error('Error in PUT /api/config/rollos:', error);
    return NextResponse.json({ error: 'Error al guardar los precios de rollos' }, { status: 500 });
  }
}
