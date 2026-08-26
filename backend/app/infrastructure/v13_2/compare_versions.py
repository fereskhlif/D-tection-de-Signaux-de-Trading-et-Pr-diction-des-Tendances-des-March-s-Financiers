# -*- coding: utf-8 -*-
"""
V13.2 — Comparaison Automatique des Versions
==============================================
"""
import json
from pathlib import Path
from typing import Dict, Any

from .config_v13_2 import BASELINE_V12_4, REPORTS_DIR
from .logger import pipeline_logger as log


def compare_with_baseline(current_metrics: Dict[str, Any]) -> Dict[str, Any]:
    comparison = {
        "baseline_version": "V12.4",
        "current_version": "V13.2_INFRA",
        "metrics": {}
    }
    
    for metric, base_val in BASELINE_V12_4.items():
        curr_val = current_metrics.get(metric)
        
        comp = {
            "baseline": base_val,
            "current": curr_val,
            "diff": None,
            "improved": None
        }
        
        if base_val is not None and curr_val is not None:
            diff = curr_val - base_val
            comp["diff"] = round(diff, 4)
            comp["improved"] = diff >= 0
            
        comparison["metrics"][metric] = comp
        
    return comparison


def generate_comparison_report(current_metrics: Dict[str, Any]) -> None:
    comp = compare_with_baseline(current_metrics)
    
    out_file = REPORTS_DIR / "comparison_v12_vs_v13.json"
    try:
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(comp, f, indent=2, ensure_ascii=False)
        log.info(f"[CompareVersions] Rapport de comparaison généré -> {out_file.name}")
        
        log.info("--- Résumé Comparaison V12.4 vs V13.2 ---")
        for m, data in comp["metrics"].items():
            if data["diff"] is not None:
                sign = "+" if data["diff"] >= 0 else ""
                log.info(f"  {m:20s}: {data['current']:.4f} ({sign}{data['diff']:.4f})")
    except Exception as e:
        log.error(f"[CompareVersions] Erreur génération rapport : {e}")
