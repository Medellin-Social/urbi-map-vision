import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from pydantic import BaseModel, EmailStr

from api.db import get_pool
from api.dependencies import JWT_ALGORITHM, JWT_SECRET, get_current_user
from api.limiter import limiter

_APP_URL = os.getenv("APP_URL", "https://medellinsocial.com")

_bearer = HTTPBearer()

router = APIRouter()

JWT_EXPIRY_DAYS = 30


# ── Models ────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    origen: Optional[str] = None  # 'mls' | 'comunidad'


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    id_token: str


class UserBasic(BaseModel):
    id: int
    email: str
    nombre: Optional[str]
    apellido: Optional[str]
    plan: Optional[str] = "free"
    perfil_busqueda: Optional[str] = None
    onboarding_completado: Optional[bool] = False
    origen_registro: Optional[str] = None


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


_GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"


async def _verify_google_id_token(id_token: str) -> dict:
    """Validate a Google Identity Services id_token against Google's tokeninfo
    endpoint and return its claims. Raises 401 on any invalid/mismatched token.
    """
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            resp = await client.get(_GOOGLE_TOKENINFO_URL, params={"id_token": id_token})
        except httpx.HTTPError:
            raise HTTPException(status_code=401, detail="No se pudo verificar el token de Google")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Token de Google inválido")

    claims = resp.json()
    if not client_id or claims.get("aud") != client_id:
        raise HTTPException(status_code=401, detail="Token de Google inválido")
    if claims.get("email_verified") not in ("true", True):
        raise HTTPException(status_code=401, detail="Correo de Google no verificado")
    if not claims.get("email"):
        raise HTTPException(status_code=401, detail="Token de Google inválido")
    return claims


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse, status_code=201)
@limiter.limit("3/minute")
async def register(request: Request, req: RegisterRequest = Body(...)):
    pool = get_pool()
    existing = await pool.fetchval("SELECT id FROM usuarios WHERE email = $1", req.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email ya registrado")

    password_hash = _hash_password(req.password)
    user_id = await pool.fetchval(
        """
        INSERT INTO usuarios (email, password_hash, nombre, apellido, origen_registro)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        """,
        req.email, password_hash, req.nombre, req.apellido, req.origen,
    )

    # Send verification email (best-effort — don't block registration on SMTP failure)
    try:
        from api.utils.email import send_verify_email
        verify_token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=24)
        await pool.execute(
            """INSERT INTO email_verification_tokens (usuario_id, token, expires_at)
               VALUES ($1, $2, $3)
               ON CONFLICT (usuario_id) DO UPDATE
                   SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, used = FALSE""",
            user_id, verify_token, expires,
        )
        verify_url = f"{_APP_URL}/verify-email?token={verify_token}"
        await send_verify_email(to=req.email, nombre=req.nombre or "", verify_url=verify_url)
    except Exception:
        pass  # ponytail: silent — user can request resend later

    token = _make_token(user_id)
    return AuthResponse(
        token=token,
        user=UserBasic(
            id=user_id, email=req.email, nombre=req.nombre, apellido=req.apellido,
            origen_registro=req.origen,
        ),
    )


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
async def login(request: Request, req: LoginRequest = Body(...)):
    pool = get_pool()
    row = await pool.fetchrow(
        """SELECT id, email, password_hash, nombre, apellido, activo, plan,
                  perfil_busqueda, onboarding_completado, origen_registro
           FROM usuarios WHERE email = $1""",
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
        user=UserBasic(
            id=row["id"], email=row["email"], nombre=row["nombre"], apellido=row["apellido"],
            plan=row["plan"], perfil_busqueda=row["perfil_busqueda"],
            onboarding_completado=row["onboarding_completado"],
            origen_registro=row["origen_registro"],
        ),
        perfil_inversor=perfil,
    )


