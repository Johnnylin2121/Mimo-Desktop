# Mimo-Desktop

MiMo Desktop 技能配置仓库 — 从个人 DSH（DeepSeek Harness）技能集全面适配而来。跨会话持久化，换机一键恢复。

> **源仓库**：技能原版在 `Johnnylin2121/dsh-agent`（DSH 专用，本仓不回写、不推送该仓库）。
> 本仓为 MiMo Desktop 适配版真源：`git@github.com:Johnnylin2121/Mimo-Desktop.git`。
> 许可：MIT（见 `LICENSE`）。

## 安装

MiMo Desktop 全局技能扫描根为 `~/.config/mimocode/skills/`（目录名 = 技能稳定 ID，须与 `SKILL.md` frontmatter `name` 一致）。

```powershell
# 方式 A：目录为空时，直接克隆为技能根
git clone git@github.com:Johnnylin2121/Mimo-Desktop.git "$HOME\.config\mimocode\skills"

# 方式 B：已有技能时，克隆到临时目录后复制技能子目录
git clone git@github.com:Johnnylin2121/Mimo-Desktop.git "$env:TEMP\Mimo-Desktop"
Copy-Item "$env:TEMP\Mimo-Desktop\*" "$HOME\.config\mimocode\skills\" -Recurse -Force
# 或只复制需要的技能目录，如 trading-daily-review、amazon-listing
```

安装后新开会话自动发现技能；无需注册步骤。Plugins 页展示名与简介来自各技能 `locales/zh-CN.json` / `locales/en-US.json`。

## 包含什么

### Skills（21 个）

| 类别 | 技能 | 用途 |
|------|------|------|
| **交易** | `trading-daily-review` | A股每日复盘全流程（盘前→盘中→盘后） |
| | `trading-contradiction-check` | 盘后矛盾检测（预判vs实际、持仓逻辑一致性） |
| | `trading-policy-impact` | 政策/事件影响链路分析 |
| | `trading-stock-scan` | 个股深度研究（公告/评级/资金/技术面） |
| | `trading-value-investing` | 价值投资体系（Mr.Dang功法，含 ch01–ch14） |
| | `trading-briefing-fetch` | 财经早报数据抓取（akshare+快讯→标准md草稿） |
| | `trading-briefing-review` | 早读复核（数据四态判定 + 主观判断审阅 + 盲区标记） |
| | `trading-memory-consolidate` | 交易记忆批量审阅与八区记忆总表生成 |
| **Amazon** | `amazon-ad-analysis` | 广告数据分析与经营分析（8-Phase DAG + 产出校验） |
| | `amazon-listing` | Listing优化（2026-07新政策：标题≤75+亮点≤125→五点→后台搜索词） |
| | `amazon-product-selection` | 选品分析（卖家精灵/ABA关键词趋势） |
| **知识库** | `obsidian-vault-sync` | 文件同步到 Obsidian vault + wiki entities/topics |
| | `obsidian-reconcile` | 检测 vault 中的矛盾信息 |
| | `domain-memory` | 跨会话领域记忆管理（trading / amazon-* / general） |
| **效率** | `caveman` | 极简输出模式（lite/full/ultra + 文言三档） |
| | `caveman-commit` | 极简 commit 信息生成（Conventional Commits） |
| | `caveman-compress` | 压缩记忆文件省 token |
| | `caveman-help` | caveman 模式速查 |
| | `caveman-review` | 极简代码审查 |
| **通用** | `grill-me` | 苏格拉底式需求拷问（决策树多轮问答） |
| **仓库运维** | `skill-sync` | 与 GitHub 的同步流程（本仓专属） |

### 共享层

- `_shared/dsh-market.mjs` — 轻量行情/页面抓取工具（node fetch/OpenSSL，规避 Windows schannel TLS 问题）
- `_shared/vault-batch.mjs` — Obsidian vault 批量整理（移动/重命名/孤立悬空检测，零依赖）
- `_shared/PORTABILITY.md` — 跨环境内容写作规范（占位符、解释器、命令写法）
- `tools/validate-repo.mjs` — 仓库合规门禁（路径/垃圾文件/frontmatter）

