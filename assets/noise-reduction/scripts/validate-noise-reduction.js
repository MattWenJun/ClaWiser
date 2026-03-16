#!/usr/bin/env node
/**
 * validate-noise-reduction.js
 *
 * 验证降噪效果的辅助脚本。
 * 输出结构化报告供 agent 判断，脚本本身不做 pass/fail 判定。
 *
 * 用法：
 *   node validate-noise-reduction.js <date> [options]
 *
 * 参数：
 *   <date>          目标日期，格式 YYYY-MM-DD
 *
 * 选项：
 *   --tz <timezone>         时区（默认读环境变量 TZ 或 Asia/Shanghai）
 *   --sessions <dir>        session JSONL 目录（默认 ~/.openclaw/agents/main/sessions）
 *   --transcript <path>     transcript 文件路径（默认 $OPENCLAW_WORKSPACE/memory/transcripts/<date>.md）
 *   --sample <n>            每组抽样数量（默认 30）
 *   --max-file-size <mb>    跳过超过此大小的 session 文件（默认 50MB）
 *
 * 输出：
 *   结构化文本报告（stdout），包含：
 *   - 压缩率（user+assistant）
 *   - 被过滤消息抽样（供 agent 判断误杀率）
 *   - 保留消息抽样（供 agent 判断遗漏率）
 *   - 可疑项标注
 *
 * ⚠️ 此脚本只产出报告，不产出 pass/fail 判定。判定权留给 agent。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// --- Parse args ---
const args = process.argv.slice(2);
const date = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!date) {
  console.error('用法: node validate-noise-reduction.js <YYYY-MM-DD> [--tz TZ] [--sessions DIR] [--transcript PATH] [--sample N]');
  process.exit(1);
}

function getArg(name, def) {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
}

const TZ = getArg('--tz', process.env.TZ || 'Asia/Shanghai');
const sessionsDir = getArg('--sessions',
  path.join(os.homedir(), '.openclaw/agents/main/sessions'));
const workspace = process.env.OPENCLAW_WORKSPACE || path.join(os.homedir(), '.openclaw/workspace');
const transcriptPath = getArg('--transcript',
  path.join(workspace, 'memory/transcripts', `${date}.md`));
const sampleSize = parseInt(getArg('--sample', '30'), 10);
const maxFileSizeMB = parseInt(getArg('--max-file-size', '50'), 10);

// --- Compute date range ---
function getDateRange(dateStr, tz) {
  const probe = new Date(dateStr + 'T12:00:00Z');
  const utcStr = probe.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = probe.toLocaleString('en-US', { timeZone: tz });
  const offsetMs = new Date(utcStr).getTime() - new Date(tzStr).getTime();
  const start = new Date(dateStr + 'T00:00:00Z');
  start.setTime(start.getTime() + offsetMs);
  const end = new Date(dateStr + 'T23:59:59.999Z');
  end.setTime(end.getTime() + offsetMs);
  return { start, end };
}

const { start, end } = getDateRange(date, TZ);

// --- Collect raw user+assistant messages ---
function collectRawMessages() {
  const messages = [];
  if (!fs.existsSync(sessionsDir)) {
    console.error(`Sessions 目录不存在: ${sessionsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
  let scanned = 0;
  let skipped = 0;

  for (const file of files) {
    const fp = path.join(sessionsDir, file);
    const stat = fs.statSync(fp);
    if (stat.size > maxFileSizeMB * 1024 * 1024) { skipped++; continue; }
    scanned++;

    const lines = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type !== 'message') continue;
        const msg = obj.message;
        if (!msg || !msg.role) continue;
        if (msg.role !== 'user' && msg.role !== 'assistant') continue;

        const ts = obj.timestamp
          ? new Date(obj.timestamp).getTime()
          : msg.timestamp
            ? (typeof msg.timestamp === 'number' ? msg.timestamp : new Date(msg.timestamp).getTime())
            : 0;
        if (!ts || isNaN(ts) || ts < start.getTime() || ts > end.getTime()) continue;

        const texts = (msg.content || [])
          .filter(c => c.type === 'text' && c.text)
          .map(c => c.text.trim());
        if (!texts.length) continue;

        messages.push({
          ts,
          role: msg.role,
          text: texts.join('\n'),
          time: new Date(ts).toLocaleTimeString('zh-CN', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
        });
      } catch (e) { /* skip malformed */ }
    }
  }

  messages.sort((a, b) => a.ts - b.ts);
  return { messages, scanned, skipped };
}

