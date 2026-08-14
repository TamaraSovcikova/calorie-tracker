import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import {
  BarcodeFormat,
  DecodeHintType,
  type Result,
} from '@zxing/library';
import {
  Camera,
  Images,
  Keyboard,
  Loader2,
  ScanText,
  Search,
  Zap,
  ZapOff,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface BarcodeScannerProps {
  onCode: (code: string) => void;
  /** Optional: offer a "scan a nutrition label instead" shortcut (used from
   *  the Add-food Scan tab, where a label leads into the new-product form). */
  onScanLabel?: () => void;
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
export function BarcodeScanner({ onCode, onScanLabel }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  const toggleTorch = async () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks?.()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  };

  const [status, setStatus] = useState<'starting' | 'scanning' | 'denied' | 'error'>(
    'starting',
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        // ZXing acquires its own stream, but attaches it to our element -
        // so torch is reachable without taking the stream over. Worth it:
        // a barcode read in a dim shop aisle is the common case.
        // Resolution is deliberately left to ZXing. 640x480 is ample for a
        // close-up EAN-13, and pushing it higher slows continuous decoding,
        // so this is NOT the same problem the label scanner had.
        const stream = videoRef.current?.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks?.()[0];
        const caps = track?.getCapabilities?.() as
          | { torch?: boolean }
          | undefined;
        if (!cancelled) setTorchAvailable(!!caps?.torch);
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

  // Decode a barcode from a still image the user picked (a photo already in
  // their library, or a fresh snap via the OS picker). Reuses the same reader
  // hints as the live scanner and funnels into the same onCode pipeline.
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setImportError(null);
    setImporting(true);
    const url = URL.createObjectURL(file);
    try {
      const reader = new BrowserMultiFormatReader(HINTS);
      const result = await reader.decodeFromImageUrl(url);
      const code = result.getText();
      if (code) {
        onCode(code);
        return;
      }
      setImportError(
        'No barcode found in that photo. Try another, or type the digits in.',
      );
    } catch {
      setImportError(
        'No barcode found in that photo. Try another, or type the digits in.',
      );
    } finally {
      URL.revokeObjectURL(url);
      setImporting(false);
    }
  };

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
        {torchAvailable && status === 'scanning' && (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            aria-label={torchOn ? 'Turn off the light' : 'Turn on the light'}
            aria-pressed={torchOn}
            className={`tap-target absolute right-1 top-1 rounded-md p-2 ${
              torchOn ? 'text-amber-300' : 'text-white/80'
            }`}
          >
            {torchOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
          </button>
        )}
        {status !== 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white">
            <Camera className="h-8 w-8 opacity-80" />
            {status === 'starting' && <span>Starting camera…</span>}
            {status === 'denied' && (
              <span>
                Camera permission denied.
                <br />
                Allow camera access in your browser settings, or use one of
                the options below.
              </span>
            )}
            {status === 'error' && (
              <span>
                Camera unavailable: {errorMsg}
                <br />
                Use one of the options below.
              </span>
            )}
          </div>
        )}
      </div>
      {/*
        One row of equal-weight alternatives, mirroring the Gallery-and-
        shutter row in CaptureOverlay. This used to be three stacked blocks -
        a full-width import button with a two-line explainer, a floating
        "no barcode?" link, and an always-open manual form - with no
        hierarchy, so it was never clear which to reach for.
      */}
      <div className="border-t border-border p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleImportFile(e)}
        />
        <p className="mb-3 text-center text-[11px] text-muted-foreground">
          {importing ? 'Reading barcode…' : "Won't scan?"}
        </p>
        <div className="flex items-start justify-center gap-2">
          <FallbackAction
            icon={importing ? Loader2 : Images}
            label="From a photo"
            spinning={importing}
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          />
          <FallbackAction
            icon={Keyboard}
            label="Type it in"
            active={manualOpen}
            onClick={() => setManualOpen((v) => !v)}
          />
          {onScanLabel && (
            <FallbackAction
              icon={ScanText}
              label="Use the label"
              onClick={onScanLabel}
            />
          )}
        </div>
        {importError && (
          <p className="mt-3 text-center text-xs text-destructive">{importError}</p>
        )}

        {manualOpen && (
          <form onSubmit={handleManualSubmit} className="mt-3 space-y-2">
            <Input
              inputMode="numeric"
              autoFocus
              placeholder="e.g. 5012345678901"
              aria-label="Barcode digits"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
            />
            <Button type="submit" variant="primary" block disabled={!manualCode.trim()}>
              <Search className="h-4 w-4" />
              Look it up
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

/** One of the three ways out when the live scan will not work. */
function FallbackAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  spinning,
  active,
}: {
  icon: typeof Images;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  spinning?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tap-target flex w-24 flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-[11px] font-medium hover:bg-muted/50 disabled:opacity-50"
      style={{ color: active ? 'var(--color-accent-deep)' : 'var(--color-text-muted)' }}
    >
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full border"
        style={{
          borderColor: active ? 'var(--color-accent-deep)' : 'var(--color-border)',
        }}
      >
        <Icon className={`h-[18px] w-[18px] ${spinning ? 'animate-spin' : ''}`} />
      </span>
      {label}
    </button>
  );
}
