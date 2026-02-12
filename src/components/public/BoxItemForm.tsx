'use client';

import { Trash2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { BoxTemplateDownload } from './BoxTemplateDownload';
import { DesignUploader } from './DesignUploader';
import { calculateUnfolded, calculateTotalM2 } from '@/lib/utils/box-calculations';
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
  minQuantityFor3000m2: number;
  meetsMinimum: boolean;
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

  const unfolded = calculateUnfolded(length_mm, width_mm, height_mm);
  const totalSqm = calculateTotalM2(unfolded.m2, quantity);
  
  // REQUERIDO: La configuración de precios debe venir siempre desde la base de datos
  // No usar valores por defecto hardcodeados
  if (!pricingConfig) {
    return null; // No calcular si no hay configuración
  }
  
  const pricePerM2 = getPricePerM2(totalSqm, pricingConfig);
  
  const subtotal = Math.round(totalSqm * pricePerM2 * 100) / 100;
  const unitPrice = quantity > 0 ? Math.round((subtotal / quantity) * 100) / 100 : 0;
  const minQuantityFor3000m2 = Math.ceil(pricingConfig.min_m2_per_model / unfolded.m2);

  return {
    sheetWidth: unfolded.unfoldedWidth,
    sheetLength: unfolded.unfoldedLength,
    sqmPerBox: unfolded.m2,
    totalSqm,
    pricePerM2,
    unitPrice,
    subtotal,
    minQuantityFor3000m2,
    meetsMinimum: totalSqm >= pricingConfig.min_m2_per_model,
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
            <h4 className="font-medium text-gray-900">Caja {index + 1}</h4>
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
              min={calculations?.minQuantityFor3000m2 || 100}
              value={box.quantity || ''}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '');
                handleFieldUpdate('quantity', value ? parseInt(value) : 0);
              }}
              placeholder={calculations ? `Mín. ${calculations.minQuantityFor3000m2.toLocaleString('es-AR')}` : ''}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent text-base ${
                calculations && !calculations.meetsMinimum && calculations.totalSqm < 1000 ? 'border-red-400 bg-red-50' : calculations && !calculations.meetsMinimum ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'
              }`}
            />
            {calculations && (
              <p className={`text-xs mt-1 ${calculations.meetsMinimum ? 'text-gray-400' : 'text-yellow-600'}`}>
                Recomendado: {calculations.minQuantityFor3000m2.toLocaleString('es-AR')} uds para 3.000 m²
                {!calculations.meetsMinimum && calculations.totalSqm >= 1000 && ' (mínimo 1.000 m² con recargo)'}
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

              {/* Descargar plantilla PDF */}
              <BoxTemplateDownload
                length={box.length_mm}
                width={box.width_mm}
                height={box.height_mm}
              />

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
                <span>Plancha:</span>
                <span className="font-medium">{calculations.sheetWidth} × {calculations.sheetLength} mm</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>m² totales:</span>
                <span className="font-medium">{calculations.totalSqm.toLocaleString('es-AR', { minimumFractionDigits: 2 })} m²</span>
              </div>
            </div>
          )}

          {/* Mensaje de mínimo no alcanzado */}
          {calculations && !calculations.meetsMinimum && (
            <div className="p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
              <p className="text-xs text-yellow-800">
                <strong>Pedido menor al mínimo recomendado:</strong> Para alcanzar los 3.000 m² recomendados necesitás{' '}
                <strong>{calculations.minQuantityFor3000m2.toLocaleString('es-AR')}</strong> unidades.
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                Podés cotizar desde 1.000 m², la producción estará sujeta a disponibilidad.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
