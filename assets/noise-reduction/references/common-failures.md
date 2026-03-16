# 常见故障模式

验证不过时，按下面的 checklist 逐项排查。分两层：通用 pattern（所有环境都可能遇到）和环境特定 pattern（按你的实际渠道选读）。

---

## 通用 pattern

### 压缩率 60%-80%（高噪声环境）

**这不一定是问题。** 如果你的环境有大量 cron 任务、频繁 heartbeat、多个群聊，60%-80% 可能是合理的压缩率。

**判定方法**：检查误杀率。如果误杀率 < 2%，说明被过滤的消息确实都是噪声，压缩率合理，直接通过。

**不要做的事**：不要试图通过放松规则把压缩率降到 60% 以下——那只会让噪声留在 transcript 里。

**什么时候才要担心**：误杀率 > 2%。这说明规则确实太激进了，按下面"压缩率 > 80%"的排查步骤处理。

### 压缩率 > 80%（规则太激进）

**症状**：大量真实对话被过滤

**排查步骤**：
1. 看 skip 分布：哪个 reason 的数量异常高？
2. 从该 reason 对应的 filtered 消息里抽 10 条，逐条检查是否真的是噪声
3. 常见原因：
   - **cron_response 扩散**：某种消息被 dedup 或前置过滤删除后，上下文追踪断裂，导致后续正常 assistant 回复被误判为 cron 回复。→ 检查 cron-response 标注是否在 dedup 之前完成
   - **整类消息被误删**：某个 pattern 匹配范围太宽（如内部独白 regex 匹配到了正常回复）。→ 缩窄 regex，加排除条件
   - **语音/媒体消息丢失**：含 `<media:audio>` 或其他媒体标记的消息被整条删除，里面的转写文本也一起丢了。→ 先提取媒体内的文本内容，再决定是否过滤

### 压缩率 < 20%（规则太少）

**症状**：明显的噪声大量保留

**排查步骤**：
1. 从保留消息里抽 30 条，数一下有多少是噪声
2. 把遗漏的噪声按 `noise-categories.md` 分类
3. 常见原因：
   - **缺少 cron-response 过滤**：过滤了 cron prompt 但没过滤 agent 对 cron 的回复。→ 加上下文追踪，cron prompt 后的 assistant 消息也标记为 cron_response
   - **缺少内部独白过滤**：agent 的思考过程（"Let me check…"、"Now I'll…"）没有被识别。→ 扩展内部独白 pattern
   - **role 过滤不全**：tool/system/toolResult 等非对话角色没有被基础过滤覆盖。→ 检查 merge 脚本的 role 白名单

### 误杀率 > 2%

**症状**：真实对话被错误过滤

**排查步骤**：
1. 列出所有被误杀的消息
2. 找到触发误杀的具体规则（看 skip reason）
3. 常见原因：
   - **元数据包裹未提取**：用户消息被渠道元数据包裹（如 `RULE INJECTION` + `Conversation info` + 真实文本），整条被当作系统消息丢弃。→ 加元数据剥离逻辑，提取内部文本
   - **regex 过宽**：如 `/^System:/` 匹配到了包含真实用户文本的系统消息。→ 剥离系统前缀后检查剩余内容
   - **短消息误判**：中文短回复（"好的"、"收到"、"在吗？"）被短片段过滤器删除。→ 短片段过滤加中文和 emoji 豁免

### 遗漏率 > 5%

**症状**：噪声混入保留消息

**排查步骤**：
1. 列出保留消息中的噪声
2. 按 `noise-categories.md` 分类，确定是哪类噪声遗漏了
3. 为每类遗漏写对应的过滤规则
4. 常见原因：
   - **新类型噪声未覆盖**：环境变化引入了新的噪声 pattern（如新增了 cron 任务、新的工具输出格式）。→ 重新做 Step 2 的噪声画像
   - **cron 回复格式多变**：agent 对不同 cron 任务的回复格式不固定，单一 pattern 覆盖不全。→ 用上下文追踪而不是内容匹配

---

## 环境特定 pattern

### Telegram

- **`<media:audio>` 处理**：Telegram 语音消息在 session JSONL 里表现为包含 `<media:audio>` 标记的文本块，里面嵌入了 whisper 转写的时间轴文本（`[00:00.000 --> 00:05.000] 文字内容`）。如果 dedup 逻辑直接删除含 `<media:audio>` 的消息，转写文本会一起丢失。→ 提取时间轴文本，保留为语音记录
- **`RULE INJECTION` 包裹**：Telegram 群聊消息外面包了 `⚠️ RULE INJECTION` + `Conversation info` JSON + `Sender` JSON。用户真实文本藏在最后面。→ 按顺序剥离这三层，取剩余内容
- **`System: [model switch]` 包裹**：模型切换等系统事件会在用户消息前加 `System: [...]` 前缀。如果用户同时发了文本，真实内容在系统前缀之后。→ 剥离 `System: [...]` 行，检查剩余内容

### Discord

- **Bot prefix**：bot 命令回显（`!command` 或 `/slash`）混入用户消息。→ 过滤以 `!` 或 `/` 开头的纯命令消息
- **Embed 对象**：rich embed 被序列化为 JSON 块混入消息文本。→ 识别并跳过 embed JSON

### Slack

- **Thread 回复**：thread 内的消息可能带 `thread_ts` 元数据。→ 元数据剥离时处理 Slack thread 格式

---

## 使用方式

验证脚本（`scripts/validate-noise-reduction.js`）的报告会标注可疑项。看到可疑项后：

1. 在此文件中找到对应的故障 pattern
2. 按排查步骤定位根因
3. 回 Step 3 修改对应规则
4. 重跑验证

如果此文件中没有覆盖你遇到的故障 pattern，把新发现的 pattern 补充到此文件中。
