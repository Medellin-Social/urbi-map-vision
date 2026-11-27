"""Listing GHL contract — pure round-trip, no network, no creds.

Guards that outbound field names (ghl_client._listing_campos_to_properties) and
the inbound reverse-map (ghl_webhook._listing_payload_to_row) stay the same
contract (§16 PDF): a drift in either breaks bidirectional sync silently against
real listings. Same invariant the evento/tienda round-trip tests protect."""
from decimal import Decimal

from api.utils.ghl_client import _listing_campos_to_properties
from api.routers.ghl_webhook import _listing_payload_to_row


def test_listing_roundtrip():
    campos = {
        "direccion_aprox": "Cra 1 #2-3", "titulo": "Apto Poblado",
        "estado": "publicado", "operacion": "venta", "tipo_inmueble": "apartamento",
        "municipio": "MEDELLIN", "barrio": "El Poblado",
        "precio": Decimal("450000000"), "moneda": "COP",
        "administracion": Decimal("500000"), "area_m2": 80, "area_lote_m2": None,
        "habitaciones": 3, "banos": 2, "parqueaderos": 1, "estrato": 5,
        "antiguedad_anios": 10, "descripcion": "Lindo", "video_url": "https://v/x",
        "tour_url": "https://t/x", "amoblado": True, "mascotas": False,
        "permite_airbnb": None, "nombre_contacto": "Ana", "telefono": "3001112233",
        "email_contacto": "a@x.co", "horario_contacto": "9-5", "destacado": False,
        "verificado": True, "mostrar_exacto": False,
    }
    props = _listing_campos_to_properties(campos, "uuid-123")
    # dropdowns map to GHL keys on the way out
    assert props["operation"] == "sale" and props["property_type"] == "apartment"
    assert props["listing_status"] == "approved" and props["currency"] == "cop"
    assert props["furnished"] == "yes" and props["verified"] == "yes"
    assert props["website_listing_id"] == "uuid-123"

    row = _listing_payload_to_row(props)
    # inbound inverts the dropdowns back to our enum labels
    assert row["operacion"] == "venta" and row["tipo_inmueble"] == "apartamento"
    assert row["estado"] == "publicado" and row["moneda"] == "COP"
    assert row["amoblado"] is True and row["mascotas"] is False
    assert row["habitaciones"] == 3 and row["estrato"] == 5
    assert row["precio"] == 450000000  # Decimal→float out, _num back to number
    assert row["titulo"] == "Apto Poblado"
    # Gated fields NEVER enter inbound even though we send them: verificado
    # (DD-earned) and destacado (paid) stay authoritative on our side.
    assert "verificado" not in row and "destacado" not in row
    # None fields never appear (partial UPDATE never clobbers)
    assert "area_lote_m2" not in row and "permite_airbnb" not in row


def test_gated_fields_never_inbound():
    # GHL asserting verified/featured must not grant them — gate bypass guard
    row = _listing_payload_to_row({"verified": "yes", "featured": "yes", "listing_title": "X"})
    assert row == {"titulo": "X"}


def test_inbound_drops_unknown_dropdown():
    # a GHL value we never mapped is dropped, not written as garbage (mirrors
    # _map_choice's "don't send garbage" on the outbound side)
    row = _listing_payload_to_row({"operation": "lease", "listing_title": "X"})
    assert "operacion" not in row and row["titulo"] == "X"


def test_inbound_numbers_from_strings():
    # GHL returns custom-object numbers as strings; _num coerces, bad → dropped
    row = _listing_payload_to_row({"price": "450000000", "estrato": "5", "bedrooms": "nope"})
    assert row["precio"] == 450000000 and row["estrato"] == 5
    assert "habitaciones" not in row


if __name__ == "__main__":
    test_listing_roundtrip()
    test_gated_fields_never_inbound()
    test_inbound_drops_unknown_dropdown()
    test_inbound_numbers_from_strings()
    print("listing GHL round-trip self-check OK")
