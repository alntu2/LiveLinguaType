// /src/typing-engine.ts

export interface SentenceBlock {
  id: number;
  en: string;
  zh: string;
  startIndex: number;
  endIndex: number;
}

export interface TypingMetrics {
  wpm: number;
  accuracy: number;
  progress: number;
  elapsedSeconds: number;
  totalKeystrokes: number;
  errorCount: number;
  isFinished: boolean;
  capsLockOn: boolean;
}

export interface TypingEngineOptions {
  container: HTMLElement;
  caretElement: HTMLElement;
  caseSensitive?: boolean;
  onMetricUpdate: (metrics: TypingMetrics) => void;
  onFinish: (metrics: TypingMetrics) => void;
  onCapsLockChange?: (capsLockOn: boolean) => void;
  onImeDetected?: (char: string) => void;
  onSentenceChange?: (sentenceIndex: number, sentence: SentenceBlock) => void;
  onPlaySentenceAudio?: (sentence: SentenceBlock) => void;
  onKeyPress?: (key: string, isCorrect?: boolean) => void;
  onWordClick?: (word: string, rect: DOMRect) => void;
}

export type CharState = 'pending' | 'correct' | 'incorrect';

/**
 * 打字核心引擎 (Typing Engine)
 * 具備：雙語句子分組對齊 (Bilingual Sentence Grouping)、打錯字浮動標籤 (Typed Char Above Badge)、單字對齊、CapsLock 與中文輸入法偵測。
 */
export class TypingEngine {
  private container: HTMLElement;
  private caretElement: HTMLElement;
  private onMetricUpdate: (metrics: TypingMetrics) => void;
  private onFinish: (metrics: TypingMetrics) => void;
  private onCapsLockChange: ((capsLockOn: boolean) => void) | null = null;
  private onImeDetected: ((char: string) => void) | null = null;
  private onSentenceChange: ((sentenceIndex: number, sentence: SentenceBlock) => void) | null = null;
  private onPlaySentenceAudio: ((sentence: SentenceBlock) => void) | null = null;
  private onKeyPress: ((key: string, isCorrect?: boolean) => void) | null = null;
  private onWordClick: ((word: string, rect: DOMRect) => void) | null = null;
  private boundClickHandler: ((e: MouseEvent) => void) | null = null;
  private highlightedSpans: HTMLElement[] = [];

  // 設定選項 (Options)
  public caseSensitive: boolean = false;

  // 內部狀態 (Internal State)
  private targetText: string = '';
  private sentences: SentenceBlock[] = [];
  private sentenceElements: HTMLElement[] = [];
  private activeSentenceIndex: number = -1;

  private currentIndex: number = 0;
  private charStates: CharState[] = [];
  private charSpans: HTMLElement[] = [];
  private typedChars: (string | null)[] = [];
  private capsLockOn: boolean = false;

  // 計時器與指標 (Timers & Metrics)
  private startTime: number | null = null;
  private timerId: number | null = null;
  private elapsedSeconds: number = 0;
  private totalKeystrokes: number = 0;
  private correctKeystrokes: number = 0;
  private errorCount: number = 0;
  private isFinished: boolean = false;
  private isStarted: boolean = false;

  // 事件監聽器引用 (Bound Event Handlers for Explicit Teardown)
  private boundKeyDownHandler: ((e: KeyboardEvent) => void) | null = null;
  private boundKeyUpHandler: ((e: KeyboardEvent) => void) | null = null;
  private boundResizeHandler: (() => void) | null = null;

  constructor(options: TypingEngineOptions) {
    this.container = options.container;
    this.caretElement = options.caretElement;
    this.caseSensitive = options.caseSensitive ?? false;
    this.onMetricUpdate = options.onMetricUpdate;
    this.onFinish = options.onFinish;
    this.onCapsLockChange = options.onCapsLockChange || null;
    this.onImeDetected = options.onImeDetected || null;
    this.onSentenceChange = options.onSentenceChange || null;
    this.onPlaySentenceAudio = options.onPlaySentenceAudio || null;
    this.onKeyPress = options.onKeyPress || null;
    this.onWordClick = options.onWordClick || null;

    this.bindEvents();
  }

