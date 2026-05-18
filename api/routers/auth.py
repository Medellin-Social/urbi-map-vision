from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from pydantic import BaseModel, EmailStr

from api.db import get_pool
from api.dependencies import JWT_ALGORITHM, JWT_SECRET, get_current_user
from api.limiter import limiter

_bearer = HTTPBearer()

router = APIRouter()

JWT_EXPIRY_DAYS = 30


# ── Models ────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    nombre: Optional[str] = None
    apellido: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserBasic(BaseModel):
    id: int
    email: str
    nombre: Optional[str]
    apellido: Optional[str]


class AuthResponse(BaseModel):
    token: str
    user: UserBasic
    perfil_inversor: Optional[dict] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


async def _get_perfil(pool, user_id: int) -> Optional[dict]:
    row = await pool.fetchrow(
        "SELECT * FROM perfil_inversor WHERE usuario_id = $1 ORDER BY id DESC LIMIT 1",
        user_id,
    )
    return dict(row) if row else None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse, status_code=201)
@limiter.limit("3/minute")
async def register(request: Request, req: RegisterRequest):
    pool = get_pool()
    existing = await pool.fetchval("SELECT id FROM usuarios WHERE email = $1", req.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email ya registrado")

    password_hash = _hash_password(req.password)
    user_id = await pool.fetchval(
        """
        INSERT INTO usuarios (email, password_hash, nombre, apellido)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        """,
        req.email, password_hash, req.nombre, req.apellido,
    )
    token = _make_token(user_id)
    return AuthResponse(
        token=token,
        user=UserBasic(id=user_id, email=req.email, nombre=req.nombre, apellido=req.apellido),
    )


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
async def login(request: Request, req: LoginRequest):
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, email, password_hash, nombre, apellido, activo FROM usuarios WHERE email = $1",
        req.email,
    )
    if row is None or not _verify_password(req.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    if not row["activo"]:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")

    await pool.execute(
        "UPDATE usuarios SET last_login = NOW() WHERE id = $1", row["id"]
    )
    token = _make_token(row["id"])
    perfil = await _get_perfil(pool, row["id"])
    return AuthResponse(
        token=token,
        user=UserBasic(id=row["id"], email=row["email"], nombre=row["nombre"], apellido=row["apellido"]),
        perfil_inversor=perfil,
    )


@router.get("/me", response_model=AuthResponse)
async def me(current_user: dict = Depends(get_current_user)):
    pool = get_pool()
    perfil = await _get_perfil(pool, current_user["id"])
    return AuthResponse(
        token="",  # client already has token
        user=UserBasic(**{k: current_user[k] for k in ("id", "email", "nombre", "apellido")}),
        perfil_inversor=perfil,
    )


@router.post("/logout", status_code=204)
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    current_user: dict = Depends(get_current_user),
):
    pool = get_pool()
    await pool.execute(
        "INSERT INTO token_blacklist (token, usuario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        credentials.credentials, current_user["id"],
    )
