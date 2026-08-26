from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.services.ai_service import ai_service
from app.routers.auth import get_optional_current_user
from app.database import get_db
from app.models.historique import Historique
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Predictions"])

@router.get("/predictions/{ticker}")
def get_predictions(
    ticker: str,
    current_user = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Fetches V12.9 AI predictions for a given ticker, executing live Feature Engineering via Yahoo Finance.
    Saves to Historique if user is authenticated.
    """
    try:
        prediction_payload = ai_service.get_prediction(ticker.upper())
        
        if current_user:
            # Map prediction_index (0: Baisse, 1: Stabilite, 2: Hausse)
            # The payload contains 'predicted_index' in prediction_result for V13.2+
            # but we can get it from the signal mapping directly
            signal = prediction_payload["trend_prediction"]["signal"]
            mapping = {"Baisse": 0, "Stabilite": 1, "Hausse": 2}
            
            # Using original_clf_signal or fallback to mapping
            pred_index = mapping.get(signal, 1) # Default to Stabilite
            if "trend_prediction" in prediction_payload and "predicted_index" in prediction_payload.get("prediction_result", {}):
                pred_index = prediction_payload["prediction_result"]["predicted_index"]

            new_hist = Historique(
                user_id=current_user.id,
                ticker=prediction_payload["ticker"],
                prediction=pred_index,
                prediction_label=signal,
                confidence=prediction_payload["trend_prediction"]["confidence"],
                model_version=prediction_payload["trend_prediction"].get("model_prediction", "V14-H5"), # Using requested model version logic
                horizon=5
            )
            db.add(new_hist)
            db.commit()
            
        return prediction_payload
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting live prediction for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/predict")
def get_predict(
    ticker: str,
    current_user = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Alias for /predictions/{ticker} to match specific user requests.
    """
    return get_predictions(ticker, current_user, db)

