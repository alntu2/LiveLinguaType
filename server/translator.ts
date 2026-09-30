// /server/translator.ts

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
 * 透過 Google GTX 端點進行免金鑰翻譯 (Zero-Config Google Translate)
 */
async function callGoogleGtx(text: string): Promise<string> {
  if (!text || !text.trim()) return '';

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(text)}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const rawJson = (await response.json()) as any;
    let fullTranslated = '';

    // rawJson[0] 包含所有譯文片段
    if (Array.isArray(rawJson) && Array.isArray(rawJson[0])) {
      for (const item of rawJson[0]) {
        if (Array.isArray(item) && typeof item[0] === 'string') {
          fullTranslated += item[0];
        }
      }
    }

    return fullTranslated;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 將文章拆解並比對各句位置與翻譯 (Translate and Align Sentences - High Performance Single-Pass)
 */
export async function translateArticle(
  titleEn: string,
  _summaryEn: string,
  fullTypingText: string
): Promise<TranslationResult> {
  try {
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

    // 2. 以換行符連接各句，發送單一 HTTP 請求獲取句子對齊翻譯
    const joinedPayload = rawSentences.join('\n');
    const translatedBlob = await callGoogleGtx(joinedPayload);
    const translatedSentences = translatedBlob.split('\n');

    // 3. 逐句計算在全文中的字元起迄索引，並對應中文翻譯
    const sentences: SentenceBlock[] = [];
    let currentSearchPos = 0;

    for (let i = 0; i < rawSentences.length; i++) {
      const enSentence = rawSentences[i];
      const start = fullTypingText.indexOf(enSentence, currentSearchPos);
      const startIndex = start !== -1 ? start : currentSearchPos;
      const endIndex = startIndex + enSentence.length;
      currentSearchPos = endIndex;

      const matchedZh = (translatedSentences[i] || '').trim();

      sentences.push({
        id: i,
        en: enSentence,
        zh: matchedZh,
        startIndex,
        endIndex
      });
    }

    // 第一句通常包含標題的翻譯，做為整篇文章的標題中文
    const titleZh = (sentences[0] && sentences[0].zh) ? sentences[0].zh : titleEn;

    return {
      titleZh,
      fullZh: translatedBlob,
      sentences
    };
  } catch (err) {
    console.error('[Translator] Translation fallback triggered:', err);
    // 降級優雅回傳 (Graceful Fallback)
    return {
      titleZh: titleEn,
      fullZh: '',
      sentences: [
        {
          id: 0,
          en: fullTypingText,
          zh: '',
          startIndex: 0,
          endIndex: fullTypingText.length
        }
      ]
    };
  }
}
