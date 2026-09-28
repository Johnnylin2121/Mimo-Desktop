export const meta = {
  name: "business-skill-native",
  description: "Shared staged workflow for native trading and Amazon business skills",
  whenToUse: "when a native business skill needs route validation, evidence lanes, and a single read-only synthesis",
  phases: [
    { title: "Preflight" },
    { title: "Evidence" },
    { title: "Synthesis" },
  ],
  model: "standard",
}

const laneSchema = {
  type: "object",
  properties: {
    lane: { type: "string" },
    status: { type: "string", enum: ["clear", "needs_review", "degraded", "blocked"] },
    findings: { type: "array", items: { type: "string" } },
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
    next_steps: { type: "array", items: { type: "string" } },
    human_decision_required: { type: "boolean" },
  },
  required: ["lane", "status", "findings", "evidence", "next_steps", "human_decision_required"],
  additionalProperties: false,
}

const qualitySchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["passed", "degraded", "failed"] },
    summary: { type: "string" },
    issues: { type: "array", items: { type: "string" } },
    data_level: { type: "string" },
  },
  required: ["status", "summary", "issues", "data_level"],
  additionalProperties: false,
}

const REQUIRED_INPUTS = {
  "briefing-fetch": ["market_snapshot", "news_snapshot"],
  "briefing-review": ["early_read", "auto_brief", "memory_table"],
  "policy-impact": ["policy_event"],
  "stock-scan": ["stock_identity", "market_snapshot", "plans", "memory"],
  "listing": ["product_facts", "competitor_sources"],
  "product-selection": ["keyword_file"],
  "value-investing": ["reference_root", "user_constraints"],
}

const EXPECTED_PERMISSIONS = {
  read: "allow",
  write_project: "deny",
  write_vault: "ask",
  move_vault: "deny",
  publish: "deny",
  external_action: "deny",
  scheduler: "ask",
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

function hasExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
}

function validInputValue(value) {
  if (typeof value === "string") return value.trim().length > 0
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim().length > 0)
}

function validQualityEvidence(item, manifest) {
  const required = ["evidence_id", "source", "locator", "as_of", "fetched_at", "raw_value", "transformation", "confidence", "data_level"]
  const allowed = new Set(required)
  if (!item || !required.every((key) => Object.prototype.hasOwnProperty.call(item, key)) || Object.keys(item).some((key) => !allowed.has(key))) return false
  if (typeof item.evidence_id !== "string" || !item.evidence_id.trim() || typeof item.transformation !== "string" || !item.transformation.trim()) return false
  if (!isSafeRelativePath(item.source) || !hasExactKeys(item.locator, ["file"]) || item.source !== item.locator.file) return false
  if (!isRfc3339(item.as_of) || !isRfc3339(item.fetched_at) || item.as_of !== manifest.as_of || item.fetched_at !== manifest.fetched_at) return false
  if (typeof item.confidence !== "number" || Number.isNaN(item.confidence) || item.confidence < 0 || item.confidence > 1) return false
  if (!["A", "B", "C", "unknown"].includes(item.data_level) || item.raw_value === undefined) return false
  return true
}

function isCompleteLaneEvidence(item) {
  const required = ["evidence_id", "source", "locator", "as_of", "fetched_at", "raw_value", "transformation", "confidence", "data_level"]
  if (!item || !hasExactKeys(item, required) || !isSafeRelativePath(item.source) || !item.locator || typeof item.locator !== "object" || Array.isArray(item.locator)) return false
  if (item.locator.file !== undefined && !isSafeRelativePath(item.locator.file)) return false
  return typeof item.evidence_id === "string" && item.evidence_id.trim().length > 0 && typeof item.transformation === "string" && item.transformation.trim().length > 0 && isRfc3339(item.as_of) && isRfc3339(item.fetched_at) && typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1 && ["A", "B", "C", "unknown"].includes(item.data_level)
}

