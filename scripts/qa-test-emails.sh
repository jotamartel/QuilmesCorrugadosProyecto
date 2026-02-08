#!/bin/bash
# Script de QA para probar todos los emails automáticos
# Uso: ./scripts/qa-test-emails.sh

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_URL="${API_URL:-$BASE_URL/api/v1/quote}"

echo "🧪 QA Test - Emails Automáticos"
echo "================================="
echo ""
echo "Base URL: $BASE_URL"
echo "API URL: $API_URL"
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para hacer request y verificar
test_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4
    
    echo -n "Testing: $name... "
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$url" \
            -H "Content-Type: application/json" \
            -d "$data" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X GET "$url" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✅ OK${NC} (HTTP $http_code)"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (HTTP $http_code)"
        echo "Response: $body" | head -5
        return 1
    fi
}

# Test 1: Lead con datos de contacto
echo "📧 Test 1: Lead con datos de contacto"
test_endpoint "Lead con contacto" "POST" "$API_URL" '{
  "boxes": [{
    "length_mm": 400,
    "width_mm": 300,
    "height_mm": 200,
    "quantity": 1000
  }],
  "contact": {
    "name": "Test QA",
    "email": "test@example.com",
    "phone": "+541169249801",
    "company": "Empresa Test"
  },
  "origin": "QA Test"
}'
echo ""

# Test 2: Cotización de alto valor (sin contacto)
echo "💰 Test 2: Cotización de alto valor"
test_endpoint "Alto valor" "POST" "$API_URL" '{
  "boxes": [{
    "length_mm": 600,
    "width_mm": 400,
    "height_mm": 400,
    "quantity": 10000
  }],
  "origin": "QA Test - Alto Valor"
}'
echo ""

# Test 3: Email inbound (simular webhook de Resend)
echo "📨 Test 3: Email entrante (webhook)"
test_endpoint "Email inbound" "POST" "$BASE_URL/api/email/inbound" '{
  "from": "cliente@example.com",
  "subject": "Necesito cotizar cajas de 40x30x20 cm, cantidad 500",
  "text": "Hola, necesito cotizar cajas de 40x30x20 cm, cantidad 500 unidades. Mi teléfono es +541169249801"
}'
echo ""

# Test 4: Retell registrar lead
echo "📞 Test 4: Lead desde Retell AI"
test_endpoint "Retell lead" "POST" "$BASE_URL/api/retell/registrar-lead" '{
  "nombre": "Cliente Test",
  "email": "cliente@example.com",
  "telefono": "+541169249801",
  "consulta": "Cotización de cajas",
  "cotizacion_id": "test-123"
}'
echo ""

echo "✅ Tests completados!"
echo ""
echo "📋 Verifica tu bandeja de entrada en:"
echo "   ${NOTIFICATION_EMAIL:-ventas@quilmescorrugados.com.ar}"
echo ""
echo "💡 Para ver logs en tiempo real:"
echo "   npm run dev | grep -i 'notification\|email\|resend'"
