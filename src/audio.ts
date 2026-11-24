/**
 * 100% Procedural Multi-Channel Web Audio Synthesizer
 * Generates ocean surf, wind rush, bicycle freehub ratchet clicks,
 * metallic brass bell, pelican squawk, jump whoosh, and fish-catch fanfare
 * with zero external audio files.
 */
export class CoastalAudioSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private surfFilter: BiquadFilterNode | null = null;
  private surfGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  public enabled = false;
  private clickAccum = 0;

  public toggle(): boolean {
    if (!this.ctx) {
      this.initContext();
      this.enabled = true;
      return true;
    }
    this.enabled = !this.enabled;
    if (this.ctx.state === 'suspended' && this.enabled) {
      void this.ctx.resume();
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.enabled ? 0.55 : 0.0, this.ctx.currentTime, 0.08);
    }
    return this.enabled;
  }

  public ensureStarted(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      this.initContext();
    } else if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private initContext(): void {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.55;
    this.masterGain.connect(this.ctx.destination);

    // Create 3-second looping pink-ish noise buffer for ocean surf & wind rush
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 3;
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + b3 + white * 0.1848) * 0.09;
      b3 = white * 0.115926;
    }

    // Channel 1: Ocean Surf Waves
    const surfSrc = this.ctx.createBufferSource();
    surfSrc.buffer = buffer;
    surfSrc.loop = true;
    this.surfFilter = this.ctx.createBiquadFilter();
    this.surfFilter.type = 'lowpass';
    this.surfFilter.frequency.value = 380;
    this.surfGain = this.ctx.createGain();
    this.surfGain.gain.value = 0.28;
    surfSrc.connect(this.surfFilter);
    this.surfFilter.connect(this.surfGain);
    this.surfGain.connect(this.masterGain);
    surfSrc.start();

    // Channel 2: Aerodynamic Wind Rush
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = buffer;
    windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 650;
    this.windFilter.Q.value = 1.4;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.02;
    windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    windSrc.start();
  }

  public update(dt: number, elapsed: number, speedMps: number, isCoasting: boolean): void {
    if (!this.enabled || !this.ctx || !this.surfFilter || !this.surfGain || !this.windFilter || !this.windGain) {
      return;
    }
    const now = this.ctx.currentTime;

    // Gentle 8-second coastal wave swell
    const waveSwell = 0.5 + 0.5 * Math.sin(elapsed * 0.78);
    this.surfFilter.frequency.setTargetAtTime(240 + waveSwell * 380, now, 0.1);
    this.surfGain.gain.setTargetAtTime(0.16 + waveSwell * 0.20, now, 0.1);

    // Speed-reactive wind whistle
    const normSpeed = Math.min(1.5, speedMps / 10);
    this.windFilter.frequency.setTargetAtTime(420 + normSpeed * 950, now, 0.08);
    this.windGain.gain.setTargetAtTime(0.02 + normSpeed * 0.18, now, 0.08);

    // Mechanical bicycle freehub clicks / soft chain ticks synced to wheel rotation
    const clickRate = speedMps * (isCoasting ? 3.8 : 1.6);
    this.clickAccum += dt * clickRate;
    if (this.clickAccum >= 1.0) {
      this.clickAccum %= 1.0;
      this.triggerChainTick(isCoasting ? 0.075 : 0.028, isCoasting ? 2600 : 1450);
    }
  }

  private triggerChainTick(volume: number, freq: number): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.018);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.02);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.024);
  }

  /** Classic dual-strike metallic brass bicycle bell ("ching-ring!") */
  public playBell(): void {
    if (!this.enabled) return;
    this.ensureStarted();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const strikes = [0, 0.075];
    const partials = [1568, 3136, 4680]; // Crisp brass inharmonic bell partials

    for (const offset of strikes) {
      for (let i = 0; i < partials.length; i++) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(partials[i] * (offset > 0 ? 1.015 : 1.0), now + offset);
        const amp = (0.22 / (i + 1)) * (offset > 0 ? 1.15 : 0.85);
        g.gain.setValueAtTime(amp, now + offset);
        g.gain.exponentialRampToValueAtTime(0.0005, now + offset + 1.15 - i * 0.25);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(now + offset);
        osc.stop(now + offset + 1.2);
      }
    }
  }

  /** Expressive comical nasal pelican honk / squawk */
  public playSquawk(): void {
    if (!this.enabled) return;
    this.ensureStarted();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const formant = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(310, now);
    osc.frequency.linearRampToValueAtTime(430, now + 0.06);
    osc.frequency.exponentialRampToValueAtTime(195, now + 0.28);

    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(920, now);
    formant.Q.value = 3.8;

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.32, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.30);

    osc.connect(formant);
    formant.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  /** Cheerful marimba + water gulp chime when catching a jumping silver sardine! */
  public playCatchFish(): void {
    if (!this.enabled) return;
    this.ensureStarted();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 - E5 - G5 - C6 major arpeggio
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.055;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.20, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.30);
    });
  }

  /** Elastic bunny-hop spring sound */
  public playJump(): void {
    if (!this.enabled) return;
    this.ensureStarted();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.18);
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.24);
  }
}
