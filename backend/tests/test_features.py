# -*- coding: utf-8 -*-
"""
test_features.py — Validates the feature pipeline.
Run: pytest tests/test_features.py -v
"""
import sys
from pathlib import Path
import pytest
import pandas as pd
import numpy as np

BACKEND_DIR = Path(__file__).parent.parent
ROOT = BACKEND_DIR.parent

sys.path.insert(0, str(BACKEND_DIR))

from app.services.ai_service import ai_service

def test_feature_list_and_order():
    """Verify that feature_names_clf exactly matches V13.5 manifest order."""
    expected_order = [
        "Consec_bear", "Donchian_Width", "QQQ_ret_5", "SPY_ret_20",
        "EMA20_vs_EMA50", "Vol_20", "ATR_14_pct", "Body_Size",
        "Gap_pct", "ATR_14", "ROC_10", "Bollinger_Pos",
        "Lower_shadow_ratio", "VIX_var_proxy", "OBV",
        "Candle_body_ratio", "Lower_Shadow", "Bollinger_Width",
        "CCI_14", "Hist_Vol_20", "Upper_Shadow", "Donchian_Pos",
        "ADX_14", "Vol_Regime", "Consec_bull", "Variance_Ratio",
        "EMA_20", "MACD_Hist", "RSI_7", "MOM_10",
        "Relative_Vol", "MACD", "Choppiness", "Upper_shadow_ratio",
        "Close_vs_EMA20", "Vol_10", "ROC_5", "RSI_14",
        "OBV_norm", "ROC_20", "Volume_Ratio", "Vol_Ratio",
        "Close_vs_SMA50", "SPY_ret_5", "Hist_Vol_10",
        "QQQ_ret_5_slope_3", "SPY_ret_5_slope_3", "QQQ_ret_5_slope_5",
        "SPY_ret_5_slope_5", "QQQ_ret_5_slope_10", "SPY_ret_5_slope_10"
    ]
    
    assert ai_service.feature_names_clf == expected_order, "Features order mismatch with production model manifest"
    assert len(ai_service.feature_names_clf) == 51, f"Expected 51 features, got {len(ai_service.feature_names_clf)}"

def test_live_feature_generation():
    """Verify feature builder computes all required columns on dummy data."""
    # Create a dummy stock history (OHLCV)
    np.random.seed(42)
    dates = pd.date_range(start="2025-01-01", periods=100, freq="D")
    data = {
        "Open": np.random.uniform(100, 110, size=100),
        "High": np.random.uniform(110, 120, size=100),
        "Low": np.random.uniform(90, 100, size=100),
        "Close": np.random.uniform(100, 110, size=100),
        "Volume": np.random.randint(1000, 10000, size=100)
    }
    df = pd.DataFrame(data, index=dates)
    df.index.name = "Date"
    
    # Generate features
    df_feat = ai_service.build_live_features("AAPL", df)
    
    # Check features exist
    for feat in ai_service.feature_names_clf:
        assert feat in df_feat.columns, f"Missing feature: {feat}"
        # Ensure no remaining NaNs (features should be fully imputed)
        assert not df_feat[feat].isna().any(), f"NaNs detected in feature: {feat}"
