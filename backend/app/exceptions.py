"""
AlphaML Backend — Exceptions personnalisées.

Hiérarchie claire des erreurs métier pour une gestion propre des codes HTTP.
"""
from __future__ import annotations


class AlphaMLBaseError(Exception):
    """Classe de base pour toutes les exceptions AlphaML."""

    def __init__(self, message: str, status_code: int = 500) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class YahooConnectionError(AlphaMLBaseError):
    """Erreur de connexion à Yahoo Finance."""

    def __init__(self, message: str = "Impossible de se connecter à Yahoo Finance") -> None:
        super().__init__(message, status_code=503)


class InvalidTickerError(AlphaMLBaseError):
    """Ticker boursier invalide ou introuvable."""

    def __init__(self, ticker: str) -> None:
        super().__init__(
            f"Le ticker '{ticker}' est invalide ou introuvable sur Yahoo Finance",
            status_code=404,
        )
        self.ticker = ticker


class NoDataError(AlphaMLBaseError):
    """Aucune donnée disponible pour les paramètres donnés."""

    def __init__(self, ticker: str, period: str) -> None:
        super().__init__(
            f"Aucune donnée disponible pour '{ticker}' sur la période '{period}'",
            status_code=404,
        )
        self.ticker = ticker
        self.period = period


class YahooTimeoutError(AlphaMLBaseError):
    """Timeout lors de la requête Yahoo Finance."""

    def __init__(self, ticker: str) -> None:
        super().__init__(
            f"Timeout lors du téléchargement des données pour '{ticker}'",
            status_code=504,
        )
        self.ticker = ticker


class InvalidPeriodError(AlphaMLBaseError):
    """Période de temps invalide."""

    def __init__(self, period: str, valid_periods: list[str]) -> None:
        super().__init__(
            f"Période '{period}' invalide. Valeurs acceptées : {', '.join(valid_periods)}",
            status_code=422,
        )


class TooManyTickersError(AlphaMLBaseError):
    """Trop de tickers dans une seule requête."""

    def __init__(self, count: int, max_count: int) -> None:
        super().__init__(
            f"{count} tickers fournis, maximum autorisé : {max_count}",
            status_code=422,
        )
