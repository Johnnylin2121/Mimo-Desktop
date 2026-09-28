export const meta = {
  name: "trading-memory-consolidate-native",
  description: "Read-only MiMo-native classification and draft generation for trading memory consolidation",
  whenToUse: "when the user has approved the memory methodology and requests a memory consolidation draft",
  phases: [
    { title: "Gate" },
    { title: "Classify" },
    { title: "Draft" },
  ],
  model: "standard",
}

const recordSchema = {
  type: "object",
  properties: {
    source: { type: "string" },
    date: { type: "string" },
    prediction: { type: "string" },
    actual: { type: "string" },
    deviation: { type: "string" },
    proposed_rule: { type: "string" },
    classification: { type: "string", enum: ["evolution", "true_conflict", "complement", "factual_error", "coverage_gap", "clear"] },
    confidence: { type: "number" },
    human_decision_required: { type: "boolean" },
  },
  required: ["source", "date", "prediction", "actual", "deviation", "proposed_rule", "classification", "confidence", "human_decision_required"],
  additionalProperties: false,
}

function isAbsolutePath(value) {
  return typeof value === "string" && (/^(?:[A-Za-z]:[\\/]|[\\/]|\/\/)/.test(value))
}

function isSafeIdentifier(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128 && !isAbsolutePath(value) && !/[\\/\0]/.test(value) && !/^[A-Za-z]:/.test(value) && !value.includes("..") && !/[\u0000-\u001f]/.test(value)
}

function hasExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
}

function normalizeWorkspacePath(value) {
  const raw = String(value || "").replaceAll("\\", "/")
  const driveMatch = raw.match(/^([A-Za-z]:)(?:\/|$)/)
  const absolute = Boolean(driveMatch) || raw.startsWith("/")
  const parts = []
  for (const segment of raw.split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      if (parts.length && parts[parts.length - 1] !== "..") parts.pop()
      else if (!absolute) parts.push("..")
    } else {
      parts.push(segment)
    }
  }
  return { absolute, drive: driveMatch?.[1] || "", parts }
}

function combineWorkspacePath(baseValue, childValue) {
  const base = typeof baseValue === "string" ? normalizeWorkspacePath(baseValue) : baseValue
  const child = String(childValue || "").replaceAll("\\", "/")
  if (isAbsolutePath(child)) return normalizeWorkspacePath(child)
  const parts = [...base.parts]
  for (const segment of child.split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      if (!parts.length && base.absolute) throw new Error("input path escapes the workspace root")
      if (parts.length) parts.pop()
      else parts.push("..")
    } else {
      parts.push(segment)
    }
  }
  return { absolute: base.absolute, drive: base.drive, parts }
}

function pathIsWithin(candidate, root) {
  if (candidate.parts[0] === "..") return false
  if (candidate.absolute !== root.absolute || candidate.drive !== root.drive || candidate.parts.length < root.parts.length) return false
  return root.parts.every((part, index) => candidate.parts[index] === part)
}

function formatWorkspacePath(value) {
  const prefix = value.absolute ? (value.drive ? `${value.drive}/` : "/") : ""
  const parts = value.drive && value.parts[0] === value.drive ? value.parts.slice(1) : value.parts
  return `${prefix}${parts.join("/")}` || (value.absolute ? (value.drive || "/") : ".")
}

function isSafeRelativePath(value) {
  return typeof value === "string" && value.trim().length > 0 && !isAbsolutePath(value) && !value.replaceAll("\\", "/").split("/").includes("..")
}

function isSafeManifestPath(value) {
  return typeof value === "string" && value.trim().length > 0 && !isAbsolutePath(value)
}

function relativeToManifest(manifestPath, value, workspaceRoot) {
  if (!isSafeManifestPath(value)) throw new Error("input path must be relative to the manifest")
  const root = normalizeWorkspacePath(workspaceRoot)
  const manifest = combineWorkspacePath(root, manifestPath)
  const base = { ...manifest, parts: manifest.parts.slice(0, -1) }
  if (!pathIsWithin(base, root)) throw new Error("manifest is outside the workspace root")
  const candidate = combineWorkspacePath(base, value)
  if (!pathIsWithin(candidate, root)) throw new Error("input path escapes the workspace root")
  return formatWorkspacePath(candidate)
}

function isRfc3339(value) {
  const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/)
  if (!match) return false
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  const hour = Number(match[4]); const minute = Number(match[5]); const second = Number(match[6])
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]); const offsetMinute = match[9] === undefined ? 0 : Number(match[9])
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return false
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
}

function portableInputPath(value) {
  const raw = String(value || "").replaceAll("\\", "/")
  if (!raw || raw.includes("\0")) return "input"
  if (/^(?:[A-Za-z]:[\\/]|[\\/]|\/\/)/.test(raw)) {
    const parts = raw.split("/").filter(Boolean)
    return parts[parts.length - 1] || "input"
  }
  const parts = raw.split("/")
  if (parts.includes("..")) return parts[parts.length - 1] || "input"
  return raw
}

function blocked(reason) {
  const evidenceId = "blocked:memory-gate"
  return {
    status: "blocked",
    reason,
    records: [],
    evidence: [{
      evidence_id: evidenceId,
      source: "memory-gate",
      locator: { file: "memory-gate" },
      raw_value: { reason },
      as_of: "1970-01-01T00:00:00Z",
      fetched_at: "1970-01-01T00:00:00Z",
      transformation: reason,
      confidence: 0,
      data_level: "unknown",
    }],
    artifact: {
      schema_version: "1.0",
      artifact_id: "blocked-memory",
      kind: "trading-memory-draft",
      status: "blocked",
      generator: "workflows/trading-memory-consolidate-native.js",
      evidence_ids: [evidenceId],
      validation: { status: "failed", checks: ["method-gate", "inputs"] },
      human_gate: "required",
    },
    human_decisions: [reason],
    validation: { checks: ["method-gate", "inputs"], status: "failed" },
  }
}

