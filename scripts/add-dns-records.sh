#!/bin/bash
# Script para agregar registros DNS en Cloudflare
# Uso: ./scripts/add-dns-records.sh

set -e

# Variables
DOMAIN="quilmescorrugados.com.ar"
VERCEL_IP="76.76.21.21"
ZONE_ID=""  # Se obtiene automáticamente
API_TOKEN="${CLOUDFLARE_API_TOKEN}"

if [ -z "$API_TOKEN" ]; then
    echo "❌ Error: CLOUDFLARE_API_TOKEN no está configurado"
    echo "   Configúralo con: export CLOUDFLARE_API_TOKEN='tu-token'"
    echo ""
    echo "   Para obtener tu token:"
    echo "   1. Ve a https://dash.cloudflare.com/profile/api-tokens"
    echo "   2. Crea un token con permisos: Zone DNS:Edit"
    exit 1
fi

echo "🔍 Obteniendo Zone ID para $DOMAIN..."

# Obtener Zone ID
ZONE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=$DOMAIN" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data['result'][0]['id'] if data['result'] else '')" 2>/dev/null)

if [ -z "$ZONE_ID" ]; then
    echo "❌ Error: No se pudo obtener el Zone ID para $DOMAIN"
    echo "   Verifica que el dominio esté en tu cuenta de Cloudflare"
    exit 1
fi

echo "✅ Zone ID: $ZONE_ID"
echo ""

# Función para agregar registro DNS
add_dns_record() {
    local name=$1
    local type=$2
    local content=$3
    
    echo "➕ Agregando registro: $name ($type) -> $content"
    
    response=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
        -H "Authorization: Bearer $API_TOKEN" \
        -H "Content-Type: application/json" \
        --data "{
            \"type\": \"$type\",
            \"name\": \"$name\",
            \"content\": \"$content\",
            \"ttl\": 1,
            \"proxied\": false
        }")
    
    success=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['success'])" 2>/dev/null)
    
    if [ "$success" = "True" ]; then
        echo "   ✅ Registro agregado exitosamente"
    else
        error=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('errors', [{}])[0].get('message', 'Error desconocido'))" 2>/dev/null)
        echo "   ⚠️  Error: $error"
    fi
    echo ""
}

# Agregar registros A
add_dns_record "@" "A" "$VERCEL_IP"
add_dns_record "www" "A" "$VERCEL_IP"

echo "✅ Proceso completado!"
echo ""
echo "📋 Próximos pasos:"
echo "   1. Espera unos minutos para que los cambios se propaguen"
echo "   2. Vercel verificará automáticamente el dominio"
echo "   3. Recibirás un email cuando el dominio esté configurado"
