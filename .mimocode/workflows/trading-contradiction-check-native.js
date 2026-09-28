export const meta = {
  name: "trading-contradiction-check-native",
  description: "Read-only MiMo-native contradiction detection across five trading review dimensions",
  whenToUse: "after a recent trading review when contradiction detection is requested",
  phases: [
    { title: "Collect" },
    { title: "Detect" },
    { title: "Aggregate" },
  ],
  model: "standard",
}

const detectorSchema = {
  type: "object",
  properties: {
    dimension: { type: "string" },
    status: { type: "string", enum: ["clear", "contradiction", "deviation", "needs_review", "blocked"] },
    summary: { type: "string" },
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
    recommendation: { type: "string" },
    human_decision_required: { type: "boolean" },
  },
  required: ["dimension", "status", "summary", "evidence", "recommendation", "human_decision_required"],
  additionalProperties: false,
}

function failedResult(dimension, reason) {
  return {
    dimension,
    status: "blocked",
    summary: reason,
    evidence: [],
    recommendation: "补齐输入或修复工作流后重试；不要把阻塞当作无矛盾。",
    human_decision_required: true,
  }
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

function isCompleteDetectorEvidence(item) {
  const required = ["evidence_id", "source", "locator", "as_of", "fetched_at", "raw_value", "transformation", "confidence", "data_level"]
  if (!item || !hasExactKeys(item, required) || !isSafeRelativePath(item.source) || !item.locator || typeof item.locator !== "object" || Array.isArray(item.locator)) return false
  if (item.locator.file !== undefined && !isSafeRelativePath(item.locator.file)) return false
  return typeof item.evidence_id === "string" && item.evidence_id.trim().length > 0 && typeof item.transformation === "string" && item.transformation.trim().length > 0 && isRfc3339(item.as_of) && isRfc3339(item.fetched_at) && typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1 && ["A", "B", "C", "unknown"].includes(item.data_level)
}

function sanitizeDetectorResults(results) {
  return results.map((result) => {
    if (!result || !Array.isArray(result.evidence)) return { ...(result || {}), status: "blocked", evidence: [], human_decision_required: true }
    const evidence = result.evidence.map((item) => isCompleteDetectorEvidence(item) ? item : null)
    if (evidence.some((item) => item === null)) return { ...result, status: "blocked", evidence: [], human_decision_required: true, summary: "detector returned invalid or unsafe evidence" }
    return { ...result, evidence }
  })
}

function blockedResult(reason) {
  const evidenceId = "blocked:manifest"
  return {
    schema_version: "1.0",
    status: "blocked",
    reason,
    dimensions: [failedResult("input", reason)],
    evidence: [{
      evidence_id: evidenceId,
      source: "manifest",
      locator: { file: "manifest" },
      raw_value: { reason },
      as_of: "1970-01-01T00:00:00Z",
      fetched_at: "1970-01-01T00:00:00Z",
      transformation: reason,
      confidence: 0,
      data_level: "unknown",
    }],
    artifact: {
      schema_version: "1.0",
      artifact_id: "blocked-contradiction",
      kind: "trading-contradiction-report",
      status: "blocked",
      generator: "workflows/trading-contradiction-check-native.js",
      evidence_ids: [evidenceId],
      validation: { status: "failed", checks: ["manifest", "input-files"] },
      human_gate: "required",
    },
    human_decisions: [reason],
    validation: { checks: ["manifest", "input-files"], status: "failed" },
  }
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

async function readSources(manifestPath, workspaceRoot) {
  const text = await readFile(manifestPath)
  if (!text) throw new Error(`manifest not found: ${manifestPath}`)
  const manifest = JSON.parse(text)
  if (!hasExactKeys(manifest, ["manifest_version", "run_id", "as_of", "fetched_at", "files"]) || manifest.manifest_version !== "1.0") throw new Error("manifest shape or version is invalid")
  if (!isSafeIdentifier(manifest.run_id)) throw new Error("run_id must be a safe identifier")
  const required = ["previous_review", "day_before_review", "current_review", "plans", "memory"]
  if (!hasExactKeys(manifest.files, required)) throw new Error("manifest files keys are invalid")
  if (!isRfc3339(manifest.as_of) || !isRfc3339(manifest.fetched_at)) throw new Error("manifest requires RFC3339 as_of and fetched_at")
  for (const key of required) {
    if (!manifest.files || !manifest.files[key]) throw new Error(`manifest missing files.${key}`)
    const path = relativeToManifest(manifestPath, manifest.files[key], workspaceRoot)
    const content = await readFile(path)
    if (content === null) throw new Error(`input file not found: ${path}`)
    manifest.files[key] = content
  }
  return manifest
}

function detectorPrompt(dimension, sources) {
  return `你是只读交易复盘审查器，只处理“${dimension}”维度。\n\n输入文件如下。不要修改任何文件，不要调用 bash、网络或外部动作，不要补造缺失数据。\n\n${JSON.stringify(sources)}\n\n只返回结构化结果。clear 只表示输入充分且未发现矛盾；任何缺证据、规则不明或需要解释的情况使用 needs_review。历史记忆是参考，不是自动裁决。`
}

export default async function () {
  const input = args || {}
  const manifestPath = input.manifest
  if (!manifestPath) {
    return blockedResult("missing manifest argument")
  }
  if (typeof input.workspaceRoot !== "string" || !input.workspaceRoot.trim()) return blockedResult("workspaceRoot is required")

  phase("Collect")
  let sources
  try {
    sources = await readSources(manifestPath, input.workspaceRoot)
  } catch (error) {
    return blockedResult(String(error.message || error))
  }

  phase("Detect")
  const dimensions = [
    ["forecast_vs_actual", "预判与实际"],
    ["sector_continuity", "板块判断连贯性"],
    ["holding_logic", "持仓逻辑一致性"],
    ["volume_continuity", "量能判断一致性"],
    ["memory_precedent", "今日判断与记忆先例"],
  ]
  const results = sanitizeDetectorResults(await parallel(dimensions.map(([key, label]) => () =>
    agent(detectorPrompt(label, sources), {
      agentType: "explore",
      model: "standard",
      tools: ["read"],
      schema: detectorSchema,
      label: key,
      timeoutMs: 120000,
    }).then((result) => result || failedResult(key, `detector failed: ${label}`))
  )))

  phase("Aggregate")
  const humanDecisions = results
    .filter((result) => result.human_decision_required)
    .map((result) => `${result.dimension}: ${result.summary}`)
  const hasBlocked = results.some((result) => result.status === "blocked")
  const hasNeedsReview = results.some((result) => result.status === "needs_review")
  const artifactStatus = hasBlocked ? "blocked" : hasNeedsReview ? "draft" : "verified"
  const validationStatus = hasBlocked ? "failed" : hasNeedsReview ? "degraded" : "passed"
  const resultStatus = hasBlocked ? "blocked" : hasNeedsReview ? "degraded" : "completed"
  const evidenceId = `${sources.run_id}:manifest`
  const manifestPointer = portableInputPath(manifestPath)
  const evidence = {
    evidence_id: evidenceId,
    source: manifestPointer,
    locator: { file: manifestPointer },
    raw_value: { manifest: manifestPointer },
    confidence: 1.0,
    as_of: sources.as_of,
    fetched_at: sources.fetched_at,
    transformation: "read and indexed review manifest",
    data_level: "unknown",
  }
  const artifact = {
    schema_version: "1.0",
    artifact_id: `${sources.run_id}:contradiction-check`,
    kind: "trading-contradiction-report",
    status: artifactStatus,
    generator: "workflows/trading-contradiction-check-native.js",
    evidence_ids: [evidenceId],
    validation: { status: validationStatus, checks: ["manifest", "five-dimensions", "read-only", "single-writer"] },
    human_gate: "required",
  }
  return {
    schema_version: "1.0",
    status: resultStatus,
    run_id: sources.run_id,
    dimensions: results,
    evidence: [evidence],
    artifact,
    human_decisions: humanDecisions,
  }
}
