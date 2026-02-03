// Script para configurar la base de datos de Supabase
// Ejecutar con: node scripts/setup-database.js

const fs = require('fs');
const path = require('path');

// IMPORTANTE: Usar variables de entorno, NUNCA hardcodear keys
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: Configurá las variables de entorno:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nPodés agregarlas en .env.local o exportarlas en la terminal.');
  process.exit(1);
}

async function executeSQL(sql) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql })
  });

  return response;
}

async function main() {
  console.log('Configurando base de datos de Quilmes Corrugados...\n');

  // Leer archivos SQL
  const schemaPath = path.join(__dirname, '..', 'supabase', 'migrations', '001_initial_schema.sql');
  const seedPath = path.join(__dirname, '..', 'supabase', 'seed.sql');

  const schema = fs.readFileSync(schemaPath, 'utf8');
  const seed = fs.readFileSync(seedPath, 'utf8');

  console.log('Schema SQL cargado:', schema.length, 'caracteres');
  console.log('Seed SQL cargado:', seed.length, 'caracteres');

  console.log('\n--- INSTRUCCIONES ---');
  console.log('1. Ve a Supabase Dashboard → SQL Editor');
  console.log('2. Copia y pega el contenido de: supabase/migrations/001_initial_schema.sql');
  console.log('3. Haz clic en "Run" para ejecutar');
  console.log('4. Luego copia y pega: supabase/seed.sql');
  console.log('5. Haz clic en "Run" para ejecutar los datos de ejemplo');
  console.log('\nUna vez completado, ejecuta: npm run dev');
}

main().catch(console.error);
