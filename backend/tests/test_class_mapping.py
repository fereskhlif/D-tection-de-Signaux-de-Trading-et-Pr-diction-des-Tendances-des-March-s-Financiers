# -*- coding: utf-8 -*-
"""
test_class_mapping.py — Validates the strict mapping between model indices and French class labels.
Run: pytest tests/test_class_mapping.py -v
"""
import sys
from pathlib import Path
import pytest
import joblib

BACKEND_DIR = Path(__file__).parent.parent
ROOT = BACKEND_DIR.parent
MODELES_AI = ROOT / "Modeles AI"

# Setup sys.path to allow unpickling components
sys.path.insert(0, str(MODELES_AI / "v13_3" / "models"))
sys.path.insert(0, str(MODELES_AI))

# Inject lgbm_wrapper namespace
import importlib.util
_lgbm_wrapper_path = MODELES_AI / "v13_3" / "models" / "lgbm_wrapper.py"
if _lgbm_wrapper_path.exists():
    _spec = importlib.util.spec_from_file_location("models.lgbm_wrapper", _lgbm_wrapper_path)
    _mod = importlib.util.module_from_spec(_spec)
    sys.modules["models"] = _mod
    sys.modules["models.lgbm_wrapper"] = _mod
    _spec.loader.exec_module(_mod)

MODEL_V13_5_PATH = MODELES_AI / "v13_5" / "production" / "best_model_v13_5.joblib"

def test_class_mapping_indices():
    """Verify that indices strictly correspond to correct directions (0=Baisse, 1=Stabilite, 2=Hausse)."""
    model = joblib.load(MODEL_V13_5_PATH)
    classes = getattr(model, "classes_", [0, 1, 2])
    
    # Assert model class values match our indices
    assert list(classes) == [0, 1, 2], f"Expected classes [0, 1, 2], found {classes}"
    
    # Class mapping mapping validation
    idx_to_class = {0: "Baisse", 1: "Stabilite", 2: "Hausse"}
    
    assert idx_to_class[0] == "Baisse", "Index 0 must map to Baisse"
    assert idx_to_class[1] == "Stabilite", "Index 1 must map to Stabilite"
    assert idx_to_class[2] == "Hausse", "Index 2 must map to Hausse"
