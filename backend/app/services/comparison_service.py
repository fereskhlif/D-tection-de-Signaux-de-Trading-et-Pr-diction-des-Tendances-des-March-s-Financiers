"""
AlphaML Backend — Service de comparaison multi-actifs.

Orchestre : téléchargement → normalisation → statistiques → corrélation.
Responsabilité unique : assembler la réponse de comparaison complète.
"""
from __future__ import annotations

import logging

import pandas as pd

from app.config import get_settings
from app.exceptions import TooManyTickersError
from app.schemas.comparison import ChartPoint, ComparisonResponse, ComparisonSeries, CorrelationCell
from app.services.yahoo_service import YahooService
from app.utils.correlation import pearson_matrix
from app.utils.normalize import normalize_prices
from app.utils.statistics import compute_statistics

logger = logging.getLogger(__name__)

# Palette de couleurs pour les séries (cycle si plus de 10 tickers)
TICKER_COLORS: list[str] = [
    "#3b82f6",  # blue
    "#10b981",  # emerald
    "#f59e0b",  # amber
    "#a855f7",  # purple
    "#ef4444",  # red
    "#06b6d4",  # cyan
    "#ec4899",  # pink
    "#84cc16",  # lime
    "#f97316",  # orange
    "#6366f1",  # indigo
]


class ComparisonService:
    """
    Service d'orchestration de la comparaison financière multi-actifs.

    Utilise YahooService pour les données et les modules utils pour les calculs.
    """

    def __init__(self, yahoo_service: YahooService | None = None) -> None:
        self._yahoo = yahoo_service or YahooService()
        self._settings = get_settings()

    def get_comparison(
        self,
        tickers: list[str],
        period: str,
        interval: str,
        ticker_names: dict[str, str] | None = None,
    ) -> ComparisonResponse:
        """
        Produit la réponse de comparaison complète pour N actifs.

        Args:
            tickers: Liste de tickers (max MAX_TICKERS).
            period: Période de comparaison.
            interval: Intervalle de données.
            ticker_names: Dict optionnel {ticker: nom} pour l'affichage.

        Returns:
            ComparisonResponse avec series, correlation, statistics.

        Raises:
            TooManyTickersError: Si plus de MAX_TICKERS tickers.
        """
        max_t = self._settings.max_tickers
        if len(tickers) > max_t:
            raise TooManyTickersError(len(tickers), max_t)

        names = ticker_names or {}

        # 1. Télécharger les données en batch (une seule requête Yahoo)
        logger.info("Comparaison : tickers=%s, period=%s, interval=%s", tickers, period, interval)
        dataframes = self._yahoo.get_dataframes(tickers, period, interval)

        if not dataframes:
            logger.warning("Aucune donnée disponible pour les tickers: %s", tickers)
            return ComparisonResponse(
                series=[],
                correlation=[],
                statistics=[],
                tickers=tickers,
                period=period,
                interval=interval,
            )

        # 2. Extraire les séries de prix alignées sur les dates communes
        valid_tickers = list(dataframes.keys())

        # Aligner les séries sur l'index de dates commun
        aligned = self._align_series(dataframes)

        # 3. Construire les séries normalisées pour le graphique
        series_list: list[ComparisonSeries] = []
        prices_map: dict[str, list[float]] = {}

        for idx, ticker in enumerate(valid_tickers):
            if ticker not in aligned:
                continue

            price_series = aligned[ticker]
            prices = price_series.tolist()
            dates = [str(d.date()) if hasattr(d, "date") else str(d)[:10] for d in price_series.index]

            # Normaliser
            normalized = normalize_prices(prices)
            prices_map[ticker] = prices

            # Construire les ChartPoints
            chart_points = [
                ChartPoint(date=date, value=val)
                for date, val in zip(dates, normalized)
                if not (isinstance(val, float) and val != val)  # exclure NaN
            ]

            color = TICKER_COLORS[idx % len(TICKER_COLORS)]
            series_list.append(
                ComparisonSeries(
                    ticker=ticker,
                    name=names.get(ticker, ""),
                    data=chart_points,
                    color=color,
                )
            )

        # 4. Calculer les statistiques par ticker
        statistics_list = []
        for ticker in valid_tickers:
            if ticker not in prices_map:
                continue
            stats = compute_statistics(ticker, prices_map[ticker])
            statistics_list.append(stats)

        # 5. Calculer la matrice de corrélation
        corr_cells = []
        if len(prices_map) >= 2:
            corr_cells = pearson_matrix(prices_map)

        logger.info(
            "Comparaison terminée : %d séries, %d stats, %d cellules de corrélation",
            len(series_list),
            len(statistics_list),
            len(corr_cells),
        )

        return ComparisonResponse(
            series=series_list,
            correlation=corr_cells,
            statistics=statistics_list,
            tickers=valid_tickers,
            period=period,
            interval=interval,
        )

    @staticmethod
    def _align_series(dataframes: dict[str, pd.DataFrame]) -> dict[str, pd.Series]:
        """
        Aligne les DataFrames sur l'index de dates commun (intersection = jours où TOUS les
        tickers ont des données). Utilise la colonne "Adj Close" (fallback sur "Close").
        """
        series_dict: dict[str, pd.Series] = {}

        for ticker, df in dataframes.items():
            col = "Adj Close" if "Adj Close" in df.columns else "Close"
            if col not in df.columns:
                logger.warning("Aucune colonne de prix pour '%s'", ticker)
                continue
            s = df[col].dropna()
            if s.empty:
                logger.warning("Série vide pour '%s' après dropna", ticker)
                continue
            series_dict[ticker] = s

        if not series_dict:
            return {}

        # Aligner sur l'intersection des dates (inner join) :
        # évite les NaN introduits par l'union qui feraient supprimer des lignes entiers.
        # Les tickers avec des calendriers très différents (ex: actifs exotiques) peuvent
        # perdre quelques points — c'est acceptable pour la comparaison.
        combined = pd.DataFrame(series_dict).dropna(how="any")

        if combined.empty:
            # Si l'intersection est vide (calendriers incompatibles), tomber sur le forward-fill
            logger.warning("Intersection de dates vide — fallback sur union + ffill")
            combined = pd.DataFrame(series_dict).ffill().dropna(how="all")

        result: dict[str, pd.Series] = {}
        for ticker in series_dict:
            if ticker in combined.columns and not combined[ticker].empty:
                result[ticker] = combined[ticker]

        logger.debug(
            "_align_series : %d tickers alignés sur %d dates",
            len(result), len(combined)
        )
        return result
