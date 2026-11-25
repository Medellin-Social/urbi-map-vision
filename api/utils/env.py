"""Detección de entorno compartida (misma regla fail-closed que api/main.py).

Producción es el DEFAULT: el comportamiento de dev (stubs de email/S3, CORS
localhost, /docs) exige ENV=dev|development|local explícito. Se lee en cada
llamada para que los tests puedan cambiar ENV con monkeypatch.
"""
from __future__ import annotations

import logging
import os

_DEV_VALUES = ("dev", "development", "local")


def is_dev() -> bool:
    return os.getenv("ENV", "").strip().lower() in _DEV_VALUES


def is_production() -> bool:
    return not is_dev()


def report_misconfig(logger: logging.Logger, message: str) -> None:
    """Loguea a nivel error y lo manda a Sentry (no-op si Sentry no está iniciado)."""
    logger.error(message)
    try:
        import sentry_sdk

        sentry_sdk.capture_message(message, level="error")
    except Exception:  # noqa: BLE001 — reportar nunca debe romper al caller
        logger.exception("no se pudo reportar a Sentry")
