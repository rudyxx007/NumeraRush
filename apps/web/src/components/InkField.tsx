import { useInkField } from '../hooks/useInkField';

/**
 * Full-viewport WebGPU contour field. Purely ambient: it sits behind every
 * panel, never captures pointer input, and freezes under reduced motion.
 */
export function InkField({ intensity = 0.35 }: { intensity?: number }) {
  const canvasRef = useInkField(intensity);

  return <canvas ref={canvasRef} className="ink-field" />;
}
