/**
 * El vocabulario de los avisos: qué eventos hay y cómo se leen sus resultados.
 *
 * ESTE ARCHIVO NO IMPORTA NADA DEL SERVIDOR, Y ESO ES EL PUNTO.
 *
 * El motor (src/lib/notificaciones-pedido.ts) trae consigo el cliente de
 * Supabase y el transporte de WhatsApp, que a su vez trae el SDK de Twilio con
 * sus `fs`, `net` y `tls`. Cuando el componente del casillero —que es 'use
 * client'— importó una sola constante de ahí, se llevó toda esa cadena al
 * bundle del navegador y el build se cayó.
 *
 * La constante era inocente; el módulo que la contenía no. Por eso el
 * vocabulario vive separado del motor: la UI necesita saber QUÉ eventos
 * existen y CÓMO se cuenta cada resultado, no cómo se manda un WhatsApp.
 */
import type { OrderStatus } from '@/lib/types/database';

export type EventoDePedido =
  | 'confirmada'
  | 'en_produccion'
  | 'saldo_actualizado'
  | 'despachada'
  | 'entregada'
  | 'cancelada';

/** Por qué un aviso no salió, sin que eso sea una falla. */
export type MotivoDeOmision =
  | 'sin_cliente'
  | 'sin_whatsapp'
  | 'whatsapp_invalido'
  | 'cliente_opt_out'
  | 'alias_faltante'
  | 'sin_saldo';

export type ResultadoAviso =
  | { estado: 'enviada'; plantilla: string }
  | { estado: 'ya_enviada' }
  /** Otro proceso lo está mandando ahora mismo. No es error ni éxito: es esperá. */
  | { estado: 'en_curso' }
  /**
   * Salió, pero no se pudo dejar registrado que salió.
   *
   * Se separa de 'enviada' porque tiene una consecuencia distinta: la fila
   * queda diciendo que no se envió, así que un disparo posterior lo puede
   * mandar de nuevo. Quien lo vea tiene que saber que hay un duplicado
   * esperando a pasar.
   */
  | { estado: 'enviada_sin_registrar'; plantilla: string }
  | { estado: 'omitida'; motivo: MotivoDeOmision }
  | { estado: 'sin_soporte' }
  | { estado: 'error'; motivo: string };

/** Qué estado de la orden dispara qué aviso. Lo que no está acá, no avisa. */
export const EVENTO_POR_ESTADO: Partial<Record<OrderStatus, EventoDePedido>> = {
  confirmed: 'confirmada',
  in_production: 'en_produccion',
  shipped: 'despachada',
  delivered: 'entregada',
  cancelled: 'cancelada',
  // 'ready' NO avisa a propósito: el aviso útil es el de saldo actualizado,
  // que sale al confirmar cantidades y dice "está listo" con el número final.
  // Dos WhatsApp seguidos diciendo casi lo mismo es la forma de que el cliente
  // silencie la conversación.
};

/** Para el panel: qué decirle a quien acaba de mover el pedido. */
export function explicarResultado(r: ResultadoAviso): string {
  switch (r.estado) {
    case 'enviada': return 'Le avisamos al cliente por WhatsApp.';
    case 'ya_enviada': return 'Ese aviso ya se había enviado.';
    case 'en_curso': return 'Ese aviso se está enviando en este momento.';
    case 'enviada_sin_registrar':
      return 'Le avisamos al cliente, pero no se pudo registrar: avisale a soporte, puede repetirse.';
    case 'sin_soporte': return 'El proveedor de WhatsApp no manda plantillas: no se avisó.';
    case 'error': return `No se pudo avisar al cliente: ${r.motivo}`;
    case 'omitida':
      switch (r.motivo) {
        case 'sin_cliente': return 'El pedido no tiene cliente asociado: no se avisó.';
        case 'sin_whatsapp': return 'El cliente no tiene WhatsApp cargado: no se avisó.';
        case 'whatsapp_invalido': return 'El WhatsApp del cliente está mal cargado: no se avisó.';
        case 'cliente_opt_out': return 'El cliente pidió no recibir avisos.';
        case 'alias_faltante': return 'Faltan los datos bancarios en Configuración: no se avisó.';
        case 'sin_saldo': return 'No hay saldo pendiente: no hacía falta avisar.';
      }
  }
}
