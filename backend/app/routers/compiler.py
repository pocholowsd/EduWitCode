import asyncio
import base64
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
    "esp32:esp32:esp32",                    # ESP32 Dev Kit (ESP32 clásico) programado en C++
}

# ESP32 clásico: en vez de un .hex se graban 4 archivos en posiciones fijas de la flash.
# (Los ESP32-C3/S3 llevan el bootloader en 0x0; por ahora solo se ofrece el ESP32 clásico.)
ESP32_OFFSETS = {"bootloader": 0x1000, "partitions": 0x8000, "boot_app0": 0xE000, "app": 0x10000}

# Librería de la EduBoard (la misma del editor de bloques).
EDUWIT_LIB_DIR = Path(__file__).resolve().parent.parent.parent / "libraries" / "EduWit"
# Como en bloques, el código generado la incluye como "src/EduWit.h" (copia junto al sketch).
EDUWIT_INCLUDE_SRC = re.compile(r'#include\s+"src/EduWit\.h"')


async def _boot_app0() -> Path | None:
    """boot_app0.bin viene con el soporte de ESP32 instalado en arduino-cli (no lo genera la compilación)."""
    try:
        out, _err, code = await _run("arduino-cli", "config", "get", "directories.data")
    except FileNotFoundError:
        return None
    if code != 0 or not out.strip():
        return None
    base = Path(out.strip()) / "packages" / "esp32" / "hardware" / "esp32"
    candidatos = sorted(base.glob("*/tools/partitions/boot_app0.bin"), reverse=True) if base.is_dir() else []
    return candidatos[0] if candidatos else None


async def _archivos_esp32(output_dir: Path) -> list[dict] | str:
    """Devuelve los archivos a grabar (o un mensaje de error)."""
    def encontrar(sufijo: str) -> Path | None:
        return next(iter(output_dir.glob(f"*.ino.{sufijo}")), None)

    app = encontrar("bin")
    if not app:
        return "La compilación no generó el programa (.bin)."
    piezas = [
        ("bootloader", encontrar("bootloader.bin")),
        ("partitions", encontrar("partitions.bin")),
        ("boot_app0", await _boot_app0()),
        ("app", app),
    ]
    faltan = [nombre for nombre, ruta in piezas if ruta is None]
    if faltan:
        return f"Faltan archivos para grabar el ESP32: {', '.join(faltan)}."
    return [
        {"name": nombre, "offset": ESP32_OFFSETS[nombre], "dataBase64": base64.b64encode(ruta.read_bytes()).decode()}
        for nombre, ruta in piezas
    ]


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
        if fqbn.startswith("esp32:"):
            # "ESP32 Dev Module" no define LED_BUILTIN; en las DevKit el LED integrado está en el pin 2.
            # Así los ejemplos de Arduino (Blink, etc.) compilan igual que en el Uno.
            args += ["--build-property", "compiler.cpp.extra_flags=-DLED_BUILTIN=2"]
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

        if fqbn.startswith("esp32:"):
            archivos = await _archivos_esp32(output_dir)
            if isinstance(archivos, str):
                return JSONResponse(status_code=500, content={"error": archivos})
            return {"files": archivos}

        hex_files = [f for f in output_dir.glob("*.ino.hex") if "with_bootloader" not in f.name]
        if not hex_files:
            return JSONResponse(
                status_code=500,
                content={"error": "La compilación no generó un archivo .hex."},
            )

        hex_content = hex_files[0].read_text(encoding="ascii")

    return {"hex": hex_content}
