#!/usr/bin/env tsx
/**
 * Script para actualizar las URLs de redirect de OAuth en Supabase usando la API Management
 * 
 * Requisitos:
 * - SUPABASE_ACCESS_TOKEN: Token de acceso de Supabase (obtener desde https://supabase.com/dashboard/account/tokens)
 * - NEXT_PUBLIC_SUPABASE_URL: URL del proyecto (se extrae el project ref)
 * 
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=tu_token tsx scripts/update-supabase-auth-urls.ts
 */

import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Cargar variables de entorno
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VERCEL_ENV_NEXT_PUBLIC_SUPABASE_URL;

if (!SUPABASE_ACCESS_TOKEN) {
  console.error('❌ Error: SUPABASE_ACCESS_TOKEN no está configurado');
  console.error('   Obtén tu token desde: https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

if (!SUPABASE_URL) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL no está configurado');
  process.exit(1);
}

// Extraer project reference ID de la URL
// Ejemplo: https://xxxxx.supabase.co -> xxxxx
const projectRefMatch = SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/);
if (!projectRefMatch) {
  console.error('❌ Error: No se pudo extraer el project reference ID de la URL');
  console.error(`   URL recibida: ${SUPABASE_URL}`);
  process.exit(1);
}

const projectRef = projectRefMatch[1];
console.log(`📦 Project Reference ID: ${projectRef}`);

// URLs que queremos agregar
const redirectUrls = [
  'https://quilmescorrugados.com.ar/auth/callback',
  'https://quilmes-corrugados.vercel.app/auth/callback',
  'http://localhost:3000/auth/callback',
];

const siteUrl = 'https://quilmescorrugados.com.ar';

async function updateAuthSettings() {
  try {
    console.log('\n🔧 Actualizando configuración de autenticación en Supabase...\n');

    // Obtener configuración actual
    console.log('📥 Obteniendo configuración actual...');
    const getResponse = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.error(`❌ Error al obtener configuración: ${getResponse.status}`);
      console.error(`   Respuesta: ${errorText}`);
      throw new Error(`Failed to get auth config: ${getResponse.status}`);
    }

    const currentConfig = await getResponse.json();
    console.log('✅ Configuración actual obtenida');
    console.log(`   Site URL actual: ${currentConfig.SITE_URL || 'No configurada'}`);
    console.log(`   Redirect URLs actuales: ${currentConfig.REDIRECT_URLS?.length || 0} URLs`);

    // Preparar nueva configuración
    const existingRedirectUrls = currentConfig.REDIRECT_URLS || [];
    const newRedirectUrls = [...new Set([...existingRedirectUrls, ...redirectUrls])];

    console.log(`\n📝 URLs de redirect a configurar:`);
    newRedirectUrls.forEach(url => console.log(`   - ${url}`));

    // Actualizar configuración
    console.log('\n📤 Enviando actualización...');
    const updateResponse = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          SITE_URL: siteUrl,
          REDIRECT_URLS: newRedirectUrls,
        }),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`❌ Error al actualizar configuración: ${updateResponse.status}`);
      console.error(`   Respuesta: ${errorText}`);
      throw new Error(`Failed to update auth config: ${updateResponse.status}`);
    }

    const updatedConfig = await updateResponse.json();
    console.log('\n✅ Configuración actualizada exitosamente!\n');
    console.log(`   Site URL: ${updatedConfig.SITE_URL}`);
    console.log(`   Redirect URLs: ${updatedConfig.REDIRECT_URLS?.length || 0} URLs configuradas`);
    console.log('\n📋 URLs configuradas:');
    updatedConfig.REDIRECT_URLS?.forEach((url: string) => {
      console.log(`   ✓ ${url}`);
    });

    console.log('\n🎉 ¡Listo! Las URLs de OAuth están configuradas en Supabase.');
    console.log('   Puedes probar el login con Google ahora.');

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

updateAuthSettings();
