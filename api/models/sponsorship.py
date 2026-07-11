"""SQLAlchemy model — agency zone sponsorship."""
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint, Column, Date, DateTime, Enum, ForeignKey, Numeric, Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from api.models.base import Base


class SponsorshipEstado(str, enum.Enum):
    activa    = "activa"
    vencida   = "vencida"
    cancelada = "cancelada"


class ZonaNivel(str, enum.Enum):
    barrio     = "barrio"
    comuna     = "comuna"
    municipio  = "municipio"


class Sponsorship(Base):
    __tablename__ = "sponsorship"
    __table_args__ = (
        CheckConstraint("fecha_fin >= fecha_inicio", name="chk_sponsorship_fechas"),
    )

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agency_id      = Column(UUID(as_uuid=True), ForeignKey("agency.id", ondelete="RESTRICT"), nullable=False)

    zona_nivel     = Column(
        Enum(ZonaNivel, name="sponsorship_zona_nivel", create_type=False),
        nullable=False,
    )
    # zona_codigo polimórfico: barrio ID como texto ('123'), nombre de comuna o municipio.
    # No FK: los tres niveles usan la misma columna pero referencian datos distintos
    # en raw.barrios. Para barrio: consumidor hace zona_codigo::int = raw.barrios.id.
    zona_codigo    = Column(Text, nullable=False)

    tier           = Column(Text)
    precio_mensual = Column(Numeric, nullable=False)
    fecha_inicio   = Column(Date, nullable=False)
    fecha_fin      = Column(Date, nullable=False)
    estado         = Column(
        Enum(SponsorshipEstado, name="sponsorship_estado", create_type=False),
        nullable=False,
        default=SponsorshipEstado.activa,
    )
    created_at     = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at     = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    agency = relationship("Agency")