// --- Parse transcript to extract kept messages ---
function parseTranscript() {
  if (!fs.existsSync(transcriptPath)) {
    console.error(`Transcript 文件不存在: ${transcriptPath}`);
    console.error('请先运行 merge 脚本生成 transcript。');
    process.exit(1);
  }

  const content = fs.readFileSync(transcriptPath, 'utf8');
  const entries = [];
  const headerMatch = content.match(/原始: (\d+) \| 保留: (\d+) \| 跳过: (\d+)/);
  const mergeStats = headerMatch
    ? { raw: +headerMatch[1], kept: +headerMatch[2], skipped: +headerMatch[3] }
    : null;

  // Parse ### HH:MM entries — handle various emoji/name formats
  // Formats: "### 00:32 👤 用户", "### 00:32 👤 User", "### 00:32 🤖 Agent", "### 00:32 🤖 Agent"
  const entryRegex = /^### (\d{2}:\d{2}) (\S+) .+?\n([\s\S]*?)(?=\n### |\n*$)/gm;
  let match;
  // Emojis/names that indicate user vs assistant
  const userIndicators = ['👤'];
  const assistantIndicators = ['🤖', '🌙', '🐉', '🦞'];
  while ((match = entryRegex.exec(content)) !== null) {
    const time = match[1];
    const emoji = match[2];
    const role = userIndicators.includes(emoji) ? 'user'
      : assistantIndicators.includes(emoji) ? 'assistant'
      : 'unknown';
    if (role === 'unknown') continue; // skip unrecognized roles
    const text = match[3].trim();
    entries.push({ time, role, text: text.slice(0, 500) });
  }

  return { entries, mergeStats };
}

// --- Extract meaningful text from a raw message (strip metadata wrappers) ---
function extractCore(text) {
  let t = text;
  // Strip RULE INJECTION + Conversation info + Sender metadata blocks
  t = t.replace(/^⚠️ RULE INJECTION[\s\S]*?\n\n/m, '');
  t = t.replace(/Conversation info \(untrusted metadata\):[\s\S]*?```\s*/g, '');
  t = t.replace(/Sender \(untrusted metadata\):[\s\S]*?```\s*/g, '');
  // Strip [Audio] header and whisper args
  t = t.replace(/\[Audio\]\s*User text:[\s\S]*?Transcript:\s*Args:[\s\S]*?\n(?=\[)/m, '');
  // Extract whisper transcript lines
  const whisperLines = t.match(/\[\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}\.\d{3}\]\s*.+/g);
  if (whisperLines) {
    t = whisperLines.map(l => l.replace(/^\[\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}\.\d{3}\]\s*/, '')).join(' ');
  }
  // Strip System: [...] prefix
  t = t.replace(/^System: \[[^\]]*\][^\n]*\n*/m, '');
  // Strip markdown formatting
  t = t.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
  // Normalize whitespace
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

