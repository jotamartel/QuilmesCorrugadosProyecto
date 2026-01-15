/**
 * API: POST /api/auth/check-authorized
 * Verifica si un email está autorizado para acceder al sistema
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email requerido', authorized: false },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verificar si el email está en la tabla de usuarios autorizados
    const { data, error } = await supabase
      .from('authorized_users')
      .select('id, email, name, role, is_active')
      .eq('email', email.toLowerCase())
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return NextResponse.json({ authorized: false });
    }

    return NextResponse.json({
      authorized: true,
      user: {
        id: data.id,
        email: data.email,
        name: data.name,
        role: data.role,
      },
    });
  } catch (error) {
    console.error('Error checking authorization:', error);
    return NextResponse.json(
      { error: 'Error interno', authorized: false },
      { status: 500 }
    );
  }
}
