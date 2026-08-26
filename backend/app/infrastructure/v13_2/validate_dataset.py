# -*- coding: utf-8 -*-
"""
V13.2 — Validateur du Dataset
==============================
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import List, Optional

import numpy as np
import pandas as pd

from .config_v13_2 import (
    REQUIRED_OHLCV_COLS,
    MIN_ROWS_PER_TICKER,
    MAX_NAN_PCT,
    MAX_INF_COUNT,
    MAX_PRICE_JUMP_PCT,
    REPORTS_DIR,
)
from .logger import pipeline_logger as log


@dataclass
class TickerIssue:
    ticker: str
    issue_type: str
    severity: str
    detail: str


@dataclass
class DatasetValidationReport:
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    n_rows: int = 0
    n_tickers: int = 0
    n_columns: int = 0
    missing_ohlcv_cols: List[str] = field(default_factory=list)
    nan_total: int = 0
    nan_pct: float = 0.0
    inf_total: int = 0
    ticker_issues: List[TickerIssue] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    passed: bool = True

    def add_error(self, msg: str):
        self.errors.append(msg)
        self.passed = False
        log.error(f"[DatasetValidation] ERROR — {msg}")

    def add_warning(self, msg: str):
        self.warnings.append(msg)
        log.warning(f"[DatasetValidation] WARNING — {msg}")

    def save(self) -> None:
        path = REPORTS_DIR / "dataset_validation_report.json"
        with open(path, "w", encoding="utf-8") as f:
            data = asdict(self)
            json.dump(data, f, indent=2, ensure_ascii=False)
        log.info(f"[DatasetValidation] Rapport sauvegardé -> {path}")


def validate_dataset(df: pd.DataFrame, ticker_col: str = "Symbol") -> DatasetValidationReport:
    report = DatasetValidationReport()
    if df.empty:
        report.add_error("Dataset vide")
        return report

    report.n_rows    = len(df)
    report.n_columns = len(df.columns)
    
    missing_cols = [c for c in REQUIRED_OHLCV_COLS if c not in df.columns]
    if missing_cols:
        report.missing_ohlcv_cols = missing_cols
        report.add_error(f"Colonnes OHLCV manquantes : {missing_cols}")
        report.save()
        return report

    report.nan_total = int(df[REQUIRED_OHLCV_COLS].isnull().sum().sum())
    report.nan_pct   = report.nan_total / max(report.n_rows * len(REQUIRED_OHLCV_COLS), 1)
    if report.nan_pct > MAX_NAN_PCT:
        report.add_error(f"Trop de NaN dans OHLCV : {report.nan_pct:.1%} > seuil {MAX_NAN_PCT:.1%}")

    report.inf_total = int(np.isinf(df[REQUIRED_OHLCV_COLS].select_dtypes("number")).sum().sum())
    if report.inf_total > MAX_INF_COUNT:
        report.add_error(f"{report.inf_total} valeurs Inf détectées dans OHLCV")

    if ticker_col not in df.columns:
        # Si on n'a pas de ticker_col, on suppose un single ticker
        tickers = ["Single"]
        df_copy = df.copy()
        df_copy[ticker_col] = "Single"
    else:
        tickers = df[ticker_col].unique()
        df_copy = df

    report.n_tickers = len(tickers)

    for t in tickers:
        sub = df_copy[df_copy[ticker_col] == t].copy()

        if len(sub) < MIN_ROWS_PER_TICKER:
            issue = TickerIssue(t, "FewRows", "WARNING", f"{len(sub)} lignes < {MIN_ROWS_PER_TICKER}")
            report.ticker_issues.append(issue)
            report.add_warning(f"[{t}] {issue.detail}")

        if "Volume" in sub.columns and (sub["Volume"] < 0).any():
            issue = TickerIssue(t, "Negative", "ERROR", f"{(sub['Volume'] < 0).sum()} volumes négatifs")
            report.ticker_issues.append(issue)
            report.add_error(f"[{t}] {issue.detail}")

        for col in ["Open", "High", "Low", "Close"]:
            if col in sub.columns and (sub[col] < 0).any():
                issue = TickerIssue(t, "Negative", "ERROR", f"{col} contient des valeurs négatives")
                report.ticker_issues.append(issue)
                report.add_error(f"[{t}] {issue.detail}")

        if "Date" in sub.columns:
            dup = sub["Date"].duplicated().sum()
            if dup > 0:
                issue = TickerIssue(t, "DupDate", "ERROR", f"{dup} dates dupliquées")
                report.ticker_issues.append(issue)
                report.add_error(f"[{t}] {issue.detail}")

            if not sub["Date"].is_monotonic_increasing:
                issue = TickerIssue(t, "NotSorted", "WARNING", "Dates non triées chronologiquement")
                report.ticker_issues.append(issue)
                report.add_warning(f"[{t}] {issue.detail}")
        elif isinstance(sub.index, pd.DatetimeIndex):
            dup = sub.index.duplicated().sum()
            if dup > 0:
                issue = TickerIssue(t, "DupDate", "ERROR", f"{dup} dates dupliquées (index)")
                report.ticker_issues.append(issue)
                report.add_error(f"[{t}] {issue.detail}")

        if "Close" in sub.columns and len(sub) > 1:
            returns = sub["Close"].pct_change().abs()
            jumps   = (returns > MAX_PRICE_JUMP_PCT).sum()
            if jumps > 0:
                issue = TickerIssue(t, "PriceJump", "WARNING", f"{jumps} variations journalières > {MAX_PRICE_JUMP_PCT:.0%}")
                report.ticker_issues.append(issue)
                report.add_warning(f"[{t}] {issue.detail}")

    report.save()
    status = "PASSED [OK]" if report.passed else "FAILED [X]"
    log.info(f"[DatasetValidation] {status} — {len(report.errors)} erreur(s)")
    return report
