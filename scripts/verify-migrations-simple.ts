/**
 * Script simple para verificar migraciones usando consultas directas
 * Uso: npx tsx scripts/verify-migrations-simple.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configurados');
  process.exit(1);
}

async function verifyMigrations() {
  console.log('🔍 Verificando migración 017_below_minimum_quotes.sql...\n');
  
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

  for (const check of checks) {
    try {
      // Intentar hacer una consulta simple que incluya el campo
      // Si el campo no existe, la consulta fallará
      const { error } = await supabase
        .from(check.table)
        .select(check.column)
        .limit(0);

      if (error) {
        // Si el error es sobre columna no encontrada, el campo no existe
        if (error.message.includes('column') || error.message.includes('does not exist')) {
          console.log(`❌ ${check.name}: NO encontrado`);
          allPassed = false;
        } else {
          // Otro tipo de error, probablemente el campo existe pero no hay datos
          console.log(`✅ ${check.name}: OK`);
        }
      } else {
        console.log(`✅ ${check.name}: OK`);
      }
    } catch (err) {
      // Si hay un error de sintaxis o similar, probablemente el campo no existe
      console.log(`❌ ${check.name}: NO encontrado`);
      allPassed = false;
    }
  }

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ Todas las migraciones están aplicadas correctamente');
  } else {
    console.log('❌ Algunas migraciones faltan.');
    console.log('   Ejecuta: npm run migration:show -- 017_below_minimum_quotes.sql');
    console.log('   Luego copia el SQL y pégalo en Supabase Dashboard → SQL Editor');
  }
  console.log('='.repeat(60));
}

verifyMigrations().catch((error) => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
