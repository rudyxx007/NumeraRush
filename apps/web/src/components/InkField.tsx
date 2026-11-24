import { useInkField } from '../hooks/useInkField';
import type { InkVariant } from '../lib/ink-field';

/**
 * Full-viewport WebGPU scene. Purely ambient: it sits behind every panel,
 * never captures pointer input, and freezes under reduced motion.
 */
export function InkField({
  intensity = 0.35,
  variant = 'equations',
}: {
  intensity?: number;
  variant?: InkVariant;
}) {
  const canvasRef = useInkField(intensity, variant);

  return <canvas ref={canvasRef} className="ink-field" />;
}
