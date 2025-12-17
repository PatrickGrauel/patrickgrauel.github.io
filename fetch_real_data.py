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
from sklearn.cluster import KMeans

# --- CONFIGURATION ---
TARGET_TICKERS = [
    # Tech / Growth
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ADBE", "CRM", "AMD", "INTC", "IBM", "QCOM", "ORCL",
    # Consumer
    "WMT", "PG", "KO", "PEP", "COST", "MCD", "NKE", "SBUX", "HD", "LOW", "DIS", "TGT", "LVMUY",
    # Financials
    "JPM", "V", "MA", "BRK-B", "BAC", "WFC", "GS", "MS", "AXP", "BLK", "C",
    # Healthcare
    "JNJ", "UNH", "LLY", "PFE", "ABBV", "MRK", "TMO", "DHR", "BMY", "CVS", "ISRG",
    # Industrial / Energy / Materials
    "XOM", "CVX", "GE", "CAT", "UNP", "UPS", "HON", "LMT", "RTX", "BA", "DE", "LIN", "RIO",
    # DAX / Europe
    "SAP", "SIE.DE", "ALV.DE", "DTE.DE", "BMW.DE", "VOW3.DE", "AIR.DE", "MC.PA"
]

def get_safe_val(df, key, col_idx=0, default=0):
    try:
        if col_idx >= len(df.columns): return default
        val = df.iloc[:, col_idx].get(key, default)
        return float(val) if pd.notnull(val) else default
    except:
        return default

def calculate_cagr(end, start, years):
    if start <= 0 or end <= 0 or years <= 0: return 0
    try: return ((end / start) ** (1/years) - 1) * 100
    except: return 0

def calculate_intrinsic_value(fcf, growth_rate, shares, cash, debt):
    """
    Simplified 2-Stage DCF Model.
    Stage 1: 5 Years of Growth (capped at 15%)
    Stage 2: Terminal Value (3% perpetual growth, 10% discount)
    """
    if fcf <= 0 or shares <= 0: return 0
    
    growth = min(growth_rate / 100, 0.15) # Conservative cap
    discount_rate = 0.09 # 9% WACC assumption
    terminal_growth = 0.03
    
    # Stage 1: Next 5 years
    future_cash_flows = []
    current_fcf = fcf
    for _ in range(5):
        current_fcf *= (1 + growth)
        future_cash_flows.append(current_fcf)
    
    # Stage 2: Terminal Value
    terminal_val = future_cash_flows[-1] * (1 + terminal_growth) / (discount_rate - terminal_growth)
    
    # Discount to Present
    dcf_value = 0
    for i, cf in enumerate(future_cash_flows):
        dcf_value += cf / ((1 + discount_rate) ** (i + 1))
    
    dcf_value += terminal_val / ((1 + discount_rate) ** 5)
    
    # Equity Value
    equity_value = dcf_value + cash - debt
    fair_value_per_share = equity_value / shares
    
    return max(0, fair_value_per_share)

