import yfinance as yf
import json
import os
import pandas as pd
import numpy as np
from datetime import datetime
import time
import sys
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity

# --- CONFIGURATION ---
TARGET_TICKERS = [
    # Tech / Growth
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ADBE", "CRM", "AMD", "INTC", "IBM", "QCOM", "ORCL",
    # Consumer
    "WMT", "PG", "KO", "PEP", "COST", "MCD", "NKE", "SBUX", "HD", "LOW", "DIS", "TGT",
    # Financials
    "JPM", "V", "MA", "BRK-B", "BAC", "WFC", "GS", "MS", "AXP", "BLK", "C",
    # Healthcare
    "JNJ", "UNH", "LLY", "PFE", "ABBV", "MRK", "TMO", "DHR", "BMY", "CVS",
    # Industrial / Energy / Materials
    "XOM", "CVX", "GE", "CAT", "UNP", "UPS", "HON", "LMT", "RTX", "BA", "DE", "LIN",
    # DAX / Europe
    "SAP", "SIE.DE", "ALV.DE", "DTE.DE", "BMW.DE", "VOW3.DE", "AIR.DE"
]

def get_safe_val(df, key, col_idx=0, default=0):
    """Safely extract value from a DataFrame column."""
    try:
        if col_idx >= len(df.columns): return default
        val = df.iloc[:, col_idx].get(key, default)
        return float(val) if pd.notnull(val) else default
    except:
        return default

def calculate_cagr(end_val, start_val, years):
    """Calculate Compound Annual Growth Rate."""
    if start_val <= 0 or end_val <= 0 or years <= 0: return 0
    try:
        return ( (end_val / start_val) ** (1/years) - 1 ) * 100
    except:
        return 0

def analyze_stock(ticker):
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        if 'marketCap' not in info or info['marketCap'] == 0: return None

        # Fetch all statements
        inc = stock.financials
        bal = stock.balance_sheet
        cash = stock.cashflow
        
        if inc.empty or bal.empty: return None

        # --- 1. EXTRACT RAW DATA SERIES (Last 5 Years) ---
        years = min(5, len(inc.columns))
        history = {}
        
        # Helper to get full series
        def get_series(df, key):
            vals = []
            for i in range(years):
                vals.append(get_safe_val(df, key, i, 0))
            return vals[::-1] # Reverse to [Oldest -> Newest]

        rev_series = get_series(inc, 'Total Revenue')
        net_series = get_series(inc, 'Net Income')
        fcf_series = get_series(cash, 'Free Cash Flow')
        op_inc_series = get_series(inc, 'Operating Income')
        
        # --- 2. CALCULATE METRICS (TTM / Most Recent) ---
        # A. Profitability
        rev = get_safe_val(inc, 'Total Revenue')
        gross = get_safe_val(inc, 'Gross Profit')
        op_inc = get_safe_val(inc, 'Operating Income')
        net = get_safe_val(inc, 'Net Income')
        equity = get_safe_val(bal, 'Stockholders Equity')
        debt = get_safe_val(bal, 'Total Debt')
        assets = get_safe_val(bal, 'Total Assets')
        
        # B. Growth (CAGR 3Y or 5Y)
        rev_cagr = calculate_cagr(rev, rev_series[0], len(rev_series)-1) if len(rev_series)>1 else 0
        eps_cagr = 0 # Placeholder if EPS series extraction is complex, using Net Income as proxy
        net_cagr = calculate_cagr(net, net_series[0], len(net_series)-1) if len(net_series)>1 else 0
        
        # C. Financial Health
        interest = get_safe_val(inc, 'Interest Expense')
        curr_assets = get_safe_val(bal, 'Current Assets')
        curr_liab = get_safe_val(bal, 'Current Liabilities')
        
        # D. Efficiency
        
        # --- 3. COMPILE METRICS DICTIONARY ---
        # We store raw values here. Scoring happens later relative to Sector.
        m = {}
        
        # Profitability
        m['gross_margin'] = (gross / rev * 100) if rev else 0
        m['net_margin'] = (net / rev * 100) if rev else 0
        m['operating_margin'] = (op_inc / rev * 100) if rev else 0
        m['roe'] = (net / equity * 100) if equity > 0 else 0
        m['roic'] = (op_inc / (equity + debt) * 100) if (equity + debt) > 0 else 0
        
        # Growth
        m['revenue_cagr'] = rev_cagr
        m['net_income_cagr'] = net_cagr
        m['fcf_cagr'] = calculate_cagr(fcf_series[-1], fcf_series[0], len(fcf_series)-1) if len(fcf_series)>1 else 0
        
        # Health
        m['debt_to_equity'] = (debt / equity) if equity > 0 else 0
        m['current_ratio'] = (curr_assets / curr_liab) if curr_liab > 0 else 0
        m['interest_coverage'] = (op_inc / interest) if interest > 0 else 100 # Cap if no interest
        
        # Cash Flow
        fcf = get_safe_val(cash, 'Free Cash Flow')
        m['fcf_margin'] = (fcf / rev * 100) if rev else 0
        m['fcf_conversion'] = (fcf / net) if net > 0 else 0
        
        # Valuation
        m['pe_ratio'] = info.get('trailingPE', 0)
        m['ev_ebit'] = info.get('enterpriseToEbitda', 0) # Close proxy available in info
        m['p_fcf'] = (info.get('marketCap', 0) / fcf) if fcf > 0 else 0
        
        # Efficiency
        m['asset_turnover'] = (rev / assets) if assets > 0 else 0
        
        # Data Quality Check (Remove Infs/NaNs)
        for k, v in m.items():
            if not np.isfinite(v): m[k] = 0

        # Construct History Object for Charts (Clean Arrays)
        clean_hist = {}
        dates = [str(col)[:4] for col in inc.columns[:years][::-1]]
        
        clean_hist['gross_margin'] = [{"date": d, "value": v} for d, v in zip(dates, [(x/y)*100 for x, y in zip(get_series(inc,'Gross Profit'), rev_series) if y])]
        clean_hist['net_margin'] = [{"date": d, "value": v} for d, v in zip(dates, [(x/y)*100 for x, y in zip(net_series, rev_series) if y])]
        clean_hist['roe'] = [] # Simplified for brevity, can populate if needed

        return {
            "id": ticker,
            "name": info.get('shortName', ticker),
            "sector": info.get('sector', 'Unknown'),
            "industry": info.get('industry', 'Unknown'),
            "marketCap": info.get('marketCap', 0),
            "raw_metrics": m,
            "history": clean_hist
        }

    except Exception as e:
        # print(f"Error {ticker}: {e}")
        return None

