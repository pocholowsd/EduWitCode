from typing import Optional

import pymysql
from pymysql.cursors import DictCursor

from app.config import settings

ER_DUP_ENTRY = 1062


class ApiError(Exception):
    """Error que se responde como { ok: false, message }, igual que el servidor de bloques."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def connect():
    if not settings.db_configured:
        raise ApiError(503, "La base de datos no está configurada en el servidor (DB_USER, DB_PASSWORD...).")
    try:
        return pymysql.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            database=settings.db_name,
            charset="utf8mb4",
            cursorclass=DictCursor,
            autocommit=True,
        )
    except pymysql.err.OperationalError as exc:
        raise ApiError(503, f"No se pudo conectar con la base de datos: {exc.args[-1]}") from exc


def get_db():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def query(conn, sql: str, params: tuple = ()) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return list(cur.fetchall())


def execute(conn, sql: str, params: tuple = ()) -> int:
    """Ejecuta un INSERT/UPDATE/DELETE y devuelve el id insertado (si lo hay)."""
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.lastrowid


def is_dup_entry(exc: Exception) -> bool:
    return isinstance(exc, pymysql.err.IntegrityError) and exc.args[0] == ER_DUP_ENTRY


def migrate() -> None:
    conn = connect()
    try:
        # Misma definición final que crea el servidor de bloques: si ya existe, no se toca.
        execute(conn, """
            CREATE TABLE IF NOT EXISTS usuarios (
              id INT AUTO_INCREMENT PRIMARY KEY,
              nombre VARCHAR(120) NOT NULL,
              email VARCHAR(190) NOT NULL UNIQUE,
              password_hash VARCHAR(255) NOT NULL,
              avatar_url MEDIUMTEXT NULL,
              alias VARCHAR(30) NULL UNIQUE,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        # Columnas que el servidor de bloques agregó después (mismas comprobaciones que su migrate),
        # por si esta base no ha pasado todavía por la versión actual de bloques.
        def column(name: str) -> Optional[dict]:
            rows = query(
                conn,
                "SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = %s",
                (name,),
            )
            return rows[0] if rows else None

        # La foto de perfil se guarda como data URL, que no cabe en VARCHAR(500).
        if (column("avatar_url") or {}).get("DATA_TYPE") != "mediumtext":
            execute(conn, "ALTER TABLE usuarios MODIFY COLUMN avatar_url MEDIUMTEXT NULL")
        if column("alias") is None:
            execute(conn, "ALTER TABLE usuarios ADD COLUMN alias VARCHAR(30) NULL UNIQUE")

        # Programas de código (MicroPython / Arduino C). Separados de proyectos_usuario,
        # que guarda los bloques del otro editor.
        execute(conn, """
            CREATE TABLE IF NOT EXISTS proyectos_codigo (
              id INT AUTO_INCREMENT PRIMARY KEY,
              usuario_id INT NOT NULL,
              nombre VARCHAR(150) NOT NULL,
              board VARCHAR(80) NOT NULL DEFAULT 'MicroPython',
              contenido LONGTEXT NOT NULL,
              acceso ENUM('privado', 'publico', 'compartido') NOT NULL DEFAULT 'privado',
              codigo VARCHAR(32) NULL UNIQUE,
              es_copia TINYINT(1) NOT NULL DEFAULT 0,
              origen_id INT NULL,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              CONSTRAINT fk_proyectos_codigo_usuario FOREIGN KEY (usuario_id)
                REFERENCES usuarios(id) ON DELETE CASCADE,
              CONSTRAINT fk_proyectos_codigo_origen FOREIGN KEY (origen_id)
                REFERENCES proyectos_codigo(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
    finally:
        conn.close()
