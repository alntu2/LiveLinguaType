import express, { Request, Response } from 'express';
import cors from 'cors';
import Parser from 'rss-parser';
import { translate } from 'google-translate-api-x';
import { SentenceBlock, translateArticle } from './translator';
import { archiveManager } from './archive-manager';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// RSS 解析器 (RSS Parser)
const parser = new Parser({
  customFields: {
    item: ['content:encoded', 'description']
  }
});

// Yahoo 新聞與官方旗下分類清單 (Categories)
const CATEGORIES: Record<string, { name: string; url: string }> = {
  top: { name: 'Top Stories (頭條新聞)', url: 'https://news.yahoo.com/rss/' },
  finance: { name: 'Yahoo Finance (商業金融)', url: 'https://finance.yahoo.com/news/rssindex' },
  sports: { name: 'Yahoo Sports (體育動態)', url: 'https://sports.yahoo.com/rss/' },
  tech: { name: 'Tech & Innovation (科技趨勢)', url: 'https://techcrunch.com/feed/' }
};

interface NewsItem {
  id: string;
  title: string;
  titleZh: string;
  summary: string;
  fullTypingText: string;
  sentences: SentenceBlock[];
  pubDate: string;
  link: string;
  wordCount: number;
}

interface CacheEntry {
  timestamp: number;
  data: NewsItem[];
}

// 記憶體快取管理器 (In-Memory Cache with TTL & Eviction)
class FeedCacheManager {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 分鐘快取 (TTL)
  private readonly MAX_ENTRIES = 20; // 容量上限限制 (Capacity Limit)

  get(key: string): NewsItem[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.TTL_MS) {
      // 釋放已過期快取物件 (Evict Expired Entry)
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: NewsItem[]): void {
    // 若達到容量上限，主動刪除最舊的鍵值 (LRU/FIFO Pruning)
    if (this.cache.size >= this.MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      timestamp: Date.now(),
      data
    });
  }

  // 顯式釋放所有快取 (Explicit Cache Purge)
  clear(): void {
    this.cache.clear();
  }
}

const feedCache = new FeedCacheManager();

// 文字正規化與 HTML 清洗 (Text Normalization & Sanitization)
function sanitizeText(raw: string): string {
  if (!raw) return '';

  return raw
    .replace(/<[^>]+>/g, '') // 移除 HTML 標籤
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[\u2018\u2019]/g, "'") // 轉換單引號
    .replace(/[\u201C\u201D]/g, '"') // 轉換雙引號
    .replace(/[\u2013\u2014]/g, '-') // 轉換破折號
    .replace(/\s+/g, ' ') // 壓縮多餘空白
    .trim();
}

// 取得可用新聞分類
app.get('/api/categories', (_req: Request, res: Response) => {
  const list = Object.entries(CATEGORIES).map(([key, value]) => ({
    id: key,
    name: value.name
  }));
  res.json({ categories: list });
});

