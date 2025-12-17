import yfinance as yf
import json
import os
import sys
import pandas as pd
import numpy as np
from datetime import datetime
import time
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity

# --- CONFIGURATION ---
TARGET_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ADBE", "CRM", "AMD", "INTC", "IBM", "QCOM",
    "WMT", "PG", "KO", "PEP", "COST", "MCD", "NKE", "SBUX", "HD", "LOW", "DIS",
    "JPM", "V", "MA", "BRK-B", "BAC", "WFC", "GS", "MS", "AXP", "BLK",
    "JNJ", "UNH", "LLY", "PFE", "ABBV", "MRK", "TMO", "DHR",
    "XOM", "CVX", "GE", "CAT", "UNP", "UPS", "HON", "LMT", "RTX", "BA",
    "SAP", "SIE.DE", "ALV.DE", "DTE.DE", "BMW.DE", "VOW3.DE", "AIR.DE"
]

SCORING = {
    'gross_margin': {'thresh': 40, 'pts': 10},
    'net_margin': {'thresh': 15, 'pts': 10},
    'roe': {'thresh': 15, 'pts': 15},
    'roic': {'thresh': 12, 'pts': 15},
    'debt_to_equity': {'thresh': 0.5, 'pts': 15, 'inverse': True},
    'fcf_margin': {'thresh': 15, 'pts': 10},
    'sga_ratio': {'thresh': 30, 'pts': 10, 'inverse': True},
    'hist_consistency': {'pts': 15}
}

def get_safe_val(df, key, row=0, default=0):
    try:
        val = df.iloc[:, row].get(key, default)
        return float(val) if val is not None else default
    except:
        return default

def analyze_stock(ticker):
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        if 'marketCap' not in info or info['marketCap'] == 0: return None

        inc = stock.financials
        bal = stock.balance_sheet
        cash = stock.cashflow
        
        if inc.empty or bal.empty: return None

        # 1. Current Snapshot
        rev = get_safe_val(inc, 'Total Revenue')
        if rev == 0: rev = get_safe_val(inc, 'Total Revenues', default=1)
        gross = get_safe_val(inc, 'Gross Profit')
        net = get_safe_val(inc, 'Net Income')
        op_inc = get_safe_val(inc, 'Operating Income')
        sga = get_safe_val(inc, 'Selling General Administrative')
        equity = get_safe_val(bal, 'Stockholders Equity', default=1)
        debt = get_safe_val(bal, 'Total Debt')
        assets = get_safe_val(bal, 'Total Assets', default=1)
        fcf = get_safe_val(cash, 'Free Cash Flow')

        metrics = {
            'gross_margin': (gross / rev) * 100,
            'net_margin': (net / rev) * 100,
            'roe': (net / equity) * 100,
            'roic': (op_inc / (equity + debt)) * 100 if (equity+debt) > 0 else 0,
            'debt_to_equity': debt / equity if equity > 0 else 0,
            'fcf_margin': (fcf / rev) * 100,
            'sga_ratio': (sga / gross) * 100 if gross > 0 else 0,
            'pe_ratio': info.get('trailingPE', 0),
        }

        # 2. Historical Data
        history = {}
        def build_history(num_key, den_key):
            data = []
            cols = inc.columns[:5][::-1] 
            for col in cols:
                try:
                    num = float(inc[col].get(num_key, 0))
                    den = float(inc[col].get(den_key, 0))
                    if den != 0:
                        data.append({"date": str(col)[:4], "value": (num/den)*100})
                except: continue
            return data

        history['gross_margin'] = build_history('Gross Profit', 'Total Revenue')
        history['net_margin'] = build_history('Net Income', 'Total Revenue')
        
        roe_data = []
        cols = inc.columns[:5][::-1]
        for col in cols:
            try:
                idx = inc.columns.get_loc(col)
                if idx < len(bal.columns):
                    ni = float(inc[col].get('Net Income', 0))
                    eq = float(bal.iloc[:, idx].get('Stockholders Equity', 1))
                    if eq > 0: roe_data.append({"date": str(col)[:4], "value": (ni/eq)*100})
            except: continue
        history['roe'] = roe_data

        # 3. Score
        score = 0
        score += SCORING['gross_margin']['pts'] if metrics['gross_margin'] > SCORING['gross_margin']['thresh'] else 0
        score += SCORING['net_margin']['pts'] if metrics['net_margin'] > SCORING['net_margin']['thresh'] else 0
        score += SCORING['roe']['pts'] if metrics['roe'] > SCORING['roe']['thresh'] else 0
        score += SCORING['roic']['pts'] if metrics['roic'] > SCORING['roic']['thresh'] else 0
        score += SCORING['fcf_margin']['pts'] if metrics['fcf_margin'] > SCORING['fcf_margin']['thresh'] else 0
        score += SCORING['debt_to_equity']['pts'] if metrics['debt_to_equity'] < SCORING['debt_to_equity']['thresh'] else 0
        score += SCORING['sga_ratio']['pts'] if metrics['sga_ratio'] < SCORING['sga_ratio']['thresh'] else 0
        
        if len(history['gross_margin']) >= 3:
            vals = [x['value'] for x in history['gross_margin']]
            if max(vals) - min(vals) < 5: score += 15

        metrics['buffett_score'] = min(score, 100)

        return {
            "id": ticker,
            "name": info.get('shortName', ticker),
            "sector": info.get('sector', 'Unknown'),
            "industry": info.get('industry', 'Unknown'),
            "marketCap": info.get('marketCap', 0),
            "buffettScore": int(score),
            "metrics": {k: round(v, 2) for k, v in metrics.items() if v is not None},
            "history": history
        }

    except Exception as e:
        return None

