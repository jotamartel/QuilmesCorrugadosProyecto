'use client';

interface AddMorePromptProps {
  largo: number;
  ancho: number;
  alto: number;
  cantidad: number;
  onAddMore: () => void;
  onFinish: () => void;
  visible: boolean;
}

export default function AddMorePrompt({
  largo,
  ancho,
  alto,
  cantidad,
  onAddMore,
  onFinish,
  visible,
}: AddMorePromptProps) {
  return (
    <div
      className="flex flex-col items-center gap-4 w-full px-6"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.9)',
        transition: 'all 400ms cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-6 text-center"
        style={{
          background: 'var(--retail-surface)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        }}
      >
        {/* Summary */}
        <div
          className="text-lg font-semibold tabular-nums mb-1"
          style={{
            fontFamily: 'var(--font-retail-mono), monospace',
            color: 'var(--retail-text)',
          }}
        >
          {largo} x {ancho} x {alto} mm
        </div>
        <div
          className="text-sm mb-5"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            color: 'var(--retail-text-muted)',
          }}
        >
          x {cantidad} unidades
        </div>

        {/* Question */}
        <p
          className="text-base font-medium mb-5"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            color: 'var(--retail-text)',
          }}
        >
          Agregar otro tamaño?
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onAddMore}
            className="flex-1 rounded-xl py-3 text-sm font-semibold active:scale-95"
            style={{
              fontFamily: 'var(--font-retail-sans), sans-serif',
              background: 'var(--retail-bg)',
              color: 'var(--retail-text)',
              border: '2px solid var(--retail-text)',
              transition: 'transform 150ms',
            }}
          >
            SI
          </button>
          <button
            onClick={onFinish}
            className="flex-1 rounded-xl py-3 text-sm font-semibold active:scale-95"
            style={{
              fontFamily: 'var(--font-retail-sans), sans-serif',
              background: 'var(--retail-primary)',
              color: '#fff',
              border: 'none',
              transition: 'transform 150ms',
            }}
          >
            VER COTIZACION
          </button>
        </div>
      </div>
    </div>
  );
}
