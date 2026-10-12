// Sound, made in the browser with the Web Audio API (no recordings to license): trains rumbling past, braking into a
// platform and pulling out, their doors, a chime and a murmur from the speakers when a train is due at the station
// you're looking at, birds by day and quiet at night, over a soft bed of distant town. It follows the camera: close to
// the line you hear what's near where you're looking, and at whole-line zoom only the bed. Nothing waits for it and it
// changes nothing: it reads the sim and the drawn trains on a timer, never every frame. The browser allows sound only
// after the player has tapped, so it starts then; muted, it makes nothing at all.
import type * as THREE from 'three';
import type { Sim } from '../sim/sim.ts';

const TICK = 0.1;             // real seconds between looks at the sim
const HEAR = 320;             // metres from where the camera looks that a train can be heard
const NEAR_R = 350, FAR_R = 1800;   // camera distances: everything heard closer than NEAR_R, only the bed past FAR_R
const DUE = 650;              // metres out a train is announced at the station you're looking at
const STATION_NEAR = 450;     // ...which is the owned station within this of where the camera looks
const GAP = 9;                // real seconds at least between announcements
const MAX_EVENTS = 4;         // brakes and departures started in one look, at most (10x can bunch them)

/** What a train was doing at the last look, to hear it change. */
interface Was { state: 'run' | 'dwell' | 'away'; next: number | null }

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bed: GainNode | null = null;
  private rumble: GainNode | null = null;
  private rumbleTone: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private on: boolean;
  private volume: number;
  private acc = 0;
  private was = new Map<number, Was>();
  private announced = new Set<string>();
  private lastCall = -1e9;
  private birdDue = 0;
  private clock = 0;
  /** What the checks read: whether it's running, and how many of each sound it has started. */
  readonly heard = { running: false, brakes: 0, departs: 0, calls: 0, birds: 0 };

  constructor(on: boolean, volume: number) { this.on = on; this.volume = volume; }

  /** Start on the player's first tap or key: the browser allows sound only after one. */
  listen(target: EventTarget): void {
    const start = () => { if (this.on) this.start(); };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) target.addEventListener(ev, start, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!this.ctx) return; if (document.hidden) void this.ctx.suspend(); else if (this.on) void this.ctx.resume(); });
  }

  setOn(on: boolean): void {
    this.on = on;
    if (on) this.start();
    this.level();
    if (!on && this.ctx) void this.ctx.suspend();
  }
  setVolume(v: number): void { this.volume = Math.max(0, Math.min(1, v)); this.level(); }

  private level(): void {
    if (!this.ctx || !this.master) return;
    // the slider's top is still gentle: half of full scale, and a square law so the low end is fine-grained
    this.master.gain.setTargetAtTime(this.on ? this.volume * this.volume * 0.5 : 0, this.ctx.currentTime, 0.05);
  }

  /** Make the context and the continuous parts (the bed and the rumble) once; resume it after that. */
  private start(): void {
    if (this.ctx) { if (this.ctx.state !== 'running') void this.ctx.resume(); this.heard.running = true; return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC(); this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    // two seconds of noise, looped: the source of the bed, the rumble, brakes and doors
    const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; // cosmetic
    this.noise = buf;
    // the bed: distant town, a low wash
    const bed = this.loop(); const bl = ctx.createBiquadFilter(); bl.type = 'lowpass'; bl.frequency.value = 260;
    this.bed = ctx.createGain(); this.bed.gain.value = 0; bed.connect(bl).connect(this.bed).connect(this.master);
    // the rumble of trains running near: lower and duller far off, brighter close by
    const rb = this.loop(); this.rumbleTone = ctx.createBiquadFilter(); this.rumbleTone.type = 'lowpass'; this.rumbleTone.frequency.value = 160; this.rumbleTone.Q.value = 0.8;
    this.rumble = ctx.createGain(); this.rumble.gain.value = 0; rb.connect(this.rumbleTone).connect(this.rumble).connect(this.master);
    this.level(); this.heard.running = true;
    if (ctx.state !== 'running') void ctx.resume();
  }

  private loop(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource(); s.buffer = this.noise; s.loop = true;
    s.loopStart = Math.random() * 1.5; s.start(0, s.loopStart); // cosmetic
    return s;
  }

  /** Look at the sim and the camera: dt real seconds since the last frame; focus where the camera looks and how far
   * out it is; daylight 0 (night) to 1 (noon); stations' (x, z) by index; trains' drawn groups by the sim's list. */
  update(sim: Sim, focus: { tx: number; tz: number; r: number }, daylight: number, stations: [number, number][], trains: THREE.Group[], dt: number): void {
    this.acc += dt; this.clock += dt;
    if (this.acc < TICK) return;
    const step = this.acc; this.acc = 0;
    const ctx = this.ctx;
    // keep track of what the trains are doing even while silent, so turning sound on doesn't play a burst of stale events
    const zoom = Math.max(0, Math.min(1, (FAR_R - focus.r) / (FAR_R - NEAR_R)));
    let rumble = 0, events = 0;
    const g = sim.g;
    g.trains.forEach((tr, i) => {
      const prev = this.was.get(tr.id), grp = trains[i], car = grp?.children[0];
      const d = car ? Math.hypot(car.position.x - focus.tx, car.position.z - focus.tz) : Infinity;
      const near = Math.max(0, 1 - d / HEAR) * zoom;
      if (tr.state === 'run') rumble += near * Math.min(1, Math.abs(tr.v) / 30);
      if (prev && near > 0.05 && ctx && this.on && events < MAX_EVENTS) {
        if (prev.state === 'run' && tr.state === 'dwell') { this.brake(near); this.doors(near, 1.6); this.heard.brakes++; events++; }
        else if (prev.state === 'dwell' && tr.state === 'run') { this.doors(near * 0.8, 0); this.depart(near); this.heard.departs++; events++; }
      }
      if (prev) { prev.state = tr.state; prev.next = tr.next; } else this.was.set(tr.id, { state: tr.state, next: tr.next });
    });
    if (!ctx || !this.on || !this.bed || !this.rumble || !this.rumbleTone) return;
    const t = ctx.currentTime;
    // the bed: always there, softer at night; the rumble: the trains near, by how fast they go
    this.bed.gain.setTargetAtTime(0.05 + 0.05 * daylight, t, 0.5);
    this.rumble.gain.setTargetAtTime(Math.min(0.9, rumble * 0.7), t, 0.25);
    this.rumbleTone.frequency.setTargetAtTime(120 + 260 * Math.min(1, rumble), t, 0.3);
    this.announce(sim, focus, stations, zoom);
    // birds: by day, near the ground, a trill every second or few; none at night
    this.birdDue -= step;
    if (this.birdDue <= 0) {
      this.birdDue = 0.6 + Math.random() * 3.2; // cosmetic
      const k = Math.max(0, (daylight - 0.25) / 0.75) * zoom;
      if (k > 0.05) { this.bird(k); this.heard.birds++; }
    }
  }

  /** The station under the camera announces the next train due there from either way, once per train. */
  private announce(sim: Sim, focus: { tx: number; tz: number }, stations: [number, number][], zoom: number): void {
    if (zoom < 0.3 || this.clock - this.lastCall < GAP) return;
    let at = -1, best = STATION_NEAR;
    stations.forEach(([x, z], i) => { const d = Math.hypot(x - focus.tx, z - focus.tz); if (d < best && sim.g.owned[i]) { best = d; at = i; } });
    if (at < 0) return;
    const s = sim.station(at).s;
    for (const tr of sim.g.trains) {
      if (tr.state !== 'run' || tr.next !== at) continue;
      const ahead = (s - tr.s) * tr.dir, key = `${tr.id}:${at}:${Math.floor(sim.g.t / 600)}`;
      if (ahead > 0 && ahead < DUE && !this.announced.has(key)) {
        this.announced.add(key); if (this.announced.size > 64) this.announced.clear();
        this.lastCall = this.clock; this.chime(zoom); this.heard.calls++;
        return;
      }
    }
  }

  // ---- the sounds ----
  /** A burst of filtered noise: a type of filter at a frequency (swept to f1 if given), shaped by an envelope. */
  private burst(type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, at: number, attack: number, hold: number, release: number): void {
    const ctx = this.ctx!, src = this.loop(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(f1, at + attack + hold + release);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + attack); g.gain.setValueAtTime(gain, at + attack + hold); g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    src.connect(f).connect(g).connect(this.master!); src.stop(at + attack + hold + release + 0.05);
  }
  /** A tone: a wave from f0 gliding to f1, shaped by an envelope. */
  private tone(type: OscillatorType, f0: number, f1: number, gain: number, at: number, attack: number, hold: number, release: number, out: AudioNode = this.master!): void {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + attack + hold + release);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + attack); g.gain.setValueAtTime(gain, at + attack + hold); g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    o.connect(g).connect(out); o.start(at); o.stop(at + attack + hold + release + 0.05);
  }
  /** Brakes going on: a hiss falling away and a faint squeal as it stops. */
  private brake(k: number): void {
    const t = this.ctx!.currentTime;
    this.burst('bandpass', 2600, 900, 1.2, 0.35 * k, t, 0.15, 0.6, 0.8);
    this.tone('sine', 2300, 1900, 0.025 * k, t + 0.7, 0.1, 0.35, 0.3);
    this.burst('lowpass', 300, 120, 0.7, 0.5 * k, t + 1.2, 0.02, 0.05, 0.35);   // the last jolt
  }
  /** Doors: the warning beeps and the doors sliding, after `delay` seconds. */
  private doors(k: number, delay: number): void {
    const t = this.ctx!.currentTime + delay;
    for (let b = 0; b < 3; b++) this.tone('square', 1320, 1320, 0.035 * k, t + b * 0.28, 0.01, 0.12, 0.05);
    this.burst('bandpass', 900, 500, 0.9, 0.18 * k, t + 0.9, 0.05, 0.25, 0.25);
  }
  /** Pulling out: the traction motors winding up under a swell of rumble. */
  private depart(k: number): void {
    const t = this.ctx!.currentTime + 1.2;
    this.tone('sawtooth', 70, 260, 0.035 * k, t, 0.6, 2.2, 1.4);
    this.tone('sine', 140, 520, 0.04 * k, t, 0.6, 2.2, 1.4);
    this.burst('lowpass', 140, 380, 0.7, 0.4 * k, t, 0.8, 2, 1.5);
  }
  /** The speakers: a three-note chime, then a murmur of words from the PA (a voice's shape, no words). */
  private chime(k: number): void {
    const ctx = this.ctx!, t = ctx.currentTime;
    [659.3, 523.3, 784].forEach((f, n) => { this.tone('sine', f, f, 0.12 * k, t + n * 0.42, 0.01, 0.05, 1.1); this.tone('sine', f * 2, f * 2, 0.025 * k, t + n * 0.42, 0.01, 0.03, 0.6); });
    // the voice: a buzzing source through two moving formants, a syllable at a time, through a speaker's narrow band
    const pa = ctx.createBiquadFilter(); pa.type = 'bandpass'; pa.frequency.value = 1100; pa.Q.value = 0.6;
    const out = ctx.createGain(); out.gain.value = 0.5 * k; pa.connect(out).connect(this.master!);
    const v0 = t + 1.6, o = ctx.createOscillator(), env = ctx.createGain(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    o.type = 'sawtooth'; f1.type = 'bandpass'; f1.Q.value = 5; f2.type = 'bandpass'; f2.Q.value = 7;
    env.gain.value = 0; o.connect(env); env.connect(f1).connect(pa); env.connect(f2).connect(pa);
    let at = v0;
    for (let n = 0; n < 16; n++) {
      const len = 0.12 + Math.random() * 0.14, gap = n % 5 === 4 ? 0.28 : 0.04; // cosmetic
      o.frequency.setValueAtTime(115 + Math.random() * 35 - n * 1.5, at); // cosmetic
      f1.frequency.setValueAtTime(380 + Math.random() * 500, at); f2.frequency.setValueAtTime(1100 + Math.random() * 1200, at); // cosmetic
      env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(0.5, at + 0.03); env.gain.linearRampToValueAtTime(0.35, at + len - 0.03); env.gain.linearRampToValueAtTime(0, at + len);
      at += len + gap;
    }
    o.start(v0); o.stop(at + 0.1);
  }
  /** A bird: a short trill of quick rising and falling chirps, high up. */
  private bird(k: number): void {
    const t = this.ctx!.currentTime, notes = 2 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 2400; // cosmetic
    for (let n = 0; n < notes; n++) {
      const f = base * (1 + (n % 2 ? 0.18 : 0)), at = t + n * (0.09 + Math.random() * 0.05); // cosmetic
      this.tone('sine', f, f * (n % 2 ? 0.8 : 1.25), 0.03 * k, at, 0.01, 0.03, 0.05);
    }
  }
}
