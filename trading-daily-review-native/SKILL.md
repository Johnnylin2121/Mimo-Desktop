---
name: trading-daily-review-native
description: MiMo-native phased trading review workflow for premarket, intraday, and postmarket checks. Use when the user asks for 盘前计划、盘中验证、盘后复盘, or wants the daily review resumed from a checkpoint. It uses tasks and actors for phase analysis while preserving human confirmation and Vault write boundaries.
---

# Trading Daily Review — MiMo Native

Use the saved workflow `trading-daily-review-native` with a phase-specific manifest and pass the fixed current workspace root as `workspaceRoot`; all manifest file paths must remain inside that root.

## Phases

- `premarket`: read prior reviews, early read, plans, memory, and a market snapshot; produce an observation checklist.
- `intraday`: read the latest snapshot and plans; compare trigger conditions; never infer missing prices.
- `postmarket`: read the current review, prior review, plans, memory, and snapshot; produce a draft review and contradiction-check input.

## Boundaries

- A task represents a phase or blocked human decision; it is not a timer.
- Actors may read and calculate in parallel; one primary writer creates the final draft.
- Missing or conflicting data is explicit `needs_review`/`degraded`, never a safe-to-trade conclusion.
- Writing Vault files, moving archives, changing plans, or executing trades requires a separate explicit authorization.
- The workflow returns a draft artifact and checkpoint metadata; it does not publish or commit anything.

## Output

Return phase, evidence, observations, proposed next checks, human decisions, and validation status.
