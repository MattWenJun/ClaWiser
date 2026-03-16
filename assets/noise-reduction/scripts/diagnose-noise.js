#!/usr/bin/env node
/**
 * diagnose-noise.js
 *
 * 诊断噪声环境的辅助脚本。
 * 读取 session JSONL，采样分析 user+assistant 消息，输出结构化噪声画像。
 *
 * 用法：
 *   node diagnose-noise.js <date> [options]
 *
 * 参数：
 *   <date>          目标日期，格式 YYYY-MM-DD
 *
 * 选项：
 *   --tz <timezone>         时区（默认读环境变量 TZ 或 Asia/Shanghai）
 *   --sessions <dir>        session JSONL 目录（默认 ~/.openclaw/agents/main/sessions）
 *   --out <path>            输出噪声画像文件路径（默认 stdout）
 *   --max-file-size <mb>    跳过超过此大小的 session 文件（默认 50MB）
 *
 * 输出：
 *   Markdown 格式的噪声画像，包含：
 *   - 消息统计（总数、user/assistant 分布）
 *   - 初步噪声分类（基于已知 pattern）
 *   - 信号/噪声比例
 *   - 环境特征检测
 *   - 原始消息样本（供 agent 补充判断）
 *
 * ⚠️ 此脚本的分类是初步的（基于固定 pattern matching）。
 *    agent 应读取输出后，根据自身环境知识补充脚本未覆盖的噪声类型。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// --- Parse args ---
const args = process.argv.slice(2);
const date = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!date) {
  console.error('用法: node diagnose-noise.js <YYYY-MM-DD> [--tz TZ] [--sessions DIR] [--out PATH]');
  process.exit(1);
}

function getArg(name, def) {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
}

const TZ = getArg('--tz', process.env.TZ || 'Asia/Shanghai');
const sessionsDir = getArg('--sessions',
  path.join(os.homedir(), '.openclaw/agents/main/sessions'));
const outPath = getArg('--out', null);
const maxFileSizeMB = parseInt(getArg('--max-file-size', '50'), 10);

// --- Compute date range ---
function getDateRange(dateStr, tz) {
  const probe = new Date(dateStr + 'T12:00:00Z');
  const utcStr = probe.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = probe.toLocaleString('en-US', { timeZone: tz });
  const offsetMs = new Date(utcStr).getTime() - new Date(tzStr).getTime();
  const s = new Date(dateStr + 'T00:00:00Z');
  s.setTime(s.getTime() + offsetMs);
  const e = new Date(dateStr + 'T23:59:59.999Z');
  e.setTime(e.getTime() + offsetMs);
  return { start: s, end: e };
}

const { start, end } = getDateRange(date, TZ);

// --- Collect raw messages ---
function collectMessages() {
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
          time: new Date(ts).toLocaleTimeString('zh-CN', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
          sessionFile: file
        });
      } catch (e) { /* skip malformed */ }
    }
  }

  messages.sort((a, b) => a.ts - b.ts);
  return { messages, scanned, skipped };
}