def analyze_stock(ticker):
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        if 'marketCap' not in info or info['marketCap'] == 0: return None
        
        inc = stock.financials
        bal = stock.balance_sheet
        cash = stock.cashflow
        
        if inc.empty or bal.empty: return None

        # 1. EXTRACT SERIES (5 Years)
        years = min(5, len(inc.columns))
        def get_series(df, key):
            return [get_safe_val(df, key, i, 0) for i in range(years)][::-1]

        rev_series = get_series(inc, 'Total Revenue')
        net_series = get_series(inc, 'Net Income')
        fcf_series = get_series(cash, 'Free Cash Flow')
        
        # 2. METRICS
        rev = get_safe_val(inc, 'Total Revenue')
        net = get_safe_val(inc, 'Net Income')
        fcf = get_safe_val(cash, 'Free Cash Flow')
        op_cash = get_safe_val(cash, 'Operating Cash Flow')
        
        equity = get_safe_val(bal, 'Stockholders Equity')
        debt = get_safe_val(bal, 'Total Debt')
        assets = get_safe_val(bal, 'Total Assets')
        cash_on_hand = get_safe_val(bal, 'Cash And Cash Equivalents')
        
        # Growth Rates
        rev_cagr = calculate_cagr(rev, rev_series[0], len(rev_series)-1) if len(rev_series)>1 else 0
        
        # --- ANALYST UPGRADES ---
        
        # A. DuPont Analysis
        asset_turnover = (rev / assets) if assets > 0 else 0
        financial_leverage = (assets / equity) if equity > 0 else 1
        net_margin = (net / rev) if rev > 0 else 0
        roe = net_margin * asset_turnover * financial_leverage * 100
        
        # B. Earnings Quality (Accruals)
        # Ratio > 1.0 means Cash Flow > Net Income (Good quality)
        # Ratio < 0.8 is a warning sign (Aggressive accounting)
        earnings_quality = (op_cash / net) if net > 0 else 0
        
        # C. Intrinsic Value (DCF)
        shares = info.get('sharesOutstanding', 0)
        current_price = info.get('currentPrice', 0)
        fair_value = 0
        margin_of_safety = 0
        
        if shares > 0 and current_price > 0:
            fair_value = calculate_intrinsic_value(fcf, rev_cagr, shares, cash_on_hand, debt)
            if fair_value > 0:
                margin_of_safety = ((fair_value - current_price) / fair_value) * 100

        # Construct Metrics
        m = {
            # Profitability
            'gross_margin': (get_safe_val(inc, 'Gross Profit') / rev * 100) if rev else 0,
            'net_margin': net_margin * 100,
            'roe': roe,
            'roic': (get_safe_val(inc, 'Operating Income') / (equity + debt) * 100) if (equity+debt) else 0,
            
            # Growth
            'revenue_cagr': rev_cagr,
            'net_income_cagr': calculate_cagr(net, net_series[0], len(net_series)-1) if len(net_series)>1 else 0,
            
            # Health
            'debt_to_equity': (debt / equity) if equity > 0 else 0,
            'interest_coverage': (get_safe_val(inc, 'Operating Income') / get_safe_val(inc, 'Interest Expense')) if get_safe_val(inc, 'Interest Expense') > 0 else 100,
            
            # Valuation & Analyst Extras
            'pe_ratio': info.get('trailingPE', 0),
            'fcf_yield': (fcf / info['marketCap'] * 100) if info['marketCap'] else 0,
            'dupont_turnover': asset_turnover,
            'dupont_leverage': financial_leverage,
            'earnings_quality': earnings_quality,
            'fair_value': round(fair_value, 2),
            'margin_of_safety': round(margin_of_safety, 1),
            'current_price': current_price
        }
        
        # Cleanup
        for k, v in m.items():
            if not np.isfinite(v): m[k] = 0

        # History for Sparklines
        dates = [str(col)[:4] for col in inc.columns[:years][::-1]]
        clean_hist = {
            'revenue': [{"date": d, "value": v} for d, v in zip(dates, rev_series)],
            'net_income': [{"date": d, "value": v} for d, v in zip(dates, net_series)],
            'fcf': [{"date": d, "value": v} for d, v in zip(dates, fcf_series)]
        }

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
        return None

def apply_clustering(nodes):
    """
    Applies K-Means clustering to identify 'Quality Clusters' regardless of sector.
    Features: Growth, Margins, Debt, ROIC.
    """
    if len(nodes) < 5: return nodes
    
    features = []
    for n in nodes:
        m = n['raw_metrics']
        # Vector: [Growth, Profitability, Safety, Efficiency]
        vec = [m['revenue_cagr'], m['roe'], -m['debt_to_equity'], m['roic']]
        features.append(vec)
        
    # K-Means with 4 clusters
    # 0: "Compounders" (High Growth, High ROIC)
    # 1: "Cash Cows" (Low Growth, High Margin)
    # 2: "Turnarounds" (Low Margin, High Debt)
    # 3: "Speculative" (High Growth, Negative Profit)
    kmeans = KMeans(n_clusters=min(4, len(nodes)), random_state=42, n_init=10)
    clusters = kmeans.fit_predict(features)
    
    labels = ["Cluster A", "Cluster B", "Cluster C", "Cluster D"]
    
    for i, node in enumerate(nodes):
        node['cluster_id'] = int(clusters[i])
        node['cluster_label'] = labels[clusters[i]]
        
    return nodes

