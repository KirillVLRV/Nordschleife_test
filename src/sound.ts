// ============================================================
// SECTION: Sound System — WebAudio Engine Synthesis
// ============================================================

export class SoundSystem {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private userAudio: HTMLAudioElement | null = null;
  private userAudioSource: MediaElementAudioSourceNode | null = null;
  private userAudioGain: GainNode | null = null;
  private isMuted = false;
  private currentRpm = 900;
  private targetRpm = 900;
  private referenceRpm = 3000; // for user audio pitch mapping

  constructor() {
    // Lazy init on first user interaction
  }

  private init() {
    if (this.audioContext) return;
    
    this.audioContext = new AudioContext();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.audioContext.destination);

    // Engine oscillators
    this.engineOsc1 = this.audioContext.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 80;

    this.engineOsc2 = this.audioContext.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 82; // slight detune

    this.engineGain = this.audioContext.createGain();
    this.engineGain.gain.value = 0;

    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    filter.Q.value = 2;

    this.engineOsc1.connect(filter);
    this.engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOsc1.start();
    this.engineOsc2.start();

    // Noise (exhaust)
    const bufferSize = 2 * this.audioContext.sampleRate;
    const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.noiseSource = this.audioContext.createBufferSource();
    this.noiseSource.buffer = noiseBuffer;
    this.noiseSource.loop = true;

    this.noiseGain = this.audioContext.createGain();
    this.noiseGain.gain.value = 0;

    const noiseFilter = this.audioContext.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 200;
    noiseFilter.Q.value = 1;

    this.noiseSource.connect(noiseFilter);
    noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.masterGain);

    this.noiseSource.start();
  }

  update(rpm: number, throttle: number) {
    if (!this.audioContext || this.isMuted) return;

    this.targetRpm = rpm;
    // Smooth RPM transition
    this.currentRpm += (this.targetRpm - this.currentRpm) * 0.1;

    // Map RPM to frequency (80Hz at idle, 400Hz at redline)
    const freq = 80 + (this.currentRpm - 900) / (6800 - 900) * 320;
    
    if (this.engineOsc1) this.engineOsc1.frequency.value = freq;
    if (this.engineOsc2) this.engineOsc2.frequency.value = freq * 1.02;

    // Volume based on throttle and RPM
    const baseVol = 0.15 + throttle * 0.25;
    const rpmFactor = Math.min(1, (this.currentRpm - 900) / 3000);
    
    if (this.engineGain) {
      this.engineGain.gain.value = baseVol * (0.5 + rpmFactor * 0.5);
    }
    if (this.noiseGain) {
      this.noiseGain.gain.value = baseVol * 0.3 * rpmFactor;
    }

    // User audio pitch mapping
    if (this.userAudio && this.userAudioSource) {
      const pitchRatio = this.currentRpm / this.referenceRpm;
      this.userAudio.playbackRate = Math.max(0.5, Math.min(2.0, pitchRatio));
    }
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 0.3;
    }
    if (this.userAudio) {
      this.userAudio.muted = muted;
    }
  }

  loadUserAudio(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.audioContext) this.init();
      
      // Clean up previous user audio
      if (this.userAudio) {
        this.userAudio.pause();
        this.userAudio = null;
      }
      if (this.userAudioSource) {
        this.userAudioSource.disconnect();
        this.userAudioSource = null;
      }

      const url = URL.createObjectURL(file);
      this.userAudio = new Audio(url);
      this.userAudio.loop = true;
      this.userAudio.muted = this.isMuted;

      this.userAudio.addEventListener('canplaythrough', () => {
        const ctx = this.audioContext;
        const master = this.masterGain;
        if (!ctx || !master) return;
        
        this.userAudioSource = ctx.createMediaElementSource(this.userAudio!);
        this.userAudioGain = ctx.createGain();
        this.userAudioGain.gain.value = 0.5;
        
        this.userAudioSource.connect(this.userAudioGain);
        this.userAudioGain.connect(master);
        
        this.userAudio!.play();
        this.referenceRpm = 3000; // Default reference RPM
        
        resolve(file.name);
      }, { once: true });

      this.userAudio.addEventListener('error', () => {
        reject(new Error('Failed to load audio file'));
      }, { once: true });
    });
  }

  dispose() {
    if (this.engineOsc1) this.engineOsc1.stop();
    if (this.engineOsc2) this.engineOsc2.stop();
    if (this.noiseSource) this.noiseSource.stop();
    if (this.userAudio) this.userAudio.pause();
    if (this.audioContext) this.audioContext.close();
  }
}

export const soundSystem = new SoundSystem();
