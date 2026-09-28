"""Deterministic input quality checks for Listing and product-selection routes."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

import pandas as pd

sys.path.insert(0, str(Path(__file__).parents[1]))
from native_contracts import is_safe_identifier, validate_artifact, validate_evidence

REQUIRED_FILES = {
    "listing": {"product_facts", "competitor_sources"},
    "product-selection": {"keyword_file"},
}

LISTING_TEXT_SUFFIXES = {".md", ".txt"}
PRODUCT_FACT_PATTERN = re.compile(r"(?im)^\s*[-*]\s*(?:user[- ]confirmed|confirmed|用户已确认|已确认)\s*[^:\n：]{1,80}[:：]\s*\S.*$")
COMPETITOR_ASIN_PATTERN = re.compile(r"(?im)^\s*[-*]?\s*ASIN\s*[:：]\s*([A-Za-z0-9]{8,14})\s*$")
COMPETITOR_TITLE_PATTERN = re.compile(r"(?im)^\s*[-*]\s*Title\s*[:：]\s*\S.*$")
TREND_LABELS = {"up", "down", "stable", "flat", "rising", "falling", "new"}
COMPETITION_LABELS = {"low", "medium", "high"}
INVALID_ASIN_VALUES = {"unknown", "na", "n/a", "none", "null", "-", "placeholder"}


def valid_asin_token(value: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9]{8,14}", value)) and value.lower() not in INVALID_ASIN_VALUES


def valid_number_or_label(series: pd.Series, labels: set[str], lower: float | None = None, upper: float | None = None) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    numeric_valid = numeric.map(lambda value: bool(pd.notna(value) and math.isfinite(float(value))))
    if lower is not None:
        numeric_valid &= numeric >= lower
    if upper is not None:
        numeric_valid &= numeric <= upper
    label_valid = series.astype(str).str.strip().str.lower().isin(labels)
    return numeric_valid | label_valid


def safe_resolve(base: Path, value: str) -> Path:
    candidate = Path(value)
    if candidate.is_absolute():
        raise ValueError(f"absolute paths are not allowed: {value}")
    resolved = (base / candidate).resolve()
    try:
        resolved.relative_to(base.resolve())
    except ValueError as exc:
        raise ValueError(f"path escapes manifest directory: {value}") from exc
    return resolved


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def inspect_file(path: Path, role: str) -> dict[str, Any]:
    if not path.exists() or not path.is_file():
        raise ValueError(f"file not found: {role}")
    if path.stat().st_size == 0:
        raise ValueError(f"file is empty: {role}")
    if role in {"product_facts", "competitor_sources"}:
        if path.suffix.lower() not in LISTING_TEXT_SUFFIXES:
            raise ValueError(f"{role} must be .md or .txt: {path.suffix}")
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError(f"{role} must be UTF-8 text") from exc
        if role == "product_facts":
            confirmed = PRODUCT_FACT_PATTERN.findall(text)
            if not confirmed:
                raise ValueError("product_facts has no user-confirmed fact")
            return {"bytes": path.stat().st_size, "confirmed_facts": len(confirmed)}
        asins = COMPETITOR_ASIN_PATTERN.findall(text)
        titles = COMPETITOR_TITLE_PATTERN.findall(text)
        if not asins or not titles or not all(valid_asin_token(asin) for asin in asins):
            raise ValueError("competitor_sources needs at least one valid ASIN and title")
        return {"bytes": path.stat().st_size, "competitor_records": len(asins), "title_records": len(titles)}
    if role == "keyword_file":
        if path.suffix.lower() not in {".csv", ".xlsx", ".xls"}:
            raise ValueError(f"keyword_file must be .csv/.xlsx/.xls: {path.suffix}")
        frame = pd.read_csv(path) if path.suffix.lower() == ".csv" else pd.read_excel(path)
        if frame.empty:
            raise ValueError("keyword file has no rows")
        normalized = {str(column).strip().lower(): column for column in frame.columns}
        required_keyword_columns = {"keyword", "search_volume", "trend", "competition"}
        missing_keyword_columns = sorted(required_keyword_columns - normalized.keys())
        if missing_keyword_columns:
            raise ValueError(f"keyword file missing columns: {', '.join(missing_keyword_columns)}")
        keyword = frame[normalized["keyword"]]
        if keyword.isna().any() or keyword.astype(str).str.strip().eq("").any():
            raise ValueError("keyword contains empty values")
        search_volume = pd.to_numeric(frame[normalized["search_volume"]], errors="coerce")
        if search_volume.isna().any() or (~search_volume.map(lambda value: math.isfinite(float(value)))).any() or (search_volume < 0).any():
            raise ValueError("search_volume must contain finite non-negative numbers")
        if not valid_number_or_label(frame[normalized["trend"]], TREND_LABELS).all():
            raise ValueError("trend contains invalid values")
        if not valid_number_or_label(frame[normalized["competition"]], COMPETITION_LABELS, lower=0, upper=1).all():
            raise ValueError("competition must be 0..1 or low/medium/high")
        return {"rows": len(frame), "columns": list(frame.columns), "valid_rows": len(frame)}
    raise ValueError(f"unsupported input role: {role}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--mode", required=True, choices=sorted(REQUIRED_FILES))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    base = manifest_path.parent
    files = manifest.get("files", {})
    issues: list[str] = []
    required_manifest_keys = {"manifest_version", "run_id", "as_of", "fetched_at", "files"}
    if manifest.get("manifest_version") != "1.0":
        issues.append("manifest_version must be 1.0")
    if required_manifest_keys - set(manifest):
        issues.append("manifest is missing required keys")
    if set(manifest) - required_manifest_keys:
        issues.append("manifest has unknown keys")
    allowed_file_keys = {"product_facts", "competitor_sources", "keyword_file"}
    if not isinstance(files, dict):
        issues.append("files must be an object")
        files = {}
    if set(files) - allowed_file_keys:
        issues.append("files has unknown keys")
    run_id = manifest.get("run_id")
    safe_run_id = run_id if is_safe_identifier(run_id) else "invalid-run"
    if run_id != safe_run_id:
        issues.append("run_id must be a safe identifier")
    evidence: list[dict[str, Any]] = []
    for role in sorted(REQUIRED_FILES[args.mode]):
        value = files.get(role)
        if not isinstance(value, str) or not value:
            issues.append(f"missing input: {role}")
            continue
        try:
            path = safe_resolve(base, value)
            details = inspect_file(path, role)
        except Exception as exc:
            issues.append(f"{role}: {exc}")
            continue
        relative = path.relative_to(base).as_posix()
        item = {
            "evidence_id": f"{safe_run_id}:{role}",
            "source": relative,
            "locator": {"file": relative},
            "as_of": manifest["as_of"],
            "fetched_at": manifest["fetched_at"],
            "raw_value": {**details, "sha256": digest(path)},
            "transformation": "read and validated input without business aggregation",
            "confidence": 1.0,
            "data_level": "A",
        }
        validate_evidence(item)
        evidence.append(item)
    status = "passed" if not issues else "failed"
    artifact = {
        "schema_version": "1.0",
        "artifact_id": f"{safe_run_id}:input-quality",
        "kind": f"{args.mode}-input-quality",
        "status": "draft" if status == "passed" else "blocked",
        "generator": "shared/input_quality.py",
        "evidence_ids": [item["evidence_id"] for item in evidence] or [f"{safe_run_id}:manifest"],
        "validation": {"status": status, "checks": ["path-boundary", "required-inputs", "non-empty", "schema"]},
        "human_gate": "not_required" if status == "passed" else "required",
    }
    if not evidence:
        manifest_evidence = {
            "evidence_id": f"{safe_run_id}:manifest",
            "source": manifest_path.name,
            "locator": {"file": manifest_path.name},
            "raw_value": {"manifest": manifest_path.name},
            "as_of": manifest["as_of"],
            "fetched_at": manifest["fetched_at"],
            "transformation": "manifest read without usable input files",
            "confidence": 1.0,
            "data_level": "unknown",
        }
        validate_evidence(manifest_evidence)
        evidence.append(manifest_evidence)
    validate_artifact(artifact)
    result = {"schema_version": "1.0", "run_id": safe_run_id, "data_level": "A" if status == "passed" else "C", "quality": artifact, "evidence": evidence, "issues": issues}
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    return 0 if status == "passed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
