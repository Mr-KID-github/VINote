from __future__ import annotations

from typing import Any


READY_STATUSES = frozenset({"ready", "active", "healthy", "loaded", "available"})
MODEL_TYPES = ("asr", "diarization", "llm")


def build_pipeline_readiness(models: list[dict[str, Any]] | None) -> dict[str, Any]:
    selected = {
        model_type: _select_ready_model(models or [], model_type)
        for model_type in MODEL_TYPES
    }
    audio_missing = [model_type for model_type in MODEL_TYPES if selected[model_type] is None]
    transcript_missing = ["llm"] if selected["llm"] is None else []
    return {
        "audioMeeting": {
            "ready": not audio_missing,
            "missing": audio_missing,
            "selectedModels": {
                model_type: model_id
                for model_type, model_id in selected.items()
                if model_id is not None
            },
        },
        "transcriptNote": {
            "ready": not transcript_missing,
            "missing": transcript_missing,
            "selectedModels": {"llm": selected["llm"]} if selected["llm"] else {},
        },
    }


def readiness_for_source(readiness: dict[str, Any], source_type: str) -> dict[str, Any]:
    key = "transcriptNote" if source_type == "transcript" else "audioMeeting"
    value = readiness.get(key)
    if isinstance(value, dict):
        return value
    return {
        "ready": False,
        "missing": ["llm"] if key == "transcriptNote" else list(MODEL_TYPES),
        "selectedModels": {},
    }


def _select_ready_model(models: list[dict[str, Any]], expected_type: str) -> str | None:
    for model in models:
        if not isinstance(model, dict) or _model_type(model) != expected_type:
            continue
        if _model_status(model) not in READY_STATUSES:
            continue
        model_id = model.get("id") or model.get("modelId") or model.get("model_id")
        if model_id is not None and str(model_id).strip():
            return str(model_id)
    return None


def _model_type(model: dict[str, Any]) -> str:
    aliases = {"speech": "asr", "stt": "asr", "language": "llm", "chat": "llm", "completion": "llm"}
    for key in ("modelType", "model_type", "type", "category"):
        value = model.get(key)
        if value is None:
            continue
        normalized = str(value).strip().lower()
        normalized = aliases.get(normalized, normalized)
        return normalized if normalized in MODEL_TYPES else ""
    return ""


def _model_status(model: dict[str, Any]) -> str:
    for key in (
        "runtimeStatus",
        "runtime_status",
        "status",
        "health",
        "state",
        "activationStatus",
        "activation_status",
    ):
        value = model.get(key)
        if value is not None:
            return str(value).strip().lower()
    return "unknown"
