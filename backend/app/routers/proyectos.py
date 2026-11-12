import secrets
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import optional_auth, require_admin, require_auth
from app.db import ApiError, execute, get_db, is_dup_entry, query

# Mismas rutas y respuestas que el servidor de bloques, pero sobre proyectos_codigo:
# el programa es el texto del editor (contenido) en vez de los bloques (stacks).
router = APIRouter(tags=["proyectos"])

ACCESOS = ("privado", "publico", "compartido")
BOARD_DEFAULT = "MicroPython"


class ProyectoIn(BaseModel):
    nombre: Optional[str] = None
    board: Optional[str] = None
    contenido: Optional[str] = None
    origenCodigo: Optional[str] = None
    origenEjemploId: Optional[int] = None


class EjemploIn(BaseModel):
    nombre: Optional[str] = None
    categoria: Optional[str] = None
    board: Optional[str] = None
    descripcion: Optional[str] = None
    contenido: Optional[str] = None


class AccesoIn(BaseModel):
    acceso: Optional[str] = None


def to_public_project(row: dict) -> dict:
    return {
        "id": row["id"],
        "nombre": row["nombre"],
        "board": row["board"],
        "contenido": row["contenido"],
        "acceso": row["acceso"],
        "esCopia": bool(row["es_copia"]),
        # El enlace solo sirve mientras el programa está compartido.
        "codigo": row["codigo"] if row["acceso"] == "compartido" else None,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def to_project_summary(row: dict) -> dict:
    return {
        "id": row["id"],
        "nombre": row["nombre"],
        "board": row["board"],
        "acceso": row["acceso"],
        "codigo": row.get("codigo"),
        "autor": row["autor"],
        "origen": row.get("origen"),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


# ---------------------------------------------------------------- Ejemplos
# Programas listos para abrir, agrupados por placa y categoría. Cualquiera los ve;
# solo un administrador los agrega, reemplaza o elimina.

def to_ejemplo(row: dict, con_contenido: bool = False) -> dict:
    ejemplo = {
        "id": row["id"],
        "nombre": row["nombre"],
        "categoria": row["categoria"],
        "board": row["board"],
        "descripcion": row["descripcion"],
        "updatedAt": row["updated_at"],
    }
    if con_contenido:
        ejemplo["contenido"] = row["contenido"]
    return ejemplo


def leer_ejemplo(body: EjemploIn) -> tuple:
    nombre = (body.nombre or "").strip()
    categoria = (body.categoria or "").strip() or "General"
    board = (body.board or "").strip()
    descripcion = (body.descripcion or "").strip()
    if not nombre or len(nombre) > 150:
        raise ApiError(400, "El nombre es obligatorio (máximo 150 caracteres).")
    if len(categoria) > 80:
        raise ApiError(400, "La categoría admite máximo 80 caracteres.")
    if not board or len(board) > 80:
        raise ApiError(400, "Falta la placa del ejemplo.")
    if len(descripcion) > 300:
        raise ApiError(400, "La descripción admite máximo 300 caracteres.")
    if body.contenido is None:
        raise ApiError(400, "El programa del ejemplo no es válido.")
    return nombre, categoria, board, descripcion or None, body.contenido


@router.get("/ejemplos")
def list_ejemplos(db=Depends(get_db)):
    rows = query(db, "SELECT id, nombre, categoria, board, descripcion, updated_at FROM ejemplos_codigo ORDER BY board, categoria, nombre")
    return {"ok": True, "proyectos": [to_ejemplo(r) for r in rows]}


@router.get("/ejemplos/{ejemplo_id}")
def get_ejemplo(ejemplo_id: int, db=Depends(get_db)):
    rows = query(db, "SELECT * FROM ejemplos_codigo WHERE id = %s", (ejemplo_id,))
    if not rows:
        raise ApiError(404, "Ejemplo no encontrado.")
    return {"ok": True, "proyecto": to_ejemplo(rows[0], con_contenido=True)}


@router.post("/ejemplos")
def create_ejemplo(body: EjemploIn, user_id: int = Depends(require_admin), db=Depends(get_db)):
    new_id = execute(
        db,
        "INSERT INTO ejemplos_codigo (nombre, categoria, board, descripcion, contenido, creado_por) VALUES (%s, %s, %s, %s, %s, %s)",
        (*leer_ejemplo(body), user_id),
    )
    return {"ok": True, "id": new_id}


@router.put("/ejemplos/{ejemplo_id}")
def update_ejemplo(ejemplo_id: int, body: EjemploIn, _admin: int = Depends(require_admin), db=Depends(get_db)):
    if not query(db, "SELECT id FROM ejemplos_codigo WHERE id = %s", (ejemplo_id,)):
        raise ApiError(404, "Ejemplo no encontrado.")
    execute(
        db,
        "UPDATE ejemplos_codigo SET nombre = %s, categoria = %s, board = %s, descripcion = %s, contenido = %s WHERE id = %s",
        (*leer_ejemplo(body), ejemplo_id),
    )
    return {"ok": True}


@router.delete("/ejemplos/{ejemplo_id}")
def delete_ejemplo(ejemplo_id: int, _admin: int = Depends(require_admin), db=Depends(get_db)):
    if not query(db, "SELECT id FROM ejemplos_codigo WHERE id = %s", (ejemplo_id,)):
        raise ApiError(404, "Ejemplo no encontrado.")
    execute(db, "DELETE FROM ejemplos_codigo WHERE id = %s", (ejemplo_id,))
    return {"ok": True}


# Abre un ejemplo con sesión iniciada: siempre como copia en la Biblioteca (el ejemplo no se edita aquí).
# La copia se crea la primera vez y después se reutiliza.
@router.post("/ejemplos/{ejemplo_id}/copia")
def copiar_ejemplo(ejemplo_id: int, user_id: int = Depends(require_auth), db=Depends(get_db)):
    rows = query(db, "SELECT * FROM ejemplos_codigo WHERE id = %s", (ejemplo_id,))
    if not rows:
        raise ApiError(404, "Ejemplo no encontrado.")
    ejemplo = rows[0]
    existing = query(
        db,
        "SELECT * FROM proyectos_codigo WHERE usuario_id = %s AND origen_ejemplo_id = %s AND es_copia = 1 ORDER BY id LIMIT 1",
        (user_id, ejemplo_id),
    )
    if existing:
        return {"ok": True, "existente": True, "proyecto": {**to_public_project(existing[0]), "autor": "Ejemplos"}}

    new_id = execute(
        db,
        "INSERT INTO proyectos_codigo (usuario_id, nombre, board, contenido, es_copia, origen_ejemplo_id) VALUES (%s, %s, %s, %s, 1, %s)",
        (user_id, ejemplo["nombre"], ejemplo["board"], ejemplo["contenido"], ejemplo_id),
    )
    rows = query(db, "SELECT * FROM proyectos_codigo WHERE id = %s", (new_id,))
    return {"ok": True, "proyecto": {**to_public_project(rows[0]), "autor": "Ejemplos"}}


@router.get("/proyectos-usuario")
def list_proyectos_usuario(user_id: int = Depends(require_auth), db=Depends(get_db)):
    rows = query(db, """
        SELECT p.id, p.nombre, p.board, p.acceso, p.codigo, p.updated_at, p.created_at, COALESCE(u.alias, u.nombre) AS autor
        FROM proyectos_codigo p JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.usuario_id = %s AND p.es_copia = 0 ORDER BY p.updated_at DESC
    """, (user_id,))
    return {"ok": True, "proyectos": [to_project_summary(r) for r in rows]}


@router.get("/proyectos-publicos")
def list_proyectos_publicos(db=Depends(get_db)):
    rows = query(db, """
        SELECT p.id, p.nombre, p.board, p.acceso, p.updated_at, p.created_at, COALESCE(u.alias, u.nombre) AS autor
        FROM proyectos_codigo p JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.acceso = 'publico' ORDER BY p.updated_at DESC
    """)
    return {"ok": True, "proyectos": [to_project_summary(r) for r in rows]}


@router.get("/proyectos-publicos/{proyecto_id}")
def get_proyecto_publico(proyecto_id: int, db=Depends(get_db)):
    rows = query(db, "SELECT * FROM proyectos_codigo WHERE id = %s AND acceso = 'publico'", (proyecto_id,))
    if not rows:
        raise ApiError(404, "Programa no encontrado.")
    return {"ok": True, "proyecto": to_public_project(rows[0])}


CODIGO_ALFABETO = "abcdefghijklmnopqrstuvwxyz0123456789"
CODIGO_LONGITUD = 14


def generar_codigo() -> str:
    return "".join(secrets.choice(CODIGO_ALFABETO) for _ in range(CODIGO_LONGITUD))


# Devuelve el código del programa, generándolo la primera vez que se comparte.
def ensure_codigo(db, proyecto_id: int) -> str:
    rows = query(db, "SELECT codigo FROM proyectos_codigo WHERE id = %s", (proyecto_id,))
    if rows and rows[0]["codigo"]:
        return rows[0]["codigo"]
    for _ in range(5):
        codigo = generar_codigo()
        try:
            execute(db, "UPDATE proyectos_codigo SET codigo = %s, updated_at = updated_at WHERE id = %s", (codigo, proyecto_id))
            return codigo
        except Exception as exc:
            if not is_dup_entry(exc):
                raise
    raise ApiError(500, "No se pudo generar el código para compartir.")


@router.get("/proyectos-usuario/{proyecto_id}/acceso")
def get_acceso(proyecto_id: int, user_id: int = Depends(require_auth), db=Depends(get_db)):
    rows = query(db, "SELECT acceso, codigo FROM proyectos_codigo WHERE id = %s AND usuario_id = %s", (proyecto_id, user_id))
    if not rows:
        raise ApiError(404, "Programa no encontrado.")
    return {"ok": True, "acceso": rows[0]["acceso"], "codigo": rows[0]["codigo"]}


@router.put("/proyectos-usuario/{proyecto_id}/acceso")
def update_acceso(proyecto_id: int, body: AccesoIn, user_id: int = Depends(require_auth), db=Depends(get_db)):
    if body.acceso not in ACCESOS:
        raise ApiError(400, "Tipo de acceso inválido.")

    existing = query(db, "SELECT id, codigo, es_copia FROM proyectos_codigo WHERE id = %s AND usuario_id = %s", (proyecto_id, user_id))
    if not existing:
        raise ApiError(404, "Programa no encontrado.")
    if existing[0]["es_copia"] and body.acceso != "privado":
        raise ApiError(400, "Las copias de la Biblioteca son privadas.")

    execute(db, "UPDATE proyectos_codigo SET acceso = %s, updated_at = updated_at WHERE id = %s", (body.acceso, proyecto_id))
    # El código se conserva al volver a privado, para que el mismo enlace funcione si se comparte otra vez.
    codigo = ensure_codigo(db, proyecto_id) if body.acceso == "compartido" else existing[0]["codigo"]
    return {"ok": True, "acceso": body.acceso, "codigo": codigo}


def find_compartido(db, codigo: str) -> Optional[dict]:
    rows = query(db, """
        SELECT p.*, COALESCE(u.alias, u.nombre) AS autor FROM proyectos_codigo p JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.codigo = %s AND p.acceso = 'compartido'
    """, (str(codigo).lower(),))
    return rows[0] if rows else None


# Vista previa de un programa compartido (búsqueda por código o visitante sin sesión).
@router.get("/proyectos-codigo/{codigo}")
def get_por_codigo(codigo: str, user_id: Optional[int] = Depends(optional_auth), db=Depends(get_db)):
    row = find_compartido(db, codigo)
    if not row:
        raise ApiError(404, "No hay ningún programa compartido con ese código.")
    return {"ok": True, "proyecto": {**to_project_summary(row), **to_public_project(row), "propio": user_id == row["usuario_id"]}}


# Abre un programa compartido con sesión iniciada. El dueño recibe el original; cualquier otra persona,
# su copia en la Biblioteca (se crea la primera vez y después se reutiliza).
@router.post("/proyectos-codigo/{codigo}/copia")
def copiar_por_codigo(codigo: str, user_id: int = Depends(require_auth), db=Depends(get_db)):
    row = find_compartido(db, codigo)
    if not row:
        raise ApiError(404, "No hay ningún programa compartido con ese código.")
    if row["usuario_id"] == user_id:
        return {"ok": True, "propio": True, "proyecto": {**to_project_summary(row), **to_public_project(row)}}

    existing = query(
        db,
        "SELECT * FROM proyectos_codigo WHERE usuario_id = %s AND origen_id = %s AND es_copia = 1 ORDER BY id LIMIT 1",
        (user_id, row["id"]),
    )
    if existing:
        return {"ok": True, "existente": True, "proyecto": {**to_public_project(existing[0]), "autor": row["autor"]}}

    new_id = execute(
        db,
        "INSERT INTO proyectos_codigo (usuario_id, nombre, board, contenido, es_copia, origen_id) VALUES (%s, %s, %s, %s, 1, %s)",
        (user_id, row["nombre"], row["board"], row["contenido"], row["id"]),
    )
    rows = query(db, "SELECT * FROM proyectos_codigo WHERE id = %s", (new_id,))
    return {"ok": True, "proyecto": {**to_public_project(rows[0]), "autor": row["autor"]}}


# Copias del usuario. El autor que se muestra es el dueño del original.
@router.get("/biblioteca")
def biblioteca(user_id: int = Depends(require_auth), db=Depends(get_db)):
    rows = query(db, """
        SELECT p.id, p.nombre, p.board, p.acceso, p.updated_at, p.created_at,
          CASE WHEN p.origen_ejemplo_id IS NOT NULL THEN 'Ejemplos' ELSE COALESCE(ou.alias, ou.nombre, u.alias, u.nombre) END AS autor,
          CASE WHEN p.origen_ejemplo_id IS NOT NULL THEN 'ejemplo' WHEN o.acceso = 'publico' THEN 'publico' ELSE 'compartido' END AS origen
        FROM proyectos_codigo p
        JOIN usuarios u ON u.id = p.usuario_id
        LEFT JOIN proyectos_codigo o ON o.id = p.origen_id
        LEFT JOIN usuarios ou ON ou.id = o.usuario_id
        WHERE p.usuario_id = %s AND p.es_copia = 1 ORDER BY p.updated_at DESC
    """, (user_id,))
    return {"ok": True, "proyectos": [to_project_summary(r) for r in rows]}


@router.get("/proyectos-usuario/{proyecto_id}")
def get_proyecto_usuario(proyecto_id: int, user_id: int = Depends(require_auth), db=Depends(get_db)):
    rows = query(db, "SELECT * FROM proyectos_codigo WHERE id = %s AND usuario_id = %s", (proyecto_id, user_id))
    if not rows:
        raise ApiError(404, "Proyecto no encontrado.")
    return {"ok": True, "proyecto": to_public_project(rows[0])}


@router.post("/proyectos-usuario")
def create_proyecto_usuario(body: ProyectoIn, user_id: int = Depends(require_auth), db=Depends(get_db)):
    # El contenido puede ser una cadena vacía (programa MicroPython vacío).
    if not body.nombre or body.contenido is None:
        raise ApiError(400, "Faltan nombre o contenido.")

    # Programa abierto sin sesión desde un enlace o un ejemplo: se guarda como copia en la Biblioteca.
    origen = find_compartido(db, body.origenCodigo) if body.origenCodigo else None
    origen_id = origen["id"] if origen and origen["usuario_id"] != user_id else None
    ejemplo_id = None
    if body.origenEjemploId:
        rows = query(db, "SELECT id FROM ejemplos_codigo WHERE id = %s", (body.origenEjemploId,))
        ejemplo_id = rows[0]["id"] if rows else None
    es_copia = bool(origen_id or ejemplo_id)
    new_id = execute(
        db,
        "INSERT INTO proyectos_codigo (usuario_id, nombre, board, contenido, es_copia, origen_id, origen_ejemplo_id) VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (user_id, body.nombre, body.board or BOARD_DEFAULT, body.contenido, 1 if es_copia else 0, origen_id, ejemplo_id),
    )
    rows = query(db, "SELECT * FROM proyectos_codigo WHERE id = %s", (new_id,))
    return {"ok": True, "proyecto": to_public_project(rows[0])}


@router.put("/proyectos-usuario/{proyecto_id}")
def update_proyecto_usuario(proyecto_id: int, body: ProyectoIn, user_id: int = Depends(require_auth), db=Depends(get_db)):
    if not query(db, "SELECT id FROM proyectos_codigo WHERE id = %s AND usuario_id = %s", (proyecto_id, user_id)):
        raise ApiError(404, "Proyecto no encontrado.")

    execute(
        db,
        "UPDATE proyectos_codigo SET nombre = COALESCE(%s, nombre), board = COALESCE(%s, board), contenido = COALESCE(%s, contenido) WHERE id = %s",
        (body.nombre, body.board, body.contenido, proyecto_id),
    )
    rows = query(db, "SELECT * FROM proyectos_codigo WHERE id = %s", (proyecto_id,))
    return {"ok": True, "proyecto": to_public_project(rows[0])}


@router.delete("/proyectos-usuario/{proyecto_id}")
def delete_proyecto_usuario(proyecto_id: int, user_id: int = Depends(require_auth), db=Depends(get_db)):
    execute(db, "DELETE FROM proyectos_codigo WHERE id = %s AND usuario_id = %s", (proyecto_id, user_id))
    return {"ok": True}
