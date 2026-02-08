#!/bin/bash
# Script para verificar estado de Resend

echo "📧 Estado de configuración de Resend"
echo "======================================"
echo ""

# Verificar si existe .env.local
if [ ! -f .env.local ]; then
    echo "⚠️  .env.local no existe"
    echo "   Ejecuta: vercel env pull .env.local"
    exit 1
fi

# Verificar variables
if grep -q "^RESEND_API_KEY=" .env.local; then
    echo "✅ RESEND_API_KEY configurada"
else
    echo "❌ RESEND_API_KEY NO configurada"
fi

if grep -q "^NOTIFICATION_EMAIL=" .env.local; then
    NOTIFICATION_EMAIL=$(grep "^NOTIFICATION_EMAIL=" .env.local | cut -d '=' -f2)
    echo "✅ NOTIFICATION_EMAIL: $NOTIFICATION_EMAIL"
else
    echo "⚠️  NOTIFICATION_EMAIL usando valor por defecto: ventas@quilmescorrugados.com.ar"
fi

if grep -q "^FROM_EMAIL=" .env.local; then
    FROM_EMAIL=$(grep "^FROM_EMAIL=" .env.local | cut -d '=' -f2)
    echo "✅ FROM_EMAIL: $FROM_EMAIL"
else
    echo "⚠️  FROM_EMAIL usando valor por defecto: notificaciones@quilmescorrugados.com.ar"
fi

echo ""
echo "📋 Variables en Vercel:"
vercel env ls 2>&1 | grep -E "RESEND|NOTIFICATION|FROM" || echo "   (ejecuta 'vercel env ls' para ver todas)"

echo ""
echo "🧪 Para probar Resend:"
echo "   npx tsx scripts/test-resend.ts"
