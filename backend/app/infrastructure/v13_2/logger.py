# -*- coding: utf-8 -*-
"""
V13.2 — Logging Structuré
==========================
"""
import logging
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

from .config_v13_2 import LOG_LEVEL, LOG_FILE, PREDICTION_LOG


def _build_logger(name: str, log_file: Path, level: str = "INFO") -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    return logger


pipeline_logger   = _build_logger("alphaml.pipeline",   LOG_FILE,       LOG_LEVEL)
prediction_logger = _build_logger("alphaml.prediction", PREDICTION_LOG, LOG_LEVEL)


@contextmanager
def timed_step(logger: logging.Logger, step_name: str):
    logger.info(f"[START] {step_name}")
    t0 = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - t0
        logger.info(f"[END]   {step_name} - {elapsed:.3f}s")


def log_dataset_stats(logger: logging.Logger, df, label: str = "Dataset") -> None:
    try:
        n_rows = len(df)
        tickers = df["Symbol"].nunique() if "Symbol" in df.columns else "N/A"
        n_cols = len(df.columns)
        nan_count = int(df.isnull().sum().sum())
        logger.info(
            f"[{label}] lignes={n_rows} | tickers={tickers} | "
            f"colonnes={n_cols} | NaN={nan_count}"
        )
    except Exception as e:
        logger.warning(f"[{label}] Impossible de calculer les stats : {e}")


def log_features_stats(logger: logging.Logger, X, label: str = "Features") -> None:
    try:
        logger.info(
            f"[{label}] shape={X.shape} | NaN={int(X.isnull().sum().sum())} | "
            f"Inf={int((X == float('inf')).sum().sum())}"
        )
    except Exception as e:
        logger.warning(f"[{label}] Impossible de calculer les stats : {e}")
