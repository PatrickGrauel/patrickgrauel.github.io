import yfinance as yf
import json
import os
import pandas as pd
import numpy as np

# 1. THE WATCHLIST (Expanded for better clustering)
tickers = [
    # Tech
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    # Banks
    "JPM", "BAC", "WFC", "GS", "MS",
    # Consumer
    "KO", "PEP", "MCD", "SBUX", "NKE",
    # Energy
    "XOM", "CVX", "SHEL", "BP",
    # Pharma
    "PFE", "JNJ", "MRK", "ABBV"
]

print("--- 1. Fetching Financials & Price History ---")

nodes = []
price_data = {}

for symbol in tickers:
    try:
        print(f"Scanning {symbol}...")
        stock = yf.Ticker(symbol)
        
        # A. Fetch Fundamentals
        info = stock.info
        fin = stock.financials
        bal = stock.balance_sheet
        
        # --- BUFFETT METRICS CALCULATION ---
        score = 0
        metrics = {}

        # 1. Gross Margin (> 40%)
        # Logic: High margins = Moat
        gm = 0
        if "Gross Profit" in fin.index and "Total Revenue" in fin.index:
            rev = fin.loc["Total Revenue"].iloc[0]
            gp = fin.loc["Gross Profit"].iloc[0]
            if rev > 0:
                gm = gp / rev
                if gm > 0.40: score += 1
        metrics["grossMargin"] = round(gm, 2)

        # 2. SG&A Ratio (< 30% of Gross Profit)
        # Logic: Efficient operations
        sga_ratio = 1.0 # Default bad
        if "Selling General And Administration" in fin.index and gm > 0:
            sga = fin.loc["Selling General And Administration"].iloc[0]
            sga_ratio = sga / gp
            if sga_ratio < 0.30: score += 1
        metrics["sgaRatio"] = round(sga_ratio, 2)

        # 3. Debt to Equity (< 0.5)
        # Logic: Low leverage
        de = 10.0 # Default bad
        if "Total Debt" in bal.index and "Stockholders Equity" in bal.index:
            debt = bal.loc["Total Debt"].iloc[0]
            equity = bal.loc["Stockholders Equity"].iloc[0]
            if equity > 0:
                de = debt / equity
                if de < 0.50: score += 1
        metrics["debtToEquity"] = round(de, 2)

        # 4. Interest Coverage (Interest < 15% of Operating Income)
        # Logic: Safety
        int_ratio = 1.0
        if "Interest Expense" in fin.index and "Operating Income" in fin.index:
            interest = fin.loc["Interest Expense"].iloc[0]
            op_income = fin.loc["Operating Income"].iloc[0]
            if op_income > 0:
                int_ratio = interest / op_income
                if int_ratio < 0.15: score += 1
        metrics["interestRatio"] = round(int_ratio, 2)

        # 5. Net Earnings Trend (Simple check: positive earnings)
        # Logic: Profitable
        profitable = False
        if "Net Income" in fin.index:
            ni = fin.loc["Net Income"].iloc[0]
            if ni > 0: 
                profitable = True
                score += 1
        metrics["profitable"] = profitable

        # Save Node Data
        nodes.append({
            "id": symbol,
            "sector": info.get("sector", "Unknown"),
            "marketCap": info.get("marketCap", 1000000000),
            "buffettScore": score,
            "metrics": metrics
        })

        # B. Fetch Price History (for Correlation Lines)
        # We grab 6 months of history
        hist = stock.history(period="6mo")
        if not hist.empty:
            price_data[symbol] = hist["Close"]

    except Exception as e:
        print(f"⚠️ Error on {symbol}: {e}")

print("--- 2. Calculating Correlations (The Web) ---")

# Create a DataFrame of all prices
df_prices = pd.DataFrame(price_data)
# Calculate Correlation Matrix
corr_matrix = df_prices.corr()

links = []
# Create links between stocks that move together
# Threshold: 0.7 (Strong positive correlation)
tickers_list = df_prices.columns.tolist()
for i in range(len(tickers_list)):
    for j in range(i + 1, len(tickers_list)):
        t1 = tickers_list[i]
        t2 = tickers_list[j]
        correlation = corr_matrix.loc[t1, t2]
        
        if correlation > 0.7:
            links.append({
                "source": t1,
                "target": t2,
                "value": round(correlation, 2)
            })

print(f"Generated {len(links)} connections.")

# Save everything
output = {"nodes": nodes, "links": links}
os.makedirs("stocks", exist_ok=True)
with open("stocks/data.json", "w") as f:
    json.dump(output, f, indent=2)

print("--- Scan Complete. ---")
