'use client';

import { useRef, useCallback, useEffect } from 'react';
import type { DragAxis } from '@/lib/retail/types';
import { RETAIL_CONFIG } from '@/lib/retail/config';

interface DimensionSliderProps {
  axis: DragAxis;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  active: boolean;
  showHint: boolean;
  hintText: string;
  /** Extra validation: return clamped value */
  validate?: (newValue: number) => number;
}

export default function DimensionSlider({
  axis,
  value,
  min,
  max,
  onChange,
  active,
  showHint,
  hintText,
  validate,
}: DimensionSliderProps) {
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const startValue = useRef(value);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleStart = useCallback((clientX: number, clientY: number) => {
    startPos.current = { x: clientX, y: clientY };
    startValue.current = value;
  }, [value]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!startPos.current) return;

    const delta = axis === 'horizontal'
      ? clientX - startPos.current.x
      : -(clientY - startPos.current.y); // Inverted: up = more

    const mmDelta = delta * RETAIL_CONFIG.DRAG_SENSITIVITY;
    let newValue = Math.round(startValue.current + mmDelta);

    // Clamp to min/max
    newValue = Math.max(min, Math.min(max, newValue));

    // Extra validation (e.g., MAX_SHEET_WIDTH)
    if (validate) {
      newValue = validate(newValue);
    }

    onChange(newValue);
  }, [axis, min, max, onChange, validate]);

  const handleEnd = useCallback(() => {
    startPos.current = null;
  }, []);

  // Touch events
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !active) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleStart(touch.clientX, touch.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    };
    const onTouchEnd = () => handleEnd();

    const onMouseDown = (e: MouseEvent) => {
      handleStart(e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };
    const onMouseUp = () => handleEnd();

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [active, handleStart, handleMove, handleEnd]);

  if (!active) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-20"
      style={{ cursor: axis === 'horizontal' ? 'ew-resize' : 'ns-resize', touchAction: 'none' }}
    >
      {/* Hint overlay */}
      {showHint && (
        <div
          className="absolute inset-x-0 bottom-24 flex items-center justify-center pointer-events-none"
          style={{
            animation: 'retailHintPulse 1.5s ease-in-out infinite, retailFadeOut 1.5s ease-out forwards',
          }}
        >
          <span
            className="text-sm tracking-widest px-4 py-2 rounded-full"
            style={{
              fontFamily: 'var(--font-retail-sans), sans-serif',
              color: 'var(--retail-text-muted)',
              background: 'rgba(255,255,255,0.8)',
              backdropFilter: 'blur(4px)',
            }}
          >
            {hintText}
          </span>
        </div>
      )}
    </div>
  );
}
