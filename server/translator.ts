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
 * 透過 Google GTX POST 端點進行免金鑰翻譯 (Robust POST-based Translation)
 * 使用 POST 傳遞 payload，避免 GET 請求在長文本時發生 HTTP 414 (URI Too Long) 或 400 錯誤。
 */
async function callGoogleGtxPost(text: string, retries = 2): Promise<string> {
  if (!text || !text.trim()) return '';

  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t';

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        body: new URLSearchParams({ q: text }).toString(),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const rawJson = (await response.json()) as any;
      let fullTranslated = '';

      if (Array.isArray(rawJson) && Array.isArray(rawJson[0])) {
        for (const item of rawJson[0]) {
          if (Array.isArray(item) && typeof item[0] === 'string') {
            fullTranslated += item[0];
          }
        }
      }

      return fullTranslated;
    } catch (err) {
      if (attempt === retries) {
        throw err;
      }
      // 短暫退避後重試
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    } finally {
      clearTimeout(timeoutId);
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
    // 2. 分塊處理 (Chunking) 以避免超過 API 單次限制 (每批最多 12 句或 1800 字元)
    const chunks: string[][] = [];
    let currentChunk: string[] = [];
    let currentChunkLen = 0;

    for (const sent of rawSentences) {
      if (currentChunk.length >= 12 || currentChunkLen + sent.length > 1800) {
        if (currentChunk.length > 0) chunks.push(currentChunk);
        currentChunk = [sent];
        currentChunkLen = sent.length;
      } else {
        currentChunk.push(sent);
        currentChunkLen += sent.length;
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    // 逐 Chunk 進行翻譯
    const translatedSentences: string[] = [];
    for (const chunk of chunks) {
      const payload = chunk.join('\n');
      const translatedBlob = await callGoogleGtxPost(payload);
      const lines = translatedBlob.split('\n').map((l) => l.trim());

      // 若回傳行數與句子數吻合，直接加入
      if (lines.length === chunk.length) {
        translatedSentences.push(...lines);
      } else {
        // 若斷行被合併或增加，按順序對齊補齊
        for (let i = 0; i < chunk.length; i++) {
          translatedSentences.push(lines[i] || lines[0] || '');
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

      const matchedZh = (translatedSentences[i] || '').trim();

      sentences.push({
        id: i,
        en: enSentence,
        zh: matchedZh,
        startIndex,
        endIndex
      });
    }

    // 標題繁體中文：若第一句中譯完整則用第一句，或單獨翻譯標題
    let titleZh = sentences[0]?.zh || '';
    if (!titleZh || titleZh === titleEn) {
      try {
        titleZh = (await callGoogleGtxPost(titleEn)) || titleEn;
      } catch {
        titleZh = titleEn;
      }
    }

    return {
      titleZh,
      fullZh: sentences.map((s) => s.zh).join(' '),
      sentences
    };
  } catch (err) {
    console.error('[Translator] Translation error, attempting sentence fallback:', err);

    // 備援方案：嘗試至少翻譯標題與前 8 句
    const fallbackSentences: SentenceBlock[] = [];
    let currentSearchPos = 0;

    for (let i = 0; i < rawSentences.length; i++) {
      const enSentence = rawSentences[i];
      const start = fullTypingText.indexOf(enSentence, currentSearchPos);
      const startIndex = start !== -1 ? start : currentSearchPos;
      const endIndex = startIndex + enSentence.length;
      currentSearchPos = endIndex;

      let zh = '';
      if (i < 8) {
        try {
          zh = await callGoogleGtxPost(enSentence);
        } catch {
          zh = '';
        }
      }

      fallbackSentences.push({
        id: i,
        en: enSentence,
        zh,
        startIndex,
        endIndex
      });
    }

    return {
      titleZh: fallbackSentences[0]?.zh || titleEn,
      fullZh: '',
      sentences: fallbackSentences
    };
  }
}
