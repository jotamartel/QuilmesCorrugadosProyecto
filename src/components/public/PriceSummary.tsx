'use client';

import { Package, Clock, Truck, Send, Loader2, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import { BoxItemData, BoxCalculations } from './BoxItemForm';

interface PriceSummaryProps {
  boxes: BoxItemData[];
  boxCalculations: (BoxCalculations | null)[];
  estimatedDays: number;
  isFreeShipping?: boolean;
  distanceKm?: number | null;
  showPrice?: boolean; // Si es false, oculta los precios hasta completar datos
  onRequestContact?: () => void; // Callback para "Quiero que me contacten"
  onBelowMinimum?: () => void; // Callback para "¿Necesitas menos m²?"
  submitting?: boolean; // Estado de envío
  minM2PerModel?: number; // Mínimo m² por modelo para mostrar el botón
}

export function PriceSummary({
  boxes,
  boxCalculations,
  estimatedDays,
  isFreeShipping,
  distanceKm,
  showPrice = true,
  onRequestContact,
  onBelowMinimum,
  submitting = false,
  minM2PerModel = 3000,
}: PriceSummaryProps) {
  // Calcular totales
  const validCalculations = boxCalculations.filter((c): c is BoxCalculations => c !== null);
  const totalSqm = validCalculations.reduce((sum, c) => sum + c.totalSqm, 0);
  const totalSubtotal = validCalculations.reduce((sum, c) => sum + c.subtotal, 0);
  const totalQuantity = boxes.reduce((sum, b) => sum + b.quantity, 0);

  const hasValidBoxes = validCalculations.length > 0;
  const isBelowMinimum = totalSqm > 0 && totalSqm < 3000;
  const hasVolumeDiscount = totalSqm >= 5000;

  if (!hasValidBoxes) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <div className="text-center text-gray-500 py-8">
          <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Completá las dimensiones para ver tu pedido</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 space-y-4">
      {/* Encabezado */}
      <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
        <Package className="w-5 h-5 text-[#002E55]" />
        <h3 className="font-semibold text-gray-900">
          {boxes.length === 1 ? 'Tu caja' : `Tus ${boxes.length} cajas`}
        </h3>
      </div>

      {/* Lista de cajas */}
      <div className="space-y-3">
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
      <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
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
        {!isBelowMinimum && isFreeShipping === true && distanceKm !== null && distanceKm !== undefined && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
            <Truck className="w-3 h-3 mr-1" />
            Envío gratis ({distanceKm} km)
          </span>
        )}
        {!isBelowMinimum && isFreeShipping === false && distanceKm !== null && distanceKm !== undefined && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-[#001a33]">
            <Truck className="w-3 h-3 mr-1" />
            Envío con cargo ({distanceKm} km)
          </span>
        )}
        {!isBelowMinimum && hasVolumeDiscount && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
            Precio mayorista aplicado
          </span>
        )}
      </div>

      {/* Mensaje de mínimo no alcanzado */}
      {isBelowMinimum && totalSqm < 1000 ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <p className="text-red-700 font-medium">
            Pedido mínimo: 1.000 m²
          </p>
          <p className="text-sm text-red-600 mt-1">
            Actualmente tenés {totalSqm.toLocaleString('es-AR', { minimumFractionDigits: 2 })} m².
            Aumentá la cantidad de cajas para continuar.
          </p>
        </div>
      ) : isBelowMinimum && totalSqm >= 1000 ? (
        <div className="space-y-3">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
            <p className="text-yellow-800 font-medium">
              Pedido menor al mínimo recomendado: 3.000 m²
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              Actualmente tenés {totalSqm.toLocaleString('es-AR', { minimumFractionDigits: 2 })} m².
              Podés continuar con precio con recargo.
            </p>
          </div>
          {/* Botón para solicitar contacto si se puede fabricar en hueco de producción */}
          {onBelowMinimum && (
            <button
              type="button"
              onClick={onBelowMinimum}
              className="w-full px-4 py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors shadow-md"
            >
              <AlertCircle className="w-4 h-4" />
              ¿Necesitas menos m²? Solicitar contacto
            </button>
          )}
        </div>
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
          {/* Total */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex justify-between text-xl font-bold text-gray-900">
              <span>Total estimado:</span>
              <span className="text-[#002E55]">{formatCurrency(totalSubtotal)}</span>
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

          {/* Botón para pedidos menores al mínimo */}
          {onBelowMinimum && totalSqm < minM2PerModel && totalSqm >= 1000 && (
            <button
              type="button"
              onClick={onBelowMinimum}
              className="w-full px-4 py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors mt-3 shadow-md"
            >
              <AlertCircle className="w-4 h-4" />
              ¿Necesitas menos m²?
            </button>
          )}
        </>
      )}
    </div>
  );
}
