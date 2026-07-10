import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import {
  BarcodeFormat,
  DecodeHintType,
  type Result,
} from '@zxing/library';
import { Camera, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface BarcodeScannerProps {
  onCode: (code: string) => void;
}

const HINTS = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.ITF,
    ],
  ],
  [DecodeHintType.TRY_HARDER, true],
]);

/**
 * Barcode scanner using ZXing. Opens the rear camera, decodes EAN/UPC,
 * fires onCode once. Provides a manual-entry fallback for damaged or
 * unreadable barcodes.
 *
 * iOS Safari quirk: requires HTTPS and a user gesture for getUserMedia.
 * In dev we run http://localhost which is treated as a "secure context".
 */
export function BarcodeScanner({ onCode }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'denied' | 'error'>(
    'starting',
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    let cancelled = false;
    // ZXing fires the decode callback once per frame. Without this guard
    // it can fire onCode dozens of times for a single barcode (especially
    // before `controls` is assigned, so `controls.stop()` no-ops) - which
    // hammered the Open Food Facts rate limit and made lookups fail.
    let fired = false;
    let controls: IScannerControls | null = null;
    const reader = new BrowserMultiFormatReader(HINTS);

    // Confidence gate: a single frame can mis-decode a 1D barcode into a
    // different, still-checksum-valid number (a transposed digit on EAN-13
    // passes the check digit ~10% of the time). That wrong code looks up as
    // "not found", which is the "it says the item doesn't exist, but works
    // if I try again" bug. Requiring the SAME code on two consecutive frames
    // before accepting filters out one-off misreads with no real delay.
    const REQUIRED_AGREEING = 2;
    let lastCode: string | null = null;
    let agreeCount = 0;

    void (async () => {
      try {
        if (!videoRef.current) return;
        controls = await reader.decodeFromVideoDevice(
          undefined, // pick default rear camera
          videoRef.current,
          (result: Result | undefined) => {
            if (!result || cancelled || fired) return;
            const code = result.getText();
            if (!code) return;
            // Count consecutive identical reads; reset on any disagreement.
            if (code === lastCode) {
              agreeCount += 1;
            } else {
              lastCode = code;
              agreeCount = 1;
            }
            if (agreeCount >= REQUIRED_AGREEING) {
              fired = true;
              controls?.stop();
              onCode(code);
            }
          },
        );
        if (!cancelled) setStatus('scanning');
      } catch (err) {
        if (cancelled) return;
        const e = err as DOMException | Error;
        if ('name' in e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
          setStatus('denied');
        } else {
          setStatus('error');
          setErrorMsg(e.message || 'Camera unavailable');
        }
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onCode]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    onCode(code);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="relative aspect-[4/3] w-full bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
        />
        {status === 'scanning' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-1/2 w-3/4 rounded-md border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
        {status !== 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white">
            <Camera className="h-8 w-8 opacity-80" />
            {status === 'starting' && <span>Starting camera…</span>}
            {status === 'denied' && (
              <span>
                Camera permission denied.
                <br />
                Allow camera access in your browser settings, or enter the
                barcode manually below.
              </span>
            )}
            {status === 'error' && (
              <span>
                Camera unavailable: {errorMsg}
                <br />
                Enter the barcode manually below.
              </span>
            )}
          </div>
        )}
      </div>
      <form onSubmit={handleManualSubmit} className="space-y-2 p-4">
        <p className="text-xs text-muted-foreground">
          Damaged barcode? Type the digits underneath:
        </p>
        <div className="flex gap-2">
          <Input
            inputMode="numeric"
            placeholder="e.g. 5012345678901"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="primary" disabled={!manualCode.trim()}>
            <RotateCcw className="h-4 w-4" />
            Look up
          </Button>
        </div>
      </form>
    </div>
  );
}
