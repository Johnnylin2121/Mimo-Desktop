---
name: trading-stock-scan-native
description: MiMo-native stock research workflow with parallel market, announcement, financial, news, commodity-anchor, and portfolio-context lanes. Use when the user says 深度扫描、研究一下、个股怎么样, or requests a repeatable stock scan.
---

# Trading Stock Scan — MiMo Native

Use the business route manifest and branch on first scan versus incremental rescan. Generate `routeArtifact` before invoking the saved workflow `business-skill-native` with `mode: "stock-scan"`, `manifest`, `routeArtifact`, and a workspace-relative `reference` path resolving to this skill's `references/legacy-skill.md`. Read the reference for domain rules, but do not copy its old tool calls into the runtime.

## Required behavior

- Parallelize independent data lanes, but return structured source, as_of, value, and confidence fields.
- Compare an incremental scan with the previous baseline instead of repeating every section.
- Keep sector flow, K-line proxies, and historical records labeled as proxies when direct data is unavailable.
- Produce a research report and a list of suggested checks; never auto-place or auto-execute an order.
- A historical pre-authorization is not current authorization. Any trade action requires a fresh, explicit confirmation.

Missing or conflicting data stays visible in the report and blocks a confident conclusion.
