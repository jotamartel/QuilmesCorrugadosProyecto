-- Script SQL para verificar si la migración 017 está aplicada
-- Ejecutar en Supabase Dashboard → SQL Editor

-- Verificar campos en pricing_config
SELECT 
  'pricing_config' as tabla,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'pricing_config' 
  AND column_name = 'price_per_m2_below_minimum';

-- Verificar campos en public_quotes
SELECT 
  'public_quotes' as tabla,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'public_quotes' 
  AND column_name IN (
    'is_below_minimum',
    'requested_quantity_below_minimum',
    'price_per_m2_applied',
    'accepted_below_minimum_terms',
    'requested_contact',
    'distance_km',
    'is_free_shipping',
    'design_preview_url'
  )
ORDER BY column_name;

-- Resumen: Si todos los campos aparecen, la migración está aplicada
-- Si faltan campos, ejecuta la migración 017_below_minimum_quotes.sql
