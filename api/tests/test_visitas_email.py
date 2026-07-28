"""Tests para el email fallback de visitas sin agente (punto 3)."""
import os
from datetime import datetime

import api.routers.visitas as v
from api.routers.visitas import VisitaRequest, _send_visita_email


def _req(**kw):
    base = dict(listing_url="https://x.co/123", nombre="Ana", telefono="3001112233",
                mensaje="Quiero verlo el sábado")
    base.update(kw)
    return VisitaRequest(**base)


def test_sin_agente_default_false():
    """El flag sin_agente es False por defecto y aceptable en True."""
    assert _req().sin_agente is False
    assert _req(sin_agente=True).sin_agente is True


def test_send_skips_when_smtp_unset(monkeypatch, caplog):
    """Sin SMTP_HOST no intenta enviar; loguea y no lanza."""
    monkeypatch.delenv("SMTP_HOST", raising=False)
    called = {"smtp": False}
    monkeypatch.setattr(v.smtplib, "SMTP", lambda *a, **k: called.__setitem__("smtp", True))
    _send_visita_email(_req(sin_agente=True), datetime(2026, 8, 1, 15, 0))
    assert called["smtp"] is False  # nunca abrió conexión


def test_send_builds_correct_message(monkeypatch):
    """Con SMTP configurado, arma el mensaje con To/Subject/cuerpo correctos."""
    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    monkeypatch.setenv("SMTP_FROM", "noreply@medellinsocial.com")
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("SMTP_PASS", raising=False)
    monkeypatch.setenv("RENTAL_INQUIRIES_TO", "rentalinquiries@medellinsocial.com")
    sent = {}

    class FakeSMTP:
        def __init__(self, *a, **k): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def starttls(self): pass
        def login(self, *a): sent["login"] = True
        def send_message(self, msg): sent["msg"] = msg

    monkeypatch.setattr(v.smtplib, "SMTP", FakeSMTP)
    _send_visita_email(_req(sin_agente=True), datetime(2026, 8, 1, 15, 0))

    msg = sent["msg"]
    assert msg["To"] == "rentalinquiries@medellinsocial.com"
    assert msg["From"] == "noreply@medellinsocial.com"
    assert "solicitud de visita" in msg["Subject"].lower()
    body = msg.get_content()
    assert "Ana" in body and "3001112233" in body and "2026-08-01 15:00" in body
    assert "login" not in sent  # sin SMTP_USER no intenta login


def test_send_never_raises_on_smtp_error(monkeypatch):
    """Si el envío falla, la función traga la excepción (la fila ya está en DB)."""
    monkeypatch.setenv("SMTP_HOST", "smtp.test")

    def boom(*a, **k):
        raise OSError("connection refused")

    monkeypatch.setattr(v.smtplib, "SMTP", boom)
    _send_visita_email(_req(sin_agente=True), None)  # no debe lanzar