// 擷取特定分類新聞列表
app.get('/api/news', async (req: Request, res: Response) => {
  const categoryKey = (req.query.category as string) || 'top';
  const category = CATEGORIES[categoryKey] || CATEGORIES.top;

  try {
    // 檢查快取 (Check Cache)
    const cached = feedCache.get(categoryKey);
    if (cached) {
      res.json({ source: category.name, cached: true, count: cached.length, news: cached });
      return;
    }

    // 發起 RSS 請求 (Fetch RSS Feed)
    const feed = await parser.parseURL(category.url);

    const rawItems = (feed.items || [])
      .map((item, index) => {
        const title = sanitizeText(item.title || '');
        // 優先取用摘要欄位，避免直接灌入高達兩萬字的全文
        let rawSummary = sanitizeText(item.contentSnippet || item.description || item.content || '');

        // 若摘要長度超過 2500 字元，在完整句號處進行合理截斷，維持打字練習的良好節奏 (2~5分鐘一篇)
        if (rawSummary.length > 2500) {
          const cut = rawSummary.slice(0, 2500);
          const lastPeriod = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
          if (lastPeriod > 1000) {
            rawSummary = cut.slice(0, lastPeriod + 1).trim();
          } else {
            rawSummary = cut.trim() + '.';
          }
        }

        // 組合標題與摘要做為練習文本
        const fullTypingText = `${title}. ${rawSummary}`.trim();
        const wordCount = fullTypingText.split(/\s+/).filter(Boolean).length;

        return {
          index,
          title,
          summary: rawSummary,
          fullTypingText,
          pubDate: item.pubDate || new Date().toISOString(),
          link: item.link || '',
          wordCount
        };
      })
      // 過濾太短或無效的文章，最多取前 8 篇以達到秒開響應
      .filter((item) => item.wordCount >= 10)
      .slice(0, 8);

    // 進行非同步並行翻譯 (Parallel Translation with Promise.all)
    const items: NewsItem[] = await Promise.all(
      rawItems.map(async (item) => {
        const translation = await translateArticle(item.title, item.summary, item.fullTypingText);

        return {
          id: `${categoryKey}-${item.index}-${Date.now()}`,
          title: item.title,
          titleZh: translation.titleZh || item.title,
          summary: item.summary,
          fullTypingText: item.fullTypingText,
          sentences: translation.sentences,
          pubDate: item.pubDate,
          link: item.link,
          wordCount: item.wordCount
        };
      })
    );

    // 寫入快取 (Write to Cache)
    feedCache.set(categoryKey, items);

    // 持久化保存至本地封存檔案 (Persist to Local Offline Archive)
    archiveManager.saveNews(categoryKey, items);

    res.json({
      source: category.name,
      cached: false,
      offline: false,
      count: items.length,
      news: items
    });
  } catch (error) {
    console.warn('[API Server] Network request failed, attempting offline archive fallback:', error);

    // 斷網降級：從本地封存庫讀取新聞 (Offline Archive Fallback)
    const offlineNews = archiveManager.getNews(categoryKey);
    if (offlineNews.length > 0) {
      res.json({
        source: category.name,
        cached: true,
        offline: true,
        count: offlineNews.length,
        news: offlineNews,
        message: '⚠️ 目前處於離線狀態，已自動載入本機封存之新聞與雙語對照內容 (Loaded from Offline Archive)'
      });
      return;
    }

    res.status(500).json({
      error: '無法解析 Yahoo 新聞且本地無可用離線封存 (Failed to fetch and no offline data)',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 取得離線封存狀態與統計 (Archive Stats Endpoint)
app.get('/api/archive/stats', (_req: Request, res: Response) => {
  const stats = archiveManager.getStats();
  res.json(stats);
});

// 更新離線快取保留天數 (Archive Retention Policy Endpoint)
app.post('/api/archive/settings', (req: Request, res: Response) => {
  const { retentionDays } = req.body;
  if (typeof retentionDays === 'number' && retentionDays >= 1 && retentionDays <= 90) {
    archiveManager.setRetentionDays(retentionDays);
    res.json({
      success: true,
      message: `保留天數已設定為 ${retentionDays} 天 (Retention days updated)`,
      stats: archiveManager.getStats()
    });
    return;
  }
  res.status(400).json({ error: '無效的保留天數，需為 1 至 90 之間的數值 (Invalid retentionDays)' });
});

// 清除離線封存資料 (Purge Offline Archive Endpoint)
app.post('/api/archive/clear', (_req: Request, res: Response) => {
  archiveManager.clear();
  res.json({ success: true, message: '離線封存資料已全數清除 (Offline archive cleared)' });
});

// 單字字典快取 (In-Memory Word Dictionary Cache)
const dictCache = new Map<string, any>();

// 單字即時查詞 API (Instant Word Dictionary Lookup Endpoint)
app.get('/api/dict', async (req: Request, res: Response) => {
  const rawWord = ((req.query.word as string) || '').trim().toLowerCase();
  const cleanWord = rawWord.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');

  if (!cleanWord) {
    res.status(400).json({ error: '請提供欲查詢之有效英文單字 (Invalid word)' });
    return;
  }

  // 1. 檢查記憶體快取
  if (dictCache.has(cleanWord)) {
    res.json(dictCache.get(cleanWord));
    return;
  }

  const result = {
    word: cleanWord,
    translation: '',
    phonetic: '',
    dictEntries: [] as Array<{ pos: string; terms: string[] }>
  };

  // 1. 使用 google-translate-api-x 進行高可靠翻譯 (取得繁中核心釋義)
  try {
    const transRes = await translate(cleanWord, { to: 'zh-TW' });
    if (transRes && transRes.text && transRes.text.toLowerCase() !== cleanWord) {
      result.translation = transRes.text.trim();
    }
  } catch (err) {
    console.warn('[Dictionary] google-translate-api-x lookup failed:', err);
  }

  // 2. 向權威 Yahoo 奇摩字典抓取國際音標 (IPA) 與專業詞典釋義
  try {
    const yahooUrl = `https://tw.dictionary.search.yahoo.com/search?p=${encodeURIComponent(cleanWord)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const yahooRes = await fetch(yahooUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeout);

    if (yahooRes.ok) {
      const html = await yahooRes.text();

      // 解析音標 IPA[xxx] 或 DJ[xxx]
      const ipaMatch = html.match(/class="fz-14"[^>]*>(?:IPA|DJ)\[([^\]]+)\]/);
      if (ipaMatch && ipaMatch[1]) {
        result.phonetic = ipaMatch[1].trim();
      }

      // 解析釋義
      const expMatch = html.match(/class="[^"]*dictionaryExplanation[^"]*"[^>]*>([^<]+)/g);
      if (expMatch && expMatch.length > 0) {
        const terms = expMatch
          .map((e) => e.replace(/<[^>]+>|class="[^"]*dictionaryExplanation[^"]*"[^>]*>/g, '').trim())
          .filter(Boolean)
          .slice(0, 5);

        if (terms.length > 0) {
          if (!result.translation) {
            result.translation = terms[0];
          }
          result.dictEntries.push({
            pos: '奇摩詞典釋義',
            terms
          });
        }
      }
    }
  } catch (err) {
    console.warn('[Dictionary] Yahoo dictionary lookup failed:', err);
  }

  // 若仍無釋義且以 s 結尾，查詢單數原型
  if (!result.translation && cleanWord.endsWith('s') && cleanWord.length > 3) {
    const singular = cleanWord.endsWith('es') ? cleanWord.slice(0, -2) : cleanWord.slice(0, -1);
    try {
      const transRes = await translate(singular, { to: 'zh-TW' });
      if (transRes && transRes.text && transRes.text.toLowerCase() !== singular) {
        result.translation = `${transRes.text.trim()} (複數)`;
        result.dictEntries.push({
          pos: '名詞 (複數)',
          terms: [transRes.text.trim()]
        });
      }
    } catch {}
  }

  // 若取得任何翻譯，寫入快取並返回
  if (result.translation || result.dictEntries.length > 0) {
    if (dictCache.size > 500) {
      const oldest = dictCache.keys().next().value;
      if (oldest) dictCache.delete(oldest);
    }
    dictCache.set(cleanWord, result);
    res.json(result);
    return;
  }

  res.json({
    word: cleanWord,
    translation: '',
    phonetic: '',
    dictEntries: [],
    error: '暫無此詞詳細釋義 (No definition found)'
  });
});

// 手動觸發快取釋放與記憶體清理 (Manual Cache Eviction Endpoint)
app.post('/api/admin/clear-cache', (_req: Request, res: Response) => {
  feedCache.clear();
  // 提示垃圾回收機制 (Garbage Collection Trigger if --expose-gc is enabled)
  if (global.gc) {
    global.gc();
  }
  res.json({ message: '快取已成功釋放 (Cache purged successfully)' });
});

app.listen(PORT, () => {
  console.log(`[API Server] Yahoo News Proxy running on http://localhost:${PORT}`);
});
