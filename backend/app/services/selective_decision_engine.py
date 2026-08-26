import json
import logging
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)

# Absolute path to production candidate config
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
PROD_CANDIDATE_DIR = PROJECT_ROOT / "Modeles AI" / "v13_8" / "phase49" / "production_candidate"
CONFIG_PATH = PROD_CANDIDATE_DIR / "config.json"
THRESHOLD_PATH = PROD_CANDIDATE_DIR / "threshold.json"

class SelectiveDecisionEngine:
    def __init__(self):
        self.config = self._load_json(CONFIG_PATH)
        self.threshold_data = self._load_json(THRESHOLD_PATH)
        self.threshold = self.threshold_data.get("threshold")
        self.target_class_idx = self._get_c2_index()
        self.selective_enabled = self.config.get("selective_enabled", True)

    def _load_json(self, path: Path) -> dict:
        if not path.exists():
            logger.error(f"Missing config file: {path}")
            return {}
        try:
            with open(path, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading {path}: {e}")
            return {}

    def _get_c2_index(self) -> int:
        classes = self.config.get("classes", {})
        for idx_str, name in classes.items():
            if "C2" in name or "Uptrend" in name or "Hausse" in name:
                return int(idx_str)
        # Default to 2 if not found, but we will validate during prediction
        return 2

    def compute_negentropy(self, probabilities: list) -> float:
        """
        Calculates NegEntropy strictly based on the Phase 49 formula.
        NegEntropy = sum( P_i * log(P_i + 1e-9) )
        """
        try:
            p = np.array(probabilities, dtype=float)
            if np.any(np.isnan(p)) or np.any(np.isinf(p)):
                return float('nan')
            p = np.clip(p, 0.0, 1.0)
            
            # NegEntropy formula verified in Phase 49
            neg_entropy = np.sum(p * np.log(p + 1e-9))
            return float(neg_entropy)
        except Exception as e:
            logger.error(f"NegEntropy calculation failed: {e}")
            return float('nan')

    def process(self, probabilities: list, model_version: str = "V14-H5") -> dict:
        """
        Takes raw probabilities [P0, P1, P2] and returns the decision payload.
        """
        fallback_response = {
            "decision": "ABSTAIN",
            "signal": "NONE",
            "reason": "Fallback: Unknown error",
            "confidence_pass": False,
            "selective_enabled": self.selective_enabled,
            "neg_entropy": None,
            "threshold": self.threshold,
            "trade_allowed": False
        }

        try:
            if not self.config or not self.threshold_data:
                fallback_response["reason"] = "Fallback: Missing configuration"
                return fallback_response

            if self.threshold is None:
                fallback_response["reason"] = "Fallback: Missing threshold"
                return fallback_response

            if len(probabilities) != 3:
                fallback_response["reason"] = f"Fallback: Invalid probability length ({len(probabilities)})"
                return fallback_response

            p_sum = sum(probabilities)
            if not (0.99 <= p_sum <= 1.01):
                fallback_response["reason"] = "Fallback: Probabilities do not sum to 1"
                return fallback_response

            neg_entropy = self.compute_negentropy(probabilities)
            if np.isnan(neg_entropy):
                fallback_response["reason"] = "Fallback: NaN NegEntropy"
                return fallback_response

            pred_idx = int(np.argmax(probabilities))
            
            # Validate C2 is correctly mapped to "Hausse" or "Uptrend"
            if self.target_class_idx != 2:
                # Based on the requirement to abstain on invalid class mapping
                fallback_response["reason"] = "Fallback: Invalid class mapping (C2 must be index 2)"
                return fallback_response

            is_c2 = (pred_idx == self.target_class_idx)
            is_confident = (neg_entropy >= self.threshold)

            if not self.selective_enabled:
                # If disabled, fallback to standard argmax logic but signal is ABSTAIN if paper trading isn't handled correctly
                # But requirement says Paper Trading is always true. We just output ACCEPT if C2.
                decision = "ACCEPT" if is_c2 else "ABSTAIN"
                signal = "LONG" if is_c2 else "NONE"
                reason = "Selective layer disabled. Direct model prediction."
                confidence_pass = True
            else:
                if is_c2 and is_confident:
                    decision = "ACCEPT"
                    signal = "LONG"
                    reason = "C2 prediction passed NegEntropy threshold"
                    confidence_pass = True
                elif is_c2 and not is_confident:
                    decision = "ABSTAIN"
                    signal = "NONE"
                    reason = "C2 prediction rejected by confidence threshold"
                    confidence_pass = False
                else:
                    decision = "ABSTAIN"
                    signal = "NONE"
                    reason = f"Prediction is not C2 (Index {pred_idx})"
                    confidence_pass = is_confident

            return {
                "decision": decision,
                "signal": signal,
                "reason": reason,
                "confidence_pass": bool(confidence_pass),
                "selective_enabled": self.selective_enabled,
                "neg_entropy": float(neg_entropy),
                "threshold": self.threshold,
                "trade_allowed": (decision == "ACCEPT")
            }

        except Exception as e:
            logger.error(f"SelectiveDecisionEngine process failed: {e}")
            fallback_response["reason"] = f"Fallback: Exception {str(e)}"
            return fallback_response

selective_engine = SelectiveDecisionEngine()
