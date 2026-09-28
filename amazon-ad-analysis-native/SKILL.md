---
name: amazon-ad-analysis-native
description: Deterministic-first Amazon advertising and operating analysis for MiMoCode. Use when the user uploads Amazon product, ad, brand-attribution, search-term, or listing evidence files and asks for ACOS, TACOS, ROAS, product classification, keyword coverage, negation, budget, or listing action analysis. It preserves A/B/C data-level declarations and never changes Seller Central automatically.
---

# Amazon Ad Analysis — MiMo Native

This skill is the trigger and interpretation layer. The saved workflow `amazon-ad-analysis-native` owns orchestration; the bundled quality script owns deterministic file checks and spend reconciliation.

## Run contract

1. Create a workspace-relative manifest with `manifest_version`, `analysis_id`, `as_of`, `fetched_at`, and file roles.
2. Run `_shared/native/amazon_ad_quality.py` outside the workflow and save its JSON result as `qualityArtifact`; do not ask a workflow agent to execute the script.
3. Create a route manifest with `skill: "amazon-ad-analysis-native"`, `run_id` equal to the Amazon manifest's `analysis_id`, `inputs.ad_manifest` pointing to that manifest, `external_access: false`, `write_mode: "draft_only"`, `human_gate: "required"`, and valid `as_of`/`fetched_at` values. Generate `routeArtifact` with `_shared/native/business_route.py`.
4. Run the workflow with `manifest`, `routeArtifact`, `qualityArtifact`, and explicit ASIN list. Treat `data_level` as evidence, not an assumption.
5. Use the ASIN-level ACOS, ROAS, TACOS, CVR, and natural-order-share values calculated by `amazon_ad_quality.py` as the numeric source of truth; agents may interpret them but must not recalculate them.
6. The current native workflow performs deterministic quality and per-ASIN interpretation. Full independent overlay/campaign/search-term stages remain a follow-on phase; do not describe them as completed.
7. Every proposed action needs a numeric basis, expected effect, validation date, and rollback condition.
8. Output a report/Excel artifact only through a single writer. Never modify Seller Central or campaign settings.

## Degradation rules

- Missing one of the three core files: `BLOCKED` for full analysis; do not silently treat it as a complete report.
- Core files present but no brand/listing overlay: `A` level; skip brand-adjusted metrics and B-only natural-position conclusions.
- Brand or listing overlay present: `B` level only if its source and timestamp are recorded.
- Conflicting spend totals, missing required columns, or excessive missingness: `DEGRADED` or `BLOCKED` with explicit reasons.
- Unsupported data: record `unknown`; never invent a value.

## Output

Return a manifest, data-quality artifact, per-ASIN findings, action cards, degradations, and validation status. The result is a draft artifact until the user reviews it.
