"""
AlphaML Backend — Calcul de la matrice de corrélation de Pearson.

La corrélation est calculée sur les **rendements journaliers** (log-returns),
pas directement sur les prix bruts, conformément aux bonnes pratiques financières.
"""
from __future__ import annotations

import logging
from typing import Sequence

import numpy as np
import pandas as pd

from app.schemas.comparison import CorrelationCell

logger = logging.getLogger(__name__)


def _compute_returns(prices: Sequence[float]) -> np.ndarray:
    """
    Calcule les rendements logarithmiques journaliers.

    Args:
        prices: Série de prix.

    Returns:
        Array numpy des log-returns.
    """
    arr = np.array(prices, dtype=float)
    arr[arr <= 0] = np.nan  # Prix négatifs ou nuls → NaN
    # log-return : log(p_t / p_{t-1})
    with np.errstate(divide="ignore", invalid="ignore"):
        returns = np.diff(np.log(arr))
    return returns


def pearson_correlation(a: Sequence[float], b: Sequence[float]) -> float:
    """
    Calcule le coefficient de corrélation de Pearson entre deux séries.

    La corrélation est calculée sur les rendements (pas les prix).
    Les NaN sont exclus avant le calcul.

    Args:
        a: Première série de prix.
        b: Deuxième série de prix.

    Returns:
        Coefficient de corrélation [-1.0, 1.0]. Retourne 1.0 si a == b.
    """
    if len(a) < 2 or len(b) < 2:
        return 1.0 if a is b else float("nan")

    ret_a = _compute_returns(a)
    ret_b = _compute_returns(b)

    # Aligner sur la longueur minimale
    min_len = min(len(ret_a), len(ret_b))
    ret_a = ret_a[:min_len]
    ret_b = ret_b[:min_len]

    # Créer un masque commun pour exclure les NaN
    valid = np.isfinite(ret_a) & np.isfinite(ret_b)
    n_valid = valid.sum()

    if n_valid < 2:
        logger.warning("Pas assez de données valides pour calculer la corrélation")
        return float("nan")

    ra = ret_a[valid]
    rb = ret_b[valid]

    # Corrélation de Pearson manuelle pour contrôle total
    mean_a, mean_b = ra.mean(), rb.mean()
    da, db = ra - mean_a, rb - mean_b
    numerator = (da * db).sum()
    denom = np.sqrt((da**2).sum() * (db**2).sum())

    if denom == 0:
        return 1.0 if np.allclose(ra, rb) else 0.0

    corr = float(numerator / denom)
    return round(max(-1.0, min(1.0, corr)), 4)


def pearson_matrix(
    series_map: dict[str, list[float]],
) -> list[CorrelationCell]:
    """
    Calcule la matrice de corrélation complète pour N actifs.

    La matrice est symétrique : corr(A, B) == corr(B, A).
    La diagonale vaut toujours 1.0.

    Args:
        series_map: Dict {ticker: [prix...]}

    Returns:
        Liste aplatie de CorrelationCell (N × N cellules).
    """
    tickers = list(series_map.keys())
    n = len(tickers)
    cells: list[CorrelationCell] = []

    # Convertir en DataFrame aligné sur les indices communs pour robustesse
    df = pd.DataFrame(series_map)
    df = df.apply(pd.to_numeric, errors="coerce")

    for i, ticker_a in enumerate(tickers):
        for j, ticker_b in enumerate(tickers):
            if i == j:
                value = 1.0
            elif i > j:
                # Symétrie : retrouver la valeur déjà calculée
                for cell in cells:
                    if cell.ticker_a == ticker_b and cell.ticker_b == ticker_a:
                        value = cell.value
                        break
                else:
                    value = float("nan")
            else:
                prices_a = df[ticker_a].dropna().tolist()
                prices_b = df[ticker_b].dropna().tolist()
                value = pearson_correlation(prices_a, prices_b)

            cells.append(
                CorrelationCell(tickerA=ticker_a, tickerB=ticker_b, value=value)
            )

    logger.debug("Matrice de corrélation calculée pour %d tickers", n)
    return cells
