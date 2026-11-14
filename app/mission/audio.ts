/**
 * Sound for the mission: a synthesised ambient bed, typing ticks and a few cues (all made in the browser,
 * so there is nothing to license), and the recorded voice lines.
 *
 * Two switches, both remembered: Sound (bed + cues) and Voice (narration). Browsers only allow audio after
 * a click, so everything starts from the Begin screen.
 *
 * A voice line plays /audio/<id>.mp3. If the file is missing or blocked, the browser's own voice reads it
 * instead, and if that is unavailable too the line is simply timed, so the story never stalls.
 */
import type { VoiceLine } from "@/lib/game/data/story";

export interface Settings {
  sound: boolean;
  voice: boolean;
}

const SETTINGS_KEY = "eclipse-settings";

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Settings>;
      return { sound: p.sound !== false, voice: p.voice !== false };
    }
  } catch {
    /* private window or blocked storage: use the defaults */
  }
  return { sound: true, voice: true };
}

export function saveSettings(s: Settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// ───────────────────────────── the sound bed and cues ─────────────────────────────

const BED_LEVEL = 0.16;
const BED_DUCKED = 0.075;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bed: GainNode | null = null;
  private enabled = true;
  private ducked = false;

  /** Call from a click. Creates the audio graph the first time. */
  unlock() {
    if (!this.ctx) this.build();
    void this.ctx?.resume();
  }

  private build() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.enabled ? 1 : 0;
    master.connect(ctx.destination);
    this.master = master;

    const bed = ctx.createGain();
    bed.gain.value = 0;
    bed.connect(master);
    this.bed = bed;

    // a cold drone: two slightly detuned low sines beat slowly against each other, a fifth above adds air
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 240;
    lp.Q.value = 0.7;
    lp.connect(bed);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    const tone = (type: OscillatorType, freq: number, level: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(lp);
      o.start();
    };
    tone("sine", 55, 0.55);
    tone("sine", 55.4, 0.55);
    tone("triangle", 82.4, 0.16);
    tone("sine", 110.3, 0.08);

    // wind over ice: brown noise, filtered
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.2;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 380;
    nf.Q.value = 0.5;
    const ng = ctx.createGain();
    ng.gain.value = 0.35;
    noise.connect(nf).connect(ng).connect(bed);
    noise.start();

    bed.gain.setTargetAtTime(this.ducked ? BED_DUCKED : BED_LEVEL, ctx.currentTime + 0.2, 1.4);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.2);
  }

  /** Lower the bed under the voice so the words stay clear. */
  duck(on: boolean) {
    this.ducked = on;
    if (this.ctx && this.bed) this.bed.gain.setTargetAtTime(on ? BED_DUCKED : BED_LEVEL, this.ctx.currentTime, 0.5);
  }

  tick() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(1500 + Math.random() * 500, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.012, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.04);
  }

  /** A low boom: panel changes and the title. */
  thump(level = 0.5) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(74, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1.7);
  }

  /** A slow rising pad: a new scene arriving. */
  swell(root = 110) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    for (const [mul, level] of [
      [1, 0.05],
      [1.5, 0.03],
      [2, 0.018],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = root * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level, t + 1.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 3.5);
    }
  }

  /** A soft click: picking an option. */
  click() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.08);
  }

  /** A part locking into the hull: a low thunk and a metal tick. */
  lock() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.25);
    const m = ctx.createOscillator();
    m.type = "square";
    m.frequency.value = 2300;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(0.02, t);
    mg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    m.connect(mg).connect(this.master);
    m.start(t);
    m.stop(t + 0.04);
  }

  /** The engine refusing: a short, flat buzz. */
  reject() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    for (const f of [170, 181]) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.18);
    }
  }

  /** The launch gantry powering up: a rising sweep and a boom. */
  launch() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(48, t);
    o.frequency.exponentialRampToValueAtTime(380, t + 2.4);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(140, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 2.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 2.9);
    this.thump(0.55);
  }

  private noise(seconds: number): AudioBufferSourceNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  /** An engine burn: a low rumble that swells and fades. */
  burn(seconds = 2.6) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    const n = this.noise(seconds + 0.2);
    if (!n) return;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(180, t);
    f.frequency.linearRampToValueAtTime(620, t + seconds * 0.5);
    f.frequency.linearRampToValueAtTime(160, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + seconds * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    n.connect(f).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + seconds + 0.2);
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 46;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.05, t + seconds * 0.3);
    og.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    o.connect(f);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + seconds + 0.1);
  }

  // ── flight deck ──
  // In vacuum there is no sound outside the ship: everything here is what comes through the hull.

  private hum: { g: GainNode; f: BiquadFilterNode; o: OscillatorNode; og: GainNode } | null = null;

  /** The main engine, felt through the hull: 0 = off, 1 = full thrust. Continuous; call every frame. */
  engine(level: number, pitch = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (!this.hum) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
        d[i] = last * 4;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 220;
      f.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 38;
      const og = ctx.createGain();
      og.gain.value = 0;
      const of = ctx.createBiquadFilter();
      of.type = "lowpass";
      of.frequency.value = 120;
      o.connect(of).connect(og).connect(this.master);
      o.start();
      this.hum = { g, f, o, og };
    }
    const on = this.enabled ? Math.max(0, Math.min(1, level)) : 0;
    const t = ctx.currentTime;
    this.hum.g.gain.setTargetAtTime(on * 0.34, t, on > 0 ? 0.08 : 0.35);
    this.hum.og.gain.setTargetAtTime(on * 0.07, t, on > 0 ? 0.1 : 0.4);
    this.hum.f.frequency.setTargetAtTime(160 + 260 * on * pitch, t, 0.2);
    this.hum.o.frequency.setTargetAtTime(34 + 10 * pitch, t, 0.3);
  }

  /** A thruster pulse: a short, hard puff. */
  puff(level = 0.5) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    const n = this.noise(0.14);
    if (!n) return;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 900 + Math.random() * 500;
    f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * level, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(f).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + 0.15);
  }

  /** Ice on the hull: a sharp crack and a ringing knock. */
  clack(level = 0.6) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    const n = this.noise(0.35);
    if (n) {
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35 * level, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      n.connect(f).connect(g).connect(this.master);
      n.start(t);
      n.stop(t + 0.3);
    }
    for (const [freq, lvl] of [
      [190, 0.22],
      [457, 0.1],
      [1130, 0.05],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * (0.95 + Math.random() * 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(lvl * level, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 1);
    }
  }

  /** Docking latches closing: a deep clunk, then a second. */
  capture() {
    this.thump(0.9);
    const ctx = this.ctx;
    if (!ctx) return;
    window.setTimeout(() => this.thump(0.6), 420);
    window.setTimeout(() => this.clack(0.25), 900);
  }

  /** The master alarm for a collision warning: two-tone. */
  warn() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      for (const [k, f] of [
        [0, 1046],
        [0.16, 784],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = f;
        const g = ctx.createGain();
        const s = t + i * 0.42 + k;
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(0.05, s + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.15);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 2400;
        o.connect(lp).connect(g).connect(this.master);
        o.start(s);
        o.stop(s + 0.16);
      }
    }
  }

  /** Something passing very close, very fast: felt as a pressure thud and a hiss in the hull. */
  pass() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    const n = this.noise(1.6);
    if (!n) return;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
    f.frequency.exponentialRampToValueAtTime(200, t + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    n.connect(f).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + 1.6);
    this.thump(0.35);
  }

  /** A card turning over: a short whoosh. */
  flip() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    const n = this.noise(0.3);
    if (!n) return;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    n.connect(f).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + 0.3);
  }

  /** Radio static, for another crew calling. */
  radio() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const n = this.noise(0.12);
      if (!n) return;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1700 + i * 300;
      f.Q.value = 4;
      const g = ctx.createGain();
      const at = t + i * 0.1;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.07, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      n.connect(f).connect(g).connect(this.master);
      n.start(at);
      n.stop(at + 0.12);
    }
  }

  /** A hull alarm: three alternating tones. */
  alarm() {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = i % 2 ? 640 : 880;
      const g = ctx.createGain();
      const at = t + i * 0.16;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.04, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      o.connect(g).connect(this.master);
      o.start(at);
      o.stop(at + 0.15);
    }
  }

  /** A single soft bell: an HUD meter lighting up. */
  ping(freq = 880) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1);
  }
}

