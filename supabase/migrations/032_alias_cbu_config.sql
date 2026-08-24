-- Los datos bancarios para transferencias, como configuracion.
--
-- Hoy el alias no vive en NINGUN lado del sistema: se tipea a mano en cada
-- chat. Estas cinco keys son la unica fuente; las leen la pagina publica de la
-- cotizacion, la herramienta datos_para_transferir del agente de WhatsApp y
-- los avisos automaticos — los tres por el mismo helper, asi un cambio de
-- banco cambia en los tres lugares a la vez.
--
-- Se siembran VACIAS a proposito: quien las carga es Fernando, desde
-- /configuracion → Empresa. Mientras falte cualquiera de las cuatro
-- obligatorias (alias, cbu, titular, cuit), getBankDataForClient() devuelve
-- null y cada consumidor cae a su texto anterior — nunca un "CBU: undefined"
-- delante de un cliente.
--
-- Idempotente: ON CONFLICT DO NOTHING no pisa valores ya cargados.

insert into public.system_config (key, value, description) values
  ('payment_bank_alias',  '', 'Alias bancario para transferencias entrantes (ej: quilmes.corrugados)'),
  ('payment_bank_cbu',    '', 'CBU/CVU de 22 digitos para transferencias entrantes'),
  ('payment_bank_holder', '', 'Titular de la cuenta bancaria (razon social o nombre)'),
  ('payment_bank_cuit',   '', 'CUIT del titular de la cuenta (formato XX-XXXXXXXX-X)'),
  ('payment_bank_name',   '', 'Banco donde vive la cuenta (opcional, informativo)')
on conflict (key) do nothing;
