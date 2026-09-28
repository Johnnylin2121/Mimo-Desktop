---
name: trading-policy-impact-native
description: MiMo-native policy and event impact research with parallel evidence lanes, causal hypotheses, historical comparisons, and an explicit tracking state. Use when the user says 追踪这个政策、分析政策影响, or asks to assess an event's industry and market impact.
---

# Trading Policy Impact — MiMo Native

Use the business route manifest and create one task per policy event. Generate `routeArtifact` before invoking the saved workflow `business-skill-native` with `mode: "policy-impact"`, `manifest`, `routeArtifact`, and a workspace-relative `reference` path resolving to this skill's `references/legacy-skill.md`. Read the reference for domain rules, but do not copy its old tool calls into the runtime.

## Workflow

1. Normalize the event and verify the authoritative source and publication time.
2. Run parallel lanes for official text, industry chain, historical precedent, and market reaction.
3. Separate facts, causal hypotheses, and market narrative.
4. Map affected entities with direction, mechanism, time lag, and confidence.
5. Store the event as tracking, verified, or expired; do not force a conclusion from price movement alone.

Use Browser Use through the `websearch` skill for open-web research. Historical memory supplies context, not authority. Any Vault topic/entity write is a separate user-approved step.
