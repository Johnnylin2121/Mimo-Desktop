"""Small dependency-free validators for MiMo native skill contracts."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

RFC3339_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")

EVIDENCE_LEVELS = {"A", "B", "C", "unknown"}
STATUSES = {"draft", "verified", "blocked"}
PERMISSION_VALUES = {"allow", "ask", "deny"}
PERMISSION_KEYS = {
    "read",
    "write_project",
    "write_vault",
    "move_vault",
    "publish",
    "external_action",
    "scheduler",
}


def is_safe_identifier(value: Any) -> bool:
    if not isinstance(value, str) or not value or len(value) > 128:
        return False
    if value != value.strip() or ".." in value or re.search(r"[\\/\x00-\x1f]", value):
        return False
    return re.match(r"^[A-Za-z]:", value) is None


EVIDENCE_KEYS = {
    "evidence_id",
    "source",
    "locator",
    "as_of",
    "fetched_at",
    "raw_value",
    "transformation",
    "confidence",
    "data_level",
}
ARTIFACT_KEYS = {
    "schema_version",
    "artifact_id",
    "kind",
    "status",
    "path",
    "generator",
    "evidence_ids",
    "validation",
    "human_gate",
}


class ContractError(ValueError):
    """Raised when a native artifact violates its contract."""


def _required(payload: dict[str, Any], keys: set[str], label: str) -> None:
    missing = sorted(keys - payload.keys())
    if missing:
        raise ContractError(f"{label} missing fields: {', '.join(missing)}")


def _reject_unknown(payload: dict[str, Any], allowed: set[str], label: str) -> None:
    unknown = sorted(set(payload) - allowed)
    if unknown:
        raise ContractError(f"{label} has unknown fields: {', '.join(unknown)}")


def _timestamp(value: Any, field: str) -> None:
    if not isinstance(value, str) or RFC3339_PATTERN.fullmatch(value) is None:
        raise ContractError(f"{field} must be an RFC3339 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ContractError(f"{field} must be an RFC3339 timestamp") from exc
    if parsed.tzinfo is None:
        raise ContractError(f"{field} must include a timezone offset")


def _validate_locator(locator: Any) -> None:
    if not isinstance(locator, dict):
        raise ContractError("locator must be an object")
    allowed = {"file", "sheet", "row", "url"}
    unknown = sorted(set(locator) - allowed)
    if unknown:
        raise ContractError(f"locator has unknown fields: {', '.join(unknown)}")
    for field in ("file", "sheet", "url"):
        if field in locator and (not isinstance(locator[field], str) or not locator[field].strip()):
            raise ContractError(f"locator.{field} must be a non-empty string")
    if "row" in locator and (isinstance(locator["row"], bool) or not isinstance(locator["row"], int) or locator["row"] < 1):
        raise ContractError("locator.row must be a positive integer")


def validate_evidence(payload: dict[str, Any]) -> None:
    _reject_unknown(payload, EVIDENCE_KEYS, "evidence")
    _required(
        payload,
        {
            "evidence_id",
            "source",
            "locator",
            "raw_value",
            "as_of",
            "fetched_at",
            "transformation",
            "confidence",
            "data_level",
        },
        "evidence",
    )
    for field in ("evidence_id", "source", "transformation"):
        if not isinstance(payload[field], str) or not payload[field].strip():
            raise ContractError(f"{field} must be a non-empty string")
    if "locator" in payload:
        _validate_locator(payload["locator"])
    _timestamp(payload["as_of"], "as_of")
    _timestamp(payload["fetched_at"], "fetched_at")
    confidence = payload["confidence"]
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        raise ContractError("confidence must be a number")
    if not 0 <= confidence <= 1:
        raise ContractError("confidence must be between 0 and 1")
    if payload["data_level"] not in EVIDENCE_LEVELS:
        raise ContractError("data_level must be A, B, C, or unknown")


def validate_artifact(payload: dict[str, Any]) -> None:
    _reject_unknown(payload, ARTIFACT_KEYS, "artifact")
    _required(
        payload,
        {
            "artifact_id",
            "kind",
            "status",
            "generator",
            "evidence_ids",
            "validation",
            "human_gate",
        },
        "artifact",
    )
    for field in ("artifact_id", "kind", "generator"):
        if not isinstance(payload[field], str) or not payload[field].strip():
            raise ContractError(f"{field} must be a non-empty string")
    if "path" in payload and (not isinstance(payload["path"], str) or not payload["path"].strip()):
        raise ContractError("path must be a non-empty string")
    if payload["status"] not in STATUSES:
        raise ContractError("artifact status is invalid")
    if (
        not isinstance(payload["evidence_ids"], list)
        or not payload["evidence_ids"]
        or not all(isinstance(item, str) and item for item in payload["evidence_ids"])
    ):
        raise ContractError("evidence_ids must be a non-empty list of strings")
    if len(set(payload["evidence_ids"])) != len(payload["evidence_ids"]):
        raise ContractError("evidence_ids must be unique")
    validation = payload["validation"]
    if not isinstance(validation, dict):
        raise ContractError("validation must be an object")
    if set(validation) - {"status", "checks"}:
        raise ContractError("validation has unknown fields")
    if validation.get("status") not in {"passed", "failed", "degraded", "not_run"}:
        raise ContractError("validation.status is invalid")
    if not isinstance(validation.get("checks"), list) or not all(
        isinstance(item, str) for item in validation["checks"]
    ):
        raise ContractError("validation.checks must be a list of strings")
    if payload["human_gate"] not in {"not_required", "required", "approved", "rejected"}:
        raise ContractError("human_gate is invalid")


def validate_permissions(payload: dict[str, Any]) -> None:
    _required(payload, PERMISSION_KEYS, "permissions")
    for key, value in payload.items():
        if key not in PERMISSION_KEYS:
            raise ContractError(f"unknown permission: {key}")
        if value not in PERMISSION_VALUES:
            raise ContractError(f"permission {key} is invalid")
