import { useOnline } from '@/lib/hooks';

/** Shows whether bills go straight to the server or are kept on this device. */
export function OnlinePill() {
  const on = useOnline();
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${on ? 'border-line text-muted' : 'border-warn text-warn'}`}
      title={on ? 'Connected to the server' : 'No internet — bills are kept on this device and sent later'}>
      <span className={`h-2 w-2 rounded-full ${on ? 'bg-ok' : 'bg-warn'}`} />{on ? 'Online' : 'Offline'}
    </span>
  );
}

export const KeyHint = ({ k }: { k: string }) => (
  <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[11px] text-muted">{k}</kbd>
);
