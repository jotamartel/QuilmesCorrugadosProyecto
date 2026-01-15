-- =====================================================
-- Migración: Corrección de fórmula de cálculo de plancha
-- Fecha: 2026-01-14
--
-- Fórmula anterior (incorrecta):
-- - Ancho desplegado = 2L + 2A + 40 (solapas laterales)
-- - Largo desplegado = 2A + H + 80 (solapas arriba/abajo)
--
-- Fórmula correcta (cajas RSC con aletas simples):
-- - Ancho plancha = H + A (Alto + Ancho)
-- - Largo plancha = 2L + 2A + 50 (chapetón y refile)
-- - m² = (Ancho × Largo) / 1.000.000
-- =====================================================

-- Actualizar todas las cajas estándar con los valores correctos
-- Caja 20x20x10 (200x200x100)
UPDATE boxes
SET unfolded_width_mm = 300,   -- 100 + 200
    unfolded_length_mm = 850,  -- 2(200) + 2(200) + 50
    m2_per_box = 0.2550        -- 0.300 × 0.850
WHERE name = 'Caja 20x20x10' AND is_standard = true;

-- Caja 20x20x20 (200x200x200)
UPDATE boxes
SET unfolded_width_mm = 400,   -- 200 + 200
    unfolded_length_mm = 850,  -- 2(200) + 2(200) + 50
    m2_per_box = 0.3400        -- 0.400 × 0.850
WHERE name = 'Caja 20x20x20' AND is_standard = true;

-- Caja 30x20x15 (300x200x150)
UPDATE boxes
SET unfolded_width_mm = 350,   -- 150 + 200
    unfolded_length_mm = 1050, -- 2(300) + 2(200) + 50
    m2_per_box = 0.3675        -- 0.350 × 1.050
WHERE name = 'Caja 30x20x15' AND is_standard = true;

-- Caja 30x20x20 (300x200x200)
UPDATE boxes
SET unfolded_width_mm = 400,   -- 200 + 200
    unfolded_length_mm = 1050, -- 2(300) + 2(200) + 50
    m2_per_box = 0.4200        -- 0.400 × 1.050
WHERE name = 'Caja 30x20x20' AND is_standard = true;

-- Caja 40x30x30 (400x300x300)
UPDATE boxes
SET unfolded_width_mm = 600,   -- 300 + 300
    unfolded_length_mm = 1450, -- 2(400) + 2(300) + 50
    m2_per_box = 0.8700        -- 0.600 × 1.450
WHERE name = 'Caja 40x30x30' AND is_standard = true;

-- Caja 50x40x30 (500x400x300)
UPDATE boxes
SET unfolded_width_mm = 700,   -- 300 + 400
    unfolded_length_mm = 1850, -- 2(500) + 2(400) + 50
    m2_per_box = 1.2950        -- 0.700 × 1.850
WHERE name = 'Caja 50x40x30' AND is_standard = true;

-- Caja 50x40x40 (500x400x400)
UPDATE boxes
SET unfolded_width_mm = 800,   -- 400 + 400
    unfolded_length_mm = 1850, -- 2(500) + 2(400) + 50
    m2_per_box = 1.4800        -- 0.800 × 1.850
WHERE name = 'Caja 50x40x40' AND is_standard = true;

-- Caja 60x40x30 (600x400x300)
UPDATE boxes
SET unfolded_width_mm = 700,   -- 300 + 400
    unfolded_length_mm = 2050, -- 2(600) + 2(400) + 50
    m2_per_box = 1.4350        -- 0.700 × 2.050
WHERE name = 'Caja 60x40x30' AND is_standard = true;

-- Caja 60x40x40 (600x400x400)
UPDATE boxes
SET unfolded_width_mm = 800,   -- 400 + 400
    unfolded_length_mm = 2050, -- 2(600) + 2(400) + 50
    m2_per_box = 1.6400        -- 0.800 × 2.050
WHERE name = 'Caja 60x40x40' AND is_standard = true;

-- Caja 70x50x50 (700x500x500)
UPDATE boxes
SET unfolded_width_mm = 1000,  -- 500 + 500
    unfolded_length_mm = 2450, -- 2(700) + 2(500) + 50
    m2_per_box = 2.4500        -- 1.000 × 2.450
WHERE name = 'Caja 70x50x50' AND is_standard = true;

-- Actualizar también cualquier caja personalizada que no sea estándar
-- usando la fórmula correcta
UPDATE boxes
SET unfolded_width_mm = height_mm + width_mm,
    unfolded_length_mm = (2 * length_mm) + (2 * width_mm) + 50,
    m2_per_box = ROUND(((height_mm + width_mm) * ((2 * length_mm) + (2 * width_mm) + 50)) / 1000000.0, 4)
WHERE is_standard = false;

-- Verificación: mostrar el resultado de la caja 60x40x40 (debe ser 1.64 m²)
-- SELECT name, length_mm, width_mm, height_mm, unfolded_width_mm, unfolded_length_mm, m2_per_box
-- FROM boxes WHERE name = 'Caja 60x40x40';
