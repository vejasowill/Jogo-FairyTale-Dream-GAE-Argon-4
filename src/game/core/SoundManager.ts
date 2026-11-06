const DAY_MUSIC_URL = '/assets/aistudio/MusicaAmbienteDiaCerta_465ee93d.mp3';
const NIGHT_MUSIC_URL = '/assets/aistudio/MusicaAmbienteNoite_7c38e5a2.mp3';
const RAIN_AUDIO_URL = '/assets/aistudio/rain_at_grass__1-1793984360380_bfddafa6.mp3';

type MusicTrack = 'day' | 'night';

class SoundManager {
  private ctx: AudioContext | null = null;
  public enabled = true;
  public volume = 0.35;
  public ambientVolume = 0.45;
  public musicVolume = 0.2;

  private desiredTrack: MusicTrack | 'none' = 'none';
  private activeTrack: MusicTrack | 'none' = 'none';
  private isPausedByGame = false;
  private isMuffledByUi = false;

  // Rain ambience audio loop state
  private rawRainBytes: ArrayBuffer | null = null;
  private decodedRainBuffer: AudioBuffer | null = null;
  private loadingRainPromise: Promise<AudioBuffer | null> | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private currentRainIntensity = 0;
  private isRainInsideStructure = false;

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

  private static readonly MUSIC_FADE_IN_SEC = 3.0;
  private static readonly MUSIC_FADE_OUT_SEC = 10.0;

  private musicSource: AudioBufferSourceNode | null = null;
  private musicSourceGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private musicEchoDelay: DelayNode | null = null;
  private musicEchoFeedback: GainNode | null = null;
  private musicEchoWet: GainNode | null = null;

