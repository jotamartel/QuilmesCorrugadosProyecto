'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, AlertCircle, Loader2, Send, CheckCircle } from 'lucide-react';
import { trackEvent } from '@/lib/utils/tracking';
import { formatCurrency } from '@/lib/utils/pricing';
import { calculateUnfolded, calculateTotalM2 } from '@/lib/utils/box-calculations';
import { ARGENTINE_PROVINCES } from '@/lib/types/database';
import type { BuenosAiresCity } from '@/lib/types/database';

interface BelowMinimumModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteId: string;
  boxDimensions: {
    length_mm: number;
    width_mm: number;
    height_mm: number;
  };
  originalQuantity: number;
  originalTotalSqm: number;
  pricePerM2BelowMinimum: number;
  minM2PerModel: number;
  onSuccess: () => void;
}

export function BelowMinimumModal({
  isOpen,
  onClose,
  quoteId,
  boxDimensions,
  originalQuantity,
  originalTotalSqm,
  pricePerM2BelowMinimum,
  minM2PerModel,
  onSuccess,
}: BelowMinimumModalProps) {
  const [quantity, setQuantity] = useState<number>(originalQuantity);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Datos de entrega
  const [province, setProvince] = useState<string>('Buenos Aires');
  const [city, setCity] = useState<string>('');
  const [cityId, setCityId] = useState<number | null>(null);
  const [address, setAddress] = useState<string>('');
  const [postalCode, setPostalCode] = useState<string>('');
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  
  // Ciudades de Buenos Aires
  const [cities, setCities] = useState<BuenosAiresCity[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  // Calcular m2 por caja
  const unfolded = calculateUnfolded(boxDimensions.length_mm, boxDimensions.width_mm, boxDimensions.height_mm);
  const sqmPerBox = unfolded.m2;
  const totalSqm = calculateTotalM2(sqmPerBox, quantity);
  const minQuantityFor1000m2 = Math.ceil(1000 / sqmPerBox);

  // Validar cantidad mínima (1000m2)
  const isValid = totalSqm >= 1000 && totalSqm < minM2PerModel;
  const isBelow1000m2 = totalSqm < 1000;
  
  // Validar datos de entrega requeridos
  const isDeliveryDataValid = province && city.trim() && address.trim();

  // Calcular precio con recargo
  const subtotal = totalSqm * pricePerM2BelowMinimum;
  const unitPrice = subtotal / quantity;

  // Cargar ciudades cuando la provincia es Buenos Aires o CABA
  useEffect(() => {
    const fetchCities = async () => {
      if (province !== 'Buenos Aires' && province !== 'CABA') {
        setCities([]);
        return;
      }
      setLoadingCities(true);
      try {
        const response = await fetch('/api/public/cities');
        if (response.ok) {
          const data = await response.json();
          setCities(data.cities || []);
        }
      } catch (err) {
        console.error('Error loading cities:', err);
      } finally {
        setLoadingCities(false);
      }
    };
    fetchCities();
  }, [province]);

  // Filtrar ciudades según búsqueda
  const filteredCities = useMemo(() => {
    if (!citySearch.trim()) return cities.slice(0, 20);
    const search = citySearch.toLowerCase();
    return cities
      .filter(c => c.name.toLowerCase().includes(search) || c.partido?.toLowerCase().includes(search))
      .slice(0, 20);
  }, [cities, citySearch]);

  useEffect(() => {
    if (isOpen) {
      setQuantity(originalQuantity);
      setError(null);
      setSuccess(false);
      // Resetear campos de dirección
      setProvince('Buenos Aires');
      setCity('');
      setCityId(null);
      setAddress('');
      setPostalCode('');
      setDistanceKm(null);
      setCitySearch('');
      setShowCityDropdown(false);
    }
  }, [isOpen, originalQuantity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValid) {
      if (isBelow1000m2) {
        setError(`La cantidad mínima es ${minQuantityFor1000m2} cajas para alcanzar 1000m²`);
      } else {
        setError(`El pedido debe ser menor a ${minM2PerModel}m² para usar esta opción`);
      }
      return;
    }

    // Validar datos de entrega
    if (!isDeliveryDataValid) {
      setError('Por favor completá todos los datos de entrega para poder calcular el costo de envío');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/public/quotes/below-minimum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote_id: quoteId,
          requested_quantity: quantity,
          // Datos de entrega
          address: address.trim(),
          city: city.trim(),
          province: province,
          postal_code: postalCode.trim() || null,
          distance_km: distanceKm,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar la solicitud');
      }

      // Mostrar estado de éxito
      setSuccess(true);
      trackEvent('quote_submitted', { source: 'below_minimum_modal', quote_id: quoteId });

      // Llamar a onSuccess después de un breve delay
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" data-lenis-prevent>
      {/* Overlay con blur */}
      <div
        className="fixed inset-0 bg-white/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" data-lenis-prevent>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">¿Necesitas menos m²?</h3>
                <p className="text-sm text-gray-500">Cotización para pedidos menores al mínimo</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          {success ? (
            /* Estado de éxito */
            <div className="px-6 py-8 text-center">
              <div className="flex flex-col items-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    ¡Solicitud enviada con éxito!
                  </h3>
                  <p className="text-sm text-gray-600 max-w-md">
                    Hemos recibido tu solicitud. Estaremos teniendo en cuenta tu pedido al momento de programar las producciones de las próximas semanas y te contactaremos para coordinar el pago de la seña y ultimar detalles.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="px-6 py-4 space-y-4">
              {/* Información de la caja */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Medidas de la caja</p>
                <p className="text-sm text-gray-600">
                  {boxDimensions.length_mm} × {boxDimensions.width_mm} × {boxDimensions.height_mm} mm
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  m² por caja: {sqmPerBox.toFixed(4)} m²
                </p>
              </div>

              {/* Cantidad */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cantidad de cajas
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  min={minQuantityFor1000m2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                {isBelow1000m2 && (
                  <p className="mt-1 text-sm text-red-600">
                    Mínimo: {minQuantityFor1000m2} cajas para alcanzar 1000m²
                  </p>
                )}
                {totalSqm >= minM2PerModel && (
                  <p className="mt-1 text-sm text-red-600">
                    El pedido debe ser menor a {minM2PerModel}m² para usar esta opción
                  </p>
                )}
              </div>

              {/* Resumen de cálculo */}
              {isValid && (
                <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total m²:</span>
                    <span className="font-medium">{totalSqm.toFixed(2)} m²</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Precio unitario:</span>
                    <span className="font-medium">{formatCurrency(unitPrice)}</span>
                  </div>
                  <div className="border-t border-blue-200 pt-2 flex justify-between">
                    <span className="font-semibold text-gray-900">Total estimado:</span>
                    <span className="font-bold text-lg text-blue-600">{formatCurrency(subtotal)}</span>
                  </div>
                </div>
              )}

              {/* Datos de entrega - REQUERIDOS */}
              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">
                  Datos de entrega <span className="text-red-500">*</span>
                </h4>
                <p className="text-xs text-gray-600 mb-4">
                  Necesitamos estos datos para poder calcular el costo de envío cuando te contactemos.
                </p>
                
                <div className="space-y-3">
                  {/* Provincia */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Provincia <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={province}
                      onChange={(e) => {
                        setProvince(e.target.value);
                        setCity('');
                        setCityId(null);
                        setDistanceKm(null);
                        setCitySearch('');
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      {ARGENTINE_PROVINCES.map(prov => (
                        <option key={prov} value={prov}>{prov}</option>
                      ))}
                    </select>
                  </div>

                  {/* Ciudad */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ciudad / Localidad <span className="text-red-500">*</span>
                    </label>
                    {(province === 'Buenos Aires' || province === 'CABA') ? (
                      <>
                        <input
                          type="text"
                          value={citySearch || city}
                          onChange={(e) => {
                            setCitySearch(e.target.value);
                            setShowCityDropdown(true);
                            if (!e.target.value) {
                              setCity('');
                              setCityId(null);
                              setDistanceKm(null);
                            }
                          }}
                          onFocus={() => setShowCityDropdown(true)}
                          placeholder={loadingCities ? 'Cargando ciudades...' : 'Buscar ciudad...'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        />
                        {showCityDropdown && filteredCities.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto" data-lenis-prevent>
                            {filteredCities.map((cityItem) => (
                              <button
                                key={cityItem.id}
                                type="button"
                                onClick={() => {
                                  setCity(cityItem.name);
                                  setCityId(cityItem.id);
                                  setDistanceKm(cityItem.distance_km);
                                  if (cityItem.postal_codes && cityItem.postal_codes.length > 0) {
                                    setPostalCode(cityItem.postal_codes[0]);
                                  }
                                  setCitySearch('');
                                  setShowCityDropdown(false);
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-blue-50 flex justify-between items-center border-b border-gray-100 last:border-b-0"
                              >
                                <span>
                                  <span className="font-medium">{cityItem.name}</span>
                                  {cityItem.partido && <span className="text-gray-500 text-sm ml-1">({cityItem.partido})</span>}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                  {cityItem.distance_km} km
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        {city && distanceKm !== null && (
                          <p className="mt-1 text-xs text-gray-600">
                            Distancia: {distanceKm} km desde Quilmes
                          </p>
                        )}
                      </>
                    ) : (
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Ingrese la ciudad"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    )}
                  </div>

                  {/* Dirección */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dirección (calle y número) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Calle y número"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>

                  {/* Código Postal */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Código Postal
                    </label>
                    <input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="Opcional"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Advertencias */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium mb-1">Condiciones especiales:</p>
                    <ul className="list-disc list-inside space-y-1 text-yellow-700">
                      <li>No aplica envío gratis - deberás abonar el envío o coordinar retiro en fábrica</li>
                      <li>Te contactaremos si encontramos un hueco en la producción para tomar tu pedido</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!isValid || !isDeliveryDataValid || loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#002E55] rounded-lg hover:bg-[#001a33] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {loading ? (
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
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
