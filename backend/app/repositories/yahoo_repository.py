"""
AlphaML Backend — Repository Yahoo Finance.

Couche d'accès aux données brutes Yahoo Finance.
Responsabilité unique : télécharger les données et les convertir en DataFrame propre.

Compatibilité : yfinance >= 1.5.0
  - Le format MultiIndex est désormais (field, ticker) : niveau 0 = champ, niveau 1 = ticker.
  - group_by="ticker" est déprécié en v1.x.
  - curl_cffi gère automatiquement les cookies/crumb Yahoo.
"""
from __future__ import annotations

import logging
from typing import Optional

import pandas as pd
import yfinance as yf

from app.exceptions import InvalidTickerError, NoDataError, YahooConnectionError, YahooTimeoutError

logger = logging.getLogger(__name__)

# Mapping des périodes courtes vers les formats yfinance
PERIOD_MAP: dict[str, str] = {
    "7d": "7d",
    "15d": "1mo",   # yfinance ne supporte pas 15d directement → 1mo, on tronque ensuite
    "30d": "1mo",
    "60d": "3mo",
    "90d": "3mo",
    "6mo": "6mo",
    "1y": "1y",
    "2y": "2y",
    "5y": "5y",
}

# Nombre de jours réels pour la troncature après téléchargement
PERIOD_DAYS: dict[str, Optional[int]] = {
    "7d": 7,
    "15d": 15,
    "30d": 30,
    "60d": 60,
    "90d": 90,
    "6mo": None,  # pas de troncature
    "1y": None,
    "2y": None,
    "5y": None,
}


