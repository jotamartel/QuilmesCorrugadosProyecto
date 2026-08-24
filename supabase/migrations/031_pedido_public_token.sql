-- Token publico para la pagina /pedido/[token].
--
-- POR QUE UN TOKEN Y NO EL UUID DE LA ORDEN
--
-- El UUID de una orden viaja hoy por caminos internos: el dashboard, mails al
-- equipo, logs de Vercel, Supabase Studio. Publicarlo como URL le daria una
-- tercera vida a la misma llave: si un dia se filtra un UUID por otro camino
-- (un log pegado en un ticket, un screenshot del panel), no queremos que
-- ademas sea la puerta publica del pedido. Se separan las dos vidas del
-- identificador.
--
-- FORMA
--
-- 22 caracteres base64url (alfabeto [A-Za-z0-9_-]), lo que sale de 16 bytes
-- aleatorios: 128 bits de entropia, adivinarlo por fuerza bruta es inviable.
-- Se genera en la base y no en la app para que la responsabilidad viva en un
-- solo lugar y ningun insert futuro pueda olvidarse de llenarlo. Postgres 15
-- no tiene el codec 'base64url' de PG17: se arma con encode base64 + rtrim
-- del '=' + translate de '+/' a '-_'.
--
-- ORDEN DE LAS SENTENCIAS
--
-- Columna nullable primero, despues el default, despues el backfill, y recien
-- cuando ninguna fila queda en null se puede exigir NOT NULL. Al reves falla.
--
-- ROTACION SI UN LINK SE FILTRA
--
-- Se corre a mano desde Supabase Studio; el link viejo pasa a devolver 404:
--
--   UPDATE orders SET public_token =
--     translate(rtrim(encode(gen_random_bytes(16), 'base64'), '='), '+/', '-_')
--   WHERE id = '{uuid_de_la_orden}';

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS public_token TEXT;

-- Default para inserts nuevos: el convert y el futuro POST /api/orders no
-- tocan esta columna, se llena sola.
ALTER TABLE orders ALTER COLUMN public_token
  SET DEFAULT translate(rtrim(encode(gen_random_bytes(16), 'base64'), '='), '+/', '-_');

-- Backfill de las ordenes existentes. gen_random_bytes es VOLATILE: se evalua
-- una vez por fila, no un mismo token para todas.
UPDATE orders SET public_token =
  translate(rtrim(encode(gen_random_bytes(16), 'base64'), '='), '+/', '-_')
WHERE public_token IS NULL;

ALTER TABLE orders ALTER COLUMN public_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_public_token_unique_idx
  ON orders(public_token);

-- El contrato de forma queda escrito en la base, para quien lea la tabla sin
-- abrir el codigo. {22,} y no {22}: si algun dia se sube la entropia, los
-- tokens nuevos son mas largos y los viejos siguen validos.
ALTER TABLE orders ADD CONSTRAINT orders_public_token_shape_ck
  CHECK (public_token ~ '^[A-Za-z0-9_-]{22,}$');

COMMENT ON COLUMN orders.public_token IS
  'Llave de la pagina publica /pedido/[token]. La genera la base al insertar. Rotarla invalida el link anterior.';
