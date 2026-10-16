// /src/main.ts
import { TypingEngine, TypingMetrics, SentenceBlock } from './typing-engine';
import { speechService } from './speech-service';
import { keyboardSound, KeyboardSoundType } from './keyboard-sound';
import {
  syncFromWordbook,
  addWordCard,
  addSentenceCard,
  deleteCard,
  isSentenceStarred,
  getDeckStats,
  getAllCards,
  getDecks,
  addDeck
} from './srs';
import { AnkiView } from './anki-view';

interface Category {
  id: string;
  name: string;
}

interface NewsItem {
  id: string;
  title: string;
  titleZh?: string;
  summary: string;
  fullTypingText: string;
  sentences?: SentenceBlock[];
  pubDate: string;
  link: string;
  wordCount: number;
}

// 全域狀態 (State Management)
let currentCategory = 'top';
let currentNewsList: NewsItem[] = [];
let currentArticleIndex = 0;
let engine: TypingEngine | null = null;
let memoryCleanCount = 0;
let isOfflineMode = false;
let ankiView: AnkiView | null = null;
let currentActiveSentence: SentenceBlock | null = null;

// DOM 元素引用 (Element References)
const tabTyping = document.getElementById('tabTyping') as HTMLButtonElement;
const tabAnki = document.getElementById('tabAnki') as HTMLButtonElement;
const ankiNavBadge = document.getElementById('ankiNavBadge') as HTMLElement;
const typingViewWrapper = document.getElementById('typingViewWrapper') as HTMLElement;
const ankiViewWrapper = document.getElementById('ankiViewWrapper') as HTMLElement;
const btnStarActiveSentence = document.getElementById('btnStarActiveSentence') as HTMLButtonElement;
const btnOpenNCImportModal = document.getElementById('btnOpenNCImportModal') as HTMLButtonElement;
const nativeCampModal = document.getElementById('nativeCampModal') as HTMLElement;

const categoryNav = document.getElementById('categoryNav') as HTMLElement;
const articleSelect = document.getElementById('articleSelect') as HTMLSelectElement;
const toggleTranslation = document.getElementById('toggleTranslation') as HTMLInputElement;
const toggleCaseSensitive = document.getElementById('toggleCaseSensitive') as HTMLInputElement;
const toggleSpeech = document.getElementById('toggleSpeech') as HTMLInputElement;
const selectKeyboardSound = document.getElementById('selectKeyboardSound') as HTMLSelectElement;
const selectRetentionDays = document.getElementById('selectRetentionDays') as HTMLSelectElement;

const networkBadge = document.getElementById('networkBadge') as HTMLElement;
const networkStatusText = document.getElementById('networkStatusText') as HTMLElement;
const capsWarning = document.getElementById('capsWarning') as HTMLElement;

const newsWordCount = document.getElementById('newsWordCount') as HTMLElement;
const newsPubDate = document.getElementById('newsPubDate') as HTMLElement;
const newsOriginalLink = document.getElementById('newsOriginalLink') as HTMLAnchorElement;

const statWpm = document.getElementById('statWpm') as HTMLElement;
const statAccuracy = document.getElementById('statAccuracy') as HTMLElement;
const statProgress = document.getElementById('statProgress') as HTMLElement;
const statTime = document.getElementById('statTime') as HTMLElement;

const typingContainer = document.getElementById('typingContainer') as HTMLElement;
const typingBox = document.getElementById('typingBox') as HTMLElement;
const caret = document.getElementById('caret') as HTMLElement;
const hiddenInput = document.getElementById('hiddenInput') as HTMLInputElement;
const memoryStatusText = document.getElementById('memoryStatusText') as HTMLElement;

// 控制按鈕
const btnRestart = document.getElementById('btnRestart') as HTMLButtonElement;
const btnNextArticle = document.getElementById('btnNextArticle') as HTMLButtonElement;
const btnPurgeMemory = document.getElementById('btnPurgeMemory') as HTMLButtonElement;

// 單字即時查詞彈窗元素 (Dictionary Popover)
const dictPopover = document.getElementById('dictPopover') as HTMLElement;
const dictWord = document.getElementById('dictWord') as HTMLElement;
const dictPhonetic = document.getElementById('dictPhonetic') as HTMLElement;
const dictSpeakBtn = document.getElementById('dictSpeakBtn') as HTMLButtonElement;
const dictStarBtn = document.getElementById('dictStarBtn') as HTMLButtonElement;
const dictCloseBtn = document.getElementById('dictCloseBtn') as HTMLButtonElement;
const dictBody = document.getElementById('dictBody') as HTMLElement;