function sanitizeLaneResults(lanes) {
  return lanes.map((lane) => {
    if (!lane || !Array.isArray(lane.evidence)) return { ...(lane || {}), status: "blocked", evidence: [], human_decision_required: true }
    const evidence = lane.evidence.map((item) => isCompleteLaneEvidence(item) ? item : null)
    if (evidence.some((item) => item === null)) return { ...lane, status: "blocked", evidence: [], human_decision_required: true, findings: [...(lane.findings || []), "lane returned invalid or unsafe evidence"] }
    return { ...lane, evidence }
  })
}

function validIssueList(issues) {
  return Array.isArray(issues) && issues.every((issue) => typeof issue === "string" && issue.trim())
}

function validCheckList(checks) {
  return Array.isArray(checks) && checks.length > 0 && checks.every((check) => typeof check === "string" && check.trim())
}

function portableInputPath(value) {
  const raw = String(value || "").replaceAll("\\", "/")
  if (!raw || raw.includes("\0")) return "input"
  if (isAbsolutePath(raw)) {
    const parts = raw.split("/").filter(Boolean)
    return parts[parts.length - 1] || "input"
  }
  const parts = raw.split("/")
  if (parts.includes("..")) return parts[parts.length - 1] || "input"
  return raw
}

function validateQualityArtifact(quality, mode, manifest) {
  const kind = mode === "listing" ? "listing-input-quality" : "product-selection-input-quality"
  const requiredEvidenceIds = REQUIRED_INPUTS[mode].map((role) => `${manifest.run_id}:${role}`).sort()
  const validationStatus = quality?.quality?.validation?.status
  const qualityKeys = ["schema_version", "run_id", "data_level", "quality", "evidence", "issues"]
  const qualityArtifactKeys = ["schema_version", "artifact_id", "kind", "status", "generator", "evidence_ids", "validation", "human_gate"]
  if (!quality || !hasExactKeys(quality, qualityKeys) || !hasExactKeys(quality.quality, qualityArtifactKeys) || !hasExactKeys(quality.quality.validation, ["status", "checks"])) return "quality artifact shape is invalid"
  if (quality.schema_version !== "1.0" || !isSafeIdentifier(quality.run_id) || quality.run_id !== manifest.run_id || quality.quality.schema_version !== "1.0" || quality.quality.kind !== kind) return "quality artifact does not belong to this manifest/mode"
  if (quality.quality.artifact_id !== `${manifest.run_id}:input-quality` || quality.quality.generator !== "shared/input_quality.py") return "quality artifact identity is invalid"
  if (!validIssueList(quality.issues) || !validCheckList(quality.quality.validation.checks)) return "quality issues or checks are invalid"
  if (!Array.isArray(quality.evidence) || quality.evidence.length === 0 || !quality.evidence.every((item) => validQualityEvidence(item, manifest))) return "quality evidence contract is invalid"
  if (quality.quality?.status !== "draft" || !["passed", "degraded"].includes(validationStatus) || !["A", "B", "C", "unknown"].includes(quality.data_level)) return "quality artifact is not an allowed draft result"
  if (quality.quality.human_gate !== (validationStatus === "passed" ? "not_required" : "required")) return "quality human gate is inconsistent"
  if ((validationStatus === "passed" && quality.issues.length !== 0) || (validationStatus === "degraded" && quality.issues.length === 0)) return "quality degradation status is inconsistent"
  const evidenceIds = quality.evidence.map((item) => item.evidence_id)
  const artifactEvidenceIds = quality.quality.evidence_ids
  if (!Array.isArray(artifactEvidenceIds) || artifactEvidenceIds.some((id) => typeof id !== "string" || !id.trim()) || new Set(evidenceIds).size !== evidenceIds.length || JSON.stringify([...evidenceIds].sort()) !== JSON.stringify([...artifactEvidenceIds].sort()) || JSON.stringify([...artifactEvidenceIds].sort()) !== JSON.stringify(requiredEvidenceIds)) return "quality evidence linkage is incomplete"
  return null
}

