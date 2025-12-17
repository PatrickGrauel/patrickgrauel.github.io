import yfinance as yf
import pandas as pd
import numpy as np
import json
import os
import time
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity
from tqdm import tqdm

# TARGET LIST
TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "BRK-B", "JNJ", "V", "PG", "KO", "PEP", 
    "COST", "MCD", "NVDA", "TSLA", "XOM", "META", "LLY", "AVGO", "JPM", "UNH",
    "DIS", "NKE", "INTC", "AMD", "NFLX", "ADBE", "CRM", "CMCSA", "VZ", "T"
]

def get_buffett_composite(ticker):
    try:
        stock = yf.Ticker(ticker)
        
        # 1. Fetch Financials
        inc = stock.financials.T.sort_index()
        bal = stock.balance_sheet.T.sort_index()
        cash = stock.cashflow.T.sort_index()
        info = stock.info
        
        if inc.empty or bal.empty: return None

        # Helper: Safe Extraction
        def get_val(df, key, default=0):
            try:
                val = df[key].iloc[-1]
                return float(val) if not pd.isna(val) else default
            except: return default

        # --- RAW DATA ---
        revenue = get_val(inc, 'Total Revenue')
        gross_profit = get_val(inc, 'Gross Profit')
        op_income = get_val(inc, 'Operating Income')
        net_income = get_val(inc, 'Net Income')
        interest = abs(get_val(inc, 'Interest Expense'))
        
        total_debt = get_val(bal, 'Total Debt')
        equity = get_val(bal, 'Stockholders Equity')
        shares = get_val(bal, 'Share Issued', default=info.get('sharesOutstanding', 1))
        
        fcf = info.get('freeCashflow', 0) or (get_val(cash, 'Free Cash Flow', 0))
        market_cap = info.get('marketCap', 1)

        # --- PILLAR 1: BUSINESS QUALITY (ROIC & Margins) ---
        # ROIC Proxy = Op Income / (Equity + Debt)
        invested_capital = equity + total_debt
        roic = (op_income / invested_capital) if invested_capital > 0 else 0
        gross_margin = (gross_profit / revenue) if revenue > 0 else 0
        
        score_quality = 0
        if roic > 0.20: score_quality += 50
        elif roic > 0.10: score_quality += 30
        if gross_margin > 0.40: score_quality += 50
        elif gross_margin > 0.20: score_quality += 25

        # --- PILLAR 2: FINANCIAL STRENGTH (Safety) ---
        interest_cov = (op_income / interest) if interest > 0 else 100
        de_ratio = (total_debt / equity) if equity > 0 else 10
        
        score_strength = 0
        if interest_cov > 10: score_strength += 50
        elif interest_cov > 5: score_strength += 30
        if de_ratio < 0.5: score_strength += 50
        elif de_ratio < 1.0: score_strength += 25

        # --- PILLAR 3: MOAT (Consistency) ---
        # We need historical margin volatility
        hist_gm = []
        if 'Gross Profit' in inc.columns and 'Total Revenue' in inc.columns:
            hist_gm = (inc['Gross Profit'] / inc['Total Revenue']).tolist()
        
        # Volatility penalty
        volatility = np.std(hist_gm) if len(hist_gm) > 1 else 0.5
        score_moat = 100 - (volatility * 500) # Penalize volatility heavily
        score_moat = max(0, min(100, score_moat))

        # --- PILLAR 4: MANAGEMENT (Capital Allocation) ---
        # FCF Conversion (FCF / Net Income)
        fcf_conv = (fcf / net_income) if net_income > 0 else 0
        # Buyback Check (Simple check: is share count decreasing? Hard with 1 datapoint, defaulting to FCF usage)
        
        score_mgmt = 0
        if fcf_conv > 0.8: score_mgmt += 50 # Converting earnings to cash
        if fcf > 0 and net_income > 0: score_mgmt += 50 # Profitable and cash flow positive

        # --- PILLAR 5: VALUATION (Price) ---
        # FCF Yield = FCF / Market Cap
        fcf_yield = (fcf / market_cap)
        
        score_value = 0
        if fcf_yield > 0.05: score_value = 100 # >5% yield is great for large caps
        elif fcf_yield > 0.03: score_value = 70
        elif fcf_yield > 0.01: score_value = 40
        else: score_value = 10

        # --- GATES (The "Kill Switch") ---
        penalty_cap = 100
        if interest_cov < 1.5: penalty_cap = 50 # Debt stress
        if net_income < 0: penalty_cap = 40 # Unprofitable
        
        # --- TOTAL SCORE ---
        # Weights: Quality(25%) + Strength(25%) + Moat(20%) + Mgmt(15%) + Value(15%)
        raw_score = (score_quality * 0.25) + (score_strength * 0.25) + (score_moat * 0.20) + (score_mgmt * 0.15) + (score_value * 0.15)
        
        final_score = min(raw_score, penalty_cap)

        return {
            "id": ticker,
            "name": info.get('shortName', ticker),
            "sector": info.get('sector', 'Unknown'),
            "buffettScore": round(final_score),
            "owner_earnings": fcf,
            # RADAR DATA
            "pillars": {
                "Quality": round(score_quality),
                "Strength": round(score_strength),
                "Moat": round(score_moat),
                "Management": round(score_mgmt),
                "Value": round(score_value)
            },
            # METRICS FOR SORTING
            "metrics": {
                "roic": roic,
                "gross_margin": gross_margin,
                "debt_to_equity": de_ratio,
                "fcf_yield": fcf_yield
            }
        }

    except Exception as e:
        print(f"⚠️ Error {ticker}: {e}")
        return None

def build_similarity_links(df):
    # Cluster based on the 5 Pillars (Structural Similarity)
    features = pd.DataFrame(df['pillars'].tolist())
    scaler = MinMaxScaler()
    features_norm = scaler.fit_transform(features)
    sim_matrix = cosine_similarity(features_norm)
    
    links = []
    for i in range(len(df)):
        similar_indices = sim_matrix[i].argsort()[-4:-1]
        for neighbor_idx in similar_indices:
            sim_score = sim_matrix[i][neighbor_idx]
            if sim_score > 0.85: 
                links.append({
                    "source": df.iloc[i]['id'],
                    "target": df.iloc[neighbor_idx]['id'],
                    "similarity": round(float(sim_score), 3)
                })
    return links

if __name__ == "__main__":
    print(f"🚀 Running Buffett Composite Scan...")
    data = []
    for t in tqdm(TICKERS):
        res = get_buffett_composite(t)
        if res: data.append(res)
        time.sleep(0.1)
        
    df = pd.DataFrame(data)
    links = build_similarity_links(df)
    
    output = {"nodes": df.to_dict(orient='records'), "links": links}
    
    os.makedirs('data', exist_ok=True)
    with open('data/graph_data.json', 'w') as f:
        json.dump(output, f, indent=2)
    print("✅ Done.")
