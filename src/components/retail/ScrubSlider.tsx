'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

interface ScrubSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  validate?: (value: number) => number;
  visible: boolean;
  orientation?: 'horizontal' | 'vertical';
}

const SCRUB_SENSITIVITY = 0.4; // mm per pixel — very fine
const TICK_SPACING = 8;        // px between minor ticks
const MAJOR_EVERY = 5;         // major tick every N minor ticks
const SLIDER_SIZE = 200;       // px length of the slider track

export default function ScrubSlider({ value, min, max, onChange, validate, visible, orientation = 'horizontal' }: ScrubSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startPos = useRef<number | null>(null);
  const startValue = useRef(value);
  const [hasInteracted, setHasInteracted] = useState(false);
  const isVertical = orientation === 'vertical';

  const handleStart = useCallback((pos: number) => {
    startPos.current = pos;
    startValue.current = value;
    if (!hasInteracted) setHasInteracted(true);
  }, [value, hasInteracted]);

  const handleMove = useCallback((pos: number) => {
    if (startPos.current === null) return;

    const delta = pos - startPos.current;
    // For vertical: dragging UP (negative delta) should INCREASE value
    const mmDelta = (isVertical ? -delta : delta) * SCRUB_SENSITIVITY;
    let newValue = Math.round(startValue.current + mmDelta);

    newValue = Math.max(min, Math.min(max, newValue));
    if (validate) newValue = validate(newValue);

    onChange(newValue);
  }, [min, max, onChange, validate, isVertical]);

  const handleEnd = useCallback(() => {
    startPos.current = null;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !visible) return;

    const getPos = (e: TouchEvent) => isVertical ? e.touches[0].clientY : e.touches[0].clientX;
    const getMousePos = (e: MouseEvent) => isVertical ? e.clientY : e.clientX;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      handleStart(getPos(e));
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleMove(getPos(e));
    };
    const onTouchEnd = () => handleEnd();

    const onMouseDown = (e: MouseEvent) => handleStart(getMousePos(e));
    const onMouseMove = (e: MouseEvent) => handleMove(getMousePos(e));
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
  }, [visible, handleStart, handleMove, handleEnd, isVertical]);

  // Generate tick marks relative to value — they scroll as value changes
  const tickCount = 60;
  const offset = (value / SCRUB_SENSITIVITY) % TICK_SPACING;

  if (isVertical) {
    return (
      <div
        style={{
          width: visible ? '36px' : '0px',
          opacity: visible ? 1 : 0,
          transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
        }}
      >
        <div
          ref={containerRef}
          className="relative"
          style={{
            width: '36px',
            height: `${SLIDER_SIZE}px`,
            cursor: 'ns-resize',
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          {/* Fade edges (top/bottom) */}
          <div
            className="absolute inset-0 z-10 pointer-events-none"
            style={{
              background: 'linear-gradient(180deg, var(--retail-bg) 0%, transparent 20%, transparent 80%, var(--retail-bg) 100%)',
            }}
          />

          {/* Scrolling ticks (horizontal lines, stacked vertically) */}
          <div
            className="absolute inset-0 flex items-center"
            style={{
              transform: `translateY(${offset}px)`,
            }}
          >
            {Array.from({ length: tickCount }, (_, i) => {
              const isMajor = i % MAJOR_EVERY === 0;
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    top: `${(i - tickCount / 2) * TICK_SPACING + SLIDER_SIZE / 2}px`,
                    right: '6px',
                    height: isMajor ? '1.5px' : '1px',
                    width: isMajor ? '16px' : '10px',
                    background: isMajor
                      ? 'var(--retail-text)'
                      : 'var(--retail-text-muted)',
                    opacity: isMajor ? 0.4 : 0.2,
                    borderRadius: '1px',
                  }}
                />
              );
            })}
          </div>

          {/* Gray arrow hint ↑↓ — only before first interaction */}
          <div
            className="absolute z-20 pointer-events-none flex items-center justify-center"
            style={{
              top: '50%',
              right: '-10px',
              transform: 'translateY(-50%)',
              opacity: hasInteracted ? 0 : 0.35,
              transition: 'opacity 400ms ease-out',
            }}
          >
            <svg width="14" height="40" viewBox="0 0 14 40" fill="none">
              {/* Up arrow */}
              <path d="M7 8 L4 2 L10 2 Z" fill="var(--retail-text-muted)" />
              <line x1="7" y1="8" x2="7" y2="18" stroke="var(--retail-text-muted)" strokeWidth="1.5" />
              {/* Down arrow */}
              <path d="M7 32 L4 38 L10 38 Z" fill="var(--retail-text-muted)" />
              <line x1="7" y1="22" x2="7" y2="32" stroke="var(--retail-text-muted)" strokeWidth="1.5" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  // Horizontal (default)
  return (
    <div
      style={{
        height: visible ? '36px' : '0px',
        opacity: visible ? 1 : 0,
        transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
      }}
    >
      <div
        ref={containerRef}
        className="relative mx-auto"
        style={{
          width: `${SLIDER_SIZE}px`,
          height: '36px',
          cursor: 'ew-resize',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {/* Fade edges */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, var(--retail-bg) 0%, transparent 20%, transparent 80%, var(--retail-bg) 100%)',
          }}
        />

        {/* Scrolling ticks */}
        <div
          className="absolute inset-0 flex items-end"
          style={{
            transform: `translateX(${-offset}px)`,
          }}
        >
          {Array.from({ length: tickCount }, (_, i) => {
            const isMajor = i % MAJOR_EVERY === 0;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${(i - tickCount / 2) * TICK_SPACING + SLIDER_SIZE / 2}px`,
                  bottom: '6px',
                  width: isMajor ? '1.5px' : '1px',
                  height: isMajor ? '16px' : '10px',
                  background: isMajor
                    ? 'var(--retail-text)'
                    : 'var(--retail-text-muted)',
                  opacity: isMajor ? 0.4 : 0.2,
                  borderRadius: '1px',
                }}
              />
            );
          })}
        </div>

        {/* Gray arrow hint ←→ — only before first interaction */}
        <div
          className="absolute z-20 pointer-events-none flex items-center justify-center"
          style={{
            left: '50%',
            bottom: '-10px',
            transform: 'translateX(-50%)',
            opacity: hasInteracted ? 0 : 0.35,
            transition: 'opacity 400ms ease-out',
          }}
        >
          <svg width="40" height="14" viewBox="0 0 40 14" fill="none">
            {/* Left arrow */}
            <path d="M8 7 L2 4 L2 10 Z" fill="var(--retail-text-muted)" />
            <line x1="8" y1="7" x2="18" y2="7" stroke="var(--retail-text-muted)" strokeWidth="1.5" />
            {/* Right arrow */}
            <path d="M32 7 L38 4 L38 10 Z" fill="var(--retail-text-muted)" />
            <line x1="22" y1="7" x2="32" y2="7" stroke="var(--retail-text-muted)" strokeWidth="1.5" />
          </svg>
        </div>
      </div>
    </div>
  );
}
