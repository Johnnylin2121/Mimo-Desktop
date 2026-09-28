---
name: trading-briefing-fetch
description: 早报自动层数据抓取（akshare+快讯）。商品价格表/美股指数/财联社系快讯 → 输出自动层 markdown 到 交易体系/早读复核/，作为「早读复核」（trading-briefing-review）的自动数据源与人工参考。用户说"跑早报"、"抓今天数据"、"生成早报草稿"时使用。
---

# 环境与执行纪律（MiMo 2026-09-22）

1. 无 `xueqiu_*`——勿调用；RSS 插件不存在，vault 已有 digest 可选加载。
2. **每轮 ≤3 tool**；write 与 task 分轮；会话内禁止重复 read 本 SKILL；失败 1 次减负。
3. 依赖 Python+akshare（`$MIMO_PYTHON` 或 python3 自装）；脚本失败保留 [待补] 并文字汇报。

# 早报自动层数据抓取 (briefing-fetch)

## 定位
为「早读复核」提供**自动数据层**：抓取行情与快讯，与人工正式早读（`交易体系/财经早读/`）交叉印证。数据层本身不做观点、不做审阅结论——复核判断走 `trading-briefing-review`。

## 触发
用户说：跑早报 / 抓今天的数据 / 生成早报草稿 / 数据表自动化

## 执行步骤
1. 运行 `pwsh -NoProfile -File "{VAULT_PATH}\_系统\scripts\fetch-briefing.ps1"`（可加 `-Date YYYY-MM-DD` 指定日期）
2. 读取输出 `交易体系/早读复核/YYYY-MM-DD-财经早报-自动草稿.md`
3. 呈现给用户：商品表（含 A50）/美股表/要闻筛选三块，标注 [待补] 项
4. 会话内可做要闻初筛排序（六类关注方向），但**终筛结论与复核判断属于 trading-briefing-review**，此处不产出审阅结论

## 关键约定
- **输出目录**：`交易体系/早读复核/`（2026-09-08 由"早报草稿"改名；与正式 `交易体系/财经早读/` 隔离）
- 文件头部带"自动数据层、未经人工审核"标记；**不自动入库，永不回写正式早读**
- 数据口径：商品/美股 = 最近两根日线收盘（与人工版"15:00→次日6:30"口径不同，复核时按 trading-briefing-review 的四态规则判定）；A50 = 新浪 hq.sinajs.cn hf_CHA50CFD（实时快照，字段0=最新/7=昨收）
- **复核触发**：正式早读入库后由用户手动触发"复核早读"（trading-briefing-review）；本 skill 不自动触发复核
- 依赖：Python + akshare。MiMo Desktop 用 `$PY = $env:MIMO_PYTHON`（内置含 pandas/openpyxl；**akshare 需自行安装到该解释器**，或改用 vault 内既有 `fetch-briefing.py` 依赖的解释器）。接口偶发失效时重试 1 次并保留 [待补]。跨端对照见 `_shared/PORTABILITY.md`。

## 配套
- 可选第二信息源：若 vault 已有 `交易体系/早报数据/rss-digest/digests/` 历史文件，复核时可一并加载（无则跳过，不依赖任何 RSS 插件）
- 复核流程：`trading-briefing-review` skill

## 脚本
- 抓取核心: `_系统/scripts/fetch-briefing.py`
- 入口: `_系统/scripts/fetch-briefing.ps1`
