import yfinance as yf
import pandas as pd

print("yfinance version:", yf.__version__)
try:
    df = yf.download(tickers=["AAPL","MSFT"], period="1mo", interval="1d", group_by="ticker", progress=False, timeout=20)
    print("TYPE:", type(df))
    print("COLUMNS (repr):", repr(getattr(df, 'columns', None))[:400])
    try:
        print("SHAPE:", getattr(df, 'shape', None))
    except Exception:
        pass
    # if DataFrame, show head/tail
    if isinstance(df, pd.DataFrame):
        print("HEAD:\n", df.head().to_string())
        print("TAIL:\n", df.tail().to_string())
    else:
        print("Downloaded object is not a DataFrame:", type(df))
except Exception as e:
    print("ERROR:", type(e), e)
