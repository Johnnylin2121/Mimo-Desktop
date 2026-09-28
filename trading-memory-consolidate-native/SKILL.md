---
name: trading-memory-consolidate-native
description: Read-only MiMo-native memory consolidation for trading reviews. Use when the user asks to 整理交易记忆、合并记忆、查记忆冲突, or wants a draft eight-section memory table. It classifies evidence and asks for human decisions before any archive or Vault write.
---

# Trading Memory Consolidate — MiMo Native

Use the saved workflow `trading-memory-consolidate-native` for classification and draft generation, passing the fixed current workspace root as `workspaceRoot`; all source and table paths must remain inside that root. This first phase never moves, edits, or deletes files.

## Required gates

1. Explicitly present the five methodology questions and receive the user's acknowledgement.
2. Provide a manifest with `method_acknowledged: true`, source memory files, and the current memory table.
3. Classify each record as evolution, true conflict, complement, factual error, or coverage gap.
4. Return a draft summary and human decisions. Only a later, separately authorized write workflow may update Vault or Git.

## Memory boundary

- MiMo memory stores the run state, user-approved method, failure lessons, and pointers.
- Vault/domain-memory stores the original evidence, rule lineage, actual results, and approved status.
- Do not store raw price snapshots or unverified conclusions in runtime memory.
- Never silently convert a deviation into an error; ask for a human classification when market structure may have changed.

## Output

Return `status`, per-record classifications, draft table sections, unresolved decisions, and a validation summary. The result is read-only.
