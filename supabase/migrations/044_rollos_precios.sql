-- Precios de los rollos de cartón corrugado para embalaje.
--
-- POR QUE
--
-- La fábrica vende rollos y el bot no lo sabía: en septiembre de 2026 contestó
-- "no tengo la certeza de si vendemos rollos" a clientes que pedían 20, 30 y 40
-- rollos por semana, y Florencia (o Julián) tuvo que cotizar a mano cada vez.
--
-- Una fila por medida. precio_unitario es el precio por rollo, sin IVA y sin
-- envío. Si la medida tiene precio mayorista, se aplica al pedido ENTERO desde
-- mayorista_desde rollos. Se edita desde Configuración → Rollos, y el bot lo
-- lee de acá.
--
-- Los precios de arranque son los que se pasaron por WhatsApp en septiembre:
--   1,20 x 25 m  $15.750; desde 100 rollos $13.500  (Florencia, 03-09)
--   1,20 x 20 m  $13.500                             (Julián, 27-08, "por mayor")
--   1,00 x 25 m  $13.200                             (Florencia, 28-09, 40 rollos)

create table if not exists public.rollos_precios (
  id uuid primary key default gen_random_uuid(),
  ancho_m numeric not null check (ancho_m > 0),
  largo_m numeric not null check (largo_m > 0),
  precio_unitario numeric not null check (precio_unitario > 0),
  precio_mayorista numeric check (precio_mayorista is null or precio_mayorista > 0),
  mayorista_desde integer check (mayorista_desde is null or mayorista_desde > 1),
  activo boolean not null default true,
  orden integer not null default 0,
  updated_at timestamptz not null default now(),
  -- Precio mayorista y su umbral van juntos o no van.
  constraint rollos_mayorista_completo
    check ((precio_mayorista is null) = (mayorista_desde is null)),
  unique (ancho_m, largo_m)
);

-- Se lee y escribe con la service role, después de comprobar la sesión (mismo
-- patrón que pricing_config y whatsapp_conversations).
alter table public.rollos_precios enable row level security;

insert into public.rollos_precios (ancho_m, largo_m, precio_unitario, precio_mayorista, mayorista_desde, orden)
values
  (1.20, 25, 15750, 13500, 100, 1),
  (1.20, 20, 13500, null, null, 2),
  (1.00, 25, 13200, null, null, 3)
on conflict (ancho_m, largo_m) do nothing;
