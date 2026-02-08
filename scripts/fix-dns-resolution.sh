#!/bin/bash
# Script para diagnosticar y arreglar problemas de resolución DNS
# Uso: ./scripts/fix-dns-resolution.sh

set -e

DOMAIN="quilmescorrugados.com.ar"
ZONE_ID="36438015dff267e666cbd4beeaeafef5"
VERCEL_IP="76.76.21.21"
API_TOKEN="${CLOUDFLARE_API_TOKEN}"

if [ -z "$API_TOKEN" ]; then
    echo "❌ Error: CLOUDFLARE_API_TOKEN no está configurado"
    exit 1
fi

echo "🔍 Diagnóstico DNS - $DOMAIN"
echo "=============================="
echo ""

# Verificar registro A existe
echo "1️⃣ Verificando registro A en Cloudflare..."
a_record=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&name=$DOMAIN" \
    -H "Authorization: Bearer $API_TOKEN" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data['result'][0]['content'] if data['result'] else 'NO_EXISTS')" 2>/dev/null)

if [ "$a_record" = "NO_EXISTS" ] || [ -z "$a_record" ]; then
    echo "   ❌ Registro A no existe, creándolo..."
    curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
        -H "Authorization: Bearer $API_TOKEN" \
        -H "Content-Type: application/json" \
        --data "{\"type\":\"A\",\"name\":\"@\",\"content\":\"$VERCEL_IP\",\"ttl\":1,\"proxied\":false}" > /dev/null
    echo "   ✅ Registro A creado"
else
    echo "   ✅ Registro A existe: $a_record"
    
    if [ "$a_record" != "$VERCEL_IP" ]; then
        echo "   ⚠️  IP incorrecta, actualizando..."
        record_id=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&name=$DOMAIN" \
            -H "Authorization: Bearer $API_TOKEN" | \
            python3 -c "import sys, json; data=json.load(sys.stdin); print(data['result'][0]['id'] if data['result'] else '')" 2>/dev/null)
        
        curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$record_id" \
            -H "Authorization: Bearer $API_TOKEN" \
            -H "Content-Type: application/json" \
            --data "{\"content\":\"$VERCEL_IP\",\"ttl\":1,\"proxied\":false}" > /dev/null
        echo "   ✅ IP actualizada a $VERCEL_IP"
    fi
fi
echo ""

# Verificar resolución desde diferentes DNS
echo "2️⃣ Verificando resolución DNS desde diferentes servidores..."
echo ""

echo "   Google DNS (8.8.8.8):"
google_result=$(dig @8.8.8.8 +short $DOMAIN A 2>&1 || echo "ERROR")
if [ "$google_result" = "ERROR" ] || [ -z "$google_result" ]; then
    echo "      ❌ No resuelve"
else
    echo "      ✅ Resuelve a: $google_result"
fi

echo "   Cloudflare DNS (1.1.1.1):"
cf_result=$(dig @1.1.1.1 +short $DOMAIN A 2>&1 || echo "ERROR")
if [ "$cf_result" = "ERROR" ] || [ -z "$cf_result" ]; then
    echo "      ❌ No resuelve"
else
    echo "      ✅ Resuelve a: $cf_result"
fi

echo "   Nameserver de Cloudflare (meg.ns.cloudflare.com):"
ns_result=$(dig @meg.ns.cloudflare.com +short $DOMAIN A 2>&1 || echo "ERROR")
if [ "$ns_result" = "ERROR" ] || [ -z "$ns_result" ]; then
    echo "      ❌ No resuelve"
else
    echo "      ✅ Resuelve a: $ns_result"
fi
echo ""

# Verificar nameservers
echo "3️⃣ Verificando nameservers del dominio..."
ns_list=$(dig +short NS $DOMAIN 2>&1 | head -2)
if [[ "$ns_list" == *"cloudflare"* ]]; then
    echo "   ✅ Nameservers correctos:"
    echo "$ns_list" | sed 's/^/      /'
else
    echo "   ❌ Nameservers incorrectos o no encontrados"
    echo "   Actual: $ns_list"
fi
echo ""

# Verificar estado en Cloudflare
echo "4️⃣ Estado del dominio en Cloudflare..."
zone_status=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID" \
    -H "Authorization: Bearer $API_TOKEN" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data['result']['status'] if data['result'] else 'unknown')" 2>/dev/null)
echo "   Status: $zone_status"
echo ""

# Recomendaciones
echo "📋 Recomendaciones:"
echo ""

if [[ "$google_result" == *"ERROR"* ]] || [ -z "$google_result" ]; then
    echo "⚠️  El dominio no resuelve desde Google DNS."
    echo "   Esto puede ser por:"
    echo "   1. Propagación DNS incompleta (espera 5-30 minutos)"
    echo "   2. Problema con la delegación del dominio .com.ar"
    echo "   3. Cache DNS en tu móvil"
    echo ""
    echo "💡 Soluciones:"
    echo "   - Espera unos minutos y prueba de nuevo"
    echo "   - Limpia el cache DNS en tu móvil (reinicia o activa/desactiva WiFi)"
    echo "   - Verifica en NIC Argentina que los nameservers estén correctos"
fi

echo ""
echo "🔗 Verifica en:"
echo "   - Cloudflare Dashboard: https://dash.cloudflare.com"
echo "   - Vercel Dashboard: vercel domains inspect $DOMAIN"
echo "   - DNS Checker: https://dnschecker.org/#A/quilmescorrugados.com.ar"
