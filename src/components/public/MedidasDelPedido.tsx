import { formatCurrency } from '@/lib/utils/pricing';
import { precioUnitarioARS } from '@/lib/cotizacion/motor';
import { MATERIALES } from '@/lib/cotizacion/material';
import type { ItemDeCotizacionWeb } from '@/lib/cotizacion/web';

/**
 * Las medidas de un pedido web con varias cajas.
 *
 * Existe porque la página de la cotización y el panel mostraban una sola caja
 * aunque el pedido tuviera tres: el cliente veía un total que no correspondía
 * a la caja que tenía adelante, y el vendedor llamaba sabiendo un tercio del
 * pedido. Se usa en los dos lugares para que muestren lo mismo.
 */
export function MedidasDelPedido({ items }: { items: ItemDeCotizacionWeb[] }) {
  return (
    <ul className="divide-y divide-gray-100 text-sm">
      {items.map((it, i) => (
        <li key={i} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-gray-900">
                {i + 1}. {it.length_mm} x {it.width_mm} x {it.height_mm} mm
              </p>
              <p className="text-gray-500">
                {it.quantity.toLocaleString('es-AR')} unidades · {MATERIALES[it.material]?.nombre ?? 'onda simple'}
                {it.has_printing ? ` · impresión ${it.printing_colors} color${it.printing_colors > 1 ? 'es' : ''}` : ' · lisa'}
                {it.pieces === 2 ? ' · en dos mitades' : ''}
              </p>
              <p className="text-gray-400 text-xs">
                {it.total_sqm.toLocaleString('es-AR', { maximumFractionDigits: 2 })} m² · {precioUnitarioARS(it.unit_price)} por caja + IVA
              </p>
            </div>
            <p className="font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(it.subtotal)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Si una cotización trae varias medidas para mostrar como lista. */
export function tieneVariasMedidas(items: ItemDeCotizacionWeb[] | null | undefined): items is ItemDeCotizacionWeb[] {
  return Array.isArray(items) && items.length > 1;
}
