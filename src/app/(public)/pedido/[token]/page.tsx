/**
 * /pedido/[token] — la pagina que ve el cliente para seguir su pedido.
 *
 * Mobile-first porque el link llega por WhatsApp (las plantillas de Meta lo
 * llevan como variable). Cada orden tiene su token: la URL identifica al
 * pedido, y un cliente con tres pedidos tiene tres links, cada uno en su
 * conversacion. No hay portal "todos mis pedidos" a proposito: exigiria
 * autenticacion, y el token por pedido da lo mismo sin pedirle cuenta a nadie.
 *
 * QUE MUESTRA Y QUE NO — misma lista blanca que la API publica: numero,
 * timeline de hitos, medidas y cantidades, fecha estimada. Sin plata, sin
 * direcciones, sin datos de contacto: el link queda en historiales y reenvios,
 * y todo lo que muestre esta expuesto a cualquiera que lo tenga.
 *
 * Server component con revalidate corto: el operador cambia el estado en el
 * panel y el cliente lo ve al ratito, sin mandar el token al bundle de JS.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckCircle2, Circle, XCircle, MessageCircle } from 'lucide-react';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { createAdminClient } from '@/lib/supabase/admin';
import { esTokenPedidoValido } from '@/lib/orders/token-publico';
import { getBankDataForClient } from '@/lib/config/system';
import { CopiarDato } from '@/components/public/CopiarDato';
import { ORDER_STATUS_LABELS } from '@/lib/utils/format';
import { CONTACTO } from '@/lib/contacto';
import type { OrderStatus } from '@/lib/types/database';

export const revalidate = 30;

export const metadata: Metadata = {
  // El template del layout público ya agrega "| Quilmes Corrugados".
  title: 'Seguimiento de pedido',
  // La pagina es de quien tiene el link: no se indexa (robots.ts ademas cierra
  // /pedido/ entero, defensa en profundidad).
  robots: { index: false, follow: false },
};

interface ItemPublico {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  quantity_delivered: number | null;
}

interface PedidoPublico {
  order_number: string;
  status: OrderStatus;
  created_at: string;
  confirmed_at: string | null;
  production_started_at: string | null;
  ready_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  estimated_delivery: string | null;
  quantities_confirmed: boolean;
  deposit_status: string;
  balance_status: string;
  items: ItemPublico[];
}

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;

export default async function PedidoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!esTokenPedidoValido(token)) notFound();

  const db = createAdminClient();
  const { data } = await db
    .from('orders')
    .select(
      `
      order_number, status, created_at, confirmed_at, production_started_at,
      ready_at, shipped_at, delivered_at, cancelled_at, estimated_delivery,
      quantities_confirmed, deposit_status, balance_status,
      items:order_items(length_mm, width_mm, height_mm, quantity, quantity_delivered)
    `,
    )
    .eq('public_token', token)
    .maybeSingle();

  if (!data) notFound();
  const pedido = data as unknown as PedidoPublico;

  const linkWhatsApp = CONTACTO.whatsappCon(`Hola, consulta sobre el pedido ${pedido.order_number}`);

  // Los hitos salen de los timestamps que las transiciones ya estampan. El
  // created_at cubre el primer hito para que un pedido recien cargado no se
  // vea vacio.
  const hitos: Array<{ titulo: string; cuando: string | null }> = [
    { titulo: 'Pedido recibido', cuando: pedido.created_at },
    { titulo: 'Confirmado', cuando: pedido.confirmed_at },
    { titulo: 'En fabricación', cuando: pedido.production_started_at },
    { titulo: 'Listo para despachar', cuando: pedido.ready_at },
    { titulo: 'En camino', cuando: pedido.shipped_at },
    { titulo: 'Entregado', cuando: pedido.delivered_at },
  ];

  const cancelado = pedido.status === 'cancelled';

  // LOS DATOS PARA TRANSFERIR, Y DONDE VAN.
  //
  // Aparecen solo mientras hay algo por pagar y la configuracion bancaria esta
  // completa. Montos nunca: el link se reenvia, y un monto a la vista es
  // municion para el "te falta pagar X, transferi aca" de un tercero. El alias
  // y el CBU son publicos por naturaleza — existen para darselos a cualquiera
  // que vaya a transferir.
  //
  // La POSICION depende de si toca pagar AHORA, porque de eso depende a que
  // vino la persona:
  //
  //   - Falta la seña: el pedido no arranca hasta que se pague. Urgente.
  //   - Falta el saldo y el pedido ya esta listo: es el momento exacto del
  //     aviso "confirmamos cantidades, este es el saldo". Urgente.
  //   - Falta el saldo pero todavia se esta fabricando: se debe, pero no toca.
  //     Empujar a pagar algo que no corresponde todavia confunde.
  //
  // Cuando toca, el bloque va PRIMERO —antes del timeline— porque es a lo que
  // vino; cuando no, queda abajo como referencia.
  const debeSenia = pedido.deposit_status !== 'paid';
  const debeSaldo = pedido.balance_status !== 'paid';
  const pedidoTerminado = ['ready', 'shipped', 'delivered'].includes(pedido.status);
  const tocaPagarAhora = !cancelado && (debeSenia || (debeSaldo && pedidoTerminado));

  const banco = !cancelado && (debeSenia || debeSaldo) ? await getBankDataForClient() : null;

  const bloqueTransferencia = banco ? (
    <div
      className={
        tocaPagarAhora
          ? 'mt-6 bg-amber-50 border-2 border-amber-300 rounded-xl p-6'
          : 'mt-4 bg-white border border-gray-200 rounded-xl p-6'
      }
    >
      <h2 className={tocaPagarAhora ? 'font-semibold text-amber-900' : 'text-sm font-semibold text-gray-900'}>
        {tocaPagarAhora
          ? debeSenia
            ? 'Para pagar la seña y arrancar'
            : 'Para pagar el saldo y coordinar la entrega'
          : 'Datos para transferir'}
      </h2>
      <dl className="mt-3 space-y-2.5">
        <CopiarDato
          etiqueta="Alias"
          valor={banco.alias}
          nota={banco.alias.endsWith('.') ? 'El punto final es parte del alias — mejor usá Copiar.' : undefined}
        />
        <CopiarDato etiqueta="CBU" valor={banco.cbu} />
        <div className="flex items-center gap-2 text-sm">
          <dt className="text-gray-500 w-16 shrink-0">Titular:</dt>
          <dd className="font-medium">
            {banco.holder} (CUIT {banco.cuit})
            {banco.bank && <span className="text-gray-500 font-normal"> · {banco.bank}</span>}
          </dd>
        </div>
      </dl>
      <p className={`mt-3 text-xs ${tocaPagarAhora ? 'text-amber-800' : 'text-gray-500'}`}>
        Cuando transfieras, mandanos el comprobante por WhatsApp.
      </p>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <LandingHeader />
      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-8 sm:max-w-2xl">
        <p className="text-sm text-gray-500">Seguimiento de pedido</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">{pedido.order_number}</h1>
          <span
            className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
              cancelado ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {ORDER_STATUS_LABELS[pedido.status]}
          </span>
        </div>

        {tocaPagarAhora && bloqueTransferencia}

        {cancelado ? (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6 text-center">
            <XCircle className="w-10 h-10 text-red-400 mx-auto" />
            <p className="mt-3 text-gray-700">
              Este pedido fue cancelado{fecha(pedido.cancelled_at) ? ` el ${fecha(pedido.cancelled_at)}` : ''}.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Si querés retomarlo o necesitás una explicación, escribinos.
            </p>
          </div>
        ) : (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6">
            <ol className="space-y-4">
              {hitos.map((h) => (
                <li key={h.titulo} className="flex items-start gap-3">
                  {h.cuando ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 flex items-baseline justify-between gap-2">
                    <span className={h.cuando ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                      {h.titulo}
                    </span>
                    <span className="text-sm text-gray-500 tabular-nums">{fecha(h.cuando) ?? '—'}</span>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-5 pt-4 border-t border-gray-100 text-sm text-gray-600">
              {pedido.estimated_delivery
                ? `Fecha estimada de entrega: ${fecha(pedido.estimated_delivery)}`
                : 'La fecha de entrega la coordinamos por WhatsApp.'}
            </p>
          </div>
        )}

        <div className="mt-4 bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-900">Qué lleva</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
            {pedido.items.map((item, i) => (
              <li key={i}>
                {item.quantity.toLocaleString('es-AR')} cajas de {item.length_mm}x{item.width_mm}x
                {item.height_mm} mm
                {/* La cantidad producida varia hasta ±5% y se factura lo
                    entregado: cuando difiere, se muestra sin vueltas. */}
                {pedido.quantities_confirmed &&
                  item.quantity_delivered !== null &&
                  item.quantity_delivered !== item.quantity && (
                    <span className="text-gray-500">
                      {' '}
                      (entregamos {item.quantity_delivered.toLocaleString('es-AR')})
                    </span>
                  )}
              </li>
            ))}
          </ul>
        </div>

        {!tocaPagarAhora && bloqueTransferencia}

        <a
          href={linkWhatsApp}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl py-3 transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          Consultar por WhatsApp
        </a>
        <p className="mt-2 text-center text-xs text-gray-400">
          Va con el número de pedido ya escrito.
        </p>
      </main>
      <LandingFooter />
    </div>
  );
}
