"""
AlphaML Backend — Schemas Pydantic pour l'historique de prix.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class HistoricalPrice(BaseModel):
    """Un point de prix historique pour un actif financier."""

    date: str = Field(..., description="Date au format YYYY-MM-DD")
    open: float = Field(..., description="Prix d'ouverture")
    high: float = Field(..., description="Prix le plus haut")
    low: float = Field(..., description="Prix le plus bas")
    close: float = Field(..., description="Prix de clôture")
    adj_close: float = Field(..., alias="adjClose", description="Prix ajusté en clôture")
    volume: int = Field(..., description="Volume échangé")

    model_config = {"populate_by_name": True}


class HistoryResponse(BaseModel):
    """Réponse complète pour l'historique d'un ticker."""

    ticker: str = Field(..., description="Symbole boursier")
    name: str = Field(default="", description="Nom de l'actif")
    period: str = Field(..., description="Période demandée")
    interval: str = Field(..., description="Intervalle demandé")
    history: list[HistoricalPrice] = Field(
        default_factory=list, description="Liste chronologique des prix"
    )
    count: int = Field(default=0, description="Nombre de points de données")
