// /server/translator.ts
import { translate } from 'google-translate-api-x';

export interface SentenceBlock {
  id: number;
  en: string;
  zh: string;
  startIndex: number;
  endIndex: number;
}

export interface TranslationResult {
  titleZh: string;
  fullZh: string;
  sentences: SentenceBlock[];
}

/**
 * 透過專業 google-translate-api-x 套件進行可靠翻譯 (支援 TKK RPC 簽名，免金鑰且穩定不限流)
 */
async function robustTranslate(text: string, retries = 2): Promise<string> {
  if (!text || !text.trim()) return '';

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await translate(text.trim(), { to: 'zh-TW', forceBatch: true });
      if (res && res.text) {
        return res.text.trim();
      }
    } catch (err) {
      if (attempt === retries) {
        console.warn(`[Translator] Translation failed after ${retries} retries:`, err);
        return '';
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }

  return '';
}

/**
 * 將文章拆解並比對各句位置與翻譯 (Translate and Align Sentences)
 */
export async function translateArticle(
  titleEn: string,
  _summaryEn: string,
  fullTypingText: string
): Promise<TranslationResult> {
  // 1. 拆解英文句子：以句號、問號、驚嘆號後接空白為界切分
  const rawSentences = fullTypingText
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (rawSentences.length === 0) {
    return {
      titleZh: titleEn,
      fullZh: '',
      sentences: []
    };
  }

  try {
    // 2. 分塊批次翻譯 (每批最多 12 句)
    const chunkSize = 12;
    const chunks: string[][] = [];
    for (let i = 0; i < rawSentences.length; i += chunkSize) {
      chunks.push(rawSentences.slice(i, i + chunkSize));
    }

    const translatedSentences: string[] = [];
    for (const chunk of chunks) {
      const payload = chunk.join('\n');
      const translatedBlob = await robustTranslate(payload);
      const lines = translatedBlob.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

      // 若回傳行數與句子數吻合，直接加入
      if (lines.length === chunk.length) {
        translatedSentences.push(...lines);
      } else {
        // 若斷行被合併或數量不一致，進行個別句補充翻譯
        for (let i = 0; i < chunk.length; i++) {
          if (lines[i]) {
            translatedSentences.push(lines[i]);
          } else {
            const singleZh = await robustTranslate(chunk[i]);
            translatedSentences.push(singleZh || chunk[i]);
          }
        }
      }
    }

    // 3. 逐句計算在全文中的起訖索引並對應繁中翻譯
    const sentences: SentenceBlock[] = [];
    let currentSearchPos = 0;

    for (let i = 0; i < rawSentences.length; i++) {
      const enSentence = rawSentences[i];
      const start = fullTypingText.indexOf(enSentence, currentSearchPos);
      const startIndex = start !== -1 ? start : currentSearchPos;
      const endIndex = startIndex + enSentence.length;
      currentSearchPos = endIndex;

      let matchedZh = (translatedSentences[i] || '').trim();
      if (!matchedZh) {
        matchedZh = await robustTranslate(enSentence);
      }

      sentences.push({
        id: i,
        en: enSentence,
        zh: matchedZh,
        startIndex,
        endIndex
      });
    }

    // 標題繁體中文
    let titleZh = sentences[0]?.zh || '';
    if (!titleZh || titleZh === titleEn) {
      titleZh = (await robustTranslate(titleEn)) || titleEn;
    }

    return {
      titleZh,
      fullZh: sentences.map((s) => s.zh).join(' '),
      sentences
    };
  } catch (err) {
    console.error('[Translator] Translation error, executing resilient fallback:', err);

    // 降級逐句容錯
    const fallbackSentences: SentenceBlock[] = [];
    let currentSearchPos = 0;

    for (let i = 0; i < rawSentences.length; i++) {
      const enSentence = rawSentences[i];
      const start = fullTypingText.indexOf(enSentence, currentSearchPos);
      const startIndex = start !== -1 ? start : currentSearchPos;
      const endIndex = startIndex + enSentence.length;
      currentSearchPos = endIndex;

      const zh = await robustTranslate(enSentence);

      fallbackSentences.push({
        id: i,
        en: enSentence,
        zh,
        startIndex,
        endIndex
      });
    }

    let titleZh = fallbackSentences[0]?.zh || titleEn;
    if (titleZh === titleEn) {
      titleZh = (await robustTranslate(titleEn)) || titleEn;
    }

    return {
      titleZh,
      fullZh: fallbackSentences.map((s) => s.zh).join(' '),
      sentences: fallbackSentences
    };
  }
}
