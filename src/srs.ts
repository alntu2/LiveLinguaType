// file:///Users/yiching/repo06/wrk_antigravity/61_Typing/src/srs.ts
/**
 * @file srs.ts
 * @description 間隔重複記憶演算法 (SuperMemo-2 / SM-2 Spaced Repetition System) 與牌組/筆記管理核心模組
 */

export type CardType = 'word' | 'sentence';
export type SRSRating = 'again' | 'hard' | 'good' | 'easy';

export interface SRSDeck {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  createdAt: number;
}

export interface SRSCard {
  id: string;
  type: CardType;
  deckId: string;         // 所屬牌組 ID
  front: string;          // 單字或英文句子
  back: string;           // 中文翻譯 / 釋義
  phonetic?: string;      // 音標 (單字用)
  context?: string;       // 出處例句或新聞標題
  sourceArticle?: string; // 新聞來源
  notes?: string;         // 使用者自訂備忘筆記 (Notes)

  // SM-2 參數
  repetition: number;     // 成功複習次數
  interval: number;       // 當前間隔天數 (小數表示小於一天)
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

const CARDS_STORAGE_KEY = 'livelingua_srs_cards';
const DECKS_STORAGE_KEY = 'livelingua_srs_decks';

// 系統預設牌組清單
export const DEFAULT_DECKS: SRSDeck[] = [
  {
    id: 'default',
    name: '即時新聞 (Daily News)',
    icon: '📰',
    description: '從每日新聞英打自動收錄的單字與例句',
    createdAt: 1700000000000
  },
  {
    id: 'vocab',
    name: '核心生詞庫 (Vocabulary)',
    icon: '💡',
    description: '日常閱讀與練習中標記的重點詞彙',
    createdAt: 1700000000001
  },
  {
    id: 'sentences',
    name: '經典句型庫 (Notable Sentences)',
    icon: '💬',
    description: '優美時事句子與慣用語',
    createdAt: 1700000000002
  }
];

/**
 * 取得所有牌組清單
 */
export function getDecks(): SRSDeck[] {
  try {
    const raw = localStorage.getItem(DECKS_STORAGE_KEY);
    if (!raw) {
      saveDecks(DEFAULT_DECKS);
      return DEFAULT_DECKS;
    }
    const parsed: SRSDeck[] = JSON.parse(raw);
    if (!parsed || parsed.length === 0) {
      saveDecks(DEFAULT_DECKS);
      return DEFAULT_DECKS;
    }
    return parsed;
  } catch (error) {
    console.error('Failed to load decks from storage:', error);
    return DEFAULT_DECKS;
  }
}

/**
 * 儲存牌組清單
 */
export function saveDecks(decks: SRSDeck[]): void {
  try {
    localStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
  } catch (error) {
    console.error('Failed to save decks:', error);
  }
}

/**
 * 新增自訂牌組
 */
export function addDeck(name: string, icon: string = '📁', description?: string): SRSDeck {
  const decks = getDecks();
  const id = `deck_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newDeck: SRSDeck = {
    id,
    name: name.trim(),
    icon,
    description: description?.trim() || '',
    createdAt: Date.now()
  };
  decks.push(newDeck);
  saveDecks(decks);
  return newDeck;
}

/**
 * 刪除自訂牌組 (不能刪除預設牌組；被刪除牌組的卡片將歸類至 default)
 */
export function deleteDeck(deckId: string): boolean {
  if (deckId === 'default') return false;
  const decks = getDecks();
  const filtered = decks.filter((d) => d.id !== deckId);
  if (filtered.length !== decks.length) {
    saveDecks(filtered);

    // 將該牌組卡片移至 default
    const cards = getAllCards();
    let updated = false;
    for (const c of cards) {
      if (c.deckId === deckId) {
        c.deckId = 'default';
        updated = true;
      }
    }
    if (updated) {
      saveAllCards(cards);
    }
    return true;
  }
  return false;
}

/**
 * 取得所有儲存的卡片 (自動填補缺失的 deckId)
 */
export function getAllCards(): SRSCard[] {
  try {
    const raw = localStorage.getItem(CARDS_STORAGE_KEY);
    if (!raw) return [];
    const cards: SRSCard[] = JSON.parse(raw);
    let dirty = false;
    for (const card of cards) {
      if (!card.deckId) {
        card.deckId = card.type === 'sentence' ? 'sentences' : 'default';
        dirty = true;
      }
    }
    if (dirty) {
      saveAllCards(cards);
    }
    return cards;
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
    localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));
  } catch (error) {
    console.error('Failed to save SRS cards:', error);
  }
}

/**
 * 取得指定牌組的到期需複習卡片 (若未指定 deckId 則返回全部到期卡片)
 */
export function getDueCards(deckId?: string): SRSCard[] {
  const now = Date.now();
  const cards = getAllCards();
  return cards
    .filter((card) => {
      const matchDeck = !deckId || deckId === 'all' || card.deckId === deckId;
      return matchDeck && card.dueDate <= now;
    })
    .sort((a, b) => a.dueDate - b.dueDate);
}

/**
 * 取得指定牌組或整體的卡片庫統計數據
 */
export function getDeckStats(deckId?: string): DeckStats {
  const cards = getAllCards();
  const now = Date.now();
  let dueCount = 0;
  let learnedCount = 0;
  let wordCount = 0;
  let sentenceCount = 0;
  let totalCount = 0;

  for (const card of cards) {
    if (deckId && deckId !== 'all' && card.deckId !== deckId) {
      continue;
    }
    totalCount++;
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
    totalCount,
    wordCount,
    sentenceCount
  };
}

/**
 * 取得所有牌組及其對應統計數據
 */
export function getAllDecksWithStats(): Array<SRSDeck & { stats: DeckStats }> {
  const decks = getDecks();
  return decks.map((deck) => ({
    ...deck,
    stats: getDeckStats(deck.id)
  }));
}

/**
 * 依據 SM-2 演算法計算下次複習間隔
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
 * 更新卡片的自訂筆記 (Personal Notes)
 */
export function updateCardNotes(cardId: string, notes: string): boolean {
  const cards = getAllCards();
  const card = cards.find((c) => c.id === cardId);
  if (!card) return false;
  card.notes = notes.trim();
  saveAllCards(cards);
  return true;
}

/**
 * 更新卡片所屬牌組 (Move Card to Deck)
 */
export function updateCardDeck(cardId: string, deckId: string): boolean {
  const cards = getAllCards();
  const card = cards.find((c) => c.id === cardId);
  if (!card) return false;
  card.deckId = deckId;
  saveAllCards(cards);
  return true;
}

/**
 * 新增單字卡 (若已存在則不重複新增)
 */
export function addWordCard(
  word: string,
  phonetic: string,
  meaning: string,
  context?: string,
  sourceArticle?: string,
  deckId: string = 'vocab',
  notes?: string
): SRSCard {
  const cards = getAllCards();
  const normalized = word.trim().toLowerCase();
  const existing = cards.find((c) => c.type === 'word' && c.front.trim().toLowerCase() === normalized);

  if (existing) {
    existing.back = meaning || existing.back;
    existing.phonetic = phonetic || existing.phonetic;
    if (context) existing.context = context;
    if (sourceArticle) existing.sourceArticle = sourceArticle;
    if (notes) existing.notes = notes;
    saveAllCards(cards);
    return existing;
  }

  const newCard: SRSCard = {
    id: `word_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'word',
    deckId: deckId || 'vocab',
    front: word.trim(),
    back: meaning.trim(),
    phonetic: phonetic.trim(),
    context: context?.trim(),
    sourceArticle: sourceArticle?.trim(),
    notes: notes?.trim() || '',
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
 * 新增句子卡 (若已存在則不重複新增)
 */
export function addSentenceCard(
  english: string,
  chinese: string,
  sourceArticle?: string,
  deckId: string = 'sentences',
  notes?: string
): SRSCard {
  const cards = getAllCards();
  const normalized = english.trim().toLowerCase();
  const existing = cards.find(
    (c) => c.type === 'sentence' && c.front.trim().toLowerCase() === normalized
  );

  if (existing) {
    existing.back = chinese || existing.back;
    if (sourceArticle) existing.sourceArticle = sourceArticle;
    if (notes) existing.notes = notes;
    saveAllCards(cards);
    return existing;
  }

  const newCard: SRSCard = {
    id: `sent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'sentence',
    deckId: deckId || 'sentences',
    front: english.trim(),
    back: chinese.trim(),
    sourceArticle: sourceArticle?.trim(),
    notes: notes?.trim() || '',
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
        addWordCard(item.word, item.phonetic || '', item.meaning || '', undefined, undefined, 'vocab');
      }
    }
  } catch (err) {
    console.warn('Sync from wordbook warning:', err);
  }
}
