import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import compiler, esp32

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("componentes-ems-backend")

app = FastAPI(title="EA Editor + EA Monitor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Error no controlado en %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "Ocurrió un error interno inesperado. Intenta de nuevo."},
    )


app.include_router(compiler.router, prefix="/api")
app.include_router(esp32.router, prefix="/api")

FIRMWARE_DIR = Path(__file__).resolve().parent.parent / "firmware"
app.mount("/api/firmware", StaticFiles(directory=FIRMWARE_DIR), name="firmware")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
