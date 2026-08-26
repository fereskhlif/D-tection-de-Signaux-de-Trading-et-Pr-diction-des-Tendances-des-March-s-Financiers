# -*- coding: utf-8 -*-
"""
AlphaML Backend — Router Market.

Deux endpoints :
  GET /api/market/{ticker}  → données marché + prédiction IA pour un ticker
  GET /api/sectors          → stats agrégées par secteur (temps réel)

Ce router ne touche PAS au modèle IA — il réutilise ai_service.get_prediction()
qui est le pipeline existant V13.3.2.

Les indicateurs techniques (RSI, SMA, volatilité) sont calculés à partir
des données Yahoo Finance déjà téléchargées et mises en cache.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from app.config_sectors import (
    SECTOR_CONFIG,
    display_to_yf,
    get_company_name,
    get_sector_of,
    yf_to_display,
)
from app.infrastructure.v13_2.cache_manager import get_yahoo_data
from app.services.ai_service import ai_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Market"])


# ─────────────────────────────────────────────────────────────────────────────
# Calcul des indicateurs techniques
# ─────────────────────────────────────────────────────────────────────────────

def _compute_rsi(close: pd.Series, period: int = 14) -> float:
    """RSI(14) — même définition que celle utilisée dans le feature engineering."""
    if len(close) < period + 1:
        return 50.0
    delta = close.diff().dropna()
    gains = delta.clip(lower=0)
    losses = (-delta).clip(lower=0)
    avg_gain = gains.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = losses.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi_series = 100.0 - (100.0 / (1.0 + rs))
    val = rsi_series.iloc[-1]
    return round(float(val), 1) if not np.isnan(val) else 50.0


def _compute_market_indicators(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Calcule les indicateurs de marché à partir d'un DataFrame OHLCV.

    Retourne :
      day_change_pct   : variation journalière (%)
      quarter_change_pct : performance 90 jours (%)
      rsi14            : RSI sur 14 périodes
      volatility_ann   : volatilité annualisée (%)
      sma20            : SMA 20 jours
      sma50            : SMA 50 jours
      high52           : plus haut 52 semaines
      low52            : plus bas 52 semaines
      volume           : volume du dernier jour
    """
    if df is None or df.empty:
        return {
            "day_change_pct": 0.0,
            "quarter_change_pct": 0.0,
            "rsi14": 50.0,
            "volatility_ann": 0.0,
            "sma20": 0.0,
            "sma50": 0.0,
            "high52": 0.0,
            "low52": 0.0,
            "volume": 0,
        }

    close = df["Close"].ffill()
    high  = df["High"].ffill() if "High" in df.columns else close
    low   = df["Low"].ffill()  if "Low"  in df.columns else close
    vol_series = df["Volume"] if "Volume" in df.columns else pd.Series([0] * len(df))

    # Variation journalière
    if len(close) >= 2:
        day_change_pct = round(float((close.iloc[-1] - close.iloc[-2]) / close.iloc[-2] * 100), 2)
    else:
        day_change_pct = 0.0

    # Performance 90 jours
    idx_90 = max(0, len(close) - 90)
    price_90d_ago = float(close.iloc[idx_90])
    if price_90d_ago > 0:
        quarter_change_pct = round(float((close.iloc[-1] - price_90d_ago) / price_90d_ago * 100), 2)
    else:
        quarter_change_pct = 0.0

    # RSI 14
    rsi14 = _compute_rsi(close)

    # Volatilité annualisée (SMA 20 des rendements journaliers)
    returns = close.pct_change().dropna()
    if len(returns) >= 20:
        vol_raw = float(returns.rolling(20).std().iloc[-1])
        volatility_ann = round(vol_raw * np.sqrt(252) * 100, 1)
    else:
        volatility_ann = 0.0

    # SMA20
    if len(close) >= 20:
        sma20 = round(float(close.rolling(20).mean().iloc[-1]), 4)
    else:
        sma20 = round(float(close.mean()), 4)

    # SMA50
    if len(close) >= 50:
        sma50 = round(float(close.rolling(50).mean().iloc[-1]), 4)
    else:
        sma50 = sma20

    # 52-week high/low (252 jours de trading ~ 1 an)
    window_52w = min(252, len(close))
    high52 = round(float(high.iloc[-window_52w:].max()), 4)
    low52  = round(float(low.iloc[-window_52w:].min()), 4)

    # Volume dernier jour
    volume = int(vol_series.iloc[-1]) if not pd.isna(vol_series.iloc[-1]) else 0

    return {
        "day_change_pct":    day_change_pct,
        "quarter_change_pct": quarter_change_pct,
        "rsi14":             rsi14,
        "volatility_ann":    volatility_ann,
        "sma20":             sma20,
        "sma50":             sma50,
        "high52":            high52,
        "low52":             low52,
        "volume":            volume,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Fonction utilitaire : données complètes d'un ticker
# ─────────────────────────────────────────────────────────────────────────────

def _get_full_ticker_data(display_ticker: str) -> Dict[str, Any]:
    """
    Retourne les données complètes (marché + IA) pour un ticker.

    Utilise :
      - ai_service.get_prediction()  → pipeline V13.3.2 existant (inchangé)
      - get_yahoo_data()             → cache existant
      - _compute_market_indicators() → calcul technique local

    Logs structurés :
      [DATA]       {ticker} : données Yahoo récupérées
      [PREDICTION] {ticker} : signal
      [CONFIDENCE] {ticker} : score
    """
    yf_ticker = display_to_yf(display_ticker)

    logger.info(f"[DATA] {display_ticker} : récupération données (YF={yf_ticker})")

    # 1. Pipeline IA existant (V13.3.2) — NE PAS MODIFIER
    prediction_payload = ai_service.get_prediction(yf_ticker)

    logger.info(f"[PREDICTION] {display_ticker} : {prediction_payload['trend_prediction']['signal']}")
    logger.info(
        f"[CONFIDENCE] {display_ticker} : "
        f"{round(prediction_payload['trend_prediction']['confidence'] * 100, 1)}%"
    )

    # 2. Indicateurs techniques depuis le cache Yahoo
    df_yahoo = get_yahoo_data(yf_ticker)
    indicators = _compute_market_indicators(df_yahoo)

    logger.info(
        f"[INDICATORS] {display_ticker} : "
        f"RSI={indicators['rsi14']} | "
        f"Vol={indicators['volatility_ann']}% | "
        f"SMA20={indicators['sma20']}"
    )

    # 3. Probabilités (le modèle retourne des valeurs brutes [0-1])
    raw_probs = prediction_payload["trend_prediction"]["probabilities"]
    # Normalisation : si le backend retourne [0-1], convertir en [0-100] pour l'affichage
    def _pct(v: Any) -> float:
        f = float(v) if v is not None else 0.0
        # Si les probabilités sont déjà en [0-1] → ×100
        # Si elles sont en [0-100] → garder
        return round(f * 100, 1) if f <= 1.0 else round(f, 1)

    confidence_raw = float(prediction_payload["trend_prediction"]["confidence"])
    confidence_pct = round(confidence_raw * 100, 1) if confidence_raw <= 1.0 else round(confidence_raw, 1)

    # Smart Router fields from trend_prediction
    tp = prediction_payload["trend_prediction"]
    return {
        "ticker":            display_ticker,
        "yf_ticker":         yf_ticker,
        "company":           get_company_name(display_ticker),
        "sector":            get_sector_of(display_ticker),
        "price":             prediction_payload["current_price"],
        "day_change_pct":    indicators["day_change_pct"],
        "quarter_change_pct": indicators["quarter_change_pct"],
        "rsi14":             indicators["rsi14"],
        "volatility_ann":    indicators["volatility_ann"],
        "sma20":             indicators["sma20"],
        "sma50":             indicators["sma50"],
        "high52":            indicators["high52"],
        "low52":             indicators["low52"],
        "volume":            indicators["volume"],
        "prediction":        tp["signal"],
        "confidence":        confidence_pct,
        "confidence_raw":    confidence_raw,
        "probabilities": {
            "Hausse":    _pct(raw_probs.get("Hausse",    0)),
            "Stabilite": _pct(raw_probs.get("Stabilite", raw_probs.get("Stabilité", 0))),
            "Baisse":    _pct(raw_probs.get("Baisse",    0)),
        },
        # Smart Router Phase 42
        "decision":      tp.get("decision", "WATCH"),
        "risk_level":    tp.get("risk_level", "HIGH"),
        "trade_allowed": tp.get("trade_allowed", False),
        "reason":        tp.get("reason", ""),
        # Additional metadata
        "router_status": tp.get("router_status", ""),
        "direction_model": tp.get("direction_model", "V13.5"),
        "confidence_model": tp.get("confidence_model", "V13.7"),
        "performance_90d": indicators["quarter_change_pct"],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint : GET /api/market/{ticker}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/market/{ticker}", summary="Données marché + prédiction IA pour un ticker")
def get_market(ticker: str) -> Dict[str, Any]:
    """
    Retourne les données complètes pour un ticker :
      - Indicateurs de marché (prix, variation, RSI, SMA, volatilité)
      - Prédiction IA V13.3.2 (signal, confiance, probabilités)

    Le ticker peut être un symbole d'affichage (ex: BTC) ou Yahoo Finance (ex: BTC-USD).
    La résolution est automatique via la configuration des secteurs.

    Logs :
      [DATA]       ticker : données Yahoo récupérées
      [PREDICTION] ticker : signal
      [CONFIDENCE] ticker : score
    """
    ticker = ticker.upper().strip()

    # Résoudre le ticker d'affichage vs Yahoo Finance
    # Si le ticker est un symbole Yahoo Finance connu, le convertir en display
    display_ticker = yf_to_display(ticker) if yf_to_display(ticker) != ticker else ticker

    logger.info(f"[MARKET] Requête pour {ticker} (display={display_ticker})")

    try:
        return _get_full_ticker_data(display_ticker)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[ERROR] {display_ticker} : {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Impossible de récupérer les données pour '{ticker}' : {exc}",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint : GET /api/sectors
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sectors", summary="Performance et prédictions par secteur (temps réel)")
def get_sectors() -> Dict[str, Any]:
    """
    Retourne les statistiques agrégées par secteur :
      - Performance 90J moyenne
      - Confiance moyenne du modèle IA
      - Répartition Hausse / Stabilité / Baisse
      - Données par ticker

    Utilise ThreadPoolExecutor pour paralléliser les appels au pipeline IA.
    Tous les tickers passent par le pipeline V13.3.2 existant.
    """
    logger.info("[SECTORS] Début de l'agrégation par secteur")

    all_sectors = []

    for sector_name, ticker_entries in SECTOR_CONFIG.items():
        sector_results = []
        errors = []

        # Paralléliser les appels IA par ticker
        with ThreadPoolExecutor(max_workers=min(len(ticker_entries), 4)) as executor:
            future_to_ticker = {
                executor.submit(_get_full_ticker_data, entry["display"]): entry["display"]
                for entry in ticker_entries
            }
            for future in as_completed(future_to_ticker):
                display = future_to_ticker[future]
                try:
                    data = future.result(timeout=60)
                    sector_results.append(data)
                except Exception as exc:
                    logger.error(f"[ERROR] {display} dans secteur {sector_name} : {exc}")
                    errors.append({"ticker": display, "error": str(exc)})

        if not sector_results:
            all_sectors.append({
                "sector":           sector_name,
                "count":            len(ticker_entries),
                "available":        0,
                "errors":           errors,
                "avg_performance_90d": 0.0,
                "avg_confidence":   0.0,
                "bullish":          0,
                "stable":           0,
                "bearish":          0,
                "tickers":          [],
            })
            continue

        # Agrégation
        avg_perf = round(
            sum(r["performance_90d"] for r in sector_results) / len(sector_results), 2
        )
        avg_conf = round(
            sum(r["confidence"] for r in sector_results) / len(sector_results), 1
        )
        bullish = sum(1 for r in sector_results if r["prediction"] == "Hausse")
        bearish = sum(1 for r in sector_results if r["prediction"] == "Baisse")
        stable  = sum(1 for r in sector_results if r["prediction"] == "Stabilite")

        logger.info(
            f"[SECTOR] {sector_name} : "
            f"perf={avg_perf:.1f}% | conf={avg_conf:.0f}% | "
            f"↑{bullish} −{stable} ↓{bearish}"
        )

        all_sectors.append({
            "sector":              sector_name,
            "count":               len(ticker_entries),
            "available":           len(sector_results),
            "errors":              errors,
            "avg_performance_90d": avg_perf,
            "avg_confidence":      avg_conf,
            "bullish":             bullish,
            "stable":              stable,
            "bearish":             bearish,
            "tickers":             sector_results,
        })

    return {"sectors": all_sectors}


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint : GET /api/stocks           (batch — tous les tickers)
# Endpoint : GET /api/stocks/{ticker}  (ticker individuel)
# ─────────────────────────────────────────────────────────────────────────────

import datetime as _dt

@router.get("/stocks", summary="Données marché + prédiction IA pour tous les tickers (batch)")
def get_all_stocks() -> Dict:
    """
    Retourne les données de marché + prédiction IA pour TOUS les tickers
    en un seul appel, chargés en parallèle (ThreadPoolExecutor).

    Avantages par rapport à 18× GET /api/market/{ticker} :
      - Un seul round-trip HTTP depuis le frontend
      - Parallélisation backend (max 6 threads)
      - Erreurs individuelles isolées (un ticker raté n'bloque pas les autres)
      - Timestamp de génération inclus

    Retourne :
      {
        "generated_at": "2026-08-11T08:35:00",
        "count": 15,
        "stocks": [ { ticker, name, sector, price, ... }, ... ],
        "errors": [ { ticker, error }, ... ]
      }
    """
    from app.config_sectors import get_all_display_tickers

    all_display = get_all_display_tickers()
    logger.info(f"[STOCKS] Batch request — {len(all_display)} tickers")

    results: list[Dict] = []
    errors:  list[Dict] = []

    with ThreadPoolExecutor(max_workers=6) as executor:
        future_to_ticker = {
            executor.submit(_get_full_ticker_data, t): t
            for t in all_display
        }
        for future in as_completed(future_to_ticker):
            display = future_to_ticker[future]
            try:
                data = future.result(timeout=60)
                results.append(data)
            except Exception as exc:
                logger.error(f"[STOCKS] Erreur pour {display}: {exc}")
                errors.append({"ticker": display, "error": str(exc)})

    # Trier dans l'ordre d'affichage original
    order = {t: i for i, t in enumerate(all_display)}
    results.sort(key=lambda r: order.get(r["ticker"], 999))

    logger.info(
        f"[STOCKS] Batch terminé — {len(results)} OK, {len(errors)} erreur(s)"
    )

    return {
        "generated_at": _dt.datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "count": len(results),
        "stocks": results,
        "errors": errors,
    }


@router.get("/stocks/{ticker}", summary="Données marché + prédiction IA pour un ticker (alias)")
def get_stock_by_ticker(ticker: str) -> Dict:
    """
    Alias de GET /api/market/{ticker} avec résolution automatique
    display ↔ Yahoo Finance.

    Exemple : GET /api/stocks/AAPL   → mêmes données que /api/market/AAPL
              GET /api/stocks/BTC    → résout vers BTC-USD automatiquement
    """
    ticker = ticker.upper().strip()
    display_ticker = yf_to_display(ticker) if yf_to_display(ticker) != ticker else ticker
    logger.info(f"[STOCKS] Requête individuelle pour {ticker} (display={display_ticker})")
    try:
        return _get_full_ticker_data(display_ticker)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[STOCKS] Erreur {display_ticker}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Impossible de récupérer les données pour '{ticker}': {exc}",
        )
