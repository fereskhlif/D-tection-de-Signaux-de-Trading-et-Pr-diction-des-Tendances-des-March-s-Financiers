# -*- coding: utf-8 -*-
"""
V13.2 — Générateur de Rapport Automatique
==========================================
"""
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

from .config_v13_2 import REPORTS_DIR
from .logger import pipeline_logger as log


def generate_final_report(context: str = "infrastructure_check") -> None:
    report_data: Dict[str, Any] = {
        "timestamp": datetime.now().isoformat(),
        "context": context,
        "Infrastructure": "V13.2_INFRA",
        "Versions": {},
        "Validation modèles": {},
        "Validation dataset": {},
        "Validation features": {},
        "Benchmark": {},
        "Performance": {},
        "Cache": {},
        "Stress Test": {},
        "Non Regression": {},
        "Reproductibilité": {},
        "API Validation": {},
        "End To End": {},
        "Conclusion": "A_DETERMINER"
    }
    
    # Validation Dataset
    ds_path = REPORTS_DIR / "dataset_validation_report.json"
    if ds_path.exists():
        with open(ds_path, "r", encoding="utf-8") as f:
            report_data["Validation dataset"] = json.load(f)
            
    # Validation Features
    feat_path = REPORTS_DIR / "feature_validation_report.json"
    if feat_path.exists():
        with open(feat_path, "r", encoding="utf-8") as f:
            report_data["Validation features"] = json.load(f)
            
    # Validation Modèle
    model_path = REPORTS_DIR / "startup_validation_report.json"
    if model_path.exists():
        with open(model_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            report_data["Validation modèles"] = data
            report_data["Versions"] = {k: v for k, v in data.items() if k.endswith("_version")}
            
    # Comparaison
    comp_path = REPORTS_DIR / "comparison_v12_vs_v13.json"
    if comp_path.exists():
        with open(comp_path, "r", encoding="utf-8") as f:
            report_data["Benchmark"] = json.load(f)
            
    # Déterminer la conclusion basique
    passed = True
    if report_data["Validation modèles"].get("passed") is False: passed = False
    if report_data["Validation dataset"].get("passed") is False: passed = False
    if report_data["Validation features"].get("passed") is False: passed = False
    
    report_data["Conclusion"] = "SUCCÈS" if passed else "ÉCHEC"
            
    out_file = REPORTS_DIR / f"final_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    try:
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
        log.info(f"[ReportGenerator] Rapport final consolidé -> {out_file.name}")
    except Exception as e:
        log.error(f"[ReportGenerator] Erreur génération rapport final : {e}")

