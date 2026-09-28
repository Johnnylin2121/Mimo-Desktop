---
name: trading-briefing-review-native
description: MiMo-native read-only review of a formal financial briefing against automatic data, current memory rules, and blind spots. Use when the user says 复核早读、早读复核, or asks for a data and judgment review without changing the formal briefing.
---

# Trading Briefing Review — MiMo Native

Use the business route manifest and preserve the formal briefing as immutable input. Generate `routeArtifact` before invoking the saved workflow `business-skill-native` with `mode: "briefing-review"`, `manifest`, `routeArtifact`, and a workspace-relative `reference` path resolving to this skill's `references/legacy-skill.md`. Read the reference for domain rules, but do not copy its old tool calls into the runtime.

## Review lanes

1. Data: verify time, value, unit, source, and four-state data status.
2. Judgment: compare claims with current domain memory and identify unsupported certainty.
3. Blind spots: produce at most three high-value missing checks.

Run lanes in parallel when the input is complete. Use a single writer for the final review artifact. Missing data is never treated as safe or correct.

## Write boundary

Write only to the designated review output after user confirmation. Never write back to the formal briefing, trading memory, or plans. Preserve source links and unresolved decisions.
