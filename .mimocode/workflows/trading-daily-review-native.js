export const meta = {
  name: "trading-daily-review-native",
  description: "Read-only MiMo-native phased trading review workflow with checkpoint-friendly results",
  whenToUse: "for premarket, intraday, or postmarket trading review drafts",
  phases: [
    { title: "Collect" },
    { title: "Observe" },
    { title: "Decide" },
  ],
  model: "standard",
}

const laneSchema = {
  type: "object",
  properties: {
    lane: { type: "string" },
    status: { type: "string", enum: ["clear", "needs_review", "degraded", "blocked"] },
    observations: { type: "array", items: { type: "string" } },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          evidence_id: { type: "string" },
          source: { type: "string" },
          locator: {
            type: "object",
            properties: {
              file: { type: "string" },
              sheet: { type: "string" },
              row: { type: "integer", "minimum": 1 },
              url: { type: "string" },
            },
            additionalProperties: false,
          },
          as_of: { type: "string" },
          fetched_at: { type: "string" },
          raw_value: {},
          transformation: { type: "string" },
          confidence: { type: "number" },
          data_level: { type: "string", enum: ["A", "B", "C", "unknown"] },
        },
        required: ["evidence_id", "source", "locator", "as_of", "fetched_at", "raw_value", "transformation", "confidence", "data_level"],
        additionalProperties: false,
      },
    },
    next_checks: { type: "array", items: { type: "string" } },
  },
  required: ["lane", "status", "observations", "evidence", "next_checks"],
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

