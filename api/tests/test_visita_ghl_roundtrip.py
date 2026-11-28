"""Visita ↔ GHL Appointment — pure status-map round-trip, no network, no creds.

NOTE: this proves INTERNAL consistency only (our estado → our assumed
appointmentStatus → back). It does NOT prove the wire matches GHL: the
appointment endpoint/Version/field names/status enum are ASSUMED from the public
Calendars API and pending confirmation against a real appointment payload (see the
ponytail markers in ghl_client.py / ghl_webhook.py). Its job is to catch drift
between the outbound map and the inbound reverse-map, like the evento/listing tests."""
from api.utils.ghl_client import _ESTADO_TO_APPT
from api.routers.ghl_webhook import _ESTADO_FROM_APPT, _parse_dt_tz


def test_estado_status_roundtrip():
    # every estado we send maps back to itself through the reverse map
    for estado, status in _ESTADO_TO_APPT.items():
        assert _ESTADO_FROM_APPT[status] == estado, (estado, status)


def test_known_appt_statuses_map():
    assert _ESTADO_FROM_APPT["confirmed"] == "confirmada"
    assert _ESTADO_FROM_APPT["showed"] == "realizada"
    assert _ESTADO_FROM_APPT["noshow"] == "no_asistio"
    assert _ESTADO_FROM_APPT["cancelled"] == "cancelada"
    assert _ESTADO_FROM_APPT["invalid"] == "cancelada"  # GHL-only status folds to cancelada


def test_fecha_keeps_offset():
    # fecha_visita is timestamptz — dropping the offset = wrong-hour appointment
    dt = _parse_dt_tz("2026-12-01T15:00:00-05:00")
    assert dt is not None and dt.utcoffset() is not None
    assert dt.utcoffset().total_seconds() == -5 * 3600
    assert _parse_dt_tz("2026-12-01T20:00:00Z").utcoffset().total_seconds() == 0
    assert _parse_dt_tz(None) is None and _parse_dt_tz("garbage") is None


if __name__ == "__main__":
    test_estado_status_roundtrip()
    test_known_appt_statuses_map()
    test_fecha_keeps_offset()
    print("visita GHL round-trip self-check OK")
