#!/bin/bash
# Script para verificar registros DNS de Resend
# Uso: ./scripts/verify-resend-dns.sh

DOMAIN="quilmescorrugados.com.ar"

echo "🔍 Verificando Registros DNS de Resend"
echo "======================================"
echo ""

# Verificar SPF
echo "📋 SPF Record:"
spf=$(dig +short TXT $DOMAIN | grep -i spf || echo "No encontrado")
if [[ "$spf" == *"resend.com"* ]]; then
    echo "   ✅ SPF configurado correctamente"
    echo "   $spf"
else
    echo "   ❌ SPF no encontrado o no incluye resend.com"
fi
echo ""

# Verificar DMARC
echo "📋 DMARC Record:"
dmarc=$(dig +short TXT _dmarc.$DOMAIN || echo "No encontrado")
if [[ "$dmarc" == *"DMARC1"* ]]; then
    echo "   ✅ DMARC configurado"
    echo "   $dmarc"
else
    echo "   ⚠️  DMARC no encontrado (opcional pero recomendado)"
fi
echo ""

# Verificar DKIM (intentar nombres comunes)
echo "📋 DKIM Records:"
dkim_found=false

for dkim_name in "resend._domainkey" "default._domainkey" "resend1._domainkey"; do
    dkim=$(dig +short TXT $dkim_name.$DOMAIN 2>/dev/null || echo "")
    if [ -n "$dkim" ] && [ "$dkim" != "No encontrado" ]; then
        echo "   ✅ DKIM encontrado: $dkim_name"
        echo "   $dkim"
        dkim_found=true
    fi
done

if [ "$dkim_found" = false ]; then
    echo "   ❌ No se encontraron registros DKIM"
    echo "   Verifica en Resend dashboard los nombres exactos"
fi
echo ""

echo "📋 Verifica en Resend Dashboard:"
echo "   https://resend.com/domains"
echo ""
echo "💡 Los registros pueden tardar 5-30 minutos en propagarse"
