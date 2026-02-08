/**
 * Script para aplicar la migración de tráfico web usando psql directamente
 * Requiere: Variables de entorno de Supabase configuradas
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configurados');
  process.exit(1);
}

async function applyMigration() {
  console.log('📦 Conectando a Supabase...');
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Leer el archivo SQL
  const sqlFile = join(process.cwd(), 'supabase/migrations/015_web_traffic.sql');
  const sql = readFileSync(sqlFile, 'utf-8');

  console.log('📄 Migración SQL cargada');
  console.log('📤 Ejecutando migración...');

  // Dividir el SQL en statements individuales (separados por ;)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  let successCount = 0;
  let errorCount = 0;

  for (const statement of statements) {
    if (statement.length === 0) continue;
    
    try {
      // Ejecutar cada statement usando rpc o query directo
      // Nota: Supabase JS client no tiene método directo para ejecutar SQL arbitrario
      // Necesitamos usar la API REST directamente
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ query: statement }),
      });

      if (!response.ok) {
        // Intentar ejecutar directamente con la API de PostgREST
        // Si falla, continuar con el siguiente
        console.warn(`⚠️  Advertencia en statement: ${statement.substring(0, 50)}...`);
        errorCount++;
      } else {
        successCount++;
      }
    } catch (error) {
      console.error(`❌ Error ejecutando statement:`, error);
      errorCount++;
    }
  }

  console.log('');
  console.log(`✅ Statements ejecutados: ${successCount}`);
  if (errorCount > 0) {
    console.log(`⚠️  Errores: ${errorCount}`);
    console.log('');
    console.log('💡 Nota: Algunos statements pueden requerir ejecución manual en Supabase Dashboard → SQL Editor');
  }
}

// Ejecutar
applyMigration().catch(console.error);
