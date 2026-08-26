import pandas as pd
import numpy as np

class IndicatorService:
    """
    Service pour le calcul d'indicateurs techniques destinés UNIQUEMENT à l'affichage (graphiques).
    Ne remplace en aucun cas le Feature Engineering utilisé par le modèle ML V13.3.2.
    """

    @staticmethod
    def compute_chart_indicators(df: pd.DataFrame) -> pd.DataFrame:
        """
        Prend un DataFrame OHLCV Yahoo Finance et ajoute les séries historiques
        pour SMA, Bollinger Bands, RSI et MACD.
        """
        if df is None or df.empty or len(df) < 2:
            return df

        df = df.copy()
        close = df["Close"].ffill()

        # SMA
        df["sma20"] = close.rolling(window=20, min_periods=1).mean()
        df["sma50"] = close.rolling(window=50, min_periods=1).mean()

        # Bollinger Bands (20, 2)
        std20 = close.rolling(window=20, min_periods=1).std()
        df["bb_middle"] = df["sma20"]
        df["bb_upper"] = df["bb_middle"] + (std20 * 2)
        df["bb_lower"] = df["bb_middle"] - (std20 * 2)

        # RSI 14
        delta = close.diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        
        # Exponential moving average for RSI (Wilder's smoothing)
        avg_gain = gain.ewm(com=13, min_periods=1).mean()
        avg_loss = loss.ewm(com=13, min_periods=1).mean()
        
        rs = avg_gain / avg_loss.replace(0, np.nan)
        df["rsi"] = 100 - (100 / (1 + rs))
        df["rsi"] = df["rsi"].fillna(50) # Fallback pour les premières lignes

        # MACD (12, 26, 9)
        ema12 = close.ewm(span=12, adjust=False).mean()
        ema26 = close.ewm(span=26, adjust=False).mean()
        df["macd"] = ema12 - ema26
        df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
        df["macd_histogram"] = df["macd"] - df["macd_signal"]

        # Arrondir pour alléger le JSON
        for col in ["sma20", "sma50", "bb_middle", "bb_upper", "bb_lower", "rsi", "macd", "macd_signal", "macd_histogram"]:
            if col in df.columns:
                df[col] = df[col].round(2)

        return df

indicator_service = IndicatorService()
