"""
AlphaML Backend — Schemas Pydantic pour la recherche de tickers.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class TickerResult(BaseModel):
    """Résultat d'une recherche de ticker."""

    ticker: str = Field(..., description="Symbole boursier")
    name: str = Field(..., description="Nom complet de l'actif")
    exchange: str = Field(default="", description="Place boursière")
    sector: str = Field(default="", description="Secteur d'activité")
    industry: str = Field(default="", description="Industrie")
    country: str = Field(default="", description="Pays")
    currency: str = Field(default="USD", description="Devise")
    asset_type: str = Field(default="Stock", alias="assetType", description="Type d'actif")

    model_config = {"populate_by_name": True}
