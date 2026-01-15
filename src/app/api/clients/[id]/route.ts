/**
 * API: /api/clients/[id]
 * GET - Obtiene detalle de un cliente con historial
 * PATCH - Actualiza un cliente
 * DELETE - Elimina un cliente
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/clients/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // Obtener cliente
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (clientError) {
      if (clientError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Cliente no encontrado' },
          { status: 404 }
        );
      }
      throw clientError;
    }

    // Obtener cotizaciones del cliente
    const { data: quotes } = await supabase
      .from('quotes')
      .select('id, quote_number, status, total, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Obtener órdenes del cliente
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, status, total, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Obtener comunicaciones del cliente
    const { data: communications } = await supabase
      .from('communications')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Estadísticas
    const { data: stats } = await supabase
      .from('orders')
      .select('total, total_m2')
      .eq('client_id', id)
      .in('status', ['delivered', 'shipped', 'ready', 'in_production', 'confirmed']);

    const totalOrders = stats?.length || 0;
    const totalRevenue = stats?.reduce((sum, o) => sum + Number(o.total), 0) || 0;
    const totalM2 = stats?.reduce((sum, o) => sum + Number(o.total_m2), 0) || 0;

    return NextResponse.json({
      ...client,
      quotes: quotes || [],
      orders: orders || [],
      communications: communications || [],
      statistics: {
        total_orders: totalOrders,
        total_revenue: totalRevenue,
        total_m2: totalM2,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/clients/[id]:', error);
    return NextResponse.json(
      { error: 'Error al obtener el cliente' },
      { status: 500 }
    );
  }
}

// PATCH /api/clients/[id]
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    // Verificar que el cliente existe
    const { data: existing, error: existingError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: 'Cliente no encontrado' },
        { status: 404 }
      );
    }

    // Campos permitidos para actualizar
    const allowedFields = [
      'name',
      'company',
      'cuit',
      'email',
      'phone',
      'whatsapp',
      'address',
      'city',
      'province',
      'postal_code',
      'distance_km',
      'payment_terms',
      'is_recurring',
      'notes',
      // Campos de integración
      'tax_condition',
      'has_credit',
      'credit_days',
      'credit_limit',
      'credit_notes',
    ];

    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        // Limpiar datos según el campo
        if (field === 'name') {
          // Name es requerido, no puede ser null
          const trimmedName = body[field]?.trim();
          if (trimmedName) {
            updateData[field] = trimmedName;
          }
        } else if (field === 'company' || field === 'address' || field === 'city' || field === 'notes' || field === 'credit_notes') {
          updateData[field] = body[field]?.trim() || null;
        } else if (field === 'email') {
          updateData[field] = body[field]?.toLowerCase().trim() || null;
        } else if (field === 'cuit' || field === 'whatsapp') {
          updateData[field] = body[field]?.replace(/\D/g, '') || null;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    // Si no hay datos para actualizar, retornar el cliente existente
    if (Object.keys(updateData).length === 0) {
      const { data: currentClient } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single();
      return NextResponse.json(currentClient);
    }

    // Verificar CUIT único si se está actualizando
    if (updateData.cuit) {
      const { data: existingCuit } = await supabase
        .from('clients')
        .select('id')
        .eq('cuit', updateData.cuit)
        .neq('id', id)
        .single();

      if (existingCuit) {
        return NextResponse.json(
          { error: 'Ya existe otro cliente con ese CUIT' },
          { status: 400 }
        );
      }
    }

    const { data: client, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase update error:', error);
      console.error('Update data was:', updateData);
      throw error;
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error('Error in PATCH /api/clients/[id]:', error);
    return NextResponse.json(
      { error: 'Error al actualizar el cliente' },
      { status: 500 }
    );
  }
}

// DELETE /api/clients/[id]
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // Verificar que el cliente existe
    const { data: existing, error: existingError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: 'Cliente no encontrado' },
        { status: 404 }
      );
    }

    // Verificar que no tiene órdenes activas
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id')
      .eq('client_id', id)
      .in('status', ['pending_deposit', 'confirmed', 'in_production', 'ready', 'shipped'])
      .limit(1);

    if (activeOrders && activeOrders.length > 0) {
      return NextResponse.json(
        { error: 'No se puede eliminar un cliente con órdenes activas' },
        { status: 400 }
      );
    }

    // Eliminar cliente
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/clients/[id]:', error);
    return NextResponse.json(
      { error: 'Error al eliminar el cliente' },
      { status: 500 }
    );
  }
}
