import { Client } from 'pg';

const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
await client.connect();

// 1) Column definitions for estimated_delivery and shipped_at
const cols = await client.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name='orders' AND column_name IN ('estimated_delivery','shipped_at')
`);
console.log('COLUMNAS:', JSON.stringify(cols.rows, null, 2));

// 2) Any weird values? Look for text-typed data (shouldn't exist if it's timestamp)
const bad = await client.query(`
  SELECT id, order_number, estimated_delivery, shipped_at
  FROM orders
  WHERE estimated_delivery IS NOT NULL OR shipped_at IS NOT NULL
  LIMIT 5
`);
console.log('MUESTRAS:', JSON.stringify(bad.rows, null, 2));

// 3) Check invalid date test
console.log('TEST 1 (empty):', new Date('').toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' }));
console.log('TEST 2 (basura):', new Date('basura').toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' }));

await client.end();
