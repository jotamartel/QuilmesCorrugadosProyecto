'use client';

interface ConfirmButtonProps {
  label: string;
  onClick: () => void;
  visible: boolean;
  variant?: 'primary' | 'secondary';
}

export default function ConfirmButton({ label, onClick, visible, variant = 'primary' }: ConfirmButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <button
      onClick={onClick}
      className="w-full max-w-xs mx-auto block rounded-2xl text-base font-semibold tracking-wide active:scale-95"
      style={{
        fontFamily: 'var(--font-retail-sans), sans-serif',
        padding: '16px 32px',
        background: isPrimary ? 'var(--retail-primary)' : 'transparent',
        color: isPrimary ? '#fff' : 'var(--retail-text)',
        border: isPrimary ? 'none' : '2px solid var(--retail-text)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 400ms cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {label}
    </button>
  );
}
