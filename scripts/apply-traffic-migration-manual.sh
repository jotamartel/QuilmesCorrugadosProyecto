#!/bin/bash
# Script para mostrar el SQL de la migración de tráfico web
# Copia y pega el SQL en Supabase Dashboard → SQL Editor

echo "📋 Migración SQL para Tráfico Web"
echo "=================================="
echo ""
echo "1. Ve a: https://supabase.com/dashboard/project/fuzrrodnwzxuosokooyx/sql/new"
echo "2. Copia y pega el siguiente SQL:"
echo ""
echo "---"
cat supabase/migrations/015_web_traffic.sql
echo "---"
echo ""
echo "3. Haz clic en 'Run' para ejecutar"
echo ""
echo "✅ Después de ejecutar, el tracking de tráfico estará activo"
