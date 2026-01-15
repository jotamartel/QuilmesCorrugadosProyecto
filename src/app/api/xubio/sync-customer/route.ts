import { NextRequest, NextResponse } from 'next/server';
import { syncClientToXubio } from '@/lib/xubio';
import { isXubioEnabled } from '@/lib/config/system';

// POST /api/xubio/sync-customer - Sincronizar cliente con Xubio
export async function POST(request: NextRequest) {
  try {
    const { client_id } = await request.json();

    if (!client_id) {
      return NextResponse.json(
        { error: 'Se requiere client_id' },
        { status: 400 }
      );
    }

    const enabled = await isXubioEnabled();
    if (!enabled) {
      return NextResponse.json(
        { error: 'Xubio no está habilitado' },
        { status: 400 }
      );
    }

    const result = await syncClientToXubio(client_id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error sincronizando cliente:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
