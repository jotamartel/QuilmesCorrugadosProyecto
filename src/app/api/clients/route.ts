/**
 * API: /api/clients
 * GET - Lista clientes
 * POST - Crea un nuevo cliente
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CreateClientRequest } from '@/lib/types/database';

// GET /api/clients - Lista clientes
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    // Parámetros
    const search = searchParams.get('search');
    const isRecurring = searchParams.get('is_recurring');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Construir query
    let query = supabase
      .from('clients')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    // Búsqueda por nombre, empresa o CUIT
    if (search) {
      query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%,cuit.ilike.%${search}%`);
    }

    // Filtro por cliente recurrente
    if (isRecurring !== null) {
      query = query.eq('is_recurring', isRecurring === 'true');
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching clients:', error);
      return NextResponse.json(
        { error: 'Error al obtener clientes' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data,
      pagination: {
        total: count,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/clients:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// POST /api/clients - Crear cliente
export async function POST(request: NextRequest) {
  try {
    const body: CreateClientRequest = await request.json();

    // Validar campos requeridos
    if (!body.name || body.name.trim() === '') {
      return NextResponse.json(
        { error: 'El nombre es requerido' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verificar si ya existe un cliente con el mismo CUIT
    if (body.cuit) {
      const { data: existing } = await supabase
        .from('clients')
        .select('id')
        .eq('cuit', body.cuit)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: 'Ya existe un cliente con ese CUIT' },
          { status: 400 }
        );
      }
    }

    // Crear cliente
    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        name: body.name.trim(),
        company: body.company?.trim() || null,
        cuit: body.cuit?.replace(/\D/g, '') || null,
        email: body.email?.toLowerCase().trim() || null,
        phone: body.phone?.trim() || null,
        whatsapp: body.whatsapp?.replace(/\D/g, '') || null,
        address: body.address?.trim() || null,
        city: body.city?.trim() || null,
        province: body.province || 'Buenos Aires',
        distance_km: body.distance_km || null,
        payment_terms: body.payment_terms || 'contado',
        is_recurring: body.is_recurring || false,
        notes: body.notes?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating client:', error);
      return NextResponse.json(
        { error: 'Error al crear el cliente' },
        { status: 500 }
      );
    }

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/clients:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
