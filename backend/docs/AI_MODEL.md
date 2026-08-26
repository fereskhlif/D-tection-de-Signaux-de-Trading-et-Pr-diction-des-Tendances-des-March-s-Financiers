# AlphaML — Model Documentation (V13.5)

## Overview

AlphaML is a quantitative trading signal engine designed to forecast stock price directions over a 5-day trading horizon. It leverages a multi-stage architecture consisting of classification, calibration, confidence scoring, selective prediction, and regression.

---

## 1. Model Identity

| Property | Value |
|----------|-------|
| **Version** | `V13.5` (Fallback: `V13.3.2` experiments) |
| **Type** | LightGBM Classifier (`LGBMClassifier`) |
| **Horizon** | `H=5` (5 trading days) |
| **Features** | 51 features |
| **Target Mapping** | `0 = Baisse` (Bearish), `1 = Stabilite` (Neutral), `2 = Hausse` (Bullish) |
| **Validation Protocol** | Purged Walk-Forward Cross-Validation (Embargo = 5 days) |

---

## 2. Model Pipeline

```
Yahoo Finance (yfinance)
        ↓
   OHLCV Data
        ↓
Feature Engineering (51 Features)
        ↓
   Imputation (ffill + fillna 0)
        ↓
   V13.5 LightGBM Classifier (predicts probabilities)
        ↓
   V13.7 Meta-Confidence Model (calculates P(correct))
        ↓
   SelectiveDecisionEngine (Abstain or Trade via NegEntropy)
        ↓
   V12.8 Conditional Regressors (predicts return % if signal != HOLD)
        ↓
   Target Price + Risk Management Metrics (Take Profit & Stop Loss)
```

---

## 3. Feature Engineering

The feature pipeline uses **51 features** computed dynamically from Yahoo Finance daily bars.

### Feature Composition
- **Base Features (V12.1)**: Classical technical indicators (RSI, ADX, Bollinger Bands, EMA/SMA crossovers, MACD).
- **Enhanced Features (V12.3)**: Volatility measures, volume regimes, and candlestick ratios.
- **Market Context**: SPY (S&P 500) and QQQ (Nasdaq 100) returns and VIX proxy proxies.
- **Momentum Slopes (V13.4)**: Slopes of returns over 3, 5, and 10 days for market tickers to capture acceleration.

---

## 4. Calibration & Confidence (V13.7 Meta-Model)

Instead of relying solely on raw probability outputs, AlphaML uses:
- **V13.7 Meta-Model**: A secondary model that receives the raw probabilities, margin, and entropy of the V13.5 classifier to predict the probability that the prediction is correct (`P(correct)`).
- **V13.2 Calibrator**: A diagnostic isotonic/sigmoid calibrator used for telemetry monitoring.

---

## 5. Selective Prediction (Phase 50)

To avoid high-noise regimes, the **SelectiveDecisionEngine** evaluates the negative entropy of predicted probabilities. If negative entropy is below the configured threshold (high uncertainty), the model **abstains** (`decision = "ABSTAIN"`), preventing risky trades.

---

## 6. Regression & Risk Management (V12.8)

If a prediction is allowed:
1. One of the three **V12.8 Conditional Regressors** (Bear/Bull/Stable) is triggered depending on the predicted class.
2. The regressor predicts the target return % over the 5-day horizon.
3. This return is used to set the **Take Profit (TP)** and **Stop Loss (SL)** levels dynamically, respecting a minimum risk-reward ratio of `1.5` based on the Asset Average True Range (ATR).