@router.post("/google", response_model=AuthResponse)
@limiter.limit("10/minute")
async def google_login(request: Request, req: GoogleAuthRequest = Body(...)):
    """Login or auto-register via Google Sign-In. Google already verified the
    email, so accounts created/matched here are trusted (email_verificado=TRUE)."""
    claims = await _verify_google_id_token(req.id_token)
    email = claims["email"]
    pool = get_pool()

    row = await pool.fetchrow(
        """SELECT id, email, nombre, apellido, activo, plan,
                  perfil_busqueda, onboarding_completado, origen_registro
           FROM usuarios WHERE email = $1""",
        email,
    )
    if row is None:
        password_hash = _hash_password(secrets.token_urlsafe(32))
        user_id = await pool.fetchval(
            """
            INSERT INTO usuarios (email, password_hash, nombre, apellido, origen_registro, email_verificado)
            VALUES ($1, $2, $3, $4, 'google', TRUE)
            RETURNING id
            """,
            email, password_hash, claims.get("given_name"), claims.get("family_name"),
        )
        row = await pool.fetchrow(
            """SELECT id, email, nombre, apellido, activo, plan,
                      perfil_busqueda, onboarding_completado, origen_registro
               FROM usuarios WHERE id = $1""",
            user_id,
        )
    elif not row["activo"]:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")

    await pool.execute(
        "UPDATE usuarios SET last_login = NOW(), email_verificado = TRUE WHERE id = $1", row["id"]
    )
    token = _make_token(row["id"])
    perfil = await _get_perfil(pool, row["id"])
    return AuthResponse(
        token=token,
        user=UserBasic(
            id=row["id"], email=row["email"], nombre=row["nombre"], apellido=row["apellido"],
            plan=row["plan"], perfil_busqueda=row["perfil_busqueda"],
            onboarding_completado=row["onboarding_completado"],
            origen_registro=row["origen_registro"],
        ),
        perfil_inversor=perfil,
    )


@router.get("/me", response_model=AuthResponse)
async def me(current_user: dict = Depends(get_current_user)):
    pool = get_pool()
    perfil = await _get_perfil(pool, current_user["id"])
    return AuthResponse(
        token="",
        user=UserBasic(**{k: current_user[k] for k in (
            "id", "email", "nombre", "apellido", "plan",
            "perfil_busqueda", "onboarding_completado", "origen_registro",
        )}),
        perfil_inversor=perfil,
    )


class PerfilOnboardingRequest(BaseModel):
    perfil_busqueda: Optional[str] = None
    onboarding_completado: Optional[bool] = None
    origen_registro: Optional[str] = None


@router.patch("/perfil", status_code=200)
async def update_onboarding_perfil(
    req: PerfilOnboardingRequest = Body(...),
    current_user: dict = Depends(get_current_user),
):
    pool = get_pool()
    fields, params = [], [current_user["id"]]
    if req.perfil_busqueda is not None:
        params.append(req.perfil_busqueda)
        fields.append(f"perfil_busqueda = ${len(params)}")
    if req.onboarding_completado is not None:
        params.append(req.onboarding_completado)
        fields.append(f"onboarding_completado = ${len(params)}")
    if req.origen_registro is not None:
        params.append(req.origen_registro)
        fields.append(f"origen_registro = ${len(params)}")
    if not fields:
        return {"ok": True}
    await pool.execute(
        f"UPDATE usuarios SET {', '.join(fields)} WHERE id = $1",
        *params,
    )
    return {"ok": True}


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
        user=UserBasic(**{k: current_user[k] for k in (
            "id", "email", "nombre", "apellido", "plan",
            "perfil_busqueda", "onboarding_completado", "origen_registro",
        )}),
        perfil_inversor=perfil,
    )


# ── Email verification ────────────────────────────────────────────────────────

@router.get("/verify-email", status_code=200)
async def verify_email(token: str):
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT usuario_id, expires_at, used FROM email_verification_tokens WHERE token = $1",
        token,
    )
    if row is None or row["used"]:
        raise HTTPException(status_code=400, detail="Token inválido o ya utilizado")
    if row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expirado. Regístrate de nuevo o solicita reenvío.")
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE usuarios SET email_verificado = TRUE WHERE id = $1", row["usuario_id"]
            )
            await conn.execute(
                "UPDATE email_verification_tokens SET used = TRUE WHERE token = $1", token
            )
    return {"ok": True, "message": "Correo verificado correctamente"}


# ── Password reset ─────────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password", status_code=200)
@limiter.limit("3/minute")
async def forgot_password(request: Request, req: ForgotPasswordRequest = Body(...)):
    from api.utils.email import send_reset_password
    pool = get_pool()
    user = await pool.fetchrow(
        "SELECT id, nombre FROM usuarios WHERE email = $1", req.email
    )
    # Always 200 — avoid email enumeration
    if user is None:
        return {"message": "Si el correo existe recibirás instrucciones."}

    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=1)
    await pool.execute(
        """INSERT INTO password_reset_tokens (usuario_id, token, expires_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (usuario_id) DO UPDATE
               SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, used = FALSE""",
        user["id"], token, expires,
    )
    reset_url = f"{_APP_URL}/reset-password?token={token}"
    try:
        await send_reset_password(
            to=req.email, nombre=user["nombre"] or "", reset_url=reset_url
        )
    except Exception:
        pass  # ponytail: silent — token in DB, user can retry
    return {"message": "Si el correo existe recibirás instrucciones."}


@router.post("/reset-password", status_code=200)
@limiter.limit("5/minute")
async def reset_password(request: Request, req: ResetPasswordRequest = Body(...)):
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
