/**
 * WebGPU ambient layer. One fullscreen WGSL pass renders six switchable
 * scenes: equation rain, a card-merge cascade, target rings, ink ribbons,
 * liquid chrome, and a graph aurora. Returns `null` when WebGPU is unavailable
 * so the CSS wash can carry the page instead.
 */

export type InkVariant = 'equations' | 'merge' | 'target' | 'ribbons' | 'chrome' | 'aurora';

export const INK_VARIANT_INDEX: Record<InkVariant, number> = {
  ribbons: 0,
  chrome: 1,
  aurora: 2,
  target: 3,
  merge: 4,
  equations: 5,
};

const GLYPHS = '0123456789+−×÷=/';
const ATLAS_COLS = 16;
const ATLAS_CELL_W = 64;
const ATLAS_CELL_H = 96;
const ATLAS_W = ATLAS_COLS * ATLAS_CELL_W;
const ATLAS_H = ATLAS_CELL_H;

const SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec2f,
  time: f32,
  intensity: f32,
  pointer: vec2f,
  mode: f32,
  aspect: f32,
};

@group(0) @binding(0) var<uniform> uni: Uniforms;
@group(0) @binding(1) var atlasTex: texture_2d<f32>;
@group(0) @binding(2) var atlasSampler: sampler;

const COBALT = vec3f(0.10, 0.19, 0.82);
const SAFFRON = vec3f(0.91, 0.63, 0.07);
const PINE = vec3f(0.05, 0.42, 0.28);
const RUST = vec3f(0.72, 0.18, 0.10);
const PAPER = vec3f(0.94, 0.95, 0.91);

@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  return vec4f(positions[index], 0.0, 1.0);
}

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(127.1, 311.7));
  q += dot(q, q + 34.23);
  return fract(q.x * q.y);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn fbm(p: vec2f) -> f32 {
  var total = 0.0;
  var amplitude = 0.5;
  var q = p;
  for (var i = 0; i < 5; i = i + 1) {
    total += amplitude * vnoise(q);
    q = q * 2.03 + vec2f(17.3, 9.1);
    amplitude *= 0.5;
  }
  return total;
}

fn band(value: f32, width: f32) -> f32 {
  let edge = abs(fract(value) - 0.5) * 2.0;
  return 1.0 - smoothstep(0.0, width, edge);
}

fn segment(p: vec2f, a: vec2f, b: vec2f, width: f32) -> f32 {
  let ab = b - a;
  let h = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
  return 1.0 - smoothstep(0.0, width, length(p - a - ab * h));
}

/* ---------------------------------------------------------------- */
/* Equation rain: monospaced digits and operators drifting in depth.  */
/* ---------------------------------------------------------------- */
fn mode_equations(p: vec2f, t: f32, ptr: vec2f, ar: f32) -> vec4f {
  var color = vec3f(0.0);
  var alpha = 0.0;

  for (var layer = 0; layer < 3; layer = layer + 1) {
    let depth = f32(layer);
    let cols = 14.0 + depth * 12.0;
    let cw = ar / cols;
    let ch = cw * 1.4;
    let gx = (p.x + ar * 0.5) / cw;
    let gy = (p.y + 0.5) / ch + t * (0.095 + depth * 0.045);

    let col = floor(gx);
    let row = floor(gy);
    let fx = fract(gx);
    let fy = fract(gy);

    let d = p - ptr;
    let lens = exp(-dot(d, d) * 9.0);
    let fx2 = fract(fx + d.x * lens * 0.9);

    let seed = hash21(vec2f(col * 0.71 + depth * 3.0, row * 1.37));
    let cell = floor(seed * 15.0);
    let glyph = textureSample(
      atlasTex,
      atlasSampler,
      vec2f((cell + fx2) / 16.0, fy),
    ).a;

    let tint = mix(COBALT, SAFFRON, hash21(vec2f(col, row + depth)));
    let tint2 = mix(tint, PINE, step(0.72, seed));
    let verticalFade =
      smoothstep(0.0, 0.12, fy) * (1.0 - smoothstep(0.86, 1.0, fy));
    let sceneFade = 1.0 - smoothstep(0.55, 1.4, abs(p.y + 0.05));

    color += tint2 * glyph * verticalFade;
    alpha += glyph * verticalFade * sceneFade * (0.22 - depth * 0.05);
  }

  return vec4f(color, clamp(alpha, 0.0, 0.62));
}

