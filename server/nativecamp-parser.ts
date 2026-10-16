// server/nativecamp-parser.ts
import { translate } from 'google-translate-api-x';
import { SentenceBlock } from './translator';

export interface ParsedNCItem {
  front: string;          // 正確英文句或單字
  phonetic?: string;      // 音標
  back: string;           // 繁體中文翻譯
  notes?: string;         // 修正前說法 (如: You said: ...)
  type: 'word' | 'sentence';
  context?: string;       // 原文出處
}

export interface NCParseResult {
  title: string;
  items: ParsedNCItem[];
  typingArticle: {
    id: string;
    title: string;
    titleZh: string;
    summary: string;
    fullTypingText: string;
    sentences: SentenceBlock[];
    pubDate: string;
    link: string;
    wordCount: number;
  };
}

// 排除常見的寒暄、打招呼或設備確認無效行
const NOISE_PATTERNS = [
  /^(hello|hi|hey|good\s+(morning|afternoon|evening))/i,
  /^(can\s+you\s+(hear|see)\s+me|yes\s+i\s+can|loud\s+and\s+clear)/i,
  /^(thank\s+you|thanks\s+for\s+(the\s+lesson|your\s+time))/i,
  /^(see\s+you\s+(next\s+time|soon|again)|have\s+a\s+(great|nice)\s+day)/i,
  /^(nice\s+to\s+meet\s+you|glad\s+to\s+meet\s+you)/i,
  /^(you're\s+welcome|my\s+pleasure|bye|goodbye)/i,
  /^page\s+\d+/i,
  /^\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i // 純時間戳記
];

/**
 * 判斷該行文字是否為無實質複習價值的系統或客套對話
 */
function isNoiseLine(line: string): boolean {
  const clean = line.trim();
  if (clean.length < 2) return true;
  return NOISE_PATTERNS.some((pattern) => pattern.test(clean));
}

/**
 * 剖析 Native Camp 聊天記錄並批次補全繁體中文翻譯
 */
export async function parseNativeCampChat(rawText: string, customTitle?: string): Promise<NCParseResult> {
  const rawLines = rawText.split(/\r?\n/);
  const candidates: Array<{ front: string; notes?: string; type: 'word' | 'sentence' }> = [];

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i].trim();
    if (!line) continue;

    // 清理時間戳記 (例如: "14:23 Tutor:", "2026/10/16 14:25:30")
    line = line.replace(/^[0-9:\s\/\-APMapm]+(?:Tutor|Teacher|Me|You|Student)?[:\s]*/i, '').trim();

    // 移除純時間或說話者名稱標籤 (如 "Teacher:", "Me:")
    if (/^(Tutor|Teacher|Me|You|Student)[:\s]*$/i.test(line)) continue;
    // 去除行首的說話者前綴 (如 "Teacher: browse around" -> "browse around")
    line = line.replace(/^(?:Tutor|Teacher|Me|Student)[:\s]+/i, '').trim();
    if (isNoiseLine(line)) continue;

    // 模式 A: "You said: ... / Better say: ..." 雙行結構
    const youSaidMatch = line.match(/(?:you\s+said|original|your\s+sentence)[:\s]+(.+)/i);
    if (youSaidMatch) {
      const youSaidText = youSaidMatch[1].trim();
      // 檢查下一行是否為 Better/Correction
      let betterText = '';
      if (i + 1 < rawLines.length) {
        let nextLine = rawLines[i + 1].trim().replace(/^[0-9:\s\/\-APMapm]+/i, '').trim();
        nextLine = nextLine.replace(/^(?:Tutor|Teacher|Me|Student)[:\s]+/i, '').trim();
        const betterMatch = nextLine.match(/(?:better(?:\s+(?:way\s+to\s+say|say))?|correct(?:ion)?|natural)[:\s]+(.+)/i);
        if (betterMatch) {
          betterText = betterMatch[1].trim();
          i++; // 推進下一行
        }
      }

      if (betterText) {
        candidates.push({
          front: betterText,
          notes: `原始說法：${youSaidText}`,
          type: 'sentence'
        });
        continue;
      } else {
        // 只有 You said，嘗試記錄
        candidates.push({
          front: youSaidText,
          notes: '課堂紀錄',
          type: youSaidText.length > 30 ? 'sentence' : 'word'
        });
        continue;
      }
    }

    // 模式 B: 單行包含 Better / Correction
    const singleBetterMatch = line.match(/(?:better(?:\s+(?:way\s+to\s+say|say))?|correct(?:ion)?|rephrase)[:\s]+(.+)/i);
    if (singleBetterMatch) {
      const better = singleBetterMatch[1].trim();
      if (better && !isNoiseLine(better)) {
        candidates.push({
          front: better,
          notes: '老師推薦道地說法',
          type: better.length > 30 ? 'sentence' : 'word'
        });
        continue;
      }
    }

    // 模式 C: 老師直接發送的單字、片語或修正句 (過濾掉短雜訊)
    // 去除引號包裹
    const unquoted = line.replace(/^["'“‘]+|["'”’]+$/g, '').trim();
    if (unquoted.length >= 3 && !isNoiseLine(unquoted)) {
      const wordCount = unquoted.split(/\s+/).length;
      const isSentence = wordCount >= 5 || /[.?!]$/.test(unquoted);
      candidates.push({
        front: unquoted,
        notes: isSentence ? '課堂例句' : '課堂單字/片語',
        type: isSentence ? 'sentence' : 'word'
      });
    }
  }

  // 去重 (重複的句子或單字只保留一份)
  const uniqueMap = new Map<string, { front: string; notes?: string; type: 'word' | 'sentence' }>();
  for (const c of candidates) {
    const key = c.front.toLowerCase();
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, c);
    }
  }
  const filteredCandidates = Array.from(uniqueMap.values()).slice(0, 30); // 單次最多 30 句

  // 批次翻譯為繁體中文
  const items: ParsedNCItem[] = [];
  const sentenceBlocks: SentenceBlock[] = [];
  const fullTypingParts: string[] = [];
  let runningIndex = 0;

  for (let i = 0; i < filteredCandidates.length; i++) {
    const item = filteredCandidates[i];
    let zh = '';
    try {
      const transRes = await translate(item.front, { to: 'zh-TW' });
      if (transRes && transRes.text) {
        zh = transRes.text.trim();
      }
    } catch (err) {
      console.warn('[NC Parser] Translation warning for:', item.front, err);
      zh = '（可自行於卡片備忘中補充）';
    }

    items.push({
      front: item.front,
      back: zh,
      notes: item.notes,
      type: item.type,
      context: 'Native Camp 課堂'
    });

    // 整理成打字練習分句 (結尾確保有適當標點)
    let safeEn = item.front.trim();
    if (item.type === 'sentence' && !/[.?!]$/.test(safeEn)) {
      safeEn += '.';
    }
    const startIndex = runningIndex;
    const endIndex = startIndex + safeEn.length;
    sentenceBlocks.push({
      id: i,
      en: safeEn,
      zh: zh,
      startIndex,
      endIndex
    });
    fullTypingParts.push(safeEn);
    runningIndex = endIndex + 1; // 包含句間空白
  }

  const todayStr = new Date().toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
  const finalTitle = customTitle?.trim() || `🗣️ Native Camp 課堂複盤 (${todayStr})`;
  const fullTypingText = fullTypingParts.join(' ');

  return {
    title: finalTitle,
    items,
    typingArticle: {
      id: `nc_${Date.now()}`,
      title: finalTitle,
      titleZh: '我的 Native Camp 線上一對一課堂修正句與詞彙複習',
      summary: `本篇共包含 ${items.length} 則外師針對口說即時修正的句型與重要詞彙。`,
      fullTypingText: fullTypingText || 'No lesson items found.',
      sentences: sentenceBlocks,
      pubDate: new Date().toISOString(),
      link: 'https://nativecamp.net',
      wordCount: fullTypingText.split(/\s+/).filter(Boolean).length
    }
  };
}
