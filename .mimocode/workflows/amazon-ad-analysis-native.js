export const meta = {
  name: "amazon-ad-analysis-native",
  description: "Deterministic-first Amazon ad analysis orchestration with explicit A/B/C data levels",
  whenToUse: "when a validated Amazon quality artifact and route artifact are available",
  phases: [
    { title: "Quality" },
    { title: "ASIN parallel" },
    { title: "Synthesis" },
  ],
  model: "standard",
}

const asinSchema = {
  type: "object",
  properties: {
    asin: { type: "string" },
    status: { type: "string", enum: ["ready", "needs_review", "degraded", "blocked"] },
    role: { type: "string", enum: ["star", "problem", "potential", "retire", "unclassified"] },
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
    findings: { type: "array", items: { type: "string" } },
    action_cards: { type: "array", items: { type: "string" } },
  },
  required: ["asin", "status", "role", "evidence", "findings", "action_cards"],
  additionalProperties: false,
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

function hasExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
}

function isAbsolutePath(value) {
  return typeof value === "string" && (/^(?:[A-Za-z]:[\\/]|[\\/]|\/\/)/.test(value))
}

function isSafeIdentifier(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128 && !isAbsolutePath(value) && !/[\\/\0]/.test(value) && !/^[A-Za-z]:/.test(value) && !value.includes("..") && !/[\u0000-\u001f]/.test(value)
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || !value.trim() || isAbsolutePath(value)) return false
  return !value.replaceAll("\\", "/").split("/").includes("..")
}

const INVALID_ASIN_VALUES = new Set(["unknown", "na", "n/a", "none", "null", "-", "placeholder"])

function isCompleteAgentEvidence(item) {
  const required = ["evidence_id", "source", "locator", "as_of", "fetched_at", "raw_value", "transformation", "confidence", "data_level"]
  if (!item || !hasExactKeys(item, required) || !isSafeRelativePath(item.source) || !item.locator || typeof item.locator !== "object" || Array.isArray(item.locator)) return false
  if (item.locator.file !== undefined && !isSafeRelativePath(item.locator.file)) return false
  return typeof item.evidence_id === "string" && item.evidence_id.trim().length > 0 && typeof item.transformation === "string" && item.transformation.trim().length > 0 && isRfc3339(item.as_of) && isRfc3339(item.fetched_at) && typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1 && ["A", "B", "C", "unknown"].includes(item.data_level)
}

function sanitizeAgentEvidence(item) {
  return isCompleteAgentEvidence(item) ? item : null
}

function isValidAsin(value) {
  return typeof value === "string" && !INVALID_ASIN_VALUES.has(value.trim().toLowerCase()) && /^[A-Za-z0-9]{8,14}$/.test(value.trim())
}

function validQualityEvidence(item, manifest) {
  const required = ["evidence_id", "source", "locator", "as_of", "fetched_at", "raw_value", "transformation", "confidence", "data_level"]
  const allowed = new Set(required)
  if (!item || !required.every((key) => Object.prototype.hasOwnProperty.call(item, key)) || Object.keys(item).some((key) => !allowed.has(key))) return false
  if (typeof item.evidence_id !== "string" || !item.evidence_id.trim() || !item.evidence_id.startsWith(`${manifest.analysis_id}:`) || typeof item.transformation !== "string" || !item.transformation.trim()) return false
  if (!isSafeRelativePath(item.source) || !hasExactKeys(item.locator, ["file"]) || item.source !== item.locator.file) return false
  if (!isRfc3339(item.as_of) || !isRfc3339(item.fetched_at) || item.as_of !== manifest.as_of || item.fetched_at !== manifest.fetched_at) return false
  if (typeof item.confidence !== "number" || Number.isNaN(item.confidence) || item.confidence < 0 || item.confidence > 1) return false
  if (!["A", "B", "C", "unknown"].includes(item.data_level) || item.raw_value === undefined) return false
  return true
}

function validIssueList(issues) {
  return Array.isArray(issues) && issues.every((issue) => typeof issue === "string" && issue.trim())
}

function validCheckList(checks) {
  return Array.isArray(checks) && checks.length > 0 && checks.every((check) => typeof check === "string" && check.trim())
}

function blocked(reason) {
  const evidenceId = "blocked:preflight"
  return {
    schema_version: "1.0",
    status: "blocked",
    reason,
    evidence: [{
      evidence_id: evidenceId,
      source: "preflight",
      locator: { file: "preflight" },
      raw_value: { reason },
      as_of: "1970-01-01T00:00:00Z",
      fetched_at: "1970-01-01T00:00:00Z",
      transformation: reason,
      confidence: 0,
      data_level: "unknown",
    }],
    artifact: {
      schema_version: "1.0",
      artifact_id: "blocked-amazon-ad",
      kind: "amazon-ad-analysis",
      status: "blocked",
      generator: "workflows/amazon-ad-analysis-native.js",
      evidence_ids: [evidenceId],
      validation: { status: "failed", checks: ["route", "quality"] },
      human_gate: "required",
    },
    human_decisions: [reason],
    validation: { checks: ["route", "quality"], status: "failed" },
  }
}

