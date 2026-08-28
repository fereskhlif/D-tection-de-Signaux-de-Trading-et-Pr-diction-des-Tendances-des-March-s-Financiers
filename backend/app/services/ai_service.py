# -*- coding: utf-8 -*-
import sys
import os
import joblib
import pandas as pd
import numpy as np
from typing import Dict, Any, List
import logging
from fastapi import HTTPException
from pathlib import Path
import json
import scipy.stats
import hashlib
from app.infrastructure.v13_2.logger import pipeline_logger as logger, prediction_logger
from app.infrastructure.v13_2.monitor import monitor
from app.infrastructure.v13_2.cache_manager import cache, get_yahoo_data, set_yahoo_data, get_features, set_features
from app.infrastructure.v13_2.startup_validator import validate_startup
from app.infrastructure.v13_2.validate_dataset import validate_dataset
from app.infrastructure.v13_2.validate_features import validate_features
from app.infrastructure.v13_2.confidence_calculator import compute_confidence_metrics
from app.services.yahoo_service import YahooService
from app.services.selective_decision_engine import selective_engine
import sys
# Import ledger conditionally to avoid circular issues
PROJECT_ROOT = Path(os.path.abspath(__file__)).parent.parent.parent.parent
sys.path.append(str(PROJECT_ROOT / "Modeles AI" / "v13_8" / "phase51"))
try:
    from _51_02_paper_trading_ledger import log_prediction
except ImportError:
    # If starting via uvicorn from backend/ directory, the script name cannot start with digit directly if imported like that.
    # Actually wait, let's use importlib
    import importlib.util
    _ledger_path = PROJECT_ROOT / "Modeles AI" / "v13_8" / "phase51" / "51_02_paper_trading_ledger.py"
    if _ledger_path.exists():
        _spec = importlib.util.spec_from_file_location("paper_trading_ledger", _ledger_path)
        _mod = importlib.util.module_from_spec(_spec)
        _spec.loader.exec_module(_mod)
        log_prediction = _mod.log_prediction
    else:
        log_prediction = None
DEFAULT_FALLBACK_DATASET = PROJECT_ROOT / "Modeles AI" / "dataset_ml_finance_complet.csv"
MODELES_AI_DIR = PROJECT_ROOT / "Modeles AI"
V12_9_DIR = MODELES_AI_DIR / "v12_9_trading_system"
V12_1_DIR = MODELES_AI_DIR / "v12_1"
V12_3_FEAT_DIR = MODELES_AI_DIR / "v12_3" / "feat_v12_3"
V13_3_DIR = MODELES_AI_DIR / "v13_3"
V13_3_2_DIR = MODELES_AI_DIR / "v13_3_2"
# ==============================================================================
# VERSION ACTIVE : V13.5 (Fallback: V13.4) + META V13.7
# ==============================================================================
ACTIVE_MODEL_VERSION = "V13.5"
V13_5_DIR            = MODELES_AI_DIR / "v13_5" / "production"
MODEL_V13_5_PATH     = V13_5_DIR / "best_model_v13_5.joblib"
CONFIG_V13_5_PATH    = V13_5_DIR / "v13_5_model_metadata.json"
V13_7_DIR            = MODELES_AI_DIR / "v13_7" / "phase38"
META_V13_7_PATH      = V13_7_DIR / "v13_7_meta_model.joblib"
MODEL_V13_3_2_PATH   = V13_3_2_DIR / "experiments" / "best_model_v13_3_2.joblib"
CONFIG_V13_3_2_PATH  = V13_3_2_DIR / "experiments" / "best_config_v13_3_2.json"
# ==============================================================================
# SMART ROUTER (Phase 29)
# ==============================================================================
SMART_ROUTER_ENABLED = False
SMART_ROUTER_MARGIN_THRESHOLD = 0.025
SMART_ROUTER_MODE = "abstention"
# Calibrateur : V13.2 (conserver intégralement, NE PAS réentraîner)
CALIBRATOR_V13_2_PATH = MODELES_AI_DIR / "v13_2" / "calibration" / "calibrator.joblib"
if str(V12_9_DIR) not in sys.path:
    sys.path.append(str(V12_9_DIR))
if str(V12_1_DIR) not in sys.path:
    sys.path.append(str(V12_1_DIR))
if str(V12_3_FEAT_DIR) not in sys.path:
    sys.path.append(str(V12_3_FEAT_DIR))
# Insert Modeles AI dir to allow importing v13_2 modules for unpickling
if str(MODELES_AI_DIR) not in sys.path:
    sys.path.insert(0, str(MODELES_AI_DIR))
# Insert V13.3 dir so LightGBMWrapper (models.lgbm_wrapper) peut etre deserialise
# (nécessaire même pour V13.3.2 car le calibrateur V13.2 peut référencer ce wrapper)
if str(V13_3_DIR) not in sys.path:
    sys.path.insert(0, str(V13_3_DIR))
