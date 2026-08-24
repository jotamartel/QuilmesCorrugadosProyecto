-- Historial de ajustes al confirmar cantidades entregadas.
--
-- POR QUE
--
-- confirm-quantities recalcula subtotal, total y balance_amount de la orden y
-- PISA los valores anteriores. El presupuesto original desaparece: si hay un
-- reclamo ("me cotizaste X y me cobraste Y") no queda con que reconstruirlo.
-- Cada ejecucion deja aca una fila con el snapshot completo de antes y de
-- despues — snapshot y no delta, para que la reconstruccion sea leer una fila
-- y no sumar diferencias.
--
-- RLS prendido con cero policies, patron de la casa: cualquier lectura con el
-- cliente de sesion devuelve vacio; todos los handlers usan createAdminClient.

create table if not exists public.order_quantity_adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,

  -- Snapshot ANTES del ajuste, tal como estaba la orden.
  previous_subtotal        numeric(14,2) not null,
  previous_total           numeric(14,2) not null,
  previous_balance_amount  numeric(14,2) not null,
  previous_total_m2        numeric(12,2) not null,

  -- Lo entregado que dispara el ajuste: suma de quantity_delivered * m2_per_box.
  delivered_total_m2       numeric(12,2) not null,

  -- Snapshot DESPUES, igual a lo que se escribe en orders.
  new_subtotal             numeric(14,2) not null,
  new_total                numeric(14,2) not null,
  new_balance_amount       numeric(14,2) not null,

  -- delivered / original * 100. Guardado calculado para que los reportes no
  -- lo re-deriven cada vez.
  precision_percent        numeric(6,2)  not null,

  -- Email de la sesion. Nullable: hoy el handler no valida sesion (la
  -- compuerta del proxy si) y no queremos atar esta tabla a ese cambio.
  adjusted_by              text,
  adjusted_at              timestamptz not null default now(),
  notes                    text
);

alter table public.order_quantity_adjustments enable row level security;

-- Los reportes buscan por orden y ordenan por fecha.
create index if not exists order_quantity_adjustments_order_id_adjusted_at_idx
  on public.order_quantity_adjustments (order_id, adjusted_at desc);

comment on table public.order_quantity_adjustments is
  'Snapshot de cada confirmacion de cantidades: el presupuesto original ya no se pierde al recalcular. Ver confirm-quantities.';
