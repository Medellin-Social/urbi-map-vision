from __future__ import annotations

import os
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from api.db import get_pool

_bearer = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET", "urbidata-dev-secret-change-in-prod")
JWT_ALGORITHM = "HS256"


async def _get_user_from_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    pool = get_pool()
    # Check blacklist
    blacklisted = await pool.fetchval(
        "SELECT 1 FROM token_blacklist WHERE token = $1", token
    )
    if blacklisted:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revocado")

    row = await pool.fetchrow(
        "SELECT id, email, nombre, apellido, activo FROM usuarios WHERE id = $1",
        int(user_id),
    )
    if row is None or not row["activo"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    return dict(row)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token requerido")
    return await _get_user_from_token(credentials.credentials)


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[dict]:
    if credentials is None:
        return None
    try:
        return await _get_user_from_token(credentials.credentials)
    except HTTPException:
        return None
