# -*- coding: utf-8 -*-
"""
V13.2 — Gestionnaire de Cache Intelligent
==========================================
"""
import hashlib
import time
from pathlib import Path
from typing import Optional, Any

import joblib
import pandas as pd

from .config_v13_2 import CACHE_DIR, CACHE_YAHOO_TTL_H, CACHE_FEATURES_TTL_H
from .logger import pipeline_logger as log


class CacheManager:
    def __init__(self, cache_dir: Path = CACHE_DIR):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(exist_ok=True, parents=True)

    def _get_path(self, key: str) -> Path:
        safe_key = hashlib.md5(key.encode("utf-8")).hexdigest()
        return self.cache_dir / f"{safe_key}.joblib"

    def get(self, key: str, max_age_hours: float) -> Optional[Any]:
        path = self._get_path(key)
        if not path.exists():
            return None

        mtime = path.stat().st_mtime
        age_hours = (time.time() - mtime) / 3600.0

        if age_hours > max_age_hours:
            log.info(f"[Cache] Clé '{key}' expirée ({age_hours:.1f}h > {max_age_hours}h)")
            return None

        try:
            obj = joblib.load(path)
            log.info(f"[Cache] HIT '{key}' (âge: {age_hours:.1f}h)")
            return obj
        except Exception as e:
            log.warning(f"[Cache] Erreur lecture '{key}' : {e}")
            return None

    def set(self, key: str, obj: Any) -> bool:
        path = self._get_path(key)
        try:
            joblib.dump(obj, path, compress=3)
            log.info(f"[Cache] SET '{key}'")
            return True
        except Exception as e:
            log.warning(f"[Cache] Erreur écriture '{key}' : {e}")
            return False


cache = CacheManager()


def _get_df_signature(df: pd.DataFrame) -> str:
    """Génère une signature unique basée sur la date max et le nombre de lignes."""
    if df is None or df.empty:
        return "empty"
    max_date = df.index.max() if isinstance(df.index, pd.DatetimeIndex) else "nodate"
    if isinstance(max_date, pd.Timestamp):
        max_date = max_date.strftime("%Y-%m-%d")
    return f"{max_date}_{len(df)}"


def get_yahoo_data(ticker: str) -> Optional[pd.DataFrame]:
    # Pour le yahoo download on n'a pas encore le df, on utilise la date courante.
    # Pour être précis et ne pas télécharger en boucle, on garde une clé simple avec TTL court.
    return cache.get(f"yahoo_{ticker}", CACHE_YAHOO_TTL_H)


def set_yahoo_data(ticker: str, df: pd.DataFrame) -> None:
    cache.set(f"yahoo_{ticker}", df)


def get_features(ticker: str, df_yahoo: pd.DataFrame, version: str) -> Optional[pd.DataFrame]:
    sig = _get_df_signature(df_yahoo)
    key = f"features_{ticker}_{sig}_{version}"
    return cache.get(key, CACHE_FEATURES_TTL_H)


def set_features(ticker: str, df_yahoo: pd.DataFrame, version: str, df: pd.DataFrame) -> None:
    sig = _get_df_signature(df_yahoo)
    key = f"features_{ticker}_{sig}_{version}"
    cache.set(key, df)
