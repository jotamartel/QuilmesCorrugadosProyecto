/**
 * Migración 013: URL de Preview de Diseño
 *
 * - Agrega campo design_preview_url a public_quotes para mostrar imagen en vista 3D
 * - Para PDFs, se genera una imagen de preview; para imágenes, es la misma URL
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- CAMPO DESIGN_PREVIEW_URL EN PUBLIC_QUOTES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Campo para URL de imagen de preview (para vista 3D)
ALTER TABLE public_quotes ADD COLUMN IF NOT EXISTS design_preview_url TEXT;
COMMENT ON COLUMN public_quotes.design_preview_url IS 'URL de la imagen de preview del diseño (para mostrar en vista 3D)';

-- Para registros existentes con design_file_url que sean imágenes, copiar la URL
-- (Los PDFs no tendrán preview automáticamente, se generará en nuevas subidas)
UPDATE public_quotes
SET design_preview_url = design_file_url
WHERE design_file_url IS NOT NULL
  AND design_preview_url IS NULL
  AND (
    design_file_name ILIKE '%.png'
    OR design_file_name ILIKE '%.jpg'
    OR design_file_name ILIKE '%.jpeg'
    OR design_file_name ILIKE '%.webp'
  );
