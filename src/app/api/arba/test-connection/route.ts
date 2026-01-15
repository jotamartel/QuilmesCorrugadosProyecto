import { NextResponse } from 'next/server';
import { testArbaConnection } from '@/lib/arba';
import { isArbaCotEnabled } from '@/lib/config/system';

// POST /api/arba/test-connection - Probar conexión con ARBA
export async function POST() {
  try {
    const enabled = await isArbaCotEnabled();

    if (!enabled) {
      return NextResponse.json({
        success: false,
        message: 'ARBA COT no está habilitado o las credenciales no están configuradas',
      });
    }

    const result = await testArbaConnection();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error probando conexión ARBA:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
}
