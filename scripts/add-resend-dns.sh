#!/bin/bash
# Script para agregar registros DNS de Resend en Cloudflare
# Uso: ./scripts/add-resend-dns.sh

set -e

DOMAIN="quilmescorrugados.com.ar"
ZONE_ID="36438015dff267e666cbd4beeaeafef5" # Ya conocido
API_TOKEN="${CLOUDFLARE_API_TOKEN}"

if [ -z "$API_TOKEN" ]; then
    echo "❌ Error: CLOUDFLARE_API_TOKEN no está configurado"
    echo "   Configúralo con: export CLOUDFLARE_API_TOKEN='tu-token'"
    exit 1
fi

echo "🔐 Configurando DNS para Resend - $DOMAIN"
echo "=========================================="
echo ""

# Función para agregar registro DNS
add_dns_record() {
    local name=$1
    local type=$2
    local content=$3
    
    echo "➕ Agregando: $name ($type)"
    
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
        echo "   ✅ Agregado exitosamente"
    else
        error=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('errors', [{}])[0].get('message', 'Error desconocido'))" 2>/dev/null)
        # Si el error es que ya existe, está bien
        if [[ "$error" == *"already exists"* ]]; then
            echo "   ⚠️  Ya existe (OK)"
        else
            echo "   ❌ Error: $error"
        fi
    fi
    echo ""
}

# SPF Record (si no existe ya)
echo "📋 Paso 1: Verificando SPF existente..."
spf_exists=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=TXT&name=$DOMAIN" \
    -H "Authorization: Bearer $API_TOKEN" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print('yes' if any('spf' in r['content'].lower() for r in data.get('result', [])) else 'no')" 2>/dev/null)

if [ "$spf_exists" = "no" ]; then
    echo "   No existe SPF, agregando..."
    add_dns_record "@" "TXT" "v=spf1 include:resend.com ~all"
else
    echo "   ✅ SPF ya existe"
    echo ""
fi

# DMARC Record
echo "📋 Paso 2: Agregando DMARC..."
add_dns_record "_dmarc" "TXT" "v=DMARC1; p=none; rua=mailto:dmarc@$DOMAIN"

# DKIM Records - Resend te dará valores únicos
echo "📋 Paso 3: DKIM Records"
echo ""
echo "⚠️  IMPORTANTE: Resend te dará valores únicos de DKIM."
echo "   Debes obtenerlos desde: https://resend.com/domains"
echo ""
echo "   Una vez que tengas los valores, puedes agregarlos manualmente:"
echo ""
echo "   Ejemplo de comandos:"
echo "   curl -X POST 'https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records' \\"
echo "     -H 'Authorization: Bearer $API_TOKEN' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     --data '{\"type\":\"TXT\",\"name\":\"resend._domainkey\",\"content\":\"[valor-de-resend]\",\"ttl\":1}'"
echo ""

echo "✅ Registros básicos agregados!"
echo ""
echo "📋 Próximos pasos:"
echo "   1. Ve a https://resend.com/domains"
echo "   2. Agrega el dominio $DOMAIN"
echo "   3. Copia los valores DKIM que Resend te da"
echo "   4. Agrégalos en Cloudflare usando los comandos de arriba"
echo "   5. Espera 5-30 minutos para propagación"
echo "   6. Resend verificará automáticamente"
echo ""
echo "💡 O usa el script interactivo:"
echo "   ./scripts/add-resend-dkim.sh"
