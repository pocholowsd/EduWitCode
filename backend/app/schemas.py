from typing import Optional

from pydantic import BaseModel


class UploadIn(BaseModel):
    code: str
    board: Optional[str] = None
