/**
 * Script para aplicar migraciones de Supabase usando conexión directa PostgreSQL
 * Uso: npx tsx scripts/apply-migration.ts 017_below_minimum_quotes.sql
 * O: npx tsx scripts/apply-migration.ts (aplica la última migración)
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';

const { Client } = pg;

// Obtener la URL de conexión de Supabase desde las variables de entorno
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;

// Extraer información de conexión de la URL de Supabase
// Formato: https://[project-ref].supabase.co
// Necesitamos construir: postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres

function getConnectionString(): string {
  // Si hay una variable de entorno directa para la conexión, usarla
  if (process.env.SUPABASE_DB_URL) {
    return process.env.SUPABASE_DB_URL;
  }

  // Intentar construir desde la URL de Supabase
  if (!SUPABASE_URL) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL no está configurado');
  }

  // Extraer project-ref de la URL
  const match = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match) {
    throw new Error('No se pudo extraer el project-ref de NEXT_PUBLIC_SUPABASE_URL');
  }

  const projectRef = match[1];
  
  // Necesitamos la contraseña de la base de datos
  if (!SUPABASE_DB_PASSWORD) {
    console.error('❌ Error: SUPABASE_DB_PASSWORD no está configurado');
    console.error('');
    console.error('💡 Para obtener la contraseña:');
    console.error('   1. Ve a Supabase Dashboard → Settings → Database');
    console.error('   2. Busca "Connection string" o "Connection pooling"');
    console.error('   3. Copia la contraseña y agrégalo a .env.local como SUPABASE_DB_PASSWORD');
    console.error('');
    console.error('   O usa la conexión directa:');
    console.error('   SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres');
    throw new Error('SUPABASE_DB_PASSWORD requerido');
  }

  return `postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${projectRef}.supabase.co:5432/postgres`;
}

async function applyMigration(migrationFile: string) {
  console.log(`📦 Aplicando migración: ${migrationFile}`);
  
  const client = new Client({
    connectionString: getConnectionString(),
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log('✅ Conectado a la base de datos');

    // Leer el archivo SQL
    const sqlPath = join(process.cwd(), 'supabase/migrations', migrationFile);
    const sql = readFileSync(sqlPath, 'utf-8');

    console.log('📄 Migración SQL cargada');
    console.log('📤 Ejecutando migración...\n');

    // Ejecutar el SQL completo
    await client.query(sql);

    console.log('✅ Migración aplicada exitosamente');
  } catch (error: any) {
    console.error('❌ Error aplicando migración:', error.message);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
    if (error.position) {
      console.error(`   Posición: ${error.position}`);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Obtener el nombre del archivo de migración
const migrationFile = process.argv[2] || '017_below_minimum_quotes.sql';

// Validar que el archivo existe
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFile);
try {
  readFileSync(migrationPath, 'utf-8');
} catch (error) {
  console.error(`❌ Error: No se encontró el archivo de migración: ${migrationFile}`);
  console.error(`   Ruta esperada: ${migrationPath}`);
  process.exit(1);
}

// Aplicar la migración
applyMigration(migrationFile).catch((error) => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
