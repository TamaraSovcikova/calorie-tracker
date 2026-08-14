import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  Check,
  Images,
  Loader2,
  RotateCcw,
  X,
  Zap,
  ZapOff,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { downscaleImage } from '@/features/photo-log/photoLog';

interface CaptureOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Fired with the chosen image - a live capture or a gallery pick. */
  onCapture: (image: Blob) => void;
  title?: string;
  hint?: string;
  /**
   * Framing guide shape. Nutrition tables are taller than wide; a plate of
   * food or a recipe page is not. 'none' leaves the frame clear.
   */
  guide?: 'portrait' | 'landscape' | 'none';
  /**
   * Longest edge of the delivered image. The overlay does the resizing so a
   * camera shot is encoded ONCE - it used to be written at 0.95, then
   * decoded and re-encoded at 0.82 by the caller, compounding two rounds of
   * JPEG artefacts on exactly the small print the AI has to read.
   */
  maxDim?: number;
}

type CamStatus = 'starting' | 'live' | 'denied' | 'error';

/**
 * THE way an image gets into this app. Nutrition labels, meal photos, recipe
 * pages and a meal's own picture all come through here.
 *
 * There used to be four mechanisms: this overlay, a bare `<input capture>`
 * that hands off to the OS camera app, a bare `<input>` that only opens the
 * gallery, and a pair of the two. So "take a photo" behaved differently
 * depending on which screen you were on, the meal photo had no gallery at all
 * on some Android builds, and the recipe scan could not use the camera.
 *
 * The live path owns the stream (getUserMedia + a canvas grab) rather than
 * delegating, because `<input capture>` silently falls back to the gallery
 * picker on some Android builds - the "I can only upload, never shoot"
 * problem. Owning it means the camera always opens, Gallery is always beside
 * the shutter, and the framing guide can suit what is being photographed.
 *
 * Portalled to <body>: most call sites live inside a Sheet, whose slide-up
 * transform would otherwise become the containing block for `position: fixed`
 * and pin this to the sheet rather than the viewport.
 */
