/**
 * Script de prueba para verificar configuración de Resend
 * Ejecutar con: npx tsx scripts/test-resend.ts
 */

import { Resend } from 'resend';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Cargar variables de entorno desde .env.local
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'ventas@quilmescorrugados.com.ar';
const FROM_EMAIL = process.env.FROM_EMAIL || 'notificaciones@quilmescorrugados.com.ar';

async function testResend() {
  console.log('🧪 Probando configuración de Resend...\n');

  // Verificar variables de entorno
  if (!RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY no está configurada');
    console.log('\n📋 Para configurarla:');
    console.log('   1. Obtén tu API key en: https://resend.com/api-keys');
    console.log('   2. Agrega a .env.local: RESEND_API_KEY=tu_api_key');
    console.log('   3. O configura en Vercel: vercel env add RESEND_API_KEY');
    process.exit(1);
  }

  console.log('✅ RESEND_API_KEY encontrada');
  console.log(`📧 FROM_EMAIL: ${FROM_EMAIL}`);
  console.log(`📧 NOTIFICATION_EMAIL: ${NOTIFICATION_EMAIL}\n`);

  // Inicializar Resend
  const resend = new Resend(RESEND_API_KEY);

  try {
    console.log('📤 Enviando email de prueba...');

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: NOTIFICATION_EMAIL,
      subject: 'Test de Resend - Quilmes Corrugados',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">✅ Resend configurado correctamente</h2>
          <p>Este es un email de prueba desde Quilmes Corrugados.</p>
          <p>Si recibiste este email, significa que Resend está funcionando correctamente.</p>
          <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
            Enviado el ${new Date().toLocaleString('es-AR')}
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('❌ Error enviando email:', error);
      process.exit(1);
    }

    console.log('✅ Email enviado exitosamente!');
    console.log(`📧 Email ID: ${data?.id}`);
    console.log(`📧 Revisa tu bandeja de entrada en: ${NOTIFICATION_EMAIL}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testResend();
