---
name: skill-sync
description: >
  管理本地 MiMo Desktop 技能仓库与 GitHub Mimo-Desktop 远程的同步。
  所有平台共用 main 分支。禁止向 dsh-agent 远程推送。
  当用户说"同步 skill"、"推送到 GitHub"、"skill 更新了吗"、"检查 skill 版本"、
  "skill-sync"时使用。
---

# Skill Sync（Mimo-Desktop）

管理本地技能目录（`~/.config/mimocode/skills` 或用户克隆位置）与 `Johnnylin2121/Mimo-Desktop` 的同步。

## 仓库注册表

| 仓库 | 远程 | 用途 |
|------|------|------|
| **Mimo-Desktop（唯一真源）** | `git@github.com:Johnnylin2121/Mimo-Desktop.git`（SSH） | 本仓：MiMo Desktop 适配技能 |
| dsh-agent | `git@github.com:Johnnylin2121/dsh-agent.git` | **只读历史参考，禁止向其 push** |

**规则**：默认只操作本仓（Mimo-Desktop）；跨仓操作前先向用户确认；**绝不 force push**。

## 流程

### Step 0：确认分支与仓库

```bash
cd <repoDir>
git branch --show-current   # 必须 main
git remote -v               # 必须指向 Mimo-Desktop
```

### Step 1：检测差异

```bash
git status
git log origin/main..HEAD --oneline
git log HEAD..origin/main --oneline
```

向用户报告：未提交更改、本地领先数、远程领先数。

### Step 2：处理分歧

远程领先时先 `git pull --rebase origin main`；冲突则列出文件请用户解决。

### Step 3：提交

自动生成 `type(scope): 摘要` 风格提交信息（新技能 `feat: add <skill>`，更新 `feat: update <skill> - <简述>`）。

### Step 4：推送前检查

```bash
node tools/validate-repo.mjs   # 退出码 1 = 有阻塞项，禁止推
```

阻塞项清零后再推。推送前人工确认：无密钥、无真实持仓/ASIN/绝对用户路径、无 `*.xlsx`/`*.csv` 数据文件。

### Step 5：推送

```bash
git push origin main
```

若被拒绝：`git pull --rebase origin main` 后重推。**禁止 `--force`、禁止 `--no-verify` 绕过、禁止推 dsh-agent。**

### Step 6：确认

`git status` + `git log --oneline -3`，向用户报告结果。

## 选择性同步

- "同步 amazon-listing" → 只 `git add` 该目录，提交信息带技能名，同样过 Step 4 校验。

## 禁止的操作

- ❌ `git push --force`
- ❌ 向 `dsh-agent` 推送
- ❌ 跳过 `validate-repo.mjs`
- ❌ 提交 `__pycache__`、`.DS_Store`、`Thumbs.db`、`*.xlsx`、`*.csv` 等
- ❌ 技能运行时自动提交推送（每步等用户确认）
