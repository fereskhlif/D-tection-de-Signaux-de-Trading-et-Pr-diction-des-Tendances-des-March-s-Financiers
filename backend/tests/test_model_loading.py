# -*- coding: utf-8 -*-
"""
test_model_loading.py — Tests that all production model files exist and load.
Run: pytest tests/test_model_loading.py -v
"""
import sys
import importlib.util
from pathlib import Path
import pytest
import joblib

BACKEND_DIR = Path(__file__).parent.parent
ROOT = BACKEND_DIR.parent
MODELES_AI = ROOT / "Modeles AI"

# Setup sys.path to allow unpickling components
sys.path.insert(0, str(MODELES_AI / "v13_3" / "models"))
sys.path.insert(0, str(MODELES_AI))

# Inject lgbm_wrapper namespace for unpickling calibrators/wrappers
_lgbm_wrapper_path = MODELES_AI / "v13_3" / "models" / "lgbm_wrapper.py"
if _lgbm_wrapper_path.exists():
    _spec = importlib.util.spec_from_file_location("models.lgbm_wrapper", _lgbm_wrapper_path)
    _mod = importlib.util.module_from_spec(_spec)
    sys.modules["models"] = _mod
    sys.modules["models.lgbm_wrapper"] = _mod
    _spec.loader.exec_module(_mod)

PRODUCTION_MODELS = {
    "V13.5 Classifier": MODELES_AI / "v13_5" / "production" / "best_model_v13_5.joblib",
    "V13.7 Meta-Confidence": MODELES_AI / "v13_7" / "phase38" / "v13_7_meta_model.joblib",
    "V13.2 Calibrator": MODELES_AI / "v13_2" / "calibration" / "calibrator.joblib",
    "V12.8 Bear": MODELES_AI / "v12_8_conditional_regression" / "models" / "lgb_regressor_bear_v12_8.joblib",
    "V12.8 Bull": MODELES_AI / "v12_8_conditional_regression" / "models" / "lgb_regressor_bull_v12_8.joblib",
    "V12.8 Stable": MODELES_AI / "v12_8_conditional_regression" / "models" / "lgb_regressor_stable_v12_8.joblib",
}

def test_all_files_exist():
    for name, path in PRODUCTION_MODELS.items():
        assert path.exists(), f"MISSING: {name} at {path}"

def test_v13_5_loads_and_has_51_features():
    m = joblib.load(PRODUCTION_MODELS["V13.5 Classifier"])
    fn = getattr(m, "feature_name_", None)
    if fn is None:
        fn = m.feature_name()
    assert len(fn) == 51, f"Expected 51 features, got {len(fn)}"

def test_v13_5_classes():
    m = joblib.load(PRODUCTION_MODELS["V13.5 Classifier"])
    assert list(m.classes_) == [0, 1, 2], f"Expected classes [0, 1, 2], got {m.classes_}"

def test_v12_8_loads():
    for name in ["V12.8 Bear", "V12.8 Bull", "V12.8 Stable"]:
        m = joblib.load(PRODUCTION_MODELS[name])
        assert hasattr(m, "predict")
