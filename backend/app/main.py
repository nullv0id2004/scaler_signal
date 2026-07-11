from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

    return app


app = create_app()
