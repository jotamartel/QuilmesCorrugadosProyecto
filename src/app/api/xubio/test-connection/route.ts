import { NextResponse } from 'next/server';
import { testXubioConnection } from '@/lib/xubio';
import { isXubioEnabled } from '@/lib/config/system';

// POST /api/xubio/test-connection - Probar conexión con Xubio
export async function POST() {
  try {
    const enabled = await isXubioEnabled();

    if (!enabled) {
      return NextResponse.json({
        success: false,
        message: 'Xubio no está habilitado o las credenciales no están configuradas',
      });
    }

    const result = await testXubioConnection();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error probando conexión Xubio:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
}
