/**
 * Script para probar la URL de redirect de OAuth
 * Ejecutar con: node scripts/test-oauth-redirect.js
 */

// Simular diferentes entornos
const scenarios = [
  {
    name: 'Producción (quilmescorrugados.com.ar)',
    hostname: 'quilmescorrugados.com.ar',
    origin: 'https://quilmescorrugados.com.ar',
    NEXT_PUBLIC_SITE_URL: 'https://quilmescorrugados.com.ar',
  },
  {
    name: 'Producción (www.quilmescorrugados.com.ar)',
    hostname: 'www.quilmescorrugados.com.ar',
    origin: 'https://www.quilmescorrugados.com.ar',
    NEXT_PUBLIC_SITE_URL: 'https://quilmescorrugados.com.ar',
  },
  {
    name: 'Vercel Preview',
    hostname: 'quilmes-corrugados.vercel.app',
    origin: 'https://quilmes-corrugados.vercel.app',
    NEXT_PUBLIC_SITE_URL: 'https://quilmescorrugados.com.ar',
  },
  {
    name: 'Localhost (desarrollo)',
    hostname: 'localhost',
    origin: 'http://localhost:3000',
    NEXT_PUBLIC_SITE_URL: undefined,
  },
];

function getBaseUrl(scenario) {
  const siteUrl = scenario.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    return siteUrl;
  }
  
  const hostname = scenario.hostname;
  
  // Si estamos en producción (no localhost), usar el origin actual
  if (!hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
    return scenario.NEXT_PUBLIC_SITE_URL?.trim() || scenario.origin.trim();
  } else {
    // En desarrollo (localhost), usar localhost
    return scenario.origin.trim();
  }
}

console.log('🧪 Prueba de URLs de Redirect OAuth\n');
console.log('='.repeat(60));

scenarios.forEach((scenario) => {
  const baseUrl = getBaseUrl(scenario);
  const redirectUrl = `${baseUrl}/auth/callback`.replace(/\s+/g, '').trim();
  
  console.log(`\n📋 Escenario: ${scenario.name}`);
  console.log(`   Hostname: ${scenario.hostname}`);
  console.log(`   Origin: ${scenario.origin}`);
  console.log(`   NEXT_PUBLIC_SITE_URL: ${scenario.NEXT_PUBLIC_SITE_URL || 'undefined'}`);
  console.log(`   ✅ Redirect URL: ${redirectUrl}`);
  
  // Validar que no tenga localhost en producción
  if (!scenario.hostname.includes('localhost') && redirectUrl.includes('localhost')) {
    console.log(`   ❌ ERROR: URL de producción contiene localhost!`);
  } else if (scenario.hostname.includes('localhost') && !redirectUrl.includes('localhost')) {
    console.log(`   ⚠️  ADVERTENCIA: URL de desarrollo no contiene localhost`);
  } else {
    console.log(`   ✅ URL válida`);
  }
});

console.log('\n' + '='.repeat(60));
console.log('\n💡 Verificación:');
console.log('   - En producción debe usar: https://quilmescorrugados.com.ar/auth/callback');
console.log('   - En desarrollo debe usar: http://localhost:3000/auth/callback');
console.log('   - Nunca debe usar localhost en producción\n');
