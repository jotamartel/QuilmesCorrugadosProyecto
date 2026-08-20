-- El mínimo de compra pasa a medirse en m² de cartón, no en cantidad de cajas.
--
-- POR QUE
--
-- Por WhatsApp llegaban pedidos de cajas personalizadas y troqueladas por 50 o
-- 100 unidades. El sitio los habilitaba: el mínimo publicado era "100 cajas",
-- que en una caja chica son 34 m² de cartón. Una tirada personalizada a ese
-- volumen no se puede producir, así que cada una de esas consultas terminaba en
-- una explicación a mano.
--
-- El mínimo real de la fábrica es de superficie, no de unidades: lo que limita
-- es cuánto cartón entra en una tirada, y eso no depende de en cuántas cajas se
-- corte. Cien cajas grandes y mil chicas pueden ser el mismo pedido para la
-- máquina.
--
-- LOS TRES UMBRALES QUE QUEDAN
--
--   min_m2_pedido      500 m²  — piso absoluto. Menos que esto no se vende.
--   wholesale_min_m2  1000 m²  — desde acá se fabrica a medida: cualquier
--                                caja personalizada, troquelada o con
--                                impresión arranca en este volumen.
--   min_m2_per_model  3000 m²  — el escalón donde baja el precio.
--
-- Entre 500 y 1.000 m² solo se venden medidas estándar de catálogo, sin
-- impresión. Es la franja del cotizador minorista.

ALTER TABLE pricing_config
  ADD COLUMN IF NOT EXISTS min_m2_pedido numeric NOT NULL DEFAULT 500;

COMMENT ON COLUMN pricing_config.min_m2_pedido IS
  'Piso absoluto de venta, en m² de cartón. Por debajo no se cotiza: se informa el mínimo y cuántas cajas de esa medida hacen falta.';

-- Los umbrales de personalización e impresión son el mismo número por decisión
-- comercial: alcanzar los 1.000 m² es lo que habilita fabricar a medida, y con
-- eso viene la impresión. Se dejan como columnas separadas igual, porque nada
-- garantiza que sigan juntos.
UPDATE pricing_config
SET printing_min_m2 = wholesale_min_m2
WHERE is_active = true AND printing_min_m2 <> wholesale_min_m2;
