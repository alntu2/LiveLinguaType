// file:///Users/yiching/repo06/wrk_antigravity/61_Typing/src/anki-view.ts
/**
 * @file anki-view.ts
 * @description Anki 風格間隔重複卡牌學習視圖 (Spaced Repetition Flashcard Review Component)
 */

import {
  SRSCard,
  SRSRating,
  getAllCards,
  getDueCards,
  getDeckStats,
  reviewCard,
  deleteCard
} from './srs';
import { speakText } from './speech-service';

export class AnkiView {
  private container: HTMLElement;
  private currentCardIndex: number = 0;
  private currentCards: SRSCard[] = [];
  private isFlipped: boolean = false;
  private currentFilter: 'all' | 'word' | 'sentence' = 'all';
  private reviewMode: 'flashcard' | 'typing' = 'flashcard'; // 翻卡模式 或 拼寫打字模式
  private onStatsChanged?: () => void;

  constructor(container: HTMLElement, onStatsChanged?: () => void) {
    this.container = container;
    this.onStatsChanged = onStatsChanged;
    this.initKeyboardListener();
  }

  /**
   * 載入並渲染 Anki 視圖
   */
  public render(): void {
    this.refreshCards();
    this.renderLayout();
  }

  /**
   * 重新整理當前卡片清單
   */
  public refreshCards(): void {
    const due = getDueCards();
    if (this.currentFilter === 'all') {
      this.currentCards = due;
    } else {
      this.currentCards = due.filter((c) => c.type === this.currentFilter);
    }

    if (this.currentCardIndex >= this.currentCards.length) {
      this.currentCardIndex = 0;
    }
    this.isFlipped = false;
    this.onStatsChanged?.();
  }

  /**
   * 主版面結構渲染
   */
  private renderLayout(): void {
    const stats = getDeckStats();

    this.container.innerHTML = `
      <div class="anki-workspace">
        <!-- 頂部資訊與控制列 -->
        <header class="anki-header">
          <div class="anki-stats-bar">
            <div class="anki-stat-pill due-pill" title="今日需要複習的卡片數">
              <span class="stat-dot"></span>
              <span class="stat-num" id="ankiDueCount">${stats.dueCount}</span>
              <span class="stat-text">待複習 (Due)</span>
            </div>
            <div class="anki-stat-pill learned-pill" title="已成功記憶超過 2 次的卡片">
              <span class="stat-num">${stats.learnedCount}</span>
              <span class="stat-text">已熟練 (Learned)</span>
            </div>
            <div class="anki-stat-pill total-pill" title="卡片庫總卡數">
              <span class="stat-num">${stats.totalCount}</span>
              <span class="stat-text">總卡數 (Total)</span>
            </div>
          </div>

          <div class="anki-controls-group">
            <!-- 篩選卡組 -->
            <div class="anki-filter-group" role="radiogroup" aria-label="卡組篩選">
              <button class="anki-pill-btn ${this.currentFilter === 'all' ? 'active' : ''}" data-filter="all">全部 (${stats.totalCount})</button>
              <button class="anki-pill-btn ${this.currentFilter === 'word' ? 'active' : ''}" data-filter="word">單字 (${stats.wordCount})</button>
              <button class="anki-pill-btn ${this.currentFilter === 'sentence' ? 'active' : ''}" data-filter="sentence">句子 (${stats.sentenceCount})</button>
            </div>

            <!-- 模式切換 -->
            <div class="anki-mode-toggle" title="切換記憶模式">
              <button class="anki-mode-btn ${this.reviewMode === 'flashcard' ? 'active' : ''}" id="btnModeFlashcard">🎴 翻卡記憶</button>
              <button class="anki-mode-btn ${this.reviewMode === 'typing' ? 'active' : ''}" id="btnModeTyping">⌨️ 拼寫打字</button>
            </div>

            <button class="btn btn-outline btn-sm" id="btnManageDeck" title="瀏覽並管理全部卡片清單">
              📚 卡片庫管理
            </button>
          </div>
        </header>

        <!-- 主複習區域 -->
        <section class="anki-stage" id="ankiStage">
          <!-- 卡片本體將動態注入於此 -->
        </section>

        <!-- 卡片庫抽屜 / 彈窗容器 -->
        <div id="deckManagerModal" class="deck-modal" style="display: none;"></div>
      </div>
    `;

    this.bindHeaderEvents();
    this.renderCurrentCard();
  }

