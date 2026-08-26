# -*- coding: utf-8 -*-
"""
V13.2 — Validateur de Démarrage
===============================
"""
from __future__ import annotations
import json
import hashlib
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import joblib
import pandas as pd
import numpy as np
import lightgbm as lgb
import sklearn
import sys

from .config_v13_2 import (
    V13_3_MODEL_PATH,
    V12_8_BEAR_PATH,
    V12_8_BULL_PATH,
    V12_8_STABLE_PATH,
    REPORTS_DIR,
)
from .logger import pipeline_logger as log


@dataclass
class StartupValidationReport:
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    python_version: str = sys.version.split()[0]
    pandas_version: str = pd.__version__
    numpy_version: str = np.__version__
    lightgbm_version: str = lgb.__version__
    sklearn_version: str = sklearn.__version__
    joblib_version: str = joblib.__version__
    models_checked: List[dict] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    passed: bool = True

    def add_error(self, msg: str):
        self.errors.append(msg)
        self.passed = False
        log.error(f"[StartupValidator] ERROR — {msg}")

    def add_warning(self, msg: str):
        self.warnings.append(msg)
        log.warning(f"[StartupValidator] WARNING — {msg}")

    def save(self) -> None:
        path = REPORTS_DIR / "startup_validation_report.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(asdict(self), f, indent=2, ensure_ascii=False)
        log.info(f"[StartupValidator] Rapport sauvegardé -> {path}")


def _compute_file_hash(path: Path) -> str:
    """Calcule le SHA256 d'un fichier."""
    sha256_hash = hashlib.sha256()
    with open(path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def _check_model_file(path: Path, name: str, report: StartupValidationReport) -> Optional[object]:
    entry = {"name": name, "path": str(path), "exists": False, "loadable": False,
             "type": None, "size_mb": None, "hash": None}

    if not path.exists():
        report.add_error(f"Modèle '{name}' introuvable : {path}")
        report.models_checked.append(entry)
        return None

    entry["exists"] = True
    entry["size_mb"] = round(path.stat().st_size / 1_048_576, 2)
    entry["hash"] = _compute_file_hash(path)

    try:
        obj = joblib.load(path)
        entry["loadable"] = True
        entry["type"] = type(obj).__name__
        log.info(f"[StartupValidator] {name} chargé — type={entry['type']}, "
                 f"taille={entry['size_mb']} MB")
        report.models_checked.append(entry)
        return obj
    except Exception as exc:
        report.add_error(f"Impossible de charger '{name}' ({path}) : {exc}")
        report.models_checked.append(entry)
        return None


def validate_startup(raise_on_error: bool = True) -> StartupValidationReport:
    report = StartupValidationReport()
    log.info("[StartupValidator] Vérification des versions et modèles au démarrage...")
    
    log.info(f"[StartupValidator] Python: {report.python_version}, Pandas: {report.pandas_version}, "
             f"NumPy: {report.numpy_version}, LightGBM: {report.lightgbm_version}, "
             f"Scikit-Learn: {report.sklearn_version}, Joblib: {report.joblib_version}")

    paths_to_check = [
        (V13_3_MODEL_PATH,   "V13.3 Classifieur"),
        (V12_8_BEAR_PATH,    "V12.8 Régresseur Baisse"),
        (V12_8_BULL_PATH,    "V12.8 Régresseur Hausse"),
        (V12_8_STABLE_PATH,  "V12.8 Régresseur Stabilité"),
    ]

    loaded_models = {}
    for path, name in paths_to_check:
        obj = _check_model_file(path, name, report)
        if obj is not None:
            loaded_models[name] = obj

    clf = loaded_models.get("V12.4 Classifieur")
    if clf is not None:
        if not hasattr(clf, "predict"):
            report.add_error("V12.4 Classifieur : méthode 'predict' absente")

    for reg_name in ["V12.8 Régresseur Baisse", "V12.8 Régresseur Hausse", "V12.8 Régresseur Stabilité"]:
        reg = loaded_models.get(reg_name)
        if reg is not None and not hasattr(reg, "predict"):
            report.add_error(f"{reg_name} : méthode 'predict' absente")

    report.save()

    status = "PASSED [OK]" if report.passed else "FAILED [X]"
    log.info(
        f"[StartupValidator] {status} — {len(report.models_checked)} modèles vérifiés, "
        f"{len(report.errors)} erreur(s)"
    )

    if not report.passed and raise_on_error:
        raise RuntimeError(
            f"[StartupValidator] {len(report.errors)} modèle(s) invalide(s). "
            f"L'API ne peut pas démarrer. Détails : {report.errors}"
        )

    return report
