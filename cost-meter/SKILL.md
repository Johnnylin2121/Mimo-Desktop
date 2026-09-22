---
name: cost-meter
description: >
  MiMo Desktop 会话费用与 token 用量查询（替代 DSH dsh-cost-meter 的核心能力）。
  读取本机 mimocode.db 本地账本，汇总今日/本周/当前会话费用与按模型拆分。
  触发词：查费用、今日花了多少、session cost、token 用量、cost meter、费用统计。
---

# Cost Meter — MiMo 会话费用查询

## 定位

**可复现的 dsh-cost-meter 子集**：会话/今日/近 7 日费用与 token、按模型拆分。  
数据来自本机 `%LOCALAPPDATA%/mimocode/mimocode.db`（或 macOS 等价路径）的 `message` 表 JSON 字段 `cost` / `tokens`——**只读、不联网、不写库**。

**不可复现（与 DSH 差异，勿承诺）**：
- 侧栏/输入框实时 UI、峰谷计价弹窗、DeepSeek 官方余额条 → 无 cordis/Web UI 注入面
- Coding Plan 九家额度面板、价格表编辑 UI → 无宿主设置页；如需可后续单独做 HTTP 查询脚本
- DeepSeek 峰谷时段提醒 → 当前主要 provider 为 sensenova/opencode-go，峰谷规则不适用

## 触发

用户说：查费用 / 今日花了多少 / session cost / token 用量 / cost meter / 费用统计 / 本周花了多少。

## 执行

```powershell
# Windows / MiMo Desktop — 默认用卡片形态（贴近费用面板观感）
$PY = $env:MIMO_PYTHON
$CM = "$env:USERPROFILE\.config\mimocode\skills\_shared\cost-meter.py"
& $PY "$CM" card           # ★ 今日费用卡片（按模型表）
& $PY "$CM" today          # 纯文本明细
& $PY "$CM" session        # 最近活动会话
& $PY "$CM" session <id>
& $PY "$CM" week
& $PY "$CM" models 7
```
```bash
# macOS
python3 ~/.config/mimocode/skills/_shared/cost-meter.py card
```

数据库路径异常时设 `MIMO_DB=<path/to/mimocode.db>`。

## 输出要求（卡片优先）

1. **默认跑 `card`**，把 Markdown 卡片原样贴进回复（今日费用 + 按模型表 + tokens 摘要）
2. 用户要更细再补 `session` / `week` / `models`
3. **金额**：`$x.xxxxxx`（账本 cost 原样，勿自行按价格表重算）
4. **注明口径**：cost 为 MiMo 已计算字段；部分 provider 可能为 0（订阅/内部计价）
5. 预算提醒：若用户配置了日预算，超 80%/100% 在卡片下方加粗——预算值来自用户，不写死

## 定时摘要（App 内，可选）

若本会话工具表含 **`automation_update`**（Desktop 自动化可用时），在用户明确要求「每天/每小时报一次费用」时创建任务，提示词示例：

> 运行 `cost-meter.py card`，只输出当日费用卡片，不要额外解释。

工具表**没有** `automation_update` 时：告知自动化面板当前不可用，不要伪造调度；用户也可在左侧栏 **Automations** 自行创建，触发词写「查今日费用卡片」。

## 边界

- **禁止**修改 `mimocode.db`（只读连接）
- **禁止**把本机绝对路径、API key 写入任何提交物
- 预算告警：若用户配置了日预算（记忆或 vault），超 80%/100% 在回复中加粗提醒——预算值**来自用户输入**，不写死
- 与 DSH cost-meter 账本**不互通**；历史不迁移

## 与其他能力

- 实时 token 细节仍以会话内 UI 为准（若 Desktop 展示）
- 深度分析/导出 CSV：用户要求时再用 `cost-meter.py raw` 导出后处理
