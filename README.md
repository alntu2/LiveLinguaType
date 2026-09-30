# ⌨️ LiveLinguaType

> **Practice English typing with real-time news feeds and bilingual translation (EN/ZH).**  
> 結合即時新聞 RSS、繁體中文雙語句子對齊與專業英打測速的現代化學習平台。

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6.1-purple?logo=vite)
![Express](https://img.shields.io/badge/Express-4.21-black?logo=express)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ 核心特色 (Core Features)

1. **📰 即時新聞內容 (Live RSS News):**
   - 與 Yahoo News 等主流新聞媒體同步，文章永遠保持最新，拒絕枯燥陳舊的題庫。
   - 支援頭條新聞 (Top Stories)、商業金融 (Finance)、體育動態 (Sports) 與科技趨勢 (Tech) 等多分類切換。

2. **🌐 雙語對照學習 (Bilingual Sentence Alignment):**
   - 逐句精準對照：在英文練習句上方即時呈現對應的繁體中文翻譯。
   - 當前句聚焦高亮 (Active Sentence Focus)：打字游標進入句子時，該句自動亮起視覺焦點。
   - 一鍵切換模式 (Toggle Mode)：支援隨時在「雙語學習」與「純英打練習」間切換。

3. **🎯 零誤差打字引擎 (Zero-Drift Typing Engine):**
   - 即時計算 WPM (Words Per Minute)、準確率 (Accuracy) 與進度。
   - **打錯字即時懸浮標籤 (Typed Char Above Badge):** 按錯鍵時，於英文字上方直接浮現使用者按下的鍵位（例如誤按的字母或空格），方便即時修正肌肉記憶。
   - 中文輸入法 (IME) 與 CapsLock 誤觸即時預警。

4. **⚡ 輕量高效與免金鑰翻譯 (Zero-Config Backend):**
   - 後端內建高效率 Google GTX 翻譯服務，免金鑰開箱即用。
   - 具備 5 分鐘記憶體快取 (In-Memory Cache) 與手動釋放資源 (Purge Cache) 機制。

---

## 🚀 快速開始 (Quick Start)

### 1. 安裝依賴 (Install Dependencies)
```bash
npm install
```

### 2. 本地啟動 (Run Locally)
前後端將同時啟動（前端 Vite: `http://localhost:5173`，後端 Express: `http://localhost:3001`）：
```bash
npm run dev
```

### 3. 建置生產環境 (Production Build)
```bash
npm run build
```

---

## 🛠 技術棧 (Tech Stack)

* **前端 (Frontend):** TypeScript, Vite, Vanilla CSS (Modern Glassmorphism & Dark Mode)
* **後端 (Backend):** Node.js, Express, `rss-parser`
* **翻譯引擎 (Translator):** Single-Pass Multi-Sentence Google GTX Proxy
* **字型 (Typography):** JetBrains Mono, Outfit

---

## 📄 開源協議 (License)

MIT License © 2026 LiveLinguaType
