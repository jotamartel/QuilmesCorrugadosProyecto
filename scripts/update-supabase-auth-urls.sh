#!/bin/bash
# Script para actualizar las URLs de redirect de OAuth en Supabase usando la API Management
# 
# Requisitos:
# - SUPABASE_ACCESS_TOKEN: Token de acceso de Supabase (obtener desde https://supabase.com/dashboard/account/tokens)
# - NEXT_PUBLIC_SUPABASE_URL: URL del proyecto (se extrae el project ref)
# 
# Uso:
#   SUPABASE_ACCESS_TOKEN=tu_token ./scripts/update-supabase-auth-urls.sh

set -e

# Cargar variables de entorno desde .env.local si existe
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

# Verificar que el token esté configurado
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "❌ Error: SUPABASE_ACCESS_TOKEN no está configurado"
  echo "   Obtén tu token desde: https://supabase.com/dashboard/account/tokens"
  echo "   Ejemplo: export SUPABASE_ACCESS_TOKEN=tu_token"
  exit 1
fi

# Obtener URL de Supabase (de .env.local o Vercel)
SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-${VERCEL_ENV_NEXT_PUBLIC_SUPABASE_URL}}"

if [ -z "$SUPABASE_URL" ]; then
  echo "❌ Error: NEXT_PUBLIC_SUPABASE_URL no está configurado"
  exit 1
fi

# Extraer project reference ID de la URL
# Ejemplo: https://xxxxx.supabase.co -> xxxxx
PROJECT_REF=$(echo "$SUPABASE_URL" | sed -E 's|https?://([^.]+)\.supabase\.co.*|\1|')

if [ -z "$PROJECT_REF" ] || [ "$PROJECT_REF" = "$SUPABASE_URL" ]; then
  echo "❌ Error: No se pudo extraer el project reference ID de la URL"
  echo "   URL recibida: $SUPABASE_URL"
  exit 1
fi

echo "📦 Project Reference ID: $PROJECT_REF"

# URLs que queremos agregar (formato: string separado por comas)
URI_ALLOW_LIST="https://quilmescorrugados.com.ar/auth/callback,https://quilmes-corrugados.vercel.app/auth/callback,http://localhost:3000/auth/callback"

SITE_URL="https://quilmescorrugados.com.ar"

echo ""
echo "🔧 Actualizando configuración de autenticación en Supabase..."
echo ""

# Obtener configuración actual
echo "📥 Obteniendo configuración actual..."
CURRENT_CONFIG=$(curl -s -X GET \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json")

if [ $? -ne 0 ]; then
  echo "❌ Error al obtener configuración"
  exit 1
fi

CURRENT_SITE_URL=$(echo "$CURRENT_CONFIG" | grep -o '"site_url":"[^"]*"' | cut -d'"' -f4 || echo "No configurada")
CURRENT_URI_ALLOW_LIST=$(echo "$CURRENT_CONFIG" | grep -o '"uri_allow_list":"[^"]*"' | cut -d'"' -f4 || echo "")

echo "✅ Configuración actual obtenida"
echo "   Site URL actual: $CURRENT_SITE_URL"
echo "   URI Allow List actual: $CURRENT_URI_ALLOW_LIST"

# Actualizar configuración
echo ""
echo "📤 Enviando actualización..."
UPDATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X PATCH \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
        -d "{
    \"site_url\": \"$SITE_URL\",
    \"uri_allow_list\": \"$URI_ALLOW_LIST\"
  }")

HTTP_CODE=$(echo "$UPDATE_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$UPDATE_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
  echo "❌ Error al actualizar configuración: HTTP $HTTP_CODE"
  echo "   Respuesta: $RESPONSE_BODY"
  exit 1
fi

echo ""
echo "✅ Configuración actualizada exitosamente!"
echo ""
echo "   Site URL: $SITE_URL"
echo "   Redirect URLs configuradas:"
echo "     ✓ https://quilmescorrugados.com.ar/auth/callback"
echo "     ✓ https://quilmes-corrugados.vercel.app/auth/callback"
echo "     ✓ http://localhost:3000/auth/callback"
echo ""
echo "🎉 ¡Listo! Las URLs de OAuth están configuradas en Supabase."
echo "   Puedes probar el login con Google ahora."
