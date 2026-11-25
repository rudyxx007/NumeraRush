import { create } from 'zustand';
import type { InkVariant } from '../lib/ink-field';

export type PulseKind = 'merge' | 'solve';

export interface FxChoice {
  id: InkVariant;
  label: string;
  note: string;
}

export const FX_VARIANTS: readonly FxChoice[] = [
  { id: 'ribbons', label: 'Ink ribbons', note: 'domain-warped silk contours' },
  { id: 'surge', label: 'Game pulse', note: 'bursts on a merge or a solve' },
  { id: 'equations', label: 'Equation rain', note: 'digits and operators drifting in depth' },
  { id: 'merge', label: 'Merge cascade', note: 'two cards collapsing into one, over and over' },
  { id: 'target', label: 'Target rings', note: 'a radar sweep that tracks your cursor' },
  { id: 'chrome', label: 'Liquid chrome', note: 'specular metallic pools' },
  { id: 'aurora', label: 'Graph aurora', note: 'light curtains over an exact grid' },
];

const STORAGE_KEY = 'numera-rush:fx';

function readVariant(): InkVariant {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const match = FX_VARIANTS.find((choice) => choice.id === stored);
    if (match) return match.id;
  } catch {
    // Storage can be unavailable; fall through to the default scene.
  }
  return 'ribbons';
}

interface FxStore {
  variant: InkVariant;
  gpuSupported: boolean;
  pulse: { kind: PulseKind; at: number } | null;
  setVariant: (variant: InkVariant) => void;
  cycleVariant: () => void;
  setGpuSupported: (supported: boolean) => void;
  triggerPulse: (kind: PulseKind) => void;
}

export const useFxStore = create<FxStore>((set, get) => ({
  variant: readVariant(),
  gpuSupported: false,
  pulse: null,

  setVariant: (variant) => {
    try {
      localStorage.setItem(STORAGE_KEY, variant);
    } catch {
      // Persistence is optional; the scene still changes for this session.
    }
    set({ variant });
  },

  cycleVariant: () => {
    const { variant, setVariant } = get();
    const index = FX_VARIANTS.findIndex((choice) => choice.id === variant);
    const next = FX_VARIANTS[(index + 1) % FX_VARIANTS.length] ?? FX_VARIANTS[0];
    if (next) setVariant(next.id);
  },

  setGpuSupported: (gpuSupported) => set({ gpuSupported }),

  triggerPulse: (kind) => set({ pulse: { kind, at: performance.now() } }),
}));
