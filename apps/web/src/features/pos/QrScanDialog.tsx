import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Reads the QR on a tag with the device camera (phones, tablets, laptops). Uses the browser's built-in detector when there is one,
 * otherwise jsQR — both work offline. Needs HTTPS (or localhost) and camera permission.
 */
export function QrScanDialog({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null), cb = useRef(onResult), close = useRef(onClose), [err, setErr] = useState('');
  cb.current = onResult; close.current = onClose;

  useEffect(() => {
    let stream: MediaStream | undefined, timer = 0, stopped = false;
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const native = (window as any).BarcodeDetector ? new (window as any).BarcodeDetector({ formats: ['qr_code'] }) : null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    window.addEventListener('keydown', onKey);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const v = video.current!; v.srcObject = stream; await v.play();
        const tick = async () => {
          if (stopped) return;
          if (v.readyState >= 2 && v.videoWidth) {
            let text: string | undefined;
            if (native) { try { text = (await native.detect(v))[0]?.rawValue; } catch { /* fall back to jsQR */ } }
            if (!text) {
              canvas.width = v.videoWidth; canvas.height = v.videoHeight; ctx.drawImage(v, 0, 0);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              text = jsQR(img.data, img.width, img.height)?.data;
            }
            if (text) { stopped = true; cb.current(text); return; }
          }
          timer = window.setTimeout(tick, 120);
        };
        tick();
      } catch { setErr('The camera could not be opened. Allow camera access for this site, or type the SKU instead.'); }
    })();
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener('keydown', onKey); stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  return (
    <div className="fixed inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Scan a QR tag">
      <p className="text-center text-sm text-white">Hold the QR on the tag in front of the camera</p>
      {err ? <p className="max-w-sm text-center text-sm text-danger">{err}</p>
        : <video ref={video} playsInline muted className="max-h-[60vh] w-full max-w-md rounded-lg border border-gold object-cover" />}
      <Button onClick={onClose}>Close</Button>
    </div>
  );
}
