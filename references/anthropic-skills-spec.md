# Anthropic Claude Code Skills Specification

> Source: https://code.claude.com/docs/en/skills + https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf
> Retrieved: 2026-03-16

## Frontmatter Fields

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `name` | No | String | Directory name | Display name, becomes `/slash-command`. Lowercase, numbers, hyphens. Max 64 chars. |
| `description` | Recommended | String | First paragraph of body | What it does + trigger phrases. Claude uses this for auto-loading. <1024 chars. |
| `argument-hint` | No | String | None | Autocomplete hint, e.g. `[issue-number]`. |
| `disable-model-invocation` | No | Boolean | `false` | `true`: Prevents Claude from auto-invoking. User-only via `/name`. |
| `user-invocable` | No | Boolean | `true` | `false`: Hides from `/` menu. Claude-only invocation. For background knowledge. |
| `allowed-tools` | No | String | None | Tools Claude can use without permission when active, e.g. `Read, Grep` or `Bash(gh *)`. |
| `model` | No | String | Inherits | Model ID for execution, e.g. `opus`. |
| `context` | No | String | None | `fork`: Run in isolated subagent. |
| `agent` | No | String | `general-purpose` | Subagent type when `context: fork`. |
| `hooks` | No | Object | None | Pre/post-execution hooks. |
| `license` | No | String | None | e.g. `MIT`. |
| `compatibility` | No | String | None | Env requirements. 1-500 chars. |
| `metadata` | No | Object | None | Custom KV pairs: `author`, `version`, `mcp-server`, etc. |

## Three Activation Modes

| Config | User Invoke (`/name`) | Claude Auto-Invoke | Description in Context | Full Body Loads When |
|--------|----------------------|-------------------|----------------------|---------------------|
| **Default** | ✅ Yes | ✅ Yes | ✅ Yes (always) | Relevant or invoked |
| `disable-model-invocation: true` | ✅ Yes | ❌ No | ❌ No | User invokes only |
| `user-invocable: false` | ❌ No | ✅ Yes | ✅ Yes (always) | Claude decides |

### Mode 1: Default (both can invoke)
- Description always in context for discovery
- Claude auto-loads full body when relevant
- User can also invoke via `/name`

### Mode 2: `disable-model-invocation: true` (user-only)
- Description NOT in context (hidden from Claude)
- Only user can trigger via `/name`
- For dangerous/side-effect actions (deploy, commit, publish)

### Mode 3: `user-invocable: false` (Claude-only, silent)
- NOT in `/` menu — user can't directly invoke
- Description IS in context — Claude sees it and auto-invokes when relevant
- For background knowledge, guardrails, automatic behaviors
- **This is the "silent skill" mode**

## Progressive Disclosure (2-level)

1. **Level 1 (always loaded)**: Frontmatter only (name + description) — for discovery
2. **Level 2 (on-demand)**: Full SKILL.md body — loaded when invoked/relevant

## Directory Structure

```
skills/
  my-skill/
    SKILL.md           # Required
    scripts/           # Optional: executable scripts
    references/        # Optional: reference docs
    assets/            # Optional: images, templates
    examples/          # Optional: usage examples
```

## Variables Available in Body

- `$ARGUMENTS` — user-provided arguments after `/name`
- `${CLAUDE_SKILL_DIR}` — absolute path to skill directory

## Discovery Priority

Enterprise > Personal (`~/.claude/skills/`) > Project (`.claude/skills/`)

## Restrictions

- No `< >` in frontmatter (injection risk)
- No "claude" or "anthropic" in skill names
- Description < 1024 chars
