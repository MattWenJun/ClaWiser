# 参考实现：消息分类器

以下是一个经过实战验证的降噪分类器，来自一个使用 Telegram + OpenClaw 的环境。**这不是你要照搬的代码，而是一个"降噪规则长什么样"的参考。** 你的环境不同，规则也会不同。

## 分类器逻辑

分类器接收每条消息的 `role`（user/assistant）和 `text`，输出 `skip`（丢弃）或 `keep`（保留）。

### User 消息过滤

```javascript
// 空消息
if (!text || text.trim().length === 0) → skip('empty')

// Cron 调度消息
if (/^\[cron:[0-9a-f-]+/.test(text)) → skip('cron_prompt')

// 系统消息
if (text.includes('[System Message]')) → skip('system_message')
if (text.includes('Post-Compaction Audit')) → skip('post_compaction')
if (text.includes('Queued announce messages')) → skip('queued_announce')
if (text.includes('Pre-compaction memory flush')) → skip('pre_compaction_flush')

// 心跳 prompt
if (text.includes('Read HEARTBEAT.md if it exists')) → skip('heartbeat')

// 元数据包裹：剥离后检查是否有真实用户文本
if (text.startsWith('⚠️ RULE INJECTION') || text.startsWith('Conversation info')) {
  userText = stripMetadata(text)
  if (userText 为空) → skip('pure_metadata')
  else → keep(userText)  // 保留剥离后的用户文本
}
```

### Assistant 消息过滤

```javascript
// 心跳确认
if (text === 'HEARTBEAT_OK') → skip('heartbeat_ok')

// 静默回复
if (text === 'NO_REPLY' || text === 'done' || text === '(no output)') → skip('trivial')

// 纯数字（工具输出）
if (/^[0-9]+$/.test(text)) → skip('tool_number')

// JSON 输出
if (text 以 { 或 [ 开头且可解析为 JSON) → skip('tool_json')

// 文件路径列表
if (text 每行都以 / 开头) → skip('file_listing')

// 内部独白
if (/^(Now (let me|I'll)|Let me (check|read|look|search))/.test(text)) → skip('internal_monologue')

// 短无意义片段（但保留中文和 emoji 标记的消息）
if (text.length < 10 && 不含中文 && 不含关键 emoji) → skip('short_fragment')

// 其余 → keep
```

## 关键设计点

1. **元数据剥离**：Telegram 等渠道会在用户消息外面包一层 metadata JSON。过滤时不能直接丢弃——要先剥离外壳，检查里面有没有真实用户文本。有就保留文本，没有才丢弃。

2. **内部独白识别**：agent 在思考时会输出 "Let me check…"、"Now I'll…" 这类自我对话。这些是 agent 的过程，不是给用户看的回复，属于噪声。

3. **短片段保护**：中文短回复（"好的"、"收到"）和 emoji 标记的消息虽然短，但是有意义的对话。过滤短片段时要排除这些。

4. **reason 标注**：每条 skip 都带 reason，方便统计哪类噪声最多、规则是否合理。跑完一轮后看 reason 分布，就是你的噪声画像。

## 此实现的环境

- 渠道：Telegram（单聊 + 群聊）
- 平台：OpenClaw（有 heartbeat、cron、RULE INJECTION 机制）

其他渠道的噪声 pattern 不同。用第 2 步的采样分析发现你自己的 pattern。
