// /server/archive-manager.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const ARCHIVE_FILE = path.join(DATA_DIR, 'news_archive.json');

export interface SentenceBlock {
  id: number;
  en: string;
  zh: string;
  startIndex: number;
  endIndex: number;
}

export interface NewsItem {
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

export interface ArchivedItem {
  category: string;
  savedAt: number; // 毫秒時間戳記 (Timestamp in ms)
  item: NewsItem;
}

export interface ArchiveStore {
  retentionDays: number;
  maxItemsPerCategory: number;
  items: ArchivedItem[];
}

/**
 * 離線新聞封存與過期清理管理器 (Offline News Archive Manager with Retention Policy)
 */
export class ArchiveManager {
  private store: ArchiveStore = {
    retentionDays: 7, // 預設保留最近 7 天
    maxItemsPerCategory: 50, // 每個分類上限 50 篇
    items: []
  };

  constructor() {
    this.ensureDataDir();
    this.loadFromFile();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadFromFile(): void {
    try {
      if (fs.existsSync(ARCHIVE_FILE)) {
        const raw = fs.readFileSync(ARCHIVE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.items)) {
          this.store = {
            retentionDays: typeof parsed.retentionDays === 'number' ? parsed.retentionDays : 7,
            maxItemsPerCategory: typeof parsed.maxItemsPerCategory === 'number' ? parsed.maxItemsPerCategory : 50,
            items: parsed.items
          };
          this.pruneExpired();
        }
      }
    } catch (err) {
      console.warn('[ArchiveManager] Failed to read archive file, initializing empty store:', err);
    }
  }

  private saveToFile(): void {
    try {
      this.ensureDataDir();
      fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(this.store, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ArchiveManager] Failed to write archive file:', err);
    }
  }

  /**
   * 清除超過保留天數之文章 (Evict Expired Articles)
   */
  private pruneExpired(): void {
    const cutoffTime = Date.now() - this.store.retentionDays * 24 * 60 * 60 * 1000;
    const initialLen = this.store.items.length;

    this.store.items = this.store.items.filter((entry) => entry.savedAt >= cutoffTime);

    if (this.store.items.length !== initialLen) {
      this.saveToFile();
    }
  }

  /**
   * 寫入或更新分類文章 (Save News Items with Deduplication & Capacity Limit)
   */
  public saveNews(category: string, newsList: NewsItem[]): void {
    const now = Date.now();
    const existingMap = new Map<string, ArchivedItem>();

    // 建立現有該分類的快速索引（以標題或連結為唯一識別）
    this.store.items
      .filter((x) => x.category === category)
      .forEach((entry) => {
        const key = entry.item.link || entry.item.title;
        existingMap.set(key, entry);
      });

    // 合併新文章
    for (const item of newsList) {
      const key = item.link || item.title;
      existingMap.set(key, {
        category,
        savedAt: now,
        item
      });
    }

    // 依時間排序並限制數量 (Sort by savedAt desc & slice)
    let categoryItems = Array.from(existingMap.values()).sort((a, b) => b.savedAt - a.savedAt);
    if (categoryItems.length > this.store.maxItemsPerCategory) {
      categoryItems = categoryItems.slice(0, this.store.maxItemsPerCategory);
    }

    // 更新回 store
    const otherItems = this.store.items.filter((x) => x.category !== category);
    this.store.items = [...categoryItems, ...otherItems];

    this.pruneExpired();
    this.saveToFile();
  }

  /**
   * 取得特定分類之離線封存文章 (Get Offline Archived News for Category)
   */
  public getNews(category: string): NewsItem[] {
    this.pruneExpired();
    return this.store.items
      .filter((entry) => entry.category === category)
      .sort((a, b) => b.savedAt - a.savedAt)
      .map((entry) => entry.item);
  }

  /**
   * 取得所有快取統計資訊 (Get Archive Statistics)
   */
  public getStats(): {
    totalCount: number;
    retentionDays: number;
    maxItemsPerCategory: number;
    categories: Record<string, number>;
  } {
    this.pruneExpired();
    const categoryCounts: Record<string, number> = {};

    this.store.items.forEach((entry) => {
      categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
    });

    return {
      totalCount: this.store.items.length,
      retentionDays: this.store.retentionDays,
      maxItemsPerCategory: this.store.maxItemsPerCategory,
      categories: categoryCounts
    };
  }

  /**
   * 更新保留天數設定 (Update Retention Days Policy)
   */
  public setRetentionDays(days: number): void {
    if (days >= 1 && days <= 90) {
      this.store.retentionDays = days;
      this.pruneExpired();
      this.saveToFile();
    }
  }

  /**
   * 清除所有本地離線封存 (Purge All Archive)
   */
  public clear(): void {
    this.store.items = [];
    this.saveToFile();
  }
}

export const archiveManager = new ArchiveManager();
