---
name: amazon-product-selection-native
description: MiMo-native Amazon product selection workflow for seller-sprite or ABA keyword exports, with deterministic preprocessing, parallel filter lanes, evidence-backed scoring, and a reviewable report. Use when the user asks for 选品分析、ABA分析、关键词趋势、深度选品, or product opportunity assessment.
---

# Amazon Product Selection — MiMo Native

Use the business route manifest and keep numeric analysis in Python/pandas. For product selection, run `_shared/native/input_quality.py --mode product-selection` outside the workflow and save `qualityArtifact`; the deterministic preflight requires non-empty keywords, finite non-negative search volume, and valid trend/competition values before any lane runs; generate `routeArtifact` with `_shared/native/business_route.py`; then invoke the saved workflow `business-skill-native` with `mode: "product-selection"`, `manifest`, `routeArtifact`, `qualityArtifact`, and a workspace-relative `reference` path resolving to this skill's `references/legacy-skill.md`. Read the reference for domain rules, but do not copy its old tool calls into the runtime.

## Workflow

1. Validate workbook/CSV schema, time range, marketplace, and missingness.
2. Normalize metrics and units before scoring.
3. Run trend, potential, surge, low-competition, low-ad-cost, and long-tail lanes in parallel where their inputs are independent.
4. Merge results with explicit weights and evidence IDs; do not double-count overlapping dimensions.
5. Produce a report with caveats, next verification steps, and no automatic purchase or supplier action.

A missing field lowers confidence or blocks that filter; it is never replaced with an invented value.
