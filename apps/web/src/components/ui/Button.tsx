import type { ButtonHTMLAttributes } from 'react';

const styles = {
  primary: 'bg-gold text-[#17130a] hover:brightness-95 font-semibold',
  quiet: 'border border-line bg-paper hover:border-gold',
  ghost: 'hover:bg-gold-wash',
  danger: 'bg-danger text-white hover:brightness-95 font-semibold',
} as const;

export function Button({ variant = 'quiet', className = '', busy, children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof styles; busy?: boolean }) {
  return (
    <button {...p} disabled={p.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}>
      {busy ? 'Please wait…' : children}
    </button>
  );
}
