from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/.env, sin importar desde qué carpeta se arranque uvicorn (npm run dev lo hace desde la raíz).
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8")

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    arduino_fqbn: str = "arduino:avr:uno"

    # Cuentas y programas guardados: misma base de datos que el editor de bloques
    # (la tabla usuarios es compartida, así que las cuentas sirven en ambos).
    db_host: str = "localhost"
    db_port: int = 3306
    db_user: str = ""
    db_password: str = ""
    db_name: str = "eduwit_go"

    jwt_secret: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def db_configured(self) -> bool:
        return bool(self.db_user)


settings = Settings()
