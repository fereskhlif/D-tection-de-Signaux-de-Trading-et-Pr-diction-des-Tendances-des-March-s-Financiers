"""
AlphaML Backend — Router Comparaison + Historique + Recherche.

Trois endpoints REST :
  GET /api/history/{ticker}   → historique OHLCV d'un actif
  GET /api/compare            → comparaison multi-actifs normalisée
  GET /api/search             → recherche de tickers dans la base locale
"""
from __future__ import annotations

import csv
import logging
import os
from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import get_settings
from app.exceptions import AlphaMLBaseError
from app.schemas.comparison import ComparisonResponse
from app.schemas.history import HistoryResponse
from app.schemas.search import TickerResult
from app.services.comparison_service import ComparisonService
from app.services.yahoo_service import YahooService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Finance"])

# ──────────────────────────────────────────────────────────────────────────────
# Dépendances FastAPI (injection)
# ──────────────────────────────────────────────────────────────────────────────

def get_yahoo_service() -> YahooService:
    return YahooService()


def get_comparison_service(
    yahoo: YahooService = Depends(get_yahoo_service),
) -> ComparisonService:
    return ComparisonService(yahoo_service=yahoo)


# ──────────────────────────────────────────────────────────────────────────────
# Base locale de tickers (chargée une seule fois)
# ──────────────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_tickers_db() -> list[TickerResult]:
    """
    Charge la base de tickers depuis data/tickers.csv.

    La base est mise en cache au premier appel (lru_cache).
    Le chemin est relatif au répertoire de travail du backend.
    """
    settings = get_settings()
    csv_path = settings.tickers_csv_path

    # Essayer plusieurs emplacements
    candidates = [
        csv_path,
        os.path.join(os.path.dirname(__file__), "..", "..", csv_path),
        os.path.join(os.path.dirname(__file__), "..", "..", "data", "tickers.csv"),
    ]

    for path in candidates:
        abs_path = os.path.abspath(path)
        if os.path.isfile(abs_path):
            logger.info("Chargement de la base tickers depuis : %s", abs_path)
            return _parse_csv(abs_path)

    logger.warning("Fichier tickers.csv introuvable. Recherche limitée.")
    return []


def _parse_csv(path: str) -> list[TickerResult]:
    """Parse le CSV de tickers et retourne une liste de TickerResult."""
    results: list[TickerResult] = []
    try:
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    results.append(
                        TickerResult(
                            ticker=row.get("ticker", "").strip().upper(),
                            name=row.get("name", "").strip(),
                            exchange=row.get("exchange", "").strip(),
                            sector=row.get("sector", "").strip(),
                            industry=row.get("industry", "").strip(),
                            country=row.get("country", "").strip(),
                            currency=row.get("currency", "USD").strip(),
                            assetType=row.get("assetType", "Stock").strip(),
                        )
                    )
                except Exception:
                    pass
    except Exception as exc:
        logger.error("Erreur lors du parsing de tickers.csv : %s", exc)
    logger.info("Base tickers chargée : %d entrées", len(results))
    return results


def _search_tickers(query: str, limit: int = 20) -> list[TickerResult]:
    """
    Recherche insensible à la casse dans la base locale.

    Priorité :
      1. Correspondance exacte du ticker
      2. Ticker commence par la requête
      3. Nom commence par la requête
      4. Ticker ou nom contient la requête
    """
    db = _load_tickers_db()
    q = query.strip().lower()
    if not q:
        return []

    exact: list[TickerResult] = []
    ticker_starts: list[TickerResult] = []
    name_starts: list[TickerResult] = []
    contains: list[TickerResult] = []

    for t in db:
        ticker_l = t.ticker.lower()
        name_l = t.name.lower()

        if ticker_l == q:
            exact.append(t)
        elif ticker_l.startswith(q):
            ticker_starts.append(t)
        elif name_l.startswith(q):
            name_starts.append(t)
        elif q in ticker_l or q in name_l:
            contains.append(t)

    ranked = exact + ticker_starts + name_starts + contains
    return ranked[:limit]


