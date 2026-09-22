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
# Windows / MiMo Desktop
$PY = $env:MIMO_PYTHON
$CM = "$env:USERPROFILE\.config\mimocode\skills\_shared\cost-meter.py"
& $PY "$CM" today          # 今日
& $PY "$CM" session        # 最近活动会话
& $PY "$CM" session <id>   # 指定会话
& $PY "$CM" week           # 近 7 日
& $PY "$CM" models 7       # 按模型（近 N 日）
```
```bash
# macOS
python3 ~/.config/mimocode/skills/_shared/cost-meter.py today
```

数据库路径异常时设 `MIMO_DB=<path/to/mimocode.db>`。

## 输出要求

1. 先跑 `today`，再按需 `session` / `week` / `models`
2. **金额**：展示 `$x.xxxxxx`（账本 cost 原样，勿自行按价格表重算）
3. **注明口径**：cost 为 MiMo 已计算字段；部分 provider 可能为 0（订阅/内部计价）
4. tokens 分：input / output / cache_read / total；大数字用千分位
5. 不把完整 session id 列表刷屏；默认摘要 + 用户点名再展开

## 边界

- **禁止**修改 `mimocode.db`（只读连接）
- **禁止**把本机绝对路径、API key 写入任何提交物
- 预算告警：若用户配置了日预算（记忆或 vault），超 80%/100% 在回复中加粗提醒——预算值**来自用户输入**，不写死
- 与 DSH cost-meter 账本**不互通**；历史不迁移

## 与其他能力

- 实时 token 细节仍以会话内 UI 为准（若 Desktop 展示）
- 深度分析/导出 CSV：用户要求时再用 `cost-meter.py raw` 导出后处理
