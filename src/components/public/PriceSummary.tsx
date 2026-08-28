'use client';

import Link from 'next/link';
import { Package, Clock, Truck, Send, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import { BoxItemData, BoxCalculations } from './BoxItemForm';
import { precioUnitarioARS } from '@/lib/cotizacion/motor';

interface PriceSummaryProps {
  boxes: BoxItemData[];
  boxCalculations: (BoxCalculations | null)[];
  estimatedDays: number;
  isFreeShipping?: boolean;
  distanceKm?: number | null;
  showPrice?: boolean; // Si es false, oculta los precios hasta completar datos
  onRequestContact?: () => void; // Callback para "Quiero que me contacten"
  submitting?: boolean; // Estado de envío
  stockMaxM2?: number; // Debajo de esto se vende de stock desde /cajas
  volumeThresholdM2?: number; // Desde acá aplica precio por volumen
  /**
   * Piso EXCLUYENTE de venta (RETAIL_CONFIG.MIN_M2_PEDIDO, hoy 500 m²). Por
   * debajo NO se publica precio y tampoco se deriva a /cajas —que también
   * arranca en 500—. Antes no llegaba hasta acá y el total salía cotizado
   * igual, que es la queja del dueño ("recién al final te dice que no").
   */
  pisoMinM2?: number;
}

export function PriceSummary({
  boxes,
  boxCalculations,
  estimatedDays,
  isFreeShipping,
  distanceKm,
  showPrice = true,
  onRequestContact,
  stockMaxM2 = 1000,
  volumeThresholdM2 = 5000,
  pisoMinM2 = 500,
  submitting = false,
}: PriceSummaryProps) {
  // Calcular totales
  const validCalculations = boxCalculations.filter((c): c is BoxCalculations => c !== null);
  const totalSqm = validCalculations.reduce((sum, c) => sum + c.totalSqm, 0);
  const totalSubtotal = validCalculations.reduce((sum, c) => sum + c.subtotal, 0);
  const totalQuantity = boxes.reduce((sum, b) => sum + b.quantity, 0);

  const hasValidBoxes = totalSqm > 0 && validCalculations.length > 0;
  const hasVolumeDiscount = totalSqm >= volumeThresholdM2;
  // Volumen de stock: no se produce a medida, se compra hecho desde /cajas.
  const esPedidoDeStock = totalSqm > 0 && totalSqm < stockMaxM2;
  // Piso de venta EXCLUYENTE. Por debajo no hay precio ni derivacion a /cajas
  // (ese canal tambien pide 500 m² minimo). Es agregado, no por caja: dos
  // cajas de 300 m² suman 600 y sí llegan.
  const bajoMinimoPiso = totalSqm > 0 && totalSqm < pisoMinM2;
  // Con una sola medida podemos ser concretos y decirle exactamente cuantas
  // cajas mas hacen falta. OJO CON EL OBJETIVO: este cotizador fabrica a
  // medida, y eso arranca en minM2AMedida (1.000 m²), no en el piso de venta
  // de 500 — ese piso es de las medidas estandar de catalogo que salen de
  // stock. La version anterior invitaba a llegar a "N cajas de esta medida"
  // apuntando a los 500, y a esa altura el pedido igual no se podia fabricar.
  const cajasParaAMedida =
    boxes.length === 1 && validCalculations.length === 1 && validCalculations[0].sqmPerBox > 0
      ? validCalculations[0].minCajasAMedida
      : null;
  const minM2AMedida = validCalculations[0]?.minM2AMedida ?? 1000;

  // Aviso de "no llegas al minimo". Aparece MIENTRAS ajusta cantidades, no al
  // final. El minimo no se negocia: por eso el tono rojo y no se ofrece
  // "hablemoslo".
  const panelBajoMinimo = (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <p className="text-red-900 font-medium">Todavía no llegás al mínimo</p>
      <p className="text-sm text-red-800 mt-1">
        Una medida propia se fabrica desde{' '}
        <strong>{minM2AMedida.toLocaleString('es-AR')} m²</strong> de cartón
        {cajasParaAMedida !== null ? (
          <>
            {' '}
            — <strong>{cajasParaAMedida.toLocaleString('es-AR')}</strong> cajas de esta
            medida
          </>
        ) : null}
        . Con este pedido son{' '}
        {totalSqm.toLocaleString('es-AR', { maximumFractionDigits: 1 })} m². Para pedidos
        más chicos vendemos{' '}
        <Link href="/cajas" className="underline font-medium">
          medidas estándar de catálogo
        </Link>{' '}
        de stock, desde {pisoMinM2.toLocaleString('es-AR')} m².
      </p>
    </div>
  );

  const panelStock = (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
      <p className="text-amber-900 font-medium">Este volumen lo vendemos de stock</p>
      <p className="text-sm text-amber-800 mt-1">
        Son {totalSqm.toLocaleString('es-AR', { maximumFractionDigits: 0 })} m². Las medidas
        estándar salen más rápido y se compran online desde 500 m² de cajas.
      </p>
      <Link
        href="/cajas"
        className="mt-3 inline-block rounded-lg bg-[#002E55] px-4 py-2 text-sm font-medium text-white hover:bg-[#001a33] transition-colors"
      >
        Ver medidas en stock
      </Link>
    </div>
  );

  if (!hasValidBoxes) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-100">
        <div className="text-center text-gray-500 py-6">
          <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Completá las dimensiones para ver tu pedido</p>
        </div>
      </div>
    );
  }

  return (
    // flex-col + h-full: cuando el contenedor lo estira (paso 2 con el precio
    // revelado, a la altura del card de datos), el bloque del total baja al
    // fondo con su mt-auto. En flujo normal la altura es auto y no cambia nada.
    <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-100 flex flex-col gap-3 h-full">
      {/* Encabezado */}
      <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
        <Package className="w-5 h-5 text-[#002E55]" />
        <h3 className="font-semibold text-gray-900">
          {boxes.length === 1 ? 'Tu caja' : `Tus ${boxes.length} cajas`}
        </h3>
      </div>

      {/* Lista de cajas */}
      <div className="space-y-2">
        {boxes.map((box, index) => {
          const calc = boxCalculations[index];
          if (!calc) return null;

          return (
            <div key={box.id} className="text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center justify-center w-5 h-5 bg-[#002E55] text-white text-xs font-medium rounded-full">
                  {index + 1}
                </span>
                <span className="font-medium text-gray-900">
                  {box.length_mm} x {box.width_mm} x {box.height_mm} mm
                </span>
              </div>
              <div className="ml-7 text-gray-600 space-y-0.5">
                <p>Cantidad: {box.quantity.toLocaleString('es-AR')} uds</p>
                {box.has_printing && <p className="text-[#002E55]">Con impresión ({box.printing_colors} color{box.printing_colors > 1 ? 'es' : ''})</p>}
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{calc.totalSqm.toLocaleString('es-AR', { minimumFractionDigits: 2 })} m²</span>
                  {showPrice && !bajoMinimoPiso && <span className="font-medium text-gray-700">{formatCurrency(calc.subtotal)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detalles técnicos totales */}
      <div className="bg-gray-50 rounded-lg p-2.5 text-sm space-y-0.5">
        <div className="flex justify-between">
          <span className="text-gray-500">Total cajas:</span>
          <span className="font-medium">{totalQuantity.toLocaleString('es-AR')} unidades</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">m² totales:</span>
          <span className="font-medium">{totalSqm.toLocaleString('es-AR', { minimumFractionDigits: 2 })} m²</span>
        </div>
      </div>

      {/* Badges informativos */}
      <div className="flex flex-wrap gap-2">
        {!esPedidoDeStock && isFreeShipping === true && distanceKm !== null && distanceKm !== undefined && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
            <Truck className="w-3 h-3 mr-1" />
            Envío gratis ({distanceKm} km)
          </span>
        )}
        {!esPedidoDeStock && isFreeShipping === false && distanceKm !== null && distanceKm !== undefined && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-[#001a33]">
            <Truck className="w-3 h-3 mr-1" />
            Envío con cargo ({distanceKm} km)
          </span>
        )}
        {!esPedidoDeStock && hasVolumeDiscount && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
            Precio mayorista aplicado
          </span>
        )}
      </div>

      {/* Volumen de stock: ya no es un bloqueo, es una derivacion. Antes decia
          "Aumentá la cantidad para continuar" y ahi se cortaba la visita.
          Con el precio ya revelado se muestran los dos: precio y derivacion.
          Debajo del piso EXCLUYENTE de 500 m² no entra ni una cosa ni la otra:
          no hay precio y tampoco tiene sentido mandarlo a /cajas, que arranca
          en el mismo piso. Antes ese aviso caía al final; ahora aparece ni
          bien las cantidades no llegan. */}
      {bajoMinimoPiso ? (
        <>
          {panelBajoMinimo}
          {showPrice && onRequestContact && (
            <button
              type="button"
              onClick={onRequestContact}
              disabled={submitting}
              className="w-full px-4 py-3 bg-[#002E55] hover:bg-[#001a33] disabled:bg-gray-300 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors mt-4"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Quiero que me contacten
                </>
              )}
            </button>
          )}
        </>
      ) : esPedidoDeStock && !showPrice ? (
        panelStock
      ) : !showPrice ? (
        /* Mensaje cuando el precio está oculto (paso 1) */
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <p className="text-[#002E55] font-medium">
            Completá tus datos para ver la cotización
          </p>
          <p className="text-sm text-[#4F6D87] mt-1">
            Ingresá tu información de contacto para obtener el precio de tu pedido.
          </p>
        </div>
      ) : (
        <>
          {/* Ya vio el precio de stock: ahora se lo invita a comprarlo online */}
          {esPedidoDeStock && panelStock}

          {/* Total. El mt-auto lo ancla al fondo del card cuando este va
              estirado a la altura del formulario; con altura natural no hace
              nada. */}
          <div className="border-t border-gray-100 pt-4 mt-auto">
            {/* Con una sola medida el unitario es directo y es lo que la
                persona compara. Con varias no tiene sentido un promedio. */}
            {boxes.length === 1 && boxes[0].quantity > 0 && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600">Precio por caja:</span>
                <span className="text-base font-semibold text-gray-800">
                  {precioUnitarioARS(totalSubtotal / boxes[0].quantity)} + IVA
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-gray-700">Total estimado:</span>
              <span className="text-3xl font-bold text-[#002E55]">{formatCurrency(totalSubtotal)}</span>
            </div>
          </div>

          {/* Entrega */}
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
            <Clock className="w-4 h-4 text-gray-400" />
            <span>Entrega estimada: <strong>{estimatedDays} días hábiles</strong></span>
          </div>

          <p className="text-xs text-gray-400 text-center">
            * Precio sin IVA. Envío sujeto a distancia y volumen.
          </p>

          {/* Botón de contacto */}
          {onRequestContact && (
            <button
              type="button"
              onClick={onRequestContact}
              disabled={submitting}
              className="w-full px-4 py-3 bg-[#002E55] hover:bg-[#001a33] disabled:bg-gray-300 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors mt-4"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Quiero que me contacten
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
