-- El reforzado de 130 libras como material cotizable.
--
-- Florencia lo usa seguido para cajas de 15 a 20 kilos: mismo espesor que la
-- onda simple (onda C, 4 mm) con papel más pesado, más barato que el doble
-- triple. Se suma a los reforzados de la 040 con las mismas reglas: un precio
-- por m², siempre a pedido, null = no se ofrece.
--
-- El mínimo que era "del doble triple" pasa a ser de todos los reforzados, y
-- se renombra para que el nombre no mienta.

alter table public.pricing_config
  add column if not exists price_per_m2_r130 numeric;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pricing_config'
      and column_name = 'min_m2_doble_triple'
  ) then
    alter table public.pricing_config rename column min_m2_doble_triple to min_m2_reforzado;
  end if;
end $$;

alter table public.pricing_config
  drop constraint if exists pricing_config_doble_triple_positivo;
alter table public.pricing_config
  drop constraint if exists pricing_config_reforzado_positivo;
alter table public.pricing_config
  add constraint pricing_config_reforzado_positivo
  check (
    (price_per_m2_r130 is null or price_per_m2_r130 > 0) and
    (price_per_m2_dt120 is null or price_per_m2_dt120 > 0) and
    (price_per_m2_dt150 is null or price_per_m2_dt150 > 0)
  );

alter table public.public_quotes
  drop constraint if exists public_quotes_material_valido;
alter table public.public_quotes
  add constraint public_quotes_material_valido
  check (material in ('simple', 'r130', 'dt120', 'dt150'));
