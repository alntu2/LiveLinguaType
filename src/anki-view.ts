// file:///Users/yiching/repo06/wrk_antigravity/61_Typing/src/anki-view.ts
/**
 * @file anki-view.ts
 * @description Anki 風格間隔重複卡牌學習視圖 (支援多牌組切換、個人專屬筆記、3D 翻面、TTS 與拼寫模式)
 */

import {
  SRSCard,
  SRSRating,
  getAllCards,
  getDueCards,
  getDeckStats,
  getDecks,
  addDeck,
  reviewCard,
  deleteCard,
  updateCardNotes,
  updateCardDeck
} from './srs';
import { speakText } from './speech-service';

export class AnkiView {
  private container: HTMLElement;
  private currentCardIndex: number = 0;
  private currentCards: SRSCard[] = [];
  private isFlipped: boolean = false;
  private currentDeckId: string = 'all'; // 'all' 或特定 deckId
  private currentFilter: 'all' | 'word' | 'sentence' = 'all';
  private reviewMode: 'flashcard' | 'typing' = 'flashcard';
  private onStatsChanged?: () => void;
  private notesDebounceTimer: number | null = null;

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
    const due = getDueCards(this.currentDeckId);
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
    const stats = getDeckStats(this.currentDeckId);
    const decks = getDecks();
    const currentDeck = decks.find((d) => d.id === this.currentDeckId);

