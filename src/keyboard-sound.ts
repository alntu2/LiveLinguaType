// /src/keyboard-sound.ts

export type KeyboardSoundType = 'blue' | 'brown' | 'typewriter' | 'mute';

/**
 * 原生 Web Audio API 機械鍵盤音效引擎 (Synthesized Mechanical Keyboard Sound Engine)
 * 特點：100% 離線可用、零網路開銷、無音檔 404 風險、超低延遲 (<5ms)
 */
export class KeyboardSoundEngine {
  private ctx: AudioContext | null = null;
  public currentType: KeyboardSoundType = 'blue';
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    // 延遲至首次使用者互動後初始化以相容瀏覽器自動播放政策
  }

  private initContext(): void {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
        this.createNoiseBuffer();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * 生成白噪音緩衝區供鍵位微撞擊使用
   */
  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.1; // 100ms
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  /**
   * 播放按鍵音效 (Play Key Sound)
   */
  public playKey(key: string): void {
    if (this.currentType === 'mute') return;
    this.initContext();
    if (!this.ctx) return;

    const isSpace = key === ' ';
    const isBackspace = key === 'Backspace';

    switch (this.currentType) {
      case 'blue':
        this.playBlueSwitch(isSpace, isBackspace);
        break;
      case 'brown':
        this.playBrownSwitch(isSpace, isBackspace);
        break;
      case 'typewriter':
        this.playTypewriter(isSpace, isBackspace);
        break;
    }
  }

  /**
   * 青軸 (Clicky Blue Switch) - 雙段式高頻清脆點擊 + 觸底底音
   */
  private playBlueSwitch(isSpace: boolean, isBackspace: boolean): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. 簧片清脆點擊 (High-pitched click)
    const clickFreq = isSpace ? 2200 : isBackspace ? 2800 : 3100 + Math.random() * 300;
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();

    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(clickFreq, now);
    clickOsc.frequency.exponentialRampToValueAtTime(800, now + 0.015);

    clickGain.gain.setValueAtTime(0.35, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

    clickOsc.connect(clickGain);
    clickGain.connect(this.ctx.destination);

    clickOsc.start(now);
    clickOsc.stop(now + 0.018);

    // 2. 觸底沉穩底音 (Bottom-out thump)
    const thumpFreq = isSpace ? 110 : 150 + Math.random() * 20;
    const thumpOsc = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();

    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(thumpFreq, now + 0.005);
    thumpOsc.frequency.exponentialRampToValueAtTime(45, now + 0.045);

    thumpGain.gain.setValueAtTime(0.25, now + 0.005);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(this.ctx.destination);

    thumpOsc.start(now + 0.005);
    thumpOsc.stop(now + 0.05);
  }

  /**
   * 茶軸 (Thocky Brown Switch) - 溫潤厚實木質打擊感
   */
  private playBrownSwitch(isSpace: boolean, _isBackspace: boolean): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // 1. 帶通濾波撞擊 (Muffled thock impact)
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isSpace ? 480 : 650 + Math.random() * 80, now);
    filter.Q.setValueAtTime(3.5, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    noiseSource.start(now);
    noiseSource.stop(now + 0.04);

    // 2. 沉厚下潛音 (Deep bottom resonance)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isSpace ? 90 : 125, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.045);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * 復古打字機 (Vintage Typewriter) - 金屬字模敲擊音
   */
  private playTypewriter(isSpace: boolean, isBackspace: boolean): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 金屬撞擊音 (Metallic clank)
    const metalFreq = isSpace ? 400 : isBackspace ? 950 : 1400 + Math.random() * 200;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(metalFreq, now);

    osc2.type = 'square';
    osc2.frequency.setValueAtTime(metalFreq * 1.5, now);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isSpace ? 0.06 : 0.03));

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.065);
    osc2.stop(now + 0.065);
  }
}

export const keyboardSound = new KeyboardSoundEngine();
