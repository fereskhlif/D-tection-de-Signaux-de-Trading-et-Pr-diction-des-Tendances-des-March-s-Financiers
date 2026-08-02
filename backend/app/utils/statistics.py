"""
AlphaML Backend — Calcul des statistiques financières.

Calcule un ensemble complet de métriques pour chaque actif comparé.
"""
from __future__ import annotations

import logging
import math
from typing import Sequence

import numpy as np

from app.schemas.comparison import Statistics

logger = logging.getLogger(__name__)

# Taux sans risque annualisé pour le Sharpe Ratio (approximation)
RISK_FREE_RATE_DAILY = 0.0  # On utilise 0% pour simplifier


def _log_returns(prices: np.ndarray) -> np.ndarray:
    """Rendements logarithmiques journaliers."""
    with np.errstate(divide="ignore", invalid="ignore"):
        returns = np.diff(np.log(np.where(prices > 0, prices, np.nan)))
    return returns[np.isfinite(returns)]


def compute_max_drawdown(prices: np.ndarray) -> float:
    """
    Calcule le Maximum Drawdown (perte maximale depuis un pic).

    Returns:
        MDD en pourcentage négatif (ex: -25.3).
    """
    if len(prices) < 2:
        return 0.0

    cumulative_max = np.maximum.accumulate(prices)
    drawdowns = (prices - cumulative_max) / cumulative_max * 100.0
    return float(round(drawdowns.min(), 4))


def compute_current_drawdown(prices: np.ndarray) -> float:
    """
    Calcule le drawdown actuel depuis le dernier pic.

    Returns:
        Drawdown en % (négatif ou 0).
    """
    if len(prices) < 2:
        return 0.0

    peak = prices.max()
    current = prices[-1]
    if peak == 0:
        return 0.0
    return float(round((current - peak) / peak * 100.0, 4))


def compute_cagr(first_price: float, last_price: float, n_sessions: int) -> float:
    """
    Calcule le CAGR (Compound Annual Growth Rate).

    CAGR = (last / first)^(252 / n) - 1

    Returns:
        CAGR en % annualisé.
    """
    if first_price <= 0 or last_price <= 0 or n_sessions <= 0:
        return 0.0
    years = n_sessions / 252.0
    if years == 0:
        return 0.0
    cagr = ((last_price / first_price) ** (1.0 / years) - 1.0) * 100.0
    return float(round(cagr, 4))


def compute_sharpe(returns: np.ndarray, risk_free: float = RISK_FREE_RATE_DAILY) -> float:
    """
    Calcule le Ratio de Sharpe annualisé.

    Sharpe = (mean_return - risk_free) / std_return × sqrt(252)

    Returns:
        Sharpe Ratio (adimensionnel, arrondi à 4 décimales).
    """
    if len(returns) < 2:
        return 0.0
    std = returns.std()
    if std == 0:
        return 0.0
    sharpe = ((returns.mean() - risk_free) / std) * math.sqrt(252)
    return float(round(sharpe, 4))


def compute_statistics(ticker: str, prices: Sequence[float]) -> Statistics:
    """
    Calcule l'ensemble des statistiques financières pour un actif.

    Args:
        ticker: Symbole boursier.
        prices: Série chronologique de prix de clôture ajustés.

    Returns:
        Objet Statistics complet.
    """
    arr = np.array(prices, dtype=float)
    arr = arr[np.isfinite(arr) & (arr > 0)]

    if len(arr) == 0:
        logger.warning("compute_statistics: aucune donnée valide pour %s", ticker)
        return Statistics(
            ticker=ticker,
            totalReturn=0.0,
            performance=0.0,
            volatility=0.0,
            avgReturn=0.0,
            maxPrice=0.0,
            minPrice=0.0,
            maxDrawdown=0.0,
            currentDrawdown=0.0,
            stdDev=0.0,
            sessions=0,
            cagr=0.0,
            sharpe=0.0,
        )

    first_price = float(arr[0])
    last_price = float(arr[-1])
    n_sessions = len(arr)

    # Rendements journaliers log
    returns = _log_returns(arr)

    # Métriques de base
    total_return = round(((last_price / first_price) - 1.0) * 100.0, 4) if first_price != 0 else 0.0
    performance = total_return
    max_price = float(round(arr.max(), 4))
    min_price = float(round(arr.min(), 4))

    # Volatilité annualisée
    volatility = 0.0
    avg_return = 0.0
    std_dev = 0.0
    sharpe = 0.0

    if len(returns) > 1:
        avg_return = float(round(returns.mean() * 100.0, 4))
        std_dev = float(round(returns.std() * 100.0, 4))
        volatility = float(round(returns.std() * math.sqrt(252) * 100.0, 4))
        sharpe = compute_sharpe(returns)

    # Drawdown
    max_drawdown = compute_max_drawdown(arr)
    current_drawdown = compute_current_drawdown(arr)

    # CAGR
    cagr = compute_cagr(first_price, last_price, n_sessions)

    stats = Statistics(
        ticker=ticker,
        totalReturn=total_return,
        performance=performance,
        volatility=volatility,
        avgReturn=avg_return,
        maxPrice=max_price,
        minPrice=min_price,
        maxDrawdown=max_drawdown,
        currentDrawdown=current_drawdown,
        stdDev=std_dev,
        sessions=n_sessions,
        cagr=cagr,
        sharpe=sharpe,
    )

    logger.debug(
        "Stats pour %s : return=%.2f%%, vol=%.2f%%, sharpe=%.2f",
        ticker,
        total_return,
        volatility,
        sharpe,
    )
    return stats