/* ---------------------------------------------------------------- */
/* Merge cascade: pairs of cards collapse into one, again and again.  */
/* ---------------------------------------------------------------- */
fn mode_merge(p: vec2f, t: f32, ptr: vec2f) -> vec4f {
  let grid = vec2f(8.0, 5.0);
  let cell = floor(p * grid);
  let f = fract(p * grid);
  let seed = hash21(cell);
  let jitter = vec2f(hash21(cell + 1.7), hash21(cell + 9.3)) * 0.5 + 0.25;
  let cycle = fract(t * 0.11 + seed);

  let sep = abs(cycle - 0.5) * 0.46;
  let left = jitter + vec2f(-sep, 0.0);
  let right = jitter + vec2f(sep, 0.0);

  let base = 1.0 - smoothstep(0.0, 0.04, length(f - jitter));
  let a = 1.0 - smoothstep(0.0, 0.055, length(f - left));
  let b = 1.0 - smoothstep(0.0, 0.055, length(f - right));
  let merged =
    (1.0 - smoothstep(0.0, 0.07, length(f - jitter))) *
    smoothstep(0.3, 0.48, cycle) *
    (1.0 - smoothstep(0.52, 0.85, cycle));

  var color = COBALT * (base * 0.5 + a) + SAFFRON * b + PINE * merged * 1.3;
  var alpha = base * 0.11 + (a + b) * 0.28 + merged * 0.52;

  let linkRight =
    segment(f, jitter, vec2f(1.0 + jitter.x * 0.15, jitter.y), 0.018) *
    step(hash21(cell + 4.4), 0.7);
  let linkDown =
    segment(f, jitter, vec2f(jitter.x, 1.0 + jitter.y * 0.15), 0.014) *
    step(hash21(cell + 8.1), 0.45);
  let pulse = pow(0.5 + 0.5 * sin((f.x + f.y) * 8.0 - t * 2.4 + seed * 6.0), 4.0);

  color += COBALT * (linkRight + linkDown) * (0.35 + pulse);
  alpha += (linkRight + linkDown) * (0.12 + pulse * 0.2);

  let lens = exp(-dot(p - ptr, p - ptr) * 7.0);
  alpha += lens * 0.05;

  return vec4f(color, clamp(alpha, 0.0, 0.65));
}

/* ---------------------------------------------------------------- */
/* Target rings: a radar sweep that settles where the cursor rests.   */
/* ---------------------------------------------------------------- */
fn mode_target(p: vec2f, t: f32, ptr: vec2f) -> vec4f {
  let drift = vec2f(sin(t * 0.21), cos(t * 0.17)) * 0.12;
  let center = ptr * 0.58 + drift;
  let d = length(p - center);

  let rings = band(d * 9.0 - t * 0.35, 0.06) * exp(-d * 1.9);
  let inner = band(d * 21.0 - t * 0.6, 0.035) * exp(-d * 4.2);
  let cross =
    (band(p.x * 26.0 + 0.5, 0.016) + band(p.y * 26.0 + 0.5, 0.016)) *
    exp(-d * 3.6);

  let ang = atan2(p.y - center.y, p.x - center.x);
  let sweep = pow(0.5 + 0.5 * sin(ang - t * 0.8), 18.0) * exp(-d * 1.2);

  var color = mix(PINE, SAFFRON, smoothstep(0.15, 0.6, d)) * (rings + inner);
  color += COBALT * cross * 0.55 + SAFFRON * sweep;

  let alpha = (rings + inner) * 0.32 + cross * 0.1 + sweep * 0.14;
  return vec4f(color, clamp(alpha, 0.0, 0.6));
}

/* ---------------------------------------------------------------- */
/* Ink ribbons                                                        */
/* ---------------------------------------------------------------- */
fn mode_ribbons(p: vec2f, t: f32, ptr: vec2f) -> vec4f {
  let d = p - ptr;
  let lens = exp(-dot(d, d) * 6.0);
  let q = p + d * lens * 0.35;

  let w1 = fbm(q * 1.7 + vec2f(t * 0.05, -t * 0.03));
  let w2 = fbm(q * 1.4 + vec2f(-t * 0.04, t * 0.06) + 5.2);
  let flow = q + vec2f(w1 - 0.5, w2 - 0.5) * 0.9;

  let b1 = band(flow.x * 5.2 + flow.y * 3.1 + t * 0.18, 0.14);
  let b2 = band(flow.y * 6.4 - flow.x * 2.2 - t * 0.13 + 0.35, 0.11);
  let b3 = band(length(flow - vec2f(0.35, -0.1)) * 7.0 - t * 0.2, 0.1);

  var color = COBALT * b1 * 0.9;
  color += SAFFRON * b2 * 0.7;
  color += PINE * b3 * 0.65;

  let grain = 0.85 + 0.3 * vnoise(p * 220.0);
  let alpha = clamp((b1 * 0.55 + b2 * 0.45 + b3 * 0.4) * 0.4, 0.0, 0.75);
  return vec4f(color * grain, alpha);
}