    this.container.innerHTML = `
      <div class="anki-workspace">
        <!-- 牌組導覽列 (Deck Selector Bar) -->
        <nav class="anki-deck-nav" aria-label="牌組切換選單">
          <div class="deck-nav-header">
            <span class="deck-nav-title">🗂️ 牌組 (Decks)：</span>
            <div class="deck-pill-list" id="deckPillList">
              <button class="deck-pill-btn ${this.currentDeckId === 'all' ? 'active' : ''}" data-deck="all">
                🌐 全部牌組
                <span class="deck-due-badge">${getDeckStats('all').dueCount}</span>
              </button>
              ${decks.map((deck) => {
                const deckStat = getDeckStats(deck.id);
                return `
                  <button class="deck-pill-btn ${this.currentDeckId === deck.id ? 'active' : ''}" data-deck="${deck.id}">
                    <span>${deck.icon || '📁'} ${deck.name}</span>
                    ${deckStat.dueCount > 0 ? `<span class="deck-due-badge">${deckStat.dueCount}</span>` : ''}
                  </button>
                `;
              }).join('')}
            </div>
            <button class="btn btn-outline btn-sm btn-new-deck" id="btnOpenNewDeckModal" title="建立專屬自訂卡組">
              ➕ 新增牌組
            </button>
          </div>
        </nav>

        <!-- 頂部資訊與控制列 -->
        <header class="anki-header">
          <div class="anki-stats-bar">
            <div class="anki-stat-pill due-pill" title="當前牌組今日待複習卡片">
              <span class="stat-dot"></span>
              <span class="stat-num" id="ankiDueCount">${stats.dueCount}</span>
              <span class="stat-text">待複習 (Due)</span>
            </div>
            <div class="anki-stat-pill learned-pill" title="已熟練掌握 (複習2次以上)">
              <span class="stat-num">${stats.learnedCount}</span>
              <span class="stat-text">已熟練 (Learned)</span>
            </div>
            <div class="anki-stat-pill total-pill" title="當前牌組總卡數">
              <span class="stat-num">${stats.totalCount}</span>
              <span class="stat-text">${this.currentDeckId === 'all' ? '全部總卡數' : currentDeck?.name || '總卡數'}</span>
            </div>
          </div>

          <div class="anki-controls-group">
            <!-- 篩選卡組類型 (全部 / 單字 / 句子) -->
            <div class="anki-filter-group" role="radiogroup" aria-label="卡片類型篩選">
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
          <!-- 卡片本體動態注入 -->
        </section>

        <!-- 卡片庫抽屜 / 彈窗容器 -->
        <div id="deckManagerModal" class="deck-modal" style="display: none;"></div>

        <!-- 新增牌組彈窗 (Modal) -->
        <div id="newDeckModal" class="deck-modal" style="display: none;">
          <div class="deck-modal-backdrop" id="newDeckBackdrop"></div>
          <div class="deck-modal-content deck-new-card-modal">
            <div class="deck-modal-header">
              <h3>➕ 建立新牌組 (Create New Deck)</h3>
              <button class="deck-modal-close" id="btnCloseNewDeckModal">✕</button>
            </div>
            <div class="deck-modal-body">
              <div class="modal-form-group">
                <label for="newDeckNameInput">牌組名稱 (Deck Name)：</label>
                <input type="text" id="newDeckNameInput" class="form-input" placeholder="例如：多益常考單字、科技時事慣用語..." />
              </div>
              <div class="modal-form-group">
                <label for="newDeckIconSelect">牌組圖示 (Icon)：</label>
                <select id="newDeckIconSelect" class="form-select">
                  <option value="💡">💡 核心單字 (Vocab)</option>
                  <option value="💬">💬 經典例句 (Sentences)</option>
                  <option value="💼">💼 商業財經 (Business)</option>
                  <option value="🚀">🚀 科技趨勢 (Tech)</option>
                  <option value="🏆">🏆 檢定備考 (Exam)</option>
                  <option value="📚">📚 閱讀書籍 (Reading)</option>
                  <option value="📁" selected>📁 自訂分類 (Custom)</option>
                </select>
              </div>
              <div class="modal-form-actions">
                <button class="btn btn-secondary" id="btnCancelNewDeck">取消</button>
                <button class="btn btn-primary" id="btnConfirmNewDeck">建立牌組 (Create)</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindHeaderEvents();
    this.renderCurrentCard();
  }

  /**
   * 綁定頂部控制項與牌組事件
   */
  private bindHeaderEvents(): void {
    // 牌組切換按鈕
    const deckBtns = this.container.querySelectorAll('.deck-pill-list .deck-pill-btn');
    deckBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const deckId = target.dataset.deck || 'all';
        this.currentDeckId = deckId;
        this.currentCardIndex = 0;
        this.refreshCards();
        this.render();
      });
    });

    // 新增牌組按鈕
    const btnOpenNewDeck = this.container.querySelector('#btnOpenNewDeckModal');
    const newDeckModal = this.container.querySelector('#newDeckModal') as HTMLElement;
    const btnCloseNewDeck = this.container.querySelector('#btnCloseNewDeckModal');
    const btnCancelNewDeck = this.container.querySelector('#btnCancelNewDeck');
    const newDeckBackdrop = this.container.querySelector('#newDeckBackdrop');
    const btnConfirmNewDeck = this.container.querySelector('#btnConfirmNewDeck');
    const newDeckNameInput = this.container.querySelector('#newDeckNameInput') as HTMLInputElement;
    const newDeckIconSelect = this.container.querySelector('#newDeckIconSelect') as HTMLSelectElement;

    const closeNewDeck = () => {
      if (newDeckModal) newDeckModal.style.display = 'none';
      if (newDeckNameInput) newDeckNameInput.value = '';
    };

    btnOpenNewDeck?.addEventListener('click', () => {
      if (newDeckModal) {
        newDeckModal.style.display = 'flex';
        setTimeout(() => newDeckNameInput?.focus(), 50);
      }
    });

    btnCloseNewDeck?.addEventListener('click', closeNewDeck);
    btnCancelNewDeck?.addEventListener('click', closeNewDeck);
    newDeckBackdrop?.addEventListener('click', closeNewDeck);

    btnConfirmNewDeck?.addEventListener('click', () => {
      const name = newDeckNameInput?.value.trim();
      if (!name) {
        alert('請輸入牌組名稱！');
        return;
      }
      const icon = newDeckIconSelect?.value || '📁';
      const created = addDeck(name, icon);
      closeNewDeck();
      this.currentDeckId = created.id;
      this.refreshCards();
      this.render();
    });

    // 卡片類型過濾 (全部 / 單字 / 句子)
    const filterBtns = this.container.querySelectorAll('.anki-filter-group .anki-pill-btn');
    filterBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const filter = target.dataset.filter as 'all' | 'word' | 'sentence';
        this.currentFilter = filter;
        this.currentCardIndex = 0;
        this.refreshCards();
        this.render();
      });
    });

    // 模式切換
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

    // 卡片庫管理
    const btnManage = this.container.querySelector('#btnManageDeck');
    btnManage?.addEventListener('click', () => {
      this.showDeckManager();
    });
  }

  /**
   * 渲染當前卡片 (包含小筆記區)
   */
  private renderCurrentCard(): void {
    const stage = this.container.querySelector('#ankiStage');
    if (!stage) return;

    if (this.currentCards.length === 0) {
      const allCards = getAllCards();
      const hasAnyCards = allCards.length > 0;
      const decks = getDecks();
      const currentDeck = decks.find((d) => d.id === this.currentDeckId);

      stage.innerHTML = `
        <div class="anki-empty-state">
          <div class="empty-icon">${hasAnyCards ? '🎉' : '📥'}</div>
          <h2 class="empty-title">
            ${hasAnyCards
              ? `${this.currentDeckId === 'all' ? '太棒了！' : `【${currentDeck?.name}】`} 今日複習已全數完成！`
              : '尚未收藏任何單字或句子'}
          </h2>
          <p class="empty-desc">
            ${hasAnyCards
              ? '此牌組目前沒有到期的卡片需要複習。持續保持記憶間隔，效果最佳！'
              : '在「新聞英打」練習時，點擊任何單字或按下句子右側的 ⭐ 收藏按鈕，即可將內容自動同步進 Anki 記憶卡庫！'}
          </p>
          <div class="empty-actions">
            ${hasAnyCards ? `
              <button class="btn btn-primary" id="btnCramAll">
                ⚡ 提前複習此牌組全部卡片
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
        const all = getAllCards();
        this.currentCards = all.filter((c) =>
          this.currentDeckId === 'all' ? true : c.deckId === this.currentDeckId
        );
        this.currentCardIndex = 0;
        this.isFlipped = false;
        this.renderCurrentCard();
      });

      stage.querySelector('#btnGoTyping')?.addEventListener('click', () => {
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
    const decks = getDecks();
    const cardDeck = decks.find((d) => d.id === card.deckId);

    stage.innerHTML = `
      <div class="anki-card-wrapper">
        <div class="anki-progress-bar">
          <div class="progress-left-info">
            <span class="card-deck-tag">${cardDeck?.icon || '📁'} ${cardDeck?.name || '預設牌組'}</span>
            <span class="progress-label">第 ${this.currentCardIndex + 1} / ${this.currentCards.length} 張</span>
          </div>
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

            <!-- 專屬自訂筆記區 (Notes) - 正面迷你展示 (若已有筆記) -->
            ${card.notes ? `
              <div class="card-notes-preview" title="點擊翻面可編輯筆記">
                <span class="notes-icon">📝 筆記：</span>
                <span class="notes-preview-text">${card.notes}</span>
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
              <div class="card-top-left">
                <span class="card-badge ${isWord ? 'badge-word' : 'badge-sentence'}">
                  ${isWord ? '📖 單字釋義' : '💬 雙語中文對照'}
                </span>
                <span class="card-deck-indicator">${cardDeck?.icon || '📁'} ${cardDeck?.name}</span>
              </div>
              <button class="card-speak-btn" id="cardSpeakBtnBack" title="播放發音 (TTS)">🔊</button>
            </div>

            <div class="card-back-content">
              <div class="card-original-title">${card.front}</div>
              ${card.phonetic ? `<div class="card-phonetic">${card.phonetic}</div>` : ''}
              
              <div class="card-meaning-box">
                <div class="meaning-text">${card.back.replace(/\n/g, '<br/>')}</div>
              </div>

              <!-- 小小的筆記區 (Personal Notes Box) -->
              <div class="card-notes-box">
                <div class="notes-box-header">
                  <span class="notes-box-title">📝 我的筆記 (Notes)：</span>
                  <span class="notes-box-status" id="notesStatusText">自動儲存</span>
                </div>
                <textarea
                  id="cardNotesTextarea"
                  class="card-notes-textarea"
                  placeholder="在此寫下個人備註、聯想記憶口訣、詞性搭配或重點用法..."
                  rows="2"
                >${card.notes || ''}</textarea>
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
   * 綁定卡片內各項按鈕、筆記輸入與翻面操作
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

    // 筆記輸入即時保存 (Debounced Auto-Save)
    if (this.isFlipped) {
      const textarea = this.container.querySelector('#cardNotesTextarea') as HTMLTextAreaElement;
      const statusText = this.container.querySelector('#notesStatusText');

      textarea?.addEventListener('input', () => {
        if (statusText) statusText.textContent = '儲存中...';
        if (this.notesDebounceTimer) {
          window.clearTimeout(this.notesDebounceTimer);
        }
        this.notesDebounceTimer = window.setTimeout(() => {
          updateCardNotes(card.id, textarea.value);
          card.notes = textarea.value.trim();
          if (statusText) statusText.textContent = '已保存 ✓';
        }, 400);
      });
    }

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
    const stats = getDeckStats(this.currentDeckId);
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
      if (this.container.offsetParent === null) return;

      const activeEl = document.activeElement;
      const isInput = activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement;

      // 如果在筆記區 textarea 輸入中，不攔截任何快捷鍵
      if (activeEl?.id === 'cardNotesTextarea') return;

      if (e.code === 'Space' && !this.isFlipped && !isInput) {
        e.preventDefault();
        this.flipCard();
        return;
      }

      if (this.isFlipped && !isInput) {
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
   * 顯示卡片庫管理彈窗 (含牌組歸屬與自訂筆記預覽)
   */
  private showDeckManager(): void {
    const modal = this.container.querySelector('#deckManagerModal') as HTMLElement;
    if (!modal) return;

    const cards = getAllCards();
    const decks = getDecks();

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
            placeholder="🔍 搜尋單字、句子、中文釋義或筆記內容..."
          />
          <div class="deck-count-badge">共 ${cards.length} 張卡片</div>
        </div>

        <div class="deck-cards-list" id="deckCardsList">
          ${cards.length === 0 ? `
            <div class="deck-empty">目前尚無卡片。請在打字練習中點擊單字或句子旁的 ⭐ 收藏。</div>
          ` : cards.map((card) => {
            const cardDeck = decks.find((d) => d.id === card.deckId);
            return `
              <div class="deck-card-row" data-card-id="${card.id}">
                <div class="row-type">
                  <span class="card-badge ${card.type === 'word' ? 'badge-word' : 'badge-sentence'}">
                    ${card.type === 'word' ? '單字' : '句子'}
                  </span>
                  <span class="card-deck-subtag">${cardDeck?.icon || '📁'} ${cardDeck?.name}</span>
                </div>
                <div class="row-main">
                  <div class="row-front">
                    <strong>${card.front}</strong>
                    ${card.phonetic ? `<span class="row-phonetic">${card.phonetic}</span>` : ''}
                  </div>
                  <div class="row-back">${card.back}</div>
                  ${card.notes ? `<div class="row-notes">📝 筆記：${card.notes}</div>` : ''}
                  ${card.context ? `<div class="row-context">例句：${card.context}</div>` : ''}
                </div>
                <div class="row-meta">
                  <select class="row-deck-select" data-card-id="${card.id}" title="移動所屬牌組">
                    ${decks.map((d) => `
                      <option value="${d.id}" ${d.id === card.deckId ? 'selected' : ''}>${d.icon || ''} ${d.name}</option>
                    `).join('')}
                  </select>
                  <span>間隔 ${Math.round(card.interval * 10) / 10} 天</span>
                  <span>熟練度 ${card.repetition}</span>
                </div>
                <div class="row-actions">
                  <button class="btn-icon btn-row-speak" title="發音" data-text="${card.front}">🔊</button>
                  <button class="btn-icon btn-row-delete" title="刪除此卡片" data-id="${card.id}">🗑️</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    modal.style.display = 'flex';

    modal.querySelector('#btnCloseModal')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });
    modal.querySelector('#modalBackdrop')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    // 移動牌組
    modal.querySelectorAll('.row-deck-select').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const target = e.currentTarget as HTMLSelectElement;
        const cardId = target.dataset.cardId;
        const newDeckId = target.value;
        if (cardId && newDeckId) {
          updateCardDeck(cardId, newDeckId);
          this.refreshCards();
          this.onStatsChanged?.();
        }
      });
    });

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