# Injecter models.lgbm_wrapper dans sys.modules pour que pickle puisse le trouver
import importlib.util as _ilu
_lgbm_wrapper_path = V13_3_DIR / "models" / "lgbm_wrapper.py"
if _lgbm_wrapper_path.exists() and "models.lgbm_wrapper" not in sys.modules:
    try:
        _spec = _ilu.spec_from_file_location("models.lgbm_wrapper", _lgbm_wrapper_path)
        _mod  = _ilu.module_from_spec(_spec)
        sys.modules["models"] = sys.modules.get("models", _mod)  # namespace parent
        sys.modules["models.lgbm_wrapper"] = _mod
        _spec.loader.exec_module(_mod)
    except Exception as _e:
        import warnings
        warnings.warn(f"[ai_service] Impossible d'injecter models.lgbm_wrapper : {_e}")

# Injecter v13_2.calibration.calibrate_model dans sys.modules
_v13_2_calib_path = MODELES_AI_DIR / "v13_2" / "calibration" / "calibrate_model.py"
if _v13_2_calib_path.exists() and "v13_2.calibration.calibrate_model" not in sys.modules:
    try:
        _spec = _ilu.spec_from_file_location("v13_2.calibration.calibrate_model", _v13_2_calib_path)
        _mod  = _ilu.module_from_spec(_spec)
        sys.modules["v13_2"] = sys.modules.get("v13_2", _mod)
        sys.modules["v13_2.calibration"] = sys.modules.get("v13_2.calibration", _mod)
        sys.modules["v13_2.calibration.calibrate_model"] = _mod
        _spec.loader.exec_module(_mod)
    except Exception as _e:
        import warnings
        warnings.warn(f"[ai_service] Impossible d'injecter v13_2.calibration.calibrate_model : {_e}")

# Interrupteur de sécurité V13.2
USE_V13_2_CALIBRATION = True
V13_3_2_DEBUG = True

# Import V12 Modules
try:
    from config_v12_9 import (
        V13_3_MODEL_PATH, V12_8_BEAR_PATH, V12_8_BULL_PATH, V12_8_STABLE_PATH,
        DEFAULT_CONFIDENCE, CLASS_MAPPING
    )
    from risk_manager_v12_9 import calculate_atr, get_risk_metrics
    from trading_signal_v12_9 import generate_trading_signal
    
    from feature_engineering_v12_1 import compute_features
    from feature_engineering_v12_3 import compute_new_features
except ImportError as e:
    logger.error(f"Failed to import V12 modules: {e}")
    raise

# Dynamic Import of V13.3 modules to bypass FastAPI sys.path caching issues
_eval_path = V13_3_DIR / "evaluation" / "threshold_optimizer_v13_3.py"
_spec_eval = _ilu.spec_from_file_location("evaluation.threshold_optimizer_v13_3", _eval_path)
_mod_eval = _ilu.module_from_spec(_spec_eval)
sys.modules["evaluation"] = sys.modules.get("evaluation", _mod_eval)
sys.modules["evaluation.threshold_optimizer_v13_3"] = _mod_eval
_spec_eval.loader.exec_module(_mod_eval)
apply_thresholds = _mod_eval.apply_thresholds

_conf_path = MODELES_AI_DIR / "v13_2" / "calibration" / "confidence_engine.py"
_spec_conf = _ilu.spec_from_file_location("v13_2.calibration.confidence_engine", _conf_path)
_mod_conf = _ilu.module_from_spec(_spec_conf)
sys.modules["v13_2"] = sys.modules.get("v13_2", _mod_conf)
sys.modules["v13_2.calibration"] = sys.modules.get("v13_2.calibration", _mod_conf)
sys.modules["v13_2.calibration.confidence_engine"] = _mod_conf
_spec_conf.loader.exec_module(_mod_conf)
process_probabilities = _mod_conf.process_probabilities



