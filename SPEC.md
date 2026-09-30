# SPEC.md: 即時新聞英打與中英雙語對照學習功能規格文件 (Bilingual Translation Specification)

## 1. 概述 (Overview)
為現有的 Yahoo News Typing Trainer 增加即時繁體中文翻譯與雙語對齊學習功能。在練習英打的同時，在英文句子旁邊/上方即時呈現對應的繁體中文譯文，並提供開關讓使用者依需求切換。

## 2. 功能需求 (Functional Requirements)
1. **免金鑰後端翻譯整合 (Zero-Config Backend Translation Service):**
   - 透過 Google GTX 端點直接將 RSS 英文新聞內容翻譯為繁體中文 (`zh-TW`)。
   - 具備優雅降級 (Graceful Fallback)：若翻譯連線異常，仍正常提供純英文打字練習，不影響核心打字體驗。
   - 整合快取機制 (In-Memory Cache)：同一篇文章只翻譯一次，減少網路延遲與伺服器負載。
2. **句子級別對齊 (Sentence-Level Alignment):**
   - 將新聞文本分解為句子單元 (Sentences)。
   - 每個句子包含：
     - `en`: 英文原文句子
     - `zh`: 對應繁體中文翻譯
     - `startIndex`: 該句在全文中的起始索引
     - `endIndex`: 該句在全文中的結束索引
3. **前端雙語展示與互動 (Frontend UI/UX):**
   - 在打字區域內，英文句子上方緊鄰顯示精美對應的繁體中文翻譯。
   - **當前句高亮 (Current Sentence Focus):** 使用者打字進度所在的句子給予視覺聚焦樣式。
   - **翻譯切換開關 (Translation Toggle):** 在導航控制列新增「顯示中文翻譯 (Show Translation)」切換開關，預設開啟。
   - 保持游標 (Caret) 與打錯字上方標籤 (Typed Char Above Badge) 的精準定位。

## 3. 系統架構與資料結構 (Architecture & Data Schema)

### 3.1 句子資料結構 (Sentence Structure)
```typescript
export interface SentenceBlock {
  id: number;
  en: string;
  zh: string;
  startIndex: number;
  endIndex: number;
}

export interface NewsItemWithTranslation {
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
```

### 3.2 後端 API (Backend Endpoint)
- 修改 `GET /api/news`:
  - 抓取 RSS 項目時，異步發送翻譯請求並解析句段。
  - 將解析出的 `sentences` 存入 `FeedCacheManager`。

### 3.3 打字引擎與渲染 (Typing Engine & DOM Rendering)
- DOM 結構調整為句子區塊結構：
  ```html
  <div class="sentence-block" data-sentence-id="0">
    <div class="sentence-zh">隨著投資人解讀通膨數據，股市於週三上揚。</div>
    <div class="sentence-en">
      <span class="char ...">S</span><span class="char ...">t</span>...
    </div>
  </div>
  ```
- 打字邏輯依然維持字元級別索引（保持高效能平坦遍歷），但打字引擎在切換到新句子時，為對應的 `.sentence-block` 增加 `.active` 類別。

## 4. 實作步驟 (Implementation Checklist)
- [ ] 步驟 1: 建立後端翻譯服務與分句解析模組 (`server/translator.ts`)。
- [ ] 步驟 2: 更新 `server/index.ts`，在 RSS 抓取流程整合翻譯並擴充 API 回傳結構。
- [ ] 步驟 3: 修改 `src/styles.css`，新增雙語句子排版、中文翻譯提示、當前句高亮與切換樣式。
- [ ] 步驟 4: 修改 `index.html`，新增雙語翻譯切換開關 (`#toggleTranslation`)。
- [ ] 步驟 5: 重構 `src/typing-engine.ts` 與 `src/main.ts`，支援傳入 `sentences` 進行區塊渲染與句焦點連動。
- [ ] 步驟 6: 端到端測試 (End-to-End Verification) 驗證打字計時、正確率、游標定位與雙語翻譯顯示。
