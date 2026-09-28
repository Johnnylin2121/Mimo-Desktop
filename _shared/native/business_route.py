"""Capability and permission routing for native business skills."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from native_contracts import is_safe_identifier

RFC3339_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")

REQUIRED_INPUTS = {
    "trading-briefing-fetch-native": {"market_snapshot", "news_snapshot"},
    "trading-briefing-review-native": {"early_read", "auto_brief", "memory_table"},
    "trading-policy-impact-native": {"policy_event"},
    "trading-stock-scan-native": {"stock_identity", "market_snapshot", "plans", "memory"},
    "amazon-listing-native": {"product_facts", "competitor_sources"},
    "amazon-ad-analysis-native": {"ad_manifest"},
    "amazon-product-selection-native": {"keyword_file"},
    "trading-value-investing-native": {"reference_root", "user_constraints"},
}

EXTERNAL_DEFAULT = {
    "trading-briefing-fetch-native": True,
    "trading-briefing-review-native": False,
    "trading-policy-impact-native": True,
    "trading-stock-scan-native": True,
    "amazon-listing-native": True,
    "amazon-ad-analysis-native": False,
    "amazon-product-selection-native": False,
    "trading-value-investing-native": False,
}

WRITE_MODES = {
    "trading-briefing-fetch-native": "draft_only",
    "trading-briefing-review-native": "user_confirmed_write",
    "trading-policy-impact-native": "proposal_only",
    "trading-stock-scan-native": "proposal_only",
    "amazon-listing-native": "draft_only",
    "amazon-ad-analysis-native": "draft_only",
    "amazon-product-selection-native": "draft_only",
    "trading-value-investing-native": "draft_only",
}

PERMISSIONS = {
    "read": "allow",
    "write_project": "deny",
    "write_vault": "ask",
    "move_vault": "deny",
    "publish": "deny",
    "external_action": "deny",
    "scheduler": "ask",
}


def _input_values_are_valid(inputs: dict[str, Any]) -> bool:
    for value in inputs.values():
        if isinstance(value, str) and value.strip():
            continue
        if isinstance(value, list) and value and all(isinstance(item, str) and item.strip() for item in value):
            continue
        return False
    return True


def validate_route_manifest(manifest: dict[str, Any]) -> None:
    allowed = {"manifest_version", "skill", "run_id", "as_of", "fetched_at", "inputs", "external_access", "write_mode", "human_gate"}
    unknown = sorted(set(manifest) - allowed)
    if unknown:
        raise ValueError(f"unknown manifest fields: {', '.join(unknown)}")
    if manifest.get("manifest_version") != "1.0":
        raise ValueError("manifest_version must be 1.0")
    skill = manifest.get("skill")
    if skill not in REQUIRED_INPUTS:
        raise ValueError(f"unsupported native skill: {skill}")
    if not is_safe_identifier(manifest.get("run_id")):
        raise ValueError("run_id must be a safe identifier")
    for field in ("as_of", "fetched_at"):
        if not isinstance(manifest.get(field), str) or not manifest[field].strip():
            raise ValueError(f"{field} is required")
        if RFC3339_PATTERN.fullmatch(manifest[field]) is None:
            raise ValueError(f"{field} must be an RFC3339 timestamp")
        try:
            parsed = datetime.fromisoformat(manifest[field].replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(f"{field} must be an RFC3339 timestamp") from exc
        if parsed.tzinfo is None:
            raise ValueError(f"{field} must include a timezone offset")
    inputs = manifest.get("inputs")
    if not isinstance(inputs, dict) or not inputs or not _input_values_are_valid(inputs):
        raise ValueError("inputs must contain non-empty string or string-list values")
    required = REQUIRED_INPUTS[skill]
    missing = sorted(required - inputs.keys())
    if missing:
        raise ValueError(f"missing inputs: {', '.join(missing)}")
    unexpected = sorted(inputs.keys() - required)
    if unexpected:
        raise ValueError(f"unexpected inputs: {', '.join(unexpected)}")
    if manifest.get("external_access") is not EXTERNAL_DEFAULT[skill]:
        raise ValueError(f"external_access must be {EXTERNAL_DEFAULT[skill]} for {skill}")
    if manifest.get("write_mode") != WRITE_MODES[skill]:
        raise ValueError(f"write_mode must be {WRITE_MODES[skill]}")
    if manifest.get("human_gate") != "required":
        raise ValueError("human_gate must be required for native draft routes")


def build_route(manifest: dict[str, Any]) -> dict[str, Any]:
    validate_route_manifest(manifest)
    skill = manifest["skill"]
    return {
        "schema_version": "1.0",
        "skill": skill,
        "run_id": manifest["run_id"],
        "as_of": manifest["as_of"],
        "fetched_at": manifest["fetched_at"],
        "mode": "native-route",
        "external_access": manifest["external_access"],
        "write_mode": manifest["write_mode"],
        "human_gate": manifest["human_gate"],
        "permissions": dict(PERMISSIONS),
        "required_inputs": sorted(REQUIRED_INPUTS[skill]),
        "degradation": {
            "missing_external": "manual input or local snapshot",
            "missing_browser": "user-provided text or structured file",
            "missing_data": "mark needs_review; never impute silently",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    route = build_route(manifest)
    text = json.dumps(route, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
