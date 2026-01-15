import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/checks/[id]/endorse - Endosar cheque
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const body = await request.json();

    const { endorsed_to, notes } = body;

    if (!endorsed_to) {
      return NextResponse.json(
        { error: 'Se requiere el destinatario del endoso' },
        { status: 400 }
      );
    }

    // Verificar que el cheque esté en cartera
    const { data: check, error: checkError } = await supabase
      .from('checks')
      .select('status')
      .eq('id', id)
      .single();

    if (checkError || !check) {
      return NextResponse.json(
        { error: 'Cheque no encontrado' },
        { status: 404 }
      );
    }

    if (check.status !== 'in_portfolio') {
      return NextResponse.json(
        { error: 'El cheque no está en cartera' },
        { status: 400 }
      );
    }

    // Actualizar cheque
    const { data, error } = await supabase
      .from('checks')
      .update({
        status: 'endorsed',
        exit_type: 'endorsement',
        exit_date: new Date().toISOString(),
        exit_to: endorsed_to,
        exit_notes: notes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error endosando cheque:', error);
    return NextResponse.json(
      { error: 'Error al endosar cheque' },
      { status: 500 }
    );
  }
}
