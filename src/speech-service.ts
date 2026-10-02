// /src/speech-service.ts

/**
 * 原生 Web Speech 語音合成管理器 (Web Speech TTS Service)
 * 支援：整句發音、語速調節、自動切換打斷、音訊播放中狀態回饋。
 */
export class SpeechService {
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  public enabled: boolean = true;
  public rate: number = 0.95;
  public lang: string = 'en-US';

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
    }
  }

  public isSupported(): boolean {
    return this.synth !== null;
  }

  public isSpeaking(): boolean {
    return this.currentUtterance !== null || (this.synth?.speaking ?? false);
  }

  /**
   * 朗讀指定英文文本 (Speak English Text with Interruption Handling)
   */
  public speak(text: string, onStart?: () => void, onEnd?: () => void): void {
    if (!this.synth || !this.enabled || !text.trim()) {
      if (onEnd) onEnd();
      return;
    }

    // 主動中斷正在播放的聲音，避免多句連珠打架
    this.stop();

    const cleanText = text.trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = this.lang;
    utterance.rate = this.rate;

    // 優先挑選自然英美語系語音 (Select Natural/Preferred English Voice)
    const voices = this.synth.getVoices();
    const preferredVoice = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Natural') ||
          v.name.includes('Google') ||
          v.name.includes('Samantha') ||
          v.name.includes('Daniel') ||
          v.name.includes('Alex'))
    ) || voices.find((v) => v.lang.startsWith('en'));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    if (onStart) utterance.onstart = onStart;
    utterance.onend = () => {
      this.currentUtterance = null;
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.warn('[SpeechService] TTS playback notice:', e.error);
      }
      this.currentUtterance = null;
      if (onEnd) onEnd();
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  /**
   * 停止發音 (Stop Speech Synthesis)
   */
  public stop(): void {
    if (this.synth) {
      this.synth.cancel();
      this.currentUtterance = null;
    }
  }
}

export const speechService = new SpeechService();
