import yfinance as yf
import pandas as pd
import numpy as np
import json
import os
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity
from tqdm import tqdm

# CONFIG: Add more tickers here for a bigger graph
# Currently a small subset for testing.
TICKERS = ["AAPL", "MSFT", "GOOGL", "AMZN", "BRK-B", "JNJ", "V", "PG", "KO", "PEP", "COST", "MCD", "NVDA", "TSLA", "XOM", "META", "LLY", "AVGO", "JPM", "UNH"]

def get_buffett_metrics(ticker):
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        # 1. Owner Earnings Proxy (Free Cash Flow)
        fcf = info.get('freeCashflow', 0)
        
        # 2. ROE
        roe = info.get('returnOnEquity', 0)

        return {
            "id": ticker,
            "name": info.get('shortName', ticker),
            "sector": info.get('sector', 'Unknown'),
            "grossMargins": info.get('grossMargins', 0),
            "debtToEquity": info.get('debtToEquity', 100), # Default to high/risky if missing
            "roe": roe,
            "ownerEarnings": fcf if fcf is not None else 0
        }
    except Exception as e:
        print(f"Skipping {ticker}: {e}")
        return None

def calculate_buffett_score(df):
    scores = []
    for _, row in df.iterrows():
        score = 0
        
        # 1. MOAT: Gross Margins (40pts)
        gm = row['grossMargins']
        if gm > 0.40: score += 40
        elif gm > 0.20: score += 20
        else: score += 5
        
        # 2. SAFETY: Debt/Equity (30pts)
        de = row['debtToEquity']
        if de is None: de = 1000
        if de < 50: score += 30
        elif de < 100: score += 15
        
        # 3. EFFICIENCY: ROE (30pts)
        roe = row['roe']
        if roe > 0.20: score += 30
        elif roe > 0.15: score += 15
        
        scores.append(score)
    return scores

def build_similarity_links(df):
    # Select features and fill missing values
    features = df[['grossMargins', 'debtToEquity', 'roe']].fillna(0)
    
    # Normalize features so Debt (0-100) doesn't overpower Margins (0-1)
    scaler = MinMaxScaler()
    features_norm = scaler.fit_transform(features)
    
    # Calculate Similarity
    sim_matrix = cosine_similarity(features_norm)
    
    links = []
    for i in range(len(df)):
        # Connect to top 3 most similar peers (excluding self)
        # argsort sorts ascending, so we take the end of the array ([-4:-1])
        similar_indices = sim_matrix[i].argsort()[-4:-1]
        
        for neighbor_idx in similar_indices:
            sim_score = sim_matrix[i][neighbor_idx]
            if sim_score > 0.70: # Connection threshold
                links.append({
                    "source": df.iloc[i]['id'],
                    "target": df.iloc[neighbor_idx]['id'],
                    "similarity": round(float(sim_score), 3)
                })
    return links

if __name__ == "__main__":
    print(f"Fetching data for {len(TICKERS)} tickers...")
    data = []
    for t in tqdm(TICKERS):
        res = get_buffett_metrics(t)
        if res: data.append(res)
        
    if not data:
        print("No data fetched. Exiting.")
        exit(1)

    df = pd.DataFrame(data)
    df['buffettScore'] = calculate_buffett_score(df)
    links = build_similarity_links(df)
    
    output = {
        "nodes": df.to_dict(orient='records'),
        "links": links
    }
    
    # --- THE FIX IS HERE ---
    # Ensure data directory exists
    os.makedirs('data', exist_ok=True)
    
    # Write to 'data/graph_data.json' relative to the root (where the script runs)
    with open('data/graph_data.json', 'w') as f:
        json.dump(output, f, indent=2)
        
    print("Success: data/graph_data.json created.")