// 結果彈窗
const resultModal = document.getElementById('resultModal') as HTMLDialogElement;
const resultArticleTitle = document.getElementById('resultArticleTitle') as HTMLElement;
const modalFinalWpm = document.getElementById('modalFinalWpm') as HTMLElement;
const modalFinalAcc = document.getElementById('modalFinalAcc') as HTMLElement;
const modalFinalTime = document.getElementById('modalFinalTime') as HTMLElement;
const modalFinalErrors = document.getElementById('modalFinalErrors') as HTMLElement;
const modalBtnRestart = document.getElementById('modalBtnRestart') as HTMLButtonElement;
const modalBtnNext = document.getElementById('modalBtnNext') as HTMLButtonElement;

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateNetworkBadge(offline: boolean, cachedCount: number): void {
  isOfflineMode = offline;
  if (!networkBadge || !networkStatusText) return;

  if (offline) {
    networkBadge.className = 'network-badge offline';
    networkStatusText.textContent = `Offline (${cachedCount} 封存)`;
    networkBadge.title = `目前處於離線狀態，已載入本機封存之新聞與雙語對照 (${cachedCount} 篇)`;
  } else {
    networkBadge.className = 'network-badge online';
    networkStatusText.textContent = `Online (${cachedCount} 封存)`;
    networkBadge.title = `即時網路連線正常，本地已持久化備份 ${cachedCount} 篇新聞`;
  }
}

function updateDashboard(metrics: TypingMetrics): void {
  statWpm.textContent = metrics.wpm.toString();
  statAccuracy.innerHTML = `${metrics.accuracy}<span class="stat-unit">%</span>`;
  statProgress.innerHTML = `${metrics.progress}<span class="stat-unit">%</span>`;
  statTime.textContent = formatTime(metrics.elapsedSeconds);

  // 同步 CapsLock 狀態
  capsWarning.style.display = metrics.capsLockOn ? 'inline-block' : 'none';
}

function handleFinish(metrics: TypingMetrics): void {
  const currentArticle = currentNewsList[currentArticleIndex];
  if (currentArticle) {
    resultArticleTitle.textContent = currentArticle.titleZh
      ? `${currentArticle.titleZh} — ${currentArticle.title}`
      : currentArticle.title;
  } else {
    resultArticleTitle.textContent = '練習完成';
  }

  modalFinalWpm.textContent = metrics.wpm.toString();
  modalFinalAcc.textContent = `${metrics.accuracy}%`;
  modalFinalTime.textContent = `${metrics.elapsedSeconds}s`;
  modalFinalErrors.textContent = metrics.errorCount.toString();

  resultModal.showModal();
}

function recordMemoryPurge(actionDescription: string): void {
  memoryCleanCount++;
  memoryStatusText.textContent = `Memory Cleaned #${memoryCleanCount}: ${actionDescription}`;
  memoryStatusText.parentElement?.classList.add('flash');
  setTimeout(() => {
    memoryStatusText.parentElement?.classList.remove('flash');
  }, 1000);
}

const imeWarning = document.getElementById('imeWarning') as HTMLElement;
let imeTimeoutId: number | null = null;

function showImeWarning(detectedChar: string): void {
  imeWarning.textContent = `⚠️ 偵測到輸入中文/全形字元 [${detectedChar}]，請切換至英文輸入法 (ABC)`;
  imeWarning.style.display = 'inline-block';

  if (imeTimeoutId !== null) {
    window.clearTimeout(imeTimeoutId);
  }
  // 5 秒後自動隱藏
  imeTimeoutId = window.setTimeout(() => {
    imeWarning.style.display = 'none';
    imeTimeoutId = null;
  }, 5000);
}

function applyTranslationVisibility(): void {
  if (toggleTranslation && toggleTranslation.checked) {
    typingContainer.classList.remove('hide-translation');
  } else {
    typingContainer.classList.add('hide-translation');
  }
}