async function readJson(path) {
  const text = await readFile(path)
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (_) {
    return null
  }
}

export default async function () {
  const input = args || {}
  if (!input.manifest || !input.routeArtifact || !input.qualityArtifact) {
    return blocked("manifest, routeArtifact, and qualityArtifact are required")
  }
  const manifest = await readJson(input.manifest)
  const route = await readJson(input.routeArtifact)
  const quality = await readJson(input.qualityArtifact)
  if (!manifest || !route || !quality) return blocked("manifest, route, or quality artifact is missing or invalid")
  if (!isRfc3339(manifest.as_of) || !isRfc3339(manifest.fetched_at)) return blocked("Amazon manifest timestamps must be RFC3339 with timezone")
  const manifestKeys = ["manifest_version", "analysis_id", "as_of", "fetched_at", "files"]
  const manifestAllowedKeys = [...manifestKeys, "requested_level"]
  const qualityKeys = ["schema_version", "analysis_id", "data_level", "quality", "evidence", "metrics", "issues"]
  const qualityArtifactKeys = ["schema_version", "artifact_id", "kind", "status", "generator", "evidence_ids", "validation", "human_gate"]
  const routeKeys = ["schema_version", "skill", "run_id", "as_of", "fetched_at", "mode", "external_access", "write_mode", "human_gate", "permissions", "required_inputs", "degradation"]
  if (!manifest || !manifestKeys.every((key) => Object.prototype.hasOwnProperty.call(manifest, key)) || Object.keys(manifest).some((key) => !manifestAllowedKeys.includes(key)) || !hasExactKeys(quality, qualityKeys) || !hasExactKeys(quality.quality, qualityArtifactKeys) || !hasExactKeys(quality.quality.validation, ["status", "checks"])) return blocked("Amazon manifest or quality shape is invalid")
  if (manifest.manifest_version !== "1.0" || !isSafeIdentifier(manifest.analysis_id) || quality.schema_version !== "1.0" || !isSafeIdentifier(quality.analysis_id) || quality.quality.schema_version !== "1.0") return blocked("Amazon manifest or quality identity is invalid")
  const allowedFileKeys = new Set(["product_performance", "ad_performance", "search_terms", "brand_attribution", "listing_overlay"])
  const coreFiles = ["product_performance", "ad_performance", "search_terms"]
  if (!manifest.files || typeof manifest.files !== "object" || Array.isArray(manifest.files) || Object.keys(manifest.files).some((key) => !allowedFileKeys.has(key)) || coreFiles.some((key) => !Object.prototype.hasOwnProperty.call(manifest.files, key)) || (manifest.requested_level !== undefined && !["A", "B", "C"].includes(manifest.requested_level))) return blocked("Amazon files or requested_level is invalid")
  for (const [key, value] of Object.entries(manifest.files)) {
    if (value !== null && !isSafeRelativePath(value)) return blocked(`Amazon file path is invalid: ${key}`)
  }
  const expectedDegradation = { missing_external: "manual input or local snapshot", missing_browser: "user-provided text or structured file", missing_data: "mark needs_review; never impute silently" }
  if (!hasExactKeys(route, routeKeys) || route.schema_version !== "1.0" || route.mode !== "native-route" || !isSafeIdentifier(route.run_id) || !hasExactKeys(route.degradation, Object.keys(expectedDegradation)) || Object.entries(expectedDegradation).some(([key, value]) => route.degradation[key] !== value)) return blocked("Amazon route shape, version, mode, run_id, or degradation is invalid")
  if (route.skill !== "amazon-ad-analysis-native") return blocked("route skill does not match Amazon workflow")
  if (route.run_id !== manifest.analysis_id) return blocked("route and Amazon manifest analysis_id differ")
  if (route.as_of !== manifest.as_of || route.fetched_at !== manifest.fetched_at) return blocked("route and Amazon manifest timestamps differ")
  if (quality.schema_version !== "1.0" || quality.analysis_id !== manifest.analysis_id) return blocked("quality and Amazon manifest analysis_id differ")
  if (quality.quality?.artifact_id !== `${manifest.analysis_id}:quality` || quality.quality?.generator !== "shared/amazon_ad_quality.py") return blocked("quality artifact identity is invalid")
  if (route.external_access !== false || route.write_mode !== "draft_only" || route.human_gate !== "required") return blocked("Amazon route flags do not match the read-only draft contract")
  if (!Array.isArray(route.required_inputs) || JSON.stringify([...route.required_inputs].sort()) !== JSON.stringify(["ad_manifest"])) return blocked("Amazon route inputs are invalid")
  const expectedPermissions = { read: "allow", write_project: "deny", write_vault: "ask", move_vault: "deny", publish: "deny", external_action: "deny", scheduler: "ask" }
  if (!hasExactKeys(route.permissions, Object.keys(expectedPermissions))) return blocked("Amazon route permission keys are invalid")
  for (const [key, value] of Object.entries(expectedPermissions)) {
    if (route.permissions[key] !== value) return blocked(`Amazon route permission mismatch: ${key}`)
  }
  const qualityStatus = quality.quality.validation.status
  if (!Array.isArray(quality.evidence) || quality.evidence.length === 0 || !quality.evidence.every((item) => validQualityEvidence(item, manifest))) return blocked("quality evidence contract is invalid")
  if (!validIssueList(quality.issues) || !validCheckList(quality.quality.validation.checks)) return blocked("quality issues or checks are invalid")
  const qualityEvidenceIds = quality.quality.evidence_ids
  const evidenceIds = quality.evidence.map((item) => item.evidence_id)
  const evidenceLinked = Array.isArray(qualityEvidenceIds) && qualityEvidenceIds.length === evidenceIds.length && qualityEvidenceIds.every((id) => typeof id === "string" && id.trim()) && new Set(evidenceIds).size === evidenceIds.length && JSON.stringify([...evidenceIds].sort()) === JSON.stringify([...qualityEvidenceIds].sort())
  if (quality.quality.kind !== "amazon-ad-data-quality" || quality.quality.status !== "draft" || !["passed", "degraded"].includes(qualityStatus) || !evidenceLinked || !["A", "B", "C", "unknown"].includes(quality.data_level)) return blocked("deterministic quality artifact is incomplete or failed")
  if (quality.quality.human_gate !== (qualityStatus === "passed" ? "not_required" : "required")) return blocked("quality human gate is inconsistent")
  if ((qualityStatus === "passed" && quality.issues.length !== 0) || (qualityStatus === "degraded" && quality.issues.length === 0)) return blocked("quality degradation status is inconsistent")
  if (!Array.isArray(input.asins) || input.asins.length === 0 || input.asins.some((asin) => !isValidAsin(asin)) || new Set(input.asins).size !== input.asins.length) return blocked("at least one unique, valid ASIN is required")
  if (!Array.isArray(quality.metrics?.asin_metrics)) return blocked("deterministic quality has no ASIN metrics array")
  const metricAsins = quality.metrics.asin_metrics.map((item) => item?.asin)
  if (metricAsins.some((asin) => !isValidAsin(asin)) || new Set(metricAsins).size !== metricAsins.length) return blocked("deterministic quality contains invalid ASIN metrics")
  const knownAsins = new Set(metricAsins)
  if (input.asins.some((asin) => !knownAsins.has(asin))) return blocked("requested ASIN is not present in deterministic metrics")

  phase("Quality")
  const qualitySummary = quality
  const asins = input.asins
  phase("ASIN parallel")
  const asinResults = await parallel(asins.map((asin) => () =>
    agent(
      `只分析 ASIN ${asin}。基于 route、quality artifact 和输入文件做只读业务解释。不得运行命令、修改文件、访问 Seller Central 或修改广告设置。缺失数据使用 needs_review；确定性指标以 quality artifact 为准。\n\nroute: ${JSON.stringify(route)}\nquality: ${JSON.stringify(qualitySummary)}\nmanifest: ${input.manifest}`,
      {
        agentType: "explore",
        model: "standard",
        tools: ["read", "grep"],
        schema: asinSchema,
        label: `asin-${asin}`,
        timeoutMs: 120000,
      }
    ).then((result) => {
      if (!result || result.asin !== asin || !Array.isArray(result.evidence)) return { asin, status: "blocked", role: "unclassified", evidence: [], findings: ["ASIN agent failed or returned a mismatched identifier"], action_cards: [] }
      const evidence = result.evidence.map((item) => sanitizeAgentEvidence(item))
      if (evidence.some((item) => item === null)) return { asin, status: "blocked", role: "unclassified", evidence: [], findings: ["ASIN agent returned invalid or unsafe evidence"], action_cards: [] }
      return { ...result, evidence }
    })
  ))

  const hasBlockedAsin = asinResults.some((item) => item.status === "blocked")
  const resultStatus = hasBlockedAsin ? "blocked" : qualityStatus === "passed" ? "draft" : "degraded"
  const artifactStatus = hasBlockedAsin ? "blocked" : "draft"
  const validationStatus = hasBlockedAsin ? "failed" : qualityStatus
  return {
    schema_version: "1.0",
    status: resultStatus,
    data_level: qualitySummary.data_level,
    quality: qualitySummary,
    route,
    asin_results: asinResults,
    evidence: qualitySummary.evidence || [],
    artifact: {
      schema_version: "1.0",
      artifact_id: `${manifest.analysis_id}:ad-analysis`,
      kind: "amazon-ad-analysis",
      status: artifactStatus,
      generator: "workflows/amazon-ad-analysis-native.js",
      evidence_ids: evidenceIds,
      validation: { status: validationStatus, checks: ["route", "deterministic-quality", "asin-fan-out", "single-writer"] },
      human_gate: "required",
    },
    human_decisions: [
      ...(qualitySummary.issues || []),
      ...asinResults.filter((item) => item.status !== "ready").map((item) => `${item.asin}: requires review`),
    ],
    validation: { checks: ["route", "deterministic-quality", "asin-fan-out", "single-writer"], status: validationStatus },
  }
}