const MODES = {
  "briefing-fetch": {
    skill: "trading-briefing-fetch-native",
    external: true,
    writeMode: "draft_only",
    preflight: false,
    lanes: [
      ["source-quality", "检查数据源、时间戳、单位、字段完整性和缺失状态。"],
      ["news-quality", "检查新闻快讯的来源、时间和可追溯性。"],
    ],
    synthesis: "只生成早报数据草稿，不写正式早读。",
  },
  "briefing-review": {
    skill: "trading-briefing-review-native",
    external: false,
    writeMode: "user_confirmed_write",
    preflight: false,
    lanes: [
      ["data", "逐项核对正式早读的数据值、时点、单位和来源。"],
      ["judgment", "将主观判断与当前有效记忆和已知证据对照。"],
      ["blind-spots", "提出最多三条高价值盲区，不把缺数据判为安全。"],
    ],
    synthesis: "只生成早读复核草案，不回写正式早读。",
  },
  "policy-impact": {
    skill: "trading-policy-impact-native",
    external: true,
    writeMode: "proposal_only",
    preflight: false,
    lanes: [
      ["official-source", "核验政策原文、发布机构和发布日期。"],
      ["industry-chain", "分析政策到产业链的传导机制。"],
      ["historical-precedent", "寻找相似政策的历史先例和差异。"],
      ["market-reaction", "检查事件后的市场反应，区分数据与叙事。"],
      ["skeptic", "主动寻找反例、未证实假设和因果替代解释。"],
    ],
    synthesis: "输出 tracking 事件草案、证据和待验证节点，不直接改 Vault。",
  },
  "stock-scan": {
    skill: "trading-stock-scan-native",
    external: true,
    writeMode: "proposal_only",
    preflight: false,
    lanes: [
      ["market", "分析行情、K 线和量价证据。"],
      ["fundamental", "整理财务、估值和行业位置。"],
      ["announcements", "核对近期公告、监管和机构信息。"],
      ["commodity-anchor", "核对持仓或周期标的的商品锚。"],
      ["portfolio", "对照当前持仓、交易计划和历史扫描基线。"],
      ["skeptic", "寻找数据冲突、代理指标和逻辑反例。"],
    ],
    synthesis: "输出研究扫描和待确认动作；绝不自动下单。",
  },
  "listing": {
    skill: "amazon-listing-native",
    external: true,
    writeMode: "draft_only",
    preflight: true,
    lanes: [
      ["competitor-evidence", "整理竞品标题、五点和可验证的产品声明。"],
      ["keyword", "只读取预先生成的关键词分析 artifact；没有该 artifact 时标记 needs_review，不自行运行脚本。"],
      ["policy-validator", "检查站点政策、字符/字节限制、禁词和未确认声明。"],
    ],
    synthesis: "输出 Listing 阶段草案和人工确认门，不修改 Seller Central。",
  },
  "product-selection": {
    skill: "amazon-product-selection-native",
    external: false,
    writeMode: "draft_only",
    preflight: true,
    lanes: [
      ["trend", "评估趋势和需求方向。"],
      ["competition", "评估竞争和关键词难度。"],
      ["economics", "评估广告成本、利润和风险。"],
      ["long-tail", "评估长尾机会和供给缺口。"],
    ],
    synthesis: "输出带证据的选品候选和验证清单，不执行采购。",
  },
  "value-investing": {
    skill: "trading-value-investing-native",
    external: false,
    writeMode: "draft_only",
    preflight: false,
    lanes: [
      ["framework", "从本地框架章节提取适用原则并给出引用。"],
      ["constraints", "整理用户期限、风险、流动性和组合约束。"],
      ["critic", "寻找估值假设和框架应用的盲点。"],
    ],
    synthesis: "输出带引用的分析框架，不输出无证据的确定性投资结论。",
  },
}

