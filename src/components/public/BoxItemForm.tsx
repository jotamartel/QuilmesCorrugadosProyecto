'use client';

import { Trash2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { BoxTemplateDownload } from './BoxTemplateDownload';
import { DesignUploader } from './DesignUploader';
import {
  calculateUnfolded,
  calculateTotalM2,
  excedeMedidaMaxima,
  MEDIDA_MAXIMA,
  LARGO_MAXIMO_PLANCHA,
  RECARGO_DOS_MITADES,
} from '@/lib/utils/box-calculations';
import { getPricePerM2 } from '@/lib/utils/pricing';
import type { PricingConfig } from '@/lib/types/database';

export interface BoxItemData {
  id: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  has_printing: boolean;
  printing_colors: number;
  design_file_url: string;
  design_file_name: string;
  design_preview_url: string; // URL de imagen para vista 3D (generada desde PDF o la imagen original)
}

export interface BoxCalculations {
  sheetWidth: number;
  sheetLength: number;
  sqmPerBox: number;
  totalSqm: number;
  pricePerM2: number;
  unitPrice: number;
  subtotal: number;
  /** Cuántas cajas de esta medida hacen falta para poder fabricarla a medida. */
  minCajasAMedida: number;
  /** Cuántas hacen falta para llegar al piso de venta. */
  minCajasPiso: number;
  /** Los dos umbrales en m², para poder nombrarlos sin pasar la config al componente. */
  minM2AMedida: number;
  minM2Piso: number;
  /** Por debajo del limite no se produce a medida: se vende de stock desde /cajas */
  esDeStock: boolean;
  /** 2 = caja en dos mitades pegadas; el precio ya trae su recargo. */
  pieces: 1 | 2;
}

interface BoxItemFormProps {
  box: BoxItemData;
  index: number;
  canDelete: boolean;
  isCollapsed: boolean;
  onUpdate: (id: string, field: keyof BoxItemData, value: BoxItemData[keyof BoxItemData]) => void;
  onDelete: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  calculations: BoxCalculations | null;
}

const MAX_LENGTH_PLUS_WIDTH = 1200;

// NOTA: Esta función NO debe usar valores por defecto hardcodeados.
// Si no hay configuración disponible, debe retornar null y el componente
// debe manejar el caso mostrando un mensaje de error o cargando.

export function calculateBoxItem(box: BoxItemData, pricingConfig?: PricingConfig | null): BoxCalculations | null {
  const { length_mm, width_mm, height_mm, quantity } = box;

  // Validar dimensiones mínimas
  if (length_mm < 200 || width_mm < 200 || height_mm < 100) {
    return null;
  }

  // Validar que el largo sea mayor o igual al ancho
  if (length_mm < width_mm) {
    return null;
  }

  // Validar que ancho + alto no supere 1200mm
  if (width_mm + height_mm > MAX_LENGTH_PLUS_WIDTH) {
    return null;
  }

  // Tope de fabricacion por eje (1800x1100x1000). La constante y el helper
  // viven en box-calculations para no duplicar el tope —ya paso una vez, y
  // quedo un valor viejo escrito en otro lado—.
  if (excedeMedidaMaxima(length_mm, width_mm, height_mm)) {
    return null;
  }

  // Regla combinada del largo de plancha: incluso en dos mitades, cada una
  // (L+A+50) tiene que entrar en los 2.050 mm del largo maximo.
  if (length_mm + width_mm > LARGO_MAXIMO_PLANCHA - 50) {
    return null;
  }

  const unfolded = calculateUnfolded(length_mm, width_mm, height_mm);
  const totalSqm = calculateTotalM2(unfolded.m2, quantity);

  // REQUERIDO: La configuración de precios debe venir siempre desde la base de datos
  // No usar valores por defecto hardcodeados
  if (!pricingConfig) {
    return null; // No calcular si no hay configuración
  }

  const pricePerM2 = getPricePerM2(totalSqm, pricingConfig);

  // Dos mitades: mismo recargo que el motor, para que el numero que la
  // persona ve en el formulario sea el mismo que despues guarda el lead.
  const factorMitades = unfolded.pieces === 2 ? 1 + RECARGO_DOS_MITADES : 1;
  const subtotal = Math.round(totalSqm * pricePerM2 * factorMitades * 100) / 100;
  const unitPrice = quantity > 0 ? Math.round((subtotal / quantity) * 100) / 100 : 0;
  // El umbral que importa acá es el de producción a medida, no el escalón de
  // precio: este cotizador fabrica la medida que le pidan, y eso arranca en
  // wholesale_min_m2. Antes sugería el de 3.000, que es donde baja el precio, y
  // eso pedía el triple de lo necesario para poder comprar.
  const minCajasAMedida = Math.ceil(pricingConfig.wholesale_min_m2 / unfolded.m2);
  const minCajasPiso = Math.ceil(pricingConfig.min_m2_pedido / unfolded.m2);

  return {
    sheetWidth: unfolded.unfoldedWidth,
    sheetLength: unfolded.unfoldedLength,
    sqmPerBox: unfolded.m2,
    totalSqm,
    pricePerM2,
    unitPrice,
    subtotal,
    minCajasAMedida,
    minCajasPiso,
    minM2AMedida: pricingConfig.wholesale_min_m2,
    minM2Piso: pricingConfig.min_m2_pedido,
    esDeStock: totalSqm < pricingConfig.wholesale_min_m2,
    pieces: unfolded.pieces,
  };
}

// Función auxiliar para validar dimensiones
export function validateBoxDimensions(box: BoxItemData): { isValid: boolean; error?: string; warning?: string } {
  // Validar que el largo sea mayor o igual al ancho
  if (box.length_mm < box.width_mm && box.length_mm > 0 && box.width_mm > 0) {
    return {
      isValid: false,
      error: `El Largo debe ser la medida más grande. Ingresaste ${box.length_mm}mm de largo y ${box.width_mm}mm de ancho. ¿Querías decir ${box.width_mm}mm x ${box.length_mm}mm?`
    };
  }

  // Validar que ancho + alto no supere 1200mm
  if (box.width_mm + box.height_mm > MAX_LENGTH_PLUS_WIDTH) {
    return {
      isValid: false,
      error: `La suma de Ancho + Alto no puede superar ${MAX_LENGTH_PLUS_WIDTH}mm (actual: ${box.width_mm + box.height_mm}mm)`
    };
  }

  // Tope de fabricacion. Antes esta validacion no existia en el formulario:
  // la caja quedaba cotizada y recien saltaba el problema al pedirla.
  if (excedeMedidaMaxima(box.length_mm, box.width_mm, box.height_mm)) {
    return {
      isValid: false,
      error: `Fabricamos hasta ${MEDIDA_MAXIMA.largo}×${MEDIDA_MAXIMA.ancho}×${MEDIDA_MAXIMA.alto} mm ` +
        `(cada máximo, con las otras medidas en el mínimo). Con esta medida ` +
        `(${box.length_mm}×${box.width_mm}×${box.height_mm}) no llegamos.`
    };
  }

  // La otra regla combinada: el largo de plancha. Hasta 2.050 mm la caja sale
  // de una pieza; pasado eso va en dos mitades, y cada mitad tambien tiene
  // que entrar en la plancha — largo + ancho no puede superar 2.000 mm.
  if (box.length_mm + box.width_mm > LARGO_MAXIMO_PLANCHA - 50) {
    return {
      isValid: false,
      error: `La suma de Largo + Ancho no puede superar ${LARGO_MAXIMO_PLANCHA - 50}mm ` +
        `(actual: ${box.length_mm + box.width_mm}mm): la caja no entra en el largo de ` +
        `plancha ni fabricándola en dos mitades.`
    };
  }
  return { isValid: true };
}

export function BoxItemForm({
  box,
  index,
  canDelete,
  isCollapsed,
  onUpdate,
  onDelete,
  onToggleCollapse,
  calculations,
}: BoxItemFormProps) {
  const handleFieldUpdate = (field: keyof BoxItemData, value: BoxItemData[keyof BoxItemData]) => {
    onUpdate(box.id, field, value);
  };

  // Validar dimensiones
  const dimensionValidation = validateBoxDimensions(box);
  const exceedsDimensionLimit = !dimensionValidation.isValid;

  // Determinar qué campos marcar en rojo
  const isLengthWidthError = box.length_mm < box.width_mm && box.length_mm > 0 && box.width_mm > 0;
  const isWidthHeightError = box.width_mm + box.height_mm > MAX_LENGTH_PLUS_WIDTH && box.width_mm >= 200 && box.height_mm >= 100;

  // Header colapsable con resumen
  const headerSummary = calculations
    ? `${box.length_mm}×${box.width_mm}×${box.height_mm}mm - ${box.quantity.toLocaleString('es-AR')} uds`
    : exceedsDimensionLimit
    ? 'Dimensiones excedidas'
    : 'Completar dimensiones';

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => onToggleCollapse(box.id)}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 bg-[#002E55] text-white text-sm font-medium rounded-full">
            {index + 1}
          </span>
          <div>
            {/* h3, no h4: cuelga directo del h2 "Cotiza tu caja" y saltearse
                un nivel rompe la navegacion por encabezados de un lector de
                pantalla, ademas de confundir la jerarquia que lee un buscador. */}
            <h3 className="font-medium text-gray-900">Caja {index + 1}</h3>
            <p className="text-sm text-gray-500">{headerSummary}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(box.id);
              }}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Eliminar caja"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {isCollapsed ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Contenido expandible */}
      {!isCollapsed && (
        <div className="p-3 space-y-3">
          {/* Dimensiones */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Largo (mm)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={box.length_mm || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  handleFieldUpdate('length_mm', value ? parseInt(value) : 0);
                }}
                placeholder="400"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent text-base ${
                  isLengthWidthError ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
              />
              <p className="text-xs text-gray-400 mt-0.5">200-800</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ancho (mm)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={box.width_mm || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  handleFieldUpdate('width_mm', value ? parseInt(value) : 0);
                }}
                placeholder="300"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent text-base ${
                  isLengthWidthError || isWidthHeightError ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
              />
              <p className="text-xs text-gray-400 mt-0.5">200-600</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Alto (mm)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={box.height_mm || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  handleFieldUpdate('height_mm', value ? parseInt(value) : 0);
                }}
                placeholder="200"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent text-base ${
                  isWidthHeightError ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
              />
              <p className="text-xs text-gray-400 mt-0.5">100-600</p>
            </div>
          </div>

          {/* Alerta de dimensiones inválidas */}
          {exceedsDimensionLimit && dimensionValidation.error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">
                <p className="font-medium">Dimensiones incorrectas</p>
                <p className="text-xs mt-0.5">
                  {dimensionValidation.error}
                </p>
              </div>
            </div>
          )}

          {/* Cantidad */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cantidad (unidades)
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              min={calculations?.minCajasAMedida || 1}
              value={box.quantity || ''}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '');
                handleFieldUpdate('quantity', value ? parseInt(value) : 0);
              }}
              placeholder={calculations ? `Mín. ${calculations.minCajasAMedida.toLocaleString('es-AR')}` : ''}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent text-base ${
                calculations?.esDeStock ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'
              }`}
            />
            {calculations && (
              <p className={`text-xs mt-1 ${calculations.esDeStock ? 'text-yellow-600' : 'text-gray-400'}`}>
                Mínimo para fabricar a medida: {calculations.minCajasAMedida.toLocaleString('es-AR')} uds
              </p>
            )}
          </div>

          {/* Impresión */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={box.has_printing}
                onChange={(e) => handleFieldUpdate('has_printing', e.target.checked)}
                className="w-4 h-4 text-[#002E55] rounded focus:ring-[#4F6D87]"
              />
              <span className="text-sm font-medium text-gray-700">¿Lleva impresión?</span>
            </label>
          </div>

          {box.has_printing && (
            <div className="space-y-3 pl-4 border-l-2 border-blue-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cantidad de colores
                </label>
                <select
                  value={box.printing_colors}
                  onChange={(e) => handleFieldUpdate('printing_colors', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent text-sm"
                >
                  <option value={1}>1 color</option>
                  <option value={2}>2 colores</option>
                  <option value={3}>3 colores</option>
                </select>
              </div>

              {/* Descargar plantilla PDF — solo para cajas de una pieza: en
                  dos mitades no hay desplegado automático y el endpoint
                  devuelve 400. El desplegado de esas lo prepara la fábrica. */}
              {2 * (box.length_mm + box.width_mm) + 50 <= LARGO_MAXIMO_PLANCHA ? (
                <BoxTemplateDownload
                  length={box.length_mm}
                  width={box.width_mm}
                  height={box.height_mm}
                />
              ) : (
                <p className="text-sm text-gray-600">
                  Esta caja se fabrica en dos mitades pegadas: el desplegado técnico lo
                  prepara la fábrica junto con la orden.
                </p>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subir diseño (opcional)
                </label>
                <DesignUploader
                  onUpload={(url, name, previewUrl) => {
                    handleFieldUpdate('design_file_url', url);
                    handleFieldUpdate('design_file_name', name);
                    handleFieldUpdate('design_preview_url', previewUrl || url);
                  }}
                  onRemove={() => {
                    handleFieldUpdate('design_file_url', '');
                    handleFieldUpdate('design_file_name', '');
                    handleFieldUpdate('design_preview_url', '');
                  }}
                  currentFile={box.design_file_url ? {
                    url: box.design_file_url,
                    name: box.design_file_name,
                    previewUrl: box.design_preview_url,
                  } : null}
                />
              </div>
            </div>
          )}

          {/* Resumen de esta caja - sin precio */}
          {calculations && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>{calculations.pieces === 2 ? 'Planchas:' : 'Plancha:'}</span>
                <span className="font-medium">
                  {calculations.pieces === 2
                    ? `2 de ${calculations.sheetWidth} × ${calculations.sheetLength} mm`
                    : `${calculations.sheetWidth} × ${calculations.sheetLength} mm`}
                </span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>m² totales:</span>
                <span className="font-medium">{calculations.totalSqm.toLocaleString('es-AR', { minimumFractionDigits: 2 })} m²</span>
              </div>
            </div>
          )}

          {/* Caja en dos mitades: se avisa acá, junto al desglose, para que el
              proceso no aparezca de sorpresa recién en la cotización. */}
          {calculations && calculations.pieces === 2 && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <p className="text-xs text-blue-800">
                Esta caja supera el largo máximo de plancha, así que se fabrica en{' '}
                <strong>dos mitades que se pegan</strong>. El precio ya lo incluye.
              </p>
            </div>
          )}

          {/* Debajo del mínimo para fabricar a medida. Entre ese mínimo y el
              escalón de precio no va ningún aviso: ese pedido se vende normal.
              Los 500 m² NO son un mínimo para ESTA medida: es el piso de las
              medidas estándar de catálogo que se venden de stock. Decir "el
              mínimo de compra es 158" acá prometía fabricar a medida por
              debajo de los 1.000 m², que es justo lo que no hacemos. */}
          {calculations && calculations.esDeStock && (
            <div className="p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
              <p className="text-xs text-yellow-800">
                Con esta medida, <strong>{calculations.minCajasAMedida.toLocaleString('es-AR')}</strong>{' '}
                cajas son los {calculations.minM2AMedida.toLocaleString('es-AR')} m² desde los que
                fabricamos a medida. Para pedidos más chicos (desde{' '}
                {calculations.minM2Piso.toLocaleString('es-AR')} m²) vendemos{' '}
                <a href="/cajas" className="underline font-medium">
                  medidas estándar de catálogo
                </a>
                , que salen de stock.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