// ───────────────────────────── voice ─────────────────────────────

export interface LineHandle {
  /** how far through the line we are, 0 to 1 */
  progress(): number;
  /** resolves when the line has finished or been cancelled */
  done: Promise<void>;
  finished(): boolean;
  /** Silence or restore the voice without losing the timing, for the Voice switch. */
  setMuted(muted: boolean): void;
  cancel(): void;
}

/** Seconds a line takes if nothing is speaking it: the timing the text reveal falls back on. */
export function estimateSeconds(line: VoiceLine): number {
  const words = line.text.trim().split(/\s+/).length;
  return words / (line.role === "narrator" ? 2.5 : 2.9) + 0.5;
}

export function playLine(line: VoiceLine, opts: { voice: boolean; onSpeaking?: (speaking: boolean) => void }): LineHandle {
  const estimate = estimateSeconds(line) * 1000;
  const start = performance.now();
  let audio: HTMLAudioElement | null = null;
  let usingFile = false;
  let usingSpeech = false;
  let over = false;
  let resolve: () => void = () => {};
  const done = new Promise<void>((r) => (resolve = r));
  let fallbackTimer = 0;

  const finish = () => {
    if (over) return;
    over = true;
    window.clearTimeout(fallbackTimer);
    opts.onSpeaking?.(false);
    resolve();
  };

  const timed = () => {
    // no audible voice: time the line, then finish
    usingFile = false;
    fallbackTimer = window.setTimeout(finish, Math.max(0, estimate - (performance.now() - start)) + 350);
  };

  const speech = () => {
    if (typeof window.speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") return timed();
    try {
      const u = new SpeechSynthesisUtterance(line.text);
      u.lang = "en-GB";
      u.rate = line.role === "narrator" ? 0.88 : 1;
      u.pitch = line.role === "narrator" ? 0.8 : 1;
      u.onend = finish;
      u.onerror = finish;
      usingSpeech = true;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      // if the browser never starts speaking, don't hang the story
      fallbackTimer = window.setTimeout(() => {
        if (!window.speechSynthesis.speaking) finish();
      }, 2500);
    } catch {
      timed();
    }
  };

  if (!opts.voice) timed();
  else {
    audio = new Audio(`/audio/${line.id}.mp3`);
    audio.preload = "auto";
    usingFile = true;
    opts.onSpeaking?.(true);
    audio.addEventListener("ended", finish);
    audio.addEventListener("error", () => {
      if (over || !usingFile) return;
      usingFile = false;
      speech();
    });
    audio.play().catch(() => {
      if (over || !usingFile) return;
      usingFile = false;
      speech();
    });
  }

  return {
    progress() {
      if (over) return 1;
      const elapsed = performance.now() - start;
      if (usingFile && audio && audio.duration > 0 && audio.currentTime > 0) return Math.min(1, audio.currentTime / audio.duration);
      // the file is still loading: wait for it for a moment rather than racing ahead of the voice
      if (usingFile && audio && elapsed < 1800) return 0;
      return Math.min(1, elapsed / estimate);
    },
    done,
    finished: () => over,
    setMuted(muted) {
      if (audio) audio.muted = muted;
      if (muted && usingSpeech) window.speechSynthesis.cancel();
    },
    cancel() {
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      if (usingSpeech) window.speechSynthesis.cancel();
      finish();
    },
  };
}
