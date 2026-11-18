import logging
import threading
import time
import urllib.request
from typing import Optional
from urllib.parse import urlparse

import jwt
from fastapi import Depends, Request

from app.config import settings
from app.db import ApiError, connect, execute, get_db, is_dup_entry, query

# La sesión es la ÚNICA de la plataforma: se inicia en eduwitlabs.com.mx/login y llega en la
# cookie `eduwit_sesion`. Aquí solo se verifica (ES256) con la llave PÚBLICA del backend central
# y se liga a un perfil local (tabla usuarios, compartida con Blocks).
COOKIE = "eduwit_sesion"

logger = logging.getLogger("componentes-ems-backend")


def _llave_url_segura(url: str) -> bool:
    """La llave se descarga solo por HTTPS (en local se permite http://localhost para probar)."""
    partes = urlparse(url)
    return partes.scheme == "https" or (partes.scheme == "http" and partes.hostname in ("localhost", "127.0.0.1"))


LLAVE_URL = settings.sesion_llave_url
LLAVE_URL_SEGURA = _llave_url_segura(LLAVE_URL)
if not LLAVE_URL_SEGURA:
    logger.error("SESION_LLAVE_URL debe ser https:// (se recibió %r). Nadie podrá iniciar sesión.", LLAVE_URL)

# Por qué se rechazó una sesión (sin datos del token), para diagnosticar desde los logs.
# Cada motivo se registra como máximo una vez por minuto.
_ultimo_aviso: dict[str, float] = {}


def _avisar(motivo: str) -> None:
    ahora = time.monotonic()
    if ahora - _ultimo_aviso.get(motivo, -1e9) < 60:
        return
    _ultimo_aviso[motivo] = ahora
    logger.warning("Sesión rechazada: %s", motivo)


_llave = {"pem": None, "hasta": 0.0}
_llave_lock = threading.Lock()


def _llave_publica() -> Optional[str]:
    if not LLAVE_URL_SEGURA:
        return None
    with _llave_lock:
        if time.monotonic() < _llave["hasta"]:
            return _llave["pem"]
        try:
            with urllib.request.urlopen(LLAVE_URL, timeout=5) as res:
                pem = res.read().decode("utf-8", errors="replace")
            _llave["pem"] = pem if "BEGIN PUBLIC KEY" in pem else None
            _llave["hasta"] = time.monotonic() + (600 if _llave["pem"] else 60)
            if not _llave["pem"]:
                _avisar(f"la llave pública de {LLAVE_URL} no es una llave válida")
        except Exception as exc:
            _llave["pem"] = None
            _llave["hasta"] = time.monotonic() + 30
            _avisar(f"no se pudo descargar la llave pública de {LLAVE_URL}: {exc}")
        return _llave["pem"]


def _verificar_sesion(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None  # visitante sin sesión: es lo normal, no se registra
    try:
        alg = jwt.get_unverified_header(token).get("alg")
    except jwt.PyJWTError:
        _avisar("la cookie no tiene formato de JWT")
        return None
    # SOLO ES256: aceptar otro algoritmo (none, HS256) permitiría falsificar sesiones.
    if alg != "ES256":
        _avisar(f"algoritmo {alg} (solo se acepta ES256)")
        return None
    pem = _llave_publica()
    if not pem:
        return None
    try:
        datos = jwt.decode(
            token, pem, algorithms=["ES256"], audience="plataforma",
            options={"require": ["exp", "aud", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        _avisar("la sesión ya venció")
        return None
    except jwt.InvalidAudienceError:
        _avisar('aud no es "plataforma"')
        return None
    except jwt.InvalidSignatureError:
        _avisar("la firma no coincide con la llave pública")
        return None
    except jwt.PyJWTError as exc:
        _avisar(f"token inválido: {exc}")
        return None
    try:
        if int(datos["sub"]) <= 0:
            raise ValueError
    except (TypeError, ValueError):
        _avisar("el token no trae un sub válido")
        return None
    return datos


def _origen_propio(request: Request) -> bool:
    """Contra CSRF: lo que modifica algo solo se acepta desde las páginas de Code."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return True
    origen = request.headers.get("origin")
    if not origen:
        return True
    return urlparse(origen).netloc == request.headers.get("host")


def _perfil_local(db, datos: dict) -> Optional[int]:
    """Por id de la plataforma; si no, por correo (así quien ya tenía cuenta recupera sus programas); si no, se crea."""
    sub = int(datos["sub"])
    rows = query(db, "SELECT id FROM usuarios WHERE plataforma_id = %s", (sub,))
    if rows:
        return rows[0]["id"]
    email = str(datos.get("email") or "").strip().lower()
    if not email:
        _avisar("el token no trae email (¿ya está en vivo el cambio del backend central?)")
        return None
    rows = query(db, "SELECT id FROM usuarios WHERE email = %s AND plataforma_id IS NULL", (email,))
    if rows:
        execute(db, "UPDATE usuarios SET plataforma_id = %s WHERE id = %s", (sub, rows[0]["id"]))
        return rows[0]["id"]
    nombre = str(datos.get("nombre") or email.split("@")[0])[:120]
    rol = "admin" if email in {e.lower() for e in settings.admin_email_list} else "usuario"
    try:
        return execute(
            db,
            "INSERT INTO usuarios (nombre, email, password_hash, plataforma_id, rol) VALUES (%s, %s, '!', %s, %s)",
            (nombre, email, sub, rol),
        )
    except Exception as exc:
        if not is_dup_entry(exc):  # dos peticiones a la vez (o Blocks lo creó primero): ya existe
            raise
        rows = query(db, "SELECT id FROM usuarios WHERE plataforma_id = %s", (sub,))
        return rows[0]["id"] if rows else None


def _usuario_de(request: Request) -> Optional[int]:
    # Primero se verifica el token; la base solo se consulta si la sesión es válida.
    datos = _verificar_sesion(request.cookies.get(COOKIE))
    if not datos:
        return None
    db = connect()
    try:
        return _perfil_local(db, datos)
    finally:
        db.close()


def require_auth(request: Request) -> int:
    if not _origen_propio(request):
        raise ApiError(403, "Origen no permitido.")
    user_id = _usuario_de(request)
    if not user_id:
        raise ApiError(401, "Inicia sesión para continuar.")
    return user_id


# Como require_auth, pero además la cuenta debe tener rol de administrador (el rol es local).
def require_admin(user_id: int = Depends(require_auth), db=Depends(get_db)) -> int:
    rows = query(db, "SELECT rol FROM usuarios WHERE id = %s", (user_id,))
    if not rows or rows[0].get("rol") != "admin":
        raise ApiError(403, "Solo un administrador puede hacer esto.")
    return user_id


# Como require_auth, pero sin sesión (o con una inválida) sigue como anónimo.
def optional_auth(request: Request) -> Optional[int]:
    try:
        return _usuario_de(request)
    except Exception:
        return None
