#!/usr/bin/env python3
"""cost-meter — 读取 MiMo Desktop 本地账本 mimocode.db，汇总会话/今日费用与 token。

用法（解释器 $MIMO_PYTHON 或 python3，仅标准库）:
  cost-meter.py today
  cost-meter.py session [session_id]
  cost-meter.py week
  cost-meter.py models [days]
  cost-meter.py raw [limit]

数据源: %LOCALAPPDATA%/mimocode/mimocode.db 的 message.data JSON（含 cost / tokens）。
本机账本，不联网；金额为 MiMo 已计算的 cost 字段（provider 口径可能为估算）。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def db_path() -> Path:
    env = os.environ.get("MIMO_DB")
    if env:
        return Path(env)
    local = os.environ.get("LOCALAPPDATA") or os.environ.get("XDG_DATA_HOME")
    if local:
        p = Path(local) / "mimocode" / "mimocode.db"
        if p.exists():
            return p
    # macOS / fallback
    for c in (
        Path.home() / "Library" / "Application Support" / "mimocode" / "mimocode.db",
        Path.home() / ".local" / "share" / "mimocode" / "mimocode.db",
    ):
        if c.exists():
            return c
    raise SystemExit("mimocode.db not found; set MIMO_DB=<path>")


def connect():
    import sqlite3

    p = db_path()
    # read-only URI to avoid locking the live app
    uri = f"file:{p.as_posix()}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def parse_msg(data: str | bytes) -> dict | None:
    if isinstance(data, bytes):
        data = data.decode("utf-8", "replace")
    try:
        obj = json.loads(data)
    except Exception:
        return None
    if not isinstance(obj, dict):
        return None
    cost = obj.get("cost")
    tokens = obj.get("tokens") or {}
    if cost is None and not tokens:
        return None
    try:
        cost_f = float(cost or 0)
    except Exception:
        cost_f = 0.0
    return {
        "cost": cost_f,
        "input": int(tokens.get("input") or 0),
        "output": int(tokens.get("output") or 0),
        "cache_write": int((tokens.get("cache") or {}).get("write") or 0),
        "cache_read": int((tokens.get("cache") or {}).get("read") or 0),
        "total": int(tokens.get("total") or 0),
        "model": obj.get("model") or obj.get("modelID") or "",
        "session_id": obj.get("sessionID") or obj.get("sessionId") or "",
    }


def iter_msgs(conn, since_ts: int | None = None, limit: int | None = None):
    q = "SELECT session_id, time_created, data FROM message"
    args: list = []
    if since_ts is not None:
        q += " WHERE time_created >= ?"
        args.append(since_ts)
    q += " ORDER BY time_created DESC"
    if limit:
        q += " LIMIT ?"
        args.append(limit)
    for sid, ts, data in conn.execute(q, args):
        m = parse_msg(data)
        if not m:
            continue
        m["session_id"] = m["session_id"] or sid
        m["ts"] = ts
        yield m


def start_of_day_utc() -> int:
    now = datetime.now(timezone.utc)
    # approximate: local midnight as UTC offset
    local = datetime.now().astimezone()
    mid = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return int(mid.timestamp() * 1000)


def start_of_days_ago(days: int) -> int:
    local = datetime.now().astimezone()
    mid = (local - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
    return int(mid.timestamp() * 1000)


def agg(msgs) -> dict:
    cost = 0.0
    n = 0
    tin = tout = tcw = tcr = ttot = 0
    models: dict[str, dict] = {}
    for m in msgs:
        n += 1
        cost += m["cost"]
        tin += m["input"]
        tout += m["output"]
        tcw += m["cache_write"]
        tcr += m["cache_read"]
        ttot += m["total"]
        key = m["model"] or "unknown"
        e = models.setdefault(key, {"cost": 0.0, "n": 0, "total": 0})
        e["cost"] += m["cost"]
        e["n"] += 1
        e["total"] += m["total"]
    return {
        "messages": n,
        "cost": round(cost, 8),
        "tokens": {
            "input": tin,
            "output": tout,
            "cache_write": tcw,
            "cache_read": tcr,
            "total": ttot,
        },
        "models": models,
    }


def fmt(report: dict, title: str) -> None:
    t = report["tokens"]
    print(f"## {title}")
    print(f"- 消息数: {report['messages']}")
    print(f"- 费用(cost合计): **${report['cost']:.6f}**")
    print(
        f"- tokens: total={t['total']}  in={t['input']}  out={t['output']}  "
        f"cacheW={t['cache_write']}  cacheR={t['cache_read']}"
    )
    if report.get("models"):
        print("- 按模型:")
        for k, v in sorted(report["models"].items(), key=lambda x: -x[1]["cost"]):
            print(f"  - {k}: ${v['cost']:.6f} ({v['n']} msgs, {v['total']} tok)")


def fmt_card(report: dict, title: str) -> None:
    """Markdown 卡片风,便于直接贴进会话。"""
    t = report["tokens"]
    print(f"### 💰 {title}")
    print()
    print(f"**今日/区间费用 ${report['cost']:.4f}** · {report['messages']} 条消息")
    print()
    print("| 模型 | 费用 | 消息 | tokens |")
    print("|------|------|------|--------|")
    models = report.get("models") or {}
    if not models:
        print("| — | $0.0000 | 0 | 0 |")
    for k, v in sorted(models.items(), key=lambda x: -x[1]["cost"]):
        print(f"| `{k}` | ${v['cost']:.4f} | {v['n']} | {v['total']:,} |")
    print()
    print(
        f"<sub>tokens: in {t['input']:,} · out {t['output']:,} · "
        f"cacheR {t['cache_read']:,} · total {t['total']:,}</sub>"
    )
    print("<sub>口径: mimocode.db 本地账本 cost 字段,只读</sub>")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="MiMo cost meter (reads local mimocode.db)")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("today", help="local today cost/tokens")
    sub.add_parser("card", help="markdown card: today cost by model")
    s = sub.add_parser("session", help="one session (default: current-ish latest)")
    s.add_argument("session_id", nargs="?")
    w = sub.add_parser("week", help="last 7 days")
    m = sub.add_parser("models", help="by model, last N days")
    m.add_argument("days", nargs="?", type=int, default=7)
    r = sub.add_parser("raw", help="last N message rows")
    r.add_argument("limit", nargs="?", type=int, default=5)

    args = p.parse_args(argv)
    conn = connect()
    try:
        if args.cmd == "today":
            msgs = list(iter_msgs(conn, since_ts=start_of_day_utc()))
            fmt(agg(msgs), "今日费用（本机时区 0 点起，UTC 存储时间近似）")
        elif args.cmd == "card":
            msgs = list(iter_msgs(conn, since_ts=start_of_day_utc()))
            fmt_card(agg(msgs), "今日费用")
        elif args.cmd == "session":
            if args.session_id:
                msgs = [
                    m
                    for m in iter_msgs(conn)
                    if m["session_id"] == args.session_id
                ]
                fmt(agg(msgs), f"会话 {args.session_id}")
            else:
                msgs = list(iter_msgs(conn, limit=1))
                if not msgs:
                    print("no messages")
                    return 1
                sid = msgs[0]["session_id"]
                all_s = [m for m in iter_msgs(conn) if m["session_id"] == sid]
                fmt(agg(all_s), f"最近活动会话 {sid}")
        elif args.cmd == "week":
            msgs = list(iter_msgs(conn, since_ts=start_of_days_ago(7)))
            fmt(agg(msgs), "近 7 日")
        elif args.cmd == "models":
            msgs = list(iter_msgs(conn, since_ts=start_of_days_ago(args.days)))
            rep = agg(msgs)
            print(f"## 按模型（近 {args.days} 日）")
            for k, v in sorted(rep["models"].items(), key=lambda x: -x[1]["cost"]):
                print(f"- {k}: ${v['cost']:.6f} ({v['n']} msgs, {v['total']} tok)")
            print(f"- 合计: ${rep['cost']:.6f}")
        elif args.cmd == "raw":
            for m in iter_msgs(conn, limit=args.limit):
                print(json.dumps(m, ensure_ascii=False))
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
