---
name: trading-contradiction-check-native
description: Read-only near-term trading contradiction detection for MiMoCode. Use when the user says 检查矛盾、有没有前后矛盾、矛盾检测, or when a post-market review needs to compare recent forecasts, sector views, holdings logic, volume judgments, and current memory rules. It produces structured findings and human decision items without modifying Vault files.
---

# Trading Contradiction Check — MiMo Native

Use the saved workflow `trading-contradiction-check-native` for the actual run. This skill is the trigger and interpretation layer; the workflow owns fan-out and aggregation.

## Run contract

1. Create or receive a workspace-relative input manifest with `manifest_version`, `run_id`, and these file keys: `previous_review`, `day_before_review`, `current_review`, `plans`, `memory`.
2. Run the workflow with the manifest as its `manifest` argument and pass the fixed current workspace root as `workspaceRoot`; the workflow rejects inputs that resolve outside that root.
3. Read the five structured dimension results. Do not silently treat a missing file or failed detector as a clear result; preserve `needs_review` or `blocked`.
4. Present contradictions, deviations, and human decisions separately. A memory deviation is a prior-reference signal, not proof of an error.
5. Never modify plans, reviews, memory, or Vault files during detection. Any later update requires a separate, explicitly authorized workflow.

## Interpretation rules

- Recent-window only: previous review, day-before review, and current review.
- A sector change supported by a new event or new data is not automatically a contradiction.
- Forecast deviation thresholds remain governed by the supplied business rules; do not invent new thresholds.
- Historical authorization is never current authorization to trade or publish.
- Missing evidence is `needs_review`, not `clear`.

## Output

Return the workflow result as JSON-compatible data with:

- `run_id`
- `status`: `completed`, `degraded`, or `blocked`
- `dimensions`: five detector results
- `human_decisions`: unresolved classification or evidence questions
- `validation`: checks performed and any degradation

The result is a report artifact, not a Vault write.
