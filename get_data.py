import yfinance as yf
import json
import os
import pandas as pd
import numpy as np
import time

def get_sp500_tickers():
    try:
        table = pd.read_html('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies')
        df = table[0]
        return df['Symbol'].tolist()
    except Exception as e:
        print(f"Error fetching S&P 500: {e}")
        return []

def get_dax_tickers():
    try:
        # Wikipedia table for DAX usually lists them as 'ADS.DE' etc.
        table = pd.read_html('https://en.wikipedia.org/wiki/DAX')
        df = table[3] # Usually table 3 or 4 contains the components
        # We need to ensure they have the .DE suffix for Yahoo Finance
        tickers = []
        for symbol in df['Ticker']:
            if not symbol.endswith('.DE'):
                tickers.append(f"{symbol}.DE")
            else:
                tickers.append(symbol)
        return tickers
    except Exception as e:
        print(f"Error fetching DAX: {e}")
        # Fallback list if scraping fails
        return ["SAP.DE", "SIE.DE", "ALV.DE", "DTE.DE", "BMW.DE", "VOW3.DE"]

# 1. BUILD THE MEGA WATCHLIST
print("--- 1. Building Watchlist ---")
sp500 = get_sp500_tickers()
dax = get_dax_tickers()

# COMBINE THEM (Limit to top 100 first to test speed, remove [:100] for full run)
# Warning: Running full 500+ correlations might take >10 mins
tickers = sp500[:80] + dax[:20] 
print(f"Targeting {len(tickers)} stocks.")

nodes = []
price_data = {}

print("--- 2. Scanning Financials ---")

for i, symbol in enumerate(tickers):
    try:
        # Replace dot for BRK.B edge case
        yahoo_symbol = symbol.replace('.', '-') if ".DE" not in symbol else symbol
        
        stock = yf.Ticker(yahoo_symbol)
        
        # A. Fetch Fundamentals (Fast Scan)
        # We use .info heavily to avoid downloading 3 separate statements if possible
        info = stock.info
        
        # Skip if missing critical data
        if 'marketCap' not in info:
            continue

        # --- BUFFETT METRICS (Simplified for Speed) ---
        score = 0
        metrics = {}
        
        # 1. Margins
        gm = info.get('grossMargins', 0)
        if gm > 0.40: score += 1
        metrics["grossMargin"] = round(gm, 2)

        # 2. Debt (Debt/Equity)
        de = info.get('debtToEquity', 100) / 100 # Yahoo returns percentage (e.g. 150 for 1.5)
        if de < 0.50: score += 1
        metrics["debtToEquity"] = round(de, 2)

        # 3. Efficiency (Return on Assets as proxy for efficiency)
        roa = info.get('returnOnAssets', 0)
        if roa > 0.05: score += 1 # >5% is decent
        metrics["roa"] = round(roa, 2)
        
        # 4. Profitability
        pm = info.get('profitMargins', 0)
        if pm > 0.10: score += 1
        metrics["profitMargin"] = round(pm, 2)

        # 5. Growth (Revenue Growth)
        rg = info.get('revenueGrowth', 0)
        if rg > 0: score += 1
        metrics["revenueGrowth"] = round(rg, 2)

        # Save Node
        nodes.append({
            "id": symbol,
            "sector": info.get("sector", "Unknown"),
            "marketCap": info.get("marketCap", 0),
            "buffettScore": score,
            "metrics": metrics
        })

        # B. Fetch Price History (Optimized: 3mo is enough for correlation)
        hist = stock.history(period="3mo")
        if not hist.empty:
            price_data[symbol] = hist["Close"]
            
        # Progress bar logic
        if i % 10 == 0: print(f"Processed {i}/{len(tickers)}...")

    except Exception as e:
        # specific error handling is better than pass
        print(f"Skipping {symbol}: {e}")

print("--- 3. Calculating The Web (Correlations) ---")

df_prices = pd.DataFrame(price_data)
# Drop columns with too much missing data
df_prices = df_prices.dropna(axis=1, thresh=len(df_prices)*0.9) 
corr_matrix = df_prices.corr()

links = []
tickers_list = df_prices.columns.tolist()

# Threshold: 0.65 to capture more meaningful connections
threshold = 0.65 

for i in range(len(tickers_list)):
    for j in range(i + 1, len(tickers_list)):
        t1 = tickers_list[i]
        t2 = tickers_list[j]
        val = corr_matrix.loc[t1, t2]
        
        if val > threshold:
            links.append({
                "source": t1,
                "target": t2,
                "value": round(val, 2)
            })

print(f"Generated {len(links)} links between {len(nodes)} nodes.")

# Save
output = {"nodes": nodes, "links": links}
os.makedirs("stocks", exist_ok=True)
with open("stocks/data.json", "w") as f:
    json.dump(output, f, indent=2)

print("--- Data Update Complete ---")