  /**
   * 綁定頂部控制項事件
   */
  private bindHeaderEvents(): void {
    const filterBtns = this.container.querySelectorAll('.anki-filter-group .anki-pill-btn');
    filterBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const filter = target.dataset.filter as 'all' | 'word' | 'sentence';
        this.currentFilter = filter;
        this.refreshCards();
        this.render();
      });
    });

    const btnModeFlash = this.container.querySelector('#btnModeFlashcard');
    const btnModeTyping = this.container.querySelector('#btnModeTyping');

    btnModeFlash?.addEventListener('click', () => {
      this.reviewMode = 'flashcard';
      this.render();
    });

    btnModeTyping?.addEventListener('click', () => {
      this.reviewMode = 'typing';
      this.render();
    });

    const btnManage = this.container.querySelector('#btnManageDeck');
    btnManage?.addEventListener('click', () => {
      this.showDeckManager();
    });
  }

  /**
   * 渲染當前卡片
   */
  private renderCurrentCard(): void {
    const stage = this.container.querySelector('#ankiStage');
    if (!stage) return;

    if (this.currentCards.length === 0) {
      // 今日無待複習卡片
      const allCards = getAllCards();
      const hasAnyCards = allCards.length > 0;

      stage.innerHTML = `
        <div class="anki-empty-state">
          <div class="empty-icon">${hasAnyCards ? '🎉' : '📥'}</div>
          <h2 class="empty-title">${hasAnyCards ? '太棒了！今日複習已全數完成！' : '尚未收藏任何單字或句子'}</h2>
          <p class="empty-desc">
            ${hasAnyCards
              ? '您目前沒有到期的卡片需要複習。持續保持記憶間隔，效果最佳！'
              : '在「新聞英打」練習時，點擊任何單字或按下句子右側的 ⭐ 收藏按鈕，即可將內容自動同步進 Anki 記憶卡庫！'}
          </p>
          <div class="empty-actions">
            ${hasAnyCards ? `
              <button class="btn btn-primary" id="btnCramAll">
                ⚡ 提前複習所有卡片 (${allCards.length})
              </button>
            ` : `
              <button class="btn btn-primary" id="btnGoTyping">
                ⌨️ 前往即時新聞英打
              </button>
            `}
            <button class="btn btn-outline" id="btnManageEmpty">
              📚 瀏覽卡片庫清單
            </button>
          </div>
        </div>
      `;

      stage.querySelector('#btnCramAll')?.addEventListener('click', () => {
        this.currentCards = [...getAllCards()];
        this.currentCardIndex = 0;
        this.isFlipped = false;
        this.renderCurrentCard();
      });

      stage.querySelector('#btnGoTyping')?.addEventListener('click', () => {
        // 切換回打字頁面
        const tabTyping = document.querySelector('#tabTyping') as HTMLElement;
        tabTyping?.click();
      });

      stage.querySelector('#btnManageEmpty')?.addEventListener('click', () => {
        this.showDeckManager();
      });
      return;
    }

    const card = this.currentCards[this.currentCardIndex];
    const isWord = card.type === 'word';

    stage.innerHTML = `
      <div class="anki-card-wrapper">
        <div class="anki-progress-bar">
          <span class="progress-label">進度：第 ${this.currentCardIndex + 1} / ${this.currentCards.length} 張</span>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${((this.currentCardIndex + 1) / this.currentCards.length) * 100}%"></div>
          </div>
        </div>

        <div class="anki-card ${this.isFlipped ? 'flipped' : ''}" id="activeAnkiCard">
          <!-- 卡片正面 (Front) -->
          <div class="card-face card-front">
            <div class="card-top-info">
              <span class="card-badge ${isWord ? 'badge-word' : 'badge-sentence'}">
                ${isWord ? '📖 單字 (Word)' : '💬 新聞例句 (Sentence)'}
              </span>
              <button class="card-speak-btn" id="cardSpeakBtn" title="播放發音 (TTS)">🔊</button>
            </div>

            <div class="card-front-content">
              <h2 class="card-front-text ${isWord ? 'word-size' : 'sentence-size'}">${card.front}</h2>
              ${card.phonetic ? `<div class="card-phonetic">${card.phonetic}</div>` : ''}
              ${card.context ? `<div class="card-context-quote">“${card.context}”</div>` : ''}
            </div>

            ${this.reviewMode === 'typing' && !this.isFlipped ? `
              <div class="card-typing-prompt">
                <input
                  type="text"
                  id="ankiTypeInput"
                  class="anki-type-input"
                  placeholder="在此鍵盤輸入拼寫..."
                  autocomplete="off"
                  autofocus
                />
                <div class="typing-tip" id="typingTip">輸入完整單字/句子後將自動驗證翻面</div>
              </div>
            ` : ''}

            <div class="card-bottom-hint">
              ${!this.isFlipped ? `
                <button class="btn btn-secondary btn-flip" id="btnFlipCard">
                  👀 查看答案 (Show Answer) <span class="kbd-hint">Space</span>
                </button>
              ` : ''}
            </div>
          </div>

          <!-- 卡片背面 (Back) -->
          <div class="card-face card-back" style="${this.isFlipped ? 'display: flex;' : 'display: none;'}">
            <div class="card-top-info">
              <span class="card-badge ${isWord ? 'badge-word' : 'badge-sentence'}">
                ${isWord ? '📖 單字釋義' : '💬 雙語中文對照'}
              </span>
              <button class="card-speak-btn" id="cardSpeakBtnBack" title="播放發音 (TTS)">🔊</button>
            </div>

            <div class="card-back-content">
              <div class="card-original-title">${card.front}</div>
              ${card.phonetic ? `<div class="card-phonetic">${card.phonetic}</div>` : ''}
              
              <div class="card-meaning-box">
                <div class="meaning-text">${card.back.replace(/\n/g, '<br/>')}</div>
              </div>

              ${card.sourceArticle ? `
                <div class="card-source-tag">📰 來源：${card.sourceArticle}</div>
              ` : ''}

              <div class="card-srs-info">
                <span>間隔：${Math.round(card.interval * 10) / 10} 天</span>
                <span>熟練度：${card.repetition} 次</span>
                <span>難易度：${Math.round(card.easeFactor * 100) / 100}</span>
              </div>
            </div>

            <!-- SRS 評分按鈕群 -->
            <div class="anki-ratings-group">
              <button class="rating-btn rating-again" data-rating="again" title="完全忘記 (快捷鍵 1)">
                <span class="rating-name">重來 (Again)</span>
                <span class="rating-time">&lt; 10分</span>
                <span class="rating-key">1</span>
              </button>
              <button class="rating-btn rating-hard" data-rating="hard" title="有印象但困難 (快捷鍵 2)">
                <span class="rating-name">困難 (Hard)</span>
                <span class="rating-time">1~2天</span>
                <span class="rating-key">2</span>
              </button>
              <button class="rating-btn rating-good" data-rating="good" title="正常回想起來 (快捷鍵 3)">
                <span class="rating-name">良好 (Good)</span>
                <span class="rating-time">3~4天</span>
                <span class="rating-key">3</span>
              </button>
              <button class="rating-btn rating-easy" data-rating="easy" title="非常輕鬆記住 (快捷鍵 4)">
                <span class="rating-name">簡單 (Easy)</span>
                <span class="rating-time">5~7天</span>
                <span class="rating-key">4</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindCardEvents(card);
  }

  /**
   * 綁定卡片內各項按鈕與翻面操作
   */
  private bindCardEvents(card: SRSCard): void {
    const btnFlip = this.container.querySelector('#btnFlipCard');
    btnFlip?.addEventListener('click', () => {
      this.flipCard();
    });

    const speakBtn = this.container.querySelector('#cardSpeakBtn');
    speakBtn?.addEventListener('click', () => {
      speakText(card.front);
    });

    const speakBtnBack = this.container.querySelector('#cardSpeakBtnBack');
    speakBtnBack?.addEventListener('click', () => {
      speakText(card.front);
    });

    // 拼寫打字模式的輸入監聽
    if (this.reviewMode === 'typing' && !this.isFlipped) {
      const typeInput = this.container.querySelector('#ankiTypeInput') as HTMLInputElement;
      const tip = this.container.querySelector('#typingTip');

      if (typeInput) {
        setTimeout(() => typeInput.focus(), 50);
        typeInput.addEventListener('input', () => {
          const val = typeInput.value.trim().toLowerCase();
          const target = card.front.trim().toLowerCase();
          if (val === target) {
            typeInput.classList.add('correct');
            if (tip) tip.textContent = '🎉 拼寫完全正確！';
            setTimeout(() => {
              this.flipCard();
            }, 300);
          } else if (target.startsWith(val)) {
            typeInput.classList.remove('incorrect');
            if (tip) tip.textContent = '輸入中...';
          } else {
            typeInput.classList.add('incorrect');
            if (tip) tip.textContent = '拼寫有誤，請再試一次或按 Space 翻面看答案';
          }
        });
      }
    }

    // 綁定四個評分按鈕
    const ratingBtns = this.container.querySelectorAll('.anki-ratings-group .rating-btn');
    ratingBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const rating = (e.currentTarget as HTMLElement).dataset.rating as SRSRating;
        this.submitRating(card.id, rating);
      });
    });
  }

  /**
   * 翻轉卡片
   */
  public flipCard(): void {
    if (this.isFlipped) return;
    this.isFlipped = true;
    const card = this.currentCards[this.currentCardIndex];
    if (card) {
      speakText(card.front);
    }
    this.renderCurrentCard();
  }

  /**
   * 提交評分並前往下一張
   */
  public submitRating(cardId: string, rating: SRSRating): void {
    reviewCard(cardId, rating);
    this.currentCardIndex++;
    this.isFlipped = false;

    // 更新頂部數據計數
    const stats = getDeckStats();
    const dueEl = this.container.querySelector('#ankiDueCount');
    if (dueEl) dueEl.textContent = stats.dueCount.toString();
    this.onStatsChanged?.();

    if (this.currentCardIndex >= this.currentCards.length) {
      this.refreshCards();
      this.currentCardIndex = 0;
    }

    this.renderCurrentCard();
  }

  /**
   * 鍵盤快捷鍵監聽 (Space 翻面, 1~4 評分)
   */
  private initKeyboardListener(): void {
    window.addEventListener('keydown', (e) => {
      // 僅在 Anki 視圖為顯示狀態時響應快捷鍵
      if (this.container.offsetParent === null) return;

      // 如果正在打字框中輸入，不攔截普通字元（除非按了 Enter/Escape）
      const activeEl = document.activeElement;
      const isInput = activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement;

      if (e.code === 'Space' && !this.isFlipped && !isInput) {
        e.preventDefault();
        this.flipCard();
        return;
      }

      if (this.isFlipped) {
        if (e.key === '1') {
          e.preventDefault();
          const card = this.currentCards[this.currentCardIndex];
          if (card) this.submitRating(card.id, 'again');
        } else if (e.key === '2') {
          e.preventDefault();
          const card = this.currentCards[this.currentCardIndex];
          if (card) this.submitRating(card.id, 'hard');
        } else if (e.key === '3') {
          e.preventDefault();
          const card = this.currentCards[this.currentCardIndex];
          if (card) this.submitRating(card.id, 'good');
        } else if (e.key === '4') {
          e.preventDefault();
          const card = this.currentCards[this.currentCardIndex];
          if (card) this.submitRating(card.id, 'easy');
        }
      }
    });
  }

  /**
   * 顯示卡片庫管理彈窗
   */
  private showDeckManager(): void {
    const modal = this.container.querySelector('#deckManagerModal') as HTMLElement;
    if (!modal) return;

    const cards = getAllCards();

    modal.innerHTML = `
      <div class="deck-modal-backdrop" id="modalBackdrop"></div>
      <div class="deck-modal-content">
        <div class="deck-modal-header">
          <h3>📚 卡片庫管理 (Card Deck Manager)</h3>
          <button class="deck-modal-close" id="btnCloseModal">✕</button>
        </div>

        <div class="deck-modal-toolbar">
          <input
            type="text"
            id="deckSearchInput"
            class="deck-search-input"
            placeholder="🔍 搜尋單字、句子或中文釋義..."
          />
          <div class="deck-count-badge">共 ${cards.length} 張卡片</div>
        </div>

        <div class="deck-cards-list" id="deckCardsList">
          ${cards.length === 0 ? `
            <div class="deck-empty">目前尚無卡片。請在打字練習中點擊單字或句子旁的 ⭐ 收藏。</div>
          ` : cards.map((card) => `
            <div class="deck-card-row" data-card-id="${card.id}">
              <div class="row-type">
                <span class="card-badge ${card.type === 'word' ? 'badge-word' : 'badge-sentence'}">
                  ${card.type === 'word' ? '單字' : '句子'}
                </span>
              </div>
              <div class="row-main">
                <div class="row-front">
                  <strong>${card.front}</strong>
                  ${card.phonetic ? `<span class="row-phonetic">${card.phonetic}</span>` : ''}
                </div>
                <div class="row-back">${card.back}</div>
                ${card.context ? `<div class="row-context">例句：${card.context}</div>` : ''}
              </div>
              <div class="row-meta">
                <span>間隔 ${Math.round(card.interval * 10) / 10} 天</span>
                <span>熟練度 ${card.repetition}</span>
              </div>
              <div class="row-actions">
                <button class="btn-icon btn-row-speak" title="發音" data-text="${card.front}">🔊</button>
                <button class="btn-icon btn-row-delete" title="刪除此卡片" data-id="${card.id}">🗑️</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    modal.style.display = 'flex';

    // 關閉彈窗
    modal.querySelector('#btnCloseModal')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });
    modal.querySelector('#modalBackdrop')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    // 發音與刪除事件
    modal.querySelectorAll('.btn-row-speak').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const text = (e.currentTarget as HTMLElement).dataset.text;
        if (text) speakText(text);
      });
    });

    modal.querySelectorAll('.btn-row-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const cardId = (e.currentTarget as HTMLElement).dataset.id;
        if (cardId && confirm('確定要從卡片庫刪除這張卡片嗎？')) {
          deleteCard(cardId);
          this.showDeckManager();
          this.refreshCards();
          this.renderCurrentCard();
        }
      });
    });

    // 搜尋過濾
    const searchInput = modal.querySelector('#deckSearchInput') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      const rows = modal.querySelectorAll('.deck-card-row');
      rows.forEach((row) => {
        const text = row.textContent?.toLowerCase() || '';
        (row as HTMLElement).style.display = text.includes(q) ? 'flex' : 'none';
      });
    });
  }
}
