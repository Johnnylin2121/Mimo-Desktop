---
name: trading-value-investing-native
description: MiMo-native value-investing knowledge workflow with cited framework retrieval, user constraints, valuation checklists, and lightweight scenario comparison. Use when the user asks about 价值投资、估值、仓位、行业分析, or wants the value-investing framework applied to a decision.
---

# Trading Value Investing — MiMo Native

Use the business route manifest as a light knowledge route, not a heavy actor workflow. Generate `routeArtifact` before invoking the saved workflow `business-skill-native` with `mode: "value-investing"`, `manifest`, `routeArtifact`, and a workspace-relative `reference` path resolving to this skill's `references/legacy-skill.md`. Read the reference for domain rules, but do not copy its old tool calls into the runtime.

## Rules

- Cite the local framework chapter or reference used for each material conclusion.
- Separate framework facts, user-specific constraints, current market data, and the agent's synthesis.
- Ask for missing risk, horizon, liquidity, and portfolio constraints before producing a personalized allocation.
- Use parallel critique only when comparing multiple valuation or industry assumptions.
- Never turn an incomplete chapter set or stale data into a definitive investment conclusion.
