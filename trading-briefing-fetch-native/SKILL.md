---
name: trading-briefing-fetch-native
description: MiMo-native financial briefing data workflow with source adapters, field validation, explicit missing-data states, and resumable task state. Use when the user asks to 跑早报、抓今天数据、生成早报草稿, or needs a data-quality-checked briefing draft.
---

# Trading Briefing Fetch — MiMo Native

Use the business route manifest and the shared source-quality contract. Generate `routeArtifact` before invoking the saved workflow `business-skill-native` with `mode: "briefing-fetch"`, `manifest`, `routeArtifact`, and a workspace-relative `reference` path resolving to this skill's `references/legacy-skill.md`. Read the reference for domain rules, but do not copy its old tool calls into the runtime. Keep data acquisition, interpretation, and rendering separate.

## Required behavior

- Prefer the existing local market/news adapters when available; do not replace structured feeds with unverified snippets.
- For open-web research, load the `websearch` skill and use its Browser Use path; do not use plain webfetch as the search path.
- Validate timestamp, source, units, and field completeness for every block.
- Mark unavailable data as `[待补]` or `degraded`; never infer a value from stale memory.
- Use MiMo tasks for each data block and checkpoint after each successful block.
- Produce a draft only. Do not overwrite the formal briefing or Vault records in this route.

## Boundaries

A scheduled prompt can request the workflow, but it does not replace an OS scheduler when MiMo is not running. Data-source failures are reported, not hidden.
