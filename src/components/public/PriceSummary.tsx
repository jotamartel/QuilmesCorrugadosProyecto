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
    <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-100 space-y-3">
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
                  {showPrice && <span className="font-medium text-gray-700">{formatCurrency(calc.subtotal)}</span>}
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
          Con el precio ya revelado se muestran los dos: precio y derivacion. */}
      {esPedidoDeStock && !showPrice ? (
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

          {/* Total */}
          <div className="border-t border-gray-100 pt-4">
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
