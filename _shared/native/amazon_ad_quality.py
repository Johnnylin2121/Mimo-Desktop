"""Deterministic first-pass validation for Amazon ad analysis inputs."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

import pandas as pd

sys.path.insert(0, str(Path(__file__).parents[1]))
from native_contracts import is_safe_identifier, validate_artifact, validate_evidence

REQUIRED_COLUMNS = {
    "product_performance": {"date", "asin", "sessions", "orders", "sales", "ad_spend", "ad_sales", "natural_orders"},
    "ad_performance": {"date", "asin", "campaign", "spend", "sales", "orders"},
    "search_terms": {"date", "search_term", "spend", "sales", "orders"},
    "brand_attribution": set(),
    "listing_overlay": set(),
}
CORE = ("product_performance", "ad_performance", "search_terms")
ASIN_PATTERN = re.compile(r"^[A-Za-z0-9]{8,14}$")
INVALID_ASIN_VALUES = {"unknown", "na", "n/a", "none", "null", "-", "placeholder"}


def valid_asin(value: object) -> bool:
    if not isinstance(value, str):
        return False
    normalized = value.strip()
    return normalized.lower() not in INVALID_ASIN_VALUES and ASIN_PATTERN.fullmatch(normalized) is not None


def resolve(base: Path, value: str | None) -> Path | None:
    if value is None:
        return None
    candidate = Path(value)
    if candidate.is_absolute():
        raise ValueError(f"absolute paths are not allowed: {value}")
    base_resolved = base.resolve()
    resolved = (base / candidate).resolve()
    try:
        resolved.relative_to(base_resolved)
    except ValueError as exc:
        raise ValueError(f"path escapes manifest directory: {value}") from exc
    return resolved


def read_table(path: Path) -> pd.DataFrame:
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path)
    if path.suffix.lower() in {".xlsx", ".xls"}:
        return pd.read_excel(path)
    raise ValueError(f"unsupported input format: {path.suffix}")


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def evidence_for(role: str, path: Path, frame: pd.DataFrame, manifest: dict[str, Any], base: Path, analysis_id: str) -> dict[str, Any]:
    portable_path = path.relative_to(base).as_posix()
    return {
        "evidence_id": f"{analysis_id}:{role}",
        "source": portable_path,
        "locator": {"file": portable_path},
        "as_of": manifest["as_of"],
        "fetched_at": manifest["fetched_at"],
        "raw_value": {"rows": int(len(frame)), "columns": list(frame.columns), "sha256": file_hash(path)},
        "transformation": "read local table without business aggregation",
        "confidence": 1.0,
        "data_level": "A" if role in CORE else "B",
    }


def ratio(numerator: float, denominator: float) -> float | None:
    return numerator / denominator if denominator else None


def calculate_asin_metrics(tables: dict[str, pd.DataFrame], usable: set[str]) -> list[dict[str, Any]]:
    if "product_performance" not in usable:
        return []
    frame = tables["product_performance"].copy()
    numeric_columns = ["sessions", "orders", "sales", "ad_spend", "ad_sales", "natural_orders"]
    for column in numeric_columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    metrics: list[dict[str, Any]] = []
    for asin, group in frame.groupby("asin", dropna=False):
        sales = float(group["sales"].sum())
        orders = float(group["orders"].sum())
        sessions = float(group["sessions"].sum())
        ad_spend = float(group["ad_spend"].sum())
        ad_sales = float(group["ad_sales"].sum())
        natural_orders = float(group["natural_orders"].sum())
        metrics.append({
            "asin": str(asin).strip(),
            "sales": sales,
            "orders": orders,
            "sessions": sessions,
            "ad_spend": ad_spend,
            "ad_sales": ad_sales,
            "natural_orders": natural_orders,
            "cvr": ratio(orders, sessions),
            "acos": ratio(ad_spend, ad_sales),
            "roas": ratio(ad_sales, ad_spend),
            "tacos": ratio(ad_spend, sales),
            "natural_order_share": ratio(natural_orders, orders),
        })
    return sorted(metrics, key=lambda item: item["asin"])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    base = manifest_path.parent
    files = manifest.get("files", {})
    issues: list[str] = []
    manifest_invalid = False
    required_manifest_keys = {"manifest_version", "analysis_id", "as_of", "fetched_at", "files"}
    allowed_manifest_keys = required_manifest_keys | {"requested_level"}
    if manifest.get("manifest_version") != "1.0":
        issues.append("manifest_version must be 1.0")
        manifest_invalid = True
    if required_manifest_keys - set(manifest):
        issues.append("manifest is missing required keys")
        manifest_invalid = True
    if set(manifest) - allowed_manifest_keys:
        issues.append("manifest has unknown keys")
        manifest_invalid = True
    if not isinstance(files, dict):
        issues.append("files must be an object")
        manifest_invalid = True
        files = {}
    if "requested_level" in manifest and manifest["requested_level"] not in {"A", "B", "C"}:
        issues.append("requested_level must be A, B, or C")
        manifest_invalid = True
    analysis_id = manifest.get("analysis_id")
    safe_analysis_id = analysis_id if is_safe_identifier(analysis_id) else "invalid-analysis"
    if analysis_id != safe_analysis_id:
        issues.append("analysis_id must be a safe identifier")
        manifest_invalid = True
    evidence: list[dict[str, Any]] = []
    tables: dict[str, pd.DataFrame] = {}
    usable: set[str] = set()

    for role in REQUIRED_COLUMNS:
        try:
            path = resolve(base, files.get(role))
        except ValueError as exc:
            issues.append(f"{role}: {exc}")
            continue
        if path is None:
            if role in CORE:
                issues.append(f"missing core file: {role}")
            continue
        if not path.exists() or not path.is_file():
            issues.append(f"file not found: {role}")
            continue
        try:
            frame = read_table(path)
        except Exception as exc:
            issues.append(f"cannot read {role}: {exc}")
            continue
        tables[role] = frame
        missing = REQUIRED_COLUMNS[role] - set(frame.columns)
        numeric_ok = True
        if missing:
            issues.append(f"{role} missing columns: {', '.join(sorted(missing))}")
        if frame.empty:
            issues.append(f"{role} has no rows")
        for column in REQUIRED_COLUMNS[role] & {"spend", "sales", "orders", "sessions", "ad_spend", "ad_sales", "natural_orders"}:
            if column in frame.columns:
                converted = pd.to_numeric(frame[column], errors="coerce")
                if converted.isna().any():
                    numeric_ok = False
                    issues.append(f"{role}.{column} contains non-numeric values")
        if not missing and not frame.empty and numeric_ok:
            usable.add(role)
        evidence.append(evidence_for(role, path, frame, manifest, base, safe_analysis_id))

    identifier_invalid = False
    for role in ("product_performance", "ad_performance"):
        if role in tables and "asin" in tables[role].columns:
            invalid = ~tables[role]["asin"].map(valid_asin)
            if invalid.any():
                identifier_invalid = True
                issues.append(f"{role} contains empty, placeholder, or invalid ASIN")
    if identifier_invalid:
        usable.difference_update(CORE)

    level = "C"
    if all(role in usable for role in CORE):
        level = "B" if "brand_attribution" in usable or "listing_overlay" in usable else "A"
    requested = manifest.get("requested_level")
    if requested and requested != level:
        issues.append(f"requested level {requested} differs from detected level {level}")

    ad_spend = None
    ad_sales = None
    search_spend = None
    product_spend = None
    product_ad_sales = None
    spend_ratio = None
    if "ad_performance" in usable:
        ad_spend = float(pd.to_numeric(tables["ad_performance"]["spend"], errors="coerce").sum())
        ad_sales = float(pd.to_numeric(tables["ad_performance"]["sales"], errors="coerce").sum())
    if "search_terms" in usable:
        search_spend = float(pd.to_numeric(tables["search_terms"]["spend"], errors="coerce").sum())
    if "product_performance" in usable:
        product_spend = float(pd.to_numeric(tables["product_performance"]["ad_spend"], errors="coerce").sum())
        product_ad_sales = float(pd.to_numeric(tables["product_performance"]["ad_sales"], errors="coerce").sum())
    if ad_spend is not None and search_spend is not None:
        spend_ratio = abs(search_spend - ad_spend) / ad_spend if ad_spend else (0.0 if not search_spend else None)
        if spend_ratio is None or spend_ratio > 0.1:
            issues.append(f"search-term spend does not reconcile with ad spend: ratio={spend_ratio}")
    if ad_spend is not None and product_spend is not None:
        product_spend_ratio = abs(product_spend - ad_spend) / ad_spend if ad_spend else (0.0 if not product_spend else None)
        if product_spend_ratio is None or product_spend_ratio > 0.1:
            issues.append(f"product ad_spend does not reconcile with ad performance: ratio={product_spend_ratio}")
    if ad_sales is not None and product_ad_sales is not None:
        ad_sales_ratio = abs(product_ad_sales - ad_sales) / ad_sales if ad_sales else (0.0 if not ad_sales else None)
        if ad_sales_ratio is None or ad_sales_ratio > 0.1:
            issues.append(f"product ad_sales does not reconcile with ad performance: ratio={ad_sales_ratio}")

    if level == "C" or manifest_invalid:
        status = "failed"
    elif issues:
        status = "degraded"
    else:
        status = "passed"
    for item in evidence:
        validate_evidence(item)
    if not evidence:
        evidence.append(
            {
                "evidence_id": f"{safe_analysis_id}:manifest",
                "source": manifest_path.name,
                "locator": {"file": manifest_path.name},
                "as_of": manifest["as_of"],
                "fetched_at": manifest["fetched_at"],
                "raw_value": {"manifest": manifest_path.name},
                "transformation": "manifest read without usable input tables",
                "confidence": 1.0,
                "data_level": "unknown",
            }
        )
        validate_evidence(evidence[-1])
    artifact = {
        "schema_version": "1.0",
        "artifact_id": f"{safe_analysis_id}:quality",
        "kind": "amazon-ad-data-quality",
        "status": "draft" if status != "failed" else "blocked",
        "generator": "shared/amazon_ad_quality.py",
        "evidence_ids": [item["evidence_id"] for item in evidence],
        "validation": {
            "status": status,
            "checks": ["path-boundary", "required-files", "required-columns", "row-count", "numeric-values", "spend-reconciliation"],
        },
        "human_gate": "required" if status != "passed" else "not_required",
    }
    validate_artifact(artifact)
    result = {
        "schema_version": "1.0",
        "analysis_id": safe_analysis_id,
        "data_level": level,
        "quality": artifact,
        "evidence": evidence,
        "metrics": {
            "asin_metrics": calculate_asin_metrics(tables, usable),
            "product_rows": len(tables.get("product_performance", [])),
            "ad_rows": len(tables.get("ad_performance", [])),
            "search_term_rows": len(tables.get("search_terms", [])),
            "ad_spend": ad_spend,
            "ad_sales": ad_sales,
            "product_ad_spend": product_spend,
            "product_ad_sales": product_ad_sales,
            "search_term_spend": search_spend,
            "spend_reconciliation_ratio": spend_ratio,
        },
        "issues": issues,
    }
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    return 0 if status != "failed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
