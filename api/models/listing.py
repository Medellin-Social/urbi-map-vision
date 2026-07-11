"""SQLAlchemy models — realtor listing and media."""
import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean, Column, DateTime, Enum, ForeignKey, Numeric, SmallInteger, Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from api.models.base import Base


# ── Enums ─────────────────────────────────────────────────────────────────────

class ListingEstado(str, enum.Enum):
    borrador    = "borrador"
    en_revision = "en_revision"
    publicado   = "publicado"
    rechazado   = "rechazado"
    pausado     = "pausado"
    cerrado     = "cerrado"


class ListingOperacion(str, enum.Enum):
    venta   = "venta"
    arriendo = "arriendo"


class ListingTipoInmueble(str, enum.Enum):
    apartamento = "apartamento"
    casa        = "casa"
    local       = "local"
    oficina     = "oficina"
    lote        = "lote"
    finca       = "finca"


# ── Models ────────────────────────────────────────────────────────────────────

class Listing(Base):
    __tablename__ = "listing"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug        = Column(Text, nullable=False, unique=True)
    agency_id   = Column(UUID(as_uuid=True), ForeignKey("agency.id", ondelete="RESTRICT"), nullable=False)
    agent_id    = Column(UUID(as_uuid=True), ForeignKey("agent.id",  ondelete="RESTRICT"), nullable=False)
    estado      = Column(
        Enum(ListingEstado, name="listing_estado", create_type=False),
        nullable=False,
        default=ListingEstado.borrador,
    )

    # Ubicación — GEOMETRY(Point, 4326), spatial_index=False: índice creado en migration
    geom             = Column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    municipio        = Column(Text)
    barrio           = Column(Text)
    direccion_aprox  = Column(Text)
    mostrar_exacto   = Column(Boolean, nullable=False, default=False)

    # Comercial
    operacion       = Column(
        Enum(ListingOperacion, name="listing_operacion", create_type=False),
        nullable=False,
    )
    precio          = Column(Numeric, nullable=False)
    moneda          = Column(Text, nullable=False, default="COP")
    administracion  = Column(Numeric)

    # Características
    tipo_inmueble   = Column(
        Enum(ListingTipoInmueble, name="listing_tipo_inmueble", create_type=False),
        nullable=False,
    )
    area_m2         = Column(Numeric)
    habitaciones    = Column(SmallInteger)
    banos           = Column(SmallInteger)
    parqueaderos    = Column(SmallInteger)
    estrato         = Column(SmallInteger)
    antiguedad_anios = Column(SmallInteger)

    # Meta
    titulo      = Column(Text)
    descripcion = Column(Text)
    video_url   = Column(Text)
    tour_url    = Column(Text)

    created_at   = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at   = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = Column(DateTime(timezone=True))

    media = relationship("ListingMedia", back_populates="listing", cascade="all, delete-orphan", order_by="ListingMedia.orden")


class ListingMedia(Base):
    __tablename__ = "listing_media"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id = Column(UUID(as_uuid=True), ForeignKey("listing.id", ondelete="CASCADE"), nullable=False)
    url        = Column(Text, nullable=False)
    orden      = Column(SmallInteger, nullable=False, default=0)
    es_portada = Column(Boolean, nullable=False, default=False)

    listing = relationship("Listing", back_populates="media")