def score_and_link(nodes):
    # 1. Scoring (Same as before but normalized)
    for n in nodes:
        m = n['raw_metrics']
        # Simple Composite Score (0-100)
        score = 0
        score += min(m['gross_margin'], 60) * 0.5
        score += min(m['roe'], 40) * 0.8
        score += min(m['roic'], 30) * 1.0
        score += min(m['revenue_cagr'], 30) * 1.0
        if m['debt_to_equity'] < 1: score += 15
        if m['earnings_quality'] > 0.8: score += 10
        if m['margin_of_safety'] > 0: score += 10
        
        n['buffettScore'] = int(min(score, 100))
        n['sector_scores'] = {k: 50 for k in m} # Placeholder for simplicity in this step

    # 2. Links (Fundamental Similarity)
    features = []
    for n in nodes:
        m = n['raw_metrics']
        features.append([m['gross_margin'], m['roe'], m['debt_to_equity'], m['revenue_cagr']])
    
    scaler = MinMaxScaler()
    norm_features = scaler.fit_transform(features)
    sim_matrix = cosine_similarity(norm_features)
    
    links = []
    for i in range(len(nodes)):
        indices = sim_matrix[i].argsort()[-4:-1]
        for idx in indices:
            if sim_matrix[i][idx] > 0.85:
                links.append({"source": nodes[i]['id'], "target": nodes[idx]['id'], "value": float(sim_matrix[i][idx])})
                
    return nodes, links

def sanitize(obj):
    if isinstance(obj, float): return None if (np.isnan(obj) or np.isinf(obj)) else obj
    if isinstance(obj, dict): return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list): return [sanitize(v) for v in obj]
    return obj

def main():
    print("="*60 + "\nBUFFETT ANALYTICAL ENGINE v5.0\n" + "="*60)
    nodes = []
    for i, t in enumerate(TARGET_TICKERS):
        print(f"[{i+1}/{len(TARGET_TICKERS)}] {t}...", end=" ")
        sys.stdout.flush()
        data = analyze_stock(t)
        if data:
            nodes.append(data)
            print("✅")
        else:
            print("❌")
        if i % 10 == 0: time.sleep(0.5)

    if not nodes: sys.exit(1)

    print("\nApplying AI Clustering...")
    nodes = apply_clustering(nodes)
    
    print("Calculating Scores & Links...")
    nodes, links = score_and_link(nodes)
    
    # Calculate Averages for Sidebar Comparison
    avgs = {}
    for n in nodes:
        ind = n['industry']
        if ind not in avgs: avgs[ind] = {'pe_ratio': [], 'roe': []}
        avgs[ind]['pe_ratio'].append(n['raw_metrics']['pe_ratio'])
        avgs[ind]['roe'].append(n['raw_metrics']['roe'])
    
    final_avgs = {k: {m: np.mean(v) for m,v in val.items() if v} for k,val in avgs.items()}

    output = {
        "nodes": nodes,
        "links": links,
        "industry_averages": final_avgs,
        "metadata": {"generated_at": datetime.now().isoformat()}
    }
    
    os.makedirs("data", exist_ok=True)
    with open("data/graph_data.json", "w") as f:
        json.dump(sanitize(output), f, indent=2)
    print("\n✅ Analysis Complete. Data Saved.")

if __name__ == "__main__":
    main()
