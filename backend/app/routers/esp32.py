from fastapi import APIRouter

router = APIRouter(tags=["esp32"])

FIRMWARE_MAP = {
    "ESP32": {"url": "/api/firmware/ESP32_GENERIC.bin", "offset": 0x1000},
    "ESP32-S3": {"url": "/api/firmware/ESP32_GENERIC_S3.bin", "offset": 0x0},
    "ESP32-C3": {"url": "/api/firmware/ESP32_GENERIC_C3.bin", "offset": 0x0},
}


@router.get("/esp32-firmware")
async def esp32_firmware():
    return FIRMWARE_MAP
