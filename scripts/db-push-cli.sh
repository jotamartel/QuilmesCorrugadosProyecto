#!/bin/bash
# Ejecuta supabase db push usando SUPABASE_DB_URL o SUPABASE_DB_PASSWORD
# Uso: ./scripts/db-push-cli.sh

set -e
cd "$(dirname "$0")/.."

# Cargar env
if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi
if [ -f .env.vercel ]; then
  set -a
  source .env.vercel
  set +a
fi

if [ -n "$SUPABASE_DB_URL" ]; then
  echo "Usando SUPABASE_DB_URL..."
  supabase db push --db-url "$SUPABASE_DB_URL"
elif [ -n "$SUPABASE_DB_PASSWORD" ] && [ -n "$NEXT_PUBLIC_SUPABASE_URL" ]; then
  PROJECT_REF=$(echo "$NEXT_PUBLIC_SUPABASE_URL" | sed -n 's|https://\([^.]*\)\.supabase\.co|\1|p')
  echo "Construyendo URL desde proyecto $PROJECT_REF..."
  supabase db push --db-url "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres"
else
  echo "Error: Necesitás SUPABASE_DB_URL o (SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL) en .env.local"
  exit 1
fi