// --- Match raw messages against transcript to find filtered ones ---
function classifyMessages(rawMessages, transcriptEntries) {
  const kept = [];
  const filtered = [];

  // Build lookup: for each transcript entry, extract comparable text
  const teLookup = transcriptEntries.map(te => ({
    ...te,
    core: te.text.replace(/^🎤 \[语音\]\s*/, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
  }));

  for (const raw of rawMessages) {
    const rawCore = extractCore(raw.text);
    if (!rawCore || rawCore.length < 3) {
      filtered.push(raw);
      continue;
    }

    // Match by: same role + time within ±1 min + text overlap
    const rawMinute = parseInt(raw.time.split(':')[0]) * 60 + parseInt(raw.time.split(':')[1]);

    const isKept = teLookup.some(te => {
      if (te.role !== raw.role) return false;

      // Time within ±1 minute
      const teMinute = parseInt(te.time.split(':')[0]) * 60 + parseInt(te.time.split(':')[1]);
      if (Math.abs(rawMinute - teMinute) > 1) return false;

      // Text overlap: check if first 40 chars of either appear in the other
      const rawSnippet = rawCore.slice(0, 40);
      const teSnippet = te.core.slice(0, 40);
      if (rawSnippet.length >= 10 && te.core.includes(rawSnippet)) return true;
      if (teSnippet.length >= 10 && rawCore.includes(teSnippet)) return true;

      // Fallback: check any 20-char overlap
      for (let i = 0; i <= Math.min(rawCore.length - 20, 200); i += 10) {
        if (te.core.includes(rawCore.slice(i, i + 20))) return true;
      }
      return false;
    });

    if (isKept) {
      kept.push(raw);
    } else {
      filtered.push(raw);
    }
  }

  return { kept, filtered };
}

// --- Random sample ---
function sample(arr, n) {
  if (arr.length <= n) return arr;
  const result = [];
  const indices = new Set();
  // Evenly spaced sampling for reproducibility
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(i * arr.length / n);
    if (!indices.has(idx)) {
      indices.add(idx);
      result.push(arr[idx]);
    }
  }
  return result;
}