  public loadText(text: string, sentences: SentenceBlock[] = []): void {
    this.stopTimer();
    this.clearDomNodes();

    // 正規化空白字元為 ASCII 32
    this.targetText = text.replace(/[\u00A0\u2000-\u200B\u202F\u205F]/g, ' ').trim();
    this.sentences = sentences;
    this.currentIndex = 0;
    this.activeSentenceIndex = -1;
    this.charStates = new Array(this.targetText.length).fill('pending');
    this.typedChars = new Array(this.targetText.length).fill(null);
    this.totalKeystrokes = 0;
    this.correctKeystrokes = 0;
    this.errorCount = 0;
    this.elapsedSeconds = 0;
    this.isStarted = false;
    this.isFinished = false;
    this.startTime = null;

    this.charSpans = new Array(this.targetText.length);
    this.sentenceElements = [];

    const fragment = document.createDocumentFragment();

    if (this.sentences.length > 0) {
      // 依句子建立雙語區塊 (Bilingual Sentence Blocks)
      this.sentences.forEach((sentence, sIdx) => {
        const block = document.createElement('div');
        block.className = `sentence-block ${sIdx === 0 ? 'active' : ''}`;
        block.setAttribute('data-sentence-id', sIdx.toString());

        // 繁體中文翻譯欄位
        if (sentence.zh) {
          const zhContainer = document.createElement('div');
          zhContainer.className = 'sentence-zh';

          const tag = document.createElement('span');
          tag.className = 'sentence-zh-tag';
          tag.textContent = '中譯';

          const zhText = document.createElement('span');
          zhText.className = 'sentence-zh-text';
          zhText.textContent = sentence.zh;

          const speechBtn = document.createElement('button');
          speechBtn.className = 'sentence-speech-btn';
          speechBtn.setAttribute('title', '朗讀本句 (Play Audio)');
          speechBtn.setAttribute('type', 'button');
          speechBtn.innerHTML = '🔊';
          speechBtn.onclick = (e) => {
            e.stopPropagation();
            if (this.onPlaySentenceAudio) {
              this.onPlaySentenceAudio(sentence);
            }
          };

          zhContainer.appendChild(tag);
          zhContainer.appendChild(zhText);
          zhContainer.appendChild(speechBtn);
          block.appendChild(zhContainer);
        }

        // 英文原文容器
        const enContainer = document.createElement('div');
        enContainer.className = 'sentence-en';

        // 該句在全文中的字元範圍
        const start = Math.min(sentence.startIndex, this.targetText.length);
        const end = Math.min(sentence.endIndex, this.targetText.length);

        for (let i = start; i < end; i++) {
          const span = document.createElement('span');
          span.className = 'char';
          const char = this.targetText[i];
          span.textContent = char;
          if (char === ' ') {
            span.classList.add('space');
          }
          enContainer.appendChild(span);
          this.charSpans[i] = span;
        }

        // 若句間有空格遺漏，補齊跨句空格
        const nextStart = sIdx < this.sentences.length - 1 ? this.sentences[sIdx + 1].startIndex : this.targetText.length;
        if (end < nextStart) {
          for (let i = end; i < nextStart; i++) {
            const span = document.createElement('span');
            span.className = 'char space';
            span.textContent = this.targetText[i];
            enContainer.appendChild(span);
            this.charSpans[i] = span;
          }
        }

        block.appendChild(enContainer);
        fragment.appendChild(block);
        this.sentenceElements.push(block);
      });

      this.activeSentenceIndex = 0;
    } else {
      // 若無句子分段資訊，以平坦模式渲染 (Flat rendering fallback)
      for (let i = 0; i < this.targetText.length; i++) {
        const span = document.createElement('span');
        span.className = 'char';
        const char = this.targetText[i];
        span.textContent = char;
        if (char === ' ') {
          span.classList.add('space');
        }
        fragment.appendChild(span);
        this.charSpans[i] = span;
      }
    }

    this.container.appendChild(fragment);

    if (this.charSpans.length > 0 && this.charSpans[0]) {
      this.charSpans[0].classList.add('current');
      this.caretElement.style.display = 'block';
      // 延遲一微任務以確保 DOM 計算排版完成
      requestAnimationFrame(() => {
        this.updateCaretPosition();
      });
    }

    this.notifyMetrics();
  }

  private bindEvents(): void {
    this.boundKeyDownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
    this.boundKeyUpHandler = (e: KeyboardEvent) => this.handleKeyUp(e);
    this.boundResizeHandler = () => this.updateCaretPosition();
    this.boundClickHandler = (e: MouseEvent) => this.handleContainerClick(e);

    window.addEventListener('keydown', this.boundKeyDownHandler);
    window.addEventListener('keyup', this.boundKeyUpHandler);
    window.addEventListener('resize', this.boundResizeHandler);
    this.container.addEventListener('click', this.boundClickHandler);
  }

