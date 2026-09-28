#!/usr/bin/env python3
"""Validate a MiMo session-handoff Markdown file."""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path

REQUIRED_META = ("topic", "writer", "written_at", "receiver", "domain")
CORE_SECTIONS = ("原始目标", "完成进度", "当前位置", "续接入口")
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
PLACEHOLDER = re.compile(r"<[^>\n]+>|<!--")


def parse_frontmatter(text: str, errors: list[str]) -> tuple[dict[str, str], str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        errors.append("文件必须以 YAML frontmatter 开头")
        return {}, ""
    try:
        end = lines.index("---", 1)
    except ValueError:
        errors.append("frontmatter 缺少结束分隔符 ---")
        return {}, ""
    meta: dict[str, str] = {}
    for line in lines[1:end]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            errors.append(f"frontmatter 不是 key: value 格式: {line}")
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key in meta:
            errors.append(f"frontmatter 字段重复: {key}")
        meta[key] = value
    return meta, "\n".join(lines[end + 1 :])


def section_body(body: str, title: str) -> str | None:
    pattern = re.compile(rf"^##\s+.*{re.escape(title)}.*$", re.MULTILINE)
    match = pattern.search(body)
    if not match:
        return None
    tail = body[match.end() :]
    next_heading = re.search(r"^##\s+", tail, re.MULTILINE)
    return (tail[: next_heading.start()] if next_heading else tail).strip()


def validate(path: Path) -> list[str]:
    errors: list[str] = []
    if not path.is_file():
        return [f"文件不存在: {path}"]
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return ["文件必须为 UTF-8"]

    meta, body = parse_frontmatter(text, errors)
    for key in REQUIRED_META:
        if not meta.get(key):
            errors.append(f"frontmatter 缺少或为空: {key}")
    if meta.get("writer") and not IDENTIFIER.fullmatch(meta["writer"]):
        errors.append("writer 必须是稳定 Agent ID，如 MiMo/OpenCode/DSH")
    written_at = meta.get("written_at", "")
    if written_at:
        try:
            parsed = datetime.fromisoformat(written_at.replace("Z", "+00:00"))
        except ValueError:
            errors.append("written_at 必须是 ISO 8601 时间")
        else:
            if parsed.tzinfo is None:
                errors.append("written_at 必须包含时区")

    headings = re.findall(r"^##\s+(.+)$", body, re.MULTILINE)
    for section in CORE_SECTIONS:
        if not any(section in heading for heading in headings):
            errors.append(f"缺少核心章节: {section}")
    current = section_body(body, "当前位置")
    if current == "":
        errors.append("当前位置不能为空")
    if PLACEHOLDER.search(body):
        errors.append("正文仍含占位符或 HTML 注释，交付前必须清理")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a session-handoff Markdown file")
    parser.add_argument("file", type=Path)
    args = parser.parse_args()
    errors = validate(args.file)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print("FAIL: 交接文件未通过验证", file=sys.stderr)
        return 1
    print(f"PASS: {args.file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