async function readOptional(manifestPath, files, key, workspaceRoot) {
  const value = files && files[key]
  if (!value) return null
  return readFile(relativeToManifest(manifestPath, value, workspaceRoot))
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

function isCompleteDailyEvidence(item) {
  const required = ["evidence_id", "source", "locator", "as_of", "fetched_at", "raw_value", "transformation", "confidence", "data_level"]
  if (!item || !hasExactKeys(item, required) || !isSafeRelativePath(item.source) || !item.locator || typeof item.locator !== "object" || Array.isArray(item.locator)) return false
  if (item.locator.file !== undefined && !isSafeRelativePath(item.locator.file)) return false
  return typeof item.evidence_id === "string" && item.evidence_id.trim().length > 0 && typeof item.transformation === "string" && item.transformation.trim().length > 0 && isRfc3339(item.as_of) && isRfc3339(item.fetched_at) && typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1 && ["A", "B", "C", "unknown"].includes(item.data_level)
}

function sanitizeDailyLanes(lanes) {
  return lanes.map((lane) => {
    if (!lane || !Array.isArray(lane.evidence)) return { ...(lane || {}), status: "blocked", evidence: [], next_checks: ["修复 lane 后重试"] }
    const evidence = lane.evidence.map((item) => isCompleteDailyEvidence(item) ? item : null)
    if (evidence.some((item) => item === null)) return { ...lane, status: "blocked", evidence: [], next_checks: ["lane returned invalid or unsafe evidence"] }
    return { ...lane, evidence }
  })
}

function blocked(reason) {
  const evidenceId = "blocked:phase-gate"
  return {
    status: "blocked",
    reason,
    evidence: [{
      evidence_id: evidenceId,
      source: "phase-gate",
      locator: { file: "phase-gate" },
      raw_value: { reason },
      as_of: "1970-01-01T00:00:00Z",
      fetched_at: "1970-01-01T00:00:00Z",
      transformation: reason,
      confidence: 0,
      data_level: "unknown",
    }],
    artifact: {
      schema_version: "1.0",
      artifact_id: "blocked-daily-review",
      kind: "trading-daily-review-draft",
      status: "blocked",
      generator: "workflows/trading-daily-review-native.js",
      evidence_ids: [evidenceId],
      validation: { status: "failed", checks: ["phase", "inputs"] },
      human_gate: "required",
    },
    human_decisions: [reason],
    validation: { checks: ["phase", "inputs"], status: "failed" },
  }
}

export default async function () {
  const input = args || {}
  if (!input.manifest) return blocked("missing manifest")
  if (typeof input.workspaceRoot !== "string" || !input.workspaceRoot.trim()) return blocked("workspaceRoot is required")
  const manifestText = await readFile(input.manifest)
  if (!manifestText) return blocked("manifest not found")
  let manifest
  try {
    manifest = JSON.parse(manifestText)
  } catch (error) {
    return blocked(`invalid manifest: ${error.message}`)
  }
  if (!isSafeIdentifier(manifest.run_id)) return blocked("run_id must be a safe identifier")
  const manifestKeys = ["manifest_version", "run_id", "phase", "as_of", "fetched_at", "files"]
  const allowedFileKeys = new Set(["previous_review", "current_review", "early_read", "plans", "memory", "market_snapshot"])
  if (!hasExactKeys(manifest, manifestKeys) || manifest.manifest_version !== "1.0" || !manifest.files || typeof manifest.files !== "object" || Array.isArray(manifest.files) || Object.keys(manifest.files).some((key) => !allowedFileKeys.has(key))) return blocked("manifest shape, version, or file keys are invalid")
  const requiredByPhase = {
    premarket: ["previous_review", "early_read", "plans", "memory"],
    intraday: ["plans", "market_snapshot"],
    postmarket: ["previous_review", "current_review", "plans", "memory", "market_snapshot"],
  }
  if (!isRfc3339(manifest.as_of) || !isRfc3339(manifest.fetched_at)) return blocked("daily review manifest timestamps must be RFC3339 with timezone")
  const required = requiredByPhase[manifest.phase]
  if (!required) return blocked(`unknown phase: ${manifest.phase || "missing"}`)
  const missing = required.filter((key) => !manifest.files || !manifest.files[key])
  if (missing.length) return blocked(`missing phase inputs: ${missing.join(", ")}`)
  try {
    for (const value of Object.values(manifest.files || {})) relativeToManifest(input.manifest, value, input.workspaceRoot)
  } catch (error) {
    return blocked(String(error.message || error))
  }

  phase("Collect")
  const content = {}
  for (const key of Object.keys(manifest.files || {})) {
    content[key] = await readOptional(input.manifest, manifest.files, key, input.workspaceRoot)
    if (required.includes(key) && content[key] === null) return blocked(`input could not be read: ${key}`)
  }
  const sourceText = JSON.stringify(content)

  phase("Observe")
  const lanes = sanitizeDailyLanes(await parallel([
    ["data", "只检查数据时点、缺失、冲突和来源；不要做交易动作。"],
    ["plan", "只检查当前计划、持仓和触发条件的一致性；不要改计划。"],
    ["memory", "只检查当前判断与有效记忆的偏离，并标记需要人工裁决。"],
  ].map(([lane, instruction]) => () =>
    agent(
      `${instruction}\n阶段：${manifest.phase}\n不要调用 bash、网络或外部动作。缺失数据必须标记 needs_review。\n输入：${sourceText}`,
      {
        agentType: "explore",
        model: "standard",
        tools: ["read"],
        schema: laneSchema,
        label: `daily-${lane}`,
        timeoutMs: 120000,
      }
    ).then((result) => result || { lane, status: "blocked", observations: [], evidence: [], next_checks: ["补齐输入后重试"] })
  )))

  phase("Decide")
  const synthesis = await agent(
    `你是单写者，只生成复盘草案，不写文件。根据 lane 结果输出阶段结论、观察清单、下一步检查和人工决策。不得把缺失数据判为安全。\n\n阶段：${manifest.phase}\n结果：${JSON.stringify(lanes)}`,
    {
      agentType: "general",
      model: "standard",
      tools: [],
      schema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "degraded", "blocked"] },
          summary: { type: "string" },
          next_checks: { type: "array", items: { type: "string" } },
          human_decisions: { type: "array", items: { type: "string" } },
        },
        required: ["status", "summary", "next_checks", "human_decisions"],
        additionalProperties: false,
      },
      label: `daily-synthesis-${manifest.phase}`,
      timeoutMs: 120000,
    }
  )
  const needsReview = lanes.filter((lane) => lane.status !== "clear")
  const hasBlockedLane = lanes.some((lane) => lane.status === "blocked")
  const validationStatus = !synthesis || synthesis.status === "blocked" || hasBlockedLane ? "failed" : needsReview.length === 0 ? "passed" : "degraded"
  const artifactStatus = !synthesis || synthesis.status === "blocked" || hasBlockedLane ? "blocked" : "draft"
  const evidenceId = `${manifest.run_id}:manifest`
  const manifestPointer = portableInputPath(input.manifest)
  return {
    schema_version: "1.0",
    status: artifactStatus,
    mode: "read_only_draft",
    run_id: manifest.run_id,
    phase: manifest.phase,
    as_of: manifest.as_of,
    lanes,
    synthesis,
    evidence: [{
      evidence_id: evidenceId,
      source: manifestPointer,
      locator: { file: manifestPointer },
      raw_value: { manifest: manifestPointer },
      confidence: 1.0,
      as_of: manifest.as_of,
      fetched_at: manifest.fetched_at,
      transformation: "read phase manifest and inputs",
      data_level: "unknown",
    }],
    artifact: {
      schema_version: "1.0",
      artifact_id: `${manifest.run_id}:daily-${manifest.phase}`,
      kind: "trading-daily-review-draft",
      status: artifactStatus,
      generator: "workflows/trading-daily-review-native.js",
      evidence_ids: [evidenceId],
      validation: { status: validationStatus, checks: ["phase-inputs", "read-only", "single-writer"] },
      human_gate: "required",
    },
    human_decisions: [...(synthesis?.human_decisions || []), ...needsReview.map((lane) => `${lane.lane}: ${lane.observations.join("；")}`)],
    checkpoint: { resumable: false, completed_lanes: lanes.filter((lane) => lane.status !== "blocked").map((lane) => lane.lane) },
  }
}
