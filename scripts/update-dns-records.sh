#!/bin/bash
# Script para actualizar registros DNS en Cloudflare para Vercel
# Elimina CNAMEs existentes y agrega registros A

set -e

# Variables
DOMAIN="quilmescorrugados.com.ar"
VERCEL_IP="76.76.21.21"
ZONE_ID="36438015dff267e666cbd4beeaeafef5"
API_TOKEN="${CLOUDFLARE_API_TOKEN}"

if [ -z "$API_TOKEN" ]; then
    echo "❌ Error: CLOUDFLARE_API_TOKEN no está configurado"
    exit 1
fi

echo "🔍 Verificando registros existentes para $DOMAIN..."
echo ""

# Función para eliminar registro DNS
delete_dns_record() {
    local record_id=$1
    local record_name=$2
    
    echo "🗑️  Eliminando registro: $record_name (ID: $record_id)"
    
    response=$(curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$record_id" \
        -H "Authorization: Bearer $API_TOKEN" \
        -H "Content-Type: application/json")
    
    success=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['success'])" 2>/dev/null)
    
    if [ "$success" = "True" ]; then
        echo "   ✅ Registro eliminado exitosamente"
    else
        error=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('errors', [{}])[0].get('message', 'Error desconocido'))" 2>/dev/null)
        echo "   ⚠️  Error: $error"
    fi
    echo ""
}

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

# Obtener y eliminar CNAME existente para @
echo "📋 Buscando CNAME para $DOMAIN..."
cname_response=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=CNAME&name=$DOMAIN" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json")

cname_id=$(echo "$cname_response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['result'][0]['id'] if data['result'] else '')" 2>/dev/null)

if [ -n "$cname_id" ]; then
    delete_dns_record "$cname_id" "$DOMAIN"
fi

# Obtener y eliminar CNAME existente para www (si existe y no apunta a Vercel)
echo "📋 Buscando CNAME para www.$DOMAIN..."
www_cname_response=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=CNAME&name=www.$DOMAIN" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json")

www_cname_id=$(echo "$www_cname_response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['result'][0]['id'] if data['result'] else '')" 2>/dev/null)
www_cname_content=$(echo "$www_cname_response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['result'][0]['content'] if data['result'] else '')" 2>/dev/null)

if [ -n "$www_cname_id" ] && [[ ! "$www_cname_content" == *"vercel"* ]]; then
    echo "⚠️  www.$DOMAIN tiene CNAME a $www_cname_content (no es Vercel)"
    echo "   ¿Deseas reemplazarlo? (S/n): "
    read -r response
    if [ "$response" != "n" ] && [ "$response" != "N" ]; then
        delete_dns_record "$www_cname_id" "www.$DOMAIN"
    fi
fi

# Agregar registros A
add_dns_record "@" "A" "$VERCEL_IP"

# Solo agregar www si no existe o fue eliminado
if [ -z "$www_cname_id" ] || [[ "$www_cname_content" != *"vercel"* ]]; then
    add_dns_record "www" "A" "$VERCEL_IP"
fi

echo "✅ Proceso completado!"
echo ""
echo "📋 Próximos pasos:"
echo "   1. Espera 1-5 minutos para que los cambios se propaguen"
echo "   2. Vercel verificará automáticamente el dominio"
echo "   3. Recibirás un email cuando el dominio esté configurado"
echo ""
echo "🔍 Verifica el estado con:"
echo "   vercel domains inspect quilmescorrugados.com.ar"
