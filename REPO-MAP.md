# REPO-MAP — Mimo-Desktop 仓库地图

> 生成：2026-09-22 · 维护方：**Windows 端 MiMo Desktop（本机）+ macOS 端 MiMo Desktop（笔记本）共同维护**
> 真源：`git@github.com:Johnnylin2121/Mimo-Desktop.git`（main）
> 源技能参考：`Johnnylin2121/dsh-agent`（**只读，禁止向其 push**）

---

## 0. 占位符约定

| 占位符 | 含义 | 各端取值 |
|---|---|---|
| `{VAULT_PATH}` | Obsidian vault 根 | 本机记忆文件 MEMORY.md 的「Obsidian Vault」行；**绝不入库** |
| `{SKILLS_ROOT}` | 技能仓库根 | `~/.config/mimocode/skills`（Windows: `%USERPROFILE%\.config\mimocode\skills`） |
| `{MIMO_PYTHON}` | Python 解释器 | 环境变量 `$MIMO_PYTHON` / `$env:MIMO_PYTHON`（MiMo 内置）；macOS 备用 `python3` |

---

## 1. 架构总览

```
Mimo-Desktop/                     ← 克隆到 {SKILLS_ROOT}
├── README.md                     ← 安装/技能清单/DSH→MiMo 替代矩阵
├── REPO-MAP.md                   ← 本文件
├── LICENSE / .gitattributes / .gitignore
├── _shared/                      ← 跨技能共享（非 skill）
│   ├── PORTABILITY.md            ← 双端写作规范
│   ├── dsh-market.mjs            ← 行情/页面抓取（node fetch，绕 schannel）
│   └── vault-batch.mjs           ← Obsidian 批量移动/结构体检
├── tools/
│   └── validate-repo.mjs         ← 推送前门禁（frontmatter/密钥/绝对路径/垃圾文件）
├── trading-*/  (8)               ← A股复盘体系
├── amazon-*/   (3)               ← 亚马逊运营
├── obsidian-*/ (2) + domain-memory (1)
├── caveman*/   (5) + grill-me (1)
└── skill-sync/                   ← 本仓同步流程（唯一真源规则）
```

每个技能目录 = 稳定 ID = frontmatter `name`：

```
<skill-id>/
├── SKILL.md          ← 必需；YAML frontmatter name+description
├── locales/
│   ├── zh-CN.json    ← Plugins 页 displayName + brief
│   └── en-US.json
└── references/ | scripts/ | config/ | chapters/   ← 可选附件
```

---

## 2. 技能清单（22）

| 类别 | ID | 一句话 |
|---|---|---|
| 交易 | trading-daily-review | 盘前→盘中→盘后全流程 |
| | trading-contradiction-check | 近3日矛盾检测（五维） |
| | trading-policy-impact | 政策影响链路 |
| | trading-stock-scan | 个股深度扫描 |
| | trading-value-investing | Mr. Dang 功法 + ch01–14 |
| | trading-briefing-fetch | 早报数据草稿（akshare） |
| | trading-briefing-review | 早读四态复核 |
| | trading-memory-consolidate | 八区记忆总表 |
| Amazon | amazon-ad-analysis | 8-Phase 广告分析 + 校验器 |
| | amazon-listing | 2026-07 Listing 六步 |
| | amazon-product-selection | ABA/卖家精灵选品 |
| 知识库 | obsidian-vault-sync | 文件→wiki 同步 |
| | obsidian-reconcile | vault 矛盾调和 |
| | domain-memory | 领域记忆读写 |
| 效率 | caveman (+commit/compress/help/review) | 极简输出族 |
| 通用 | grill-me | 苏格拉底拷问 |
| 运维 | skill-sync | 本仓 git 同步 |

---

## 3. 放置规则（什么内容放哪里）

| 内容 | 位置 | 入库？ |
|---|---|---|
| 技能定义与附件 | `<skill-id>/` | ✅ |
| 跨技能脚本/规范 | `_shared/` | ✅ |
| 体检脚本 | `tools/validate-repo.mjs` | ✅ |
| 双端协议/地图 | `README.md`、`REPO-MAP.md`、`_shared/PORTABILITY.md` | ✅ |
| Vault 业务产物（复盘/早读/ASIN 报告…） | `{VAULT_PATH}` | ❌ |
| 本机记忆/密钥/凭据 | 各机 MEMORY.md / settings | ❌ |
| 数据文件 `*.xlsx/csv` | vault 或工作区 | ❌ 不入库 |
| dsh-agent 历史/DSH 插件 | **不进本仓** | ❌ |

---

## 4. 双端维护协议（Windows ⇄ macOS）

### 同步模型

| 通道 | 载体 | 范围 |
|---|---|---|
| A. 技能与配置 | **本 git 仓（真源）** | skills、共享脚本、文档 |
| B. 知识/业务产物 | Obsidian vault（OneDrive） | 复盘、早读、ASIN 分析等 |
| C. 机器本地状态 | 各机 MEMORY.md 等 | **不同步**；换机重建 |

### 推送协议（两端一致）

