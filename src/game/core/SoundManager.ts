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
  private isMuffledByUi = false;

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
  private musicFilter: BiquadFilterNode | null = null;
  private musicEchoDelay: DelayNode | null = null;
  private musicEchoFeedback: GainNode | null = null;
  private musicEchoWet: GainNode | null = null;

  private fadeStopTimer: number | null = null;
  private fadingOutSource: AudioBufferSourceNode | null = null;

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

  private ensureMusicAudioGraph(ctx: AudioContext): void {
    if (this.musicGain && this.musicFilter && this.musicEchoDelay && this.musicEchoFeedback && this.musicEchoWet) {
      return;
    }

    this.musicGain = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.setValueAtTime(this.isMuffledByUi ? 620 : 7500, ctx.currentTime);
    this.musicFilter.Q.setValueAtTime(0.85, ctx.currentTime);

    this.musicEchoDelay = ctx.createDelay(1.0);
    this.musicEchoDelay.delayTime.setValueAtTime(0.175, ctx.currentTime);

    this.musicEchoFeedback = ctx.createGain();
    this.musicEchoFeedback.gain.setValueAtTime(0.36, ctx.currentTime);

    this.musicEchoWet = ctx.createGain();
    this.musicEchoWet.gain.setValueAtTime(this.isMuffledByUi ? 0.42 : 0.0, ctx.currentTime);

    // Dry path: Filter -> Master Music Gain -> Destination
    this.musicFilter.connect(this.musicGain);

    // Muffled Echo path: Filter -> Delay -> Wet Gain -> Master Music Gain, with Delay <-> Feedback loop
    this.musicFilter.connect(this.musicEchoDelay);
    this.musicEchoDelay.connect(this.musicEchoFeedback);
    this.musicEchoFeedback.connect(this.musicEchoDelay);
    this.musicEchoDelay.connect(this.musicEchoWet);
    this.musicEchoWet.connect(this.musicGain);

    this.musicGain.connect(ctx.destination);
  }

  private getTargetMusicGain(): number {
    const base = Math.max(0, Math.min(1, this.musicVolume));
    return this.isMuffledByUi ? base * 0.5 : base;
  }

  private clearPendingFadeStop(): void {
    if (this.fadeStopTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.fadeStopTimer);
      this.fadeStopTimer = null;
    }
    if (this.fadingOutSource) {
      try {
        this.fadingOutSource.stop();
      } catch {
        // ignore
      }
      try {
        this.fadingOutSource.disconnect();
      } catch {
        // ignore
      }
      this.fadingOutSource = null;
    }
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

  private stopCurrentSourceNode(saveOffset: boolean, withFadeOut = true): void {
    if (!this.musicSource) return;

    if (saveOffset && this.activeTrack !== 'none' && this.ctx) {
      const buf = this.decodedBuffers[this.activeTrack];
      if (buf && buf.duration > 0) {
        const elapsed = Math.max(0, this.ctx.currentTime - this.sourceStartCtxTime);
        this.trackOffsets[this.activeTrack] =
          (this.sourceStartOffset + elapsed) % buf.duration;
      }
    }

    const sourceToStop = this.musicSource;
    this.musicSource = null;

    this.clearPendingFadeStop();

    if (withFadeOut && this.ctx && this.musicGain && this.ctx.state === 'running') {
      const now = this.ctx.currentTime;
      const fadeDuration = 0.55;
      try {
        const currentVal = Math.max(0.0001, this.musicGain.gain.value);
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setValueAtTime(currentVal, now);
        this.musicGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);
        this.fadingOutSource = sourceToStop;
        if (typeof window !== 'undefined') {
          this.fadeStopTimer = window.setTimeout(() => {
            this.fadeStopTimer = null;
            if (this.fadingOutSource === sourceToStop) {
              this.fadingOutSource = null;
            }
            try {
              sourceToStop.stop();
            } catch {
              // ignore
            }
            try {
              sourceToStop.disconnect();
            } catch {
              // ignore
            }
          }, Math.round(fadeDuration * 1000) + 30);
        }
        return;
      } catch {
        // fallback to immediate stop
      }
    }

    try {
      sourceToStop.stop();
    } catch {
      // ignore if already stopped
    }
    try {
      sourceToStop.disconnect();
    } catch {
      // ignore
    }
  }

  public setMusicVolume(vol: number): void {
    this.musicVolume = Math.max(0, Math.min(1, Number.isFinite(vol) ? vol : 0.2));
    if (this.musicGain && this.ctx && this.musicSource) {
      const now = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
      this.musicGain.gain.linearRampToValueAtTime(this.getTargetMusicGain(), now + 0.25);
    }
    this.syncMusicPlayback();
  }

  public setMusicPaused(paused: boolean): void {
    const nextPaused = Boolean(paused);
    if (this.isPausedByGame === nextPaused) return;
    this.isPausedByGame = nextPaused;
    this.syncMusicPlayback();
  }

  public setMusicMuffled(muffled: boolean): void {
    const nextMuffled = Boolean(muffled);
    if (this.isMuffledByUi === nextMuffled) return;
    this.isMuffledByUi = nextMuffled;

    if (this.ctx && this.musicGain && this.musicFilter && this.musicEchoWet) {
      const now = this.ctx.currentTime;
      const rampSec = 0.38;
      const targetGain = this.getTargetMusicGain();
      const targetFreq = this.isMuffledByUi ? 620 : 7500;
      const targetWet = this.isMuffledByUi ? 0.42 : 0.0;

      try {
        if (this.musicSource) {
          this.musicGain.gain.cancelScheduledValues(now);
          this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
          this.musicGain.gain.linearRampToValueAtTime(targetGain, now + rampSec);
        }

        this.musicFilter.frequency.cancelScheduledValues(now);
        this.musicFilter.frequency.setValueAtTime(this.musicFilter.frequency.value, now);
        this.musicFilter.frequency.linearRampToValueAtTime(targetFreq, now + rampSec);

        this.musicEchoWet.gain.cancelScheduledValues(now);
        this.musicEchoWet.gain.setValueAtTime(this.musicEchoWet.gain.value, now);
        this.musicEchoWet.gain.linearRampToValueAtTime(targetWet, now + rampSec);
      } catch {
        // ignore
      }
    }
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
    this.stopCurrentSourceNode(false, true);
    this.desiredTrack = 'none';
    this.activeTrack = 'none';
    this.isPausedByGame = false;
    this.isMuffledByUi = false;
    this.trackOffsets.day = 0;
    this.trackOffsets.night = 0;
  }

  private syncMusicPlayback(): void {
    this.bindLifecycleListeners();

    const baseVolume = Math.max(0, Math.min(1, this.musicVolume));
    const targetVolume = this.getTargetMusicGain();
    const isDocumentHidden =
      typeof document !== 'undefined' && Boolean(document.hidden);

    // If paused, hidden, muted, or no track desired, fade out active source and preserve offset
    if (
      this.desiredTrack === 'none' ||
      this.isPausedByGame ||
      isDocumentHidden ||
      baseVolume <= 0.001
    ) {
      this.stopCurrentSourceNode(true, !isDocumentHidden);
      return;
    }

    const targetTrack = this.desiredTrack;

    // If switching between Day and Night, fade out previous track and reset its offset
    if (this.activeTrack !== 'none' && this.activeTrack !== targetTrack) {
      const prevTrack = this.activeTrack;
      this.stopCurrentSourceNode(false, false);
      this.trackOffsets[prevTrack] = 0;
      this.activeTrack = 'none';
    }

    // Already playing the desired track
    if (this.musicSource && this.activeTrack === targetTrack) {
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
      this.clearPendingFadeStop();
      this.ensureMusicAudioGraph(ctx);
      if (!this.musicGain || !this.musicFilter || !this.musicEchoWet) return;

      const now = ctx.currentTime;
      const fadeInDuration = 1.25;

      this.musicFilter.frequency.cancelScheduledValues(now);
      this.musicFilter.frequency.setValueAtTime(this.isMuffledByUi ? 620 : 7500, now);
      this.musicEchoWet.gain.cancelScheduledValues(now);
      this.musicEchoWet.gain.setValueAtTime(this.isMuffledByUi ? 0.42 : 0.0, now);

      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(0.0001, now);
      this.musicGain.gain.linearRampToValueAtTime(targetVolume, now + fadeInDuration);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.musicFilter);

      const offset =
        buffer.duration > 0 ? this.trackOffsets[targetTrack] % buffer.duration : 0;
      this.sourceStartCtxTime = now;
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
