/**
 * Script para verificar qué migraciones están aplicadas en Supabase
 * Uso: npx tsx scripts/verify-migrations.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configurados');
  console.error('   Agrégalos a .env.local o expórtalos en la terminal');
  process.exit(1);
}

async function verifyMigrations() {
  console.log('🔍 Verificando migraciones en Supabase...\n');
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Obtener lista de migraciones locales
  const migrationsDir = join(process.cwd(), 'supabase/migrations');
  const localMigrations = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => ({
      name: f,
      path: join(migrationsDir, f),
    }));

  console.log(`📁 Migraciones locales encontradas: ${localMigrations.length}\n`);

  // Verificar campos de la migración 017
  console.log('🔍 Verificando migración 017_below_minimum_quotes.sql...\n');

  const checks = [
    {
      name: 'price_per_m2_below_minimum en pricing_config',
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'pricing_config' 
        AND column_name = 'price_per_m2_below_minimum'
      `,
    },
    {
      name: 'is_below_minimum en public_quotes',
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'public_quotes' 
        AND column_name = 'is_below_minimum'
      `,
    },
    {
      name: 'requested_quantity_below_minimum en public_quotes',
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'public_quotes' 
        AND column_name = 'requested_quantity_below_minimum'
      `,
    },
    {
      name: 'price_per_m2_applied en public_quotes',
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'public_quotes' 
        AND column_name = 'price_per_m2_applied'
      `,
    },
    {
      name: 'accepted_below_minimum_terms en public_quotes',
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'public_quotes' 
        AND column_name = 'accepted_below_minimum_terms'
      `,
    },
    {
      name: 'requested_contact en public_quotes',
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'public_quotes' 
        AND column_name = 'requested_contact'
      `,
    },
    {
      name: 'distance_km en public_quotes',
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'public_quotes' 
        AND column_name = 'distance_km'
      `,
    },
    {
      name: 'is_free_shipping en public_quotes',
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'public_quotes' 
        AND column_name = 'is_free_shipping'
      `,
    },
    {
      name: 'design_preview_url en public_quotes',
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'public_quotes' 
        AND column_name = 'design_preview_url'
      `,
    },
  ];

  let allPassed = true;

  // Usar una consulta SQL directa para verificar todos los campos de una vez
  try {
    const verificationQuery = `
      SELECT 
        table_name,
        column_name
      FROM information_schema.columns
      WHERE (
        (table_name = 'pricing_config' AND column_name = 'price_per_m2_below_minimum')
        OR (table_name = 'public_quotes' AND column_name IN (
          'is_below_minimum',
          'requested_quantity_below_minimum',
          'price_per_m2_applied',
          'accepted_below_minimum_terms',
          'requested_contact',
          'distance_km',
          'is_free_shipping',
          'design_preview_url'
        ))
      )
    `;

    // Ejecutar usando fetch directo a la API REST de Supabase
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: verificationQuery }),
    });

    if (!response.ok) {
      // Si exec_sql no existe, verificar campo por campo usando el cliente
      console.log('⚠️  Usando método alternativo de verificación...\n');
      
      for (const check of checks) {
        const tableName = check.name.includes('pricing_config') ? 'pricing_config' : 'public_quotes';
        const columnName = check.name.split(' en ')[0];
        
        // Intentar hacer una consulta simple a la tabla para verificar que el campo existe
        try {
          const testQuery = `SELECT ${columnName} FROM ${tableName} LIMIT 0`;
          const testResponse = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=${columnName}&limit=0`, {
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
          });

          if (testResponse.ok || testResponse.status === 200) {
            console.log(`✅ ${check.name}: OK`);
          } else {
            console.log(`❌ ${check.name}: NO encontrado`);
            allPassed = false;
          }
        } catch (err) {
          console.log(`❌ ${check.name}: NO encontrado`);
          allPassed = false;
        }
      }
    } else {
      const data = await response.json();
      const foundColumns = new Set<string>();
      
      if (Array.isArray(data)) {
        data.forEach((row: { table_name: string; column_name: string }) => {
          foundColumns.add(`${row.table_name}.${row.column_name}`);
        });
      }

      for (const check of checks) {
        const tableName = check.name.includes('pricing_config') ? 'pricing_config' : 'public_quotes';
        const columnName = check.name.split(' en ')[0];
        const key = `${tableName}.${columnName}`;
        
        if (foundColumns.has(key)) {
          console.log(`✅ ${check.name}: OK`);
        } else {
          console.log(`❌ ${check.name}: NO encontrado`);
          allPassed = false;
        }
      }
    }
  } catch (err) {
    console.log(`⚠️  Error al verificar: ${err instanceof Error ? err.message : 'Unknown error'}`);
    console.log('   Intentando verificación campo por campo...\n');
    allPassed = false;
    
    // Fallback: verificar campo por campo
    for (const check of checks) {
      console.log(`⚠️  ${check.name}: No se pudo verificar automáticamente`);
    }
  }

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ Todas las migraciones están aplicadas correctamente');
  } else {
    console.log('❌ Algunas migraciones faltan. Ejecuta: npm run migration:apply -- 017_below_minimum_quotes.sql');
  }
  console.log('='.repeat(60));
}

verifyMigrations().catch((error) => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
