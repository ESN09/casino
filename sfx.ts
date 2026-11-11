/**
 * Effets sonores synthétisés en Web Audio (aucun fichier audio à licencier).
 * L'interface `Sfx` est volontairement simple pour pouvoir brancher Howler.js
 * et de vrais échantillons plus tard.
 */
type Wave = OscillatorType;

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  private ac(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, opts: { type?: Wave; vol?: number; delay?: number; slide?: number } = {}) {
    const ctx = this.ac();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.5, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol = 0.3, delay = 0) {
    const ctx = this.ac();
    if (!ctx || !this.master) return;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800;
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(f).connect(g).connect(this.master);
    src.start(ctx.currentTime + delay);
  }

  click() { this.tone(660, 0.05, { type: 'triangle', vol: 0.25 }); }
  chip() { this.tone(1800, 0.04, { type: 'square', vol: 0.12 }); this.tone(2400, 0.05, { type: 'triangle', vol: 0.15, delay: 0.02 }); }
  card() { this.noise(0.07, 0.35); }
  tick() { this.tone(1200, 0.025, { type: 'square', vol: 0.08 }); }
  reelStart() { this.tone(180, 0.35, { type: 'sawtooth', vol: 0.12, slide: 2.2 }); }
  reelStop(i = 0) { this.tone(240 + i * 30, 0.08, { type: 'square', vol: 0.18 }); this.noise(0.04, 0.15); }
  lose() { this.tone(300, 0.25, { type: 'triangle', vol: 0.2, slide: 0.6 }); }
  win(big = false) {
    const notes = big ? [523, 659, 784, 1047, 1319, 1568] : [659, 784, 1047];
    notes.forEach((n, i) => this.tone(n, big ? 0.35 : 0.22, { type: 'triangle', vol: 0.35, delay: i * (big ? 0.09 : 0.07) }));
  }
  coin() { this.tone(1319, 0.08, { type: 'square', vol: 0.15 }); this.tone(1760, 0.18, { type: 'square', vol: 0.15, delay: 0.07 }); }
  reveal(rank: number) {
    const base = 330 * Math.pow(1.12, rank);
    [1, 1.25, 1.5, 2].forEach((m, i) => this.tone(base * m, 0.4, { type: rank >= 2 ? 'sawtooth' : 'triangle', vol: 0.18, delay: i * 0.08 }));
    if (rank >= 2) this.noise(0.6, 0.12, 0.25);
  }
}

export const sfx = new SfxEngine();
