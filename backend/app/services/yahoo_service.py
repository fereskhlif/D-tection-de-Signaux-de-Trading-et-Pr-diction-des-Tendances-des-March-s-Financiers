"""
AlphaML Backend — Service Yahoo Finance avec cache TTLCache.

Couche service qui orchestre le repository Yahoo avec mise en cache intelligente.
Responsabilité : gestion du cache + délégation au repository.
"""
from __future__ import annotations

import hashlib
import logging
import threading
from typing import Optional

import pandas as pd
from cachetools import TTLCache

from app.config import get_settings
from app.repositories.yahoo_repository import YahooRepository
from app.schemas.history import HistoricalPrice, HistoryResponse

logger = logging.getLogger(__name__)


def _cache_key(*args: str) -> str:
    """Génère une clé de cache déterministe par hachage SHA256."""
    raw = "|".join(str(a).upper() for a in args)
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _df_to_history_response(
    df: pd.DataFrame,
    ticker: str,
    name: str,
    period: str,
    interval: str,
) -> HistoryResponse:
    """Convertit un DataFrame Yahoo en HistoryResponse Pydantic."""
    records: list[HistoricalPrice] = []
    for idx, row in df.iterrows():
        try:
            date_str = str(idx.date()) if hasattr(idx, "date") else str(idx)[:10]
            records.append(
                HistoricalPrice(
                    date=date_str,
                    open=round(float(row.get("Open", 0) or 0), 4),
                    high=round(float(row.get("High", 0) or 0), 4),
                    low=round(float(row.get("Low", 0) or 0), 4),
                    close=round(float(row.get("Close", 0) or 0), 4),
                    adjClose=round(float(row.get("Adj Close", row.get("Close", 0)) or 0), 4),
                    volume=int(row.get("Volume", 0) or 0),
                )
            )
        except Exception as exc:
            logger.debug("Ligne ignorée pour %s à %s : %s", ticker, idx, exc)

    return HistoryResponse(
        ticker=ticker,
        name=name,
        period=period,
        interval=interval,
        history=records,
        count=len(records),
    )


class YahooService:
    """
    Service de téléchargement des données Yahoo Finance avec cache TTL.

    Utilise cachetools.TTLCache thread-safe pour éviter les téléchargements
    répétés dans la fenêtre de 10 minutes.
    """

    def __init__(self, repository: Optional[YahooRepository] = None) -> None:
        settings = get_settings()
        self._repository = repository or YahooRepository()
        self._cache: TTLCache = TTLCache(maxsize=512, ttl=settings.cache_ttl)
        self._lock = threading.Lock()
        logger.info("YahooService initialisé — TTL cache: %ds", settings.cache_ttl)

    def get_history(
        self,
        ticker: str,
        period: str,
        interval: str,
        name: str = "",
    ) -> HistoryResponse:
        """
        Retourne l'historique d'un ticker avec mise en cache.

        Args:
            ticker: Symbole boursier.
            period: Période (ex: "30d").
            interval: Intervalle (ex: "1d").
            name: Nom optionnel de l'actif.

        Returns:
            HistoryResponse avec l'historique complet.
        """
        key = _cache_key("history", ticker, period, interval)

        with self._lock:
            if key in self._cache:
                logger.debug("Cache HIT pour history/%s/%s/%s", ticker, period, interval)
                return self._cache[key]

        logger.debug("Cache MISS pour history/%s/%s/%s", ticker, period, interval)
        df = self._repository.download_single(ticker, period, interval)
        response = _df_to_history_response(df, ticker, name, period, interval)

        with self._lock:
            self._cache[key] = response

        return response

    def get_dataframes(
        self,
        tickers: list[str],
        period: str,
        interval: str,
    ) -> dict[str, pd.DataFrame]:
        """
        Télécharge les DataFrames bruts pour plusieurs tickers.

        Vérifie d'abord le cache pour chaque ticker individuellement,
        puis télécharge en batch les tickers manquants.

        Args:
            tickers: Liste de symboles boursiers.
            period: Période commune.
            interval: Intervalle commun.

        Returns:
            Dict {ticker: DataFrame} pour chaque ticker valide.
        """
        result: dict[str, pd.DataFrame] = {}
        missing: list[str] = []

        # Vérification du cache ticker par ticker
        for ticker in tickers:
            key = _cache_key("df", ticker, period, interval)
            with self._lock:
                if key in self._cache:
                    logger.debug("Cache DF HIT pour %s/%s/%s", ticker, period, interval)
                    result[ticker] = self._cache[key]
                else:
                    missing.append(ticker)

        if not missing:
            return result

        # Téléchargement batch des tickers manquants
        logger.info("Téléchargement batch de %d tickers: %s", len(missing), missing)
        downloaded = self._repository.download_multiple(missing, period, interval)

        # Mise en cache des résultats
        for ticker, df in downloaded.items():
            key = _cache_key("df", ticker, period, interval)
            with self._lock:
                self._cache[key] = df
            result[ticker] = df

        return result

    def invalidate(self, ticker: str, period: str, interval: str) -> None:
        """Invalide l'entrée de cache pour un ticker donné."""
        for prefix in ("history", "df"):
            key = _cache_key(prefix, ticker, period, interval)
            with self._lock:
                self._cache.pop(key, None)
        logger.info("Cache invalidé pour %s/%s/%s", ticker, period, interval)

    def cache_stats(self) -> dict[str, int]:
        """Retourne les statistiques du cache."""
        with self._lock:
            return {"size": len(self._cache), "maxsize": self._cache.maxsize}
