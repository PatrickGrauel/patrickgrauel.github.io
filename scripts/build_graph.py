import yfinance as yf
import pandas as pd
import numpy as np
import json
import os
import time
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity
from tqdm import tqdm

# EXPANDED TARGET LIST
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
        
        # Fetch Financials
        inc = stock.financials.T.sort_index()
        bal = stock.balance_sheet.T.sort_index()
        cash = stock.cashflow.T.sort_index()
        
        if inc.empty or bal.empty: return None

        # --- HELPERS ---
        def safe_get(df, key):
            if key in df: return df[key]
            return pd.Series(dtype=float)

        # --- 1. HISTORICAL SERIES ---
        dates = inc.index.strftime('%Y').tolist()
        
        rev_series = safe_get(inc, 'Total Revenue')
        gp_series = safe_get(inc, 'Gross Profit')
        ni_series = safe_get(inc, 'Net Income')
        rd_series = safe_get(inc, 'Research And Development').fillna(0)
        debt_series = safe_get(bal, 'Total Debt').reindex(inc.index, method='nearest')
        equity_series = safe_get(bal, 'Stockholders Equity').reindex(inc.index, method='nearest')
        fcf_series = (safe_get(cash, 'Free Cash Flow')).reindex(inc.index, method='nearest')

        # Calculate Metric Series
        gm_series = (gp_series / rev_series).fillna(0)
        de_series = (debt_series / equity_series).fillna(0)
        
        # R&D / Gross Profit (Specific User Request)
        rd_gp_series = (rd_series / gp_series).fillna(0)

        # ROIC Proxy
        invested_cap = equity_series + debt_series
        roic_series = (ni_series / invested_cap).fillna(0)
        
        def to_hist(series):
            return [{"year": d, "value": round(float(v), 4)} 
                    for d, v in zip(dates, series) if not pd.isna(v)]

        history = {
            "gross_margin": to_hist(gm_series),
            "debt_to_equity": to_hist(de_series),
            "roic": to_hist(roic_series),
            "rd_to_gp": to_hist(rd_gp_series),
            "fcf": to_hist(fcf_series)
        }

        # --- 2. SNAPSHOT METRICS ---
        def w_avg(s): 
            if len(s) == 0: return 0
            vals = s.tail(4).values
            weights = np.arange(1, len(vals)+1)
            return float(np.average(vals, weights=weights))

        curr_fcf = float(fcf_series.iloc[-1]) if not fcf_series.empty else 0
        avg_gm = w_avg(gm_series)
        avg_roic = w_avg(roic_series)
        avg_de = w_avg(de_series)
        avg_rd_gp = w_avg(rd_gp_series)

        # --- 3. SCORING ---
        score = 0
        if avg_gm > 0.40: score += 20
        elif avg_gm > 0.20: score += 10
        if avg_roic > 0.15: score += 20
        if avg_de < 0.8: score += 20
        elif avg_de < 2.0: score += 10
        
        fcf_yield = (curr_fcf / info.get('marketCap', 1e9)) if info.get('marketCap') else 0
        if fcf_yield > 0.05: score += 20
        if gm_series.std() < 0.05: score += 20
        
        score = min(score, 100)

        return {
            "id": ticker,
            "name": info.get('shortName', ticker),
            "sector": info.get('sector', 'Unknown'),
            "industry": info.get('industry', 'Unknown'),
            "buffettScore": int(score),
            "owner_earnings": curr_fcf,
            "pillars": {
                "Quality": min(int(avg_gm * 200), 100),
                "Strength": min(int((1/(avg_de+0.1))*50), 100),
                "Moat": min(int(avg_roic * 500), 100),
                "Value": min(int(fcf_yield * 1000), 100),
                "Growth": 50
            },
            "metrics": {
                "gross_margin": float(avg_gm),
                "debt_to_equity": float(avg_de),
                "roic": float(avg_roic),
                "fcf_yield": float(fcf_yield),
                "rd_to_gp": float(avg_rd_gp)
            },
            "history": history
        }

    except Exception as e:
        print(f"⚠️ {ticker}: {e}")
        return None

def build_graph(df):
    # 1. CALCULATE SECTOR AVERAGES
    sector_stats = {}
    sectors = df['sector'].unique()
    
    for s in sectors:
        if s == 'Unknown': continue
        subset = df[df['sector'] == s]
        sector_stats[s] = {
            "gross_margin": subset['metrics'].apply(lambda x: x['gross_margin']).median(),
            "debt_to_equity": subset['metrics'].apply(lambda x: x['debt_to_equity']).median(),
            "roic": subset['metrics'].apply(lambda x: x['roic']).median(),
            "fcf_yield": subset['metrics'].apply(lambda x: x['fcf_yield']).median(),
            "rd_to_gp": subset['metrics'].apply(lambda x: x['rd_to_gp']).median()
        }
    
    # 2. INJECT AVERAGES INTO NODES
    def inject_benchmark(row):
        sec = row['sector']
        if sec in sector_stats:
            row['sector_avg'] = sector_stats[sec]
        else:
            row['sector_avg'] = row['metrics'] # Fallback to self
        return row

    df = df.apply(inject_benchmark, axis=1)

    # 3. BUILD LINKS
    features = pd.DataFrame(df['pillars'].tolist()).fillna(0)
    scaler = MinMaxScaler()
    sim_matrix = cosine_similarity(scaler.fit_transform(features))
    
    links = []
    for i in range(len(df)):
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
