import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Images, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

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
}: CaptureOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<CamStatus>('starting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
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

  const handleShutter = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setBusy(true);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setBusy(false);
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        setBusy(false);
        if (blob) finish(blob);
      },
      'image/jpeg',
      0.95,
    );
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (file) finish(file);
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
        <span className="text-sm font-medium">{title}</span>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close camera"
          className="tap-target rounded-md p-2 text-white/80 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
        />
        {status === 'live' && guide !== 'none' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={cn(
                'rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]',
                guide === 'portrait' ? 'h-3/5 w-4/5' : 'h-2/5 w-[88%]',
              )}
            />
          </div>
        )}
        {status !== 'live' && (
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
      </div>
    </div>,
    document.body,
  );
}
