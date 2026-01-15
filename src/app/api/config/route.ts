import { NextRequest, NextResponse } from 'next/server';
import {
  getFullSystemConfig,
  setConfigValues,
  getAllConfig,
} from '@/lib/config/system';

// GET /api/config - Obtener configuración del sistema
export async function GET() {
  try {
    const config = await getFullSystemConfig();

    // No devolver contraseñas en la respuesta
    return NextResponse.json({
      ...config,
      xubio_secret_id: config.xubio_secret_id ? '********' : '',
      arba_cit_password: config.arba_cit_password ? '********' : '',
    });
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    return NextResponse.json(
      { error: 'Error al obtener la configuración' },
      { status: 500 }
    );
  }
}

// PATCH /api/config - Actualizar configuración del sistema
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    // Filtrar campos vacíos que son contraseñas (no actualizar si están ocultos)
    const updates: Record<string, string | null> = {};

    for (const [key, value] of Object.entries(body)) {
      // No actualizar si el valor es el placeholder de contraseña
      if (value === '********') continue;

      updates[key] = value as string;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ message: 'No hay cambios para guardar' });
    }

    await setConfigValues(updates);

    return NextResponse.json({
      message: 'Configuración actualizada correctamente',
    });
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    return NextResponse.json(
      { error: 'Error al actualizar la configuración' },
      { status: 500 }
    );
  }
}
