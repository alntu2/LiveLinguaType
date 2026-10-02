<!-- /docs/COMPETITOR_ANALYSIS.md -->
# 競品分析報告：Qwerty Learner vs. LiveLinguaType

## 1. 競品概況與來源 (Overview & Source)

* **專案名稱 (Project Name):** Qwerty Learner
* **開源儲存庫 (Repository):** [https://github.com/realkai42/qwerty-learner](https://github.com/realkai42/qwerty-learner)
* **作者 (Author):** RealKai42
* **社群熱度 (Popularity):** 17k+ GitHub Stars
* **產品簡介 (Tagline):** 為鍵盤工作者設計的單詞記憶與英語肌肉記憶鍛鍊軟體 (Words learning and English muscle memory training software designed for keyboard workers)。

---

## 2. 產品核心哲學與定位對比 (Core Philosophy & Positioning)

| 維度 (Dimension) | **Qwerty Learner** | **LiveLinguaType (本專案)** |
| :--- | :--- | :--- |
| **核心目標 (Primary Goal)** | **單詞記憶與鍵盤肌肉記憶** (Vocabulary Memorization) | **真實時事閱讀、雙語對照與連貫英打** (Contextual Flow & News) |
| **輸入單位 (Input Unit)** | 孤立單詞 (Isolated Word，如 `abandon`) | 完整新聞長句與段落 (Full Sentences & Paragraphs) |
| **內容來源 (Content Source)** | 靜態題庫 (CET-4/6、TOEFL、GRE、程式 API 等) | **即時 RSS 新聞動態串流** (Live RSS News Feeds) |
| **內容時效 (Freshness)** | 靜態固定，兩週重複易疲勞 | **每日國際時事同步更新**，文章永不陳舊 |
| **打字節奏 (Typing Rhythm)** | 離散單詞節奏（打完 ➔ 暫停 ➔ 下一個詞） | **連貫語流 (Sentence Flow)**，含標點、大小寫與長句換行 |
| **語言學習維度 (Learning Level)** | 詞彙形音義 (Lexical Level) | **語境理解、搭配詞與篇章句型** (Discourse & Syntax Level) |
| **運作模式 (Operation Mode)** | 純前端 Web / VS Code 插件 | **雙層架構 (Client + Server)**，支援端到端斷網快取 |

---

## 3. 詳細功能維度對比矩陣 (Feature Matrix)

| 功能模組 (Feature Module) | Qwerty Learner | LiveLinguaType | 分析備註 (Architect Notes) |
| :--- | :---: | :---: | :--- |
| **即時外媒新聞串流 (Live RSS Feeds)** | ❌ | **✅ (Yahoo, TechCrunch)** | LiveLinguaType 獨創核心競爭力 |
| **整句繁體中文翻譯對齊 (Sentence Translation)** | ❌ (僅單詞詞義) | **✅ (逐句精準對照)** | 具備當前句焦點光暈與即時開關 |
| **離線持久化與天數管理 (Offline Retention)** | ⚠️ (僅本地靜態檔) | **✅ (雙層容錯與天數設定)** | 斷網時自動降級提供最近 7~30 天新聞封存 |
| **打錯字即時浮動標籤 (Typed Char Above)** | ❌ (整詞重來) | **✅ (零位移精確標籤)** | 精準定位手指誤按字元 |
| **語音發音朗讀 (Audio Pronunciation / TTS)** | ✅ (單詞發音) | 🚀 *(規劃中)* | 可借鑒 Web Speech API 實現整句原生朗讀 |
| **機械鍵盤音效 (Sound Effects)** | ✅ (多軸音效) | 🚀 *(規劃中)* | 可大幅提升打字心流與操作多巴胺回饋 |
| **生詞本與收藏 (Wordbook / Mistakes)** | ✅ (生詞標記) | 🚀 *(規劃中)* | 可從長篇新聞中一鍵點擊提煉高頻生詞 |
| **中文輸入法 (IME) 誤觸偵測** | ✅ | **✅ (即時預警提示)** | 避免切錯注音/倉頡導致打字卡頓 |

---

## 4. LiveLinguaType 核心競爭力與護城河 (Moat & Unique Value)

1. **內容永無止境 (Infinite Freshness):**
   * 背單詞軟體最常見的痛點是「刷完題目就棄用」或「重複刷題枯燥乏味」。LiveLinguaType 透過即時國際新聞（頭條、商業金融、體育、科技創新），讓使用者每天打開都有今日最新時事，養成每日固定閱讀與打字習慣。
2. **真實語言語境 (Contextual Comprehension):**
   * 孤立背誦單字容易導致「知道字義卻不會用」。LiveLinguaType 將學習拉高至長句與篇章語境，掌握英語在真實主流媒體中的修辭、時態與搭配詞 (Collocations)。
3. **無網容錯彈性 (Offline Resilience):**
   * 伺服器端內建封存庫與天數過期管理，搭配瀏覽器端快照，即使在飛機或斷網環境中依然能流暢練習。

---

## 5. Qwerty Learner 借鑒與未來演進策略 (Actionable Roadmap)

為了在維持「新聞雙語打字」核心特色的同時，吸收 Qwerty Learner 最受歡迎的優點，建議分為三個階段演進：

### 階段一：語音朗讀 (Text-to-Speech / Audio Pronunciation) — *高優先度*
* **作法：** 導入瀏覽器原生免金鑰的 **Web Speech API (`speechSynthesis`)**。
* **效果：** 打字游標移動到某句、或按下快速鍵 (`Ctrl + J`) 時，自動朗讀該句英語。
* **價值：** 立即讓平台具備「聽力 + 閱讀 + 盲打」三合一的英語學習維度。

### 階段二：機械鍵盤打字音效 (Mechanical Keyboard Audio Feedback) — *中優先度*
* **作法：** 引入輕量音效模組（如青軸、茶軸、打字機等敲擊音檔與靜音開關）。
* **效果：** 極大強化打字時的手感節奏與沈浸感。

### 階段三：新聞生詞本與即時查詞 (Vocabulary Extraction & Wordbook) — *長期規劃*
* **作法：** 使用者在打字區域雙擊或懸停某個單字時，彈出微型辭典氣泡卡片，並可加入「我的生詞庫」。
* **效果：** 完美將「長句新聞閱讀」與「微觀單字累積」無縫結合。
