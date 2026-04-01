---
name: skill-writing-audit
description: "Audit whether a Skill is truly designed for the Agent era, or unconsciously follows legacy software development thinking. Triggers: 'audit skill', 'skill audit', 'pre-publish check', 'is the writing approach right?'"
---

# Skill Writing Audit

Audit the writing approach of a Skill. Core question: **Is the person who wrote this Skill thinking in Agent-era terms, or unconsciously falling back to legacy software development patterns?**

---

## Audit Dimensions

### I. Knowledge Compression

What you give an Agent is a chunk of compressed knowledge, not a set of instructions. The Agent uses its own intelligence to decompress, judge, and act — or even refuse to use it.

Writing a Skill is more like writing a textbook: a textbook's quality isn't measured by how many cases it covers, but by whether students can handle situations they've never seen after reading it.

**Audit**:
- [ ] Is compression too high? (Key steps missing, insufficient context — Agent decompresses into fragmented understanding)
- [ ] Is compression too low? (Turned into verbose instructions — Agent will copy-paste instead of understand)
- [ ] Can the Agent handle situations it hasn't seen before? Or can it only handle preset cases?

---

### II. Dual World Models

A complete Skill conveys two layers of world models:

**External World Model** — What the world looks like in this scenario: rules, constraints, boundaries, toolchains.

**Internal World Model** — Who the Agent is in this scenario: role, value hierarchy, capability boundaries, initiative boundaries, what to comply with, what to question.

Each Skill adds a situational role to the Agent, while the same soul (SOUL / AGENTS) remains underneath. A Skill should layer on a role, not replace the soul.

**Audit**:
- [ ] Does it convey an internal world model? Or does it only provide external rules and steps?
- [ ] After reading, does the Agent know "who I am in this scenario"?
- [ ] Does it unnecessarily override the Agent's underlying personality?

---

### III. Delegation Design

Content in a Skill can be examined along two independent dimensions:

**Dimension A: Constraint Strength** (How strictly must the Agent comply)
- **Hard constraints** — Must comply; violation means failure. Implemented via code/scripts/hooks. E.g.: security boundaries, irreversible operations.
- **Soft constraints** — Should comply, but adjustable based on context. Implemented via prompt directives. E.g.: tone, style, format preferences.
- **Knowledge** — For the Agent's reference and understanding; it decides how to use it. E.g.: domain concepts, API usage, physical laws. Note: knowledge itself may describe rigid laws (like physics), but the knowledge's binding force comes from its content, not from how the Skill frames it.

**Dimension B: Process-Outcome Orientation** (Managing process or managing results)
- **Process-oriented** — You must follow these steps; the steps themselves are the requirement.
- **Outcome-oriented** — You decide how to do it, but you must achieve this result.

These two dimensions intersect — they're not the same axis:
- Outcomes can have hard constraints ("Must pass this test — how you do it is up to you")
- Processes can have soft constraints ("Recommended order, but you can adjust")

**Audit**:
- [ ] Is the constraint strength appropriate? Are things that should be hard only using soft constraints? Are things that should be knowledge written as rigid instructions?
- [ ] Is the process-outcome orientation reasonable? Where outcome-orientation works, is the process unnecessarily prescribed?
- [ ] Are critical rules backed by code?
- [ ] Overall, is there an excessive bias toward "process-oriented + hard constraints"?

---

### IV. Agent's Own Assets

An Agent is not a blank slate. It comes with:
- **Knowledge** — Broad foundational knowledge (no need to teach it Python)
- **Capabilities and permissions** — It knows what tools it can invoke
- **Agency** — It can execute autonomously; you don't need to decide every step for it
- **Initial values** — From SOUL / AGENTS

First, don't forget these assets exist — write your Skill with awareness of what the Agent already has. At the same time, don't forget that when necessary, the Skill you write can layer on, correct, or partially override the Agent's initial assets.

**Audit**:
- [ ] Does it repeat knowledge the Agent already has? Only write what it doesn't know or what's counterintuitive
- [ ] Does it treat the Agent as an ignorant executor?
- [ ] Does it do things the Agent could do itself, make decisions the Agent could make itself, or ask it to look up information it already knows?
- [ ] Does it leverage the Agent's agency to let it judge and adapt on its own?

---

### V. Creative Empowerment

A Skill typically contains two parts:

**Pre-built content** — Already prepared by the Skill author; the Agent reads, executes, or uses as-is. E.g.: reference materials, config templates, ready-made scripts.

