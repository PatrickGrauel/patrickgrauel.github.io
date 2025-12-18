import yfinance as yf
import pandas as pd
import time

def fetch_ticker_data(ticker):
    """
    Fetches raw financial data for a single ticker.
    Returns a dictionary with raw DataFrames or None if failed.
    """
    try:
        # Standardize ticker (Yahoo uses '-' for dot)
        yahoo_ticker = ticker.replace('.', '-') if ".DE" not in ticker else ticker
        stock = yf.Ticker(yahoo_ticker)
        
        # 1. Info (Profile & Current Stats)
        info = stock.info
        if 'marketCap' not in info or info['marketCap'] is None:
            print(f"  ⚠️  {ticker}: No Market Cap found.")
            return None

        # 2. Financial Statements (Annual)
        # Transpose not needed if using standard yfinance object access, 
        # but we ensure they are DataFrames.
        hist = stock.history(period="5y")
        inc = stock.financials
        bal = stock.balance_sheet
        cf = stock.cashflow

        # Basic validation
        if inc.empty or bal.empty or cf.empty:
            print(f"  ⚠️  {ticker}: Missing financial statements.")
            return None

        return {
            "info": info,
            "history": hist,
            "income": inc,
            "balance": bal,
            "cashflow": cf
        }

    except Exception as e:
        print(f"  ❌ {ticker}: Fetch error - {str(e)[:100]}")
        return None
