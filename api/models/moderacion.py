"""SQLAlchemy model — bitácora de moderación del listing."""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID

from api.models.base import Base


class ModeracionAccion(str, enum.Enum):
    aprobado  = "aprobado"
    rechazado = "rechazado"


class ListingModeracion(Base):
    __tablename__ = "listing_moderacion"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id   = Column(UUID(as_uuid=True), ForeignKey("listing.id", ondelete="CASCADE"), nullable=False)
    accion       = Column(
        Enum(ModeracionAccion, name="moderacion_accion", create_type=False),
        nullable=False,
    )
    motivo       = Column(Text)  # nullable: solo el rechazo lo lleva
    moderador_id = Column(Text, nullable=False)  # email del admin (require_admin)
    created_at   = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
