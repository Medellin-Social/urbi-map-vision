"""En producción (default, sin ENV=dev) email y fotos sin credenciales fallan
fuerte; en dev mantienen el stub."""
import pytest
from fastapi import HTTPException

import api.utils.email as E
import api.utils.env as env
import api.utils.storage as S

_PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 16


@pytest.fixture
def sentry(monkeypatch):
    seen = []
    import sentry_sdk

    monkeypatch.setattr(sentry_sdk, "capture_message", lambda msg, level=None: seen.append((msg, level)))
    return seen


@pytest.fixture
def no_smtp(monkeypatch):
    monkeypatch.setattr(E, "_SMTP_USER", "")
    monkeypatch.setattr(E, "_SMTP_PASS", "")


def test_env_default_es_produccion(monkeypatch):
    monkeypatch.delenv("ENV", raising=False)
    assert env.is_production()
    monkeypatch.setenv("ENV", "Dev")
    assert not env.is_production()


def test_email_sin_credenciales_en_prod_falla_y_reporta(monkeypatch, no_smtp, sentry, caplog):
    monkeypatch.delenv("ENV", raising=False)
    with pytest.raises(E.EmailNotConfigured):
        E._send_sync("a@x.co", "Hola", "<p>x</p>")
    assert sentry and sentry[0][1] == "error"
    assert any(r.levelname == "ERROR" for r in caplog.records)


def test_email_sin_credenciales_en_dev_es_stub(monkeypatch, no_smtp, sentry, capsys):
    monkeypatch.setenv("ENV", "dev")
    E._send_sync("a@x.co", "Hola", "<p>x</p>")
    assert "[EMAIL STUB]" in capsys.readouterr().out
    assert sentry == []


async def test_foto_sin_bucket_en_prod_da_503(monkeypatch, sentry):
    monkeypatch.delenv("ENV", raising=False)
    monkeypatch.setattr(S, "_BUCKET", "")
    with pytest.raises(HTTPException) as ei:
        await S.upload_file(_PNG, "a.png")
    assert ei.value.status_code == 503
    assert sentry


async def test_foto_sin_bucket_en_dev_devuelve_placeholder(monkeypatch, sentry):
    monkeypatch.setenv("ENV", "dev")
    monkeypatch.setattr(S, "_BUCKET", "")
    url = await S.upload_file(_PNG, "a.png")
    assert url.startswith("https://placeholder.s3.amazonaws.com/agentes/")
    assert sentry == []
