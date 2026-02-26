'use client';

import { useRef, useEffect, useMemo } from 'react';
import { RETAIL_CONFIG } from '@/lib/retail/config';
import { calculateUnfolded } from '@/lib/utils/box-calculations';

interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  visible: boolean;
  largo: number;
  ancho: number;
  alto: number;
}

export default function QuantityInput({ value, onChange, visible, largo, ancho, alto }: QuantityInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw === '') {
      onChange(0);
      return;
    }
    const num = parseInt(raw, 10);
    onChange(Math.min(num, 99999)); // sanity cap
  };

  // Calculate m² info for dynamic feedback
  const { m2PerBox, totalM2, qtyForWholesale } = useMemo(() => {
    const { m2 } = calculateUnfolded(largo, ancho, alto);
    return {
      m2PerBox: m2,
      totalM2: m2 * value,
      qtyForWholesale: Math.ceil(RETAIL_CONFIG.WHOLESALE_THRESHOLD_M2 / m2),
    };
  }, [largo, ancho, alto, value]);

  const isMayorista = totalM2 >= RETAIL_CONFIG.WHOLESALE_THRESHOLD_M2;

  return (
    <div
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
          color: isMayorista ? 'var(--retail-primary)' : 'var(--retail-text-muted)',
          transition: 'color 300ms',
        }}
      >
        {value > 0 ? (
          isMayorista ? (
            <>Precio mayorista ({totalM2.toFixed(0)} m²)</>
          ) : (
            <>Con {qtyForWholesale.toLocaleString('es-AR')}+ uds. accedes al precio mayorista</>
          )
        ) : (
          <>Minimo {RETAIL_CONFIG.MIN_CANTIDAD} unidad</>
        )}
      </div>
    </div>
  );
}
