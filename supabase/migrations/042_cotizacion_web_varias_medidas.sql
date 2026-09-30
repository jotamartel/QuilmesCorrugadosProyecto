-- Todas las medidas de una cotización web, no solo la primera.
--
-- El formulario del sitio deja cargar varias medidas en un pedido, pero
-- public_quotes tiene columnas para UNA caja y los endpoints guardaban la
-- primera y tiraban el resto. Quien pedía tres medidas quedaba registrado con
-- una.
--
-- items guarda el pedido entero, una entrada por medida (ver
-- ItemDeCotizacionWeb en src/lib/cotizacion/web.ts). Las columnas de siempre
-- siguen teniendo la primera caja, para que nada de lo que ya las lee se rompa;
-- total_sqm y subtotal pasan a ser los del pedido entero.
--
-- Null en las consultas viejas y en las que no vienen del formulario (bot,
-- retail): quien lee cae a las columnas de la primera caja.

alter table public.public_quotes
  add column if not exists items jsonb;

alter table public.public_quotes
  drop constraint if exists public_quotes_items_es_lista;
alter table public.public_quotes
  add constraint public_quotes_items_es_lista
  check (items is null or jsonb_typeof(items) = 'array');
