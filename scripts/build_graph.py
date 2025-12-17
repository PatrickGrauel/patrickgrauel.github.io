
import yfinance as yf
import pandas as pd
import numpy as np
import json
import time
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity
from tqdm import tqdm

# --- CONFIGURATION ---
# For dev, start with a smaller list. For prod, fetch full S&P 500 list.
TICKERS = ["AAPL", "MSFT", "GOOGL", "AMZN", "BRK-B", "JNJ", "V", "PG", "KO", "PEP", "COST", "MCD", "NVDA", "TSLA", "XOM"]

def get_buffett_metrics(ticker):
    """
    Fetches raw financials. Returns None if data is missing/corrupt.
    """
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        # 1. Owner Earnings Proxy (Free Cash Flow)
        fcf = info.get('freeCashflow', 0)
        
        # 2. Return on Invested Capital (ROIC) or ROE
        roe = info.get('returnOnEquity', 0)

        return {
            "id": ticker,
            "name": info.get('shortName', ticker),
            "sector": info.get('sector', 'Unknown'),
            # METRICS
            "grossMargins": info.get('grossMargins', 0),
            "debtToEquity": info.get('debtToEquity', 100), # Default to risky if missing
            "roe": roe,
            "ownerEarnings": fcf if fcf is not None else 0
        }
    except Exception as e:
        print(f"Failed {ticker}: {e}")
        return None

def calculate_buffett_score(df):
    """
    0-100 Score based on Margins (Moat), Debt (Safety), and ROE (Efficiency).
    """
    scores = []
    for _, row in df.iterrows():
        score = 0
        
        # 1. MOAT: Gross Margins (40pts)
        gm = row['grossMargins']
        if gm > 0.40: score += 40
        elif gm > 0.20: score += 20
        else: score += 5
        
        # 2. SAFETY: Debt/Equity (30pts)
        # yfinance returns D/E as %, e.g., 150 for 1.5. Target < 50.
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
    """
    Connects stocks based on fundamental vector similarity (Cosine).
    """
    features = df[['grossMargins', 'debtToEquity', 'roe']].fillna(0)
    scaler = MinMaxScaler()
    features_norm = scaler.fit_transform(features)
    sim_matrix = cosine_similarity(features_norm)
    
    links = []
    # For each stock, connect to top 3 most similar peers
    for i in range(len(df)):
        # Get indices of top similar stocks (excluding self)
        # argsort is ascending, take last 4 items, exclude last one (self)
        similar_indices = sim_matrix[i].argsort()[-4:-1]
        
        for neighbor_idx in similar_indices:
            sim_score = sim_matrix[i][neighbor_idx]
            if sim_score > 0.80: # Only strong connections
                links.append({
                    "source": df.iloc[i]['id'],
                    "target": df.iloc[neighbor_idx]['id'],
                    "similarity": round(float(sim_score), 3)
                })
    return links

# --- EXECUTION ---
if __name__ == "__main__":
    print(f"Fetching data for {len(TICKERS)} tickers...")
    data = []
    for t in tqdm(TICKERS):
        res = get_buffett_metrics(t)
        if res: data.append(res)
        
    df = pd.DataFrame(data)
    
    print("Calculating Buffett Scores...")
    df['buffettScore'] = calculate_buffett_score(df)
    
    print("Building Similarity Graph...")
    links = build_similarity_links(df)
    
    output = {
        "nodes": df.to_dict(orient='records'),
        "links": links
    }
    
    # Save to data folder
    with open('../data/graph_data.json', 'w') as f:
        json.dump(output, f, indent=2)
        
    print("Done! ../data/graph_data.json created.")
