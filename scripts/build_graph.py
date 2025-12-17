import yfinance as yf
import pandas as pd
import numpy as np
import json
import os
import time
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity
from tqdm import tqdm

# EXPANDED TARGET LIST (30+ Tickers)
TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "BRK-B", "JNJ", "V", "PG", "KO", "PEP", 
    "COST", "MCD", "NVDA", "TSLA", "XOM", "META", "LLY", "AVGO", "JPM", "UNH",
    "DIS", "NKE", "INTC", "AMD", "NFLX", "ADBE", "CRM", "CMCSA", "VZ", "T",
    "BMW.DE", "SIE.DE", "SAP", "OR.PA", "MC.PA"
]

def get_data(ticker):
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        # Fetch Financials (Full History available)
        inc = stock.financials.T.sort_index()
        bal = stock.balance_sheet.T.sort_index()
        cash = stock.cashflow.T.sort_index()
        
        if inc.empty or bal.empty: return None

        # --- HELPERS ---
        def safe_get(df, key):
            if key in df: return df[key]
            return pd.Series(dtype=float)

        # --- 1. HISTORICAL SERIES (For Charts) ---
        # We align everything to the Income Statement dates
        dates = inc.index.strftime('%Y').tolist()
        
        # Extract Series
        rev_series = safe_get(inc, 'Total Revenue')
        gp_series = safe_get(inc, 'Gross Profit')
        ni_series = safe_get(inc, 'Net Income')
        debt_series = safe_get(bal, 'Total Debt').reindex(inc.index, method='nearest')
        equity_series = safe_get(bal, 'Stockholders Equity').reindex(inc.index, method='nearest')
        capex_series = abs(safe_get(cash, 'Capital Expenditure')).reindex(inc.index, method='nearest')
        fcf_series = (safe_get(cash, 'Free Cash Flow')).reindex(inc.index, method='nearest')

        # Calculate Metric Series (Aligned)
        # 1. Gross Margin
        gm_series = (gp_series / rev_series).fillna(0)
        # 2. Debt/Equity
        de_series = (debt_series / equity_series).fillna(0)
        # 3. ROIC Proxy (Net Income / (Equity + Debt)) - simplified
        invested_cap = equity_series + debt_series
        roic_series = (ni_series / invested_cap).fillna(0)
        
        # Format for JSON: [{year: '2020', value: 0.45}, ...]
        def to_hist(series):
            return [{"year": d, "value": round(float(v), 4)} 
                    for d, v in zip(dates, series) if not pd.isna(v)]

        history = {
            "gross_margin": to_hist(gm_series),
            "debt_to_equity": to_hist(de_series),
            "roic": to_hist(roic_series),
            "fcf": to_hist(fcf_series),
            "revenue": to_hist(rev_series)
        }

        # --- 2. SNAPSHOT METRICS (For Scoring & Radar) ---
        # Use Weighted Average of last 4 years for performance metrics
        def w_avg(s): 
            if len(s) == 0: return 0
            vals = s.tail(4).values
            weights = np.arange(1, len(vals)+1)
            return float(np.average(vals, weights=weights))

        # Current Values (Snapshot)
        curr_debt = float(debt_series.iloc[-1]) if not debt_series.empty else 0
        curr_equity = float(equity_series.iloc[-1]) if not equity_series.empty else 1
        curr_fcf = float(fcf_series.iloc[-1]) if not fcf_series.empty else 0
        
        # Averages
        avg_gm = w_avg(gm_series)
        avg_roic = w_avg(roic_series)
        avg_de = w_avg(de_series)

        # --- 3. SCORING (Buffett Composite) ---
        score = 0
        # Quality
        if avg_gm > 0.40: score += 20
        elif avg_gm > 0.20: score += 10
        if avg_roic > 0.15: score += 20
        
        # Health
        if avg_de < 0.8: score += 20
        elif avg_de < 2.0: score += 10
        
        # Value/Growth
        fcf_yield = (curr_fcf / info.get('marketCap', 1e9)) if info.get('marketCap') else 0
        if fcf_yield > 0.05: score += 20
        
        # Consistency Bonus (Low Volatility in Margins)
        if gm_series.std() < 0.05: score += 20
        
        score = min(score, 100)

        return {
            "id": ticker,
            "name": info.get('shortName', ticker),
            "sector": info.get('sector', 'Unknown'),
            "industry": info.get('industry', 'Unknown'), # NEW: For drilldown
            "buffettScore": int(score),
            "owner_earnings": curr_fcf,
            "pillars": {
                "Quality": min(int(avg_gm * 200), 100), # Mock mapping
                "Strength": min(int((1/avg_de)*50), 100) if avg_de > 0 else 100,
                "Moat": min(int(avg_roic * 500), 100),
                "Value": min(int(fcf_yield * 1000), 100),
                "Growth": 50 # Placeholder
            },
            "metrics": {
                "gross_margin": float(avg_gm),
                "debt_to_equity": float(avg_de),
                "roic": float(avg_roic),
                "fcf_yield": float(fcf_yield)
            },
            "history": history # NEW: Full time series
        }

    except Exception as e:
        print(f"⚠️ {ticker}: {e}")
        return None

def build_graph(df):
    # Cluster by Metrics
    features = pd.DataFrame(df['pillars'].tolist()).fillna(0)
    scaler = MinMaxScaler()
    sim_matrix = cosine_similarity(scaler.fit_transform(features))
    
    links = []
    for i in range(len(df)):
        # Top 3 neighbors
        for idx in sim_matrix[i].argsort()[-4:-1]:
            sim = sim_matrix[i][idx]
            if sim > 0.75:
                links.append({
                    "source": df.iloc[i]['id'],
                    "target": df.iloc[idx]['id'],
                    "similarity": round(float(sim), 3)
                })
    return links

if __name__ == "__main__":
    data = []
    for t in tqdm(TICKERS):
        res = get_data(t)
        if res: data.append(res)
        time.sleep(0.1)
        
    df = pd.DataFrame(data)
    links = build_graph(df)
    
    os.makedirs('data', exist_ok=True)
    with open('data/graph_data.json', 'w') as f:
        json.dump({"nodes": df.to_dict(orient='records'), "links": links}, f)
