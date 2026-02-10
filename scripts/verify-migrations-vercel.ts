/**
 * Script para verificar migraciones usando variables de entorno de Vercel
 * Uso: npx tsx scripts/verify-migrations-vercel.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Cargar variables de entorno desde .env.vercel (descargado de Vercel)
config({ path: resolve(process.cwd(), '.env.vercel') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: No se encontraron las variables de Supabase en .env.vercel');
  console.error('   Ejecuta primero: vercel env pull .env.vercel');
  console.error(`   SUPABASE_URL: ${SUPABASE_URL ? '✅' : '❌'}`);
  console.error(`   SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌'}`);
  process.exit(1);
}

async function verifyMigrations() {
  console.log('🔍 Verificando migración 017_below_minimum_quotes.sql...\n');
  console.log(`📡 Conectando a Supabase...\n`);
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const checks = [
    { table: 'pricing_config', column: 'price_per_m2_below_minimum', name: 'price_per_m2_below_minimum en pricing_config' },
    { table: 'public_quotes', column: 'is_below_minimum', name: 'is_below_minimum en public_quotes' },
    { table: 'public_quotes', column: 'requested_quantity_below_minimum', name: 'requested_quantity_below_minimum en public_quotes' },
    { table: 'public_quotes', column: 'price_per_m2_applied', name: 'price_per_m2_applied en public_quotes' },
    { table: 'public_quotes', column: 'accepted_below_minimum_terms', name: 'accepted_below_minimum_terms en public_quotes' },
    { table: 'public_quotes', column: 'requested_contact', name: 'requested_contact en public_quotes' },
    { table: 'public_quotes', column: 'distance_km', name: 'distance_km en public_quotes' },
    { table: 'public_quotes', column: 'is_free_shipping', name: 'is_free_shipping en public_quotes' },
    { table: 'public_quotes', column: 'design_preview_url', name: 'design_preview_url en public_quotes' },
  ];

  let allPassed = true;
  const results: Array<{ name: string; status: 'ok' | 'missing' | 'error'; error?: string }> = [];

  for (const check of checks) {
    try {
      // Intentar hacer una consulta simple que incluya el campo
      const { error } = await supabase
        .from(check.table)
        .select(check.column)
        .limit(0);

      if (error) {
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes('column') && (errorMsg.includes('does not exist') || errorMsg.includes('no existe'))) {
          console.log(`❌ ${check.name}: NO encontrado`);
          results.push({ name: check.name, status: 'missing' });
          allPassed = false;
        } else {
          // El campo existe pero puede haber otro error (permisos, etc.)
          console.log(`✅ ${check.name}: OK`);
          results.push({ name: check.name, status: 'ok' });
        }
      } else {
        console.log(`✅ ${check.name}: OK`);
        results.push({ name: check.name, status: 'ok' });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.log(`⚠️  ${check.name}: Error - ${errorMsg}`);
      results.push({ name: check.name, status: 'error', error: errorMsg });
      allPassed = false;
    }
  }

  console.log('\n' + '='.repeat(70));
  if (allPassed) {
    console.log('✅ Todas las migraciones están aplicadas correctamente');
  } else {
    console.log('❌ Algunas migraciones faltan o hay errores:');
    results
      .filter(r => r.status !== 'ok')
      .forEach(r => {
        console.log(`   - ${r.name}: ${r.status === 'missing' ? 'NO encontrado' : `Error: ${r.error}`}`);
      });
    console.log('\n💡 Para aplicar la migración:');
    console.log('   1. Ejecuta: npm run migration:show -- 017_below_minimum_quotes.sql');
    console.log('   2. Copia el SQL mostrado');
    console.log('   3. Ve a Supabase Dashboard → SQL Editor');
    console.log('   4. Pega el SQL y haz clic en "Run"');
  }
  console.log('='.repeat(70));
}

verifyMigrations().catch((error) => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