// --- Suspicious item detection ---
function detectSuspicious(msg) {
  const flags = [];
  const t = msg.text.trim();

  if (msg.role === 'user') {
    // User message that looks like real conversation but was filtered
    if (/[\u4e00-\u9fff]/.test(t) && !t.includes('[cron:') && !t.includes('HEARTBEAT') &&
        !t.includes('[System Message]') && t.length > 20) {
      // Check if it's wrapped metadata with real text inside
      if (t.includes('⚠️ RULE INJECTION') || t.includes('Conversation info')) {
        flags.push('⚠️ 元数据包裹，可能含真实用户文本');
      } else {
        flags.push('⚠️ 含中文且不像系统消息，可能是误杀');
      }
    }
    if (t.includes('<media:audio>') && t.match(/\[\d{2}:\d{2}\.\d{3}/)) {
      flags.push('⚠️ 含语音转写内容，检查是否被正确提取');
    }
  }

  if (msg.role === 'assistant') {
    // Assistant message that looks like noise but was kept
    if (t === 'HEARTBEAT_OK' || t === 'NO_REPLY' || t === 'done') {
      flags.push('⚠️ trivial 回复，应被过滤');
    }
    if (/^\[cron:/.test(t)) {
      flags.push('⚠️ cron prompt 格式，角色可能标错');
    }
  }

  return flags;
}

// --- Main ---
function main() {
  console.log(`# 降噪验证报告 — ${date}`);
  console.log(`> 生成时间: ${new Date().toISOString()} | 时区: ${TZ}`);
  console.log(`> 数据范围: ${start.toISOString()} ~ ${end.toISOString()}`);
  console.log();

  // 1. Collect raw messages
  const { messages: rawMessages, scanned, skipped: filesSkipped } = collectRawMessages();
  const rawUser = rawMessages.filter(m => m.role === 'user').length;
  const rawAssistant = rawMessages.filter(m => m.role === 'assistant').length;

  console.log(`## 原始数据`);
  console.log(`- Sessions 扫描: ${scanned} | 跳过(超大): ${filesSkipped}`);
  console.log(`- user+assistant 消息总数: **${rawMessages.length}** (user: ${rawUser}, assistant: ${rawAssistant})`);
  console.log();

  // 2. Parse transcript
  const { entries: transcriptEntries, mergeStats } = parseTranscript();
  console.log(`## Transcript 产出`);
  console.log(`- 文件: ${transcriptPath}`);
  if (mergeStats) {
    console.log(`- Merge 统计: 原始 ${mergeStats.raw} → 保留 ${mergeStats.kept} → 跳过 ${mergeStats.skipped}`);
  }
  console.log(`- Transcript 条目数: ${transcriptEntries.length}`);
  console.log();

  // 3. Classify
  const { kept, filtered } = classifyMessages(rawMessages, transcriptEntries);
  const compressionRate = rawMessages.length > 0
    ? ((1 - kept.length / rawMessages.length) * 100).toFixed(1)
    : 0;

  console.log(`## 压缩率（user+assistant）`);
  console.log(`- 原始: ${rawMessages.length} → 保留: ${kept.length} → 过滤: ${filtered.length}`);
  console.log(`- **压缩率: ${compressionRate}%**`);
  if (compressionRate < 20) console.log(`- 📊 压缩率偏低（< 20%），规则可能太少`);
  else if (compressionRate > 80) console.log(`- 📊 压缩率偏高（> 80%），可能过于激进，重点检查误杀`);
  else if (compressionRate > 60) console.log(`- 📊 压缩率略高于目标区间（30%-60%），如果误杀率为 0 则可接受`);
  else console.log(`- 📊 在目标区间（30%-60%）内`);
  console.log();

  // 4. Sample filtered messages (for 误杀率 check)
  const filteredSample = sample(filtered, sampleSize);
  console.log(`## 被过滤消息抽样（共 ${filtered.length} 条，抽 ${filteredSample.length} 条）`);
  console.log(`> agent 判断：以下消息中是否有真实对话被误杀？`);
  console.log();

  let suspiciousFiltered = 0;
  for (let i = 0; i < filteredSample.length; i++) {
    const m = filteredSample[i];
    const preview = m.text.slice(0, 150).replace(/\n/g, ' ');
    const flags = detectSuspicious(m);
    if (flags.length) suspiciousFiltered++;
    console.log(`${i + 1}. \`${m.time}\` [${m.role}] ${preview}${preview.length >= 150 ? '…' : ''}`);
    for (const f of flags) console.log(`   ${f}`);
  }
  console.log();
  if (suspiciousFiltered > 0) {
    console.log(`⚠️ 发现 ${suspiciousFiltered} 条可疑项，请重点检查`);
  } else {
    console.log(`✅ 未发现明显可疑项`);
  }
  console.log();

  // 5. Sample kept messages (for 遗漏率 check)
  const keptSample = sample(kept, sampleSize);
  console.log(`## 保留消息抽样（共 ${kept.length} 条，抽 ${keptSample.length} 条）`);
  console.log(`> agent 判断：以下消息中是否有噪声被遗漏？`);
  console.log();

  let suspiciousKept = 0;
  for (let i = 0; i < keptSample.length; i++) {
    const m = keptSample[i];
    const preview = m.text.slice(0, 150).replace(/\n/g, ' ');
    const flags = detectSuspicious(m);
    if (flags.length) suspiciousKept++;
    console.log(`${i + 1}. \`${m.time}\` [${m.role}] ${preview}${preview.length >= 150 ? '…' : ''}`);
    for (const f of flags) console.log(`   ${f}`);
  }
  console.log();
  if (suspiciousKept > 0) {
    console.log(`⚠️ 发现 ${suspiciousKept} 条可疑项，请重点检查`);
  } else {
    console.log(`✅ 未发现明显可疑项`);
  }
  console.log();

  // 6. Summary
  console.log(`## 报告摘要`);
  console.log(`| 指标 | 值 | 目标 |`);
  console.log(`|------|-----|------|`);
  console.log(`| 压缩率 | ${compressionRate}% | 30%-60% |`);
  console.log(`| 被过滤可疑项 | ${suspiciousFiltered}/${filteredSample.length} | 越少越好 |`);
  console.log(`| 保留可疑项 | ${suspiciousKept}/${keptSample.length} | 越少越好 |`);
  console.log();
  console.log(`---`);
  console.log(`⚠️ 此报告仅提供数据和标注，不做 pass/fail 判定。请 agent 根据以上数据自行判断。`);
}

main();
