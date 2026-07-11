from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.auth import router as auth_router
from .api.conversations import router as conversations_router
from .api.messages import router as messages_router
from .core.config import settings


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

    return app


app = create_app()