```
改 → git status → 只 add 需要内容 → commit（type(scope): 摘要）
   → node tools/validate-repo.mjs        # 阻塞项必须清零
   → 脱敏自查（见 §5）→ git pull --rebase origin main → git push origin main
```

### 内容写作硬规则（写技能时）

1. **路径**：一律 `{VAULT_PATH}` / `{SKILLS_ROOT}` / `~/.config/...`；禁止写入带用户名的用户主目录绝对路径（Windows/macOS 均如此）
2. **命令块**：Windows 与 macOS **成对给出**（Get-Date↔date、Move-Item↔mv、Select-String↔grep、$env:MIMO_PYTHON↔python3）
3. **解释器**：优先 `$MIMO_PYTHON`；勿写死单机 Python 全路径（config 中 python_windows 仅兜底）
4. **换行**：文本文件 **LF**（`.gitattributes: text=auto eol=lf`）；新文件写完后检查
5. **工具面**：只引用 MiMo 实际存在的能力（文件工具、webfetch、playwright 技能、$MIMO_PYTHON）；DSH 插件工具只可出现在「不存在/勿调用」警示中
6. **Vault 批量写**：OneDrive 可能锁文件——分批写、先 dry-run（vault-batch）

### 冲突规则

- 改前 `git pull --rebase`；小步提交；冲突以 main + 业务事实为准
- **禁止 force push**；禁止向 dsh-agent 推送
- 长任务（批量复盘/分析）一端做完再同步

### 换机接入清单（macOS）

1. `git clone git@github.com:Johnnylin2121/Mimo-Desktop.git ~/.config/mimocode/skills`（目录须空或用 copy 方式）
2. 确认 `MIMO_PYTHON` / `python3` + pandas/openpyxl；akshare 按需
3. 本机 MEMORY.md 重建 Vault 路径与 shell 等（勿拷 Windows 的）
4. `git config core.autocrlf false`；`core.precomposeunicode true`
5. 新开会话验证技能出现在 Plugins 列表（locales 生效）

---

## 5. 脱敏规范（推送前必查）

| 禁止入库 | 替换为 |
|---|---|
| 真实持仓价+动作、满仓/成本数字 | `XXXXXX X.XXX 入场`、`某ETF` |
| 真实用户绝对路径 | `{VAULT_PATH}`、`~/.config/mimocode/...` |
| API key / token / 私钥（任何形式） | 环境变量名 |
| 真实 ASIN | `B0########` |
| 个人手机号/邮箱/身份证 | 占位 |
| 业务数据文件 | 移入 vault，不入库 |

扫描：`node tools/validate-repo.mjs`（阻塞）+ 人工 grep 密钥模式。`Johnnylin2121` 仅出现在**本仓/对照仓的 GitHub URL** 中，属公开仓库名，允许。

---

## 6. 推送链路

```
任一端改动 → {SKILLS_ROOT}（= 本仓 clone）
           → validate-repo.mjs → 脱敏自查 → pull --rebase → push origin main
           → 对端 pull --rebase
```

标准命令：

```powershell
# Windows
cd "$env:USERPROFILE\.config\mimocode\skills"
git status --short
git add -A; git commit -m "type(scope): 摘要"
node tools/validate-repo.mjs
git pull --rebase origin main
git push origin main
```

```bash
# macOS
cd ~/.config/mimocode/skills
git status --short
git add -A && git commit -m "type(scope): 摘要"
node tools/validate-repo.mjs
git pull --rebase origin main
git push origin main
```

---

## 7. 维护注意（长期）

1. **真源唯一**：内容只在 Mimo-Desktop 维护；dsh-agent 只读参考，不双写
2. **技能 ID 稳定**：目录名 = frontmatter name = locales 所在目录；改名需同步三处
3. **locales 必配**：新增技能必须同时有 zh-CN.json + en-US.json（仅 displayName + brief，勿写 description）
4. **frontmatter 勿破**：name 仅字母数字连字符；description 非空——坏了桌面会静默跳过
5. **双端命令**：新增含 shell 的技能时，Windows/macOS 两套写法都要给
6. **CRLF**：新生成 JSON/MD 后若 validate 报 CRLF，跑 LF 规范化再提交
7. **隐私**：每次 push 前跑 validate + 快速扫密钥/路径/持仓
8. **DSH 警示句保留**：技能里「X 工具在 MiMo 不存在」是有意防误调用，勿当垃圾删掉
9. **共享脚本变更**：改 `_shared/*.mjs` 影响多个技能——两端都要冒烟测相关命令
10. **不要**把 vault 内容、机器 MEMORY、插件运行时塞进本仓

---

## 8. 变更记录

- **2026-09-22 首版**：自 dsh-agent 适配 21 技能 + skill-sync 重写；locales 齐套；README/PORTABILITY
- **2026-09-22 审计升级**：全仓 LF 规范化；双端命令成对化（时间/移动/解释器）；analysis.py Vault 解析去硬编码 .dsh；caveman-compress README 去 DSH 残留；本 REPO-MAP 落地
