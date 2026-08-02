"""
AlphaML Backend — Schemas Pydantic pour la comparaison multi-actifs.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class ChartPoint(BaseModel):
    """Un point de données pour le graphique de performance normalisée."""

    date: str = Field(..., description="Date au format YYYY-MM-DD")
    value: float = Field(..., description="Performance normalisée en %")


class ComparisonSeries(BaseModel):
    """Série de données normalisées pour un actif financier."""

    ticker: str = Field(..., description="Symbole boursier")
    name: str = Field(default="", description="Nom de l'actif")
    data: list[ChartPoint] = Field(
        default_factory=list, description="Points de performance normalisée"
    )
    color: str = Field(default="#64748b", description="Couleur hexadécimale")


class Statistics(BaseModel):
    """Statistiques financières calculées pour un actif."""

    ticker: str
    total_return: float = Field(..., alias="totalReturn", description="Rendement total %")
    performance: float = Field(..., description="Performance sur la période %")
    volatility: float = Field(..., description="Volatilité annualisée %")
    avg_return: float = Field(..., alias="avgReturn", description="Rendement moyen journalier %")
    max_price: float = Field(..., alias="maxPrice", description="Prix maximum")
    min_price: float = Field(..., alias="minPrice", description="Prix minimum")
    max_drawdown: float = Field(..., alias="maxDrawdown", description="Drawdown maximum %")
    current_drawdown: float = Field(..., alias="currentDrawdown", description="Drawdown actuel %")
    std_dev: float = Field(..., alias="stdDev", description="Écart-type des rendements")
    sessions: int = Field(..., description="Nombre de séances")
    cagr: float = Field(..., description="Taux de croissance annuel composé %")
    sharpe: float = Field(..., description="Ratio de Sharpe (taux sans risque 0%)")

    model_config = {"populate_by_name": True}


class CorrelationCell(BaseModel):
    """Valeur d'une cellule dans la matrice de corrélation."""

    ticker_a: str = Field(..., alias="tickerA")
    ticker_b: str = Field(..., alias="tickerB")
    value: float = Field(..., description="Coefficient de corrélation de Pearson [-1, 1]")

    model_config = {"populate_by_name": True}


class ComparisonResponse(BaseModel):
    """Réponse complète pour l'endpoint /api/compare."""

    series: list[ComparisonSeries] = Field(
        default_factory=list, description="Séries normalisées pour le graphique"
    )
    correlation: list[CorrelationCell] = Field(
        default_factory=list, description="Matrice de corrélation aplatie"
    )
    statistics: list[Statistics] = Field(
        default_factory=list, description="Statistiques par ticker"
    )
    tickers: list[str] = Field(
        default_factory=list, description="Liste ordonnée des tickers"
    )
    period: str = Field(..., description="Période demandée")
    interval: str = Field(..., description="Intervalle demandé")
