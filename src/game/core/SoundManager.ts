class SoundManager {
  private ctx: AudioContext | null = null;
  public enabled = true;
  public volume = 0.35;

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'square',
    gainMult = 1
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

      const peak = Math.min(1, this.volume * gainMult);
      gain.gain.setValueAtTime(peak, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // Ignore audio errors on restricted devices
    }
  }

  public playSwing(): void {
    this.playTone(260, 90, 0.11, 'triangle', 0.6);
  }

  public playHitWood(): void {
    this.playTone(180, 75, 0.09, 'square', 0.7);
  }

  public playHitStone(): void {
    this.playTone(520, 210, 0.08, 'sawtooth', 0.6);
  }

  public playHitEnemy(): void {
    this.playTone(320, 110, 0.12, 'sawtooth', 0.75);
  }

  public playPlayerHurt(): void {
    this.playTone(150, 55, 0.2, 'sawtooth', 0.9);
  }

  public playPickup(): void {
    this.playTone(440, 880, 0.09, 'sine', 0.5);
  }

  public playCraft(): void {
    this.playTone(330, 660, 0.15, 'triangle', 0.7);
    setTimeout(() => this.playTone(550, 880, 0.16, 'triangle', 0.7), 90);
  }

  public playTameSuccess(): void {
    this.playTone(440, 554, 0.12, 'sine', 0.7);
    setTimeout(() => this.playTone(554, 659, 0.12, 'sine', 0.7), 110);
    setTimeout(() => this.playTone(659, 880, 0.22, 'sine', 0.8), 220);
  }

  public playLevelUp(): void {
    const notes = [440, 554, 659, 880];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, n * 1.05, 0.16, 'triangle', 0.8), idx * 95);
    });
  }
}

export const soundManager = new SoundManager();