export default async function () {
  const input = args || {}
  if (!input.manifest) return blocked("missing manifest")
  if (typeof input.workspaceRoot !== "string" || !input.workspaceRoot.trim()) return blocked("workspaceRoot is required")
  phase("Gate")
  const manifestText = await readFile(input.manifest)
  if (!manifestText) return blocked("manifest not found")
  let manifest
  try {
    manifest = JSON.parse(manifestText)
  } catch (error) {
    return blocked(`invalid manifest: ${error.message}`)
  }
  const manifestKeys = ["manifest_version", "run_id", "as_of", "fetched_at", "method_acknowledged", "approval_ref", "files", "memory_table"]
  if (!hasExactKeys(manifest, manifestKeys) || manifest.manifest_version !== "1.0") return blocked("manifest shape or version is invalid")
  if (!isSafeIdentifier(manifest.run_id)) return blocked("run_id must be a safe identifier")
  if (!isRfc3339(manifest.as_of) || !isRfc3339(manifest.fetched_at)) return blocked("memory manifest timestamps must be RFC3339 with timezone")
  if (manifest.method_acknowledged !== true || typeof manifest.approval_ref !== "string" || !manifest.approval_ref.trim()) {
    return blocked("methodology acknowledgement and approval_ref are required")
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) return blocked("memory files must not be empty")
  try {
    relativeToManifest(input.manifest, manifest.memory_table, input.workspaceRoot)
    for (const file of manifest.files) relativeToManifest(input.manifest, file, input.workspaceRoot)
  } catch (error) {
    return blocked(String(error.message || error))
  }

  const tableText = await readFile(relativeToManifest(input.manifest, manifest.memory_table, input.workspaceRoot))
  if (tableText === null) return blocked("memory table not found")
  const sources = []
  for (const file of manifest.files) {
    const content = await readFile(relativeToManifest(input.manifest, file, input.workspaceRoot))
    if (content === null) return blocked(`memory file not found: ${file}`)
    sources.push({ file, content })
  }

  phase("Classify")
  const results = await parallel(sources.map((source) => () =>
    agent(
      `你是交易记忆分类器。只读分析下面的单个记忆文件，并用当前记忆总表做对照。不要修改文件，不要调用 bash 或网络，不要把偏离直接判为错误。返回结构化分类；需要人工裁决时标记 human_decision_required。\n\n当前记忆总表：\n${tableText}\n\n待分类文件：${source.file}\n${source.content}`,
      {
        agentType: "explore",
        model: "standard",
        tools: ["read"],
        schema: recordSchema,
        label: `memory-${source.file}`,
        timeoutMs: 120000,
      }
    ).then((result) => result || {
      source: source.file,
      date: "unknown",
      prediction: "",
      actual: "",
      deviation: "",
      proposed_rule: "",
      classification: "coverage_gap",
      confidence: 0,
      human_decision_required: true,
    })
  ))

  phase("Draft")
  const draft = await agent(
    `你是单写者，只生成只读草案，不写文件。根据分类记录生成八区记忆总表草案、冲突说明和人工决策清单。缺失或未确认内容必须显式标记。\n\n记录：${JSON.stringify(results)}`,
    {
      agentType: "general",
      model: "standard",
      tools: [],
      schema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "degraded", "blocked"] },
          sections: { type: "object" },
          human_decisions: { type: "array", items: { type: "string" } },
        },
        required: ["status", "sections", "human_decisions"],
        additionalProperties: false,
      },
      label: "memory-draft-synthesis",
      timeoutMs: 120000,
    }
  )
  const counts = {}
  for (const item of results) counts[item.classification] = (counts[item.classification] || 0) + 1
  const humanDecisions = [
    ...results.filter((item) => item.human_decision_required).map((item) => `${item.source}: ${item.classification}`),
    ...(draft?.human_decisions || []),
  ]
  const evidenceId = `${manifest.run_id}:manifest`
  const manifestPointer = portableInputPath(input.manifest)
  return {
    schema_version: "1.0",
    status: draft?.status || "degraded",
    mode: "read_only_draft",
    run_id: manifest.run_id,
    records: results,
    classification_counts: counts,
    draft,
    evidence: [{
      evidence_id: evidenceId,
      source: manifestPointer,
      locator: { file: manifestPointer },
      raw_value: { manifest: manifestPointer },
      confidence: 1.0,
      as_of: manifest.as_of,
      fetched_at: manifest.fetched_at,
      transformation: "read memory manifest and table",
      data_level: "unknown",
    }],
    artifact: {
      schema_version: "1.0",
      artifact_id: `${manifest.run_id}:memory-draft`,
      kind: "trading-memory-draft",
      status: !draft || draft.status === "blocked" ? "blocked" : "draft",
      generator: "workflows/trading-memory-consolidate-native.js",
      evidence_ids: [evidenceId],
      validation: { status: !draft || draft.status === "blocked" ? "failed" : "degraded", checks: ["method-gate", "all-inputs-read", "single-writer-draft"] },
      human_gate: "required",
    },
    human_decisions: humanDecisions,
  }
}
