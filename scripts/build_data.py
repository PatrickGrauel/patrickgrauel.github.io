import os
import json
import numpy as np
from datetime import datetime
from fetcher import fetch_ticker_data
from metrics import compute_buffett_metrics
from scorer import score_universe
from sklearn.neighbors import NearestNeighbors
import pandas as pd

# Define your universe here
TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA", 
    "BRK-B", "JPM", "V", "JNJ", "WMT", "PG", "XOM", "MA", 
    "UNH", "HD", "CVX", "MRK", "KO", "PEP", "ABBV", "COST", 
    "ADBE", "MCD", "CSCO", "CRM", "ACN", "NFLX", "AMD", 
    "INTC", "DIS", "NKE", "T", "VZ", "ORCL", "IBM", "QCOM",
    "PM", "GE", "CAT", "BA", "HON", "MMM", "LMT", "RTX"
]

def sanitize(obj):
    """Recursively clean NaNs/Infs for JSON safety"""
    if isinstance(obj, float):
        return 0 if (np.isnan(obj) or np.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(v) for v in obj]
    return obj

def build():
    print("🚀 Starting MoatMap Data Build...")
    
    raw_cache = {}
    
    # 1. Fetch & Metrics
    print("📥 Fetching Data...")
    for ticker in TICKERS:
        print(f"   -> {ticker}")
        raw = fetch_ticker_data(ticker)
        if not raw: continue
        
        metrics, history = compute_buffett_metrics(raw)
        
        raw_cache[ticker] = {
            "meta": {
                "name": raw['info'].get('shortName', ticker),
                "sector": raw['info'].get('sector', 'Other'),
                "industry": raw['info'].get('industry', 'Other'),
                "marketCap": raw['info'].get('marketCap', 0),
                "price": raw['info'].get('currentPrice', 0)
            },
            "metrics": metrics,
            "history": history
        }

    if not raw_cache:
        print("❌ No data fetched. Exiting.")
        return

    # 2. Scoring
    print("🧮 Calculating Sector Scores...")
    scored_data = score_universe(raw_cache)

    # 3. Network Generation (KNN)
    print("🕸️ Generating Network...")
    
    # Prepare feature matrix (using scores)
    ids = list(scored_data.keys())
    features = []
    for t in ids:
        d = scored_data[t]
        # Vector: [Growth, Profitability, Health, Efficiency]
        vec = [
            d['groups']['Growth'],
            d['groups']['Pricing'],
            d['groups']['Health'],
            d['groups']['Efficiency']
        ]
        features.append(vec)
    
    if len(features) > 2:
        knn = NearestNeighbors(n_neighbors=min(6, len(features)), metric='cosine')
        knn.fit(features)
        distances, indices = knn.kneighbors(features)
        
        links = []
        for i, neighbors in enumerate(indices):
            source = ids[i]
            for j, neighbor_idx in enumerate(neighbors):
                if i == neighbor_idx: continue # Skip self
                
                # Similarity = 1 - Distance (Cosine distance is 0-2 usually, but here normalized)
                # Simple inverse mapping
                similarity = 1 - distances[i][j]
                
                if similarity > 0.85: # Threshold
                    links.append({
                        "source": source,
                        "target": ids[neighbor_idx],
                        "weight": round(similarity, 2)
                    })
    else:
        links = []

    # 4. Save Artifacts
    print("💾 Saving JSON Artifacts...")
    os.makedirs("public/data/tickers", exist_ok=True)
    
    # Universe (Lightweight)
    universe = []
    for t, d in scored_data.items():
        universe.append({
            "id": t,
            "n": d['meta']['name'],
            "s": d['meta']['sector'],
            "mc": d['meta']['marketCap'],
            "sc": d['moat_score'],
            "gx": d['groups']['Growth'], # For quick filtering
            "gy": d['groups']['Efficiency']
        })
    
    with open("public/data/universe.json", "w") as f:
        json.dump(sanitize(universe), f)
        
    # Network
    with open("public/data/network.json", "w") as f:
        json.dump(sanitize({"nodes": universe, "links": links}), f)
        
    # Individual Files
    for t, d in scored_data.items():
        with open(f"public/data/tickers/{t}.json", "w") as f:
            json.dump(sanitize(d), f)
            
    # Meta
    with open("public/data/meta.json", "w") as f:
        json.dump({"last_updated": datetime.now().isoformat(), "count": len(universe)}, f)

    print("✅ Build Complete.")

if __name__ == "__main__":
    build()
