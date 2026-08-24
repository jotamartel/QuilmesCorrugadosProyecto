-- Avisos por WhatsApp del ciclo de vida de la orden, con idempotencia en la base.
--
-- EL UNIQUE ES LA PIEZA CENTRAL
--
-- El motor (src/lib/notificaciones-pedido.ts, etapa 8) intenta el INSERT antes
-- de llamar a Meta. Si viola el unique (order_id, evento), devuelve
-- 'ya_enviada' y NO llama. Asi el doble disparo real que existe hoy —el
-- despacho formal y el cambio de estado pueden pisar el mismo evento— se
-- resuelve en la base y no con memoria del codigo.
--
-- 'omitida' NO es error: cliente sin whatsapp, opt-out, alias sin cargar,
-- telefono con basura historica. Cada caso queda con su motivo para que quien
-- atiende vea "no salio, y esta bien" distinto de "no salio, hay un problema".

create table if not exists public.order_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,

  -- El CHECK evita que un caller invente un evento sin pasar por el motor,
  -- que es el unico lugar donde se agrega uno nuevo, atado a su plantilla.
  evento text not null check (evento in (
    'confirmada','en_produccion','saldo_actualizado',
    'despachada','entregada','cancelada'
  )),
  plantilla text not null,
  canal text not null default 'whatsapp' check (canal in ('whatsapp')),
  telefono_destino text,
  variables jsonb not null default '{}'::jsonb,
  resultado text not null check (resultado in ('enviada','sin_soporte','error','omitida')),
  motivo text,
  actor text not null default 'sistema',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_order_notif_evento unique (order_id, evento)
);

create index if not exists idx_order_notifications_order  on public.order_notifications(order_id);
create index if not exists idx_order_notifications_evento on public.order_notifications(evento);

-- RLS prendido, cero policies, acceso solo por service_role. Patron de la casa.
alter table public.order_notifications enable row level security;

-- Opt-out por cliente. Default false: la promesa es "todos los movimientos".
-- Sin UI de gestion todavia; se cambia por SQL cuando un cliente lo pida.
alter table public.clients add column if not exists whatsapp_optout boolean not null default false;

comment on table public.order_notifications is
  'Avisos automaticos por WhatsApp. Unique (order_id, evento) = idempotencia. Ver src/lib/notificaciones-pedido.ts (etapa 8).';
comment on column public.clients.whatsapp_optout is
  'true = el motor de avisos no le manda nada y registra omitida/cliente_opt_out.';
