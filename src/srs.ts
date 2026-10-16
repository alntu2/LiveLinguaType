// file:///Users/yiching/repo06/wrk_antigravity/61_Typing/src/srs.ts
/**
 * @file srs.ts
 * @description 間隔重複記憶演算法 (SuperMemo-2 / SM-2 Spaced Repetition System) 核心模組
 */

export type CardType = 'word' | 'sentence';
export type SRSRating = 'again' | 'hard' | 'good' | 'easy';

export interface SRSCard {
  id: string;
  type: CardType;
  front: string;          // 單字或英文句子
  back: string;           // 中文翻譯 / 釋義
  phonetic?: string;      // 音標 (單字用)
  context?: string;       // 出處例句或新聞標題
  sourceArticle?: string; // 新聞來源

  // SM-2 參數
  repetition: number;     // 成功複習次數
  interval: number;       // 當前間隔天數 (小數表示小於一天，如 0.007 約 10分鐘)
  easeFactor: number;     // 難易度係數 (預設 2.5，最低 1.3)
  dueDate: number;        // 下次應複習時間戳 (Epoch ms)
  lastReviewed?: number;  // 上次複習時間戳
  createdAt: number;      // 建立時間戳
}

export interface DeckStats {
  dueCount: number;
  learnedCount: number;
  totalCount: number;
  wordCount: number;
  sentenceCount: number;
}

const STORAGE_KEY = 'livelingua_srs_cards';

/**
 * 取得所有儲存的卡片
 */
export function getAllCards(): SRSCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to load SRS cards from storage:', error);
    return [];
  }
}

/**
 * 儲存所有卡片
 */
