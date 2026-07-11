"""SQLAlchemy model — owner intake (captación de inmueble).

IMPORTANTE: todo lo que declara el owner es AUTOREPORTE, no verdad verificada.
El realtor lo confirma en la due diligence (paso posterior). Las respuestas del
cuestionario legal viven en `declaraciones` (JSONB) — NO las trates como validadas.
"""
import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    Column, DateTime, Enum, ForeignKey, Numeric, SmallInteger, Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from api.models.base import Base


class IntakeEstado(str, enum.Enum):
    nuevo           = "nuevo"
    en_pool         = "en_pool"           # sin patrocinador → pool abierto (0051)
    asignado        = "asignado"          # realtor asignado (paso 5)
    en_verificacion = "en_verificacion"   # due diligence en curso
    aceptado        = "aceptado"          # listing creado
    descartado      = "descartado"


class IntakeOperacion(str, enum.Enum):
    venta    = "venta"
    arriendo = "arriendo"


class IntakeTipoInmueble(str, enum.Enum):
    apartamento = "apartamento"
    casa        = "casa"
    local       = "local"
    oficina     = "oficina"
    lote        = "lote"
    finca       = "finca"


class Intake(Base):
    __tablename__ = "intake"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id   = Column(UUID(as_uuid=True), ForeignKey("owner.id", ondelete="RESTRICT"), nullable=False)
    estado     = Column(
        Enum(IntakeEstado, name="intake_estado", create_type=False),
        nullable=False,
        default=IntakeEstado.nuevo,
    )
    # agent_id lo llena el asignador (paso 5); nace NULL. listing_id al aceptar.
    agent_id   = Column(UUID(as_uuid=True), ForeignKey("agent.id",   ondelete="SET NULL"), nullable=True)
    listing_id = Column(UUID(as_uuid=True), ForeignKey("listing.id", ondelete="SET NULL"), nullable=True)

    # ── Declaraciones del owner (AUTOREPORTE) ─────────────────────────────────

    operacion      = Column(
        Enum(IntakeOperacion, name="intake_operacion", create_type=False),
        nullable=False,
    )
    tipo_inmueble  = Column(
        Enum(IntakeTipoInmueble, name="intake_tipo_inmueble", create_type=False),
        nullable=False,
    )

    # Ubicación — GEOMETRY Point SRID 4326, MISMO formato que listing.geom.
    # Obligatorio: sin ubicación no hay zona, sin zona no hay asignación.
    geom            = Column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    municipio       = Column(Text)  # denormalizado desde raw.barrios (display)
    barrio          = Column(Text)  # denormalizado desde raw.barrios (display)
    direccion_aprox = Column(Text)

    # Zona resuelta desde geom (zona_service.resolver_zona) — identificador ESTABLE.
    zona_nivel      = Column(Text)  # 'barrio' (único nivel estable hoy)
    zona_codigo     = Column(Text)  # raw.barrios.id::text

    # Características físicas (autoreporte, pero estables/consultables → columnas)
    precio_esperado = Column(Numeric)
    area_m2         = Column(Numeric)
    habitaciones    = Column(SmallInteger)
    banos           = Column(SmallInteger)

    # Respuestas del cuestionario legal (AUTOREPORTE, sujeto al cuestionario
    # versionable). JSONB para que cambiar el cuestionario NO requiera migración.
    # Claves esperadas: en_propiedad_horizontal, al_dia_administracion,
    # al_dia_predial, tiene_hipoteca, tiene_escritura, servicios_al_dia,
    # estado_civil, es_persona_juridica.
    declaraciones   = Column(JSONB)

    notas_owner     = Column(Text)

    created_at      = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at      = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner   = relationship("Owner")
    agent   = relationship("Agent")
    listing = relationship("Listing")
