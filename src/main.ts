// /src/main.ts
import { TypingEngine, TypingMetrics, SentenceBlock } from './typing-engine';
import { speechService } from './speech-service';
import { keyboardSound, KeyboardSoundType } from './keyboard-sound';

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

// DOM 元素引用 (Element References)
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

  // 切換文章時停止上一句語音
  speechService.stop();

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
        if (toggleSpeech && toggleSpeech.checked) {
          speechService.speak(sentence.en);
        }
      },
      onPlaySentenceAudio: (sentence) => {
        speechService.speak(sentence.en);
      },
      onKeyPress: (key) => {
        keyboardSound.playKey(key);
      }
    });
  } else {
    engine.caseSensitive = toggleCaseSensitive.checked;
  }

  // 傳入文章與分句譯文資料
  engine.loadText(article.fullTypingText, article.sentences || []);
  applyTranslationVisibility();

  // 若開啟語音朗讀，初次進入文章時自動發音第一句
  if (toggleSpeech && toggleSpeech.checked && article.sentences && article.sentences[0]) {
    speechService.speak(article.sentences[0].en);
  }

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

typingContainer.addEventListener('click', () => {
  typingContainer.classList.add('is-active');
  hiddenInput.focus();
});

window.addEventListener('DOMContentLoaded', async () => {
  applyTranslationVisibility();
  await loadArchiveSettings();
  await loadCategories();
  await loadNewsForCategory(currentCategory);
});
