-- El doble triple como material cotizable, en dos calidades.
--
-- POR QUE
--
-- Hasta acá la web y el bot cotizaban un solo cartón: onda simple de 90
-- libras. El historial de WhatsApp de septiembre muestra el costo: quien pedía
-- "doble triple, 7 mm" recibía el precio de la onda simple y Florencia lo
-- tenía que desmentir y recotizar a mano (300x300x240 por 5.000: el bot dijo
-- $607,50 por caja, el precio real en doble triple 120 liner era $1.215).
--
-- El doble triple se vende en dos calidades, cada una con su precio por m²,
-- que se carga desde el panel igual que el de la onda simple:
--
--   dt120   doble triple 120 liner
--   dt150   doble triple 150 kraft (papel puro, el más resistente)
--
-- Es UN precio por calidad, sin escalera de volumen. Null significa que esa
-- calidad no se ofrece en ningún canal: no sale ningún precio que el dueño no
-- haya fijado.
--
-- El mínimo es aparte del de la onda simple porque el doble triple es
-- siempre producción a pedido (no hay stock) y la puesta en máquina es otra.

alter table public.pricing_config
  add column if not exists price_per_m2_dt120 numeric,
  add column if not exists price_per_m2_dt150 numeric,
  add column if not exists min_m2_doble_triple numeric not null default 1000;

alter table public.pricing_config
  drop constraint if exists pricing_config_doble_triple_positivo;
alter table public.pricing_config
  add constraint pricing_config_doble_triple_positivo
  check (
    (price_per_m2_dt120 is null or price_per_m2_dt120 > 0) and
    (price_per_m2_dt150 is null or price_per_m2_dt150 > 0)
  );

-- El material de cada consulta, para que quien la atiende sepa qué se cotizó
-- sin tener que leer la conversación entera.
alter table public.public_quotes
  add column if not exists material text not null default 'simple';

alter table public.public_quotes
  drop constraint if exists public_quotes_material_valido;
alter table public.public_quotes
  add constraint public_quotes_material_valido
  check (material in ('simple', 'dt120', 'dt150'));
