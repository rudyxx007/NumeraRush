import { useEffect, useRef } from 'react';
import { type InkField, type InkVariant, createInkField } from '../lib/ink-field';
import { useFxStore } from '../store/fx-store';
import type { PulseKind } from '../store/fx-store';

/** Phones keep the scene, but at a lower density so copy stays comfortable. */
function scaledIntensity(value: number): number {
  return window.innerWidth < 640 ? value * 0.58 : value;
}

/**
 * Mounts the WebGPU scene on a canvas. When WebGPU is missing the canvas stays
 * transparent and the CSS colour wash carries the page.
 */
export function useInkField(
  intensity: number,
  variant: InkVariant,
): React.RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<InkField | null>(null);
  const pendingPulseRef = useRef<PulseKind | null>(null);
  const intensityRef = useRef(intensity);
  const variantRef = useRef(variant);
  intensityRef.current = intensity;
  variantRef.current = variant;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    // Defer one task so StrictMode's mount/unmount pair never starts two GPU
    // devices against the same canvas.
    const startTimer = window.setTimeout(() => {
      if (cancelled) return;
      void createInkField(canvas).then((field) => {
        if (!field) return;
        if (cancelled) {
          // Fast HMR can unmount before the async device exists; the stale
          // device must be torn down or it keeps drawing into a canvas that a
          // newer device has already configured.
          field.destroy();
          return;
        }
        field.setIntensity(scaledIntensity(intensityRef.current));
        field.setVariant(variantRef.current);
        if (pendingPulseRef.current) {
          field.pulse(pendingPulseRef.current);
          pendingPulseRef.current = null;
        }
        fieldRef.current = field;
        useFxStore.getState().setGpuSupported(true);
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      fieldRef.current?.destroy();
      fieldRef.current = null;
      useFxStore.getState().setGpuSupported(false);
    };
  }, []);

  useEffect(() => {
    fieldRef.current?.setIntensity(scaledIntensity(intensity));
  }, [intensity]);

  useEffect(() => {
    const onResize = (): void => {
      fieldRef.current?.setIntensity(scaledIntensity(intensityRef.current));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    fieldRef.current?.setVariant(variant);
  }, [variant]);

  const pulse = useFxStore((state) => state.pulse);
  useEffect(() => {
    if (!pulse) return;
    if (fieldRef.current) {
      fieldRef.current.pulse(pulse.kind);
    } else {
      pendingPulseRef.current = pulse.kind;
    }
  }, [pulse]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      fieldRef.current?.setPointer(
        event.clientX / window.innerWidth,
        event.clientY / window.innerHeight,
      );
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, []);

  return canvasRef;
}
