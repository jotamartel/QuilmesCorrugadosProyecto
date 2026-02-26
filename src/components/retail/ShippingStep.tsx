'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { BoxQuoteLine, ShippingMethod, ShippingData } from '@/lib/retail/types';
import { formatPrecio } from '@/lib/retail/pricing';
import { RETAIL_CONFIG } from '@/lib/retail/config';
import AddressAutocomplete, { type ParsedAddress, isGoogleMapsAvailable } from './AddressAutocomplete';

interface ShippingStepProps {
  boxes: BoxQuoteLine[];
  visible: boolean;
  onSubmit: (shipping: ShippingData) => Promise<void>;
  onBack: () => void;
  savedShipping?: ShippingData | null;
}

const METHODS: {
  id: ShippingMethod;
  label: string;
  description: string;
  priceLabel: string | null; // null = use dynamic
}[] = [
  {
    id: 'retiro_sucursal',
    label: 'Retiro por sucursal',
    description: RETAIL_CONFIG.SHIPPING_FACTORY_ADDRESS,
    priceLabel: 'GRATIS',
  },
  {
    id: 'envio_caba_amba',
    label: 'Envio CABA / AMBA',
    description: 'Entrega a domicilio en zona CABA y Gran Buenos Aires',
    priceLabel: null, // dynamic: formatPrecio(SHIPPING_CABA_AMBA_COST)
  },
  {
    id: 'envio_resto_pais',
    label: 'Envio al resto del pais',
    description: 'Envio por transporte a cualquier punto del pais',
    priceLabel: 'A confirmar',
  },
];

