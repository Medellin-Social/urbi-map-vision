"""Domain logic for realtor listings."""
from datetime import datetime, timezone
from typing import Any, Dict, FrozenSet

TRANSICIONES_VALIDAS: Dict[str, FrozenSet[str]] = {
    "borrador":    frozenset(["en_revision"]),
    "en_revision": frozenset(["publicado", "rechazado"]),
    "rechazado":   frozenset(["borrador"]),
    "publicado":   frozenset(["pausado", "cerrado"]),
    "pausado":     frozenset(["publicado", "cerrado"]),
    "cerrado":     frozenset(),
}


class EstadoError(ValueError):
    """Invalid state transition."""


def transition(listing: Any, nuevo_estado: str) -> None:
    """Advance listing.estado; raise EstadoError if the transition is not valid.

    Sets published_at = now() the first time estado reaches 'publicado'.
    listing can be an ORM object or any namespace with .estado and .published_at.
    """
    actual = listing.estado if isinstance(listing.estado, str) else listing.estado.value
    if nuevo_estado not in TRANSICIONES_VALIDAS.get(actual, frozenset()):
        raise EstadoError(f"Transición inválida: {actual!r} → {nuevo_estado!r}")

    listing.estado = nuevo_estado
    if nuevo_estado == "publicado" and listing.published_at is None:
        listing.published_at = datetime.now(timezone.utc)