def build_similarity_links(nodes, threshold=0.70):
    if len(nodes) < 2: return []
    
    features = []
    for n in nodes:
        m = n['metrics']
        features.append([
            m.get('gross_margin', 0),
            m.get('net_margin', 0),
            m.get('roe', 0),
            -1 * m.get('debt_to_equity', 0),
            m.get('fcf_margin', 0)
        ])
    
    scaler = MinMaxScaler()
    features_norm = scaler.fit_transform(features)
    sim_matrix = cosine_similarity(features_norm)
    
    links = []
    for i in range(len(nodes)):
        # Take top 3 most similar
        similar_indices = sim_matrix[i].argsort()[-4:-1]
        for idx in similar_indices:
            sim_score = sim_matrix[i][idx]
            # Use lower threshold to ensure connectivity
            if sim_score > threshold:
                links.append({
                    "source": nodes[i]['id'],
                    "target": nodes[idx]['id'],
                    "value": float(sim_score)
                })
    return links

def main():
    print("="*60 + "\nBUFFETT SCANNER v2.2 (Fixing Connectivity)\n" + "="*60)
    
    nodes = []
    for i, ticker in enumerate(TARGET_TICKERS):
        print(f"[{i+1}/{len(TARGET_TICKERS)}] {ticker}...", end=" ")
        sys.stdout.flush()
        data = analyze_stock(ticker)
        if data:
            nodes.append(data)
            print(f"✅ Score: {data['buffettScore']}")
        else:
            print("❌ Failed")
        if i % 5 == 0: time.sleep(0.5)

    if not nodes: sys.exit(1)

    print("\nBuilding links (Threshold 0.70)...")
    links = build_similarity_links(nodes, threshold=0.70)
    print(f"Generated {len(links)} connections.")

    # Industry Averages
    ind_stats = {}
    for n in nodes:
        ind = n['industry']
        if ind not in ind_stats: ind_stats[ind] = {'gross_margin': [], 'roe': [], 'debt_to_equity': [], 'net_margin': []}
        ind_stats[ind]['gross_margin'].append(n['metrics'].get('gross_margin', 0))
        ind_stats[ind]['net_margin'].append(n['metrics'].get('net_margin', 0))
        ind_stats[ind]['roe'].append(n['metrics'].get('roe', 0))
        ind_stats[ind]['debt_to_equity'].append(n['metrics'].get('debt_to_equity', 0))
    
    ind_avgs = {}
    for ind, stats in ind_stats.items():
        ind_avgs[ind] = {k: round(np.mean(v), 2) for k, v in stats.items()}

    output = {
        "nodes": nodes,
        "links": links,
        "industry_averages": ind_avgs,
        "metadata": {"generated_at": datetime.now().isoformat()}
    }
    
    os.makedirs("data", exist_ok=True)
    with open("data/graph_data.json", "w") as f:
        json.dump(output, f, indent=2)
    print("\n✅ Data saved.")

if __name__ == "__main__":
    main()
