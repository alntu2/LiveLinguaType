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
- [x] 步驟 5: 重構 `src/typing-engine.ts` 與 `src/main.ts`，支援傳入 `sentences` 進行區塊渲染與句焦點連動。
- [x] 步驟 6: 端到端測試 (End-to-End Verification) 驗證打字計時、正確率、游標定位與雙語翻譯顯示。

---

## 5. 離線持久化與天數保留規範 (Offline Persistence & Retention Policy)

### 5.1 核心需求 (Core Requirements)
1. **持久化保存 (Persistent Storage):**
   - 將線上下載並翻譯好的 RSS 新聞永久寫入本地 JSON 封存檔案 (`server/data/news_archive.json`)。
   - 瀏覽器端同步存入 `localStorage`，形成雙重備份。
2. **天數與篇數保留策略 (Retention Eviction Policy):**
   - 預設保留最近 7 天內的文章，使用者可在介面自訂保留天數（3 天 / 7 天 / 14 天 / 30 天）或篇數上限（最多 50 篇/分類）。
   - 存檔與讀取時自動過濾並清理過期資料。
3. **無網容錯與離線狀態提示 (Offline Resilience & UI Indicators):**
   - 網路中斷時自動降級讀取本地封存資料，返回標記 `offline: true`。
   - UI 頂部即時顯示連線狀態：`在線即時 (Online)` 或 `離線快取 (Offline)`，並顯示目前已庫存雙語文章篇數。
   - 提供「下載目前分類離線備份」與「清理過期離線資料」按鈕。

---

## 6. 真人語音句子朗讀規範 (Web Speech TTS Specification)

### 6.1 核心需求 (Core Requirements)
1. **零依賴原生語音 (Zero-Config Native Web Speech API):**
   * 運用瀏覽器原生 `window.speechSynthesis` 與 `SpeechSynthesisUtterance`。
   * 預設採用英語 (`en-US`) 高品質發音，語速設定為 `0.95`（最適英語學習聽力節奏）。
2. **多模式觸發 (Trigger Modes):**
   * **句子切換自動朗讀 (Auto-speak on Sentence Focus):** 打字進度進入新句子時自動發音，換句時主動中斷上一句，防止聲音重疊。
   * **句子旁手動朗讀按鈕 (Manual Play Button `🔊`):** 每個句子區塊上方譯文旁附帶喇叭圖示，隨時點擊重播。
   * **鍵盤快捷鍵 (Shortcut Key):** 支援 `Ctrl + J` 快速重聽當前進行句。
3. **介面控制 (UI Controls):**
---

## 7. 機械鍵盤敲擊音效規範 (Mechanical Keyboard Audio Effects Specification)

### 7.1 核心需求 (Core Requirements)
1. **超低延遲零依賴音訊引擎 (Zero-Dependency Low-Latency Web Audio API):**
   * 使用瀏覽器原生 `AudioContext` 進行微秒級實時波形合成，無外掛音檔負擔、零網路延遲（響應時間 < 5ms），斷網依然 100% 可用。
2. **多軸體與鍵位擬真音效 (Multiple Switch Profiles):**
   * **青軸 (Blue Switch / Clicky):** 雙段式清脆響亮高頻點擊感。
   * **茶軸 (Brown Switch / Thocky):** 溫潤厚實的木質打擊感 (Thock)。
   * **打字機 (Typewriter):** 復古金屬敲擊聲。
   * **特殊鍵位區別:** 空白鍵 (Spacebar) 與 Enter 鍵具備沉穩大鍵音效，退格鍵 (Backspace) 具備專屬彈回音。
3. **介面選單與記憶 (UI Controls & Persistence):**
   * 新聞控制列新增「⌨️ 音效 (Sound)」下拉選單：`青軸 (Clicky)`、`茶軸 (Thocky)`、`打字機 (Typewriter)`、`靜音 (Mute)`。
   * 偏好設定自動記錄至 `localStorage`。




