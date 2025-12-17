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
    # Tech / Growth
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ADBE", "CRM", "AMD", "INTC", "IBM", "QCOM",
    # Consumer / Staples
    "WMT", "PG", "KO", "PEP", "COST", "MCD", "NKE", "SBUX", "HD", "LOW", "DIS",
    # Financials
    "JPM", "V", "MA", "BRK-B", "BAC", "WFC", "GS", "MS", "AXP", "BLK",
    # Healthcare
    "JNJ", "UNH", "LLY", "PFE", "ABBV", "MRK", "TMO", "DHR",
    # Industrial / Energy
    "XOM", "CVX", "GE", "CAT", "UNP", "UPS", "HON", "LMT", "RTX", "BA",
    # DAX / Europe
    "SAP", "SIE.DE", "ALV.DE", "DTE.DE", "BMW.DE", "VOW3.DE", "AIR.DE"
]

# Magic Numbers for Buffett Score
SCORING = {
    'gross_margin': {'thresh': 40, 'pts': 10},
    'net_margin': {'thresh': 15, 'pts': 10},
    'roe': {'thresh': 15, 'pts': 15},
    'roic': {'thresh': 12, 'pts': 15},
    'debt_to_equity': {'thresh': 0.5, 'pts': 15, 'inverse': True}, # Lower is better
    'fcf_margin': {'thresh': 15, 'pts': 10},
    'sga_ratio': {'thresh': 30, 'pts': 10, 'inverse': True},
    'hist_consistency': {'pts': 15} # Bonus for stable history
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
        
        # Basic check
        if 'marketCap' not in info or info['marketCap'] == 0:
            return None

        # Fetch Financials
        inc = stock.financials
        bal = stock.balance_sheet
        cash = stock.cashflow
        
        if inc.empty or bal.empty:
            return None

        # 1. Current Year Metrics
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
        capex = abs(get_safe_val(cash, 'Capital Expenditure'))

        metrics = {
            'gross_margin': (gross / rev) * 100,
            'net_margin': (net / rev) * 100,
            'operating_margin': (op_inc / rev) * 100,
            'sga_ratio': (sga / gross) * 100 if gross > 0 else 0,
            'roe': (net / equity) * 100,
            'roic': (op_inc / (equity + debt)) * 100 if (equity+debt) > 0 else 0,
            'roa': (net / assets) * 100,
            'debt_to_equity': debt / equity if equity > 0 else 0,
            'fcf_margin': (fcf / rev) * 100,
            'capex_ratio': (capex / rev) * 100,
            'pe_ratio': info.get('trailingPE', 0),
            'pb_ratio': info.get('priceToBook', 0)
        }

        # 2. Historical Consistency (Last 3 years)
        consistency_bonus = 0
        try:
            years = min(3, len(inc.columns))
            margins = []
            for i in range(years):
                r = get_safe_val(inc, 'Total Revenue', i)
                g = get_safe_val(inc, 'Gross Profit', i)
                if r > 0: margins.append(g/r)
            
            # Bonus if margins are stable (variance < 5%)
            if len(margins) >= 3 and (max(margins) - min(margins)) < 0.05:
                consistency_bonus = SCORING['hist_consistency']['pts']
        except:
            pass

        # 3. Calculate Score
        score = 0
        score += SCORING['gross_margin']['pts'] if metrics['gross_margin'] > SCORING['gross_margin']['thresh'] else 0
        score += SCORING['net_margin']['pts'] if metrics['net_margin'] > SCORING['net_margin']['thresh'] else 0
        score += SCORING['roe']['pts'] if metrics['roe'] > SCORING['roe']['thresh'] else 0
        score += SCORING['roic']['pts'] if metrics['roic'] > SCORING['roic']['thresh'] else 0
        score += SCORING['fcf_margin']['pts'] if metrics['fcf_margin'] > SCORING['fcf_margin']['thresh'] else 0
        
        # Inverse metrics (Lower is better)
        score += SCORING['debt_to_equity']['pts'] if metrics['debt_to_equity'] < SCORING['debt_to_equity']['thresh'] else 0
        score += SCORING['sga_ratio']['pts'] if metrics['sga_ratio'] < SCORING['sga_ratio']['thresh'] else 0
        
        score += consistency_bonus
        metrics['buffett_score'] = min(score, 100)

        return {
            "id": ticker,
            "name": info.get('shortName', ticker),
            "sector": info.get('sector', 'Unknown'),
            "industry": info.get('industry', 'Unknown'),
            "marketCap": info.get('marketCap', 0),
            "buffettScore": int(score),
            "metrics": {k: round(v, 2) for k, v in metrics.items() if v is not None}
        }

    except Exception as e:
        print(f"Error {ticker}: {str(e)[:50]}")
        return None

def build_similarity_links(nodes, threshold=0.85):
    """
    Links stocks based on fundamental similarity using Cosine Similarity.
    Features: Margins, ROE, Debt, FCF.
    """
    if len(nodes) < 2: return []
    
    # Extract feature vectors
    features = []
    for n in nodes:
        m = n['metrics']
        # Vector: [Gross Margin, Net Margin, ROE, Debt/Eq, FCF %]
        vec = [
            m.get('gross_margin', 0),
            m.get('net_margin', 0),
            m.get('roe', 0),
            -1 * m.get('debt_to_equity', 0), # Invert debt so lower is "better/similar" to high quality
            m.get('fcf_margin', 0)
        ]
        features.append(vec)
    
    # Normalize
    scaler = MinMaxScaler()
    features_norm = scaler.fit_transform(features)
    
    # Calculate Similarity
    sim_matrix = cosine_similarity(features_norm)
    
    links = []
    for i in range(len(nodes)):
        # Get top 3 similar stocks (excluding self)
        # argsort returns indices of sorted values (low to high), we take last 4 (self is 1)
        similar_indices = sim_matrix[i].argsort()[-4:-1]
        
        for idx in similar_indices:
            sim_score = sim_matrix[i][idx]
            if sim_score > threshold:
                links.append({
                    "source": nodes[i]['id'],
                    "target": nodes[idx]['id'],
                    "value": float(sim_score),
                    "type": "fundamental" # Mark this as a fundamental link
                })
    return links

def main():
    print("="*60)
    print("BUFFETT SCANNER v2.0 (Consolidated)")
    print("="*60)
    
    nodes = []
    
    # 1. Fetch Data
    print(f"Fetching data for {len(TARGET_TICKERS)} tickers...")
    for i, ticker in enumerate(TARGET_TICKERS):
        print(f"[{i+1}/{len(TARGET_TICKERS)}] {ticker}...", end=" ")
        sys.stdout.flush()
        
        data = analyze_stock(ticker)
        if data:
            nodes.append(data)
            print(f"✅ Score: {data['buffettScore']}")
        else:
            print("❌ Failed/Skipped")
            
        # Rate limiting prevents IP bans
        if i % 5 == 0: time.sleep(0.5)

    # 2. Safety Check
    if len(nodes) == 0:
        print("\n❌ CRITICAL: No data fetched. Aborting save to protect existing data.")
        sys.exit(1)

    # 3. Build Links (Fundamental Similarity)
    print("\nCalculating fundamental similarities...")
    links = build_similarity_links(nodes)
    print(f"Generated {len(links)} links based on financial metrics.")

    # 4. Calculate Industry Averages
    print("Calculating industry benchmarks...")
    ind_stats = {}
    for n in nodes:
        ind = n['industry']
        if ind not in ind_stats: ind_stats[ind] = {'gross_margin': [], 'roe': [], 'debt_to_equity': []}
        ind_stats[ind]['gross_margin'].append(n['metrics'].get('gross_margin', 0))
        ind_stats[ind]['roe'].append(n['metrics'].get('roe', 0))
        ind_stats[ind]['debt_to_equity'].append(n['metrics'].get('debt_to_equity', 0))
    
    ind_avgs = {}
    for ind, stats in ind_stats.items():
        ind_avgs[ind] = {k: round(np.mean(v), 2) for k, v in stats.items()}

    # 5. Save
    output = {
        "nodes": nodes,
        "links": links,
        "industry_averages": ind_avgs,
        "metadata": {"generated_at": datetime.now().isoformat()}
    }
    
    os.makedirs("data", exist_ok=True)
    with open("data/graph_data.json", "w") as f:
        json.dump(output, f, indent=2)
        
    print(f"\n✅ SUCCESS: Saved {len(nodes)} nodes and {len(links)} links to data/graph_data.json")

if __name__ == "__main__":
    main()
