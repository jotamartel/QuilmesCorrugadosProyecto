'use client';

import { useRef, useEffect, useMemo, useCallback } from 'react';
import { RETAIL_CONFIG } from '@/lib/retail/config';
import type { RetailConfig } from '@/lib/retail/config';
import { calculateUnfolded } from '@/lib/utils/box-calculations';

const WHEEL_STEP = 5; // unidades por tick de scroll

interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  visible: boolean;
  largo: number;
  ancho: number;
  alto: number;
  /** m² de las medidas que ya estan en el pedido. El minimo es del pedido entero. */
  m2Acumulados?: number;
  retailConfig?: RetailConfig;
}

export default function QuantityInput({
  value,
  onChange,
  visible,
  largo,
  ancho,
  alto,
  m2Acumulados = 0,
  retailConfig,
}: QuantityInputProps) {
  const cfg = retailConfig ?? RETAIL_CONFIG;
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Wheel handler: scroll up/down to change quantity in steps of WHEEL_STEP
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const direction = e.deltaY < 0 ? 1 : -1; // scroll up = more
    const newValue = Math.max(0, Math.min(99999, value + direction * WHEEL_STEP));
    onChange(newValue);
  }, [value, onChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !visible) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [visible, handleWheel]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw === '') {
      onChange(0);
      return;
    }
    const num = parseInt(raw, 10);
    onChange(Math.min(num, 99999)); // sanity cap
  };

  // El minimo es de superficie y es del PEDIDO ENTERO, no de esta linea: dos
  // medidas de 300 m² son un pedido valido de 600. Por eso entra m2Acumulados.
  const { m2Pedido, cajasMinimo, cajasFaltantes, qtyForWholesale } = useMemo(() => {
    const { m2 } = calculateUnfolded(largo, ancho, alto);
    const pedido = m2Acumulados + m2 * value;
    const faltanM2 = Math.max(0, cfg.MIN_M2_PEDIDO - pedido);
    return {
      m2Pedido: pedido,
      // Cuantas cajas de ESTA medida hacen falta para llegar al piso, contando
      // lo que ya esta cargado.
      cajasMinimo: Math.ceil(Math.max(0, cfg.MIN_M2_PEDIDO - m2Acumulados) / m2),
      cajasFaltantes: Math.ceil(faltanM2 / m2),
      qtyForWholesale: Math.ceil(Math.max(0, cfg.WHOLESALE_THRESHOLD_M2 - m2Acumulados) / m2),
    };
  }, [largo, ancho, alto, value, m2Acumulados, cfg]);

  const isMayorista = m2Pedido >= cfg.WHOLESALE_THRESHOLD_M2;
  // Debajo del piso el boton de confirmar no aparece (BoxGame lo oculta), asi que
  // hay que decir aca por que y cuanto falta. Antes esto se enteraba recien en la
  // pantalla de cotizacion, con el pedido entero ya cargado.
  const belowMinimum = value > 0 && m2Pedido < cfg.MIN_M2_PEDIDO;

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center gap-3 w-full px-6"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 400ms cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {/* Dimension summary */}
      <div
        className="text-sm tracking-wider tabular-nums"
        style={{
          fontFamily: 'var(--font-retail-mono), monospace',
          color: 'var(--retail-text-muted)',
        }}
      >
        {largo} x {ancho} x {alto} mm
      </div>

      {/* Quantity input */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value || ''}
        onChange={handleChange}
        placeholder="Cantidad"
        className="w-full max-w-[200px] text-center text-3xl font-semibold rounded-xl border-2 outline-none"
        style={{
          fontFamily: 'var(--font-retail-mono), monospace',
          color: 'var(--retail-text)',
          borderColor: 'var(--retail-primary)',
          background: 'var(--retail-surface)',
          padding: '12px 16px',
          fontSize: '16px', // Prevent zoom on iOS
        }}
      />

      {/* m² feedback */}
      <div
        className="text-xs text-center"
        style={{
          fontFamily: 'var(--font-retail-sans), sans-serif',
          color: belowMinimum || isMayorista
            ? '#d97706'
            : 'var(--retail-text-muted)',
          transition: 'color 300ms',
        }}
      >
        {belowMinimum ? (
          <>
            {m2Pedido.toFixed(0)} m² — el minimo es {cfg.MIN_M2_PEDIDO} m², te faltan{' '}
            {cajasFaltantes.toLocaleString('es-AR')} cajas
          </>
        ) : value > 0 ? (
          isMayorista ? (
            // Paso el tope de stock: a este volumen se produce a medida y lo
            // cotiza el mayorista, no este canal.
            <>{m2Pedido.toFixed(0)} m² — supera el stock, se fabrica a medida</>
          ) : (
            <>
              {m2Pedido.toFixed(0)} m² — desde {qtyForWholesale.toLocaleString('es-AR')} uds. se
              fabrica a medida y el m² baja
            </>
          )
        ) : (
          <>
            Minimo {cajasMinimo.toLocaleString('es-AR')} cajas de esta medida ({cfg.MIN_M2_PEDIDO} m²
            de carton)
          </>
        )}
      </div>
    </div>
  );
}
