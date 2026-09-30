// /src/main.ts
import { TypingEngine, TypingMetrics, SentenceBlock } from './typing-engine';

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

// DOM 元素引用 (Element References)
const categoryNav = document.getElementById('categoryNav') as HTMLElement;
const articleSelect = document.getElementById('articleSelect') as HTMLSelectElement;
const toggleTranslation = document.getElementById('toggleTranslation') as HTMLInputElement;
const toggleCaseSensitive = document.getElementById('toggleCaseSensitive') as HTMLInputElement;
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
  newsOriginalLink.href = article.link;

  if (!engine) {
    engine = new TypingEngine({
      container: typingBox,
      caretElement: caret,
      caseSensitive: toggleCaseSensitive.checked,
      onMetricUpdate: updateDashboard,
      onFinish: handleFinish,
      onCapsLockChange: (isCaps) => {
        capsWarning.style.display = isCaps ? 'inline-block' : 'none';
      },
      onImeDetected: (char) => {
        showImeWarning(char);
      }
    });
  } else {
    engine.caseSensitive = toggleCaseSensitive.checked;
  }

  // 傳入文章與分句譯文資料
  engine.loadText(article.fullTypingText, article.sentences || []);
  applyTranslationVisibility();
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

async function loadNewsForCategory(category: string): Promise<void> {
  articleSelect.innerHTML = '<option value="">載入新聞與中譯中 (Loading articles & translation)...</option>';

  try {
    const res = await fetch(`/api/news?category=${category}`);
    const data = await res.json();
    currentNewsList = data.news || [];

    if (currentNewsList.length === 0) {
      articleSelect.innerHTML = '<option value="">目前此分類無文章 (No articles)</option>';
      return;
    }

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

    loadArticleAtIndex(0);
  } catch (err) {
    console.error('Failed to load news:', err);
    articleSelect.innerHTML = '<option value="">無法取得新聞 (Network Error)</option>';
  }
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
  await loadCategories();
  await loadNewsForCategory(currentCategory);
});
