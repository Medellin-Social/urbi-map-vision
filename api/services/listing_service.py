"""Domain logic for realtor listings."""
from datetime import datetime, timezone
from typing import Any, Dict, FrozenSet, List

# "Publica primero, verifica después": borrador → publicado es directo (owner
# publica sin moderación previa; la verificación es un flag aparte, no un estado).
# Se conserva borrador → en_revision para el flujo realtor clásico (aceptar_intake).
TRANSICIONES_VALIDAS: Dict[str, FrozenSet[str]] = {
    "borrador":    frozenset(["en_revision", "publicado"]),
    "en_revision": frozenset(["publicado", "rechazado"]),
    "rechazado":   frozenset(["borrador"]),
    "publicado":   frozenset(["pausado", "cerrado"]),
    "pausado":     frozenset(["publicado", "cerrado"]),
    "cerrado":     frozenset(),
}

# Tipos que exigen habitaciones y baños en los mínimos (mismo que el front).
_TIPOS_CON_HABITACIONES = frozenset(["apartamento", "casa"])


class EstadoError(ValueError):
    """Invalid state transition."""


def _val(x: Any) -> Any:
    """Enum → str; deja str/None/otros como están."""
    return x.value if hasattr(x, "value") else x


def _portadas(listing: Any) -> int:
    """Cuenta fotos de portada. Usa listing.fotos_portada si viene precargado
    (como en el front), o cuenta listing.media con es_portada=true."""
    n = getattr(listing, "fotos_portada", None)
    if n is not None:
        return n
    media = getattr(listing, "media", None) or []
    return sum(1 for m in media if getattr(m, "es_portada", False))


def datos_minimos_completos(listing: Any) -> Dict[str, Any]:
    """Guardia de completitud — espejo EXACTO del front (datosMinimosCompletos).

    Devuelve {"ok": bool, "faltan": [...]}. Los 8 mínimos + condicional hab/baños.
    precio: rechaza None Y <= 0 (el placeholder 0 de aceptar_intake no cuenta).
    """
    faltan: List[str] = []

    if not _val(getattr(listing, "tipo_inmueble", None)):
        faltan.append("tipo_inmueble")
    if not _val(getattr(listing, "operacion", None)):
        faltan.append("operacion")

    precio = getattr(listing, "precio", None)
    if precio is None or precio <= 0:
        faltan.append("precio")

    if not getattr(listing, "geom", None):
        faltan.append("geom")
    if not getattr(listing, "barrio", None) and not getattr(listing, "municipio", None):
        faltan.append("barrio_municipio")
    if not getattr(listing, "area_m2", None):
        faltan.append("area_m2")
    if not getattr(listing, "titulo", None):
        faltan.append("titulo")
    if _portadas(listing) < 1:
        faltan.append("foto_portada")

    # Condicional: solo apartamento/casa exigen habitaciones y baños.
    if _val(getattr(listing, "tipo_inmueble", None)) in _TIPOS_CON_HABITACIONES:
        if not getattr(listing, "habitaciones", None):
            faltan.append("habitaciones")
        if not getattr(listing, "banos", None):
            faltan.append("banos")

    return {"ok": len(faltan) == 0, "faltan": faltan}


def transition(listing: Any, nuevo_estado: str) -> None:
    """Advance listing.estado; raise EstadoError if the transition is not valid.

    Sets published_at = now() the first time estado reaches 'publicado'.
    Al pasar borrador → en_revision valida los datos mínimos: ningún listing
    incompleto llega a moderación, aunque el request salte el front.
    listing can be an ORM object or any namespace with .estado and .published_at.
    """
    actual = _val(listing.estado)
    if nuevo_estado not in TRANSICIONES_VALIDAS.get(actual, frozenset()):
        raise EstadoError(f"Transición inválida: {actual!r} → {nuevo_estado!r}")

    if actual == "borrador" and nuevo_estado in ("en_revision", "publicado"):
        chk = datos_minimos_completos(listing)
        if not chk["ok"]:
            raise EstadoError("Faltan datos mínimos: " + ", ".join(chk["faltan"]))

    listing.estado = nuevo_estado
    if nuevo_estado == "publicado" and listing.published_at is None:
        listing.published_at = datetime.now(timezone.utc)