def score_sector_relative(nodes):
    """
    Calculates percentiles for each metric WITHIN the node's sector.
    Returns nodes with a new 'scores' dictionary.
    """
    # Group by sector
    sectors = {}
    for n in nodes:
        sec = n['sector']
        if sec not in sectors: sectors[sec] = []
        sectors[sec].append(n)
        
    for sec, sector_nodes in sectors.items():
        if len(sector_nodes) < 3: 
            # Not enough data for relative scoring, fallback to global
            pass 
            
        # For each metric, calculate stats
        metric_keys = sector_nodes[0]['raw_metrics'].keys()
        
        for key in metric_keys:
            # Extract values
            values = [node['raw_metrics'][key] for node in sector_nodes]
            
            # Special handling for inverse metrics (Lower is better)
            inverse = key in ['debt_to_equity', 'pe_ratio', 'ev_ebit', 'p_fcf']
            
            # Rank (Percentile)
            # method='min' handles ties
            ranks = pd.Series(values).rank(pct=True, ascending=not inverse)
            
            # Assign back to nodes
            for i, node in enumerate(sector_nodes):
                if 'sector_scores' not in node: node['sector_scores'] = {}
                # Score 0-100
                node['sector_scores'][key] = round(ranks.iloc[i] * 100)
                
    # Calculate Composite Score (Weighted Average)
    for n in nodes:
        if 'sector_scores' in n:
            s = n['sector_scores']
            # Simple weighting: Profitability & Growth matter most
            composite = (
                s.get('roic', 50) * 1.5 + 
                s.get('roe', 50) * 1.0 +
                s.get('revenue_cagr', 50) * 1.0 +
                s.get('fcf_margin', 50) * 1.0 +
                s.get('debt_to_equity', 50) * 0.8
            ) / 5.3
            n['buffettScore'] = int(min(composite, 100))
        else:
            n['buffettScore'] = 50 # Default middle
            n['sector_scores'] = {k: 50 for k in n['raw_metrics']} # Default neutral

    return nodes

def build_fundamental_links(nodes):
    """
    Creates edges based on Cosine Similarity of their SECTOR RELATIVE scores.
    This links companies that are fundamentally similar (e.g. both High Growth/Low Debt).
    """
    if not nodes: return []
    
    # Feature vector: Use the normalized scores [0-100]
    features = []
    for n in nodes:
        # Create a vector of key metrics
        vec = [
            n['sector_scores'].get('gross_margin', 50),
            n['sector_scores'].get('roe', 50),
            n['sector_scores'].get('debt_to_equity', 50),
            n['sector_scores'].get('revenue_cagr', 50),
            n['sector_scores'].get('fcf_margin', 50)
        ]
        features.append(vec)
    
    # Normalize features for Cosine Sim
    features = np.array(features)
    sim_matrix = cosine_similarity(features)
    
    links = []
    # Create links
    for i in range(len(nodes)):
        # Top 3 most similar nodes
        # argsort gives indices of sorted array. [-4:-1] gives top 3 excluding self
        similar_indices = sim_matrix[i].argsort()[-4:-1]
        
        for idx in similar_indices:
            sim = sim_matrix[i][idx]
            if sim > 0.85: # Threshold
                links.append({
                    "source": nodes[i]['id'],
                    "target": nodes[idx]['id'],
                    "value": round(float(sim), 2)
                })
    return links

def sanitize_data(obj):
    if isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj): return None
        return obj
    elif isinstance(obj, dict):
        return {k: sanitize_data(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_data(v) for v in obj]
    return obj

def main():
    print("="*60 + "\nBUFFETT SCANNER v4.0 (Sector Relative)\n" + "="*60)
    
    nodes = []
    for i, ticker in enumerate(TARGET_TICKERS):
        print(f"[{i+1}/{len(TARGET_TICKERS)}] {ticker}...", end=" ")
        sys.stdout.flush()
        data = analyze_stock(ticker)
        if data:
            nodes.append(data)
            print("✅")
        else:
            print("❌")
        if i % 10 == 0: time.sleep(0.5)

    if not nodes: sys.exit(1)

    # 1. Score relative to sector
    print("\nCalculating Sector-Relative Scores...")
    nodes = score_sector_relative(nodes)

    # 2. Build Fundamental Network
    print("Building Fundamental Network...")
    links = build_fundamental_links(nodes)
    print(f"Generated {len(links)} links.")

    # 3. Output
    output = {
        "nodes": nodes,
        "links": links,
        "metadata": {"generated_at": datetime.now().isoformat()}
    }
    
    final_output = sanitize_data(output)
    
    os.makedirs("data", exist_ok=True)
    with open("data/graph_data.json", "w") as f:
        json.dump(final_output, f, indent=2)
    print("\n✅ Data saved successfully.")

if __name__ == "__main__":
    main()
