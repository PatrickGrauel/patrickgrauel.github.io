import yfinance as yf
import pandas as pd
import numpy as np
import json
import os
import time
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity
from tqdm import tqdm

# EXPANDED LIST (For testing robustness)
# In production, load this from a csv like 'sp500.csv'
TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "BRK-B", "JNJ", "V", "PG", "KO", "PEP", 
    "COST", "MCD", "NVDA", "TSLA", "XOM", "META", "LLY", "AVGO", "JPM", "UNH",
    "DIS", "NKE", "INTC", "AMD", "NFLX", "ADBE", "CRM", "CMCSA", "VZ", "T"
]

def fetch_history(ticker):
    """
    Fetches 4 years of history to check STABILITY.
    Returns a dict of aggregated metrics.
    """
    try:
        stock = yf.Ticker(ticker)
        
        # 1. Fetch Financials (Income Statement)
        # We need history to prove consistency (The "Moat")
        income = stock.financials
        balance = stock.balance_sheet
        
        if income.empty or balance.empty:
            return None

        # 2. Extract Key Series (Last 4 Years)
        # Transpose so rows = years, cols = metrics
        inc_T = income.T.sort_index(ascending=True).tail(4)
        bal_T = balance.T.sort_index(ascending=True).tail(4)

        # 3. Calculate "Moat" Stability (Gross Margin Consistency)
        # Gross Margin = Gross Profit / Total Revenue
        if 'Gross Profit' in inc_T and 'Total Revenue' in inc_T:
            margins = inc_T['Gross Profit'] / inc_T['Total Revenue']
            avg_margin = margins.mean()
            # Stability = Lower Standard Deviation is better
            margin_volatility = margins.std() 
        else:
            avg_margin = 0
            margin_volatility = 1.0 # High volatility penalty

        # 4. Calculate "Safety" (Debt to Equity)
        # Taking the most recent year
        recent_debt = bal_T['Total Debt'].iloc[-1] if 'Total Debt' in bal_T else 0
        recent_equity = bal_T['Stockholders Equity'].iloc[-1] if 'Stockholders Equity' in bal_T else 1
        debt_to_equity = recent_debt / recent_equity

        # 5. Owner Earnings Proxy (Latest FCF)
        # FCF data often lives in the 'info' or cashflow statement. 
        # For speed/reliability, we stick to 'info' for the absolute latest snapshot.
        info = stock.info
        fcf = info.get('freeCashflow', 0)
        roe = info.get('returnOnEquity', 0)

        return {
            "id": ticker,
            "name": info.get('shortName', ticker),
            "sector": info.get('sector', 'Unknown'),
            # DEEP METRICS
            "avg_gross_margin": float(avg_margin),
            "margin_volatility": float(0 if np.isnan(margin_volatility) else margin_volatility),
            "debt_to_equity": float(debt_to_equity),
            "roe": float(roe),
            "owner_earnings": fcf if fcf is not None else 0
        }

    except Exception as e:
        # Don't crash the whole script if one ticker fails
        print(f"⚠️ Error fetching {ticker}: {e}")
        return None

def calculate_advanced_score(df):
    """
    Scores (0-100) based on Consistency + Quality.
    """
    scores = []
    for _, row in df.iterrows():
        score = 0
        
        # 1. MOAT STRENGTH (40 pts)
        # Reward High Margins AND Low Volatility
        gm = row['avg_gross_margin']
        vol = row['margin_volatility']
        
        if gm > 0.40: score += 30
        elif gm > 0.20: score += 15
        
        # Stability Bonus (If margins barely moved in 4 years)
        if vol < 0.02: score += 10 # Rock solid
        elif vol < 0.05: score += 5
        
        # 2. FORTRESS BALANCE SHEET (30 pts)
        de = row['debt_to_equity']
        if de < 0.5: score += 30
        elif de < 1.0: score += 15
        
        # 3. CAPITAL EFFICIENCY (30 pts)
        roe = row['roe']
        if roe > 0.20: score += 30
        elif roe > 0.12: score += 15
        
        scores.append(round(score))
    return scores

def build_similarity_links(df):
    # Cluster by: Margins, Debt, ROE, AND Volatility
    features = df[['avg_gross_margin', 'debt_to_equity', 'roe', 'margin_volatility']].fillna(0)
    scaler = MinMaxScaler()
    features_norm = scaler.fit_transform(features)
    sim_matrix = cosine_similarity(features_norm)
    
    links = []
    for i in range(len(df)):
        similar_indices = sim_matrix[i].argsort()[-4:-1]
        for neighbor_idx in similar_indices:
            sim_score = sim_matrix[i][neighbor_idx]
            if sim_score > 0.75: 
                links.append({
                    "source": df.iloc[i]['id'],
                    "target": df.iloc[neighbor_idx]['id'],
                    "similarity": round(float(sim_score), 3)
                })
    return links

if __name__ == "__main__":
    print(f"🚀 Starting Deep Scan on {len(TICKERS)} tickers...")
    
    data = []
    # Using TQDM for progress bar
    for t in tqdm(TICKERS):
        res = fetch_history(t)
        if res: 
            data.append(res)
        # RATE LIMIT PROTECTION: Sleep 0.5s between requests
        time.sleep(0.5)
        
    if not data:
        print("❌ Critical: No data fetched.")
        exit(1)

    df = pd.DataFrame(data)
    print("📊 Calculating Buffett Scores...")
    df['buffettScore'] = calculate_advanced_score(df)
    
    print("🕸️ Building Network Connections...")
    links = build_similarity_links(df)
    
    output = {
        "nodes": df.to_dict(orient='records'),
        "links": links
    }
    
    os.makedirs('data', exist_ok=True)
    with open('data/graph_data.json', 'w') as f:
        json.dump(output, f, indent=2)
        
    print(f"✅ Success! Generated {len(df)} nodes and {len(links)} connections.")