  private unbindEvents(): void {
    if (this.boundKeyDownHandler) {
      window.removeEventListener('keydown', this.boundKeyDownHandler);
      this.boundKeyDownHandler = null;
    }
    if (this.boundKeyUpHandler) {
      window.removeEventListener('keyup', this.boundKeyUpHandler);
      this.boundKeyUpHandler = null;
    }
    if (this.boundResizeHandler) {
      window.removeEventListener('resize', this.boundResizeHandler);
      this.boundResizeHandler = null;
    }
    if (this.boundClickHandler) {
      this.container.removeEventListener('click', this.boundClickHandler);
      this.boundClickHandler = null;
    }
  }

  public clearWordHighlight(): void {
    if (this.highlightedSpans.length > 0) {
      this.highlightedSpans.forEach((span) => span.classList.remove('word-highlight'));
      this.highlightedSpans = [];
    }
  }

  private handleContainerClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target) return;

    // 排除句子朗讀按鈕點擊
    if (target.closest('.sentence-speech-btn')) return;

    const charSpan = target.closest('.char') as HTMLElement | null;
    if (!charSpan) return;

    const idx = this.charSpans.indexOf(charSpan);
    if (idx === -1) return;

    const clickedChar = this.targetText[idx];
    if (!clickedChar || !/[a-zA-Z0-9'\-]/.test(clickedChar)) {
      return;
    }

    // 向前搜尋單字起始邊界
    let start = idx;
    while (start > 0 && /[a-zA-Z0-9'\-]/.test(this.targetText[start - 1])) {
      start--;
    }

    // 向後搜尋單字結尾邊界
    let end = idx;
    while (end < this.targetText.length - 1 && /[a-zA-Z0-9'\-]/.test(this.targetText[end + 1])) {
      end++;
    }

    const rawWord = this.targetText.slice(start, end + 1);
    const cleanWord = rawWord.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');

    if (!cleanWord || cleanWord.length === 0) return;

    // 清除舊高亮並高亮新單字
    this.clearWordHighlight();
    for (let i = start; i <= end; i++) {
      const span = this.charSpans[i];
      if (span && !span.classList.contains('space')) {
        span.classList.add('word-highlight');
        this.highlightedSpans.push(span);
      }
    }

    // 計算選取單字的邊界矩形 (Bounding Rect)
    if (this.onWordClick) {
      const firstSpan = this.charSpans[start];
      const lastSpan = this.charSpans[end];
      if (firstSpan && lastSpan) {
        const firstRect = firstSpan.getBoundingClientRect();
        const lastRect = lastSpan.getBoundingClientRect();
        const combinedRect = new DOMRect(
          Math.min(firstRect.left, lastRect.left),
          Math.min(firstRect.top, lastRect.top),
          Math.max(firstRect.right, lastRect.right) - Math.min(firstRect.left, lastRect.left),
          Math.max(firstRect.bottom, lastRect.bottom) - Math.min(firstRect.top, lastRect.top)
        );
        this.onWordClick(cleanWord, combinedRect);
      }
    }
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private startTimer(): void {
    if (this.timerId !== null) return;
    this.startTime = Date.now();
    this.timerId = window.setInterval(() => {
      if (!this.startTime) return;
      this.elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
      this.notifyMetrics();
    }, 500);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const isCaps = e.getModifierState('CapsLock');
    if (this.capsLockOn !== isCaps) {
      this.capsLockOn = isCaps;
      if (this.onCapsLockChange) {
        this.onCapsLockChange(isCaps);
      }
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const isCaps = e.getModifierState('CapsLock');
    if (this.capsLockOn !== isCaps) {
      this.capsLockOn = isCaps;
      if (this.onCapsLockChange) {
        this.onCapsLockChange(isCaps);
      }
    }

    if (e.ctrlKey || e.altKey || e.metaKey || this.isFinished) return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (this.onKeyPress) this.onKeyPress('Backspace');
      this.handleBackspace();
      return;
    }

    if (e.key === ' ') {
      e.preventDefault();
    }

    // 忽略非字元功能鍵
    if (e.key.length !== 1) return;

    // 偵測中文輸入法
    if (e.key.charCodeAt(0) > 127 && this.onImeDetected) {
      this.onImeDetected(e.key);
    }

    if (!this.isStarted) {
      this.isStarted = true;
      this.startTimer();
    }

    const inputChar = e.key;
    const targetChar = this.targetText[this.currentIndex];
    this.totalKeystrokes++;

    // 空白鍵跳下一個單字邏輯
    if (inputChar === ' ' && targetChar !== ' ') {
      if (this.onKeyPress) this.onKeyPress(' ');
      this.jumpToNextWord();
      return;
    }

    const currentSpan = this.charSpans[this.currentIndex];
    if (currentSpan) {
      currentSpan.classList.remove('current');
    }

    const isMatch = this.caseSensitive
      ? inputChar === targetChar
      : inputChar.toLowerCase() === targetChar.toLowerCase();

    if (this.onKeyPress) {
      this.onKeyPress(inputChar, isMatch);
    }

    if (isMatch) {
      this.charStates[this.currentIndex] = 'correct';
      this.typedChars[this.currentIndex] = inputChar;
      if (currentSpan) {
        currentSpan.classList.add('correct');
        currentSpan.classList.remove('incorrect');
        this.removeTypedBadge(currentSpan);
      }
      this.correctKeystrokes++;
    } else {
      this.charStates[this.currentIndex] = 'incorrect';
      this.typedChars[this.currentIndex] = inputChar;
      if (currentSpan) {
        currentSpan.classList.add('incorrect');
        currentSpan.classList.remove('correct');
        this.attachTypedBadge(currentSpan, inputChar);
      }
      this.errorCount++;
    }

    this.currentIndex++;
    this.updateSentenceHighlight();

    if (this.currentIndex >= this.targetText.length) {
      this.finish();
      return;
    }

    const nextSpan = this.charSpans[this.currentIndex];
    if (nextSpan) {
      nextSpan.classList.add('current');
      this.ensureVisible(nextSpan);
    }

    this.updateCaretPosition();
    this.notifyMetrics();
  }

  private updateSentenceHighlight(): void {
    if (this.sentences.length === 0 || this.sentenceElements.length === 0) return;

    // 找出當前 currentIndex 所屬的句子索引
    let targetSentenceIdx = 0;
    for (let i = 0; i < this.sentences.length; i++) {
      if (this.currentIndex >= this.sentences[i].startIndex && this.currentIndex <= this.sentences[i].endIndex) {
        targetSentenceIdx = i;
        break;
      }
      if (this.currentIndex > this.sentences[i].endIndex) {
        targetSentenceIdx = Math.min(i + 1, this.sentences.length - 1);
      }
    }

    if (targetSentenceIdx !== this.activeSentenceIndex) {
      if (this.sentenceElements[this.activeSentenceIndex]) {
        this.sentenceElements[this.activeSentenceIndex].classList.remove('active');
      }
      if (this.sentenceElements[targetSentenceIdx]) {
        this.sentenceElements[targetSentenceIdx].classList.add('active');
      }
      this.activeSentenceIndex = targetSentenceIdx;

      if (this.onSentenceChange && this.sentences[targetSentenceIdx]) {
        this.onSentenceChange(targetSentenceIdx, this.sentences[targetSentenceIdx]);
      }
    }
  }

  private attachTypedBadge(span: HTMLElement, typedChar: string): void {
    let badge = span.querySelector('.typed-above') as HTMLElement;
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'typed-above';
      span.appendChild(badge);
    }
    badge.textContent = typedChar === ' ' ? '␣' : typedChar;
  }

  private removeTypedBadge(span: HTMLElement): void {
    const badge = span.querySelector('.typed-above');
    if (badge) {
      badge.remove();
    }
  }

  private jumpToNextWord(): void {
    while (this.currentIndex < this.targetText.length && this.targetText[this.currentIndex] !== ' ') {
      const span = this.charSpans[this.currentIndex];
      if (span) {
        span.classList.remove('current');
        if (this.charStates[this.currentIndex] === 'pending') {
          this.charStates[this.currentIndex] = 'incorrect';
          this.typedChars[this.currentIndex] = '␣';
          span.classList.add('incorrect');
          this.attachTypedBadge(span, '✕');
          this.errorCount++;
        }
      }
      this.currentIndex++;
    }

    if (this.currentIndex < this.targetText.length && this.targetText[this.currentIndex] === ' ') {
      const spaceSpan = this.charSpans[this.currentIndex];
      if (spaceSpan) {
        spaceSpan.classList.remove('current');
        spaceSpan.classList.add('correct');
        this.removeTypedBadge(spaceSpan);
      }
      this.charStates[this.currentIndex] = 'correct';
      this.correctKeystrokes++;
      this.currentIndex++;
    }

    this.updateSentenceHighlight();

    if (this.currentIndex >= this.targetText.length) {
      this.finish();
      return;
    }

    const nextSpan = this.charSpans[this.currentIndex];
    if (nextSpan) {
      nextSpan.classList.add('current');
      this.ensureVisible(nextSpan);
    }

    this.updateCaretPosition();
    this.notifyMetrics();
  }

  private handleBackspace(): void {
    if (this.currentIndex <= 0) return;

    if (this.charSpans[this.currentIndex]) {
      this.charSpans[this.currentIndex].classList.remove('current');
    }

    this.currentIndex--;

    const prevSpan = this.charSpans[this.currentIndex];
    if (prevSpan) {
      prevSpan.className = 'char current';
      if (this.targetText[this.currentIndex] === ' ') {
        prevSpan.classList.add('space');
      }
      this.removeTypedBadge(prevSpan);
      this.charStates[this.currentIndex] = 'pending';
      this.typedChars[this.currentIndex] = null;
      this.ensureVisible(prevSpan);
    }

    this.updateSentenceHighlight();
    this.updateCaretPosition();
    this.notifyMetrics();
  }

  private updateCaretPosition(): void {
    const activeSpan = this.charSpans[this.currentIndex];
    if (!activeSpan || !this.caretElement) return;

    const containerRect = this.container.getBoundingClientRect();
    const spanRect = activeSpan.getBoundingClientRect();

    // 相對容器計算精準游標座標，抵抗任何內部結構巢狀影響
    const left = spanRect.left - containerRect.left;
    const top = spanRect.top - containerRect.top + this.container.scrollTop;

    this.caretElement.style.transform = `translate(${left}px, ${top}px)`;
  }

  private ensureVisible(span: HTMLElement): void {
    const containerRect = this.container.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();

    const relativeTop = spanRect.top - containerRect.top;
    const relativeBottom = spanRect.bottom - containerRect.top;

    if (relativeBottom > this.container.clientHeight - 40) {
      this.container.scrollTop += (relativeBottom - this.container.clientHeight + 60);
    } else if (relativeTop < 30) {
      this.container.scrollTop += (relativeTop - 40);
    }
  }

  private calculateMetrics(): TypingMetrics {
    const minutes = Math.max(this.elapsedSeconds / 60, 0.016);
    const wpm = Math.round(this.correctKeystrokes / 5 / minutes);

    const accuracy =
      this.totalKeystrokes > 0
        ? Math.max(0, Math.round((this.correctKeystrokes / this.totalKeystrokes) * 100))
        : 100;

    const progress =
      this.targetText.length > 0 ? Math.round((this.currentIndex / this.targetText.length) * 100) : 0;

    return {
      wpm: isNaN(wpm) ? 0 : wpm,
      accuracy,
      progress,
      elapsedSeconds: this.elapsedSeconds,
      totalKeystrokes: this.totalKeystrokes,
      errorCount: this.errorCount,
      isFinished: this.isFinished,
      capsLockOn: this.capsLockOn
    };
  }

  private notifyMetrics(): void {
    const metrics = this.calculateMetrics();
    this.onMetricUpdate(metrics);
  }

  private finish(): void {
    this.isFinished = true;
    this.stopTimer();
    this.caretElement.style.display = 'none';

    const metrics = this.calculateMetrics();
    this.onMetricUpdate(metrics);
    this.onFinish(metrics);
  }

  private clearDomNodes(): void {
    this.clearWordHighlight();
    this.charSpans = [];
    this.charStates = [];
    this.typedChars = [];
    this.sentenceElements = [];
    this.activeSentenceIndex = -1;

    // 清空除 caret 以外的子節點
    const children = Array.from(this.container.children);
    for (const child of children) {
      if (child !== this.caretElement) {
        this.container.removeChild(child);
      }
    }
    this.container.scrollTop = 0;
  }

  public reset(): void {
    if (this.targetText) {
      this.loadText(this.targetText, this.sentences);
    }
  }

  public getCurrentSentence(): SentenceBlock | null {
    if (this.sentences.length > 0 && this.activeSentenceIndex >= 0 && this.activeSentenceIndex < this.sentences.length) {
      return this.sentences[this.activeSentenceIndex];
    }
    return null;
  }

  public dispose(): void {
    this.stopTimer();
    this.unbindEvents();
    this.clearDomNodes();
    this.caretElement.style.display = 'none';
    this.targetText = '';
    this.sentences = [];
  }
}