# ──────────────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/history/{ticker}",
    response_model=HistoryResponse,
    summary="Historique OHLCV d'un actif",
)
async def get_history(
    ticker: str,
    period: Annotated[str, Query(description="Période : 7d, 15d, 30d, 60d, 90d, 6mo, 1y, 2y, 5y")] = "30d",
    interval: Annotated[str, Query(description="Intervalle : 1d, 1wk, 1mo")] = "1d",
    service: YahooService = Depends(get_yahoo_service),
) -> HistoryResponse:
    """
    Retourne l'historique complet (OHLCV + Adj Close) pour un ticker.

    - **ticker** : Symbole Yahoo Finance (ex: AAPL, BTC-USD, AIR.PA)
    - **period** : Fenêtre temporelle (défaut: 30d)
    - **interval** : Granularité (défaut: 1d)
    """
    settings = get_settings()
    ticker = ticker.upper().strip()

    if period not in settings.VALID_PERIODS:
        raise HTTPException(
            status_code=422,
            detail=f"Période '{period}' invalide. Valeurs acceptées : {settings.VALID_PERIODS}",
        )
    if interval not in settings.VALID_INTERVALS:
        raise HTTPException(
            status_code=422,
            detail=f"Intervalle '{interval}' invalide. Valeurs acceptées : {settings.VALID_INTERVALS}",
        )

    # Récupérer le nom depuis la base locale
    db = _load_tickers_db()
    name = next((t.name for t in db if t.ticker == ticker), "")

    try:
        return service.get_history(ticker, period, interval, name=name)
    except AlphaMLBaseError as exc:
        logger.warning("Erreur métier /history/%s : %s", ticker, exc.message)
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except Exception as exc:
        logger.error("Erreur inattendue /history/%s : %s", ticker, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur interne : {exc}") from exc


@router.get(
    "/compare",
    response_model=ComparisonResponse,
    summary="Comparaison multi-actifs normalisée",
)
async def compare(
    tickers: Annotated[str, Query(description="Tickers séparés par des virgules (max 5) : AAPL,MSFT,NVDA")] = "AAPL,MSFT,NVDA",
    period: Annotated[str, Query(description="Période : 7d, 15d, 30d, 60d, 90d, 6mo, 1y, 2y, 5y")] = "30d",
    interval: Annotated[str, Query(description="Intervalle : 1d, 1wk, 1mo")] = "1d",
    service: ComparisonService = Depends(get_comparison_service),
) -> ComparisonResponse:
    """
    Compare plusieurs actifs financiers sur une période donnée.

    Retourne :
    - **series** : Performances normalisées base 0 pour le graphique
    - **correlation** : Matrice de corrélation de Pearson (rendements journaliers)
    - **statistics** : Métriques financières par actif (vol, MDD, CAGR, Sharpe…)
    """
    settings = get_settings()
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]

    if not ticker_list:
        raise HTTPException(status_code=422, detail="Aucun ticker fourni.")

    if len(ticker_list) > settings.max_tickers:
        raise HTTPException(
            status_code=422,
            detail=f"Maximum {settings.max_tickers} tickers autorisés, {len(ticker_list)} fournis.",
        )

    if period not in settings.VALID_PERIODS:
        raise HTTPException(
            status_code=422,
            detail=f"Période '{period}' invalide. Valeurs acceptées : {settings.VALID_PERIODS}",
        )
    if interval not in settings.VALID_INTERVALS:
        raise HTTPException(
            status_code=422,
            detail=f"Intervalle '{interval}' invalide. Valeurs acceptées : {settings.VALID_INTERVALS}",
        )

    # Mapper les noms depuis la base locale
    db = _load_tickers_db()
    name_map = {t.ticker: t.name for t in db}
    ticker_names = {t: name_map.get(t, "") for t in ticker_list}

    try:
        return service.get_comparison(ticker_list, period, interval, ticker_names=ticker_names)
    except AlphaMLBaseError as exc:
        logger.warning("Erreur métier /compare : %s", exc.message)
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except Exception as exc:
        logger.error("Erreur inattendue /compare : %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur interne : {exc}") from exc


@router.get(
    "/search",
    response_model=list[TickerResult],
    summary="Recherche de tickers dans la base locale",
)
async def search_ticker(
    q: Annotated[str, Query(description="Terme de recherche : ticker ou nom d'actif")] = "",
) -> list[TickerResult]:
    """
    Recherche des actifs financiers dans la base locale (sans appel Yahoo Finance).

    - Insensible à la casse
    - Supporte les débuts de ticker ou de nom
    - Retourne au maximum 20 résultats classés par pertinence
    """
    if not q or len(q.strip()) < 1:
        return []

    settings = get_settings()
    results = _search_tickers(q.strip(), limit=settings.search_limit)
    return results