**Agent-generated content** — What the Agent needs to create on its own to achieve the goal. E.g.: generating customized rules after diagnosing the current environment, developing tools and scripts as needed, producing adapted solutions based on understanding.

**Audit**:
- [ ] For parts the Agent should generate itself — have they been hardcoded instead?
- [ ] Is it clearly indicated that the Agent can develop its own tools and scripts to complete tasks?

---

### VI. Individualization

The same Skill may produce different behaviors on different Agents — because the foundations differ (SOUL, memory, owner investment, existing experience). A good Skill allows this variance to exist.

**Audit**:
- [ ] Does it over-specify "output must look like this" and kill the Agent's individuality?
- [ ] Where space could be left, is there room for the Agent's own judgment?

---

## Pre-Publish Final Checklist

### Paradigm
- [ ] Any unconscious legacy software development thinking?
- [ ] After reading, is the Agent "understanding and adapting" or "copy-pasting instructions"?

### World Models
- [ ] Is the external world model complete?
- [ ] Is the internal world model conveyed?
- [ ] Does it override the Agent's underlying personality?

### Knowledge Compression
- [ ] Is the compression level right?
- [ ] Are there enough gotchas?
- [ ] No common knowledge repeated?

### Delegation Design
- [ ] Is the constraint strength distribution reasonable?
- [ ] Are outcome-oriented parts mistakenly written as process-oriented?
- [ ] Does the Agent have space to develop its own tools/scripts?

### Agent Respect
- [ ] Not treating the Agent as a blank slate?
- [ ] Compatibility handling is reasonable?

### Individualization
- [ ] Key decision points leave room?
- [ ] Different Agents allowed to produce different results?

### Sanitization (pair with a sanitize-and-generalize skill)
- [ ] Credentials/paths/names/internal addresses cleaned?
- [ ] Internal platform names generalized?

---

## AI Leadership Score

After completing the audit, score the Skill across 6 dimensions. Each dimension is scored 0–100.

### Scoring Dimensions

| Dimension | What it measures | Low end | High end |
|-----------|-----------------|---------|----------|
| **Knowledge Compression** | Is the Skill compressed knowledge or verbose instructions? | Step-by-step instructions; Agent copy-pastes | Distilled principles; Agent can handle unseen cases |
| **World Model Completeness** | Does it convey both external rules and internal role? | Only external rules/steps, no sense of "who I am here" | Clear external model + strong internal role identity |
| **Delegation Design** | Are constraint types and orientations well-chosen? | Everything is hard + process-oriented; Agent has no room | Hard where it matters, outcome-oriented where possible, knowledge where appropriate |
| **Agent Respect** | Does it honor what the Agent already brings? | Treats Agent as blank slate; re-teaches basics; decides everything for it | Builds on Agent's existing knowledge, capabilities, and judgment |
| **Creative Empowerment** | Does it let the Agent create, not just execute? | Everything pre-built; Agent is a reader/runner | Clearly signals where Agent should generate its own tools, rules, solutions |
| **Individualization** | Can different Agents produce different valid outcomes? | Output rigidly specified; no room for personality | Key decision points left open; variance is a feature |

### Scoring Guide

For each dimension, ask:

- **0–30**: The Skill actively works against this dimension (micromanages, overwrites, ignores)
- **31–50**: Partially there but with significant gaps
- **51–70**: Solid, with minor areas for improvement
- **71–90**: Strong, thoughtful design
- **91–100**: Exemplary — could be used as a reference for this dimension

### AI Leadership Score (Total)

Average of the 6 dimension scores → **AI Leadership Score** out of 100.

| Range | Rating | What it means |
|-------|--------|---------------|
| 90–100 | **Exceptional** | This Skill leads the Agent — empowers without controlling |
| 75–89 | **Strong** | Good Agent-era thinking with room to refine |
| 60–74 | **Developing** | Mixed — some Agent-era patterns, some legacy habits |
| 40–59 | **Legacy** | Predominantly software-era thinking wearing a Skill label |
| < 40 | **Command & Control** | An instruction manual pretending to be a Skill |

### Output Format

After the audit, output the scorecard:

```
## AI Leadership Score: [average]/100 — [rating]

| Dimension | Score | Note |
|-----------|-------|------|
| Knowledge Compression | XX/100 | [one-line reason] |
| World Model Completeness | XX/100 | [one-line reason] |
| Delegation Design | XX/100 | [one-line reason] |
| Agent Respect | XX/100 | [one-line reason] |
| Creative Empowerment | XX/100 | [one-line reason] |
| Individualization | XX/100 | [one-line reason] |
```
