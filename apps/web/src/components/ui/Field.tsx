
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-danger">{error}</span> : hint ? <span className="mt-1 block text-sm text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputCls = 'w-full rounded border border-line bg-paper px-3 py-2 text-sm placeholder:text-muted focus:border-gold';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input(p, ref) {
    return <input {...p} ref={ref} className={`${inputCls} ${p.className ?? ''}`} />;
  }
);

Input.displayName = 'Input';
