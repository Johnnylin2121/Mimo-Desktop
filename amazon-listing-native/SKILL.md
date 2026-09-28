---
name: amazon-listing-native
description: MiMo-native Amazon Listing workflow with staged human gates, marketplace policy checks, competitor collection, keyword analysis, and deterministic text validation. Use when the user asks for 亚马逊 listing、竞品分析、标题五点、商品亮点、后台搜索词, or listing optimization.
---

# Amazon Listing — MiMo Native

Use the business route manifest and keep collection separate from content generation. For Listing, run `_shared/native/input_quality.py --mode listing` outside the workflow and save `qualityArtifact`; the deterministic preflight expects UTF-8 `.md`/`.txt` snapshots with explicit `User-confirmed`/`已确认` product facts and competitor `ASIN`/`Title` records; generate `routeArtifact` with `_shared/native/business_route.py`; then invoke the saved workflow `business-skill-native` with `mode: "listing"`, `manifest`, `routeArtifact`, `qualityArtifact`, and a workspace-relative `reference` path resolving to this skill's `references/legacy-skill.md`. Read the reference for domain rules, but do not copy its old tool calls into the runtime.

## Stages

1. Confirm marketplace, category, product facts, and applicable policy date.
2. Collect competitor evidence through the configured browser capability or user-provided text.
3. Use a precomputed deterministic keyword artifact when available; otherwise mark keyword analysis `needs_review` and do not run ad-hoc scripts inside a read-only lane.
4. Draft title, item highlights, bullets, and backend terms with a validation artifact.
5. Stop at each user confirmation gate before advancing.
6. Optionally use later advertising evidence for feedback, but never infer a natural-position claim without evidence.

Validate character limits, UTF-8 byte limits, repetition, prohibited claims, keyword placement, and unverified product claims with deterministic code. Do not modify Seller Central automatically.
