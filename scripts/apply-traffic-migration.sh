#!/bin/bash
# Script para aplicar la migración de tráfico web usando la API de Supabase
# Requiere: SUPABASE_ACCESS_TOKEN y NEXT_PUBLIC_SUPABASE_URL

set -e

SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-sbp_cb3a6f16b979eb10176ecdbbbd26125267079d79}"
SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://fuzrrodnwzxuosokooyx.supabase.co}"

# Extraer project ref
PROJECT_REF=$(echo "$SUPABASE_URL" | sed -E 's|https?://([^.]+)\.supabase\.co.*|\1|')

if [ -z "$PROJECT_REF" ]; then
    echo "❌ Error: No se pudo extraer el project reference ID"
    exit 1
fi

echo "📦 Project Reference ID: $PROJECT_REF"
echo ""

# Leer el archivo SQL
SQL_FILE="supabase/migrations/015_web_traffic.sql"

if [ ! -f "$SQL_FILE" ]; then
    echo "❌ Error: No se encontró el archivo $SQL_FILE"
    exit 1
fi

echo "📄 Leyendo migración SQL..."
SQL_CONTENT=$(cat "$SQL_FILE")

# Escapar el SQL para JSON
SQL_ESCAPED=$(echo "$SQL_CONTENT" | python3 -c "import sys, json; print(json.dumps(sys.stdin.read()))")

echo "📤 Enviando migración a Supabase..."

# Usar la API de Supabase para ejecutar SQL
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $SQL_ESCAPED}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
    echo "❌ Error al aplicar migración: HTTP $HTTP_CODE"
    echo "   Respuesta: $RESPONSE_BODY"
    echo ""
    echo "💡 Alternativa: Ejecuta el SQL manualmente en Supabase Dashboard → SQL Editor"
    exit 1
fi

echo ""
echo "✅ Migración aplicada exitosamente!"
echo ""
echo "📋 Tablas creadas:"
echo "   ✓ web_visits"
echo "   ✓ active_sessions"
echo ""
echo "📊 Vistas creadas:"
echo "   ✓ traffic_live_stats"
echo "   ✓ top_pages_24h"
echo "   ✓ traffic_sources_24h"
echo "   ✓ device_stats_24h"
echo "   ✓ country_stats_24h"
echo ""
echo "🔧 Funciones creadas:"
echo "   ✓ cleanup_inactive_sessions()"
echo "   ✓ get_hourly_visits()"
echo ""
echo "🎉 ¡Listo! El tracking de tráfico está activo."