export function saveAllCards(cards: SRSCard[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch (error) {
    console.error('Failed to save SRS cards:', error);
  }
}

/**
 * 取得當前到期需複習的卡片 (按到期時間先後排序)
 */
export function getDueCards(): SRSCard[] {
  const now = Date.now();
  const cards = getAllCards();
  return cards
    .filter((card) => card.dueDate <= now)
    .sort((a, b) => a.dueDate - b.dueDate);
}

/**
 * 取得卡片庫統計數據
 */
export function getDeckStats(): DeckStats {
  const cards = getAllCards();
  const now = Date.now();
  let dueCount = 0;
  let learnedCount = 0;
  let wordCount = 0;
  let sentenceCount = 0;

  for (const card of cards) {
    if (card.dueDate <= now) {
      dueCount++;
    }
    if (card.repetition >= 2) {
      learnedCount++;
    }
    if (card.type === 'word') {
      wordCount++;
    } else {
      sentenceCount++;
    }
  }

  return {
    dueCount,
    learnedCount,
    totalCount: cards.length,
    wordCount,
    sentenceCount
  };
}

/**
 * 依據 SM-2 演算法計算下次複習間隔
 * 
 * 評分標準：
 * - again (重來, q=1): 重置次數，10分鐘後再背
 * - hard (困難, q=3): 間隔維持 1.2 倍或 1 天
 * - good (良好, q=4): 標準間隔遞增 (1天 -> 3天 -> interval * EF)
 * - easy (簡單, q=5): 獎勵間隔 (1天 -> 4天 -> interval * EF * 1.3)
 */
export function calculateSM2(card: SRSCard, rating: SRSRating): {
  repetition: number;
  interval: number;
  easeFactor: number;
  dueDate: number;
} {
  let { repetition, interval, easeFactor } = card;
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  let quality = 4;
  switch (rating) {
    case 'again':
      quality = 1;
      break;
    case 'hard':
      quality = 3;
      break;
    case 'good':
      quality = 4;
      break;
    case 'easy':
      quality = 5;
      break;
  }

  // 調整 Ease Factor (最小限制在 1.3)
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  if (quality < 3) {
    // 答錯 / 重來
    repetition = 0;
    interval = 10 / (24 * 60); // 10 分鐘
  } else {
    // 答對 (hard, good, easy)
    if (repetition === 0) {
      interval = rating === 'easy' ? 2 : 1; // 1~2 天
    } else if (repetition === 1) {
      interval = rating === 'easy' ? 5 : (rating === 'hard' ? 2 : 3); // 2~5 天
    } else {
      let bonus = 1.0;
      if (rating === 'easy') bonus = 1.3;
      if (rating === 'hard') bonus = 0.8;
      interval = Math.round(interval * easeFactor * bonus);
    }
    repetition += 1;
  }

  // 計算到期時間
  const dueOffsetMs = interval < 1 ? interval * ONE_DAY : Math.round(interval) * ONE_DAY;
  const dueDate = now + dueOffsetMs;

  return {
    repetition,
    interval,
    easeFactor,
    dueDate
  };
}

/**
 * 複習卡片並儲存更新
 */
export function reviewCard(cardId: string, rating: SRSRating): SRSCard | null {
  const cards = getAllCards();
  const index = cards.findIndex((c) => c.id === cardId);
  if (index === -1) return null;

  const card = cards[index];
  const updatedSM2 = calculateSM2(card, rating);

  cards[index] = {
    ...card,
    ...updatedSM2,
    lastReviewed: Date.now()
  };

  saveAllCards(cards);
  return cards[index];
}

/**
 * 新增單字卡 (若已存在則不重複新增)
 */
export function addWordCard(
  word: string,
  phonetic: string,
  meaning: string,
  context?: string,
  sourceArticle?: string
): SRSCard {
  const cards = getAllCards();
  const normalized = word.trim().toLowerCase();
  const existing = cards.find((c) => c.type === 'word' && c.front.trim().toLowerCase() === normalized);

  if (existing) {
    // 更新釋義與出處
    existing.back = meaning || existing.back;
    existing.phonetic = phonetic || existing.phonetic;
    if (context) existing.context = context;
    if (sourceArticle) existing.sourceArticle = sourceArticle;
    saveAllCards(cards);
    return existing;
  }

  const newCard: SRSCard = {
    id: `word_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'word',
    front: word.trim(),
    back: meaning.trim(),
    phonetic: phonetic.trim(),
    context: context?.trim(),
    sourceArticle: sourceArticle?.trim(),
    repetition: 0,
    interval: 0,
    easeFactor: 2.5,
    dueDate: Date.now(), // 立即進入待複習
    createdAt: Date.now()
  };

  cards.unshift(newCard);
  saveAllCards(cards);
  return newCard;
}

/**
 * 新增句子卡 (若已存在則不重複新增)
 */
export function addSentenceCard(
  english: string,
  chinese: string,
  sourceArticle?: string
): SRSCard {
  const cards = getAllCards();
  const normalized = english.trim().toLowerCase();
  const existing = cards.find(
    (c) => c.type === 'sentence' && c.front.trim().toLowerCase() === normalized
  );

  if (existing) {
    existing.back = chinese || existing.back;
    if (sourceArticle) existing.sourceArticle = sourceArticle;
    saveAllCards(cards);
    return existing;
  }

  const newCard: SRSCard = {
    id: `sent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'sentence',
    front: english.trim(),
    back: chinese.trim(),
    sourceArticle: sourceArticle?.trim(),
    repetition: 0,
    interval: 0,
    easeFactor: 2.5,
    dueDate: Date.now(),
    createdAt: Date.now()
  };

  cards.unshift(newCard);
  saveAllCards(cards);
  return newCard;
}

/**
 * 刪除卡片
 */
export function deleteCard(cardId: string): boolean {
  const cards = getAllCards();
  const filtered = cards.filter((c) => c.id !== cardId);
  if (filtered.length !== cards.length) {
    saveAllCards(filtered);
    return true;
  }
  return false;
}

/**
 * 檢查句子是否已被收藏
 */
export function isSentenceStarred(english: string): boolean {
  const cards = getAllCards();
  const normalized = english.trim().toLowerCase();
  return cards.some((c) => c.type === 'sentence' && c.front.trim().toLowerCase() === normalized);
}

/**
 * 自動將既有的 livelingua_wordbook 同步匯入 SRS 卡片庫
 */
export function syncFromWordbook(): void {
  try {
    const raw = localStorage.getItem('livelingua_wordbook');
    if (!raw) return;
    const wordbook: Array<{ word: string; phonetic: string; meaning: string }> = JSON.parse(raw);
    for (const item of wordbook) {
      if (item.word) {
        addWordCard(item.word, item.phonetic || '', item.meaning || '');
      }
    }
  } catch (err) {
    console.warn('Sync from wordbook warning:', err);
  }
}
