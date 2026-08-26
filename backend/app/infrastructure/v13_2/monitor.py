# -*- coding: utf-8 -*-
"""
V13.2 — Monitoring et Métriques
================================
"""
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

import psutil

from .config_v13_2 import METRICS_DIR, REPORTS_DIR
from .logger import pipeline_logger as log


class SystemMonitor:
    def __init__(self):
        self.metrics: Dict[str, Any] = {
            "session_start": datetime.now().isoformat(),
            "operations": []
        }
        self._current_op: Optional[Dict[str, Any]] = None

    def start_operation(self, name: str) -> None:
        if self._current_op is not None:
            log.warning(f"[Monitor] L'opération '{self._current_op['name']}' est déjà en cours.")
        
        self._current_op = {
            "name": name,
            "start_time": time.perf_counter(),
            "start_mem_mb": self._get_memory_mb()
        }

    def end_operation(self, status: str = "success", error: Optional[str] = None) -> None:
        if self._current_op is None:
            return

        end_time = time.perf_counter()
        end_mem = self._get_memory_mb()
        
        op_data = {
            "name": self._current_op["name"],
            "duration_s": round(end_time - self._current_op["start_time"], 3),
            "mem_delta_mb": round(end_mem - self._current_op["start_mem_mb"], 2),
            "status": status,
            "timestamp": datetime.now().isoformat()
        }
        if error:
            op_data["error"] = error
            
        self.metrics["operations"].append(op_data)
        self._current_op = None
        
        log.info(f"[Monitor] Opération '{op_data['name']}' terminée en {op_data['duration_s']}s "
                 f"(Mem: {op_data['mem_delta_mb']:+} MB) - Statut: {status}")

    def _get_memory_mb(self) -> float:
        process = psutil.Process()
        return process.memory_info().rss / 1024 / 1024

    def save_metrics(self) -> None:
        self.metrics["session_end"] = datetime.now().isoformat()
        
        out_file = METRICS_DIR / f"metrics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        try:
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(self.metrics, f, indent=2, ensure_ascii=False)
            log.info(f"[Monitor] Métriques sauvegardées -> {out_file.name}")
        except Exception as e:
            log.error(f"[Monitor] Erreur sauvegarde métriques : {e}")

monitor = SystemMonitor()