// --- Classify a single message (initial pattern-based classification) ---
function classifyMessage(role, text) {
  const t = text.trim();
  if (!t) return { category: 'empty', signal: false };

  if (role === 'user') {
    // Cron prompts
    if (/^\[cron:[0-9a-f-]+/.test(t)) return { category: 'cron_prompt', signal: false };
    if (t.includes('⚠️ RULE INJECTION') && t.includes('[cron:')) return { category: 'cron_prompt', signal: false };

    // System messages
    if (t.includes('[System Message]')) return { category: 'system_message', signal: false };
    if (t.includes('Post-Compaction Audit')) return { category: 'system_compaction', signal: false };
    if (t.includes('Pre-compaction memory flush')) return { category: 'system_compaction', signal: false };
    if (t.includes('Queued announce messages')) return { category: 'system_queued', signal: false };

    // Heartbeat
    if (t.includes('Read HEARTBEAT.md if it exists')) return { category: 'heartbeat_prompt', signal: false };

    // System retry
    if (t.startsWith('Your previous response was only an acknowledgement')) return { category: 'system_retry', signal: false };

    // System exec (model switch etc.)
    if (t.startsWith('System: [')) return { category: 'system_exec', signal: false, note: '可能包裹真实用户文本，需要检查' };

    // RULE INJECTION with possible user text
    if (t.includes('⚠️ RULE INJECTION') || t.startsWith('Conversation info')) {
      // Check for audio/voice content
      if (t.includes('<media:audio>') && /\[\d{2}:\d{2}\.\d{3}/.test(t)) {
        return { category: 'metadata_wrapped_voice', signal: true, note: '元数据包裹了语音转写，需要提取' };
      }
      // Check for text content after metadata
      const stripped = t
        .replace(/^⚠️ RULE INJECTION[\s\S]*?\n\n/m, '')
        .replace(/Conversation info \(untrusted metadata\):[\s\S]*?```\s*/g, '')
        .replace(/Sender \(untrusted metadata\):[\s\S]*?```\s*/g, '')
        .replace(/\[Audio\][\s\S]*$/m, '')
        .trim();
      if (stripped && stripped.length > 10 && !/^⚠️|^\[cron:/.test(stripped)) {
        return { category: 'metadata_wrapped_text', signal: true, note: '元数据包裹了真实用户文本，需要提取' };
      }
      return { category: 'pure_metadata', signal: false };
    }

    // Default: likely real user message
    return { category: 'user_dialogue', signal: true };
  }

  if (role === 'assistant') {
    // Heartbeat ack
    if (t === 'HEARTBEAT_OK') return { category: 'heartbeat_ack', signal: false };

    // Silent reply
    if (t === 'NO_REPLY') return { category: 'silent_reply', signal: false };

    // Trivial
    if (t === 'done' || t === '(no output)') return { category: 'trivial', signal: false };

    // Pure number (tool output)
    if (/^[0-9]+$/.test(t)) return { category: 'tool_number', signal: false };

    // JSON output
    if ((t.startsWith('{') || t.startsWith('[')) && !t.startsWith('[[reply_to')) {
      try { JSON.parse(t); return { category: 'tool_json', signal: false }; } catch (e) { /* not JSON */ }
    }

    // File listing
    if (/^\//.test(t) && t.split('\n').every(l => /^\//.test(l.trim()) || l.trim() === '')) {
      return { category: 'file_listing', signal: false };
    }

    // Internal monologue
    if (/^(Now (let me|I'll|I need|I have|I can|append|let's)|Let me (check|read|look|search|get|verify|scan|pull|see)|I'll (check|read|look|search|get|verify|scan|pull|see|start|now|do|run|fetch|proceed))/.test(t)) {
      return { category: 'internal_monologue', signal: false };
    }

    // Short fragment (but protect CJK and emoji)
    if (t.length < 10 && !/[\u4e00-\u9fff]/.test(t) && !/📄|📺|🌙|🎤|✅|❌|⚠️|👍|❤️|🔥/.test(t)) {
      return { category: 'short_fragment', signal: false };
    }

    // Default: likely real assistant reply
    return { category: 'assistant_dialogue', signal: true };
  }

  return { category: 'unknown', signal: false };
}

// --- Detect environment features ---
function detectFeatures(messages) {
  const features = {
    hasRuleInjection: false,
    hasCron: false,
    hasVoice: false,
    hasHeartbeat: false,
    hasGroupChat: false,
    hasSystemExec: false,
    channels: new Set(),
    cronTasks: new Set()
  };

  for (const m of messages) {
    const t = m.text;
    if (t.includes('⚠️ RULE INJECTION')) features.hasRuleInjection = true;
    if (/\[cron:[0-9a-f-]+\s+([^\]]+)\]/.test(t)) {
      features.hasCron = true;
      const match = t.match(/\[cron:[0-9a-f-]+\s+([^\]]+)\]/);
      if (match) features.cronTasks.add(match[1]);
    }
    if (t.includes('<media:audio>')) features.hasVoice = true;
    if (t.includes('HEARTBEAT')) features.hasHeartbeat = true;
    if (t.includes('is_group_chat')) features.hasGroupChat = true;
    if (t.startsWith('System: [')) features.hasSystemExec = true;

    // Detect channel from metadata
    const chanMatch = t.match(/"channel":\s*"([^"]+)"/);
    if (chanMatch) features.channels.add(chanMatch[1]);
  }

  return features;
}

// --- Generate report ---
function generateReport(messages, scanned, filesSkipped) {
  const classified = messages.map(m => ({
    ...m,
    ...classifyMessage(m.role, m.text)
  }));

  const signal = classified.filter(c => c.signal);
  const noise = classified.filter(c => !c.signal);
  const features = detectFeatures(messages);

  // Category counts
  const categoryCounts = {};
  for (const c of classified) {
    categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
  }

  // Noise category counts (only noise)
  const noiseCounts = {};
  for (const c of noise) {
    noiseCounts[c.category] = (noiseCounts[c.category] || 0) + 1;
  }

  // Build report
  const lines = [];
  lines.push(`## 噪声画像 — ${date}`);
  lines.push(`> 由 diagnose-noise.js 自动生成 | ${new Date().toISOString()} | 时区: ${TZ}`);
  lines.push(`> ⚠️ 分类基于固定 pattern matching，可能有遗漏。agent 应补充脚本未覆盖的噪声类型。`);
  lines.push('');
  lines.push(`- Sessions 扫描: ${scanned} | 跳过(超大): ${filesSkipped}`);
  lines.push(`- user+assistant 消息总数: **${messages.length}** (user: ${messages.filter(m => m.role === 'user').length}, assistant: ${messages.filter(m => m.role === 'assistant').length})`);
  lines.push(`- 信号: **${signal.length}** (${(signal.length / messages.length * 100).toFixed(1)}%) | 噪声: **${noise.length}** (${(noise.length / messages.length * 100).toFixed(1)}%)`);
  lines.push('');

  // Noise distribution
  lines.push('### 噪声分布');
  lines.push('| 类别 | 条数 | 占噪声% | 说明 |');
  lines.push('|------|------|---------|------|');
  const sortedNoise = Object.entries(noiseCounts).sort((a, b) => b[1] - a[1]);
  const categoryDescriptions = {
    cron_prompt: 'cron 定时任务触发消息',
    heartbeat_prompt: 'heartbeat 定时心跳',
    heartbeat_ack: 'agent 心跳确认 (HEARTBEAT_OK)',
    silent_reply: '静默回复 (NO_REPLY)',
    trivial: '极简确认 (done / no output)',
    system_message: '系统消息 ([System Message])',
    system_compaction: '上下文压缩消息',
    system_queued: '队列通知消息',
    system_retry: '系统重试提示',
    system_exec: '系统执行消息（可能包裹用户文本）',
    pure_metadata: '纯元数据包裹（无用户文本）',
    tool_json: 'JSON 工具输出',
    tool_number: '纯数字工具输出',
    file_listing: '文件路径列表',
    internal_monologue: 'agent 内部独白',
    short_fragment: '极短无意义片段',
    empty: '空消息'
  };
  for (const [cat, count] of sortedNoise) {
    const pct = (count / noise.length * 100).toFixed(1);
    const desc = categoryDescriptions[cat] || cat;
    lines.push(`| ${cat} | ${count} | ${pct}% | ${desc} |`);
  }
  lines.push('');

  // Signal distribution
  lines.push('### 信号分布');
  lines.push('| 类别 | 条数 | 说明 |');
  lines.push('|------|------|------|');
  const signalCounts = {};
  for (const c of signal) {
    signalCounts[c.category] = (signalCounts[c.category] || 0) + 1;
  }
  const signalDescriptions = {
    user_dialogue: '用户直接文本消息',
    assistant_dialogue: 'agent 正常回复',
    metadata_wrapped_text: '元数据包裹的用户文本（需提取）',
    metadata_wrapped_voice: '元数据包裹的语音转写（需提取）'
  };
  for (const [cat, count] of Object.entries(signalCounts).sort((a, b) => b[1] - a[1])) {
    const desc = signalDescriptions[cat] || cat;
    lines.push(`| ${cat} | ${count} | ${desc} |`);
  }
  lines.push('');

  // Environment features
  lines.push('### 环境特征');
  lines.push(`- 渠道: ${features.channels.size > 0 ? [...features.channels].join(', ') : '（未检测到，可能是单聊）'}`);
  lines.push(`- 群聊: ${features.hasGroupChat ? '是' : '未检测到'}`);
  lines.push(`- RULE INJECTION 包裹: ${features.hasRuleInjection ? '是 — 需要元数据剥离' : '否'}`);
  lines.push(`- 语音消息: ${features.hasVoice ? '是 — 需要提取 whisper 转写' : '否'}`);
  lines.push(`- Cron 任务: ${features.hasCron ? `是 (${features.cronTasks.size} 种: ${[...features.cronTasks].join(', ')})` : '否'}`);
  lines.push(`- Heartbeat: ${features.hasHeartbeat ? '是' : '否'}`);
  lines.push(`- System 执行消息: ${features.hasSystemExec ? '是 — 可能包裹用户文本' : '否'}`);
  lines.push('');

  // Special notes
  const notes = [];
  if (features.hasCron) {
    notes.push('- **Cron response 追踪**：cron prompt 后面的 assistant 回复也是噪声（cron_response），但本脚本的静态分类无法识别这种上下文依赖。需要在 merge 脚本中实现有状态的 cron-response 追踪。');
  }
  if (features.hasVoice) {
    notes.push('- **语音消息处理**：含 `<media:audio>` 的消息不能直接删除——里面有 whisper 转写的时间轴文本。需要提取 `[HH:MM.SSS --> HH:MM.SSS]` 行的内容。');
  }
  if (features.hasRuleInjection) {
    notes.push('- **元数据剥离**：`⚠️ RULE INJECTION` + `Conversation info` + `Sender metadata` 三层包裹后面可能有真实用户文本。按顺序剥离后检查。');
  }
  if (features.hasSystemExec) {
    notes.push('- **System 消息处理**：`System: [...]` 后面可能跟着真实用户文本（如模型切换后的用户消息）。不能整条丢弃。');
  }
  if (notes.length > 0) {
    lines.push('### ⚠️ 需要注意');
    lines.push(...notes);
    lines.push('');
  }

  // Sample messages (5 noise + 5 signal for agent to review)
  lines.push('### 消息样本（供 agent 补充判断）');
  lines.push('');
  lines.push('#### 噪声样本');
  const noiseSample = noise.length <= 5 ? noise : [0, 1, 2, 3, 4].map(i => noise[Math.floor(i * noise.length / 5)]);
  for (const m of noiseSample) {
    const preview = m.text.slice(0, 120).replace(/\n/g, ' ');
    lines.push(`- \`${m.time}\` [${m.role}] **${m.category}**: ${preview}${preview.length >= 120 ? '…' : ''}`);
  }
  lines.push('');
  lines.push('#### 信号样本');
  const signalSample = signal.length <= 5 ? signal : [0, 1, 2, 3, 4].map(i => signal[Math.floor(i * signal.length / 5)]);
  for (const m of signalSample) {
    const preview = m.text.slice(0, 120).replace(/\n/g, ' ');
    lines.push(`- \`${m.time}\` [${m.role}] **${m.category}**: ${preview}${preview.length >= 120 ? '…' : ''}`);
  }
  lines.push('');

  return lines.join('\n');
}

// --- Main ---
function main() {
  const { messages, scanned, skipped } = collectMessages();

  if (messages.length === 0) {
    const msg = `没有找到 ${date} 的 user+assistant 消息。检查：\n- session 目录是否正确: ${sessionsDir}\n- 日期和时区是否正确: ${date} (${TZ})`;
    if (outPath) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, msg);
    }
    console.error(msg);
    process.exit(1);
  }

  const report = generateReport(messages, scanned, skipped);

  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, report);
    console.log(`噪声画像已写入: ${outPath}`);
    console.log(`消息总数: ${messages.length} | 时区: ${TZ}`);
  } else {
    console.log(report);
  }
}

main();
