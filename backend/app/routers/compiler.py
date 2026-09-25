import asyncio
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config import settings
from app.schemas import UploadIn

router = APIRouter(tags=["compiler"])


async def _run(*args: str) -> tuple[str, str, int]:
    def _run_sync() -> tuple[str, str, int]:
        proc = subprocess.run(args, capture_output=True)
        return proc.stdout.decode(errors="replace"), proc.stderr.decode(errors="replace"), proc.returncode

    return await asyncio.to_thread(_run_sync)


@router.post("/compile")
async def compile_only(payload: UploadIn):
    fqbn = payload.board or settings.arduino_fqbn

    with tempfile.TemporaryDirectory(prefix="ea-compile-", ignore_cleanup_errors=True) as tmp:
        sketch_dir = Path(tmp) / "sketch"
        sketch_dir.mkdir()
        sketch_file = sketch_dir / "sketch.ino"
        sketch_file.write_text(payload.code, encoding="utf-8")

        output_dir = Path(tmp) / "build"
        output_dir.mkdir()

        try:
            _stdout, compile_err, compile_code = await _run(
                "arduino-cli", "compile", "--fqbn", fqbn, "--output-dir", str(output_dir), str(sketch_dir)
            )
        except FileNotFoundError:
            return JSONResponse(
                status_code=500,
                content={"error": "arduino-cli no está instalado o no se encuentra en el PATH del servidor."},
            )

        if compile_code != 0:
            return JSONResponse(status_code=500, content={"error": compile_err or "Error de compilación"})

        hex_files = list(output_dir.glob("*.ino.hex"))
        if not hex_files:
            return JSONResponse(
                status_code=500,
                content={"error": "La compilación no generó un archivo .hex."},
            )

        hex_content = hex_files[0].read_text(encoding="ascii")

    return {"hex": hex_content}
