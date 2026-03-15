#!/usr/bin/env node
// merge-daily-transcript.js — 合并当天的 session transcript + voice 为清洗后的对话日志
// 用法: node scripts/merge-daily-transcript.js [YYYY-MM-DD]
// 不传日期则默认为昨天

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

  // Strip RULE INJECTION block
  t = t.replace(/^⚠️ RULE INJECTION[^\n]*\n(?:(?:\d+\.|[-•*]).*\n?)*/m, '').trim();

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

  // Strip remaining RULE INJECTION blocks
  t = t.replace(/^⚠️ RULE INJECTION[^\n]*\n(?:(?:\d+\.|[-•*]).*\n?)*/m, '').trim();

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

    if (t.startsWith('System: [')) return { action: 'skip', reason: 'system_exec' };
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

    return { action: 'keep', cls: '回复' };
  }

  return { action: 'skip', reason: 'unknown_role' };
}

// ============================================================
// Main
// ============================================================

const arg = process.argv[2];
let targetDate;
if (arg) {
  targetDate = arg;
} else {
  // 默认昨天（按本地时区）
  const now = new Date();
  now.setDate(now.getDate() - 1);
  targetDate = now.toISOString().slice(0, 10);
}

// 用 UTC+8 作为日期边界（OpenClaw 用户多在亚洲时区，可按需调整）
const dayStart = new Date(targetDate + 'T00:00:00+08:00');
const dayEnd = new Date(targetDate + 'T23:59:59.999+08:00');
const startMs = dayStart.getTime();
const endMs = dayEnd.getTime();

console.error(`[merge] target: ${targetDate} (${dayStart.toISOString()} ~ ${dayEnd.toISOString()})`);

if (!fs.existsSync(SESSIONS_DIR)) {
  console.error(`[merge] sessions dir not found: ${SESSIONS_DIR}`);
  process.exit(1);
}

// 1. Collect messages from session transcripts
const allMessages = [];
const sessionGroupMap = buildSessionGroupMap();

const sessionFiles = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));
for (const file of sessionFiles) {
  const filePath = path.join(SESSIONS_DIR, file);
  const stat = fs.statSync(filePath);

  // Quick filter by file modification time
  const dayBefore = new Date(dayStart); dayBefore.setDate(dayBefore.getDate() - 1);
  const dayAfter = new Date(dayEnd); dayAfter.setDate(dayAfter.getDate() + 1);
  if (stat.mtime < dayBefore || stat.birthtime > dayAfter) continue;

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

      if (ts < startMs || ts > endMs) continue;

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
if (fs.existsSync(voiceFile)) {
  const lines = fs.readFileSync(voiceFile, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const ts = new Date(obj.ts).getTime();
      if (ts < startMs || ts > endMs) continue;

      allMessages.push({
        ts,
        role: obj.from === 'user' ? 'user' : 'assistant',
        text: `🎤 [语音] ${obj.text}`,
        source: 'voice'
      });
    } catch (e) { /* skip */ }
  }
}

// 3. Sort by timestamp
allMessages.sort((a, b) => a.ts - b.ts);

// 4. Deduplicate: remove <media:audio> entries (voice version has actual text)
const deduped = allMessages.filter(m => !(m.source === 'transcript' && m.text.includes('<media:audio>')));

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
    source: m.source,
    groupName: m.groupName || null
  });
}

// 6. Merge consecutive same-role same-minute fragments
const merged = [];
for (const m of cleaned) {
  const timeStr = new Date(m.ts).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
  const last = merged[merged.length - 1];

  if (last && last.role === m.role && last.timeStr === timeStr && last.cls === m.cls && last.groupName === m.groupName) {
    last.text += '\n\n' + m.text;
  } else {
    merged.push({ ...m, timeStr });
  }
}

// 7. Format output
const lines = [];
lines.push(`# ${targetDate} 对话记录`);
lines.push(`> 自动合并 + 清洗自 session transcripts`);
lines.push(`> 生成时间: ${new Date().toISOString()}`);
lines.push(`> 原始: ${stats.total} | 保留: ${stats.kept} | 跳过: ${stats.skipped}`);
lines.push('');

for (const m of merged) {
  const roleLabel = m.role === 'user' ? '👤 用户' : '🤖 Agent';
  const clsLabel = m.cls ? ` [${m.cls}]` : '';
  const location = m.groupName ? ` 📌${m.groupName}` : '';

  lines.push(`### ${m.timeStr} ${roleLabel}${clsLabel}${location}`);

  // Truncate very long messages
  const maxLen = 3000;
  const text = m.text.length > maxLen ? m.text.slice(0, maxLen) + '\n...(截断)' : m.text;
  lines.push(text);
  lines.push('');
}

// 8. Write
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const outPath = path.join(OUTPUT_DIR, `${targetDate}.md`);
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

console.log(`Written ${merged.length} entries to ${outPath}`);
console.log(`  Raw: ${stats.total} → Kept: ${stats.kept} → Merged: ${merged.length} | Skipped: ${stats.skipped}`);
for (const [reason, count] of Object.entries(stats.skipReasons).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${reason}: ${count}`);
}
