import io
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile
from PIL import Image

from app.core.security import get_current_user
from app.models import User

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

# backend/uploads — anchored on this file's location so it's correct
# regardless of the process's current working directory.
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Save an uploaded file to local disk (dev) and return its metadata.
    Image dimensions are parsed with Pillow when the content looks like an
    image; non-images get width/height = null."""
    contents = await file.read()

    ext = Path(file.filename or "").suffix
    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOAD_DIR / stored_name
    dest.write_bytes(contents)

    mime = file.content_type or "application/octet-stream"
    width = height = None
    if mime.startswith("image/"):
        try:
            with Image.open(io.BytesIO(contents)) as img:
                width, height = img.size
        except Exception:
            pass

    return {
        "url": f"/uploads/{stored_name}",
        "mime": mime,
        "size": len(contents),
        "width": width,
        "height": height,
        "filename": file.filename or stored_name,
    }