/* ---------------------------------------------------------------- */
/* Liquid chrome                                                      */
/* ---------------------------------------------------------------- */
fn mode_chrome(p: vec2f, t: f32, ptr: vec2f) -> vec4f {
  let d = p - ptr;
  let pull = exp(-dot(d, d) * 4.0);
  var q = p * 2.1 + d * pull * 0.5;
  q += vec2f(t * 0.035, -t * 0.02);

  let n = fbm(q) + 0.5 * fbm(q * 2.7 + 7.3);
  let ridge = sin(n * 11.0 + t * 0.6) * 0.5 + 0.5;
  let spec = pow(ridge, 9.0);

  var color = mix(COBALT * 0.55, SAFFRON * 1.05, ridge);
  color = mix(color, PAPER, spec * 0.8);

  let rim = 1.0 - smoothstep(0.0, 0.05, abs(n - 0.66));
  color += PAPER * rim * 0.45;

  let alpha = clamp(
    spec * 0.6 + smoothstep(0.55, 1.0, n) * 0.2 + rim * 0.14,
    0.0,
    0.75,
  );
  return vec4f(color, alpha);
}

/* ---------------------------------------------------------------- */
/* Graph aurora                                                       */
/* ---------------------------------------------------------------- */
fn mode_aurora(p: vec2f, t: f32, ptr: vec2f) -> vec4f {
  let sway = sin(p.y * 3.0 + t * 0.25) * 0.12 + sin(p.y * 7.0 - t * 0.18) * 0.05;
  let column = fbm(vec2f((p.x + sway) * 3.2, p.y * 0.8 - t * 0.06));
  let curtain = smoothstep(0.4, 0.9, column) * smoothstep(-0.5, 0.45, p.y);

  let d = p - ptr;
  let glow = exp(-dot(d, d) * 5.0) * 0.55;

  let hue = clamp(column * 1.4, 0.0, 1.0);
  var color = mix(PINE, COBALT, hue);
  color = mix(color, SAFFRON, smoothstep(0.7, 1.0, column) * 0.7);

  let grid =
    max(band(p.x * 18.0 + 0.5, 0.03), band(p.y * 18.0 + 0.5, 0.03)) * 0.05;
  color += color * glow;

  let alpha = clamp(curtain * 0.28 + glow * 0.18 + grid, 0.0, 0.8);
  return vec4f(color, alpha);
}

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let res = max(uni.resolution, vec2f(1.0, 1.0));
  let uv = position.xy / res;
  let ar = max(res.x / res.y, 0.001);
  let p = vec2f((uv.x - 0.5) * ar, uv.y - 0.5);
  let ptr = vec2f((uni.pointer.x - 0.5) * ar, uni.pointer.y - 0.5);
  let t = uni.time;

  let mode = i32(round(uni.mode));
  var sampled = mode_equations(p, t, ptr, ar);
  if (mode == 0) {
    sampled = mode_ribbons(p, t, ptr);
  } else if (mode == 1) {
    sampled = mode_chrome(p, t, ptr);
  } else if (mode == 2) {
    sampled = mode_aurora(p, t, ptr);
  } else if (mode == 3) {
    sampled = mode_target(p, t, ptr);
  } else if (mode == 4) {
    sampled = mode_merge(p, t, ptr);
  }

  let vignette = 1.0 - smoothstep(0.28, 0.98, length(p * vec2f(0.72, 1.0)));
  let edge = smoothstep(0.0, 0.1, uv.y) * (1.0 - smoothstep(0.9, 1.0, uv.y));
  let boost = 0.35 + 0.85 * uni.intensity;
  let alpha = clamp(
    sampled.a * boost * (0.55 + 0.45 * vignette) * edge,
    0.0,
    0.8,
  );
  return vec4f(sampled.rgb * alpha, alpha);
}
`;

const UNIFORM_BYTES = 32;

export interface InkField {
  setIntensity(value: number): void;
  setVariant(variant: InkVariant): void;
  setPointer(x: number, y: number): void;
  destroy(): void;
}

/**
 * Bakes digits and operators into one row so the shader can sample a glyph per
 * falling cell. Waits briefly for IBM Plex Mono, then falls back to any
 * monospace the machine has.
 */
async function createGlyphAtlas(): Promise<HTMLCanvasElement | null> {
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ]);
  } catch {
    // Font loading is best-effort; the fallback stack still renders digits.
  }

  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.clearRect(0, 0, ATLAS_W, ATLAS_H);
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `600 ${Math.round(ATLAS_CELL_H * 0.68)}px "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;

  for (let index = 0; index < GLYPHS.length; index += 1) {
    const glyph = GLYPHS[index];
    if (!glyph) continue;
    context.fillText(glyph, index * ATLAS_CELL_W + ATLAS_CELL_W / 2, ATLAS_CELL_H / 2);
  }

  return canvas;
}

