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


@router.post("/refresh", response_model=AuthResponse)
@limiter.limit("10/minute")
async def refresh_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    current_user: dict = Depends(get_current_user),
):
    """Exchange a valid token for a fresh 30-day token. Old token is blacklisted."""
    pool = get_pool()
    await pool.execute(
        "INSERT INTO token_blacklist (token, usuario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        credentials.credentials, current_user["id"],
    )
    new_token = _make_token(current_user["id"])
    perfil = await _get_perfil(pool, current_user["id"])
    return AuthResponse(
        token=new_token,
        user=UserBasic(**{k: current_user[k] for k in ("id", "email", "nombre", "apellido")}),
        perfil_inversor=perfil,
    )


# ── Password reset ─────────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password", status_code=200)
@limiter.limit("3/minute")
async def forgot_password(request: Request, req: ForgotPasswordRequest):
    """
    Generates a password-reset token valid for 1 hour.
    In production this token would be emailed; during beta it is returned
    directly in the response so the frontend can link straight to the
    reset form without an SMTP dependency.
    """
    import secrets
    pool = get_pool()
    user = await pool.fetchrow("SELECT id FROM usuarios WHERE email = $1", req.email)
    if user is None:
        # Return 200 regardless to avoid email enumeration
        return {"message": "Si el correo existe recibirás instrucciones.", "reset_token": None}

    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=1)

    await pool.execute(
        """
        INSERT INTO password_reset_tokens (usuario_id, token, expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (usuario_id) DO UPDATE
            SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, used = FALSE
        """,
        user["id"], token, expires,
    )
    return {
        "message": "Token generado. En producción se enviaría por email.",
        "reset_token": token,
    }


@router.post("/reset-password", status_code=200)
@limiter.limit("5/minute")
async def reset_password(request: Request, req: ResetPasswordRequest):
    pool = get_pool()
    row = await pool.fetchrow(
        """
        SELECT usuario_id, expires_at, used
        FROM password_reset_tokens
        WHERE token = $1
        """,
        req.token,
    )
    if row is None or row["used"]:
        raise HTTPException(status_code=400, detail="Token inválido o ya utilizado")
    if row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expirado. Solicita uno nuevo.")

    new_hash = _hash_password(req.new_password)
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE usuarios SET password_hash = $1 WHERE id = $2",
                new_hash, row["usuario_id"],
            )
            await conn.execute(
                "UPDATE password_reset_tokens SET used = TRUE WHERE token = $1",
                req.token,
            )

    return {"message": "Contraseña actualizada correctamente"}
