import re
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import compare_password, hash_password, optional_auth, require_auth, sign_token
from app.db import ApiError, execute, get_db, is_dup_entry, query

router = APIRouter(prefix="/auth", tags=["cuentas"])

MAX_AVATAR_LENGTH = 1024 * 1024
ALIAS_PATTERN = re.compile(r"^[a-zA-Z0-9_.-]{3,30}$")
ALIAS_MESSAGE = "El alias debe tener de 3 a 30 letras, números, punto, guion o guion bajo."
AVATAR_PATTERN = re.compile(r"^data:image/(png|jpeg|webp);base64,")


class RegisterIn(BaseModel):
    nombre: Optional[str] = None
    alias: Optional[Any] = None
    email: Optional[str] = None
    password: Optional[str] = None


class LoginIn(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None


class UpdateMeIn(BaseModel):
    nombre: Optional[str] = None
    alias: Optional[Any] = None
    avatarUrl: Optional[Any] = None


def to_public_user(row: dict) -> dict:
    return {"id": row["id"], "nombre": row["nombre"], "alias": row["alias"], "email": row["email"], "avatarUrl": row["avatar_url"]}


# La comparación no distingue mayúsculas (la columna usa una intercalación *_ci).
def alias_taken(db, alias: str, user_id: int = 0) -> bool:
    return len(query(db, "SELECT id FROM usuarios WHERE alias = %s AND id <> %s", (alias, user_id))) > 0


@router.post("/register")
def register(body: RegisterIn, db=Depends(get_db)):
    alias = str(body.alias if body.alias is not None else "").strip()
    if not body.nombre or not alias or not body.email or not body.password:
        raise ApiError(400, "Faltan nombre, alias, email o contraseña.")
    if not ALIAS_PATTERN.match(alias):
        raise ApiError(400, ALIAS_MESSAGE)
    if len(body.password) < 6:
        raise ApiError(400, "La contraseña debe tener al menos 6 caracteres.")

    if query(db, "SELECT id FROM usuarios WHERE email = %s", (body.email,)):
        raise ApiError(409, "Ya existe una cuenta con ese correo.")
    if alias_taken(db, alias):
        raise ApiError(409, "Ese alias ya está en uso.")

    try:
        user_id = execute(
            db,
            "INSERT INTO usuarios (nombre, alias, email, password_hash) VALUES (%s, %s, %s, %s)",
            (body.nombre, alias, body.email, hash_password(body.password)),
        )
    except Exception as exc:
        if is_dup_entry(exc):
            raise ApiError(409, "Ese correo o alias ya está en uso.")
        raise ApiError(500, f"Error de base de datos: {exc}")

    user = {"id": user_id, "nombre": body.nombre, "alias": alias, "email": body.email, "avatar_url": None}
    return {"ok": True, "token": sign_token(user), "user": to_public_user(user)}


@router.post("/login")
def login(body: LoginIn, db=Depends(get_db)):
    if not body.email or not body.password:
        raise ApiError(400, "Faltan email o contraseña.")

    rows = query(db, "SELECT * FROM usuarios WHERE email = %s", (body.email,))
    user = rows[0] if rows else None
    if not user or not compare_password(body.password, user["password_hash"]):
        raise ApiError(401, "Correo o contraseña incorrectos.")
    return {"ok": True, "token": sign_token(user), "user": to_public_user(user)}


@router.get("/me")
def me(user_id: int = Depends(require_auth), db=Depends(get_db)):
    rows = query(db, "SELECT * FROM usuarios WHERE id = %s", (user_id,))
    if not rows:
        raise ApiError(404, "Usuario no encontrado.")
    return {"ok": True, "user": to_public_user(rows[0])}


# Sin sesión se usa al registrarse; con sesión, el alias propio cuenta como disponible.
@router.get("/alias-disponible")
def alias_disponible(alias: str = "", user_id: Optional[int] = Depends(optional_auth), db=Depends(get_db)):
    alias = alias.strip()
    if not ALIAS_PATTERN.match(alias):
        return {"ok": True, "disponible": False, "message": "Usa de 3 a 30 letras, números, punto, guion o guion bajo."}
    taken = alias_taken(db, alias, user_id or 0)
    return {"ok": True, "disponible": not taken, "message": "Ese alias ya está en uso." if taken else ""}


@router.put("/me")
def update_me(body: UpdateMeIn, user_id: int = Depends(require_auth), db=Depends(get_db)):
    if not body.nombre:
        raise ApiError(400, "Falta el nombre.")

    # alias ausente = no cambiar. Es obligatorio, así que no se puede quitar.
    if "alias" in body.model_fields_set:
        alias = str(body.alias if body.alias is not None else "").strip()
        if not alias:
            raise ApiError(400, "El alias es obligatorio.")
        if not ALIAS_PATTERN.match(alias):
            raise ApiError(400, ALIAS_MESSAGE)
        if alias_taken(db, alias, user_id):
            raise ApiError(409, "Ese alias ya está en uso.")
        try:
            execute(db, "UPDATE usuarios SET alias = %s WHERE id = %s", (alias, user_id))
        except Exception as exc:
            # Otro usuario lo tomó entre la comprobación y el guardado.
            if is_dup_entry(exc):
                raise ApiError(409, "Ese alias ya está en uso.")
            raise

    # avatarUrl ausente = no cambiar, null = quitar foto, string = nueva foto (data URL de imagen).
    if "avatarUrl" in body.model_fields_set:
        avatar = body.avatarUrl
        if avatar is not None and (not isinstance(avatar, str) or not AVATAR_PATTERN.match(avatar)):
            raise ApiError(400, "Formato de foto inválido.")
        if avatar and len(avatar) > MAX_AVATAR_LENGTH:
            raise ApiError(400, "La foto es demasiado grande.")
        execute(db, "UPDATE usuarios SET nombre = %s, avatar_url = %s WHERE id = %s", (body.nombre, avatar, user_id))
    else:
        execute(db, "UPDATE usuarios SET nombre = %s WHERE id = %s", (body.nombre, user_id))

    rows = query(db, "SELECT * FROM usuarios WHERE id = %s", (user_id,))
    return {"ok": True, "user": to_public_user(rows[0])}