export function CaptureOverlay({
  open,
  onClose,
  onCapture,
  title = 'Scan a nutrition label',
  hint = 'Fill the frame with the nutrition table, then tap the shutter.',
  guide = 'portrait',
  maxDim = 1600,
}: CaptureOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<CamStatus>('starting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * The shot, held for confirmation. Sending straight to the AI meant a
   * blurry or badly-framed photo cost a full round trip - up to 60 seconds -
   * before you found out. Every camera app shows you the frame first.
   */
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus('starting');
    setErrorMsg(null);
    setBusy(false);

    void (async () => {
      try {
        // Resolution MUST be asked for. Without width/height the browser
        // hands back its default, which is typically 640x480 - so every
        // shot was 640px wide and the 1600px downscale ceiling on label
        // scans did nothing at all, because the source was already smaller.
        // A nutrition table at 640px is why OCR was dropping digits.
        // `ideal` degrades gracefully on cameras that cannot manage it.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 2560 },
            height: { ideal: 1440 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        // Torch is a real help for a nutrition label read in a dim shop
        // aisle. Not every camera exposes it, and TypeScript does not know
        // the field, so both are probed rather than assumed.
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as
          | { torch?: boolean; focusMode?: string[] }
          | undefined;
        setTorchAvailable(!!caps?.torch);
        // Continuous autofocus where it exists: a nutrition table held close
        // is exactly the case a fixed focus gets wrong.
        if (caps?.focusMode?.includes('continuous')) {
          await track
            .applyConstraints({
              advanced: [{ focusMode: 'continuous' }],
            } as unknown as MediaTrackConstraints)
            .catch(() => undefined);
        }
        setStatus('live');
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
      stopStream();
    };
  }, [open, stopStream]);

  const finish = (image: Blob) => {
    stopStream();
    onCapture(image);
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      // `torch` is real but absent from the DOM typings, so it has to go
      // through unknown rather than a direct assertion.
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false); // it lied about supporting it
    }
  };

  const handleShutter = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setBusy(true);
    // Scale during the draw, so the frame is resized and encoded in one
    // step instead of full-size-encode then decode-resize-re-encode.
    const scale = Math.min(
      1,
      maxDim / Math.max(video.videoWidth, video.videoHeight),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setBusy(false);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        setBusy(false);
        // Held for confirmation rather than sent.
        if (blob) setShot({ blob, url: URL.createObjectURL(blob) });
      },
      'image/jpeg',
      0.88,
    );
  };

  /**
   * Tap the preview to focus there. Support is patchy, so a device that
   * cannot do it simply does nothing rather than showing a broken control.
   */
  const focusAt = async (e: React.PointerEvent<HTMLVideoElement>) => {
    const track = streamRef.current?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as
      | { focusMode?: string[]; pointsOfInterest?: unknown }
      | undefined;
    if (!track || !caps?.pointsOfInterest) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    await track
      .applyConstraints({
        advanced: [
          {
            pointsOfInterest: [{ x, y }],
            ...(caps.focusMode?.includes('single-shot')
              ? { focusMode: 'single-shot' }
              : {}),
          },
        ],
      } as unknown as MediaTrackConstraints)
      .catch(() => undefined);
  };

  const discardShot = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
  };

  const useShot = () => {
    if (!shot) return;
    const { blob, url } = shot;
    URL.revokeObjectURL(url);
    setShot(null);
    finish(blob);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    // Sized here too, so both paths hand the caller the same thing and a
    // 12 MP gallery photo is not shipped whole. No confirmation step: the
    // gallery picker already showed the user the image.
    finish(await downscaleImage(file, maxDim));
  };

  const handleClose = useCallback(() => {
    stopStream();
    onClose();
  }, [onClose, stopStream]);

  // Escape closes the camera, not the sheet underneath it. Captured on the
  // way down so the Sheet's own window-level handler never sees the key.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      handleClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, handleClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)] text-white">
        <span className="text-sm font-medium">{shot ? 'Use this shot?' : title}</span>
        <div className="flex items-center gap-1">
          {torchAvailable && !shot && (
            <button
              type="button"
              onClick={() => void toggleTorch()}
              aria-label={torchOn ? 'Turn off the light' : 'Turn on the light'}
              aria-pressed={torchOn}
              className={cn(
                'tap-target rounded-md p-2',
                torchOn ? 'text-amber-300' : 'text-white/80 hover:text-white',
              )}
            >
              {torchOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close camera"
            className="tap-target rounded-md p-2 text-white/80 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          onPointerDown={(e) => void focusAt(e)}
        />
        {shot && (
          // `contain`, not `cover`: the point of this step is checking the
          // whole frame is sharp and nothing is cropped off.
          <img
            src={shot.url}
            alt="The photo you just took"
            className="absolute inset-0 h-full w-full bg-black object-contain"
          />
        )}
        {!shot && status === 'live' && guide !== 'none' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={cn(
                'rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]',
                guide === 'portrait' ? 'h-3/5 w-4/5' : 'h-2/5 w-[88%]',
              )}
            />
          </div>
        )}
        {!shot && status !== 'live' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center text-sm text-white">
            <Camera className="h-8 w-8 opacity-80" />
            {status === 'starting' && <span>Starting camera…</span>}
            {status === 'denied' && (
              <span>
                Camera permission denied.
                <br />
                Allow camera access in your browser settings, or pick a photo
                from your gallery instead.
              </span>
            )}
            {status === 'error' && (
              <span>
                Camera unavailable: {errorMsg}
                <br />
                Pick a photo from your gallery instead.
              </span>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 px-6 pb-[max(env(safe-area-inset-bottom),20px)] pt-4">
        {shot ? (
          <>
            <p className="text-center text-[11px] text-white/60">
              Check it is sharp and nothing is cut off.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" block onClick={discardShot}>
                <RotateCcw className="h-4 w-4" />
                Retake
              </Button>
              <Button type="button" variant="primary" block onClick={useShot}>
                <Check className="h-4 w-4" />
                Use photo
              </Button>
            </div>
          </>
        ) : (
          <>
        {status === 'live' && (
          <p className="text-center text-[11px] text-white/60">{hint}</p>
        )}
        <div className="flex items-center justify-center gap-8">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          {/* Gallery: no `capture` attribute, so this is the photo library. */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-20 flex-col items-center gap-1 text-[11px] font-medium text-white/80 hover:text-white"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/10">
              <Images className="h-5 w-5" />
            </span>
            Gallery
          </button>

          <button
            type="button"
            onClick={handleShutter}
            disabled={status !== 'live' || busy}
            aria-label="Take photo"
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-white bg-white/20 transition-transform active:scale-95 disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-7 w-7 animate-spin text-white" />
            ) : (
              <span className="h-[56px] w-[56px] rounded-full bg-white" />
            )}
          </button>

          {/* Spacer keeps the shutter centred against the Gallery button. */}
          <span className="w-20" aria-hidden="true" />
        </div>
        {status !== 'live' && (
          <Button type="button" variant="secondary" block onClick={() => fileRef.current?.click()}>
            <Images className="h-4 w-4" />
            Choose from gallery
          </Button>
        )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
