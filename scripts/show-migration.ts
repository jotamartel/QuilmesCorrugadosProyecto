/**
 * Script para mostrar el contenido de una migración para copiar y pegar en Supabase SQL Editor
 * Uso: npx tsx scripts/show-migration.ts 017_below_minimum_quotes.sql
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const migrationFile = process.argv[2] || '017_below_minimum_quotes.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFile);

try {
  const sql = readFileSync(migrationPath, 'utf-8');
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📄 Migración: ${migrationFile}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('📋 INSTRUCCIONES:');
  console.log('   1. Copia el SQL de abajo');
  console.log('   2. Ve a Supabase Dashboard → SQL Editor');
  console.log('   3. Pega el SQL y haz clic en "Run"');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(sql);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
} catch (error: any) {
  console.error(`❌ Error: No se encontró el archivo de migración: ${migrationFile}`);
  console.error(`   Ruta esperada: ${migrationPath}`);
  process.exit(1);
}
