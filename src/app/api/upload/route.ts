/**
 * API: /api/upload
 * POST - Sube un archivo a Supabase Storage
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/upload
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = formData.get('folder') as string || 'designs';

    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó ningún archivo' },
        { status: 400 }
      );
    }

    // Validar tipo de archivo
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'image/svg+xml',
      'application/illustrator',
      'application/postscript',
      'image/vnd.adobe.photoshop',
    ];

    // También permitir extensiones comunes de diseño
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.svg', '.ai', '.eps', '.psd'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Use: JPG, PNG, PDF, SVG, AI, EPS, PSD' },
        { status: 400 }
      );
    }

    // Validar tamaño (max 20MB)
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'El archivo es muy grande. Máximo 20MB' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Generar nombre único
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${folder}/${timestamp}-${randomId}-${sanitizedName}`;

    // Convertir el archivo a ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Subir a Supabase Storage
    const { data, error } = await supabase.storage
      .from('quilmes-files')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error('Error uploading to Supabase Storage:', error);

      // Si el bucket no existe, dar instrucciones
      if (error.message.includes('bucket') || error.message.includes('not found')) {
        return NextResponse.json(
          {
            error: 'El bucket de storage no está configurado. Debe crear el bucket "quilmes-files" en Supabase.',
            details: error.message
          },
          { status: 500 }
        );
      }

      throw error;
    }

    // Obtener URL pública
    const { data: publicUrlData } = supabase.storage
      .from('quilmes-files')
      .getPublicUrl(data.path);

    return NextResponse.json({
      success: true,
      url: publicUrlData.publicUrl,
      path: data.path,
      name: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('Error in POST /api/upload:', error);
    return NextResponse.json(
      { error: 'Error al subir el archivo' },
      { status: 500 }
    );
  }
}
