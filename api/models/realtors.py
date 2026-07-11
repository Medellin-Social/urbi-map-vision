"""SQLAlchemy declarative models — realtor identity layer.

Note: existing routers use raw asyncpg; these models are the canonical schema
source and can be used by future ORM-based code.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from api.models.base import Base


# ── Enums ─────────────────────────────────────────────────────────────────────

class TipoAgency(str, enum.Enum):
    independiente = "independiente"
    agencia = "agencia"


class EstadoAgent(str, enum.Enum):
    pendiente = "pendiente"
    activo = "activo"
    rechazado = "rechazado"


class RolMember(str, enum.Enum):
    owner = "owner"
    agente = "agente"


# ── Models ────────────────────────────────────────────────────────────────────

class Agency(Base):
    __tablename__ = "agency"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre = Column(Text, nullable=False)
    nit = Column(Text)
    tipo = Column(
        Enum(TipoAgency, name="agency_tipo", create_type=False),
        nullable=False,
        default=TipoAgency.independiente,
    )
    verificada = Column(Boolean, nullable=False, default=False)
    plan = Column(String)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    members = relationship("AgencyMember", back_populates="agency", cascade="all, delete-orphan")


class Agent(Base):
    __tablename__ = "agent"
    __table_args__ = (
        CheckConstraint(
            "estado <> 'activo' OR usuario_id IS NOT NULL",
            name="chk_agent_activo_requires_usuario",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    email = Column(Text, nullable=False, unique=True)
    nombre = Column(Text, nullable=False)
    telefono = Column(Text, nullable=False)
    foto_url = Column(Text)
    estado = Column(
        Enum(EstadoAgent, name="agent_estado", create_type=False),
        nullable=False,
        default=EstadoAgent.pendiente,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    memberships = relationship("AgencyMember", back_populates="agent", cascade="all, delete-orphan")


class AgencyMember(Base):
    __tablename__ = "agency_member"

    agency_id = Column(UUID(as_uuid=True), ForeignKey("agency.id", ondelete="CASCADE"), primary_key=True)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agent.id", ondelete="CASCADE"), primary_key=True)
    rol = Column(
        Enum(RolMember, name="agency_member_rol", create_type=False),
        nullable=False,
        default=RolMember.agente,
    )

    agency = relationship("Agency", back_populates="members")
    agent = relationship("Agent", back_populates="memberships")


class Owner(Base):
    __tablename__ = "owner"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    nombre = Column(Text, nullable=False)
    email = Column(Text, nullable=False, unique=True)
    telefono = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
