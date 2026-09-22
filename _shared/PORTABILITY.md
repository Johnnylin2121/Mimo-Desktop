# PORTABILITY — MiMo Desktop 跨环境内容规范

> 本仓库技能可在 Windows（及具备 pwsh/Node 的环境）下的 MiMo Desktop 中直接使用。
> 写作规范；仓库地图与安装见根 `README.md`。
> 合规由 `tools/validate-repo.mjs` 把关（本地手动跑，不依赖 DSH push-guard）。

---

## 1. 三条硬规则

| # | 规则 | 禁止 | 应该写成 |
|---|---|---|---|
| 1 | **不写死平台绝对路径** | `C:\Users\<用户>\...`、`/Users/<用户>/...`、云盘 vault 绝对路径 | `{VAULT_PATH}`、`{SKILLS_ROOT}`、`~/.config/mimocode/skills/...`、`$HOME/...`、`%USERPROFILE%`、`$env:USERPROFILE` |
| 2 | **不写死解释器/程序路径** | 只给一个机器的 `python.exe` 全路径 | `$env:MIMO_PYTHON`（PowerShell）/ `"${MIMO_PYTHON}"`，或写"先检测再执行" |
| 3 | **不推平台/环境产物** | 密钥、token、`*.xlsx/csv`、`__pycache__`、`.DS_Store`、>1 MB 二进制、机器专属配置 | 用可重建清单代替产物；业务数据进 vault |

> 规则 1/2/3 中的绝对路径、垃圾文件、密钥模式由 `validate-repo.mjs` 判为阻塞项（exit 1）。

## 2. 占位符表

| 占位符 | 含义 | 取值来源 |
|---|---|---|
| `{VAULT_PATH}` | Obsidian vault 根 | **本机记忆文件（MEMORY.md）的「Obsidian Vault」行**（路径不入库；无记录则询问用户） |
| `{SKILLS_ROOT}` | 技能仓库根 | `~/.config/mimocode/skills` |
| `{MIMO_PYTHON}` | Python 解释器 | 环境变量 `$MIMO_PYTHON`（MiMo 内置，含 pandas/openpyxl） |

## 3. 环境对照（写命令时对照）

| 场景 | MiMo Desktop（Windows 主推荐） | 备用（本机 python3） |
|---|---|---|
| Python 解释器 | `$PY = $env:MIMO_PYTHON` | `PY="$(command -v python3)"`（需自行 `pip install pandas openpyxl`；akshare 按技能需要另装） |
| 调用脚本 | `& $PY "$SKILL/scripts/x.py" args` | `"$PY" "$SKILL/scripts/x.py" args` |
| 当前时间 | `Get-Date -Format 'yyyy-MM-dd dddd'` | `date '+%Y-%m-%d %A'` |
| 环境变量（本会话） | `$env:FOO = "bar"` | `export FOO=bar` |
| 列目录/查找 | `Get-ChildItem` / `Select-String` | `ls` / `grep` |
| 网络抓取 | `webfetch` 工具；行情/接口优先 `dsh-market.mjs`（node fetch/OpenSSL，规避 schannel） | 同左 |
| 浏览器自动化 | ①`webfetch` ②Playwright MCP（`playwright-mcp:playwright`）③内置 `playwright` 技能 | 同左 |
| Excel 探查 | `_shared/excel-probe.py`（describe/columns/filter/pivot，`$MIMO_PYTHON`） | 同左（`python3`） |
| 表格探查 | `$PY` + pandas/openpyxl（无 excel-kit 插件） | 同左 |
| 路径分隔符 | `\` 或 `/`（pwsh 都吃） | `/` |
| 编码 / 换行 | UTF-8 无 BOM；仓库统一 **LF**（`.gitattributes`） | 同左 |

**命令块建议写法**：先平台中立变量初始化，再执行：

```powershell
# Windows / MiMo Desktop
$PY    = $env:MIMO_PYTHON
$SKILL = "$env:USERPROFILE\.config\mimocode\skills\<skill>"
& $PY "$SKILL/scripts/x.py" --input data.xlsx
```

## 4. 自动门禁

```bash
node tools/validate-repo.mjs   # 退出码 1 = 有阻塞项，别推
```

推送前人工确认：无密钥、无真实持仓/ASIN/绝对用户路径、无数据文件。本仓**不**安装 DSH 的 `push-guard` 全局钩子。

## 5. 提交前检查清单

1. `node tools/validate-repo.mjs` → 无阻塞项
2. `git status --short` → 只提交该提交的内容
3. 路径一律占位符；解释器一律 `$MIMO_PYTHON` 写法
4. frontmatter `name` 与目录名一致；`description` 非空
5. 新增/改动技能时同步 `locales/zh-CN.json` 与 `locales/en-US.json`
6. 不向 `dsh-agent` 远程推送
