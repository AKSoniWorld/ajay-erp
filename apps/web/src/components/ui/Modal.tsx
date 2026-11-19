import { useEffect } from 'react';

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-lg border border-line bg-paper p-6">
        <div className="flex items-center justify-between"><h2 className="font-display text-xl">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-gold-wash">✕</button></div>
        {children}
      </div>
    </div>);
}
