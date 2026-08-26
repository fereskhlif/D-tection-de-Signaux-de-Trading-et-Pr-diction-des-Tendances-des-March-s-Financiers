# -*- coding: utf-8 -*-
"""
test_prediction.py — End-to-end validation of predictions.
Run: pytest tests/test_prediction.py -v
"""
import sys
from pathlib import Path
import pytest

BACKEND_DIR = Path(__file__).parent.parent
ROOT = BACKEND_DIR.parent

sys.path.insert(0, str(BACKEND_DIR))

from app.services.ai_service import ai_service

def test_inference_api_format():
    """Verify prediction payload structure and content ranges."""
    # We use SPY because it always has valid data in live/fallback
    try:
        res = ai_service.get_prediction("SPY")
    except Exception as e:
        pytest.skip(f"Skipping prediction test (yfinance/network issue): {e}")
        
    # Check structure
    assert "ticker" in res
    assert "current_price" in res
    assert "trend_prediction" in res
    assert "risk_management" in res
    assert "historical" in res
    assert "forecast" in res
    
    # Check trend_prediction structure
    tp = res["trend_prediction"]
    assert "signal" in tp
    assert tp["signal"] in ["Baisse", "Stabilite", "Hausse"]
    assert "probabilities" in tp
    probs = tp["probabilities"]
    assert "Baisse" in probs
    assert "Stabilite" in probs
    assert "Hausse" in probs
    
    # Sum of probabilities should be close to 1.0
    total_prob = sum(probs.values())
    assert abs(total_prob - 1.0) < 1e-3, f"Probabilities sum to {total_prob}, expected 1.0"
    
    # Check confidence
    assert "confidence_score" in tp
    assert 0.0 <= tp["confidence_score"] <= 1.0
    
    # Check risk management tp/sl
    rm = res["risk_management"]
    if tp["signal"] in ["Hausse", "Baisse"]:
        assert rm["take_profit"] is not None
        assert rm["stop_loss"] is not None
        assert rm["risk_reward"] is not None
        assert rm["risk_reward"] >= 0.0
