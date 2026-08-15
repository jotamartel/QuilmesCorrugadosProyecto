-- ============================================================================
-- 022 — El corte entre stock y produccion a medida, a la base
-- ============================================================================
-- El limite de 1.000 m2 separa los dos canales:
--
--     0 ──────────── 1.000 m² ──────────── 3.000 ────── 5.000 ──────►
--   /cajas  ███ stock ███ │ deriva al mayorista
--     home   deriva a /cajas │ bajo minimo │ estandar │ volumen
--
-- Hasta ahora ese numero estaba escrito en cuatro lugares del codigo
-- (QuoterForm.tsx, lib/utils/pricing.ts, lib/retail/config.ts y el chequeo del
-- endpoint), y en ninguno de la base: moverlo exigia un deploy. Los otros dos
-- cortes (min_m2_per_model y volume_threshold_m2) ya viven en pricing_config,
-- asi que este completa el juego.
--
-- Con los tres cortes en la base, cambiar donde termina un tramo se hace desde
-- el dashboard y vale para todos los canales, incluido el bot de WhatsApp.
-- ============================================================================

ALTER TABLE pricing_config
  ADD COLUMN IF NOT EXISTS wholesale_min_m2 NUMERIC NOT NULL DEFAULT 1000;

COMMENT ON COLUMN pricing_config.wholesale_min_m2 IS
  'm2 a partir de los cuales se produce a medida (canal mayorista). Por debajo se vende de stock al precio price_per_m2_retail desde /cajas. Es un unico limite: tope del minorista y piso del mayorista a la vez, para que los canales no se superpongan y un mismo volumen no pueda tener dos precios.';
