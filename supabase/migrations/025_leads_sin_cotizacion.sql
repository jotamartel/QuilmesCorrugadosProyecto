-- Permitir guardar un lead que todavía no cotizó.
--
-- public_quotes se diseñó para el formulario del sitio, donde siempre están las
-- tres medidas, la cantidad y el teléfono. Cuando el agente empezó a guardar
-- consultas del chat aparecieron tres NOT NULL seguidos:
--
--   length_mm         -> alguien que dejó el nombre y todavía no dijo medidas
--   requester_phone   -> alguien que escribió desde la web y dejó solo el mail
--
-- En los dos casos el insert fallaba y el lead se perdía, que es exactamente lo
-- que veníamos de arreglar en WhatsApp con el RLS.
--
-- La alternativa era rellenar con ceros y cadenas vacías. Es peor: una
-- cotización de una caja de 0x0x0 para un teléfono "" no se distingue de un
-- dato real cargado mal, y ensucia los reportes y la segmentación de campañas.
-- Un null dice "no lo sabemos todavía", que es la verdad.

ALTER TABLE public_quotes
  ALTER COLUMN requester_phone DROP NOT NULL,
  ALTER COLUMN length_mm       DROP NOT NULL,
  ALTER COLUMN width_mm        DROP NOT NULL,
  ALTER COLUMN height_mm       DROP NOT NULL,
  ALTER COLUMN quantity        DROP NOT NULL;

-- requester_name se deja NOT NULL: siempre hay algo para poner ahí, aunque sea
-- "Consulta del chat", y una fila sin ningún identificador no le sirve a nadie.

COMMENT ON COLUMN public_quotes.length_mm IS
  'Null cuando la consulta entró por el chat y la persona todavía no dio medidas.';
COMMENT ON COLUMN public_quotes.requester_phone IS
  'Null cuando la consulta entró por la web y solo dejó email.';

-- Para no confundir un lead sin cotizar con una cotización de $0 en los
-- reportes: si no hay medidas, tampoco tiene que haber importes.
ALTER TABLE public_quotes
  ADD CONSTRAINT public_quotes_lead_o_cotizacion CHECK (
    (length_mm IS NOT NULL AND width_mm IS NOT NULL AND height_mm IS NOT NULL AND quantity IS NOT NULL)
    OR (length_mm IS NULL AND width_mm IS NULL AND height_mm IS NULL AND quantity IS NULL)
  );

-- Y al menos una forma de volver a contactar a la persona, o la fila no sirve.
ALTER TABLE public_quotes
  ADD CONSTRAINT public_quotes_algun_contacto CHECK (
    requester_phone IS NOT NULL OR requester_email IS NOT NULL
  );
