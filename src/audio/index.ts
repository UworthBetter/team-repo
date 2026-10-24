import { defineModule, type Ctx } from '@core/api';

/**
 * Owner: E. Every sfx:play id plays public/sfx/sfx_<id>.ogg when that name is listed in
 * public/sfx/manifest.json (npm run assets:manifest). Otherwise a synthesized placeholder blip,
 * so feedback is never silent. Ids in use: grab snap snap_hover bounce egg_crack step_done oops
 * coin stamp deny sticker flip slice wok_toss flare. Music (card E5): on kitchen:ready,
 * crossfade to mus_<kitchen>.ogg over 0.8 s when it's in the sfx manifest; per-track BPM for
 * owner C lives in public/sfx/music.json. No new events; blip fallback kept.
 */
type Blip = { f: number; to?: number; d: number; type?: OscillatorType; noise?: boolean };
const BLIPS: Record<string, Blip> = {
  grab: { f: 520, to: 640, d: 0.06 },
  snap: { f: 880, to: 1180, d: 0.08, type: 'triangle' },
  snap_hover: { f: 700, d: 0.03, type: 'triangle' },
  bounce: { f: 260, to: 180, d: 0.08 },
  egg_crack: { f: 0, d: 0.07, noise: true },
  step_done: { f: 660, to: 990, d: 0.14, type: 'triangle' },
  oops: { f: 420, to: 160, d: 0.3, type: 'sawtooth' },
  coin: { f: 1320, to: 1760, d: 0.09, type: 'square' },
  stamp: { f: 140, to: 70, d: 0.18 },
  deny: { f: 180, d: 0.18, type: 'square' },
  sticker: { f: 990, to: 1980, d: 0.2, type: 'triangle' },
};

function setupAudio(ctx: Ctx) {
  if (ctx.flags.mute) return;
  let ac: AudioContext | null = null;
  const files = new Set<string>();
  const buffers = new Map<string, Promise<AudioBuffer | null>>();
  const base = import.meta.env.BASE_URL ?? '/';

  void fetch(`${base}sfx/manifest.json`)
    .then((r) => (r.ok ? r.json() : { files: [] }))
    .then((j: { files?: string[] }) => {
      (j.files ?? []).forEach((f) => files.add(f));
      applyMusic(); // manifest may arrive after the first kitchen:ready
    })
    .catch(() => {});

  // Browsers only allow audio after a user gesture.
  const unlock = () => {
    ac ??= new AudioContext();
    void ac.resume().then(() => applyMusic());
  };
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });

  const load = (name: string) => {
    let p = buffers.get(name);
    if (!p && ac) {
      const a = ac;
      p = fetch(`${base}sfx/${name}.ogg`)
        .then((r) => r.arrayBuffer())
        .then((b) => a.decodeAudioData(b))
        .catch(() => null);
      buffers.set(name, p);
    }
    return p ?? Promise.resolve(null);
  };

  function blip(b: Blip) {
    if (!ac) return;
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + b.d);
    g.connect(ac.destination);
    if (b.noise) {
      const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * b.d), ac.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.start(t);
      return;
    }
    const o = ac.createOscillator();
    o.type = b.type ?? 'sine';
    o.frequency.setValueAtTime(b.f, t);
    if (b.to) o.frequency.exponentialRampToValueAtTime(b.to, t + b.d);
    o.connect(g);
    o.start(t);
    o.stop(t + b.d + 0.02);
  }

  function play(id: string) {
    if (!ac || ac.state !== 'running') return;
    const name = `sfx_${id}`;
    if (files.has(name)) {
      void load(name).then((buf) => {
        if (!buf || !ac) return;
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.connect(ac.destination);
        src.start();
      });
    } else blip(BLIPS[id] ?? { f: 600, d: 0.05 });
  }

  ctx.bus.on('sfx:play', ({ id }) => play(id));
  ctx.bus.on('coins:change', ({ delta }) => delta > 0 && play('coin'));
  ctx.bus.on('result:shown', () => play('stamp'));

  // --- music (E5): one looping track per kitchen, 0.8 s crossfade on switch ---
  let musicGain: GainNode | null = null;
  let current: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  let currentTrack: string | null = null;
  let currentKitchen: string | null = null;

  function startMusic(name: string) {
    if (!ac) return;
    const a = ac;
    musicGain ??= a.createGain();
    musicGain.gain.value = 0.22;
    musicGain.connect(a.destination);
    void load(name).then((buf) => {
      if (!buf || !a || !musicGain) return;
      const t = a.currentTime;
      const gain = a.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(1, t + 0.8);
      gain.connect(musicGain);
      const src = a.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain);
      src.start(t);
      current = { src, gain };
      currentTrack = name;
    });
  }

  function applyMusic() {
    if (!ac || ac.state !== 'running' || !currentKitchen) return;
    const name = `mus_${currentKitchen}`;
    if (name === currentTrack || !files.has(name)) return;
    if (current) {
      const t = ac.currentTime;
      const { src, gain } = current;
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      src.stop(t + 0.85);
      current = null;
      currentTrack = null;
    }
    startMusic(name);
  }

  ctx.bus.on('kitchen:ready', ({ kitchenId }) => {
    currentKitchen = kitchenId;
    applyMusic();
  });
}

export default defineModule({ id: 'audio', owner: 'E', setup: setupAudio });