  private isFadingOut = false;
  private fadeOutTimer: number | null = null;

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
          this.syncRainPlayback();
        }).catch(() => {});
      } else {
        if (this.desiredTrack !== 'none' && !this.isPausedByGame && !this.musicSource) {
          this.syncMusicPlayback();
        }
        if (this.currentRainIntensity > 0.01 && !this.isPausedByGame && !this.rainSource) {
          this.syncRainPlayback();
        }
      }
    };

    window.addEventListener('pointerdown', resumeOnInteraction, { passive: true });
    window.addEventListener('keydown', resumeOnInteraction, { passive: true });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.syncMusicPlayback();
        this.syncRainPlayback();
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
    this.musicGain.gain.setValueAtTime(this.getTargetMusicGain(), ctx.currentTime);

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

  private clearFadeOutTimer(): void {
    if (this.fadeOutTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.fadeOutTimer);
      this.fadeOutTimer = null;
    }
    this.isFadingOut = false;
  }

  private stopCurrentSourceNodeImmediate(saveOffset: boolean): void {
    this.clearFadeOutTimer();
    if (!this.musicSource) {
      this.musicSourceGain = null;
      this.activeTrack = 'none';
      return;
    }

    if (saveOffset && this.activeTrack !== 'none' && this.ctx) {
      const buf = this.decodedBuffers[this.activeTrack];
      if (buf && buf.duration > 0) {
        const elapsed = Math.max(0, this.ctx.currentTime - this.sourceStartCtxTime);
        this.trackOffsets[this.activeTrack] =
          (this.sourceStartOffset + elapsed) % buf.duration;
      }
    }

    const sourceToStop = this.musicSource;
    const gainToStop = this.musicSourceGain;
    this.musicSource = null;
    this.musicSourceGain = null;
    this.activeTrack = 'none';

    try {
      sourceToStop.onended = null;
      sourceToStop.stop();
    } catch {
      // ignore if already stopped
    }
    try {
      sourceToStop.disconnect();
    } catch {
      // ignore
    }
    if (gainToStop) {
      try {
        gainToStop.disconnect();
      } catch {
        // ignore
      }
    }
  }

  private beginProgressiveFadeOut(saveOffset: boolean): void {
    if (!this.musicSource || !this.musicSourceGain || !this.ctx || this.ctx.state !== 'running') {
      this.stopCurrentSourceNodeImmediate(saveOffset);
      return;
    }
    if (this.isFadingOut) return;

    this.isFadingOut = true;
    const now = this.ctx.currentTime;
    const fadeDuration = SoundManager.MUSIC_FADE_OUT_SEC;

    try {
      const currentVal = Math.max(0.0001, this.musicSourceGain.gain.value);
      this.musicSourceGain.gain.cancelScheduledValues(now);
      this.musicSourceGain.gain.setValueAtTime(currentVal, now);
      this.musicSourceGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);

      if (typeof window !== 'undefined') {
        this.fadeOutTimer = window.setTimeout(() => {
          this.fadeOutTimer = null;
          this.isFadingOut = false;
          const prevTrack = this.activeTrack;
          this.stopCurrentSourceNodeImmediate(saveOffset);
          if (!saveOffset && prevTrack !== 'none') {
            this.trackOffsets[prevTrack] = 0;
          }
          this.syncMusicPlayback();
        }, Math.round(fadeDuration * 1000) + 60);
      }
    } catch {
      this.stopCurrentSourceNodeImmediate(saveOffset);
    }
  }

  public setMusicVolume(vol: number): void {
    this.musicVolume = Math.max(0, Math.min(1, Number.isFinite(vol) ? vol : 0.2));
    if (this.musicGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
      this.musicGain.gain.linearRampToValueAtTime(this.getTargetMusicGain(), now + 0.25);
    }
    this.syncMusicPlayback();
  }

  public setAmbientVolume(vol: number): void {
    this.ambientVolume = Math.max(0, Math.min(1, Number.isFinite(vol) ? vol : 0.45));
    if (this.rainGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.rainGain.gain.cancelScheduledValues(now);
      this.rainGain.gain.setValueAtTime(this.rainGain.gain.value, now);
      this.rainGain.gain.linearRampToValueAtTime(this.getTargetRainGain(), now + 0.2);
    }
    this.syncRainPlayback();
  }

  private getTargetRainGain(): number {
    if (!this.enabled || this.isPausedByGame) return 0;
    const base = Math.max(0, Math.min(1, this.ambientVolume));
    const intensity = Math.max(0, Math.min(1, this.currentRainIntensity));
    const uiFactor = this.isMuffledByUi ? 0.55 : 1.0;
    const indoorFactor = this.isRainInsideStructure ? 0.68 : 1.0;
    return base * uiFactor * indoorFactor * intensity;
  }

  private getTargetRainCutoffHz(): number {
    if (this.isRainInsideStructure) {
      return this.isMuffledByUi ? 310 : 390;
    }
    return this.isMuffledByUi ? 1150 : 8400;
  }

  private getTargetRainFilterQ(): number {
    return this.isRainInsideStructure ? 1.35 : 0.7;
  }

  private async loadAndDecodeRainBuffer(): Promise<AudioBuffer | null> {
    if (this.decodedRainBuffer) {
      return this.decodedRainBuffer;
    }
    if (this.loadingRainPromise) {
      return this.loadingRainPromise;
    }

    const promise = (async (): Promise<AudioBuffer | null> => {
      try {
        const ctx = this.getAudioContext(true);
        if (!ctx) return null;

        if (!this.rawRainBytes) {
          const res = await fetch(RAIN_AUDIO_URL);
          if (!res.ok) return null;
          this.rawRainBytes = await res.arrayBuffer();
        }
        if (!this.rawRainBytes) return null;

        const copy = this.rawRainBytes.slice(0);
        const decoded = await ctx.decodeAudioData(copy);
        this.decodedRainBuffer = decoded;
        return decoded;
      } catch {
        return null;
      } finally {
        this.loadingRainPromise = null;
      }
    })();

    this.loadingRainPromise = promise;
    return promise;
  }

  private stopRainSourceImmediate(): void {
    if (!this.rainSource) return;
    const src = this.rainSource;
    this.rainSource = null;
    try {
      src.onended = null;
      src.stop();
    } catch {
      // ignore
    }
    try {
      src.disconnect();
    } catch {
      // ignore
    }
  }

  public updateRainAmbience(
    rainIntensity: number,
    isInsideStructure = false
  ): void {
    const clamped = Math.max(
      0,
      Math.min(1, Number.isFinite(rainIntensity) ? rainIntensity : 0)
    );
    const prev = this.currentRainIntensity;
    const prevIndoor = this.isRainInsideStructure;
    this.currentRainIntensity = clamped;
    this.isRainInsideStructure = Boolean(isInsideStructure);

    if (this.rainGain && this.ctx && this.rainSource) {
      const now = this.ctx.currentTime;
      const target = this.getTargetRainGain();
      try {
        this.rainGain.gain.cancelScheduledValues(now);
        this.rainGain.gain.setValueAtTime(this.rainGain.gain.value, now);
        this.rainGain.gain.linearRampToValueAtTime(target, now + 0.18);
        if (this.rainFilter && prevIndoor !== this.isRainInsideStructure) {
          this.rainFilter.frequency.cancelScheduledValues(now);
          this.rainFilter.frequency.setValueAtTime(
            this.rainFilter.frequency.value,
            now
          );
          this.rainFilter.frequency.linearRampToValueAtTime(
            this.getTargetRainCutoffHz(),
            now + 0.28
          );
          this.rainFilter.Q.cancelScheduledValues(now);
          this.rainFilter.Q.setValueAtTime(this.rainFilter.Q.value, now);
          this.rainFilter.Q.linearRampToValueAtTime(
            this.getTargetRainFilterQ(),
            now + 0.28
          );
        }
      } catch {
        // ignore
      }
    }

    if (
      (clamped > 0.008 && !this.rainSource) ||
      (clamped <= 0.004 && this.rainSource) ||
      Math.abs(clamped - prev) > 0.05 ||
      prevIndoor !== this.isRainInsideStructure
    ) {
      this.syncRainPlayback();
    }
  }

  private syncRainPlayback(): void {
    this.bindLifecycleListeners();
    const isDocumentHidden =
      typeof document !== 'undefined' && Boolean(document.hidden);
    const targetGain = this.getTargetRainGain();
    const targetCutoff = this.getTargetRainCutoffHz();
    const targetQ = this.getTargetRainFilterQ();

    if (
      !this.enabled ||
      this.isPausedByGame ||
      isDocumentHidden ||
      this.ambientVolume <= 0.001 ||
      this.currentRainIntensity <= 0.004
    ) {
      this.stopRainSourceImmediate();
      return;
    }

    if (this.rainSource && this.rainGain && this.ctx) {
      const now = this.ctx.currentTime;
      try {
        this.rainGain.gain.cancelScheduledValues(now);
        this.rainGain.gain.setValueAtTime(this.rainGain.gain.value, now);
        this.rainGain.gain.linearRampToValueAtTime(targetGain, now + 0.2);
        if (this.rainFilter) {
          this.rainFilter.frequency.cancelScheduledValues(now);
          this.rainFilter.frequency.setValueAtTime(
            this.rainFilter.frequency.value,
            now
          );
          this.rainFilter.frequency.linearRampToValueAtTime(
            targetCutoff,
            now + 0.25
          );
          this.rainFilter.Q.cancelScheduledValues(now);
          this.rainFilter.Q.setValueAtTime(this.rainFilter.Q.value, now);
          this.rainFilter.Q.linearRampToValueAtTime(targetQ, now + 0.25);
        }
      } catch {
        // ignore
      }
      return;
    }

    const ctx = this.getAudioContext(true);
    if (!ctx) return;

    const buffer = this.decodedRainBuffer;
    if (!buffer) {
      void this.loadAndDecodeRainBuffer().then((decoded) => {
        if (decoded && this.currentRainIntensity > 0.004 && !this.isPausedByGame) {
          this.syncRainPlayback();
        }
      });
      return;
    }

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      if (ctx.state === 'suspended') return;
    }

    try {
      this.stopRainSourceImmediate();
      const now = ctx.currentTime;

      if (!this.rainGain) {
        this.rainGain = ctx.createGain();
        this.rainGain.connect(ctx.destination);
      }
      if (!this.rainFilter) {
        this.rainFilter = ctx.createBiquadFilter();
        this.rainFilter.type = 'lowpass';
        this.rainFilter.frequency.setValueAtTime(targetCutoff, now);
        this.rainFilter.Q.setValueAtTime(targetQ, now);
        this.rainFilter.connect(this.rainGain);
      } else {
        this.rainFilter.frequency.setValueAtTime(targetCutoff, now);
        this.rainFilter.Q.setValueAtTime(targetQ, now);
      }

      this.rainGain.gain.cancelScheduledValues(now);
      this.rainGain.gain.setValueAtTime(0.0001, now);
      this.rainGain.gain.linearRampToValueAtTime(targetGain, now + 0.65);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(this.rainFilter);
      src.start(0);
      this.rainSource = src;
    } catch {
      // ignore autoplay restriction until user interaction
    }
  }

  public setMusicPaused(paused: boolean): void {
    const nextPaused = Boolean(paused);
    if (this.isPausedByGame === nextPaused) return;
    this.isPausedByGame = nextPaused;
    this.syncMusicPlayback();
    this.syncRainPlayback();
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
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
        this.musicGain.gain.linearRampToValueAtTime(targetGain, now + rampSec);

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
    this.syncRainPlayback();
  }

  public updateAmbientMusic(isNight: boolean): void {
    const nextTrack: MusicTrack = isNight ? 'night' : 'day';
    if (this.desiredTrack !== nextTrack) {
      this.desiredTrack = nextTrack;
      this.syncMusicPlayback();
    } else if (
      !this.isPausedByGame &&
      !this.musicSource &&
      !this.loadingTracks[nextTrack] &&
      (!this.ctx || this.ctx.state === 'running') &&
      this.musicVolume > 0.001
    ) {
      this.syncMusicPlayback();
    }
  }

  public stopAmbientMusic(): void {
    this.stopCurrentSourceNodeImmediate(false);
    this.stopRainSourceImmediate();
    this.currentRainIntensity = 0;
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

    // If paused, hidden, muted, or no track desired, stop active source and preserve offset
    if (
      this.desiredTrack === 'none' ||
      this.isPausedByGame ||
      isDocumentHidden ||
      baseVolume <= 0.001
    ) {
      this.stopCurrentSourceNodeImmediate(this.desiredTrack !== 'none');
      return;
    }

    const targetTrack = this.desiredTrack;

    // Already on the desired track: if it was mid-fade-out, cancel fade-out and ramp back in on the SAME source node
    if (this.musicSource && this.activeTrack === targetTrack) {
      if (this.isFadingOut && this.musicSourceGain && this.ctx) {
        this.clearFadeOutTimer();
        const now = this.ctx.currentTime;
        const currentVal = Math.max(0.0001, this.musicSourceGain.gain.value);
        this.musicSourceGain.gain.cancelScheduledValues(now);
        this.musicSourceGain.gain.setValueAtTime(currentVal, now);
        this.musicSourceGain.gain.linearRampToValueAtTime(
          1.0,
          now + SoundManager.MUSIC_FADE_IN_SEC
        );
      }
      return;
    }

    // If switching between Day and Night while a track is playing, progressively fade out (10s) the current track first
    // before starting the new track so two AudioBufferSourceNodes NEVER play at the same time!
    if (this.musicSource && this.activeTrack !== 'none' && this.activeTrack !== targetTrack) {
      // Preload next track while current track fades out
      void this.loadAndDecodeTrack(targetTrack);
      this.beginProgressiveFadeOut(false);
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
      this.ensureMusicAudioGraph(ctx);
      if (!this.musicGain || !this.musicFilter || !this.musicEchoWet) return;

      // Defensive cleanup to guarantee only a single source ever exists
      this.stopCurrentSourceNodeImmediate(false);

      const now = ctx.currentTime;
      const fadeInDuration = SoundManager.MUSIC_FADE_IN_SEC;

      this.musicFilter.frequency.cancelScheduledValues(now);
      this.musicFilter.frequency.setValueAtTime(this.isMuffledByUi ? 620 : 7500, now);
      this.musicEchoWet.gain.cancelScheduledValues(now);
      this.musicEchoWet.gain.setValueAtTime(this.isMuffledByUi ? 0.42 : 0.0, now);

      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(targetVolume, now);

      const sourceGain = ctx.createGain();
      sourceGain.gain.setValueAtTime(0.0001, now);
      sourceGain.gain.linearRampToValueAtTime(1.0, now + fadeInDuration);
      sourceGain.connect(this.musicFilter);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(sourceGain);

      const offset =
        buffer.duration > 0 ? this.trackOffsets[targetTrack] % buffer.duration : 0;
      this.sourceStartCtxTime = now;
      this.sourceStartOffset = offset;
      source.start(0, offset);

      this.musicSource = source;
      this.musicSourceGain = sourceGain;
      this.activeTrack = targetTrack;
    } catch {
      // Autoplay or context restriction; interaction listener will retry
    }
  }

  private listenerX = 0;
  private listenerY = 0;
  private hasListenerPos = false;

  public setListenerPosition(x: number, y: number): void {
    this.listenerX = x;
    this.listenerY = y;
    this.hasListenerPos = true;
  }

  /**
   * Computes a smooth proximity volume factor [0..1] based on the distance from the local player listener
   * to the world position `(worldX, worldY)` where the sound effect originated.
   * Sounds within 56px play at 100% volume; sounds fade out smoothly with distance up to `maxDist` (default 540px),
   * and beyond `maxDist` are completely silent (0).
   */
  public getDistanceGain(
    worldX?: number,
    worldY?: number,
    maxDist = 540
  ): number {
    if (
      !this.hasListenerPos ||
      worldX === undefined ||
      worldY === undefined ||
      !Number.isFinite(worldX) ||
      !Number.isFinite(worldY)
    ) {
      return 1.0;
    }
    const dist = Math.hypot(worldX - this.listenerX, worldY - this.listenerY);
    if (dist >= maxDist) return 0;
    const fullVolRadius = 56;
    if (dist <= fullVolRadius) return 1.0;
    const t = 1 - (dist - fullVolRadius) / Math.max(1, maxDist - fullVolRadius);
    return Math.max(0, Math.min(1, t * t));
  }

  private getContext(): AudioContext | null {
    return this.getAudioContext(false);
  }

  public playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'square',
    gainMult = 1,
    worldX?: number,
    worldY?: number
  ): void {
    const distGain = this.getDistanceGain(worldX, worldY);
    if (distGain <= 0.008) return;

    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

      const peak = Math.min(1, this.volume * gainMult * distGain);
      if (peak <= 0.002) return;
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

  public playSwing(worldX?: number, worldY?: number): void {
    this.playTone(260, 90, 0.11, 'triangle', 0.6, worldX, worldY);
  }

  public playHitWood(worldX?: number, worldY?: number): void {
    this.playTone(180, 75, 0.09, 'square', 0.7, worldX, worldY);
  }

  public playHitStone(worldX?: number, worldY?: number): void {
    this.playTone(520, 210, 0.08, 'sawtooth', 0.6, worldX, worldY);
  }

  public playHitEnemy(worldX?: number, worldY?: number): void {
    this.playTone(320, 110, 0.12, 'sawtooth', 0.75, worldX, worldY);
  }

  public playPlayerHurt(worldX?: number, worldY?: number): void {
    this.playTone(150, 55, 0.2, 'sawtooth', 0.9, worldX, worldY);
  }

  public playPickup(worldX?: number, worldY?: number): void {
    this.playTone(440, 880, 0.09, 'sine', 0.5, worldX, worldY);
  }

  public playCraft(worldX?: number, worldY?: number): void {
    const distGain = this.getDistanceGain(worldX, worldY);
    if (distGain <= 0.008) return;
    this.playTone(330, 660, 0.15, 'triangle', 0.7, worldX, worldY);
    setTimeout(
      () => this.playTone(550, 880, 0.16, 'triangle', 0.7, worldX, worldY),
      90
    );
  }

  public playTameSuccess(worldX?: number, worldY?: number): void {
    const distGain = this.getDistanceGain(worldX, worldY);
    if (distGain <= 0.008) return;
    this.playTone(440, 554, 0.12, 'sine', 0.7, worldX, worldY);
    setTimeout(
      () => this.playTone(554, 659, 0.12, 'sine', 0.7, worldX, worldY),
      110
    );
    setTimeout(
      () => this.playTone(659, 880, 0.22, 'sine', 0.8, worldX, worldY),
      220
    );
  }

  public playLevelUp(worldX?: number, worldY?: number): void {
    const distGain = this.getDistanceGain(worldX, worldY);
    if (distGain <= 0.008) return;
    const notes = [440, 554, 659, 880];
    notes.forEach((n, idx) => {
      setTimeout(
        () => this.playTone(n, n * 1.05, 0.16, 'triangle', 0.8, worldX, worldY),
        idx * 95
      );
    });
  }
}

export const soundManager = new SoundManager();

