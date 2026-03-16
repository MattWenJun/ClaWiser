#!/usr/bin/env node
// merge-daily-transcript.js — 合并当天的 session transcript + voice 为清洗后的对话日志
// 用法: node scripts/merge-daily-transcript.js [YYYY-MM-DD] [--tz Asia/Shanghai]
// 不传日期则默认为昨天（按用户时区）
// 时区优先级：--tz 参数 > USER.md > 系统本地时区

const fs = require('fs');
const path = require('path');

// ============================================================
// 路径自动检测
// ============================================================

const HOME = require('os').homedir();
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(HOME, '.openclaw', 'workspace');
const SESSIONS_DIR = path.join(HOME, '.openclaw', 'agents', 'main', 'sessions');
const VOICE_DIR = path.join(WORKSPACE, 'memory', 'voice');
const OUTPUT_DIR = path.join(WORKSPACE, 'memory', 'transcripts');
const SESSIONS_JSON = path.join(SESSIONS_DIR, 'sessions.json');
const IDENTITY_FILE = path.join(WORKSPACE, 'IDENTITY.md');
const SOUL_FILE = path.join(WORKSPACE, 'SOUL.md');
const USER_FILE = path.join(WORKSPACE, 'USER.md');

// ============================================================
// 参数解析
// ============================================================

let argDate = null;
let argTz = null;

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--tz' && process.argv[i + 1]) {
    argTz = process.argv[++i];
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(process.argv[i])) {
    argDate = process.argv[i];
  }
}

// ============================================================
// 时区检测：--tz > USER.md > 系统本地
// ============================================================