export default function ShippingStep({ boxes, visible, onSubmit, onBack, savedShipping }: ShippingStepProps) {
  const [selectedMethod, setSelectedMethod] = useState<ShippingMethod | null>(savedShipping?.method ?? null);
  const [direccion, setDireccion] = useState(savedShipping?.direccion ?? '');
  const [ciudad, setCiudad] = useState(savedShipping?.ciudad ?? '');
  const [codigoPostal, setCodigoPostal] = useState(savedShipping?.codigoPostal ?? '');
  const [provincia, setProvincia] = useState(savedShipping?.provincia || 'Buenos Aires');
  const [addressValidated, setAddressValidated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [visible]);

  const needsAddress = selectedMethod === 'envio_caba_amba' || selectedMethod === 'envio_resto_pais';
  const isRestoDelPais = selectedMethod === 'envio_resto_pais';
  const isCabaAmba = selectedMethod === 'envio_caba_amba';

  /**
   * Check if an address is within CABA or AMBA.
   * CABA = province "Ciudad Autónoma de Buenos Aires"
   * AMBA = province "Buenos Aires" + coordinates within metropolitan bounds
   */
  const isInCabaAmba = useCallback((parsed: ParsedAddress): boolean => {
    const prov = parsed.provincia.toLowerCase().trim();

    // CABA — always valid
    if (prov.includes('ciudad aut') || prov.includes('caba')) return true;

    // AMBA — must be Buenos Aires province AND within coordinate bounds
    if (prov.includes('buenos aires')) {
      if (parsed.lat != null && parsed.lng != null) {
        const { SW, NE } = RETAIL_CONFIG.AMBA_BOUNDS;
        return (
          parsed.lat >= SW.lat && parsed.lat <= NE.lat &&
          parsed.lng >= SW.lng && parsed.lng <= NE.lng
        );
      }
      // No coordinates available — can't confirm AMBA, treat as outside
      return false;
    }

    // Any other province
    return false;
  }, []);

  // When user selects an address from Google Places
  const handleAddressSelect = useCallback((parsed: ParsedAddress) => {
    setDireccion(parsed.direccion);
    setCiudad(parsed.ciudad);
    setProvincia(parsed.provincia || 'Buenos Aires');
    setCodigoPostal(parsed.codigoPostal);
    setAddressValidated(true);

    // If they chose CABA/AMBA but the address is outside, switch to resto del país
    if (selectedMethod === 'envio_caba_amba' && !isInCabaAmba(parsed)) {
      setSelectedMethod('envio_resto_pais');
    }

    // Clear related errors
    setErrors(prev => {
      const n = { ...prev };
      delete n.direccion;
      delete n.ciudad;
      delete n._addressValidation;
      return n;
    });
  }, [selectedMethod, isInCabaAmba]);

  // Reset validation when user manually edits the address
  const handleDireccionChange = useCallback((value: string) => {
    setDireccion(value);
    setAddressValidated(false);
    if (errors.direccion) setErrors(prev => { const n = { ...prev }; delete n.direccion; return n; });
  }, [errors.direccion]);

  const precioProductos = boxes.reduce((sum, b) => sum + b.subtotal, 0);
  const shippingCost = selectedMethod === 'envio_caba_amba' ? RETAIL_CONFIG.SHIPPING_CABA_AMBA_COST : 0;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!selectedMethod) {
      errs._general = 'Selecciona un metodo de envio';
      setErrors(errs);
      return false;
    }

    if (needsAddress) {
      if (!direccion.trim()) errs.direccion = 'Requerido';
      if (!ciudad.trim()) errs.ciudad = 'Requerido';

      // For CABA/AMBA, require validated address from Google Places (only if API is available)
      if (isCabaAmba && !addressValidated && direccion.trim() && isGoogleMapsAvailable()) {
        errs._addressValidation = 'Selecciona una direccion de las sugerencias';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || submitting || !selectedMethod) return;
    setSubmitting(true);
    try {
      const isPickup = selectedMethod === 'retiro_sucursal';
      await onSubmit({
        method: selectedMethod,
        cost: isPickup ? 0 : isRestoDelPais ? 0 : RETAIL_CONFIG.SHIPPING_CABA_AMBA_COST,
        costConfirmed: !isRestoDelPais,
        direccion: isPickup ? '' : direccion.trim(),
        ciudad: isPickup ? '' : ciudad.trim(),
        provincia: isPickup ? '' : provincia.trim(),
        codigoPostal: isPickup ? '' : codigoPostal.trim(),
      });
    } catch {
      setErrors({ _general: 'Error al enviar. Intenta de nuevo.' });
      setSubmitting(false);
    }
  };

  const inputStyle = (hasError?: boolean) => ({
    fontFamily: 'var(--font-retail-sans), sans-serif',
    color: 'var(--retail-text)',
    background: 'var(--retail-surface)',
    borderColor: hasError ? '#ef4444' : 'var(--retail-border, #e0e0e0)',
    fontSize: '16px',
  });

  const labelStyle = {
    fontFamily: 'var(--font-retail-sans), sans-serif',
    color: 'var(--retail-text-muted)',
    fontSize: '12px',
  };

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden"
      style={{
        background: 'var(--retail-bg)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 400ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Header */}
      <div className="pt-safe-top px-6 pt-6 pb-3 text-center">
        <div
          className="text-xs tracking-[0.3em] uppercase mb-2"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            color: 'var(--retail-text-muted)',
          }}
        >
          Quilmes Corrugados
        </div>
        <h2
          className="text-xl font-bold"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            color: 'var(--retail-text)',
          }}
        >
          Envio
        </h2>
        <p
          className="text-sm mt-1"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            color: 'var(--retail-text-muted)',
          }}
        >
          Selecciona como queres recibir tu pedido
        </p>
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 px-6 py-4 overflow-y-auto">
        <div className="max-w-sm mx-auto space-y-4">

          {/* Method cards */}
          {METHODS.map((method, i) => {
            const isSelected = selectedMethod === method.id;
            return (
              <button
                key={method.id}
                onClick={() => {
                  setSelectedMethod(method.id);
                  if (errors._general) {
                    setErrors(prev => { const n = { ...prev }; delete n._general; return n; });
                  }
                }}
                className="w-full rounded-xl p-4 text-left active:scale-[0.98]"
                style={{
                  background: 'var(--retail-surface)',
                  border: isSelected ? '2px solid var(--retail-primary)' : '2px solid transparent',
                  boxShadow: isSelected
                    ? '0 4px 16px rgba(0,0,0,0.08)'
                    : '0 2px 8px rgba(0,0,0,0.04)',
                  transition: 'all 200ms ease',
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(12px)',
                  transitionDelay: `${i * 80}ms`,
                }}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-semibold"
                      style={{
                        fontFamily: 'var(--font-retail-sans), sans-serif',
                        color: 'var(--retail-text)',
                      }}
                    >
                      {method.label}
                    </div>
                    <div
                      className="text-xs mt-0.5"
                      style={{
                        fontFamily: 'var(--font-retail-sans), sans-serif',
                        color: 'var(--retail-text-muted)',
                      }}
                    >
                      {method.description}
                    </div>
                  </div>
                  <div
                    className="text-sm font-bold whitespace-nowrap"
                    style={{
                      fontFamily: 'var(--font-retail-mono), monospace',
                      color: method.id === 'retiro_sucursal'
                        ? '#16a34a'
                        : method.id === 'envio_resto_pais'
                          ? 'var(--retail-text-muted)'
                          : 'var(--retail-primary)',
                    }}
                  >
                    {method.priceLabel ?? formatPrecio(RETAIL_CONFIG.SHIPPING_CABA_AMBA_COST)}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Address form (visible when delivery method selected) */}
          {needsAddress && (
            <div
              className="space-y-3 pt-2"
              style={{
                opacity: 1,
                transition: 'all 300ms ease',
              }}
            >
              <div
                className="text-xs font-semibold uppercase tracking-wider"
                style={{
                  fontFamily: 'var(--font-retail-sans), sans-serif',
                  color: 'var(--retail-text-muted)',
                }}
              >
                Direccion de entrega
              </div>

              <div>
                <label style={labelStyle}>Direccion *</label>
                <AddressAutocomplete
                  value={direccion}
                  onChange={handleDireccionChange}
                  onSelect={handleAddressSelect}
                  placeholder="Calle y numero"
                  hasError={!!errors.direccion || !!errors._addressValidation}
                  inputStyle={inputStyle(!!errors.direccion || !!errors._addressValidation)}
                  restrictToAmba={isCabaAmba}
                />
                {errors.direccion && <span className="text-xs text-red-500 mt-1">{errors.direccion}</span>}
                {errors._addressValidation && (
                  <span className="text-xs text-red-500 mt-1">{errors._addressValidation}</span>
                )}
                {addressValidated && direccion && (
                  <span className="text-xs mt-1" style={{ color: '#16a34a' }}>✓ Direccion verificada</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>Ciudad *</label>
                  <input
                    type="text"
                    value={ciudad}
                    onChange={e => {
                      setCiudad(e.target.value);
                      if (errors.ciudad) setErrors(prev => { const n = { ...prev }; delete n.ciudad; return n; });
                    }}
                    readOnly={addressValidated && isCabaAmba}
                    className="w-full mt-1 px-4 py-3 rounded-xl border-2 outline-none"
                    style={{
                      ...inputStyle(!!errors.ciudad),
                      ...(addressValidated && isCabaAmba ? { opacity: 0.7 } : {}),
                    }}
                    placeholder="Localidad"
                  />
                  {errors.ciudad && <span className="text-xs text-red-500 mt-1">{errors.ciudad}</span>}
                </div>
                <div>
                  <label style={labelStyle}>Cod. Postal</label>
                  <input
                    type="text"
                    value={codigoPostal}
                    onChange={e => setCodigoPostal(e.target.value)}
                    readOnly={addressValidated && isCabaAmba}
                    className="w-full mt-1 px-4 py-3 rounded-xl border-2 outline-none"
                    style={{
                      ...inputStyle(),
                      ...(addressValidated && isCabaAmba ? { opacity: 0.7 } : {}),
                    }}
                    placeholder="1878"
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Provincia</label>
                <input
                  type="text"
                  value={provincia}
                  onChange={e => setProvincia(e.target.value)}
                  readOnly={addressValidated && isCabaAmba}
                  className="w-full mt-1 px-4 py-3 rounded-xl border-2 outline-none"
                  style={{
                    ...inputStyle(),
                    ...(addressValidated && isCabaAmba ? { opacity: 0.7 } : {}),
                  }}
                />
              </div>
            </div>
          )}

          {/* Note for resto del pais */}
          {isRestoDelPais && (
            <div
              className="rounded-xl p-3 text-xs"
              style={{
                fontFamily: 'var(--font-retail-sans), sans-serif',
                background: '#fef3c7',
                color: '#92400e',
              }}
            >
              El costo de envio sera confirmado via email o WhatsApp antes de procesar el pedido.
            </div>
          )}

          {/* Summary */}
          {selectedMethod && (
            <div
              className="rounded-xl p-4 mt-2"
              style={{
                background: 'var(--retail-surface)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              <div className="flex justify-between items-baseline mb-2">
                <span
                  className="text-xs"
                  style={{
                    fontFamily: 'var(--font-retail-sans), sans-serif',
                    color: 'var(--retail-text-muted)',
                  }}
                >
                  Subtotal productos
                </span>
                <span
                  className="text-sm tabular-nums"
                  style={{
                    fontFamily: 'var(--font-retail-mono), monospace',
                    color: 'var(--retail-text)',
                  }}
                >
                  {formatPrecio(precioProductos)}
                </span>
              </div>

              <div className="flex justify-between items-baseline mb-3">
                <span
                  className="text-xs"
                  style={{
                    fontFamily: 'var(--font-retail-sans), sans-serif',
                    color: 'var(--retail-text-muted)',
                  }}
                >
                  Envio
                </span>
                <span
                  className="text-sm tabular-nums"
                  style={{
                    fontFamily: 'var(--font-retail-mono), monospace',
                    color: selectedMethod === 'retiro_sucursal'
                      ? '#16a34a'
                      : isRestoDelPais
                        ? 'var(--retail-text-muted)'
                        : 'var(--retail-text)',
                  }}
                >
                  {selectedMethod === 'retiro_sucursal'
                    ? 'Gratis'
                    : isRestoDelPais
                      ? 'A confirmar'
                      : formatPrecio(shippingCost)}
                </span>
              </div>

              <div
                className="pt-2 flex justify-between items-baseline"
                style={{ borderTop: '2px solid var(--retail-text)' }}
              >
                <span
                  className="text-sm font-semibold"
                  style={{
                    fontFamily: 'var(--font-retail-sans), sans-serif',
                    color: 'var(--retail-text)',
                  }}
                >
                  TOTAL
                </span>
                <span
                  className="text-xl font-bold tabular-nums"
                  style={{
                    fontFamily: 'var(--font-retail-mono), monospace',
                    color: 'var(--retail-text)',
                  }}
                >
                  {isRestoDelPais
                    ? `${formatPrecio(precioProductos)} + envio`
                    : formatPrecio(precioProductos + shippingCost)}
                </span>
              </div>
            </div>
          )}

          {/* General error */}
          {errors._general && (
            <p
              className="text-xs text-center"
              style={{ color: '#ef4444', fontFamily: 'var(--font-retail-sans), sans-serif' }}
            >
              {errors._general}
            </p>
          )}
        </div>
      </div>

      {/* Footer buttons */}
      <div
        className="px-6 pb-safe-bottom pb-6 space-y-3 max-w-sm mx-auto w-full"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 400ms cubic-bezier(0.4, 0, 0.2, 1) 200ms',
        }}
      >
        <button
          onClick={handleSubmit}
          disabled={submitting || !selectedMethod}
          className="w-full rounded-2xl py-4 text-base font-semibold tracking-wide active:scale-95 disabled:opacity-50"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            background: 'var(--retail-primary)',
            color: '#fff',
            border: 'none',
            transition: 'transform 150ms',
          }}
        >
          {submitting
            ? 'PROCESANDO...'
            : isRestoDelPais
              ? 'SOLICITAR PEDIDO'
              : 'PAGAR'}
        </button>
        <button
          onClick={onBack}
          disabled={submitting}
          className="w-full rounded-2xl py-3 text-sm font-medium tracking-wide active:scale-95"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            background: 'transparent',
            color: 'var(--retail-text-muted)',
            border: 'none',
            transition: 'transform 150ms',
          }}
        >
          Volver
        </button>
      </div>
    </div>
  );
}
