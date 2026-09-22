---
name: find-skills
description: >
  在开放技能生态中搜索与安装可扩展能力的技能。触发词：找 skill、有没有技能能、find a skill、
  how do I do X（X 可能已有现成 skill）、帮我搜技能、skills.sh、扩展能力。
  Use when the user wants to discover installable agent skills or extend capabilities via the open skills ecosystem.
---

# Find Skills — 技能发现与安装（MiMo Desktop 适配）

基于 [vercel-labs/skills](https://github.com/vercel-labs/skills) 的 find-skills，Windows 兼容改法来自 [KimYx0207/findskill](https://github.com/KimYx0207/findskill)。已按 **MiMo Desktop** 技能根与双端命令改写。

## 触发

- 「找一个 X 的 skill」「有没有技能能……」「how do I do X」「帮我搜技能」「skills.sh」

## 前置

- 需要 **Node.js**（`npx`）。本机 shell：Windows 为 PowerShell；macOS 为 bash/zsh。
- **搜索关键字仅英文**（中文先对照下表翻译）。

## 命令（双端）

**Windows / MiMo Desktop（PowerShell 会话内可直接跑；若 npx 无输出再包一层）：**

```powershell
npx skills find '[query]'
npx skills list -g
npx skills check
npx skills update
# 安装到 MiMo 见下方「装进 MiMo」——不要只依赖 -g 到 Claude 路径
```

若直跑无输出：

```powershell
powershell -NoProfile -Command "npx skills find '[query]'"
```

**macOS：**

```bash
npx skills find '[query]'
npx skills list -g
```

浏览目录: https://skills.sh/

## 工作流

1. **理解需求** — 领域 + 具体任务（如 react performance / pr review / changelog）
2. **搜索** — `npx skills find '<english query>'`（见上双端写法）
3. **展示结果** — 名称、简介、skills.sh 链接、安装命令
4. **确认后安装**

### 装进 MiMo（重要）

`npx skills add -g` 默认可能写到 Claude 兼容根（如 `~/.agents/skills`），**MiMo 只读扫描 brand 根、写权威在 MiMoCode 根**。推荐流程：

1. 搜索到目标后，向用户展示并确认
2. 安装时**优先装入 MiMo 技能根**：

```powershell
# Windows — 先下载再落到 MiMo 根（示例：按 skills CLI 实际输出调整）
$DEST = "$env:USERPROFILE\.config\mimocode\skills\<skill-id>"
# 若 CLI 支持 --path / 目标目录则用之；否则 add 后从源路径 Copy-Item 到 $DEST
# 保证最终存在: $DEST\SKILL.md 且 frontmatter name = 目录名
```

```bash
# macOS
DEST="$HOME/.config/mimocode/skills/<skill-id>"
# 同上：确保 SKILL.md 落在 DEST，name 与目录名一致
```

3. **同时**在 `locales/zh-CN.json`、`locales/en-US.json` 写入 `displayName` + 一行 `brief`（Plugins 页展示）
4. 新开会话后技能自动发现；无需注册步骤

也可：`npx skills add <owner/repo@skill> -g -y` 试装 → 找到落地目录 → **整目录复制**到 `{SKILLS_ROOT}/<id>/` → 核对 frontmatter。

## 常用查询类别

| 类别 | 英文 query 示例 |
|------|-----------------|
| Web | react, nextjs, typescript, tailwind |
| 测试 | testing, playwright, e2e |
| DevOps | deploy, docker, ci-cd |
| 文档 | changelog, api-docs |
| 代码质量 | code review, refactor |
| 设计 | ui, ux, design-system |
| 数据 | data analysis, pandas |

## 中英关键词对照（搜索只认英文）

| 中文 | English |
|------|---------|
| 数据分析 | data analysis |
| 做PPT | ppt, presentation |
| 写文章 | writing |
| 代码审查 | code review |
| 部署 | deploy |
| 写测试 | testing |
| 做视频 | video, remotion |

## 无结果时

1. 说明未找到
2. 用通用能力直接帮做
3. 可建议 `npx skills init` 自建（写入 MiMo 根并配 locales）

## 禁止

- 不向 `dsh-agent` 仓库写入本技能
- 不把未确认的 skill 直接塞进 vault / 业务目录
- 安装前向用户复述将写入的路径

## 出处

- Original: https://github.com/vercel-labs/skills  
- Windows fix: https://github.com/KimYx0207/findskill  
- MiMo 适配: Johnnylin2121/Mimo-Desktop