## MiMo Desktop 适配要点

原 DSH 技能依赖的插件工具面在 MiMo Desktop 不存在，适配规则如下（已写入各 SKILL.md）：

| DSH 依赖 | MiMo Desktop 替代 |
|----------|-------------------|
| `obsidian_*` 工具（dsh-obsidian 插件） | 内置 `read` / `write` / `edit` / `grep` / `glob` 文件工具；批量移动用 `vault-batch.mjs` |
| `xueqiu_*` 工具（dsh-xueqiu 插件） | 交叉源降级为「东财 + 新浪」双源（`dsh-market.mjs`） |
| `excel_describe` / `excel_filter` / `excel_pivot`（dsh-excel-kit） | `$MIMO_PYTHON` + pandas/openpyxl 探查（MIMO_PYTHON 已预装） |
| `browser_*` / `read_page` / `browser-skill`（DSH 浏览器插件） | `webfetch` 抓取优先；需登录态/CAPTCHA 时用内置 `playwright` 技能或请用户粘贴 |
| `web_search` | `webfetch`（或本会话可用的检索能力） |
| `timer_agent` / `notify`（dsh-timer-agent / dsh-notifier） | 无人值守调度：会话内手动触发；OS 级定时由用户自行配置（技能不再引用不存在的工具） |
| `~/.dsh/MEMORY.md` 的 Vault 路径 | 从本机记忆文件（MEMORY.md）读取 `{VAULT_PATH}`；无记录则询问用户 |
| 硬编码 Python312 全路径 | `$env:MIMO_PYTHON`（MiMo 内置，含 pandas/openpyxl；akshare 等额外依赖按需自装） |
| `~/.dsh/skills/...` | `~/.config/mimocode/skills/...`（即 `{SKILLS_ROOT}`） |
| DSH 插件（peak-cost / rss-digest / obsidian / xueqiu / excel-kit 等） | 不适用；相关段落已移除或改为「可选外部数据源」 |

**占位符约定**：

| 占位符 | 含义 | 取值 |
|--------|------|------|
| `{VAULT_PATH}` | Obsidian vault 根 | 本机 MEMORY.md「Obsidian Vault」行；两端/两机路径不同，不入库 |
| `{SKILLS_ROOT}` | 技能仓库根 | `~/.config/mimocode/skills` |
| `{MIMO_PYTHON}` | Python 解释器 | 环境变量 `$MIMO_PYTHON`（PowerShell：`$env:MIMO_PYTHON`） |

## 日常使用

技能在 MiMo Desktop 会话中按 frontmatter `description` 自动匹配触发，也可在对话中明确点名技能。Vault 路径 `{VAULT_PATH}` 执行时从本机记忆读取，未配置时向用户询问。

## 更新与维护

```powershell
cd "$HOME\.config\mimocode\skills"   # 或你的克隆位置
git pull origin main
```

修改技能后：

```powershell
git status --short
git add -A
git commit -m "feat(<skill-name>): 描述"
git push origin main
```

> **禁止**：向 `dsh-agent` 远程推送任何改动；force push；提交密钥/真实持仓/绝对用户路径/业务数据文件（`*.xlsx` / `*.csv`）。

## 注意事项

- **分支**：始终 `main`，禁止 force push
- **密钥**：API key 等不入本仓库，走环境变量（如 `$env:MIMO_PYTHON` 同级的用户环境变量）
- **Vault 路径**：一律 `{VAULT_PATH}` 占位符，绝不写入本仓库
- **数据产物**：复盘/早读/ASIN 分析等业务产物写入 vault，不入库
- 改动前先 `git pull --rebase origin main`，改完尽快推，避免双端冲突

## License

个人配置仓库，仅供参考。MIT。
