from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Header

from app.config import settings
from app.db import ApiError

TOKEN_TTL = timedelta(days=30)


def _secret() -> str:
    if not settings.jwt_secret:
        raise ApiError(500, "Falta la variable de entorno JWT_SECRET en el servidor.")
    return settings.jwt_secret


# bcrypt solo usa los primeros 72 bytes (bcryptjs los recorta igual), así los hashes sirven en ambos servidores.
def _pw_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt(10)).decode()


def compare_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_pw_bytes(password), password_hash.encode())
    except ValueError:
        return False


def sign_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {"id": user["id"], "email": user["email"], "iat": now, "exp": now + TOKEN_TTL}
    return jwt.encode(payload, _secret(), algorithm="HS256")


def _bearer(authorization: Optional[str]) -> Optional[str]:
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]
    return None


def require_auth(authorization: Optional[str] = Header(None)) -> int:
    token = _bearer(authorization)
    if not token:
        raise ApiError(401, "No autenticado.")
    try:
        return jwt.decode(token, _secret(), algorithms=["HS256"])["id"]
    except (jwt.PyJWTError, KeyError):
        raise ApiError(401, "Sesión inválida o expirada.")


# Como require_auth, pero sin token (o con uno inválido) sigue como anónimo.
def optional_auth(authorization: Optional[str] = Header(None)) -> Optional[int]:
    token = _bearer(authorization)
    if not token:
        return None
    try:
        return jwt.decode(token, _secret(), algorithms=["HS256"])["id"]
    except (jwt.PyJWTError, KeyError):
        # Token inválido: se trata como visitante.
        return None
