import yfinance as yf
import json
import os

# 1. Define the "Watchlist"
# (We start with 20 stocks to keep it fast. You can add more later.)
tickers = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", # Tech
    "XOM", "CVX", "SHEL",                    # Energy
    "JPM", "BAC", "WFC",                     # Banks
    "KO", "PEP", "MCD",                      # Consumer
    "PFE", "JNJ", "MRK",                     # Pharma
    "BA", "LMT", "GE"                        # Aerospace
]

stock_data = []

print("--- Starting Market Radar Scan ---")

for symbol in tickers:
    try:
        print(f"Scanning {symbol}...")
        stock = yf.Ticker(symbol)
        
        # Fetch key data
        info = stock.info
        fin = stock.financials
        bal = stock.balance_sheet

        # Default values if data is missing
        gross_margin = 0
        debt_to_equity = 0
        score = 0
        
        # --- BUFFETT METRIC 1: Gross Margin (> 40% is good) ---
        # Banks often don't have 'Gross Profit', so we handle that safely
        if "Gross Profit" in fin.index:
            gross_profit = fin.loc["Gross Profit"].iloc[0]
            revenue = fin.loc["Total Revenue"].iloc[0]
            gross_margin = gross_profit / revenue
            if gross_margin > 0.4:
                score += 1
        
        # --- BUFFETT METRIC 2: Debt to Equity (< 0.5 is good) ---
        if "Total Debt" in bal.index and "Stockholders Equity" in bal.index:
            total_debt = bal.loc["Total Debt"].iloc[0]
            equity = bal.loc["Stockholders Equity"].iloc[0]
            # Avoid division by zero
            if equity != 0:
                debt_to_equity = total_debt / equity
                if debt_to_equity < 0.5:
                    score += 1

        # Determine Color based on Score
        # Score 2 = Green (Buffett Approved)
        # Score 1 = Yellow (Okay)
        # Score 0 = Red (Risky)
        color = "#ff3333" # Red
        if score == 1: color = "#ffcc00" # Yellow
        if score == 2: color = "#00ff41" # Green

        # Add to list
        stock_data.append({
            "ticker": symbol,
            "sector": info.get("sector", "Unknown"),
            "marketCap": info.get("marketCap", 1000000000),
            "grossMargin": round(gross_margin, 2),
            "debtToEquity": round(debt_to_equity, 2),
            "score": score,
            "color": color
        })
        
    except Exception as e:
        print(f"⚠️ Failed to scan {symbol}: {e}")

# Ensure the 'stocks' folder exists
os.makedirs("stocks", exist_ok=True)

# Save the file inside the 'stocks' folder
with open("stocks/data.json", "w") as f:
    json.dump(stock_data, f, indent=2)

print("--- Scan Complete. Data Saved. ---")
