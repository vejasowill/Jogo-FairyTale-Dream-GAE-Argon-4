const DAY_MUSIC_URL = '/assets/aistudio/MusicaAmbienteDiaCerta_465ee93d.mp3';
const NIGHT_MUSIC_URL = '/assets/aistudio/MusicaAmbienteNoite_7c38e5a2.mp3';

type MusicTrack = 'day' | 'night';

class SoundManager {
  private ctx: AudioContext | null = null;
  public enabled = true;
  public volume = 0.35;
  public musicVolume = 0.2;

  private desiredTrack: MusicTrack | 'none' = 'none';
  private activeTrack: MusicTrack | 'none' = 'none';
  private isPausedByGame = false;

  // Lightweight cached compressed bytes (~515KB each) and single active decoded AudioBuffer
  private rawTrackBytes: Record<MusicTrack, ArrayBuffer | null> = {
    day: null,
    night: null,
  };
  private decodedBuffers: Record<MusicTrack, AudioBuffer | null> = {
    day: null,
    night: null,
  };
  private loadingTracks: Record<MusicTrack, Promise<AudioBuffer | null> | null> = {
    day: null,
    night: null,
  };

  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private trackOffsets: Record<MusicTrack, number> = {
    day: 0,
    night: 0,
  };
  private sourceStartCtxTime = 0;
  private sourceStartOffset = 0;
  private unlockListenersBound = false;

  private bindLifecycleListeners(): void {
    if (this.unlockListenersBound || typeof window === 'undefined') return;
    this.unlockListenersBound = true;

    const clearMediaSession = () => {
      try {
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && navigator.mediaSession) {
          navigator.mediaSession.metadata = null;
          navigator.mediaSession.playbackState = 'none';
        }
      } catch {
        // ignore
      }
    };
    clearMediaSession();

