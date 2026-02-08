/**
 * QA Test Detallado - Emails Automáticos
 * Ejecutar con: npx tsx scripts/qa-test-emails-detailed.ts
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env.local') });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'ventas@quilmescorrugados.com.ar';

interface TestResult {
  name: string;
  passed: boolean;
  httpCode?: number;
  error?: string;
  emailSent?: boolean;
}

const results: TestResult[] = [];

async function testEndpoint(
  name: string,
  method: 'GET' | 'POST',
  url: string,
  body?: any
): Promise<TestResult> {
  try {
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    return {
      name,
      passed: response.ok,
      httpCode: response.status,
      emailSent: response.ok,
    };
  } catch (error: any) {
    return {
      name,
      passed: false,
      error: error.message,
    };
  }
}

async function runTests() {
  console.log('🧪 QA Test Detallado - Emails Automáticos\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Notification Email: ${NOTIFICATION_EMAIL}\n`);
  console.log('='.repeat(50));
  console.log('');

  // Test 1: Lead con datos de contacto
  console.log('📧 Test 1: Lead con datos de contacto');
  const test1 = await testEndpoint(
    'Lead con contacto',
    'POST',
    `${BASE_URL}/api/v1/quote`,
    {
      boxes: [{
        length_mm: 400,
        width_mm: 300,
        height_mm: 200,
        quantity: 1000,
      }],
      contact: {
        name: 'Test QA',
        email: 'test@example.com',
        phone: '+541169249801',
        company: 'Empresa Test',
      },
      origin: 'QA Test - Lead con contacto',
    }
  );
  results.push(test1);
  console.log(test1.passed ? '✅ PASS' : `❌ FAIL: ${test1.error || test1.httpCode}`);
  console.log('');

  // Test 2: Cotización de alto valor
  console.log('💰 Test 2: Cotización de alto valor (>$500k)');
  const test2 = await testEndpoint(
    'Alto valor',
    'POST',
    `${BASE_URL}/api/v1/quote`,
    {
      boxes: [{
        length_mm: 600,
        width_mm: 400,
        height_mm: 400,
        quantity: 10000, // Genera >$500k
      }],
      origin: 'QA Test - Alto valor',
    }
  );
  results.push(test2);
  console.log(test2.passed ? '✅ PASS' : `❌ FAIL: ${test2.error || test2.httpCode}`);
  console.log('');

  // Test 3: Email inbound
  console.log('📨 Test 3: Email entrante (webhook)');
  const test3 = await testEndpoint(
    'Email inbound',
    'POST',
    `${BASE_URL}/api/email/inbound`,
    {
      from: 'cliente@example.com',
      subject: 'Necesito cotizar cajas de 40x30x20 cm, cantidad 500',
      text: 'Hola, necesito cotizar cajas de 40x30x20 cm, cantidad 500 unidades. Mi teléfono es +541169249801',
    }
  );
  results.push(test3);
  console.log(test3.passed ? '✅ PASS' : `❌ FAIL: ${test3.error || test3.httpCode}`);
  console.log('');

  // Test 4: Retell registrar lead
  console.log('📞 Test 4: Lead desde Retell AI');
  const test4 = await testEndpoint(
    'Retell lead',
    'POST',
    `${BASE_URL}/api/retell/registrar-lead`,
    {
      nombre: 'Cliente Test',
      email: 'cliente@example.com',
      telefono: '+541169249801',
      consulta: 'Cotización de cajas',
      cotizacion_id: 'test-123',
    }
  );
  results.push(test4);
  console.log(test4.passed ? '✅ PASS' : `❌ FAIL: ${test4.error || test4.httpCode}`);
  console.log('');

  // Resumen
  console.log('='.repeat(50));
  console.log('📊 RESUMEN');
  console.log('='.repeat(50));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name}${r.httpCode ? ` (HTTP ${r.httpCode})` : ''}`);
  });
  
  console.log('');
  console.log(`Total: ${passed}/${total} tests pasados`);
  
  if (passed === total) {
    console.log('🎉 Todos los tests pasaron!');
  } else {
    console.log('⚠️  Algunos tests fallaron');
  }
  
  console.log('');
  console.log('📋 Verifica tu bandeja de entrada en:');
  console.log(`   ${NOTIFICATION_EMAIL}`);
  console.log('');
  console.log('💡 Tip: Revisa los logs del servidor para más detalles');
}

runTests().catch(console.error);
