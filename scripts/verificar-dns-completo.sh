#!/bin/bash
# Script completo para verificar el estado de DNS del dominio
# Verifica: resolución básica, nameservers, registros de Resend, y propagación

set -e

DOMAIN="quilmescorrugados.com.ar"
CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-1nrmMTsLU5M7mzlj5pXoTeBktZT3br3DA7Jmusz0}"
ZONE_ID="36438015dff267e666cbd4beeaeafef5"

echo "🔍 Verificación Completa de DNS para $DOMAIN"
echo "=" | head -c 60 && echo ""
echo ""

# Colores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Verificar resolución básica del dominio
echo "1️⃣ Verificación de Resolución Básica"
echo "-----------------------------------"

# Desde DNS local
LOCAL_RESULT=$(dig $DOMAIN A +short 2>/dev/null | head -1)
if [ -n "$LOCAL_RESULT" ]; then
    echo -e "${GREEN}✅ DNS Local:${NC} $DOMAIN → $LOCAL_RESULT"
else
    echo -e "${RED}❌ DNS Local:${NC} No resuelve"
fi

# Desde Google DNS
GOOGLE_RESULT=$(dig @8.8.8.8 $DOMAIN A +short 2>/dev/null | head -1)
if [ -n "$GOOGLE_RESULT" ]; then
    echo -e "${GREEN}✅ Google DNS (8.8.8.8):${NC} $DOMAIN → $GOOGLE_RESULT"
else
    echo -e "${RED}❌ Google DNS:${NC} No resuelve"
fi

# Desde Cloudflare DNS
CF_RESULT=$(dig @1.1.1.1 $DOMAIN A +short 2>/dev/null | head -1)
if [ -n "$CF_RESULT" ]; then
    echo -e "${GREEN}✅ Cloudflare DNS (1.1.1.1):${NC} $DOMAIN → $CF_RESULT"
else
    echo -e "${RED}❌ Cloudflare DNS:${NC} No resuelve"
fi

echo ""

# 2. Verificar Nameservers
echo "2️⃣ Verificación de Nameservers"
echo "-----------------------------------"

NS_RESULT=$(dig NS $DOMAIN +short 2>/dev/null)
if [ -n "$NS_RESULT" ]; then
    echo -e "${GREEN}✅ Nameservers configurados:${NC}"
    echo "$NS_RESULT" | sed 's/^/   - /'
    
    # Verificar que sean los de Cloudflare
    if echo "$NS_RESULT" | grep -q "cloudflare.com"; then
        echo -e "${GREEN}   ✅ Nameservers de Cloudflare detectados${NC}"
    else
        echo -e "${YELLOW}   ⚠️  Nameservers no son de Cloudflare${NC}"
    fi
else
    echo -e "${RED}❌ Nameservers:${NC} No se pueden obtener (NXDOMAIN)"
fi

echo ""

# 3. Verificar registros DNS en Cloudflare
echo "3️⃣ Verificación de Registros DNS en Cloudflare"
echo "-----------------------------------"

if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
    # Registro A
    A_RECORD=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&name=$DOMAIN" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" | \
        python3 -c "import sys, json; data=json.load(sys.stdin); print(data['result'][0]['content'] if data['result'] else '')" 2>/dev/null)
    
    if [ -n "$A_RECORD" ]; then
        echo -e "${GREEN}✅ Registro A:${NC} $DOMAIN → $A_RECORD"
        if [ "$A_RECORD" = "76.76.21.21" ]; then
            echo -e "${GREEN}   ✅ IP correcta (Vercel)${NC}"
        else
            echo -e "${YELLOW}   ⚠️  IP diferente a la esperada${NC}"
        fi
    else
        echo -e "${RED}❌ Registro A:${NC} No encontrado en Cloudflare"
    fi
    
    # Registros de Resend
    echo ""
    echo "   📧 Registros de Resend:"
    
    # SPF
    SPF_RECORD=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=TXT&name=send.$DOMAIN" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" | \
        python3 -c "import sys, json; data=json.load(sys.stdin); print('Found' if data['result'] else '')" 2>/dev/null)
    
    if [ -n "$SPF_RECORD" ]; then
        echo -e "${GREEN}   ✅ SPF (send):${NC} Configurado"
    else
        echo -e "${RED}   ❌ SPF (send):${NC} No encontrado"
    fi
    
    # DKIM
    DKIM_RECORD=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=TXT&name=resend._domainkey.$DOMAIN" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" | \
        python3 -c "import sys, json; data=json.load(sys.stdin); print('Found' if data['result'] else '')" 2>/dev/null)
    
    if [ -n "$DKIM_RECORD" ]; then
        echo -e "${GREEN}   ✅ DKIM (resend._domainkey):${NC} Configurado"
    else
        echo -e "${RED}   ❌ DKIM (resend._domainkey):${NC} No encontrado"
    fi
    
    # DMARC
    DMARC_RECORD=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=TXT&name=_dmarc.$DOMAIN" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" | \
        python3 -c "import sys, json; data=json.load(sys.stdin); print('Found' if data['result'] else '')" 2>/dev/null)
    
    if [ -n "$DMARC_RECORD" ]; then
        echo -e "${GREEN}   ✅ DMARC (_dmarc):${NC} Configurado"
    else
        echo -e "${YELLOW}   ⚠️  DMARC (_dmarc):${NC} No encontrado (opcional)"
    fi
else
    echo -e "${YELLOW}⚠️  CLOUDFLARE_API_TOKEN no configurado, omitiendo verificación de Cloudflare${NC}"
fi

echo ""

# 4. Verificar desde múltiples DNS públicos
echo "4️⃣ Verificación de Propagación DNS"
echo "-----------------------------------"

DNS_SERVERS=(
    "8.8.8.8:Google"
    "1.1.1.1:Cloudflare"
    "208.67.222.222:OpenDNS"
    "9.9.9.9:Quad9"
)

RESOLVED_COUNT=0
TOTAL_COUNT=${#DNS_SERVERS[@]}

for server_info in "${DNS_SERVERS[@]}"; do
    IFS=':' read -r ip name <<< "$server_info"
    result=$(dig @$ip $DOMAIN A +short 2>/dev/null | head -1)
    if [ -n "$result" ]; then
        echo -e "${GREEN}✅ $name ($ip):${NC} $result"
        ((RESOLVED_COUNT++))
    else
        echo -e "${RED}❌ $name ($ip):${NC} No resuelve"
    fi
done

echo ""
echo "📊 Resumen de Propagación: $RESOLVED_COUNT/$TOTAL_COUNT servidores DNS resuelven el dominio"

if [ $RESOLVED_COUNT -eq $TOTAL_COUNT ]; then
    echo -e "${GREEN}✅ Propagación completa${NC}"
elif [ $RESOLVED_COUNT -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Propagación parcial (en curso)${NC}"
else
    echo -e "${RED}❌ El dominio no resuelve desde ningún DNS público${NC}"
    echo ""
    echo "💡 Posibles causas:"
    echo "   1. Nameservers no delegados en NIC Argentina"
    echo "   2. Propagación DNS aún en curso (espera 15-30 min)"
    echo "   3. Problema con la configuración en Cloudflare"
fi

echo ""
echo "=" | head -c 60 && echo ""
echo ""
echo "🔗 Verificar en herramientas online:"
echo "   - https://dnschecker.org/#A/$DOMAIN"
echo "   - https://www.whatsmydns.net/#A/$DOMAIN"
echo ""
echo "📧 Estado en Resend:"
echo "   - https://resend.com/domains"
echo "   (El dominio debe mostrar 'Verified' y todos los registros verificados)"
