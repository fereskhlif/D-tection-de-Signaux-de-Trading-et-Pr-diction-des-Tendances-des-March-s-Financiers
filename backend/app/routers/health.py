"""
AlphaML Backend — Router Health.

Endpoint de vérification de l'état de l'API.
"""
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings
from app.services.ai_service import ai_service

router = APIRouter(prefix="/api", tags=["Health"])


class HealthResponse(BaseModel):
    status: str
    version: str

class ModelInfoResponse(BaseModel):
    model_name: str
    model_version: str
    model_type: str
    prediction_horizon: str
    feature_count: int
    meta_model: Optional[str]
    calibrator: Optional[str]
    conditional_regressors: Optional[str]
    selective_prediction: bool
    performance: Optional[float]


@router.get("/health", response_model=HealthResponse, summary="Vérification de l'état de l'API")
async def health_check() -> HealthResponse:
    """Retourne l'état opérationnel et la version de l'API."""
    settings = get_settings()
    return HealthResponse(status="ok", version=settings.app_version)

@router.get("/model/info", response_model=ModelInfoResponse, summary="Configuration dynamique du modèle AI")
async def model_info() -> ModelInfoResponse:
    """Retourne les métadonnées du modèle AI actif."""
    metadata = ai_service.get_model_metadata()
    return ModelInfoResponse(**metadata)