function loadArticleAtIndex(index: number): void {
  if (index < 0 || index >= currentNewsList.length) return;

  currentArticleIndex = index;
  const article = currentNewsList[index];

  // 更新新聞中繼資訊
  articleSelect.value = index.toString();
  newsWordCount.textContent = `${article.wordCount} Words`;
  newsPubDate.textContent = new Date(article.pubDate).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
  newsOriginalLink.href = article.link || '#';

  // 切換文章時停止上一句語音並關閉查詞彈窗
  speechService.stop();
  hideDictPopover();

  if (!engine) {
    engine = new TypingEngine({
      container: typingBox,
      caretElement: caret,
      caseSensitive: toggleCaseSensitive.checked,
      onMetricUpdate: updateDashboard,
      onFinish: (metrics) => {
        speechService.stop();
        handleFinish(metrics);
      },
      onCapsLockChange: (isCaps) => {
        capsWarning.style.display = isCaps ? 'inline-block' : 'none';
      },
      onImeDetected: (char) => {
        showImeWarning(char);
      },
      onSentenceChange: (_sentenceIndex, sentence) => {
        currentActiveSentence = sentence;
        updateSentenceStarButton(sentence);
        if (toggleSpeech && toggleSpeech.checked) {
          speechService.speak(sentence.en);
        }
      },
      onPlaySentenceAudio: (sentence) => {
        speechService.speak(sentence.en);
      },
      onKeyPress: (key) => {
        keyboardSound.playKey(key);
      },
      onWordClick: (word, rect) => {
        showDictPopover(word, rect);
      },
      onStart: () => {
        // 使用者敲下第一鍵開始打字時，若開啟語音朗讀，才進行首句真人朗讀
        if (toggleSpeech && toggleSpeech.checked) {
          const current = engine?.getCurrentSentence();
          if (current) {
            speechService.speak(current.en);
          }
        }
      }
    });
  } else {
    engine.caseSensitive = toggleCaseSensitive.checked;
  }

  // 傳入文章與分句譯文資料
  engine.loadText(article.fullTypingText, article.sentences || []);
  applyTranslationVisibility();

  // 更新首句 active sentence 狀態
  const firstSentence = engine.getCurrentSentence();
  currentActiveSentence = firstSentence;
  updateSentenceStarButton(firstSentence);

  recordMemoryPurge('DOM & Timers Recycled');

  // 自動聚焦輸入區域
  typingContainer.focus();
}

async function loadCategories(): Promise<void> {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    const categories: Category[] = data.categories || [];

    categoryNav.innerHTML = '';
    categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = `category-btn ${cat.id === currentCategory ? 'active' : ''}`;
      btn.textContent = cat.name;
      btn.onclick = () => {
        if (currentCategory === cat.id) return;
        currentCategory = cat.id;

        document.querySelectorAll('.category-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        loadNewsForCategory(currentCategory);
      };
      categoryNav.appendChild(btn);
    });
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

async function loadArchiveSettings(): Promise<void> {
  try {
    const res = await fetch('/api/archive/stats');
    if (res.ok) {
      const stats = await res.json();
      if (selectRetentionDays && stats.retentionDays) {
        selectRetentionDays.value = stats.retentionDays.toString();
      }
      updateNetworkBadge(false, stats.totalCount || 0);
    }
  } catch {
    // 斷網情況下從 localStorage 恢復設定
    const savedDays = localStorage.getItem('retention_days');
    if (savedDays && selectRetentionDays) {
      selectRetentionDays.value = savedDays;
    }
  }
}

