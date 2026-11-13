import asyncio
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config import settings
from app.schemas import UploadIn

router = APIRouter(tags=["compiler"])

# Placas que el editor puede compilar (las mismas que src/api/placasArduino.js). Solo se aceptan estas:
# el valor llega del navegador y se pasa a arduino-cli.
FQBNS_PERMITIDOS = {
    "arduino:avr:uno",                      # Arduino Uno R3, EduBoard UNO, EduBoard UNO Actualizado
    "arduino:avr:nano",                     # Arduino Nano, EduBoard Profesional
    "arduino:avr:nano:cpu=atmega328old",    # Arduino Nano con bootloader antiguo
}

# Librería de la EduBoard (la misma del editor de bloques).
EDUWIT_LIB_DIR = Path(__file__).resolve().parent.parent.parent / "libraries" / "EduWit"
# Como en bloques, el código generado la incluye como "src/EduWit.h" (copia junto al sketch).
EDUWIT_INCLUDE_SRC = re.compile(r'#include\s+"src/EduWit\.h"')


async def _run(*args: str) -> tuple[str, str, int]:
    def _run_sync() -> tuple[str, str, int]:
        proc = subprocess.run(args, capture_output=True)
        return proc.stdout.decode(errors="replace"), proc.stderr.decode(errors="replace"), proc.returncode

    return await asyncio.to_thread(_run_sync)


@router.post("/compile")
async def compile_only(payload: UploadIn):
    fqbn = payload.board or settings.arduino_fqbn
    if fqbn not in FQBNS_PERMITIDOS:
        return JSONResponse(status_code=400, content={"error": f"Placa no soportada: {fqbn}"})

    with tempfile.TemporaryDirectory(prefix="ea-compile-", ignore_cleanup_errors=True) as tmp:
        sketch_dir = Path(tmp) / "sketch"
        sketch_dir.mkdir()
        sketch_file = sketch_dir / "sketch.ino"
        sketch_file.write_text(payload.code, encoding="utf-8")
        if EDUWIT_INCLUDE_SRC.search(payload.code):
            shutil.copytree(EDUWIT_LIB_DIR, sketch_dir / "src")

        output_dir = Path(tmp) / "build"
        output_dir.mkdir()

        args = ["arduino-cli", "compile", "--fqbn", fqbn, "--output-dir", str(output_dir)]
        # También funciona escribiendo #include <EduWit.h>.
        if EDUWIT_LIB_DIR.is_dir():
            args += ["--library", str(EDUWIT_LIB_DIR)]
        args.append(str(sketch_dir))

        try:
            _stdout, compile_err, compile_code = await _run(*args)
        except FileNotFoundError:
            return JSONResponse(
                status_code=500,
                content={"error": "arduino-cli no está instalado o no se encuentra en el PATH del servidor."},
            )

        if compile_code != 0:
            return JSONResponse(status_code=500, content={"error": compile_err or "Error de compilación"})

        hex_files = [f for f in output_dir.glob("*.ino.hex") if "with_bootloader" not in f.name]
        if not hex_files:
            return JSONResponse(
                status_code=500,
                content={"error": "La compilación no generó un archivo .hex."},
            )

        hex_content = hex_files[0].read_text(encoding="ascii")

    return {"hex": hex_content}
