// Every sound is synthesized at runtime, so there are no audio files to ship or license.

let ctx = null;
let master = null;
let noiseBuffer = null;
let muted = false;
const lastPlayed = {};

const MIN_GAP = { shot: 0.07, tick: 0.05, collect: 0.05, crunch: 0.06, leak: 0.1, thunk: 0.08, boom: 0.09 };

function ensure() {
  if (ctx) return true;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return false;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  startSurf();
  return true;
}

function startSurf() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  const gain = ctx.createGain();
  gain.gain.value = 0.035;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const depth = ctx.createGain();
  depth.gain.value = 0.02;
  lfo.connect(depth).connect(gain.gain);
  src.connect(filter).connect(gain).connect(master);
  src.start();
  lfo.start();
}

function tone(type, from, to, dur, vol, delay = 0) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(filterType, freq, dur, vol, delay = 0) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t, Math.random() * 0.8);
  src.stop(t + dur + 0.02);
}

const SOUNDS = {
  shot: () => noise('highpass', 2600, 0.05, 0.05),
  thunk: (o) => { tone('triangle', o.high ? 340 : 170, 60, 0.14, 0.32); noise('lowpass', 900, 0.08, 0.1); },
  boom: (o) => { tone('sine', 120, 34, o.soft ? 0.28 : 0.6, o.soft ? 0.3 : 0.7); noise('lowpass', o.soft ? 800 : 1400, o.soft ? 0.25 : 0.55, o.soft ? 0.14 : 0.35); },
  crunch: () => noise('bandpass', 1500, 0.07, 0.14),
  tick: () => tone('square', 1500, 900, 0.03, 0.025),
  collect: (o) => tone('triangle', 520 + (o.fill ?? 0) * 620, 760 + (o.fill ?? 0) * 620, 0.05, 0.05),
  build: () => [392, 523, 659].forEach((f, i) => tone('triangle', f, f, 0.14, 0.13, i * 0.07)),
  chime: () => [784, 1047].forEach((f, i) => tone('sine', f, f, 0.25, 0.14, i * 0.09)),
  leak: () => tone('sawtooth', 150, 70, 0.22, 0.17),
  horn: () => { tone('sawtooth', 146, 142, 0.7, 0.06); tone('sawtooth', 110, 108, 0.7, 0.07); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.26, 0.17, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.97, 0.32, 0.15, i * 0.16)),
};

export const audio = {
  // Browsers only allow sound after a user gesture.
  unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  },
  setMuted(value) {
    muted = value;
    if (master) master.gain.value = muted ? 0 : 0.8;
  },
  get muted() { return muted; },
  play(name, opts = {}) {
    if (!ctx || muted || ctx.state !== 'running') return;
    const gap = MIN_GAP[name] ?? 0;
    const now = ctx.currentTime;
    if (gap && now - (lastPlayed[name] ?? -1) < gap) return;
    lastPlayed[name] = now;
    SOUNDS[name]?.(opts);
  },
};