async function loadNewsForCategory(category: string): Promise<void> {
  articleSelect.innerHTML = '<option value="">載入新聞與中譯中 (Loading articles & translation)...</option>';

  try {
    const res = await fetch(`/api/news?category=${category}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    currentNewsList = data.news || [];
    const isOffline = !!data.offline;

    // 瀏覽器端雙重快照備份 (LocalStorage Snapshot)
    if (!isOffline && currentNewsList.length > 0) {
      try {
        localStorage.setItem(`archive_news_${category}`, JSON.stringify(currentNewsList));
      } catch (e) {
        console.warn('LocalStorage quota exceeded or unavailable:', e);
      }
    }

    updateNetworkBadge(isOffline, currentNewsList.length);

    if (currentNewsList.length === 0) {
      articleSelect.innerHTML = '<option value="">目前此分類無文章 (No articles)</option>';
      return;
    }

    renderArticleSelect();
    loadArticleAtIndex(0);
  } catch (err) {
    console.warn('[Offline Mode] Network failed, attempting local browser storage fallback:', err);

    // 終極容錯：從瀏覽器 localStorage 載入快照 (Browser Storage Fallback)
    const localCached = localStorage.getItem(`archive_news_${category}`);
    if (localCached) {
      try {
        currentNewsList = JSON.parse(localCached);
        updateNetworkBadge(true, currentNewsList.length);
        renderArticleSelect();
        loadArticleAtIndex(0);
        return;
      } catch (e) {
        console.error('Failed to parse localStorage cache:', e);
      }
    }

    updateNetworkBadge(true, 0);
    articleSelect.innerHTML = '<option value="">無法取得新聞，請連上網路後重試 (No Offline Cache Available)</option>';
  }
}

function renderArticleSelect(): void {
  articleSelect.innerHTML = '';
  currentNewsList.forEach((item, idx) => {
    const opt = document.createElement('option');
    opt.value = idx.toString();
    const zhPrefix = item.titleZh && item.titleZh !== item.title
      ? `[${item.titleZh.slice(0, 24)}...] `
      : '';
    opt.textContent = `${idx + 1}. ${zhPrefix}${item.title.slice(0, 60)}...`;
    articleSelect.appendChild(opt);
  });
}

async function triggerFullMemoryCleanup(): Promise<void> {
  if (engine) {
    engine.dispose();
    engine = null;
  }

  currentNewsList.length = 0;

  try {
    await fetch('/api/admin/clear-cache', { method: 'POST' });
  } catch (e) {
    console.warn('Backend clear-cache notification failed:', e);
  }

  recordMemoryPurge('Frontend & Backend Purged');
  await loadNewsForCategory(currentCategory);
}

// 事件註冊 (Event Listeners)
if (selectRetentionDays) {
  selectRetentionDays.addEventListener('change', async () => {
    const days = parseInt(selectRetentionDays.value, 10);
    localStorage.setItem('retention_days', days.toString());

    try {
      const res = await fetch('/api/archive/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionDays: days })
      });
      if (res.ok) {
        const data = await res.json();
        updateNetworkBadge(isOfflineMode, data.stats?.totalCount || 0);
      }
    } catch (e) {
      console.warn('Failed to update retention days on server:', e);
    }
  });
}

if (toggleTranslation) {
  toggleTranslation.addEventListener('change', () => {
    applyTranslationVisibility();
    // 重新校正游標位置
    requestAnimationFrame(() => {
      if (engine) {
        // @ts-ignore
        engine.updateCaretPosition?.();
      }
    });
  });
}

if (toggleSpeech) {
  const savedSpeech = localStorage.getItem('speech_enabled');
  if (savedSpeech !== null) {
    toggleSpeech.checked = savedSpeech === 'true';
  }
  speechService.enabled = toggleSpeech.checked;

  toggleSpeech.addEventListener('change', () => {
    speechService.enabled = toggleSpeech.checked;
    localStorage.setItem('speech_enabled', toggleSpeech.checked.toString());
    if (!toggleSpeech.checked) {
      speechService.stop();
    } else {
      const current = engine?.getCurrentSentence();
      if (current) {
        speechService.speak(current.en);
      }
    }
  });
}

// 全域快捷鍵：Ctrl + J 重聽當前進行句發音
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
    e.preventDefault();
    const current = engine?.getCurrentSentence();
    if (current) {
      speechService.speak(current.en);
    }
  }
});

// 機械鍵盤音效偏好讀取與切換
if (selectKeyboardSound) {
  const savedSound = localStorage.getItem('keyboard_sound') as KeyboardSoundType | null;
  if (savedSound) {
    selectKeyboardSound.value = savedSound;
    keyboardSound.currentType = savedSound;
  }

  selectKeyboardSound.addEventListener('change', () => {
    const type = selectKeyboardSound.value as KeyboardSoundType;
    keyboardSound.currentType = type;
    localStorage.setItem('keyboard_sound', type);
    // 切換時試聽一次按鍵敲擊音
    keyboardSound.playKey('a');
  });
}

toggleCaseSensitive.addEventListener('change', () => {
  if (engine) {
    engine.caseSensitive = toggleCaseSensitive.checked;
  }
});

articleSelect.addEventListener('change', (e) => {
  const target = e.target as HTMLSelectElement;
  const index = parseInt(target.value, 10);
  if (!isNaN(index)) {
    loadArticleAtIndex(index);
  }
});

btnRestart.addEventListener('click', () => {
  if (engine) engine.reset();
});

btnNextArticle.addEventListener('click', () => {
  if (currentNewsList.length === 0) return;
  const nextIdx = (currentArticleIndex + 1) % currentNewsList.length;
  loadArticleAtIndex(nextIdx);
});

btnPurgeMemory.addEventListener('click', () => {
  triggerFullMemoryCleanup();
});

modalBtnRestart.addEventListener('click', () => {
  resultModal.close();
  if (engine) engine.reset();
});

modalBtnNext.addEventListener('click', () => {
  resultModal.close();
  if (currentNewsList.length > 0) {
    const nextIdx = (currentArticleIndex + 1) % currentNewsList.length;
    loadArticleAtIndex(nextIdx);
  }
});

// ---------------------------------------------------------------------------
// 微型詞典即時查詞與生詞本 (Dictionary Popover & Wordbook)
// ---------------------------------------------------------------------------
interface DictEntry {
  pos: string;
  terms: string[];
}

interface DictResponse {
  word: string;
  translation?: string;
  phonetic?: string;
  dictEntries?: DictEntry[];
  meanings?: Array<{ pos: string; meanings: string[] }>;
  meaning?: string;
  error?: string;
}

interface StarredWord {
  word: string;
  phonetic: string;
  meaning: string;
  addedAt: string;
}

let currentInspectWord = '';
let currentInspectPhonetic = '';
let currentInspectMeaning = '';

function getWordbook(): StarredWord[] {
  try {
    const raw = localStorage.getItem('livelingua_wordbook');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWordbook(list: StarredWord[]): void {
  localStorage.setItem('livelingua_wordbook', JSON.stringify(list));
}

function isWordStarred(word: string): boolean {
  const list = getWordbook();
  return list.some((item) => item.word.toLowerCase() === word.toLowerCase());
}

function updateStarBtnState(starred: boolean): void {
  if (!dictStarBtn) return;
  if (starred) {
    dictStarBtn.classList.add('starred');
    dictStarBtn.title = '已收藏至生詞本 (點擊移除)';
  } else {
    dictStarBtn.classList.remove('starred');
    dictStarBtn.title = '加入我的生詞本 (Star Word)';
  }
}

function toggleStarCurrentWord(): void {
  if (!currentInspectWord) return;
  const list = getWordbook();
  const index = list.findIndex((item) => item.word.toLowerCase() === currentInspectWord.toLowerCase());
  if (index >= 0) {
    list.splice(index, 1);
    saveWordbook(list);
    updateStarBtnState(false);

    // 同步從 SRS 卡片庫移除
    const allCards = getAllCards();
    const target = allCards.find(
      (c) => c.type === 'word' && c.front.trim().toLowerCase() === currentInspectWord.trim().toLowerCase()
    );
    if (target) {
      deleteCard(target.id);
    }
  } else {
    list.unshift({
      word: currentInspectWord,
      phonetic: currentInspectPhonetic,
      meaning: currentInspectMeaning,
      addedAt: new Date().toISOString()
    });
    saveWordbook(list);
    updateStarBtnState(true);

    // 同步存入 SRS 卡片庫
    addWordCard(
      currentInspectWord,
      currentInspectPhonetic,
      currentInspectMeaning,
      currentActiveSentence?.en || '',
      currentNewsList[currentArticleIndex]?.title || ''
    );
  }

  updateAnkiBadge();
  ankiView?.refreshCards();
}

function hideDictPopover(): void {
  if (!dictPopover || dictPopover.style.display === 'none') return;
  dictPopover.style.display = 'none';
  currentInspectWord = '';
  if (engine) {
    engine.clearWordHighlight();
  }
}

async function showDictPopover(word: string, rect: DOMRect): Promise<void> {
  if (!dictPopover || !typingContainer) return;

  currentInspectWord = word;
  currentInspectPhonetic = '';
  currentInspectMeaning = '';

  dictWord.textContent = word;
  dictPhonetic.textContent = '';
  updateStarBtnState(isWordStarred(word));

  dictBody.innerHTML = `
    <div class="dict-loading">
      <span class="dict-spinner"></span>
      <span>查詢繁中釋義中...</span>
    </div>
  `;

  // 計算相對於 typingContainer 的局部座標
  const containerRect = typingContainer.getBoundingClientRect();
  const popoverWidth = 330;
  const popoverEstimatedHeight = 220;

  let left = rect.left - containerRect.left;
  if (left + popoverWidth > containerRect.width - 16) {
    left = Math.max(16, containerRect.width - popoverWidth - 16);
  }
  if (left < 16) left = 16;

  let top = rect.bottom - containerRect.top + 10;
  if (top + popoverEstimatedHeight > containerRect.height - 16 && rect.top - containerRect.top > popoverEstimatedHeight + 20) {
    top = rect.top - containerRect.top - popoverEstimatedHeight - 10;
  }

  dictPopover.style.left = `${left}px`;
  dictPopover.style.top = `${top}px`;
  dictPopover.style.display = 'block';

  try {
    const res = await fetch(`/api/dict?word=${encodeURIComponent(word)}`);
    if (!res.ok) throw new Error('API 回應異常');
    const data: DictResponse = await res.json();

    if (currentInspectWord.toLowerCase() !== word.toLowerCase()) return;

    if (data.phonetic) {
      currentInspectPhonetic = `/${data.phonetic}/`;
      dictPhonetic.textContent = currentInspectPhonetic;
    } else {
      dictPhonetic.textContent = '';
    }

    currentInspectMeaning = data.translation || (data.dictEntries?.[0]?.terms?.[0]) || data.meaning || '';

    let html = '';
    if (data.translation) {
      html += `<div class="dict-single-meaning">主要釋義：<strong>${data.translation}</strong></div>`;
    }

    if (data.dictEntries && data.dictEntries.length > 0) {
      data.dictEntries.forEach((group) => {
        html += `
          <div class="dict-pos-group">
            <div class="dict-pos-header"><span class="dict-pos-tag">${group.pos}</span></div>
            <ul class="dict-meanings">
              ${group.terms.map((m) => `<li>${m}</li>`).join('')}
            </ul>
          </div>
        `;
      });
    } else if (data.meanings && data.meanings.length > 0) {
      data.meanings.forEach((group) => {
        html += `
          <div class="dict-pos-group">
            <div class="dict-pos-header"><span class="dict-pos-tag">${group.pos}</span></div>
            <ul class="dict-meanings">
              ${group.meanings.map((m) => `<li>${m}</li>`).join('')}
            </ul>
          </div>
        `;
      });
    } else if (!data.translation && data.meaning) {
      html += `<div class="dict-single-meaning">${data.meaning}</div>`;
    }

    if (!html) {
      html = `<div class="dict-error">查無詳細釋義</div>`;
    }
    dictBody.innerHTML = html;
  } catch (err) {
    if (currentInspectWord.toLowerCase() === word.toLowerCase()) {
      dictBody.innerHTML = `<div class="dict-error">連線逾時或查無釋義</div>`;
    }
  }
}

// 綁定查詞卡片操作事件
if (dictCloseBtn) {
  dictCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideDictPopover();
    typingContainer.focus();
  });
}

if (dictSpeakBtn) {
  dictSpeakBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentInspectWord) {
      speechService.speak(currentInspectWord);
    }
  });
}

if (dictStarBtn) {
  dictStarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleStarCurrentWord();
  });
}

// 監聽 Esc 關閉彈窗
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dictPopover && dictPopover.style.display !== 'none') {
    hideDictPopover();
    typingContainer.focus();
  }
});

// 點擊彈窗外部區域自動關閉
document.addEventListener('pointerdown', (e) => {
  if (!dictPopover || dictPopover.style.display === 'none') return;
  const target = e.target as HTMLElement;
  if (!dictPopover.contains(target) && !target.closest('.char')) {
    hideDictPopover();
  }
});

// ---------------------------------------------------------------------------
// Anki 整合與句子收藏處理 (Anki & Sentence Starring Integration)
// ---------------------------------------------------------------------------
function updateAnkiBadge(): void {
  const stats = getDeckStats();
  if (stats.dueCount > 0) {
    ankiNavBadge.textContent = stats.dueCount.toString();
    ankiNavBadge.style.display = 'inline-block';
  } else {
    ankiNavBadge.style.display = 'none';
  }
}

function updateSentenceStarButton(sentence: SentenceBlock | null): void {
  if (!btnStarActiveSentence) return;
  if (!sentence || !sentence.en) {
    btnStarActiveSentence.style.display = 'none';
    return;
  }
  btnStarActiveSentence.style.display = 'inline-block';
  const starred = isSentenceStarred(sentence.en);
  if (starred) {
    btnStarActiveSentence.classList.add('starred');
    btnStarActiveSentence.textContent = '★ 已存入卡片庫';
    btnStarActiveSentence.title = '點擊從卡片庫移除此句子 (Remove from Flashcards)';
  } else {
    btnStarActiveSentence.classList.remove('starred');
    btnStarActiveSentence.textContent = '⭐ 收藏當前句至卡片庫';
    btnStarActiveSentence.title = '將此句與雙語中文加入記憶卡片庫 (Save to Flashcards)';
  }
}

function toggleStarActiveSentence(): void {
  if (!currentActiveSentence || !currentActiveSentence.en) return;
  const starred = isSentenceStarred(currentActiveSentence.en);
  if (starred) {
    const cards = getAllCards();
    const target = cards.find(
      (c) => c.type === 'sentence' && c.front.trim().toLowerCase() === currentActiveSentence!.en.trim().toLowerCase()
    );
    if (target) {
      deleteCard(target.id);
    }
  } else {
    addSentenceCard(
      currentActiveSentence.en,
      currentActiveSentence.zh || '',
      currentNewsList[currentArticleIndex]?.title || ''
    );
  }
  updateSentenceStarButton(currentActiveSentence);
  updateAnkiBadge();
  ankiView?.refreshCards();
}

function switchMainView(view: 'typing' | 'anki'): void {
  if (view === 'typing') {
    tabTyping.classList.add('active');
    tabTyping.setAttribute('aria-selected', 'true');
    tabAnki.classList.remove('active');
    tabAnki.setAttribute('aria-selected', 'false');

    typingViewWrapper.style.display = 'block';
    ankiViewWrapper.style.display = 'none';

    // 聚焦輸入框
    setTimeout(() => {
      typingContainer.focus();
    }, 50);
  } else {
    tabAnki.classList.add('active');
    tabAnki.setAttribute('aria-selected', 'true');
    tabTyping.classList.remove('active');
    tabTyping.setAttribute('aria-selected', 'false');

    typingViewWrapper.style.display = 'none';
    ankiViewWrapper.style.display = 'block';

    // 暫停打字語音朗讀與關閉微型詞典
    speechService.stop();
    hideDictPopover();

    // 渲染或重新整理 Anki 視圖
    if (!ankiView) {
      ankiView = new AnkiView(ankiViewWrapper, () => {
        updateAnkiBadge();
      });
    }
    ankiView.render();
  }
}

// 綁定 Tab 切換與句子收藏事件
if (tabTyping) {
  tabTyping.addEventListener('click', () => switchMainView('typing'));
}

if (tabAnki) {
  tabAnki.addEventListener('click', () => switchMainView('anki'));
}

if (btnStarActiveSentence) {
  btnStarActiveSentence.addEventListener('click', () => {
    toggleStarActiveSentence();
  });
}

// ---------------------------------------------------------------------------
// Native Camp 課堂聊天紀錄匯入與解析 (Native Camp Chat History Parser)
// ---------------------------------------------------------------------------
function showNativeCampImportModal(): void {
  if (!nativeCampModal) return;

  const defaultDateStr = new Date().toISOString().slice(0, 10);
  const sampleChat = `Teacher: Hello! How are you today?
You: I am good!
Teacher: What did you do on weekend?
You said: I am go to shopping with friend.
Better say: I went shopping with my friend.
Teacher: Great! Remember that "go" in past tense is "went".
Teacher: Also, another useful expression:
Teacher: browse around
Teacher: It means to look at items in a store without necessarily intending to buy.
You said: I like to eat delicious foods.
Better say: I enjoy eating good food.
Teacher: See you next time!`;

  nativeCampModal.innerHTML = `
    <div class="nc-modal-overlay" id="ncOverlay">
      <div class="nc-modal-card">
        <div class="nc-modal-header">
          <div class="nc-modal-title">
            <span>🗣️</span>
            <span>Native Camp 課堂聊天紀錄智慧匯入 (Chat Importer)</span>
          </div>
          <button class="nc-modal-close" id="ncBtnClose" title="關閉">&times;</button>
        </div>
        <div class="nc-modal-body">
          <div class="nc-hint-box">
            💡 <strong>快速上手：</strong>在 Native Camp 課後複製聊天室歷史紀錄（包含 <code>You said / Better say</code> 修正或老師給的單字片語），直接全選貼在下方。系統會自動去除寒暄客套雜訊，並調用雙語引擎補齊繁體中文釋義！
          </div>

          <div class="form-group" style="display:flex; gap:10px; align-items:center;">
            <label style="color:#94a3b8; font-size:0.88rem; white-space:nowrap; font-weight:600;">課堂名稱：</label>
            <input type="text" id="ncLessonTitle" class="form-input" style="flex:1;" value="Native Camp 課堂筆記 (${defaultDateStr})" placeholder="例如: Native Camp 日常會話複習" />
            <button type="button" id="ncBtnLoadSample" class="anki-btn anki-btn-secondary" style="font-size:0.8rem; padding:6px 10px;">📄 載入範例</button>
          </div>

          <div class="form-group">
            <label style="color:#94a3b8; font-size:0.88rem; font-weight:600; display:block; margin-bottom:6px;">聊天室紀錄 (Raw Chat Text)：</label>
            <textarea id="ncChatInput" class="md-preview-textarea" style="height:180px; font-family:var(--font-mono); font-size:0.85rem;" placeholder="請在此貼上 Native Camp 聊天內容...&#10;例：&#10;You said: I am go to shopping.&#10;Better say: I went shopping.&#10;browse around"></textarea>
          </div>

          <div class="nc-options-grid">
            <label class="nc-checkbox-label">
              <input type="checkbox" id="ncOptTyping" checked />
              <span>⌨️ 轉換為當前英打文章進行練習</span>
            </label>
            <label class="nc-checkbox-label">
              <input type="checkbox" id="ncOptFlashcards" checked />
              <span>🗂️ 存入記憶卡牌組 (🗣️ Native Camp)</span>
            </label>
          </div>

          <div id="ncStatusMsg" style="display:none; font-size:0.88rem; padding:8px 12px; border-radius:6px;"></div>
        </div>
        <div class="nc-modal-footer">
          <button type="button" class="anki-btn anki-btn-secondary" id="ncBtnCancel">取消</button>
          <button type="button" class="nc-btn-submit" id="ncBtnParse">🚀 開始智慧解析與匯入</button>
        </div>
      </div>
    </div>
  `;

  nativeCampModal.style.display = 'block';

  const overlay = document.getElementById('ncOverlay') as HTMLElement;
  const btnClose = document.getElementById('ncBtnClose') as HTMLButtonElement;
  const btnCancel = document.getElementById('ncBtnCancel') as HTMLButtonElement;
  const btnLoadSample = document.getElementById('ncBtnLoadSample') as HTMLButtonElement;
  const btnParse = document.getElementById('ncBtnParse') as HTMLButtonElement;
  const chatInput = document.getElementById('ncChatInput') as HTMLTextAreaElement;
  const titleInput = document.getElementById('ncLessonTitle') as HTMLInputElement;
  const optTyping = document.getElementById('ncOptTyping') as HTMLInputElement;
  const optFlashcards = document.getElementById('ncOptFlashcards') as HTMLInputElement;
  const statusMsg = document.getElementById('ncStatusMsg') as HTMLElement;

  const closeModal = () => {
    nativeCampModal.style.display = 'none';
    nativeCampModal.innerHTML = '';
  };

  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  btnLoadSample.addEventListener('click', () => {
    chatInput.value = sampleChat;
  });

  btnParse.addEventListener('click', async () => {
    const rawText = chatInput.value.trim();
    if (!rawText) {
      alert('請先貼上 Native Camp 聊天內容！');
      chatInput.focus();
      return;
    }

    const title = titleInput.value.trim() || `Native Camp 課堂筆記 (${defaultDateStr})`;
    const createTyping = optTyping.checked;
    const createFlashcards = optFlashcards.checked;

    if (!createTyping && !createFlashcards) {
      alert('請至少勾選一項匯入目標（英打練習 或 記憶卡牌庫）！');
      return;
    }

    btnParse.disabled = true;
    btnParse.textContent = '⏳ 解析與即時翻譯中...';
    statusMsg.style.display = 'block';
    statusMsg.style.background = 'rgba(56, 189, 248, 0.15)';
    statusMsg.style.color = '#38bdf8';
    statusMsg.textContent = '🔄 正在剖析錯句修正、過濾雜訊並補全繁體中文翻譯...';

    try {
      const resp = await fetch('/api/nativecamp/parse-and-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, title })
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${resp.status}`);
      }

      const result = await resp.json();
      const { items, typingArticle } = result;

      if (!items || items.length === 0) {
        statusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
        statusMsg.style.color = '#f87171';
        statusMsg.textContent = '⚠️ 聊天內容中未辨識到有效練習句或單字，請檢查文字內容。';
        btnParse.disabled = false;
        btnParse.textContent = '🚀 開始智慧解析與匯入';
        return;
      }

      // 1. 若勾選「存入記憶卡牌組」
      if (createFlashcards) {
        // 確保或新增 Native Camp 專屬牌組
        const decks = getDecks();
        let ncDeck = decks.find((d) => d.id === 'nativecamp' || d.name.includes('Native Camp'));
        if (!ncDeck) {
          ncDeck = addDeck('🗣️ Native Camp 課堂筆記', '🗣️', '由 Native Camp 課堂對話紀錄智慧萃取的複習卡片');
          ncDeck.id = 'nativecamp'; // 給定標誌性 ID
        }

        for (const item of items) {
          if (item.type === 'word') {
            addWordCard(
              item.front,
              item.phonetic || '',
              item.back,
              item.context || '',
              title,
              ncDeck.id,
              item.notes || ''
            );
          } else {
            addSentenceCard(
              item.front,
              item.back,
              title,
              ncDeck.id,
              item.notes || ''
            );
          }
        }
        updateAnkiBadge();
      }

      // 2. 若勾選「轉換為當前英打文章進行練習」
      if (createTyping && typingArticle) {
        // 插入到當前文章列表最前列
        currentNewsList.unshift(typingArticle);
        renderArticleSelect();
        // 切換回英打主視圖
        switchMainView('typing');
        loadArticleAtIndex(0);
      }

      statusMsg.style.background = 'rgba(34, 197, 94, 0.15)';
      statusMsg.style.color = '#4ade80';
      statusMsg.textContent = `🎉 成功解析 ${items.length} 個複習要點！已為您同步完成。`;

      setTimeout(() => {
        closeModal();
      }, 900);
    } catch (err: any) {
      console.error('Native Camp parse failed:', err);
      statusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
      statusMsg.style.color = '#f87171';
      statusMsg.textContent = `❌ 解析失敗：${err.message || '請確認後端連線正常'}`;
      btnParse.disabled = false;
      btnParse.textContent = '🚀 開始智慧解析與匯入';
    }
  });
}

if (btnOpenNCImportModal) {
  btnOpenNCImportModal.addEventListener('click', () => {
    showNativeCampImportModal();
  });
}

typingContainer.addEventListener('click', () => {
  typingContainer.classList.add('is-active');
  hiddenInput.focus();
});

window.addEventListener('DOMContentLoaded', async () => {
  // 自動將現有生字本同步至 SRS 卡片庫
  syncFromWordbook();
  updateAnkiBadge();

  applyTranslationVisibility();
  await loadArchiveSettings();
  await loadCategories();
  await loadNewsForCategory(currentCategory);
});
