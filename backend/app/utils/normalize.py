"""
AlphaML Backend — Normalisation des prix.

Calcule la performance normalisée base 0 : ((prix / premier_prix) - 1) * 100
"""
from __future__ import annotations

import logging
from typing import Sequence

import numpy as np

logger = logging.getLogger(__name__)


def normalize_prices(prices: Sequence[float]) -> list[float]:
    """
    Normalise une série de prix en performance relative (%).

    La base est le premier prix non-NaN de la série.
    Formule : ((prix_actuel / premier_prix) - 1) × 100

    Args:
        prices: Séquence de prix (float). Peut contenir des NaN.

    Returns:
        Liste de performances en % (base 0 au premier point).
        Retourne une liste vide si la série est vide ou sans prix valide.

    Examples:
        >>> normalize_prices([150, 153, 147])
        [0.0, 2.0, -2.0]
    """
    if not prices:
        return []

    arr = np.array(prices, dtype=float)

    # Trouver le premier indice valide (non-NaN, non-nul)
    valid_mask = np.isfinite(arr) & (arr != 0)
    valid_indices = np.where(valid_mask)[0]

    if len(valid_indices) == 0:
        logger.warning("normalize_prices: aucun prix valide dans la série")
        return [float("nan")] * len(arr)

    base_idx = valid_indices[0]
    base = arr[base_idx]

    result = np.where(
        np.isfinite(arr),
        ((arr / base) - 1.0) * 100.0,
        np.nan,
    )

    return [round(float(v), 4) if np.isfinite(v) else float("nan") for v in result]


def normalize_series_map(
    series_map: dict[str, list[float]],
) -> dict[str, list[float]]:
    """
    Normalise un dictionnaire de séries de prix.

    Args:
        series_map: Dict {ticker: [prix...]}

    Returns:
        Dict {ticker: [performance_normalisée...]}
    """
    return {ticker: normalize_prices(prices) for ticker, prices in series_map.items()}
