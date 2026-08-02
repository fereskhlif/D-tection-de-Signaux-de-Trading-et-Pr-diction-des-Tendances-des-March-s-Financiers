"""
AlphaML Backend — Configuration centrale.

Charge les variables d'environnement depuis .env via pydantic-settings.
"""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Paramètres de l'application chargés depuis .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # API
    app_version: str = "1.0.0"
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"

    # Cache TTL en secondes (10 min par défaut)
    cache_ttl: int = 600

    # CORS
    cors_origins: str = "http://localhost:5173"

    # Limites
    max_tickers: int = 5
    search_limit: int = 20
    yahoo_timeout: int = 15  # secondes

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse la chaîne CORS_ORIGINS en liste."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # Périodes valides pour yfinance
    VALID_PERIODS: List[str] = [
        "7d", "15d", "30d", "60d", "90d", "6mo", "1y", "2y", "5y"
    ]

    # Intervalles valides
    VALID_INTERVALS: List[str] = ["1d", "1wk", "1mo"]

    # Chemin du fichier de tickers
    tickers_csv_path: str = "data/tickers.csv"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Retourne les paramètres singleton (mis en cache)."""
    return Settings()
