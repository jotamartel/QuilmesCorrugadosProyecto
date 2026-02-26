'use client';

import type { BoxQuoteLine } from '@/lib/retail/types';

interface PreviousBoxesListProps {
  boxes: BoxQuoteLine[];
  onEdit: (index: number) => void;
  visible: boolean;
  editingIndex: number | null;
}

export default function PreviousBoxesList({ boxes, onEdit, visible, editingIndex }: PreviousBoxesListProps) {
  if (boxes.length === 0) return null;

  return (
    <div
      className="w-full max-w-xs mx-auto"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 300ms ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <p
        className="text-xs tracking-[0.2em] uppercase text-center mb-2"
        style={{
          fontFamily: 'var(--font-retail-sans), sans-serif',
          color: 'var(--retail-text-muted)',
        }}
      >
        Tamaños elegidos
      </p>
      <div className="space-y-2">
        {boxes.map((box, i) => {
          const isEditing = editingIndex === i;
          return (
            <button
              key={i}
              onClick={() => onEdit(i)}
              className="w-full rounded-xl px-4 py-3 flex items-center gap-3 active:scale-[0.97]"
              style={{
                background: isEditing ? 'var(--retail-primary)' : 'var(--retail-surface)',
                color: isEditing ? '#fff' : 'var(--retail-text)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 200ms ease',
                textAlign: 'left' as const,
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(12px)',
                transitionDelay: `${i * 80}ms`,
              }}
            >
              {/* Ordinal */}
              <span
                className="text-xs font-medium"
                style={{
                  fontFamily: 'var(--font-retail-mono), monospace',
                  opacity: 0.5,
                  minWidth: '20px',
                }}
              >
                {i + 1}.
              </span>
              {/* Dimensions */}
              <span
                className="flex-1 text-sm tabular-nums"
                style={{ fontFamily: 'var(--font-retail-mono), monospace' }}
              >
                {box.largo}x{box.ancho}x{box.alto}
              </span>
              {/* Quantity */}
              <span
                className="text-xs"
                style={{
                  fontFamily: 'var(--font-retail-sans), sans-serif',
                  opacity: 0.6,
                }}
              >
                x{box.cantidad}
              </span>
              {/* Edit icon */}
              <span
                className="text-xs"
                style={{ opacity: 0.4 }}
              >
                ✎
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
