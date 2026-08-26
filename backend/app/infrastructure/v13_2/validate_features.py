# -*- coding: utf-8 -*-
"""
V13.2 — Validateur des Features
================================
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import List

import numpy as np
import pandas as pd

from .config_v13_2 import REPORTS_DIR
from .logger import pipeline_logger as log


@dataclass
class FeatureValidationReport:
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    expected_count: int = 0
    actual_count: int = 0
    missing_features: List[str] = field(default_factory=list)
    extra_features: List[str] = field(default_factory=list)
    wrong_order: bool = False
    wrong_dtypes: List[str] = field(default_factory=list)
    duplicate_columns: List[str] = field(default_factory=list)
    nan_features: List[str] = field(default_factory=list)
    inf_features: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    passed: bool = True

    def add_error(self, msg: str):
        self.errors.append(msg)
        self.passed = False
        log.error(f"[FeatureValidation] ERROR — {msg}")

    def save(self) -> None:
        path = REPORTS_DIR / "feature_validation_report.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(asdict(self), f, indent=2, ensure_ascii=False)
        log.info(f"[FeatureValidation] Rapport sauvegardé -> {path}")


def validate_features(
    X: pd.DataFrame,
    expected_features: List[str],
    context: str = "inference",
    raise_on_error: bool = True,
) -> FeatureValidationReport:
    report = FeatureValidationReport()
    report.expected_count = len(expected_features)
    report.actual_count   = len(X.columns)

    log.info(
        f"[FeatureValidation] Contexte={context} | "
        f"attendues={report.expected_count} | reçues={report.actual_count}"
    )

    missing = [f for f in expected_features if f not in X.columns]
    if missing:
        report.missing_features = missing
        report.add_error(f"{len(missing)} feature(s) absente(s) : {missing[:10]}")

    extra = [f for f in X.columns if f not in expected_features]
    if extra:
        report.extra_features = extra
        report.add_error(f"{len(extra)} feature(s) inattendue(s) : {extra[:10]}")

    common = [f for f in expected_features if f in X.columns]
    actual_order = [f for f in X.columns if f in expected_features]
    if common != actual_order:
        report.wrong_order = True
        report.add_error("L'ordre exact des colonnes ne correspond pas.")

    duplicates = X.columns[X.columns.duplicated()].tolist()
    if duplicates:
        report.duplicate_columns = duplicates
        report.add_error(f"Colonnes dupliquées détectées : {duplicates}")

    wrong_dtypes = []
    for col in common:
        dtype = str(X[col].dtype)
        if not dtype.startswith("float") and not dtype.startswith("int") and not dtype.startswith("bool"):
            wrong_dtypes.append(f"{col}({dtype})")
    if wrong_dtypes:
        report.wrong_dtypes = wrong_dtypes
        report.add_error(f"Types inattendus (non-numériques) : {wrong_dtypes[:10]}")

    if common:
        nan_cols = X[common].columns[X[common].isnull().any()].tolist()
        if nan_cols:
            report.nan_features = nan_cols
            report.add_error(f"{len(nan_cols)} feature(s) avec NaN : {nan_cols[:10]}")

        numeric_cols = X[common].select_dtypes("number").columns
        inf_cols = numeric_cols[np.isinf(X[common][numeric_cols]).any()].tolist()
        if inf_cols:
            report.inf_features = inf_cols
            report.add_error(f"{len(inf_cols)} feature(s) avec valeurs Inf : {inf_cols[:10]}")

    report.save()

    status = "PASSED [OK]" if report.passed else "FAILED [X]"
    log.info(f"[FeatureValidation] {status} — {len(report.errors)} erreur(s)")

    if not report.passed and raise_on_error:
        raise ValueError(
            f"[FeatureValidation] Validation échouée ({len(report.errors)} erreur(s)). "
            f"Détails : {report.errors}"
        )

    return report