export async function createInkField(canvas: HTMLCanvasElement): Promise<InkField | null> {
  if (!navigator.gpu) return null;

  let adapter: GPUAdapter | null = null;
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
  } catch {
    return null;
  }
  if (!adapter) return null;

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch {
    return null;
  }

  const context = canvas.getContext('webgpu');
  if (!context) {
    device.destroy();
    return null;
  }

  const atlasCanvas = await createGlyphAtlas();
  if (!atlasCanvas) {
    device.destroy();
    return null;
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  const uniforms = device.createBuffer({
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const data = new Float32Array(UNIFORM_BYTES / 4);

  const atlasTexture = device.createTexture({
    size: [ATLAS_W, ATLAS_H],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: atlasCanvas },
    { texture: atlasTexture },
    { width: ATLAS_W, height: ATLAS_H },
  );

  const atlasSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  let pipeline: GPURenderPipeline;
  let bindGroup: GPUBindGroup;
  try {
    const module = device.createShaderModule({ code: SHADER });
    pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    const compilation = await module.getCompilationInfo();
    if (compilation.messages.some((message) => message.type === 'error')) {
      atlasTexture.destroy();
      device.destroy();
      return null;
    }

    bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms } },
        { binding: 1, resource: atlasTexture.createView() },
        { binding: 2, resource: atlasSampler },
      ],
    });
  } catch {
    atlasTexture.destroy();
    device.destroy();
    return null;
  }

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    context.configure({ device, format, alphaMode: 'premultiplied' });
  };

  resize();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const started = performance.now();
  let intensity = 0.35;
  let mode = INK_VARIANT_INDEX.equations;
  let targetX = 0.5;
  let targetY = 0.5;
  let pointerX = 0.5;
  let pointerY = 0.5;
  let frame = 0;
  let running = true;
  let disposed = false;

  const draw = (now: number): void => {
    if (!running || disposed) return;
    resize();

    if (reducedMotion) {
      pointerX = targetX;
      pointerY = targetY;
    } else {
      pointerX += (targetX - pointerX) * 0.055;
      pointerY += (targetY - pointerY) * 0.055;
    }

    data[0] = canvas.width;
    data[1] = canvas.height;
    data[2] = reducedMotion ? 12 : (now - started) / 1000;
    data[3] = intensity;
    data[4] = pointerX;
    data[5] = pointerY;
    data[6] = mode;
    data[7] = canvas.width / Math.max(canvas.height, 1);
    device.queue.writeBuffer(uniforms, 0, data);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    frame = requestAnimationFrame(draw);
  };

  frame = requestAnimationFrame(draw);

  const observer = new ResizeObserver(() => {
    resize();
  });
  observer.observe(canvas);

  const onVisibility = (): void => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(frame);
      return;
    }
    if (!running && !disposed) {
      running = true;
      frame = requestAnimationFrame(draw);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  void device.lost.then(() => {
    running = false;
    cancelAnimationFrame(frame);
  });

  return {
    setIntensity(value: number): void {
      intensity = Math.max(0, Math.min(1, value));
    },
    setVariant(variant: InkVariant): void {
      mode = INK_VARIANT_INDEX[variant];
    },
    setPointer(x: number, y: number): void {
      targetX = Math.max(0, Math.min(1, x));
      targetY = Math.max(0, Math.min(1, y));
    },
    destroy(): void {
      disposed = true;
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      uniforms.destroy();
      atlasTexture.destroy();
      device.destroy();
    },
  };
}