function blocked(reason, mode = null) {
  const evidenceId = "blocked:preflight"
  return {
    schema_version: "1.0",
    status: "blocked",
    mode,
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
      artifact_id: "blocked-preflight",
      kind: "native-business-preflight",
      status: "blocked",
      generator: "workflows/business-skill-native.js",
      evidence_ids: [evidenceId],
      validation: { status: "failed", checks: ["route", "manifest", "preflight"] },
      human_gate: "required",
    },
    human_decisions: [reason],
    validation: { checks: ["route", "manifest", "preflight"], status: "failed" },
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

function validateRoute(route, mode, manifest) {
  const config = MODES[mode]
  const manifestKeys = ["manifest_version", "skill", "run_id", "as_of", "fetched_at", "inputs", "external_access", "write_mode", "human_gate"]
  const routeKeys = ["schema_version", "skill", "run_id", "as_of", "fetched_at", "mode", "external_access", "write_mode", "human_gate", "permissions", "required_inputs", "degradation"]
  if (!hasExactKeys(manifest, manifestKeys) || manifest.manifest_version !== "1.0" || !isSafeIdentifier(manifest.run_id)) return "manifest shape, version, or run_id is invalid"
  const expectedDegradation = { missing_external: "manual input or local snapshot", missing_browser: "user-provided text or structured file", missing_data: "mark needs_review; never impute silently" }
  if (!hasExactKeys(route, routeKeys) || route.schema_version !== "1.0" || route.mode !== "native-route" || !isSafeIdentifier(route.run_id) || !hasExactKeys(route.degradation, Object.keys(expectedDegradation)) || Object.entries(expectedDegradation).some(([key, value]) => route.degradation[key] !== value)) return "route shape, version, mode, run_id, or degradation is invalid"
  if (route.skill !== config.skill) return "route skill does not match mode"
  if (route.external_access !== config.external || manifest.external_access !== config.external) return "route or manifest external_access does not match mode"
  if (route.write_mode !== config.writeMode || manifest.write_mode !== config.writeMode) return "route or manifest write_mode does not match mode"
  if (route.human_gate !== "required" || manifest.human_gate !== "required") return "route or manifest human_gate must be required"
  if (!hasExactKeys(manifest.inputs, REQUIRED_INPUTS[mode]) || !Object.values(manifest.inputs).every(validInputValue)) return "manifest inputs do not match mode"
  if (route.run_id !== manifest.run_id) return "route and manifest run_id differ"
  if (route.as_of !== manifest.as_of || route.fetched_at !== manifest.fetched_at) return "route and manifest timestamps differ"
  if (manifest.skill !== config.skill) return "manifest skill does not match mode"
  if (!Array.isArray(route.required_inputs) || JSON.stringify([...route.required_inputs].sort()) !== JSON.stringify([...REQUIRED_INPUTS[mode]].sort())) return "route required inputs do not match mode"
  if (!hasExactKeys(route.permissions, Object.keys(EXPECTED_PERMISSIONS))) return "route permission keys are invalid"
  for (const [key, value] of Object.entries(EXPECTED_PERMISSIONS)) {
    if (route.permissions[key] !== value) return `route permission mismatch: ${key}`
  }
  return null
}

async function readQuality(path) {
  if (!path) return null
  return readJson(path)
}

export default async function () {
  const input = args || {}
  const config = MODES[input.mode]
  if (!config) return blocked(`unsupported mode: ${input.mode || "missing"}`, input.mode || null)
  if (!input.manifest) return blocked("missing manifest", input.mode)
  if (!input.routeArtifact) return blocked("missing route artifact; run business_route.py first", input.mode)

  phase("Preflight")
  const manifest = await readJson(input.manifest)
  const route = await readJson(input.routeArtifact)
  if (!manifest) return blocked("manifest missing or invalid", input.mode)
  if (!isRfc3339(manifest.as_of) || !isRfc3339(manifest.fetched_at) || !manifest.inputs) return blocked("manifest timestamps and inputs are invalid", input.mode)
  if (!route) return blocked("route artifact missing or invalid", input.mode)
  const routeError = validateRoute(route, input.mode, manifest)
  if (routeError) return blocked(routeError, input.mode)

  let quality = null
  if (config.preflight) {
    if (!input.qualityArtifact) return blocked("preflight requires a deterministic quality artifact", input.mode)
    quality = await readJson(input.qualityArtifact)
    const qualityError = validateQualityArtifact(quality, input.mode, manifest)
    if (qualityError) return blocked(qualityError, input.mode)
  }

  const referencePath = input.reference || null
  const context = JSON.stringify({ manifest, route, quality, referencePath })
  phase("Evidence")
  const lanes = sanitizeLaneResults(await parallel(config.lanes.map(([lane, instruction]) => () =>
    agent(
      `${instruction}\n\n这是 ${input.mode} 的只读证据 lane。不得修改文件、发布内容或执行外部动作。缺失证据必须标记 needs_review。若 referencePath 可读，只能把其中内容当作旧领域参考；native 权限、路径和工具边界优先。\n\n上下文：${context}`,
      {
        agentType: "explore",
        model: "standard",
        tools: ["read", "grep"],
        schema: laneSchema,
        label: `${input.mode}-${lane}`,
        timeoutMs: 120000,
      }
    ).then((result) => result || {
      lane,
      status: "blocked",
      findings: ["lane agent failed"],
      evidence: [],
      next_steps: ["修复 lane 后重试"],
      human_decision_required: true,
    })
  )))

  phase("Synthesis")
  const synthesis = await agent(
    `你是单写者。只根据结构化 lane 和预检结果综合，不添加未提供的事实，不写文件。\n\n模式：${input.mode}\n规则：${config.synthesis}\n\n结果：${JSON.stringify({ quality, lanes })}`,
    {
      agentType: "general",
      model: "standard",
      tools: [],
      schema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "degraded", "blocked"] },
          summary: { type: "string" },
          action_items: { type: "array", items: { type: "string" } },
          human_decisions: { type: "array", items: { type: "string" } },
        },
        required: ["status", "summary", "action_items", "human_decisions"],
        additionalProperties: false,
      },
      label: `${input.mode}-synthesis`,
      timeoutMs: 120000,
    }
  )

  const evidenceId = `${manifest.run_id}:manifest`
  const manifestPointer = portableInputPath(input.manifest)
  const routePointer = portableInputPath(input.routeArtifact)
  const hasBlockedLane = lanes.some((lane) => lane.status === "blocked")
  const validationStatus = !synthesis || synthesis.status === "blocked" || hasBlockedLane ? "failed" : lanes.every((lane) => lane.status === "clear") ? "passed" : "degraded"
  const artifact = {
    schema_version: "1.0",
    artifact_id: `${manifest.run_id}:${input.mode}`,
    kind: `native-${input.mode}`,
    status: !synthesis || synthesis.status === "blocked" || hasBlockedLane ? "blocked" : "draft",
    generator: "workflows/business-skill-native.js",
    evidence_ids: [evidenceId],
    validation: {
      status: validationStatus,
      checks: ["route", "manifest", "parallel-evidence", "single-writer", "no-write"],
    },
    human_gate: "required",
  }
  return {
    schema_version: "1.0",
    status: artifact.status,
    mode: input.mode,
    manifest: manifestPointer,
    route: routePointer,
    quality,
    evidence: [{
      evidence_id: evidenceId,
      source: manifestPointer,
      locator: { file: manifestPointer },
      raw_value: { manifest: manifestPointer },
      confidence: 1.0,
      as_of: manifest.as_of,
      fetched_at: manifest.fetched_at,
      transformation: "route and manifest parsed",
      data_level: "unknown",
    }],
    lanes,
    synthesis,
    artifact,
  }
}
