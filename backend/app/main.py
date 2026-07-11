from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.auth import router as auth_router
from .api.conversations import router as conversations_router
from .api.messages import router as messages_router
from .api.uploads import UPLOAD_DIR
from .api.uploads import router as uploads_router
from .core.config import settings
from .ws.routes import router as ws_router


def create_app() -> FastAPI:
    app = FastAPI(title="Signal Clone API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    app.include_router(auth_router)
    app.include_router(conversations_router)
    app.include_router(messages_router)
    app.include_router(uploads_router)
    app.include_router(ws_router)

    app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

    return app


app = create_app()
