import * as THREE from 'three';
import type { Ctx } from '@core/api';
import type { Vec3 } from '@contracts/types';

/**
 * Owner: E. Pooled particle system for `fx:emit {preset, at}` (contract A3).
 * Two THREE.Points pools — normal blending (1600) and additive (400), 2000 live cap —
 * driven by one shared CPU integrator; per-particle color/size/alpha via a tiny shader so
 * three simultaneous presets stay far above the 50 fps budget (acceptance, card E4).
 */
interface Preset {
  count: number;
  colors: number[];
  size: [number, number];
  /** [spreadXZ, yMin, yMax] initial velocity in m/s. */
  vel: [number, number, number];
  /** m/s² along y; negative = falls, positive = rises. */
  gravity: number;
  life: [number, number];
  alpha: number;
  additive?: boolean;
  /** Horizontal sinusoidal drift: [amplitude m, frequency Hz]. */
  sway?: [number, number];
  twinkle?: boolean;
  spawnRadius?: number;
}

const PRESETS: Record<string, Preset> = {
  steam:    { count: 14, colors: [0xffffff, 0xe8e4da], size: [0.06, 0.12], vel: [0.05, 0.25, 0.45], gravity: 0.02, life: [1.2, 1.8], alpha: 0.3, spawnRadius: 0.1 },
  bubbles:  { count: 12, colors: [0xbfe8ec, 0x9fd8e0], size: [0.02, 0.05], vel: [0.08, 0.3, 0.6], gravity: 0.05, life: [0.8, 1.4], alpha: 0.75 },
  flame:    { count: 20, colors: [0xf2782f, 0xffb347, 0xe2553f], size: [0.05, 0.14], vel: [0.12, 0.6, 1.2], gravity: -0.4, life: [0.35, 0.6], alpha: 0.85, additive: true, spawnRadius: 0.06 },
  huajiao:  { count: 16, colors: [0xc9a86a, 0xb08d4f, 0xe0c896], size: [0.015, 0.03], vel: [0.25, 0.4, 0.9], gravity: -3.5, life: [0.9, 1.4], alpha: 0.95 },
  chili:    { count: 14, colors: [0xd9483b, 0xe2553f, 0xb03a2e], size: [0.02, 0.045], vel: [0.25, 0.4, 0.9], gravity: -3.5, life: [0.9, 1.4], alpha: 0.95 },
  dust:     { count: 12, colors: [0xc9b18f, 0xb7a184], size: [0.04, 0.09], vel: [0.3, 0.2, 0.5], gravity: -1.2, life: [0.5, 0.9], alpha: 0.35, spawnRadius: 0.14 },
  confetti: { count: 24, colors: [0xf2b33d, 0xe2553f, 0x2a8c9a, 0x8dbf9f, 0xc2547a], size: [0.02, 0.04], vel: [0.8, 1.2, 2.2], gravity: -2.5, life: [1.2, 1.8], alpha: 1, sway: [0.18, 3] },
  sparkle:  { count: 10, colors: [0xf2b33d, 0xffd97a, 0xfff3d6], size: [0.015, 0.04], vel: [0.3, 0.3, 0.8], gravity: -0.3, life: [0.5, 0.9], alpha: 1, twinkle: true },
  petals:   { count: 12, colors: [0xf4b8c8, 0xee9fb4, 0xfadde5], size: [0.03, 0.055], vel: [0.15, -0.05, 0.1], gravity: -0.35, life: [2, 3.2], alpha: 0.9, sway: [0.25, 1.2] },
};

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
uniform float uScale;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.001, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float soft = 1.0 - smoothstep(0.55, 1.0, r);
  gl_FragColor = vec4(vColor, vAlpha * soft);
}`;

const MAX_MAIN = 1600;
const MAX_ADD = 400;

interface Pool {
  points: THREE.Points;
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  max: number;
  alive: number;
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  alp: Float32Array;
  vel: Float32Array;
  age: Float32Array;
  life: Float32Array;
  swayAmp: Float32Array;
  swayFreq: Float32Array;
  swayPhase: Float32Array;
  baseAlpha: Float32Array;
  baseVelY: Float32Array;
  preset: (Preset | null)[];
}

function makePool(max: number, additive: boolean): Pool {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alp = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uScale: { value: 600 } },
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  return {
    points, geo, mat, max, alive: 0, pos, col, size, alp,
    vel: new Float32Array(max * 3), age: new Float32Array(max), life: new Float32Array(max),
    swayAmp: new Float32Array(max), swayFreq: new Float32Array(max), swayPhase: new Float32Array(max),
    baseAlpha: new Float32Array(max), baseVelY: new Float32Array(max), preset: new Array(max).fill(null),
  };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function spawn(pool: Pool, p: Preset, at: THREE.Vector3): void {
  if (pool.alive >= pool.max) return; // cap reached — drop the extra, keep fps
  const i = pool.alive++;
  const r = p.spawnRadius ?? 0.08;
  const a = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * r;
  pool.pos[i * 3] = at.x + Math.cos(a) * rad;
  pool.pos[i * 3 + 1] = at.y + rand(-0.02, 0.02);
  pool.pos[i * 3 + 2] = at.z + Math.sin(a) * rad;
  const c = new THREE.Color(p.colors[(Math.random() * p.colors.length) | 0]);
  pool.col[i * 3] = c.r; pool.col[i * 3 + 1] = c.g; pool.col[i * 3 + 2] = c.b;
  pool.size[i] = rand(p.size[0], p.size[1]);
  pool.vel[i * 3] = rand(-p.vel[0], p.vel[0]);
  pool.baseVelY[i] = rand(p.vel[1], p.vel[2]);
  pool.vel[i * 3 + 1] = pool.baseVelY[i];
  pool.vel[i * 3 + 2] = rand(-p.vel[0], p.vel[0]);
  pool.age[i] = 0;
  pool.life[i] = rand(p.life[0], p.life[1]);
  pool.swayAmp[i] = p.sway ? rand(p.sway[0] * 0.5, p.sway[0]) : 0;
  pool.swayFreq[i] = p.sway ? p.sway[1] * rand(0.8, 1.2) : 0;
  pool.swayPhase[i] = Math.random() * Math.PI * 2;
  pool.baseAlpha[i] = p.alpha * rand(0.75, 1);
  pool.preset[i] = p;
}

function kill(pool: Pool, i: number): void {
  const last = --pool.alive;
  if (i === last) { pool.preset[i] = null; return; }
  const copy = (src: Float32Array, stride: number) => {
    for (let k = 0; k < stride; k++) src[i * stride + k] = src[last * stride + k];
  };
  copy(pool.pos, 3); copy(pool.col, 3); copy(pool.vel, 3);
  for (const arr of [pool.size, pool.alp, pool.age, pool.life, pool.swayAmp, pool.swayFreq, pool.swayPhase, pool.baseAlpha, pool.baseVelY]) arr[i] = arr[last];
  pool.preset[i] = pool.preset[last];
  pool.preset[last] = null;
}

function update(pool: Pool, dt: number, time: number): void {
  for (let i = pool.alive - 1; i >= 0; i--) {
    const p = pool.preset[i]!;
    pool.age[i] += dt;
    if (pool.age[i] >= pool.life[i]) { kill(pool, i); continue; }
    pool.vel[i * 3 + 1] = pool.baseVelY[i] + p.gravity * pool.age[i];
    const sway = pool.swayAmp[i] ? Math.sin(time * pool.swayFreq[i] * Math.PI * 2 + pool.swayPhase[i]) * pool.swayAmp[i] : 0;
    pool.pos[i * 3] += (pool.vel[i * 3] + sway) * dt;
    pool.pos[i * 3 + 1] += pool.vel[i * 3 + 1] * dt;
    pool.pos[i * 3 + 2] += pool.vel[i * 3 + 2] * dt;
    const t = pool.age[i] / pool.life[i];
    let a = pool.baseAlpha[i] * Math.min(1, t / 0.15) * (1 - smoothStep(0.6, 1, t));
    if (p.twinkle) a *= 0.55 + 0.45 * Math.sin(time * 22 + pool.swayPhase[i]);
    pool.alp[i] = a;
  }
  pool.geo.setDrawRange(0, pool.alive);
  for (const key of ['position', 'aColor', 'aSize', 'aAlpha'] as const) {
    (pool.geo.getAttribute(key) as THREE.BufferAttribute).needsUpdate = true;
  }
}

function smoothStep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function setupParticles(ctx: Ctx): void {
  const main = makePool(MAX_MAIN, false);
  const add = makePool(MAX_ADD, true);
  ctx.three.scene.add(main.points, add.points);

  const atVector = (at?: Vec3 | THREE.Vector3): THREE.Vector3 =>
    at ? (Array.isArray(at) ? new THREE.Vector3(at[0], at[1], at[2]) : at.clone())
       : new THREE.Vector3(0, ctx.world.counterTop, 0);

  ctx.bus.on('fx:emit', ({ preset, at }) => {
    const p = PRESETS[preset];
    if (!p) return;
    const pool = p.additive ? add : main;
    const origin = atVector(at);
    for (let n = 0; n < p.count; n++) spawn(pool, p, origin);
  });

  ctx.onFrame((dt) => {
    const time = performance.now() / 1000;
    const h = ctx.three.renderer.domElement.height ?? ctx.three.renderer.domElement.clientHeight;
    const scale = (h * 0.5) / Math.tan((ctx.three.camera.fov * Math.PI) / 360);
    main.mat.uniforms.uScale.value = scale;
    add.mat.uniforms.uScale.value = scale;
    update(main, dt, time);
    update(add, dt, time);
  });

  // Dev scene: every preset firing on a 3×3 grid, re-emitted so ?scene=fx_presets shows them alive.
  ctx.dev.scene('fx_presets', { kitchen: 'home' }, (c) => {
    const names = Object.keys(PRESETS);
    let acc = 99; // fire on the first frame too
    const stop = c.onFrame((delta) => {
      acc += delta;
      if (acc < 2.2) return;
      acc = 0;
      names.forEach((name, i) => {
        c.bus.emit('fx:emit', { preset: name, at: [(i % 3) * 0.8 - 0.8, 1.3, Math.floor(i / 3) * 0.8 - 0.4] });
      });
    });
    return stop;
  });
}