    const resumeOnInteraction = () => {
      clearMediaSession();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          this.syncMusicPlayback();
        }).catch(() => {});
      } else if (this.desiredTrack !== 'none' && !this.isPausedByGame && !this.musicSource) {
        this.syncMusicPlayback();
      }
    };

    window.addEventListener('pointerdown', resumeOnInteraction, { passive: true });
    window.addEventListener('keydown', resumeOnInteraction, { passive: true });
    window.addEventListener('touchstart', resumeOnInteraction, { passive: true });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.syncMusicPlayback();
      });
    }
  }

  private getAudioContext(allowCreateWhenSfxDisabled = false): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.enabled && !allowCreateWhenSfxDisabled) return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          // 16kHz playback context reduces decoded AudioBuffer RAM and CPU by 3x on mobile
          this.ctx = new AudioCtx({ sampleRate: 16000, latencyHint: 'playback' });
        } catch {
          this.ctx = new AudioCtx();
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private async loadAndDecodeTrack(track: MusicTrack): Promise<AudioBuffer | null> {
    if (this.decodedBuffers[track]) {
      return this.decodedBuffers[track];
    }
    if (this.loadingTracks[track]) {
      return this.loadingTracks[track];
    }

    const promise = (async (): Promise<AudioBuffer | null> => {
      try {
        const ctx = this.getAudioContext(true);
        if (!ctx) return null;

        if (!this.rawTrackBytes[track]) {
          const url = track === 'night' ? NIGHT_MUSIC_URL : DAY_MUSIC_URL;
          const res = await fetch(url);
          if (!res.ok) return null;
          this.rawTrackBytes[track] = await res.arrayBuffer();
        }

        const raw = this.rawTrackBytes[track];
        if (!raw) return null;

        // Free the opposite track's decoded AudioBuffer to keep mobile memory footprint low
        const opposite: MusicTrack = track === 'day' ? 'night' : 'day';
        this.decodedBuffers[opposite] = null;

        const bufferCopy = raw.slice(0);
        const decoded = await ctx.decodeAudioData(bufferCopy);
        this.decodedBuffers[track] = decoded;
        return decoded;
      } catch {
        return null;
      } finally {
        this.loadingTracks[track] = null;
      }
    })();

    this.loadingTracks[track] = promise;
    return promise;
  }

  private stopCurrentSourceNode(saveOffset: boolean): void {
    if (!this.musicSource) return;

    if (saveOffset && this.activeTrack !== 'none' && this.ctx) {
      const buf = this.decodedBuffers[this.activeTrack];
      if (buf && buf.duration > 0) {
        const elapsed = Math.max(0, this.ctx.currentTime - this.sourceStartCtxTime);
        this.trackOffsets[this.activeTrack] =
          (this.sourceStartOffset + elapsed) % buf.duration;
      }
    }

    try {
      this.musicSource.stop();
    } catch {
      // ignore if already stopped
    }
    try {
      this.musicSource.disconnect();
    } catch {
      // ignore
    }
    this.musicSource = null;
  }

  public setMusicVolume(vol: number): void {
    this.musicVolume = Math.max(0, Math.min(1, Number.isFinite(vol) ? vol : 0.2));
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
    }
    this.syncMusicPlayback();
  }

  public setMusicPaused(paused: boolean): void {
    const nextPaused = Boolean(paused);
    if (this.isPausedByGame === nextPaused) return;
    this.isPausedByGame = nextPaused;
    this.syncMusicPlayback();
  }

  public updateAmbientMusic(isNight: boolean): void {
    const nextTrack: MusicTrack = isNight ? 'night' : 'day';
    if (this.desiredTrack !== nextTrack) {
      this.desiredTrack = nextTrack;
      this.syncMusicPlayback();
    } else if (!this.isPausedByGame && !this.musicSource) {
      this.syncMusicPlayback();
    }
  }

  public stopAmbientMusic(): void {
    this.stopCurrentSourceNode(false);
    this.desiredTrack = 'none';
    this.activeTrack = 'none';
    this.isPausedByGame = false;
    this.trackOffsets.day = 0;
    this.trackOffsets.night = 0;
  }

  private syncMusicPlayback(): void {
    this.bindLifecycleListeners();

    const effectiveVolume = Math.max(0, Math.min(1, this.musicVolume));
    const isDocumentHidden =
      typeof document !== 'undefined' && Boolean(document.hidden);

    // If paused, hidden, muted, or no track desired, stop active source and preserve offset
    if (
      this.desiredTrack === 'none' ||
      this.isPausedByGame ||
      isDocumentHidden ||
      effectiveVolume <= 0.001
    ) {
      this.stopCurrentSourceNode(true);
      return;
    }

    const targetTrack = this.desiredTrack;

    // If switching between Day and Night, stop previous track and reset its offset
    if (this.activeTrack !== 'none' && this.activeTrack !== targetTrack) {
      const prevTrack = this.activeTrack;
      this.stopCurrentSourceNode(false);
      this.trackOffsets[prevTrack] = 0;
      this.activeTrack = 'none';
    }

    // Already playing the desired track
    if (this.musicSource && this.activeTrack === targetTrack) {
      if (this.musicGain && this.ctx) {
        this.musicGain.gain.setValueAtTime(effectiveVolume, this.ctx.currentTime);
      }
      return;
    }

    const ctx = this.getAudioContext(true);
    if (!ctx) return;

    const buffer = this.decodedBuffers[targetTrack];
    if (!buffer) {
      void this.loadAndDecodeTrack(targetTrack).then((decoded) => {
        if (decoded && this.desiredTrack === targetTrack && !this.isPausedByGame) {
          this.syncMusicPlayback();
        }
      });
      return;
    }

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      if (ctx.state === 'suspended') {
        return;
      }
    }

    try {
      if (!this.musicGain) {
        this.musicGain = ctx.createGain();
        this.musicGain.connect(ctx.destination);
      }
      this.musicGain.gain.setValueAtTime(effectiveVolume, ctx.currentTime);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.musicGain);

      const offset =
        buffer.duration > 0 ? this.trackOffsets[targetTrack] % buffer.duration : 0;
      this.sourceStartCtxTime = ctx.currentTime;
      this.sourceStartOffset = offset;
      source.start(0, offset);

      this.musicSource = source;
      this.activeTrack = targetTrack;
    } catch {
      // Autoplay or context restriction; interaction listener will retry
    }
  }

  private getContext(): AudioContext | null {
    return this.getAudioContext(false);
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