function detectTimezone() {
  // 1. 命令行参数
  if (argTz) return argTz;

  // 2. USER.md 里的 Timezone 字段
  try {
    const text = fs.readFileSync(USER_FILE, 'utf8');
    // 匹配常见格式：**Timezone:** xxx 或 - Timezone: xxx
    const match = text.match(/\*?\*?Timezone\*?\*?[：:]\s*.*?([A-Z][a-z]+\/[A-Za-z_]+)/i);
    if (match) return match[1];
  } catch (e) { /* file may not exist */ }

  // 3. 系统本地时区
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const TIMEZONE = detectTimezone();

// 用 IANA 时区计算日期边界
function getDateBounds(dateStr) {
  // 利用 Intl 获取指定时区的 UTC 偏移
  const probe = new Date(dateStr + 'T12:00:00Z');
  const utcStr = probe.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = probe.toLocaleString('en-US', { timeZone: TIMEZONE });
  const offsetMs = new Date(utcStr).getTime() - new Date(tzStr).getTime();

  const start = new Date(dateStr + 'T00:00:00Z');
  start.setTime(start.getTime() + offsetMs);
  const end = new Date(dateStr + 'T23:59:59.999Z');
  end.setTime(end.getTime() + offsetMs);

  return { start, end, startMs: start.getTime(), endMs: end.getTime() };
}

function getYesterday() {
  const now = new Date();
  // 用时区感知的日期计算
  const todayStr = now.toLocaleDateString('sv-SE', { timeZone: TIMEZONE }); // sv-SE 格式: YYYY-MM-DD
  const today = new Date(todayStr + 'T12:00:00Z');
  today.setDate(today.getDate() - 1);
  return today.toISOString().slice(0, 10);
}

// ============================================================
// Agent Name Detection (for voice JSONL role fallback)
// ============================================================

function getAgentName() {
  // 尝试从 IDENTITY.md 读取
  for (const file of [IDENTITY_FILE, SOUL_FILE]) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      // 支持多种格式：**Name:** xxx / - Name: xxx / # Name: xxx
      const match = text.match(/(?:\*\*Name\*\*|[-#]\s*Name)[：:]\s*(.+)/i);
      if (match) {
        const name = match[1].replace(/\*+/g, '').trim().toLowerCase();
        if (name) return name;
      }
    } catch (e) { /* file may not exist */ }
  }
  return null;
}

const AGENT_NAME = getAgentName();

function getUserName() {
  try {
    const text = fs.readFileSync(USER_FILE, 'utf8');
    const match = text.match(/(?:\*\*(?:Name|What to call them)\*\*|[-#]\s*(?:Name|What to call them))[：:]\s*(.+)/i);
    if (match) return match[1].replace(/\*+/g, '').trim();
  } catch (e) { /* file may not exist */ }
  return null;
}

const USER_DISPLAY = getUserName() || '用户';
const AGENT_DISPLAY = AGENT_NAME
  ? AGENT_NAME.charAt(0).toUpperCase() + AGENT_NAME.slice(1)
  : 'Agent';

// ============================================================
// Session → Group Name Mapping
// ============================================================

function buildSessionGroupMap() {
  const map = {};
  try {
    const data = JSON.parse(fs.readFileSync(SESSIONS_JSON, 'utf8'));
    for (const [key, val] of Object.entries(data)) {
      if (key.includes(':group:') && val.sessionId) {
        const name = val.subject || val.displayName || '';
        if (name) map[val.sessionId] = name;
      }
    }
  } catch (e) { /* sessions.json may not exist */ }
  return map;
}

// ============================================================
// Message Cleaning
// ============================================================

function extractUserText(fullText) {
  let t = fullText;

  // Strip RULE INJECTION blocks (global: handle multiple)
  t = t.replace(/^⚠️ RULE INJECTION[^\n]*\n(?:(?:\d+\.|[-•*]).*\n?)*/gm, '').trim();

  // Strip "Conversation info" JSON block
  t = t.replace(/^Conversation info \(untrusted metadata\):\s*```json\s*\{[\s\S]*?\}\s*```/m, '').trim();

  // Strip "Sender (untrusted metadata)" JSON block
  t = t.replace(/^Sender \(untrusted metadata\):\s*```json\s*\{[\s\S]*?\}\s*```/m, '').trim();

  // Strip "Replied message" JSON block, extract quote
  let replyQuote = null;
  const replyMatch = t.match(/Replied message \(untrusted, for context\):\s*```json\s*(\{[\s\S]*?\})\s*```/m);
  if (replyMatch) {
    try {
      const obj = JSON.parse(replyMatch[1]);
      replyQuote = (obj.body || '').slice(0, 80).replace(/\n/g, ' ');
    } catch (e) {}
    t = t.replace(/Replied message \(untrusted, for context\):\s*```json\s*\{[\s\S]*?\}\s*```/m, '').trim();
  }

  // Strip cron tail lines
  t = t.replace(/^Current time:.*$/m, '').trim();
  t = t.replace(/^Return your summary as plain text[\s\S]*$/m, '').trim();

  if (replyQuote && t) {
    t = `> [回复: ${replyQuote}...]\n${t}`;
  }
  return t;
}

function classifyMessage(role, text) {
  if (!text || text.trim().length === 0) return { action: 'skip', reason: 'empty' };
  const t = text.trim();

  // --- User messages ---
  if (role === 'user') {
    if (/^\[cron:[0-9a-f-]+/.test(t)) return { action: 'skip', reason: 'cron_prompt' };
    if (t.includes('⚠️ RULE INJECTION') && t.includes('[cron:')) return { action: 'skip', reason: 'cron_prompt' };
    if (t.includes('[System Message]')) return { action: 'skip', reason: 'system_message' };
    if (t.startsWith('System: [') && t.includes('Post-Compaction Audit')) return { action: 'skip', reason: 'post_compaction' };
    if (t.includes('Queued announce messages while agent was busy')) return { action: 'skip', reason: 'queued_announce' };
    if (t.includes('Pre-compaction memory flush')) return { action: 'skip', reason: 'pre_compaction_flush' };
    if (t.includes('Read HEARTBEAT.md if it exists')) return { action: 'skip', reason: 'heartbeat' };
    if (t.startsWith('Return your summary as plain text')) return { action: 'skip', reason: 'cron_tail' };

    if (t.startsWith('⚠️ RULE INJECTION')) {
      const userText = extractUserText(t);
      if (!userText || userText.trim().length === 0) return { action: 'skip', reason: 'pure_injection' };
      if (userText.startsWith('⚠️ RULE INJECTION') || userText.startsWith('[cron:')) return { action: 'skip', reason: 'pure_injection' };
      const cls = userText.includes('> [回复:') ? '回复' : (userText.includes('🎤') ? '语音' : '对话');
      return { action: 'keep', cleanedText: userText, cls };
    }

    if (t.startsWith('Conversation info (untrusted metadata)')) {
      const userText = extractUserText(t);
      if (!userText || userText.trim().length === 0) return { action: 'skip', reason: 'metadata_only' };
      const cls = userText.includes('> [回复:') ? '回复' : (userText.includes('🎤') ? '语音' : '对话');
      return { action: 'keep', cleanedText: userText, cls };
    }

    if (t.startsWith('System: [')) {
      // System messages may wrap real user text after the system line
      // e.g. "System: [2026-03-15 00:31:57 GMT+8] Model switched to ...\n\nConversation info..."
      const lines = t.split('\n');
      const nonSystemLines = lines.filter(l => !l.startsWith('System: [')).join('\n').trim();
      if (nonSystemLines) {
        // There's content after the System line — try to extract user text
        const userText = extractUserText(nonSystemLines);
        if (userText && userText.trim().length > 0) {
          const cls = userText.includes('> [回复:') ? '回复' : (userText.includes('🎤') ? '语音' : '对话');
          return { action: 'keep', cleanedText: userText, cls };
        }
      }
      return { action: 'skip', reason: 'system_exec' };
    }
    const cls = t.includes('🎤') ? '语音' : '对话';
    return { action: 'keep', cleanedText: t, cls };
  }

  // --- Assistant messages ---
  if (role === 'assistant') {
    if (t === 'HEARTBEAT_OK' || t === 'NO_REPLY' || t === 'done' || t === '(no output)') return { action: 'skip', reason: 'trivial' };
    if (/^[0-9]+$/.test(t)) return { action: 'skip', reason: 'tool_number' };

    // JSON tool output
    if ((t.startsWith('{') || t.startsWith('[')) && !t.startsWith('[[reply_to')) {
      try { JSON.parse(t); return { action: 'skip', reason: 'tool_json' }; } catch (e) {}
    }

    // File path listings
    if (/^\/[^\s]+/.test(t) && t.split('\n').every(l => /^\//.test(l.trim()) || l.trim() === '')) {
      return { action: 'skip', reason: 'tool_file_listing' };
    }

    // Internal monologue
    if (/^(Now (let me|I'll|I need)|Let me (check|read|look|search|get|verify|scan|pull|see))/.test(t)) {
      return { action: 'skip', reason: 'internal_monologue' };
    }

    // Short useless fragments
    if (t.length < 10 && !/[\u4e00-\u9fff]/.test(t) && !/📄|📺|🌙|🎤|✅|❌|⚠️/.test(t)) {
      return { action: 'skip', reason: 'short_fragment' };
    }

    // Long structured content — mark to prevent truncation
    if (t.length > 2000) return { action: 'keep', cls: '回复', long: true };

    return { action: 'keep', cls: '回复' };
  }

  return { action: 'skip', reason: 'unknown_role' };
}

// ============================================================
// Main
// ============================================================

const targetDate = argDate || getYesterday();
const bounds = getDateBounds(targetDate);

console.error(`[merge] target: ${targetDate} | tz: ${TIMEZONE} | agent: ${AGENT_NAME || '(unknown)'}`);
console.error(`[merge] range: ${bounds.start.toISOString()} ~ ${bounds.end.toISOString()}`);

if (!fs.existsSync(SESSIONS_DIR)) {
  console.error(`[merge] sessions dir not found: ${SESSIONS_DIR}`);
  process.exit(1);
}

// 1. Collect messages from session transcripts
const allMessages = [];
const sessionGroupMap = buildSessionGroupMap();
let filesScanned = 0;
let filesSkipped = 0;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — 超过的跳过并警告

const sessionFiles = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));
for (const file of sessionFiles) {
  const filePath = path.join(SESSIONS_DIR, file);
  const stat = fs.statSync(filePath);

  // 跳过超大文件
  if (stat.size > MAX_FILE_SIZE) {
    console.error(`[merge] WARN: skipping oversized file ${file} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
    filesSkipped++;
    continue;
  }

  // Quick filter by file modification time
  const dayBefore = new Date(bounds.start); dayBefore.setDate(dayBefore.getDate() - 1);
  const dayAfter = new Date(bounds.end); dayAfter.setDate(dayAfter.getDate() + 1);
  if (stat.mtime < dayBefore || stat.birthtime > dayAfter) continue;

  filesScanned++;
  const sessionId = file.replace(/(-topic-\d+)?\.jsonl$/, '');
  const groupName = sessionGroupMap[sessionId] || null;

  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type !== 'message') continue;

      const msg = obj.message;
      if (!msg || !msg.role) continue;

      const ts = obj.timestamp ? new Date(obj.timestamp).getTime()
                : msg.timestamp ? (typeof msg.timestamp === 'number' ? msg.timestamp : new Date(msg.timestamp).getTime())
                : 0;

      // 校验时间戳有效性
      if (!ts || isNaN(ts)) continue;
      if (ts < bounds.startMs || ts > bounds.endMs) continue;

      const texts = [];
      const content = msg.content || [];
      for (const c of content) {
        if (c.type === 'text' && c.text && c.text.trim()) texts.push(c.text.trim());
      }
      if (texts.length === 0) continue;

      // Skip pure tool call messages
      if (content.every(c => c.type === 'toolCall' || c.type === 'toolResult' || (c.type === 'text' && !c.text.trim()))) continue;

      allMessages.push({ ts, role: msg.role, text: texts.join('\n'), source: 'transcript', groupName });
    } catch (e) { /* skip malformed */ }
  }
}

// 2. Load voice messages (if any)
const voiceFile = path.join(VOICE_DIR, `${targetDate}.jsonl`);
let voiceLoaded = false;
if (fs.existsSync(voiceFile)) {
  voiceLoaded = true;
  const lines = fs.readFileSync(voiceFile, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const ts = new Date(obj.ts).getTime();

      // 校验时间戳
      if (!ts || isNaN(ts)) continue;
      if (ts < bounds.startMs || ts > bounds.endMs) continue;

      // role 判断：role 字段 > from + IDENTITY.md > from === "assistant"
      let role;
      if (obj.role) {
        role = obj.role === 'assistant' ? 'assistant' : 'user';
      } else {
        const from = (obj.from || '').toLowerCase();
        role = (from === 'assistant' || (AGENT_NAME && from === AGENT_NAME)) ? 'assistant' : 'user';
      }
      allMessages.push({
        ts,
        role,
        text: `🎤 [语音] ${obj.text}`,
        source: 'voice'
      });
    } catch (e) { /* skip */ }
  }
}

// 3. Sort by timestamp
allMessages.sort((a, b) => a.ts - b.ts);

// 4. Deduplicate: handle <media:audio> entries
// Don't blindly delete — extract whisper transcript lines if present
const deduped = allMessages.filter(m => {
  if (m.source !== 'transcript') return true;
  if (!m.text.includes('<media:audio>')) return true;

  // Check for whisper transcript lines: [00:00.000 --> 00:05.000] text
  const transcriptLines = m.text.match(/\[\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}\.\d{3}\]\s*.+/g);
  if (transcriptLines && transcriptLines.length > 0) {
    // Extract the spoken text from transcript lines
    const spokenText = transcriptLines
      .map(l => l.replace(/\[\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}\.\d{3}\]\s*/, '').trim())
      .filter(Boolean)
      .join(' ');
    if (spokenText) {
      m.text = `🎤 [语音] ${spokenText}`;
      return true; // keep with extracted text
    }
  }

  // No transcript content found — check if voice JSONL version exists
  // (voice JSONL has the actual text; this bare <media:audio> is just a placeholder)
  return false;
});

// 5. Classify & clean
const cleaned = [];
const stats = { total: 0, kept: 0, skipped: 0, skipReasons: {} };

for (const m of deduped) {
  stats.total++;
  const result = classifyMessage(m.role, m.text);

  if (result.action === 'skip') {
    stats.skipped++;
    stats.skipReasons[result.reason] = (stats.skipReasons[result.reason] || 0) + 1;
    continue;
  }

  stats.kept++;
  cleaned.push({
    ts: m.ts,
    role: m.role,
    text: result.cleanedText || m.text,
    cls: result.cls || null,
    long: result.long || false,
    source: m.source,
    groupName: m.groupName || null
  });
}

// 6. Merge consecutive same-role same-minute fragments
const merged = [];
for (const m of cleaned) {
  const timeStr = new Date(m.ts).toLocaleTimeString('zh-CN', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' });
  const last = merged[merged.length - 1];

  if (last && last.role === m.role && last.timeStr === timeStr && last.cls === m.cls && last.groupName === m.groupName) {
    last.text += '\n\n' + m.text;
    last.long = last.long || m.long; // 保留 long 标记
  } else {
    merged.push({ ...m, timeStr });
  }
}

// 7. Format output
const output = [];
output.push(`# ${targetDate} 对话记录`);
output.push(`> 自动合并 + 清洗自 session transcripts`);
output.push(`> 生成时间: ${new Date().toISOString()} | 时区: ${TIMEZONE}`);
output.push(`> 原始: ${stats.total} | 保留: ${stats.kept} | 跳过: ${stats.skipped}`);
output.push('');

for (const m of merged) {
  const roleLabel = m.role === 'user' ? `👤 ${USER_DISPLAY}` : `🤖 ${AGENT_DISPLAY}`;
  const clsLabel = m.cls ? ` [${m.cls}]` : '';
  const location = m.groupName ? ` 📌${m.groupName}` : '';

  output.push(`### ${m.timeStr} ${roleLabel}${clsLabel}${location}`);

  // Truncate very long messages (long structured content gets more room)
  const maxLen = m.long ? 8000 : 3000;
  const text = m.text.length > maxLen ? m.text.slice(0, maxLen) + '\n...(截断)' : m.text;
  output.push(text);
  output.push('');
}

// 8. Write
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const outPath = path.join(OUTPUT_DIR, `${targetDate}.md`);
fs.writeFileSync(outPath, output.join('\n'), 'utf8');

// 9. Stats
console.log(`Written ${merged.length} entries to ${outPath}`);
console.log(`  Sessions scanned: ${filesScanned} | Voice: ${voiceLoaded ? 'yes' : 'no'} | Skipped(oversize): ${filesSkipped}`);
console.log(`  Raw: ${stats.total} → Kept: ${stats.kept} → Merged: ${merged.length} | Skipped: ${stats.skipped}`);
for (const [reason, count] of Object.entries(stats.skipReasons).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${reason}: ${count}`);
}
