# -*- coding: utf-8 -*-
import logging
from typing import Any, Dict
from fastapi import APIRouter, HTTPException, Query

from app.config_sectors import get_company_name, yf_to_display, display_to_yf
from app.services.yahoo_service import YahooService
from app.services.ai_service import ai_service
from app.services.indicator_service import indicator_service
import pandas as pd

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Stock Details"])
yahoo_service = YahooService()

@router.get("/stock/{ticker}", summary="Données agrégées complètes pour la page de détail d'une action")
def get_stock_detail(
    ticker: str,
    period: str = Query("1y", description="Période historique (ex: 1y, 6mo)"),
    horizon: int = Query(5, description="Horizon de prévision, non utilisé pour V13.3.2 directement mais conservé pour compatibilité")
) -> Dict[str, Any]:
    """
    Retourne les informations détaillées d'une action, avec :
    - Données de marché actuelles.
    - Historique des prix + Indicateurs de chart (RSI, MACD, etc.).
    - Prédiction exacte du modèle V13.3.2 existant.
    """
    ticker = ticker.upper().strip()
    display_ticker = yf_to_display(ticker) if yf_to_display(ticker) != ticker else ticker
    yf_ticker = display_to_yf(display_ticker)

    try:
        # 1. Fetch live historical data (includes current quote indirectly)
        # Using YahooService directly to get DataFrame (bypassing HistoryResponse for manipulation)
        df_dict = yahoo_service.get_dataframes([yf_ticker], period=period, interval="1d")
        if yf_ticker not in df_dict or df_dict[yf_ticker] is None or df_dict[yf_ticker].empty:
            raise HTTPException(status_code=404, detail=f"Données introuvables pour {ticker}")
        
        df = df_dict[yf_ticker]

        # 2. Compute charting indicators (only for display)
        df_indicators = indicator_service.compute_chart_indicators(df)

        # 3. AI Pipeline Prediction (V13.3.2) - Source unique de vérité
        prediction_payload = ai_service.get_prediction(yf_ticker)
        trend_pred = prediction_payload.get("trend_prediction", {})
        
        # 4. Format Output matching the user contract
        history_list = []
        for idx, row in df_indicators.iterrows():
            date_str = str(idx.date()) if hasattr(idx, "date") else str(idx)[:10]
            history_list.append({
                "date": date_str,
                "open": round(float(row.get("Open", 0)), 2),
                "high": round(float(row.get("High", 0)), 2),
                "low": round(float(row.get("Low", 0)), 2),
                "close": round(float(row.get("Close", 0)), 2),
                "volume": int(row.get("Volume", 0)),
                "sma20": row.get("sma20"),
                "sma50": row.get("sma50"),
                "bb_upper": row.get("bb_upper"),
                "bb_middle": row.get("bb_middle"),
                "bb_lower": row.get("bb_lower"),
                "rsi": row.get("rsi"),
                "macd": row.get("macd"),
                "macd_signal": row.get("macd_signal"),
                "macd_histogram": row.get("macd_histogram")
            })

        current_price = prediction_payload.get("current_price", history_list[-1]["close"])
        
        # Compute change correctly based on previous close if possible
        if len(history_list) >= 2:
            prev_close = history_list[-2]["close"]
            change = current_price - prev_close
            change_percent = (change / prev_close * 100) if prev_close else 0.0
        else:
            change = 0.0
            change_percent = 0.0

        raw_probs = trend_pred.get("probabilities", {})
        
        # Normalize probs if they are already in % (e.g. 84 instead of 0.84)
        def _norm_prob(v):
            f = float(v) if v is not None else 0.0
            return f / 100.0 if f > 1.0 else f

        probs_normalized = {
            "Baisse": _norm_prob(raw_probs.get("Baisse", 0)),
            "Stabilite": _norm_prob(raw_probs.get("Stabilite", raw_probs.get("Stabilité", 0))),
            "Hausse": _norm_prob(raw_probs.get("Hausse", 0))
        }

        # Normalize confidence to [0, 1] scale for the frontend
        conf_raw = float(trend_pred.get("confidence", 0.0))
        conf_normalized = conf_raw / 100.0 if conf_raw > 1.0 else conf_raw

        return {
            "ticker": display_ticker,
            "company_name": get_company_name(display_ticker),
            "market": {
                "price": round(float(current_price), 2),
                "change": round(float(change), 2),
                "change_percent": round(float(change_percent), 2),
                "timestamp": prediction_payload.get("timestamp", history_list[-1]["date"] + "T23:59:59")
            },
            "history": history_list,
            "prediction": {
                "model": trend_pred.get("model_version", "V13.3.2"),
                "direction": trend_pred.get("signal", "Stabilité"),
                "confidence": conf_normalized,
                "probabilities": probs_normalized,
                "level": trend_pred.get("confidence_level", "Neutre")
            }
        }
        
    except Exception as exc:
        logger.error(f"[ERROR] /api/stock/{ticker} : {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
