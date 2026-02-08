#!/bin/bash
# Script interactivo para agregar registros DKIM de Resend
# Uso: ./scripts/add-resend-dkim.sh

set -e

DOMAIN="quilmescorrugados.com.ar"
ZONE_ID="36438015dff267e666cbd4beeaeafef5"
API_TOKEN="${CLOUDFLARE_API_TOKEN}"

if [ -z "$API_TOKEN" ]; then
    echo "❌ Error: CLOUDFLARE_API_TOKEN no está configurado"
    exit 1
fi

echo "🔐 Agregar Registros DKIM de Resend"
echo "===================================="
echo ""
echo "📋 Instrucciones:"
echo "   1. Ve a https://resend.com/domains"
echo "   2. Selecciona tu dominio: $DOMAIN"
echo "   3. Copia los valores DKIM que Resend te muestra"
echo ""

# Solicitar valores DKIM
read -p "Ingresa el nombre del primer registro DKIM (ej: resend._domainkey): " dkim1_name
read -p "Ingresa el valor del primer registro DKIM: " dkim1_value

if [ -z "$dkim1_name" ] || [ -z "$dkim1_value" ]; then
    echo "❌ Valores requeridos"
    exit 1
fi

echo ""
echo "➕ Agregando registro DKIM..."

response=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{
        \"type\": \"TXT\",
        \"name\": \"$dkim1_name\",
        \"content\": \"$dkim1_value\",
        \"ttl\": 1,
        \"proxied\": false
    }")

success=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['success'])" 2>/dev/null)

if [ "$success" = "True" ]; then
    echo "✅ Registro DKIM agregado exitosamente!"
else
    error=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('errors', [{}])[0].get('message', 'Error desconocido'))" 2>/dev/null)
    echo "❌ Error: $error"
    exit 1
fi

echo ""
echo "💡 Si Resend te dio más registros DKIM, ejecuta este script nuevamente"
echo "   o agrégalos manualmente en Cloudflare"
echo ""
echo "⏱️  Espera 5-30 minutos para propagación DNS"
echo "   Resend verificará automáticamente cuando esté listo"
