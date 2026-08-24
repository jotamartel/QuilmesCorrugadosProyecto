'use client';

/**
 * El casillero antes de mover un pedido.
 *
 * Fernando lo pidió con estas palabras: "se le pone un casillero de validación
 * antes de cambiar de estado". Dos cosas a la vez:
 *
 *   1. Una confirmación donde no había ninguna. El kanban cambiaba el estado
 *      con soltar la tarjeta — un roce en el celular y el pedido se movía.
 *      Ahora, encima, ese movimiento le escribe al cliente.
 *   2. La decisión de avisar, VISIBLE. Tildado por default: la promesa fue
 *      "le notificás todos los movimientos", así que el silencio tiene que ser
 *      una elección, no lo que pasa por descuido.
 *
 * Muestra qué mensaje va a salir antes de que salga. Un aviso al cliente es
 * irreversible: no se puede desenviar un WhatsApp.
 */

import { Button } from '@/components/ui/button';
import { ORDER_STATUS_LABELS } from '@/lib/utils/format';
import { EVENTO_POR_ESTADO } from '@/lib/avisos/eventos';
import type { OrderStatus } from '@/lib/types/database';

/** Qué le va a llegar al cliente, en una frase. */
const QUE_DICE: Record<string, string> = {
  confirmada: 'Recibimos la seña, el pedido queda confirmado y agendado.',
  en_produccion: 'Empezamos a fabricar, con la fecha estimada de entrega.',
  despachada: 'El pedido salió y está en camino.',
  entregada: 'El pedido figura como entregado.',
  cancelada: 'El pedido fue cancelado, con la invitación a retomarlo.',
};

export interface ClienteDelAviso {
  name?: string;
  whatsapp?: string | null;
  whatsapp_optout?: boolean;
}

export function AvisoDeCambioDeEstado({
  abierto,
  nuevoEstado,
  cliente,
  notificar,
  onNotificarChange,
  onConfirmar,
  onCancelar,
  enviando,
}: {
  abierto: boolean;
  nuevoEstado: OrderStatus;
  cliente: ClienteDelAviso | null | undefined;
  notificar: boolean;
  onNotificarChange: (v: boolean) => void;
  onConfirmar: () => void;
  onCancelar: () => void;
  enviando?: boolean;
}) {
  if (!abierto) return null;

  const evento = EVENTO_POR_ESTADO[nuevoEstado];

  // Se puede avisar solo si hay a quién y quiere. Cuando no, el casillero se
  // deshabilita y dice POR QUÉ: "no se puede" sin motivo hace que alguien lo
  // clickee tres veces esperando que funcione.
  const motivoSinAviso = !evento
    ? 'Este estado no tiene aviso automático.'
    : !cliente
      ? 'El pedido no tiene cliente asociado.'
      : cliente.whatsapp_optout
        ? 'El cliente pidió no recibir avisos.'
        : !cliente.whatsapp
          ? 'El cliente no tiene WhatsApp cargado.'
          : null;

  const puedeAvisar = !motivoSinAviso;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Pasar a &laquo;{ORDER_STATUS_LABELS[nuevoEstado]}&raquo;
        </h2>

        <label
          className={`mt-4 flex items-start gap-3 p-3 rounded-lg border ${
            puedeAvisar
              ? 'border-gray-200 cursor-pointer hover:bg-gray-50'
              : 'border-gray-100 bg-gray-50'
          }`}
        >
          <input
            type="checkbox"
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
            checked={puedeAvisar && notificar}
            disabled={!puedeAvisar}
            onChange={(e) => onNotificarChange(e.target.checked)}
          />
          <span className="text-sm">
            <span className={puedeAvisar ? 'font-medium text-gray-900' : 'text-gray-400'}>
              Avisarle al cliente por WhatsApp
            </span>
            {puedeAvisar && evento ? (
              <span className="block text-gray-500 mt-0.5">
                {QUE_DICE[evento]}
                {cliente?.name ? ` Va a ${cliente.name}.` : ''}
              </span>
            ) : (
              <span className="block text-gray-400 mt-0.5">{motivoSinAviso}</span>
            )}
          </span>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancelar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={onConfirmar} disabled={enviando}>
            {enviando ? 'Guardando…' : 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
