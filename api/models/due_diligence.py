"""SQLAlchemy model — checklist de due diligence sobre el intake del owner."""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from api.models.base import Base


class DueDiligenceEstado(str, enum.Enum):
    pendiente  = "pendiente"
    verificado = "verificado"
    rechazado  = "rechazado"


class DueDiligenceItem(Base):
    __tablename__ = "due_diligence_item"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    intake_id      = Column(UUID(as_uuid=True), ForeignKey("intake.id", ondelete="CASCADE"), nullable=False)
    clave          = Column(Text, nullable=False)  # clave del cuestionario (DECLARACIONES_KEYS)
    declarado      = Column(JSONB)                 # lo que dijo el owner (autoreporte)
    estado         = Column(
        Enum(DueDiligenceEstado, name="due_diligence_estado", create_type=False),
        nullable=False,
        default=DueDiligenceEstado.pendiente,
    )
    nota           = Column(Text)
    verificado_por = Column(UUID(as_uuid=True), ForeignKey("agent.id", ondelete="SET NULL"), nullable=True)
    verificado_at  = Column(DateTime(timezone=True))
    created_at     = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
