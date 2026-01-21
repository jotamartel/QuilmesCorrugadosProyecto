import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';

// Generar API key segura
function generateApiKey(): string {
  // Formato: qc_live_xxxxxxxxxxxxxxxxxxxxx (32 caracteres aleatorios)
  const randomBytes = crypto.randomBytes(24);
  return `qc_live_${randomBytes.toString('base64url')}`;
}

// Hash SHA-256 del API key
function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// GET: Listar todas las API keys
export async function GET() {
  const supabase = createAdminClient();

  try {
    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // No devolver el hash completo por seguridad
    const safeKeys = keys.map(key => ({
      id: key.id,
      key_prefix: key.key_prefix,
      name: key.name,
      owner_email: key.owner_email,
      owner_company: key.owner_company,
      rate_limit_per_minute: key.rate_limit_per_minute,
      rate_limit_per_day: key.rate_limit_per_day,
      is_active: key.is_active,
      created_at: key.created_at,
      last_used_at: key.last_used_at,
      expires_at: key.expires_at,
    }));

    return NextResponse.json({ keys: safeKeys });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    return NextResponse.json(
      { error: 'Error al obtener API keys' },
      { status: 500 }
    );
  }
}

// POST: Crear nueva API key
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const { name, owner_email, owner_company, rate_limit_per_minute, rate_limit_per_day, expires_at } = body;

    if (!name || name.trim().length < 3) {
      return NextResponse.json(
        { error: 'El nombre debe tener al menos 3 caracteres' },
        { status: 400 }
      );
    }

    // Generar nueva key
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const keyPrefix = apiKey.substring(0, 12) + '...';

    // Insertar en la base de datos
    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        key_hash: keyHash,
        key_prefix: keyPrefix,
        name: name.trim(),
        owner_email: owner_email?.trim() || null,
        owner_company: owner_company?.trim() || null,
        rate_limit_per_minute: rate_limit_per_minute || 100,
        rate_limit_per_day: rate_limit_per_day || 10000,
        expires_at: expires_at || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Devolver la key completa SOLO en la creación
    return NextResponse.json({
      success: true,
      api_key: apiKey, // Solo se muestra una vez!
      key_data: {
        id: data.id,
        key_prefix: keyPrefix,
        name: data.name,
        owner_email: data.owner_email,
        owner_company: data.owner_company,
        rate_limit_per_minute: data.rate_limit_per_minute,
        rate_limit_per_day: data.rate_limit_per_day,
        created_at: data.created_at,
        expires_at: data.expires_at,
      },
      message: 'API key creada. Guárdala ahora, no podrás verla de nuevo.',
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json(
      { error: 'Error al crear API key' },
      { status: 500 }
    );
  }
}

// PATCH: Actualizar API key (activar/desactivar, cambiar límites)
export async function PATCH(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const { id, is_active, rate_limit_per_minute, rate_limit_per_day, name, owner_email, owner_company } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'ID de API key requerido' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (is_active !== undefined) updateData.is_active = is_active;
    if (rate_limit_per_minute !== undefined) updateData.rate_limit_per_minute = rate_limit_per_minute;
    if (rate_limit_per_day !== undefined) updateData.rate_limit_per_day = rate_limit_per_day;
    if (name !== undefined) updateData.name = name.trim();
    if (owner_email !== undefined) updateData.owner_email = owner_email?.trim() || null;
    if (owner_company !== undefined) updateData.owner_company = owner_company?.trim() || null;

    const { data, error } = await supabase
      .from('api_keys')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      key: {
        id: data.id,
        key_prefix: data.key_prefix,
        name: data.name,
        owner_email: data.owner_email,
        owner_company: data.owner_company,
        rate_limit_per_minute: data.rate_limit_per_minute,
        rate_limit_per_day: data.rate_limit_per_day,
        is_active: data.is_active,
        created_at: data.created_at,
        last_used_at: data.last_used_at,
        expires_at: data.expires_at,
      },
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    return NextResponse.json(
      { error: 'Error al actualizar API key' },
      { status: 500 }
    );
  }
}

// DELETE: Eliminar API key
export async function DELETE(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID de API key requerido' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'API key eliminada',
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    return NextResponse.json(
      { error: 'Error al eliminar API key' },
      { status: 500 }
    );
  }
}
