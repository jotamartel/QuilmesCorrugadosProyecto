-- Backfill: los pagos por transferencia y efectivo que nunca llegaron a payments.
--
-- POR QUE
--
-- El PATCH /orders/[id]/payment insertaba en payments SOLO cuando el metodo
-- era cheque. Transferencia y efectivo apenas pintaban el flag en orders, asi
-- que /pagos y cualquier reporte contable sobre payments mienten. Verificado
-- fila por fila contra la base (2026-08-23): son OCHO faltantes en 6 ordenes —
-- OC-2026-0001 (seña y saldo, transferencia), 0002 (seña, CHEQUE: ni el camino
-- del cheque era confiable siempre), 0003 (seña, efectivo), 0004 (seña,
-- transferencia), 0005 (seña y saldo, transferencia), 0006 (saldo,
-- transferencia). Por eso el backfill NO filtra por metodo: recupera todo lo
-- pagado que no tenga fila, sea cual sea el camino que fallo.
--
-- CUANDO CORRERLA — DESPUES del deploy de la etapa 4 (el fix del endpoint).
-- Si se corre antes, los pagos que entren entre la migracion y el deploy
-- vuelven a quedar afuera y el backfill nace incompleto.
--
-- Idempotente: el NOT EXISTS impide duplicar si se corre dos veces.
--
-- Verificacion previa (cuantas filas va a crear):
--   select count(*) from orders o
--   where o.deposit_status='paid' and o.deposit_method is not null
--     and not exists (select 1 from payments p where p.order_id=o.id and p.type='deposit');
-- (y lo simetrico para balance). Esperado al 2026-08-23: 8 en total.
--
-- Verificacion posterior:
--   select count(*) from payments where notes like 'Backfill 2026-08%';  -- 8

insert into public.payments (
  order_id, client_id, type, amount, method, status, notes, created_at, updated_at
)
select o.id, o.client_id, 'deposit', o.deposit_amount, o.deposit_method, 'completed',
       'Backfill 2026-08: pago registrado en orders.deposit_* sin fila en payments',
       coalesce(o.deposit_paid_at, o.updated_at, now()), now()
from public.orders o
where o.deposit_status = 'paid'
  and o.deposit_amount is not null
  and o.deposit_method is not null
  and not exists (
    select 1 from public.payments p where p.order_id = o.id and p.type = 'deposit'
  );

insert into public.payments (
  order_id, client_id, type, amount, method, status, notes, created_at, updated_at
)
select o.id, o.client_id, 'balance', o.balance_amount, o.balance_method, 'completed',
       'Backfill 2026-08: pago registrado en orders.balance_* sin fila en payments',
       coalesce(o.balance_paid_at, o.updated_at, now()), now()
from public.orders o
where o.balance_status = 'paid'
  and o.balance_amount is not null
  and o.balance_method is not null
  and not exists (
    select 1 from public.payments p where p.order_id = o.id and p.type = 'balance'
  );
