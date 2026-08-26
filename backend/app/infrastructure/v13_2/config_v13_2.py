# -*- coding: utf-8 -*-
"""
V13.2 — Configuration Centrale de l'Infrastructure
====================================================
"""
from pathlib import Path
import os

BASE_DIR = Path(os.path.abspath(__file__)).parent.parent.parent.parent.parent / "Modeles AI"
V13_2_DIR = Path(__file__).parent

CACHE_DIR    = V13_2_DIR / "cache"
REPORTS_DIR  = V13_2_DIR / "reports"
LOGS_DIR     = V13_2_DIR / "logs"
TESTS_DIR    = V13_2_DIR / "tests"
METRICS_DIR  = V13_2_DIR / "metrics"

for _d in [CACHE_DIR, REPORTS_DIR, LOGS_DIR, TESTS_DIR, METRICS_DIR]:
    _d.mkdir(exist_ok=True, parents=True)

V13_3_DIR  = BASE_DIR / "v13_3"
V12_8_DIR  = BASE_DIR / "v12_8_conditional_regression"
V12_9_DIR  = BASE_DIR / "v12_9_trading_system"

V13_3_MODEL_PATH    = V13_3_DIR / "experiments" / "best_model_v13_3.joblib"
V12_8_BEAR_PATH     = V12_8_DIR / "models" / "lgb_regressor_bear_v12_8.joblib"
V12_8_BULL_PATH     = V12_8_DIR / "models" / "lgb_regressor_bull_v12_8.joblib"
V12_8_STABLE_PATH   = V12_8_DIR / "models" / "lgb_regressor_stable_v12_8.joblib"

CLASS_MAPPING  = {0: "Baisse", 1: "Stabilite", 2: "Hausse"}
CLASS_NAMES    = ["Baisse", "Stabilite", "Hausse"]

REQUIRED_OHLCV_COLS  = ["Open", "High", "Low", "Close", "Volume"]
MIN_ROWS_PER_TICKER  = 50
MAX_NAN_PCT          = 0.05
MAX_INF_COUNT        = 0
MAX_PRICE_JUMP_PCT   = 0.50

CACHE_VERSION        = "13.2.0"
CACHE_YAHOO_TTL_H    = 4
CACHE_FEATURES_TTL_H = 24

LOG_LEVEL            = "INFO"
LOG_FILE             = LOGS_DIR / "pipeline.log"
PREDICTION_LOG       = LOGS_DIR / "prediction.log"