class YahooRepository:
    """
    Repository d'accès aux données Yahoo Finance via yfinance 1.5.x.

    yfinance 1.5.x retourne TOUJOURS un MultiIndex (field, ticker) :
      - Niveau 0 : champ  (Close, High, Low, Open, Volume)
      - Niveau 1 : ticker (AAPL, MSFT, NVDA…)

    Gère :
    - Le téléchargement single ou multi-tickers (yf.download)
    - La normalisation des colonnes MultiIndex
    - La troncature aux périodes exactes
    - Les erreurs réseau et de données
    """

    def download_single(
        self,
        ticker: str,
        period: str,
        interval: str,
    ) -> pd.DataFrame:
        """
        Télécharge l'historique d'un seul ticker.

        Args:
            ticker: Symbole boursier Yahoo Finance (ex: "AAPL", "BTC-USD").
            period: Période (ex: "30d", "1y").
            interval: Intervalle (ex: "1d", "1wk").

        Returns:
            DataFrame avec colonnes [Open, High, Low, Close, Adj Close, Volume]
            et index DatetimeIndex.

        Raises:
            InvalidTickerError: Ticker introuvable.
            NoDataError: Aucune donnée retournée.
            YahooConnectionError: Erreur réseau.
            YahooTimeoutError: Timeout.
        """
        yf_period = PERIOD_MAP.get(period, period)
        logger.info("Téléchargement Yahoo single : ticker=%s, period=%s, interval=%s", ticker, yf_period, interval)

        df = pd.DataFrame()

        # Tentative principale via yf.download
        try:
            raw = yf.download(
                tickers=ticker,
                period=yf_period,
                interval=interval,
                progress=False,
            )
            df = self._extract_single_from_raw(raw, ticker)
            logger.debug("yf.download single OK pour %s : %d lignes", ticker, len(df))
        except Exception as exc:
            err_str = str(exc).lower()
            if "timeout" in err_str or "timed out" in err_str:
                raise YahooTimeoutError(ticker) from exc
            logger.warning("yf.download single failed for %s: %s — trying Ticker.history fallback", ticker, exc)

        # Fallback : yf.Ticker.history (endpoint différent, souvent plus stable)
        if df.empty:
            try:
                logger.debug("Fallback Ticker.history pour %s", ticker)
                t = yf.Ticker(ticker)
                raw = t.history(period=yf_period, interval=interval)
                df = self._normalize_columns(raw)
            except Exception as exc:
                err_str = str(exc).lower()
                if "timeout" in err_str or "timed out" in err_str:
                    raise YahooTimeoutError(ticker) from exc
                raise YahooConnectionError(f"Erreur réseau pour '{ticker}': {exc}") from exc

        df = self._normalize_columns(df)

        if df.empty:
            raise NoDataError(ticker, period)

        df = self._validate_ticker(df, ticker)
        df = self._truncate_period(df, period)
        return df

    def download_multiple(
        self,
        tickers: list[str],
        period: str,
        interval: str,
    ) -> dict[str, pd.DataFrame]:
        """
        Télécharge l'historique de plusieurs tickers en une seule requête.

        Avec yfinance 1.5.x, yf.download() retourne un MultiIndex (field, ticker) :
          - Niveau 0 : champ  (Close, High, Low, Open, Volume)
          - Niveau 1 : ticker (AAPL, MSFT, NVDA)

        Args:
            tickers: Liste de symboles boursiers.
            period: Période commune.
            interval: Intervalle commun.

        Returns:
            Dict {ticker: DataFrame} avec un DataFrame par ticker valide.

        Raises:
            YahooConnectionError: Erreur réseau générale.
        """
        if len(tickers) == 1:
            try:
                df = self.download_single(tickers[0], period, interval)
                return {tickers[0]: df}
            except Exception as exc:
                logger.warning("Single download failed for %s: %s", tickers[0], exc)
                return {}

        yf_period = PERIOD_MAP.get(period, period)
        logger.info(
            "Téléchargement multi-tickers Yahoo : tickers=%s, period=%s, interval=%s",
            tickers, yf_period, interval,
        )

        raw = pd.DataFrame()
        try:
            raw = yf.download(
                tickers=tickers,
                period=yf_period,
                interval=interval,
                progress=False,
            )
            logger.debug(
                "yf.download multi OK — shape=%s, nlevels=%d",
                raw.shape,
                raw.columns.nlevels if not raw.empty else 0,
            )
        except Exception as exc:
            err_str = str(exc).lower()
            if "timeout" in err_str or "timed out" in err_str:
                raise YahooConnectionError(f"Timeout multi-tickers: {exc}") from exc
            raise YahooConnectionError(f"Erreur réseau multi-tickers: {exc}") from exc

        result: dict[str, pd.DataFrame] = {}

        # Si raw est vide, fallback aux téléchargements individuels
        if raw is None or raw.empty:
            logger.warning("yf.download multi returned empty — fallback to single downloads")
            for ticker in tickers:
                try:
                    df = self.download_single(ticker, period, interval)
                    result[ticker] = df
                except Exception as exc:
                    logger.warning("Single download fallback failed for %s: %s", ticker, exc)
            return result

        # ── Extraction par ticker ────────────────────────────────────────────
        # yfinance 1.5.x : MultiIndex (field, ticker)
        #   level 0 = 'Close', 'High', 'Low', 'Open', 'Volume'
        #   level 1 = 'AAPL', 'MSFT', 'NVDA'
        #
        # Pour un ticker donné, on fait raw.xs(ticker, axis=1, level=1)
        # ce qui donne un DataFrame avec colonnes = [Close, High, Low, Open, Volume]
        # ────────────────────────────────────────────────────────────────────

        if isinstance(raw.columns, pd.MultiIndex):
            # Identifier le niveau qui contient les tickers
            FIELD_NAMES = {"close", "high", "low", "open", "volume", "adj close", "adjclose"}
            level0_lower = {str(v).lower() for v in raw.columns.get_level_values(0).unique()}
            level0_is_fields = bool(level0_lower & FIELD_NAMES)

            # yfinance 1.5.x : level 0 = fields → tickers au level 1
            # yfinance 0.2.x : level 0 = tickers → fields au level 1
            ticker_level = 1 if level0_is_fields else 0

            logger.debug(
                "MultiIndex détecté : level0_sample=%s → ticker_level=%d",
                list(level0_lower)[:4], ticker_level,
            )

            available_tickers = set(raw.columns.get_level_values(ticker_level).unique())

            for ticker in tickers:
                try:
                    if ticker not in available_tickers:
                        logger.warning("Ticker '%s' absent du résultat multi-download — fallback single", ticker)
                        try:
                            df = self.download_single(ticker, period, interval)
                        except Exception as exc:
                            logger.warning("Single fallback failed for %s: %s", ticker, exc)
                            continue
                    else:
                        df = raw.xs(ticker, axis=1, level=ticker_level).copy()
                        df = self._normalize_columns(df)

                        if df.empty:
                            logger.warning("DataFrame vide pour '%s' après extraction — fallback single", ticker)
                            try:
                                df = self.download_single(ticker, period, interval)
                            except Exception as exc:
                                logger.warning("Single fallback failed for %s: %s", ticker, exc)
                                continue

                    df = self._truncate_period(df, period)
                    result[ticker] = df
                    logger.info("Ticker '%s' : %d points téléchargés", ticker, len(df))

                except Exception as exc:
                    logger.warning("Échec du traitement du ticker '%s': %s", ticker, exc)
                    continue
        else:
            # Pas de MultiIndex — cas inattendu, traiter comme single
            logger.warning("Résultat multi-download sans MultiIndex — traitement comme single")
            for ticker in tickers:
                try:
                    df = self.download_single(ticker, period, interval)
                    result[ticker] = df
                except Exception as exc:
                    logger.warning("Single fallback failed for %s: %s", ticker, exc)

        logger.info("download_multiple terminé : %d/%d tickers récupérés", len(result), len(tickers))
        return result

    # ──────────────────────────────────────────────────────────────
    # Méthodes privées
    # ──────────────────────────────────────────────────────────────

    @staticmethod
    def _extract_single_from_raw(raw: pd.DataFrame, ticker: str) -> pd.DataFrame:
        """
        Extrait le DataFrame d'un seul ticker depuis un raw yf.download.

        yfinance 1.5.x retourne un MultiIndex (field, ticker) même pour un seul ticker.
        """
        if raw is None or raw.empty:
            return pd.DataFrame()

        if not isinstance(raw.columns, pd.MultiIndex):
            # Déjà aplati (ne devrait pas arriver en v1.x mais gérons-le)
            return raw.copy()

        # Identifier le niveau ticker
        FIELD_NAMES = {"close", "high", "low", "open", "volume", "adj close", "adjclose"}
        level0_lower = {str(v).lower() for v in raw.columns.get_level_values(0).unique()}
        level0_is_fields = bool(level0_lower & FIELD_NAMES)
        ticker_level = 1 if level0_is_fields else 0

        available = set(raw.columns.get_level_values(ticker_level).unique())
        if ticker in available:
            return raw.xs(ticker, axis=1, level=ticker_level).copy()

        # Ticker not found in index — return as-is and let normalize handle it
        return raw.copy()

    @staticmethod
    def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
        """
        Normalise les noms de colonnes et supprime les lignes NaN.

        Gère les cas :
        - Colonnes déjà aplaties (ex: après xs())     → [Close, High, Low, Open, Volume]
        - MultiIndex résiduel (ex: (field, ticker))   → on aplatit level 0 (fields)
        - Noms non standard (ex: 'Adj Close' absent)  → on crée Adj Close = Close
        """
        if df is None or df.empty:
            return pd.DataFrame()

        # Aplatir si MultiIndex résiduel
        if isinstance(df.columns, pd.MultiIndex):
            FIELD_NAMES = {"close", "high", "low", "open", "volume", "adj close", "adjclose"}
            level0_lower = {str(v).lower() for v in df.columns.get_level_values(0).unique()}
            # Si level 0 contient des noms de champs → garder level 0
            if bool(level0_lower & FIELD_NAMES):
                df.columns = df.columns.get_level_values(0)
            else:
                df.columns = df.columns.get_level_values(1)

        # Standardiser les noms de colonnes (insensible à la casse et aux variantes)
        col_map: dict[str, str] = {}
        for col in df.columns:
            col_lower = str(col).lower().replace(" ", "_")
            if col_lower == "open":
                col_map[col] = "Open"
            elif col_lower == "high":
                col_map[col] = "High"
            elif col_lower == "low":
                col_map[col] = "Low"
            elif "adj" in col_lower and "close" in col_lower:
                col_map[col] = "Adj Close"
            elif col_lower == "close":
                col_map[col] = "Close"
            elif col_lower == "volume":
                col_map[col] = "Volume"

        df = df.rename(columns=col_map)

        # Conserver uniquement les colonnes utiles
        keep = [c for c in ["Open", "High", "Low", "Close", "Adj Close", "Volume"] if c in df.columns]
        df = df[keep]

        # Si Adj Close absent (yfinance 1.x ne retourne plus Adj Close par défaut), utiliser Close
        if "Adj Close" not in df.columns and "Close" in df.columns:
            df = df.copy()
            df["Adj Close"] = df["Close"]

        # Supprimer les lignes entièrement NaN et trier par date
        df = df.dropna(how="all")
        df = df.sort_index()

        return df

    @staticmethod
    def _validate_ticker(df: pd.DataFrame, ticker: str) -> pd.DataFrame:
        """
        Valide que le ticker retourne des données réelles.
        yfinance retourne parfois un DF non vide mais avec des prix NaN.
        """
        if "Close" in df.columns:
            valid_rows = df["Close"].notna() & (df["Close"] > 0)
            if not valid_rows.any():
                raise InvalidTickerError(ticker)
        return df

    @staticmethod
    def _truncate_period(df: pd.DataFrame, period: str) -> pd.DataFrame:
        """Tronque le DataFrame au nombre de jours exact si nécessaire."""
        n_days = PERIOD_DAYS.get(period)
        if n_days is not None and len(df) > n_days:
            df = df.iloc[-n_days:]
        return df
