import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import ApiError, migrate
from app.routers import compiler, cuentas, esp32, proyectos

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("componentes-ems-backend")


def preparar_base_de_datos() -> None:
    # Sin base de datos el editor sigue funcionando (compilar, subir); solo fallan cuentas y programas guardados.
    if not settings.db_configured:
        logger.warning("Base de datos sin configurar: cuentas y programas guardados no estarán disponibles.")
        return
    try:
        migrate()
    except Exception:
        logger.exception("No se pudo preparar la base de datos %s", settings.db_name)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await asyncio.to_thread(preparar_base_de_datos)
    yield


app = FastAPI(title="EA Editor + EA Monitor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"ok": False, "message": exc.message})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Error no controlado en %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "Ocurrió un error interno inesperado. Intenta de nuevo."},
    )


app.include_router(compiler.router, prefix="/api")
app.include_router(esp32.router, prefix="/api")
app.include_router(cuentas.router, prefix="/api")
app.include_router(proyectos.router, prefix="/api")

FIRMWARE_DIR = Path(__file__).resolve().parent.parent / "firmware"
app.mount("/api/firmware", StaticFiles(directory=FIRMWARE_DIR), name="firmware")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
