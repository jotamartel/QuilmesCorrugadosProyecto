-- Impresión: dos umbrales y un recargo, configurables desde el admin.
--
-- Hasta ahora el motor cobraba +15% por color SIEMPRE que hubiera impresión, y
-- daba la impresión por disponible desde wholesale_min_m2 (1.000 m²). Las dos
-- cosas estaban mal:
--
--   1. A partir de 3.000 m² el costo de impresión ya está incluido en el precio
--      por m². Cobrar el recargo ahí es cobrar dos veces.
--   2. Lo único que se cobra aparte es el polímero, que va a cargo del
--      comprador y se cotiza según el diseño, no según el volumen.
--
-- Qué pasa entre 1.000 y 3.000 m² todavía no está definido, por eso los tres
-- valores son columnas y no constantes: se resuelve desde el panel sin
-- deployar. Para no ofrecer impresión en esa franja, subir printing_min_m2
-- hasta igualar printing_included_min_m2.

ALTER TABLE pricing_config
  -- Desde qué volumen se ofrece impresión.
  ADD COLUMN IF NOT EXISTS printing_min_m2 numeric NOT NULL DEFAULT 1000,
  -- Desde qué volumen el costo de impresión ya viene incluido en el precio/m².
  ADD COLUMN IF NOT EXISTS printing_included_min_m2 numeric NOT NULL DEFAULT 3000,
  -- Recargo por color, solo entre printing_min_m2 y printing_included_min_m2.
  -- 0.15 = +15%. Poner 0 para que nunca haya recargo.
  ADD COLUMN IF NOT EXISTS printing_surcharge_per_color numeric NOT NULL DEFAULT 0.15;

COMMENT ON COLUMN pricing_config.printing_min_m2 IS
  'Desde qué m² se ofrece impresión. Igualarlo a printing_included_min_m2 para no ofrecerla por debajo de ese volumen.';
COMMENT ON COLUMN pricing_config.printing_included_min_m2 IS
  'Desde qué m² el costo de impresión ya está incluido en el precio por m². Encima de este valor no se aplica recargo por color.';
COMMENT ON COLUMN pricing_config.printing_surcharge_per_color IS
  'Recargo por cada color, como fracción (0.15 = +15%). Solo aplica entre printing_min_m2 y printing_included_min_m2.';

-- El polímero no lleva columna de precio a propósito: se cotiza caso por caso
-- según el diseño. Guardar un número acá invitaría a que alguien lo tome como
-- precio de lista y lo publique, que es lo que ya pasó con los colores de
-- impresión y con el horario de atención.