class AIService:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AIService, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
            
        self.clf_model = None
        self.meta_model = None
        self.calibrator = None
        self.regressors = {}
        self.feature_names_clf = None
        self.feature_names_reg = None
        self.yahoo = YahooService()
        
        self.load_models()
        
        # V13.2 Startup Validator
        validate_startup(raise_on_error=True)
        self._initialized = True
        self.model_sha256 = self._compute_model_sha256()

    def _compute_model_sha256(self):
        try:
            if MODEL_V13_5_PATH.exists():
                with open(MODEL_V13_5_PATH, "rb") as f:
                    return hashlib.sha256(f.read()).hexdigest()
        except:
            pass
        return "UNKNOWN"

    def get_model_identity(self):
        return {
            "model_version": ACTIVE_MODEL_VERSION,
            "model_file": str(MODEL_V13_5_PATH.name) if MODEL_V13_5_PATH.exists() else "None",
            "model_path": str(MODEL_V13_5_PATH),
            "model_sha256": self.model_sha256,
            "feature_version": "51",
            "feature_count": len(self.feature_names_clf) if self.feature_names_clf else 0,
            "horizon": "H=5",
            "class_mapping": "C0 / C1 / C2",
            "selective_method": "NegEntropy",
            "threshold": selective_engine.threshold,
            "mode": "PAPER_TRADING"
        }

    def get_model_metadata(self):
        """Safe metadata specifically for the frontend without sensitive paths."""
        return {
            "model_name": "LightGBM",
            "model_version": ACTIVE_MODEL_VERSION,
            "model_type": type(self.clf_model).__name__ if self.clf_model else "LGBMClassifier",
            "prediction_horizon": "H5",
            "feature_count": len(self.feature_names_clf) if self.feature_names_clf else 51,
            "meta_model": "V13.7" if self.meta_model else None,
            "calibrator": "V13.2" if self.calibrator else None,
            "conditional_regressors": "V12.8" if hasattr(self, "regressors") else None,
            "selective_prediction": True,
            "performance": None
        }

    def load_models(self):
        """Loads V13.3.2 classifier + V13.2 calibrator into memory."""
        logger.info("=" * 60)
        logger.info("[AI MODEL]")
        logger.info(f"Version : {ACTIVE_MODEL_VERSION}")
        logger.info(f"Status  : ACTIVE")
        logger.info("=" * 60)
        logger.info(f"Loading {ACTIVE_MODEL_VERSION} AI models...")
        try:
            # ── Classifieur Principal (V13.5 avec fallback V13.3.2) ────────
            self.model_version_loaded = ACTIVE_MODEL_VERSION
            
            if MODEL_V13_5_PATH.exists() and CONFIG_V13_5_PATH.exists():
                logger.info(f"Loading V13.5 model from {MODEL_V13_5_PATH}")
                self.clf_model = joblib.load(MODEL_V13_5_PATH)
                with open(CONFIG_V13_5_PATH) as f:
                    cfg = json.load(f)
                
                # Config has "feature_manifest" string which we skip, the model properties have the feature count
                # Let's extract feature names directly if available, otherwise just hardcode or read manifest
                # V13.5 config stores features via lightgbm or manifest
                manifest_path = V13_5_DIR / "V13.5_FEATURE_MANIFEST.json"
                if manifest_path.exists():
                    with open(manifest_path, "r") as mf:
                        mf_data = json.load(mf)
                        self.feature_names_clf = mf_data["feature_order"]
                else:
                    self.feature_names_clf = getattr(self.clf_model, "feature_name_", None)
                
                # No stability threshold for V13.5 as we use Argmax (Phase 40 strict rules)
                self.stab_th = 1.0  # Force argmax
                self.baisse_bonus = 0.0
                self.hausse_bonus = 0.0
                
                # Meta Model V13.7
                if META_V13_7_PATH.exists():
                    self.meta_model = joblib.load(META_V13_7_PATH)
                    logger.info(f"Loading V13.7 Meta-Model from {META_V13_7_PATH}")
                else:
                    logger.warning("V13.7 Meta-Model not found! Confidence will fallback.")
                
                with open(CONFIG_V13_3_2_PATH) as f:
                    cfg_v13_3_2 = json.load(f)
                self.feature_names_calib = cfg_v13_3_2.get("features", [])
                logger.info(f"[V13.5] Classifieur charge. Features: {len(self.feature_names_clf) if self.feature_names_clf else 'Unknown'}")
            else:
                logger.warning("V13.5 model or config not found. Falling back to V13.3.2.")
                self.model_version_loaded = "V13.3.2"
                if not MODEL_V13_3_2_PATH.exists():
                    raise RuntimeError(
                        f"[INTEGRATION ERROR] Modèle V13.3.2 introuvable : {MODEL_V13_3_2_PATH}\n"
                        f"NE PAS remplacer automatiquement par un autre modèle."
                    )
                self.clf_model = joblib.load(MODEL_V13_3_2_PATH)
                if hasattr(self.clf_model, "feature_name_"):
                    self.feature_names_clf = self.clf_model.feature_name_
                else:
                    self.feature_names_clf = self.clf_model.feature_name()
                logger.info(f"[V13.3.2] Classifieur charge : {MODEL_V13_3_2_PATH}")
                logger.info(f"[V13.3.2] Features : {len(self.feature_names_clf)} (attendu : 45)")
                if len(self.feature_names_clf) != 45:
                    raise RuntimeError(
                        f"[INTEGRATION ERROR] Nombre de features incorrect : "
                        f"{len(self.feature_names_clf)} (attendu 45)"
                    )
    
                # ── Configuration / Seuils V13.3.2 ──────────────────────────
                if not CONFIG_V13_3_2_PATH.exists():
                    raise RuntimeError(
                        f"[INTEGRATION ERROR] Config V13.3.2 introuvable : {CONFIG_V13_3_2_PATH}"
                    )
                with open(CONFIG_V13_3_2_PATH) as f:
                    cfg_v13_3_2 = json.load(f)
                self.feature_names_calib = cfg_v13_3_2.get("features", [])
                th_cfg = cfg_v13_3_2.get("threshold_config", {})
                self.stab_th     = th_cfg.get("stab_th", 0.38)
                self.baisse_bonus= th_cfg.get("baisse_bonus", 0.0)
                self.hausse_bonus= th_cfg.get("hausse_bonus", 0.0)
                logger.info(
                    f"[V13.3.2] Seuils : stab_th={self.stab_th}, "
                    f"baisse_bonus={self.baisse_bonus}, hausse_bonus={self.hausse_bonus}"
                )

            # ── Calibrateur V13.2 (conserver intégralement) ───────────────
            if not CALIBRATOR_V13_2_PATH.exists():
                raise RuntimeError(
                    f"[INTEGRATION ERROR] Calibrateur V13.2 introuvable : {CALIBRATOR_V13_2_PATH}"
                )
            self.calibrator = joblib.load(CALIBRATOR_V13_2_PATH)
            logger.info(f"[V13.2] Calibrateur charge : {CALIBRATOR_V13_2_PATH}")

            # ── Régresseurs V12.8 ─────────────────────────────────────────
            if Path(V12_8_BEAR_PATH).exists():
                self.regressors["Baisse"] = joblib.load(V12_8_BEAR_PATH)
                if hasattr(self.regressors["Baisse"], "feature_name_"):
                    self.feature_names_reg = self.regressors["Baisse"].feature_name_
                else:
                    self.feature_names_reg = self.regressors["Baisse"].feature_name()
            if Path(V12_8_BULL_PATH).exists():
                self.regressors["Hausse"] = joblib.load(V12_8_BULL_PATH)
            if Path(V12_8_STABLE_PATH).exists():
                self.regressors["Stabilite"] = joblib.load(V12_8_STABLE_PATH)

            logger.info("=" * 60)
            logger.info(f"[AI MODEL] {ACTIVE_MODEL_VERSION} — Chargement OK")
            logger.info("=" * 60)
        except Exception as e:
            logger.error(f"Error loading models: {e}")
            raise

    def _build_fallback_dataframe(self, ticker: str):
        """Fallback local si Yahoo Finance ne retourne pas de données."""
        dataset_path = DEFAULT_FALLBACK_DATASET
        if not dataset_path.exists():
            raise HTTPException(status_code=404, detail=f"No local dataset found for {ticker}")

        df = pd.read_csv(dataset_path)
        symbol_col = "Symbol" if "Symbol" in df.columns else "ticker"
        date_col = "Date" if "Date" in df.columns else "date"
        close_col = "Close" if "Close" in df.columns else "close"

        ticker_df = df[df[symbol_col].astype(str).str.upper() == ticker.upper()].copy()
        if ticker_df.empty:
            raise HTTPException(status_code=404, detail=f"No local data found for {ticker}")

        ticker_df = ticker_df[[date_col, close_col]].copy()
        ticker_df[date_col] = pd.to_datetime(ticker_df[date_col], errors="coerce")
        ticker_df = ticker_df.dropna().sort_values(date_col)
        ticker_df = ticker_df.set_index(date_col)
        ticker_df.columns = ["Close"]
        return ticker_df

    def _download_single_safe(self, ticker: str) -> pd.DataFrame:
        """Downloads a single ticker safely using YahooService.get_history, returning empty DF on failure."""
        try:
            resp = self.yahoo.get_history(ticker, "1y", "1d", name=ticker)
            if not resp or not resp.history:
                return pd.DataFrame()
            rows = []
            for h in resp.history:
                rows.append({
                    "Date": pd.Timestamp(h.date),
                    "Open": h.open,
                    "High": h.high,
                    "Low": h.low,
                    "Close": h.close,
                    "Adj Close": getattr(h, "adj_close", h.close),
                    "Volume": h.volume,
                })
            df = pd.DataFrame(rows).set_index("Date")
            df.index.name = "Date"
            return df
        except Exception as exc:
            logger.warning("Could not download %s: %s", ticker, exc)
            return pd.DataFrame()

    def build_live_features(self, ticker: str, df_sym: pd.DataFrame) -> pd.DataFrame:
        """
        Calculates all V12.4 and V12.8 features on the fly.
        """
        # Cache pour SPY
        df_spy = get_yahoo_data("SPY")
        if df_spy is None:
            df_spy = self._download_single_safe("SPY")
            set_yahoo_data("SPY", df_spy)

        # Cache pour QQQ
        df_qqq = get_yahoo_data("QQQ")
        if df_qqq is None:
            df_qqq = self._download_single_safe("QQQ")
            set_yahoo_data("QQQ", df_qqq)

        # 1. Base Features (V12.1)
        feat_base = compute_features(df_sym)
        feat_base.dropna(inplace=True)

        # 2. Enhanced Features (V12.3)
        df_sym_aligned = df_sym.loc[feat_base.index].copy()
        df_combined = pd.concat([df_sym_aligned, feat_base], axis=1)
        feat_new = compute_new_features(df_combined)

        # 3. Market Features
        market_feats = pd.DataFrame(index=feat_base.index)

        if not df_spy.empty:
            spy_c = df_spy["Close"]
            market_feats["SPY_ret_5"] = spy_c.pct_change(5)
            market_feats["SPY_ret_20"] = spy_c.pct_change(20)
            market_feats["VIX_var_proxy"] = spy_c.pct_change().rolling(20).std().pct_change(5)

        if not df_qqq.empty:
            qqq_c = df_qqq["Close"]
            market_feats["QQQ_ret_5"] = qqq_c.pct_change(5)

        df_final = pd.concat([feat_base, feat_new, market_feats], axis=1)
        df_final = df_final.loc[:, ~df_final.columns.duplicated()]
        df_final.ffill(inplace=True)

        # 4. Momentum Slopes (V13.4)
        fam_momentum = [f for f in df_final.columns if any(s.lower() in f.lower() for s in ['ret_1', 'ret_3', 'ret_5', 'ret_10', 'ret_15', 'return_1', 'return_3', 'return_5'])]
        
        e1_slopes = {}
        for k in [3, 5, 10]:
            sa = df_final[fam_momentum].diff(k) / k
            sa.columns = [f"{c}_slope_{k}" for c in fam_momentum]
            e1_slopes[k] = sa
            
        df_final = pd.concat([df_final] + list(e1_slopes.values()), axis=1)
        df_final.fillna(0, inplace=True)

        return df_final

    def get_prediction(self, ticker: str) -> Dict[str, Any]:
        """Runs live inference and returns a prediction payload."""
        monitor.start_operation(f"predict_{ticker}")
        logger.info(f"Début prédiction pour {ticker}")
        
        try:
            if self.clf_model is None:
                raise HTTPException(status_code=503, detail="AI Service is not fully initialized.")

            # 1. Cache Yahoo Data
            df_yahoo = get_yahoo_data(ticker)
            if df_yahoo is None:
                df_yahoo = self._download_single_safe(ticker)
                set_yahoo_data(ticker, df_yahoo)

            if df_yahoo.empty:
                raise HTTPException(status_code=404, detail=f"No Yahoo data found for {ticker}")

            # 2. Validation Dataset
            validate_dataset(df_yahoo, ticker_col="Symbol" if "Symbol" in df_yahoo.columns else "None")

            # 3. Cache Feature Engineering
            df_feat = get_features(ticker, df_yahoo, "v13.4")
            if df_feat is None:
                df_feat = self.build_live_features(ticker, df_yahoo)
                set_features(ticker, df_yahoo, "v13.4", df_feat)

            if len(df_feat) == 0:
                raise HTTPException(status_code=400, detail=f"Not enough clean feature data for '{ticker}'.")

            # 4. Validation Features
            X_last_clf = df_feat[self.feature_names_clf].iloc[[-1]]
            missing_clf = [f for f in self.feature_names_clf if f not in df_feat.columns]
            if missing_clf:
                raise Exception(f"Missing classifier features: {missing_clf}")
                
            validate_features(X_last_clf, self.feature_names_clf, context="clf_inference")
            
            X_last_reg = df_feat[self.feature_names_reg].iloc[[-1]]
            missing_reg = [f for f in self.feature_names_reg if f not in df_feat.columns]
            if missing_reg:
                raise Exception(f"Missing regression features: {missing_reg}")
                
            validate_features(X_last_reg, self.feature_names_reg, context="reg_inference")

            # Historique : on exclut les bougies sans cours de clôture (ex: journée en cours)
            hist_window = 60  # on envoie 60 jours max pour couvrir tous les modes (7/15/30/60)
            history_df = df_yahoo.iloc[-hist_window:]
            historical = []
            last_valid_close = None
            for idx, row in history_df.iterrows():
                val = row['Close']
                if pd.isna(val):
                    continue  # Ne jamais inclure de NaN dans l'historique
                fval = round(float(val), 2)
                historical.append({"date": idx.strftime("%Y-%m-%d"), "close": fval})
                last_valid_close = fval

            logger.info(f"Yahoo historical last close={last_valid_close}")

            last_date = df_yahoo.index[-1]
            # current_price = dernier cours valide (forward-fill) # Prix actuel pour le rapport
            current_price = float(df_yahoo['Close'].ffill().iloc[-1])
            if pd.isna(current_price) or current_price == 0:
                # Ultime fallback : dernier close non-null de l'historique
                current_price = last_valid_close or 0.0

            atr_all = calculate_atr(df_yahoo)
            current_atr = float(atr_all.iloc[-1])

            # ── Inférence V13.3.2 ─────────────────────────────────────────
            # Pipeline obligatoire :
            #   Probabilités brutes → Décision (seuils V13.3.2)
            #   Probabilités brutes → Calibration V13.2 → Confidence Engine
            if self.model_version_loaded in ["V13.4", "V13.5"]:
                clf_probs = self.clf_model.predict_proba(X_last_clf)
            else:
                clf_probs = self.clf_model.predict(X_last_clf)
            
            if USE_V13_2_CALIBRATION and self.calibrator is not None:
                logger.info(f"[AI MODEL] Version : {ACTIVE_MODEL_VERSION} | Status : ACTIVE | Calibrator : V13.2 | Features : 45")
                logger.info(f"Pipeline : Données → Modèle {self.model_version_loaded} → Seuils {self.model_version_loaded} → Confiance (Brutes) + Calibration V13.2 (diagnostic)")

                # ── Mapping classes ────────────────────────────────────────────
                # PHASE 52 FIX: Training mapping is 0=Baisse, 1=Stabilite, 2=Hausse
                # The previous mapping {0:Baisse,1:Hausse,2:Stabilite} was INCORRECT
                # (indices 1 and 2 were inverted). The SelectiveDecisionEngine was
                # already correct (targeting index 2 = Hausse via config.json).
                model_classes = getattr(self.clf_model, "classes_", [0, 1, 2])
                calib_classes = getattr(self.calibrator, "classes_", [0, 1, 2])
                idx_to_class  = {0: "Baisse", 1: "Stabilite", 2: "Hausse"}

                if V13_3_2_DEBUG:
                    logger.info("[CLASS MAPPING] (Phase 52 corrected)")
                    logger.info(f"  index 0 = Baisse    (model.classes_={model_classes})")
                    logger.info(f"  index 1 = Stabilite")
                    logger.info(f"  index 2 = Hausse    (calib.classes_={calib_classes})")

                # ── 1. Probabilités BRUTES → Décision V13.5 (Argmax) ───────────────────
                raw_probs_list = [float(p) for p in clf_probs[0]]

                logger.info("[PROBABILITY SOURCE] Décision=RAW | Affichage=RAW | Confiance=SIGNAL_STRENGTH")
                logger.info("[RAW PROBABILITIES] (idx: 0=Baisse, 1=Stabilite, 2=Hausse)")
                logger.info(f"  Baisse    (idx=0) = {raw_probs_list[0]:.4f}")
                logger.info(f"  Stabilite (idx=1) = {raw_probs_list[1]:.4f}")
                logger.info(f"  Hausse    (idx=2) = {raw_probs_list[2]:.4f}")
                logger.info(f"  Sum               = {sum(raw_probs_list):.4f}")

                if self.model_version_loaded == "V13.5":
                    # STRICT ARGMAX AS PER PHASE 40 RULES
                    predicted_index = int(np.argmax(raw_probs_list))
                    predicted_class = idx_to_class.get(predicted_index, "Stabilite")
                else:
                    y_pred = apply_thresholds(
                        [clf_probs[0]],
                        getattr(self, "stab_th", 0.38),
                        getattr(self, "baisse_bonus", 0.0),
                        getattr(self, "hausse_bonus", 0.0)
                    )
                    predicted_index = int(y_pred[0])
                    predicted_class = idx_to_class.get(predicted_index, "Stabilite")

                # Confiance brute et features Meta
                confidence_score_raw = raw_probs_list[predicted_index]
                raw_other_probs  = [p for i, p in enumerate(raw_probs_list) if i != predicted_index]
                raw_margin       = confidence_score_raw - max(raw_other_probs) if raw_other_probs else 0.0
                raw_entropy      = scipy.stats.entropy(raw_probs_list)
                
                # ── Nouveau Score de Confiance (Force du Signal) ──
                p_max = max(raw_probs_list)
                p_second = sorted(raw_probs_list)[-2]
                margin = p_max - p_second

                raw_signal_strength = 0.7 * p_max + 0.3 * margin
                display_confidence = 0.50 + 0.50 * raw_signal_strength
                display_confidence = min(1.0, max(0.0, display_confidence))

                confidence_score = display_confidence
                confidence_type = "SIGNAL_STRENGTH"
                confidence_model = "None"

                # Probabilités affichées = BRUTES (cohérentes avec la décision)
                # Phase 52 fix: index 1 = Stabilite, index 2 = Hausse
                display_probabilities = {
                    "Baisse":    raw_probs_list[0],
                    "Stabilite": raw_probs_list[1],
                    "Hausse":    raw_probs_list[2],
                }

                # ── 2. Calibration V13.2 (diagnostic uniquement) ────────────
                if self.calibrator is not None:
                    try:
                        calib_probs      = self.calibrator.predict_proba(X_last_clf[self.feature_names_calib])
                        calib_probs_list = [float(p) for p in calib_probs[0]]
                        # Phase 52 fix: index 1 = Stabilite, index 2 = Hausse
                        calibrated_probabilities = {
                            "Baisse":    calib_probs_list[0],
                            "Stabilite": calib_probs_list[1],
                            "Hausse":    calib_probs_list[2],
                        }
                        calib_conf         = calib_probs_list[predicted_index]
                        calib_other_probs  = [p for i, p in enumerate(calib_probs_list) if i != predicted_index]
                        calibrated_margin  = calib_conf - max(calib_other_probs) if calib_other_probs else 0.0

                        if V13_3_2_DEBUG:
                            logger.info("[CALIBRATED PROBABILITIES] (diagnostic — non utilisées pour la décision)")
                            logger.info(f"  Baisse    (idx=0) = {calib_probs_list[0]:.4f}")
                            logger.info(f"  Stabilite (idx=1) = {calib_probs_list[1]:.4f}")
                            logger.info(f"  Hausse    (idx=2) = {calib_probs_list[2]:.4f}")
                            logger.info(f"  Sum               = {sum(calib_probs_list):.4f}")
                    except Exception as e:
                        logger.error(f"Calibrator failed: {e}")
                        calibrated_probabilities = display_probabilities
                        calib_conf = confidence_score_raw
                        calibrated_margin = raw_margin
                else:
                    calibrated_probabilities = display_probabilities
                    calib_conf = confidence_score_raw
                    calibrated_margin = raw_margin

                # ── 3. Niveau de confiance ───────────
                if confidence_score < 0.60:
                    confidence_level = "Faible"
                elif confidence_score < 0.70:
                    confidence_level = "Modérée"
                elif confidence_score < 0.80:
                    confidence_level = "Bonne"
                elif confidence_score < 0.90:
                    confidence_level = "Élevée"
                else:
                    confidence_level = "Très élevée"

                logger.info(
                    f"[{self.model_version_loaded}] Ticker={ticker} | Pred={predicted_class} |\n"
                    f"Pmax={p_max:.4f} |\n"
                    f"Margin={margin:.4f} |\n"
                    f"RawSignalStrength={raw_signal_strength:.4f} |\n"
                    f"DisplayConfidence={display_confidence:.4f} |\n"
                    f"Level={confidence_level}"
                )

                # ── Variables exportées vers le payload ──────────────────────
                clf_signal     = predicted_class
                clf_confidence = confidence_score
                clf_probs_dict = display_probabilities   # BRUTES pour affichage

                prediction_result = {
                    "predicted_class": predicted_class,
                    "predicted_index": predicted_index,
                    "probability_source": "RAW",
                    "raw_probabilities": display_probabilities,
                    "calibrated_probabilities": calibrated_probabilities,
                    "raw_margin": raw_margin,
                    "calibrated_margin": calibrated_margin,
                    "confidence_score": confidence_score,
                    "confidence_level": confidence_level,
                    "confidence_type": confidence_type,
                    "confidence_model": confidence_model,
                    "calib_conf": calib_conf,
                    "model_version": self.model_version_loaded,
                    "calibrator_version": "V13.2 (diagnostic)",
                }

                conf_metrics = {
                    "raw_confidence": confidence_score_raw,
                    "margin": raw_margin,
                    "entropy": raw_entropy,
                    "confidence_level": confidence_level,
                    "prediction_quality": f"V13.5 Argmax | Confidence=SIGNAL_STRENGTH | {ACTIVE_MODEL_VERSION}",
                    "confidence_reason": (
                        f"SignalStrength={confidence_score:.3f} | "
                        f"RawMargin={margin:.3f} | Level={confidence_level}"
                    ),
                    "confidence_type": confidence_type,
                    "confidence_model": confidence_model
                }

                v13_2_extensions = {
                    "P1": confidence_score,
                    "P2": max(raw_other_probs) if raw_other_probs else 0.0,
                    "confidence_score": confidence_score,
                    "probabilities_calibrated": calibrated_probabilities,   # dispo pour debug
                    "prediction": predicted_class,
                    "model_version": self.model_version_loaded,
                    "prediction_result": prediction_result,
                }
            else:
                # V12.4 Raw Pipeline
                logger.info("Using V12.4 Raw Inference (V13.2 disabled)")
                clf_label = int(np.argmax(clf_probs, axis=1)[0])
                clf_confidence = float(clf_probs[0, clf_label])
                clf_signal = CLASS_MAPPING.get(clf_label, "Stabilite")
    
                # Phase 52 fix: index 1 = Stabilite, index 2 = Hausse
                clf_probs_dict = {
                    "Baisse":    float(clf_probs[0, 0]),
                    "Stabilite": float(clf_probs[0, 1]),
                    "Hausse":    float(clf_probs[0, 2])
                }
                conf_metrics = compute_confidence_metrics(clf_probs_dict)
                predicted_class = clf_signal

            # --- PHASE 50: SELECTIVE DECISION ENGINE ---
            selective_payload = selective_engine.process(raw_probs_list, model_version=self.model_version_loaded)
            
            router_decision = selective_payload["decision"]
            router_allowed = selective_payload["trade_allowed"]
            router_reason = selective_payload["reason"]
            router_risk = "PAPER_TRADING"  # Required by API contract
            router_status = selective_payload["decision"]
            
            # V13.5 Direction is NEVER modified by the Router
            original_clf_signal = clf_signal

            # Inférence Regressor (Toujours sur le signal original V13.5)
            predicted_return = 0.0
            if original_clf_signal in self.regressors:
                reg_model = self.regressors[original_clf_signal]
                predicted_return = float(reg_model.predict(X_last_reg)[0])

            logger.info(f"[{self.model_version_loaded}] Final Signal={original_clf_signal} | Return={predicted_return:.4f}")

            predicted_price = current_price * (1 + predicted_return)

            
            risk_metrics = get_risk_metrics(
                current_price, predicted_return, current_atr,
                "BUY" if original_clf_signal == "Hausse" else ("SELL" if original_clf_signal == "Baisse" else "HOLD")
            )

            forecast_date = last_date + pd.Timedelta(days=5)
            while forecast_date.weekday() > 4:
                forecast_date += pd.Timedelta(days=1)

            forecast = [{"date": forecast_date.strftime("%Y-%m-%d"), "predicted_close": round(predicted_price, 2)}]

            forecast = [{"date": forecast_date.strftime("%Y-%m-%d"), "predicted_close": round(predicted_price, 2)}]

            payload = {
                "ticker": ticker,
                "current_price": round(current_price, 2),
                "prediction_date": forecast_date.strftime("%Y-%m-%d"),
                "historical": historical,
                "forecast": forecast,
                "trend_prediction": {
                    "signal": original_clf_signal,
                    "confidence": round(clf_confidence, 4),
                    "decision": router_decision,
                    "risk_level": router_risk,
                    "trade_allowed": router_allowed,
                    "reason": router_reason,
                    "raw_confidence": conf_metrics["raw_confidence"],
                    "margin": conf_metrics["margin"],
                    "entropy": conf_metrics["entropy"],
                    "confidence_level": conf_metrics["confidence_level"],
                    "prediction_quality": conf_metrics["prediction_quality"],
                    "confidence_reason": conf_metrics["confidence_reason"],
                    "probabilities": {k: round(v, 4) for k, v in clf_probs_dict.items()},
                    "model_prediction": original_clf_signal,
                    "router_status": router_status,
                    "direction_model": self.model_version_loaded,
                    "confidence_model": conf_metrics.get("confidence_model", "None"),
                    "confidence_type": conf_metrics.get("confidence_type", "RAW"),
                    
                    # Phase 50 Explicit Metadata
                    "selective_enabled": selective_payload["selective_enabled"],
                    "confidence_pass": selective_payload["confidence_pass"],
                    "neg_entropy": selective_payload["neg_entropy"],
                    "threshold": selective_payload["threshold"],
                    "selective_signal": selective_payload["signal"]
                },
                "risk_management": {
                    "take_profit": round(risk_metrics["tp"], 2) if risk_metrics.get("tp") is not None else None,
                    "stop_loss": round(risk_metrics["sl"], 2) if risk_metrics.get("sl") is not None else None,
                    "risk_reward": round(risk_metrics["risk_reward"], 2) if risk_metrics.get("risk_reward") is not None else None
                }
            }
            
            # Inject V13.2 extensions if applicable
            if USE_V13_2_CALIBRATION and self.calibrator is not None:
                payload["trend_prediction"].update({
                    k: (round(v, 4) if isinstance(v, float) else v) for k, v in v13_2_extensions.items()
                })
            
            prediction_logger.info(
                f"ticker={ticker} | signal={clf_signal} | confidence={clf_confidence:.3f} | "
                f"price={current_price:.2f} | pred_price={predicted_price:.2f}"
            )
            
            # --- PHASE 51: PAPER TRADING LEDGER LOGGING ---
            if log_prediction is not None:
                try:
                    ledger_data = {
                        "ticker": ticker,
                        "model_version": self.model_version_loaded,
                        "model_sha256": self.model_sha256,
                        "feature_version": "51",
                        "P0": display_probabilities.get("Baisse", ""),
                        "P1": display_probabilities.get("Stabilite", ""),  # Phase 52 fix: idx1=Stabilite
                        "P2": display_probabilities.get("Hausse", ""),     # Phase 52 fix: idx2=Hausse
                        "prediction": predicted_index,
                        "prediction_label": predicted_class,
                        "neg_entropy": selective_payload["neg_entropy"],
                        "threshold": selective_payload["threshold"],
                        "confidence_pass": selective_payload["confidence_pass"],
                        "decision": selective_payload["decision"],
                        "signal": selective_payload["signal"],
                        "reason": selective_payload["reason"],
                        "entry_price": current_price
                    }
                    log_prediction(ledger_data)
                except Exception as ex:
                    logger.error(f"Failed to log paper trading prediction: {ex}")
            
            monitor.end_operation("success")
            return payload

        except Exception as e:
            logger.error(f"Error in get_prediction: {e}")
            monitor.end_operation("error", str(e))
            raise

# Global singleton instance
ai_service = AIService()
