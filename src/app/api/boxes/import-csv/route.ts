/**
 * API: /api/boxes/import-csv
 * POST - Importa cajas desde un CSV
 * Formato esperado: nombre,largo_mm,ancho_mm,alto_mm,estandar,stock
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateUnfolded, isUndersized } from '@/lib/utils/box-calculations';

interface ImportResult {
  created: number;
  duplicates: number;
  errors: string[];
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.text();

    if (!body.trim()) {
      return NextResponse.json({ error: 'CSV vacio' }, { status: 400 });
    }

    const lines = body.trim().split(/\r?\n/);

    if (lines.length < 2) {
      return NextResponse.json({ error: 'El CSV debe tener al menos una fila de headers y una de datos' }, { status: 400 });
    }

    // Parse header to find column indices
    const headerLine = parseCsvLine(lines[0].toLowerCase());
    const colMap: Record<string, number> = {};
    headerLine.forEach((col, i) => {
      colMap[col] = i;
    });

    // Required columns
    const requiredCols = ['nombre', 'largo_mm', 'ancho_mm', 'alto_mm'];
    const missingCols = requiredCols.filter((c) => colMap[c] === undefined);
    if (missingCols.length > 0) {
      return NextResponse.json(
        { error: `Columnas faltantes: ${missingCols.join(', ')}. Requeridas: ${requiredCols.join(', ')}` },
        { status: 400 }
      );
    }

    // Fetch existing boxes to check duplicates
    const { data: existing } = await supabase
      .from('boxes')
      .select('length_mm, width_mm, height_mm');
    const existingSet = new Set(
      (existing || []).map((b) => `${b.length_mm}-${b.width_mm}-${b.height_mm}`)
    );

    const result: ImportResult = { created: 0, duplicates: 0, errors: [] };
    const toInsert: Record<string, unknown>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = parseCsvLine(line);
      const rowNum = i + 1;

      const nombre = cols[colMap['nombre']] || '';
      const largo = parseInt(cols[colMap['largo_mm']]);
      const ancho = parseInt(cols[colMap['ancho_mm']]);
      const alto = parseInt(cols[colMap['alto_mm']]);
      const estandar = colMap['estandar'] !== undefined
        ? cols[colMap['estandar']]?.toLowerCase() === 'true'
        : true;
      const stock = colMap['stock'] !== undefined
        ? parseInt(cols[colMap['stock']]) || 0
        : 0;

      // Validations
      if (!nombre) {
        result.errors.push(`Fila ${rowNum}: nombre vacio`);
        continue;
      }
      if (isNaN(largo) || isNaN(ancho) || isNaN(alto)) {
        result.errors.push(`Fila ${rowNum}: dimensiones invalidas`);
        continue;
      }
      if (isUndersized(largo, ancho, alto)) {
        result.errors.push(`Fila ${rowNum}: caja menor al minimo (200x200x100)`);
        continue;
      }

      // Check duplicate
      const key = `${largo}-${ancho}-${alto}`;
      if (existingSet.has(key)) {
        result.duplicates++;
        continue;
      }

      // Calculate unfolded
      const { unfoldedWidth, unfoldedLength, m2 } = calculateUnfolded(largo, ancho, alto);

      toInsert.push({
        name: nombre,
        length_mm: largo,
        width_mm: ancho,
        height_mm: alto,
        unfolded_length_mm: unfoldedLength,
        unfolded_width_mm: unfoldedWidth,
        m2_per_box: m2,
        stock: Math.max(0, stock),
        is_standard: estandar,
        is_active: true,
      });

      // Mark as existing to catch duplicates within the CSV itself
      existingSet.add(key);
    }

    // Bulk insert
    if (toInsert.length > 0) {
      const { error } = await supabase.from('boxes').insert(toInsert);
      if (error) {
        console.error('Error bulk inserting boxes:', error);
        return NextResponse.json({ error: 'Error al insertar cajas' }, { status: 500 });
      }
      result.created = toInsert.length;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in POST /api/boxes/import-csv:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
