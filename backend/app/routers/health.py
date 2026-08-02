"""
AlphaML Backend — Router Health.

Endpoint de vérification de l'état de l'API.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings

router = APIRouter(prefix="/api", tags=["Health"])


class HealthResponse(BaseModel):
    status: str
    version: str


@router.get("/health", response_model=HealthResponse, summary="Vérification de l'état de l'API")
async def health_check() -> HealthResponse:
    """Retourne l'état opérationnel et la version de l'API."""
    settings = get_settings()
    return HealthResponse(status="ok", version=settings.app_version)
